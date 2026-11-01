// Caden's brain. One endpoint, four actions, keyed by a hash of the home code:
//   sync    → { turns, memories }            recent history for a device that just joined
//   turn    → SSE stream (Cloak's format)    saves the turn, builds the prompt from the
//                                            home's history + memories, streams the reply
//                                            from Cloak's `home` tier (NVIDIA key pool)
//   forget  → { ok }                         drop one memory
//   clear   → { ok }                         drop the home's turns
// Tables are service-role only (RLS on, no policies).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLOAK = "https://api.usecloak.org/v1/chat";
const HISTORY = 24;
const MAX_MEMORIES = 60;
const TURNS_PER_MINUTE = 20;

// Until the Cloak worker with the `home` tier is deployed, ride Kairos (NVIDIA
// Nemotron first) with a short spoken-style note. Checked once per isolate.
const SPOKEN_NOTE = "## HOME MODE\nYou are Cloak running as Caden, a voice agent on the screens around a home. Replies are read aloud: one to three short sentences, plain spoken text, no markdown, lists, emoji or URLs. Lines start with the speaker's name in brackets like [Maya]; never repeat the tag. To save a lasting fact someone tells you, add a final line `REMEMBER: <fact, naming the person it is about>`; it is never spoken.";
let tier: Promise<string> | null = null;
const homeTier = () => tier ??= fetch("https://api.usecloak.org/")
  .then((r) => r.json()).then((j) => (j.models || []).includes("home") ? "home" : "kairos")
  .catch(() => "kairos");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
type Row = { id: string; who: string; who_id: string | null; device: string | null; room: string | null; text: string; reply: string; at: string };
const toTurn = (r: Row) => ({ id: r.id, who: r.who, whoId: r.who_id, device: r.device, room: r.room, text: r.text, reply: r.reply, at: Date.parse(r.at) });
const isRemember = (l: string) => /^\s*REMEMBER:/i.test(l);
const strip = (s: string) => s.split("\n").filter((l) => !isRemember(l)).join("\n").trim().replace(/^\[[^\]\n]{1,40}\]\s*/, "");

async function sync(home: string) {
  const [t, m] = await Promise.all([
    db.from("home_turns").select("*").eq("home", home).order("at", { ascending: false }).limit(50),
    db.from("home_memories").select("id, fact, who, created_at").eq("home", home).order("created_at", { ascending: false }).limit(MAX_MEMORIES),
  ]);
  return json({ turns: (t.data || []).reverse().map(toTurn), memories: m.data || [] });
}

async function turn(home: string, body: Record<string, unknown>) {
  const t = (body.turn || {}) as Record<string, unknown>;
  const text = clip(t.text, 2000).trim();
  const id = clip(t.id, 40);
  if (!text || !/^[\w-]{4,40}$/.test(id)) return json({ error: "turn.id and turn.text required" }, 400);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("home_turns").select("id", { count: "exact", head: true }).eq("home", home).gte("at", since);
  if ((count || 0) >= TURNS_PER_MINUTE) return json({ error: "Slow down a little — too many turns this minute." }, 429);

  const row = {
    id, home, text,
    who: clip(t.who, 40) || "Someone",
    who_id: t.whoId ? clip(t.whoId, 40) : null,
    device: clip(t.device, 40) || null,
    room: clip(t.room, 40) || null,
  };
  const [hist, mems] = await Promise.all([
    db.from("home_turns").select("*").eq("home", home).neq("id", id).order("at", { ascending: false }).limit(HISTORY),
    db.from("home_memories").select("fact, who").eq("home", home).order("created_at", { ascending: false }).limit(MAX_MEMORIES),
    db.from("home_turns").upsert(row),
  ]);

  const messages: { role: string; content: string }[] = [];
  for (const r of ((hist.data || []) as Row[]).reverse()) {
    messages.push({ role: "user", content: `[${r.who}] ${r.text}` });
    if (r.reply) messages.push({ role: "assistant", content: r.reply });
  }
  messages.push({ role: "user", content: `[${row.who}] ${text}` });

  const facts = (mems.data || []).map((m) => `- ${m.fact}${m.who ? ` (from ${m.who})` : ""}`);
  const model = await homeTier();
  const system = [
    model === "home" ? "" : SPOKEN_NOTE,
    clip(body.context, 1500),
    facts.length ? `## THINGS YOU REMEMBER ABOUT THIS HOME\n${facts.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const up = await fetch(CLOAK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true, messages, system, max_tokens: 400, effort: "low" }),
  });
  if (!up.ok || !up.body) {
    const err = await up.text().catch(() => "");
    return json({ error: `Cloak ${up.status} ${err.slice(0, 200)}` }, 502);
  }

  // Pass the SSE through untouched; keep a copy of the text to save at the end.
  let full = "";
  let buf = "";
  const dec = new TextDecoder();
  const reader = up.body.getReader();
  const stream = new ReadableStream({
    async pull(ctrl) {
      const { value, done } = await reader.read();
      if (done) {
        await finish(home, id, row.who, full).catch((e) => console.error("[brain] save", e));
        ctrl.close();
        return;
      }
      ctrl.enqueue(value);
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.delta) full += ev.delta;
            else if (ev.done && typeof ev.response === "string" && ev.response.length > full.length) full = ev.response;
          } catch { /* keep-alive or partial */ }
        }
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

async function finish(home: string, id: string, who: string, full: string) {
  await db.from("home_turns").update({ reply: strip(full) }).eq("id", id).eq("home", home);
  const facts = full.split("\n").filter(isRemember).map((l) => l.replace(/^\s*REMEMBER:\s*/i, "").trim()).filter((f) => f.length > 2).slice(0, 3);
  if (!facts.length) return;
  const { data: have } = await db.from("home_memories").select("fact").eq("home", home);
  const known = new Set((have || []).map((m) => m.fact.toLowerCase()));
  const fresh = facts.filter((f) => !known.has(f.toLowerCase())).map((fact) => ({ home, fact: clip(fact.replace(/^(the )?user('s)?\b/i, (m) => (/s$/i.test(m) ? `${who}'s` : who)), 300), who }));
  if (fresh.length) await db.from("home_memories").insert(fresh);
  // Keep the newest MAX_MEMORIES.
  const { data: old } = await db.from("home_memories").select("id").eq("home", home).order("created_at", { ascending: false }).range(MAX_MEMORIES, MAX_MEMORIES + 50);
  if (old?.length) await db.from("home_memories").delete().in("id", old.map((o) => o.id));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const home = String(body.home || "");
  if (!/^[0-9a-f]{64}$/.test(home)) return json({ error: "home required" }, 400);
  try {
    switch (body.action) {
      case "sync": return await sync(home);
      case "turn": return await turn(home, body);
      case "forget":
        await db.from("home_memories").delete().eq("home", home).eq("id", Number(body.id));
        return json({ ok: true });
      case "clear":
        await db.from("home_turns").delete().eq("home", home);
        return json({ ok: true });
      default: return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error("[brain]", e);
    return json({ error: "brain error" }, 500);
  }
});
