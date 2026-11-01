// Caden's brain. One endpoint, four actions, keyed by a hash of the home code (turns also get live weather and web search):
//   sync    → { turns, memories }            recent history for a device that just joined
//   turn    → SSE stream (Cloak's format)    saves the turn, builds the prompt from the
//                                            home's history + memories, streams the reply
//                                            from Cloak's `kairos` tier (NVIDIA Nemotron first)
//   forget  → { ok }                         drop one memory
//   clear   → { ok }                         drop the home's turns
// Tables are service-role only (RLS on, no policies).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CLOAK = "https://api.usecloak.org/v1/chat";
const SEARCH = "https://api.usecloak.org/v1/search";
const SEARCH_ROUNDS = 2;
const HISTORY = 24;
const MAX_MEMORIES = 60;
const TURNS_PER_MINUTE = 20;

// Caden runs on Cloak's existing `kairos` tier (NVIDIA Nemotron first) with
// this playbook added to the system prompt. Nothing Caden-specific lives in
// the Cloak repo. Keep in sync with HOME_NOTE in js/config.js.
const MODEL = "kairos";
const HOME_NOTE = "## HOME MODE: YOU ARE SPOKEN OUT LOUD\nThis conversation is Cloak running as Caden, the voice agent that lives on the screens and phones around a home. Every word you write is read aloud by text-to-speech, then shown as a caption.\n- Talk like a calm, capable person in the room. Short: one to three sentences unless the person asks for more detail, a list, or a story. Lead with the answer.\n- Plain spoken text only. No markdown, no bullets, no headings, no emoji, no code blocks, no URLs, no tables. Write numbers, times and units the way you would say them.\n- Lines in the conversation start with the speaker's name in brackets, like [Maya]. That is who is talking right now, recognized by face or voice; [Someone] means nobody was recognized. Use names naturally, not every turn. Never repeat the bracket tag in your reply.\n- Several people share this home and take turns. Keep track of who asked what; answer the current speaker.\n- The HOME CONTEXT note says which room and device you are on, the local time, where the home is, and which screens are on. Use the location for anything local without asking where they are. When a WEATHER note is present it is live: use it for weather, what to wear, rain, and plans.\n- WEB SEARCH: your own knowledge stops well before today's date (in HOME CONTEXT). Anything that could have changed since then you must look up: news, sports results and winners, scores, schedules, prices, releases, who currently holds a role, opening hours, businesses and events nearby. To look something up, your whole reply is one line: <search q=\"your search terms\"/> and nothing else. You'll get SEARCH RESULTS back; answer from them in a sentence or two. Don't search for timeless facts, math, the weather (you have it), or small talk.\n- ACTIONS: you can act on the home's screens. Put each action on its own final line, after what you say; these lines are never spoken. Always say a few words first about what you're doing. Every action you mention needs its own DO line in that same reply, one line per action; saying you did something without its line does nothing. Only do what someone asked for.\n  DO: go <room>   (move yourself to that screen)\n  DO: tell <room> | <message>   (go to that room and say the message to whoever is there, like \"go tell the kitchen dinner's ready\")\n  DO: announce <where> | <message>   (a chime, then the message on those screens at once; <where> is everywhere, or room names separated by commas)\n  DO: timer <duration like 10m, 1h30m, 45s> | <short label> | <where>\n  DO: alarm <time like 07:30, 6:15 pm, tomorrow 06:45> | <short label> | <where>\n  DO: cancel <label, or timer, alarm, all>\n  DO: dim <0 to 90>   (darken this screen by that percent; 0 is full brightness)\n  DO: volume <0 to 100>   (your speaking volume)\n  DO: clock   (rest and show the big clock)\n  DO: continue   (you aren't done: you'll get a [System] turn with what your actions did, then take your next step)\n- Timers and alarms ring on the screens you set them for. If more than one screen is on and the person didn't say where (here, everywhere, or which rooms), ask which screen or screens before setting it, then set it on your next turn. The current list is in HOME CONTEXT; use it to answer how long is left, and to cancel.\n- [System] lines are not a person: they tell you what your last actions did. If something failed, say so briefly or fix it. If everything worked and nothing is left to do, a short confirmation or nothing at all is fine.\n- You can't control lights, locks or other smart-home hardware yet. Say so plainly if asked, and offer what you can do.\n- If you didn't catch something, ask them to say it again in a few words.\n- Caden's brain keeps the home's memories; they appear under THINGS YOU REMEMBER ABOUT THIS HOME. When someone tells you a lasting fact worth keeping (a name, a preference, a birthday, a routine, a plan), add one final line on its own: REMEMBER: <the fact, saying who it is about>. That line is saved, never spoken. Use it rarely, only for durable facts.";

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
const isHidden = (l: string) => /^\s*(REMEMBER:|DO:|<search\b)/i.test(l);
const strip = (s: string) => s.split("\n").filter((l) => !isHidden(l)).join("\n").trim().replace(/^\[[^\]\n]{1,40}\]\s*/, "");

// ── live weather: Open-Meteo (free, no key), cached per ~1 km cell for 10 min ──
const WMO: Record<number, string> = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "light showers", 81: "showers", 82: "heavy showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail" };
const wxCache = new Map<string, { at: number; text: string }>();
async function weather(w: { lat?: number; lon?: number; place?: string; units?: string } | null): Promise<string> {
  const lat = Number(w?.lat), lon = Number(w?.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  const imp = w?.units === "imperial";
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${imp}`;
  const hit = wxCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.text;
  const q = new URLSearchParams({
    latitude: lat.toFixed(2), longitude: lon.toFixed(2), timezone: "auto", forecast_days: "3",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    hourly: "precipitation_probability", forecast_hours: "12",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
    temperature_unit: imp ? "fahrenheit" : "celsius", wind_speed_unit: imp ? "mph" : "kmh",
  });
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return "";
    const j = await r.json();
    const c = j.current, d = j.daily, deg = imp ? "°F" : "°C", sp = imp ? "mph" : "km/h";
    const t = (n: number) => `${Math.round(n)}${deg}`;
    const hm = (iso: string) => String(iso || "").slice(11, 16);
    const rain = Math.max(0, ...((j.hourly?.precipitation_probability || []) as number[]));
    const days = ["Today", "Tomorrow", "The day after"].map((name, i) =>
      `${name}: ${WMO[d.weather_code[i]] || "mixed"}, high ${t(d.temperature_2m_max[i])}, low ${t(d.temperature_2m_min[i])}, ${d.precipitation_probability_max[i] ?? 0}% chance of rain${i === 0 ? `, UV ${Math.round(d.uv_index_max[0] ?? 0)}, sunrise ${hm(d.sunrise[0])}, sunset ${hm(d.sunset[0])}` : ""}.`);
    const text = [
      `## WEATHER (live${w?.place ? `, ${clip(w.place, 80)}` : ""})`,
      `Now: ${WMO[c.weather_code] || "mixed"}, ${t(c.temperature_2m)} (feels like ${t(c.apparent_temperature)}), humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} ${sp}. Rain chance in the next 12 hours: up to ${rain}%.`,
      ...days,
    ].join("\n");
    wxCache.set(key, { at: Date.now(), text });
    return text;
  } catch { return ""; }
}

// ── web search: Cloak's general /v1/search (Tavily, Google, DuckDuckGo) ──────
async function search(q: string): Promise<string> {
  try {
    const r = await fetch(SEARCH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: clip(q, 300) }), signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const items = ((j.items || []) as { title?: string; link?: string; snippet?: string; content?: string }[]).slice(0, 5);
    if (!items.length) return "No results.";
    return items.map((it, i) => {
      let host = ""; try { host = new URL(String(it.link)).hostname.replace(/^www\./, ""); } catch { /* */ }
      return `${i + 1}. ${clip(it.title, 120)} (${host})\n${clip(String(it.content || it.snippet || "").replace(/\s+/g, " "), 700)}`;
    }).join("\n\n");
  } catch { return "Search failed."; }
}
// Questions that are about the present get searched up front, before the model
// answers (the model can still ask for more with <search q="..."/>).
const NEEDS_WEB = /\b(who (won|is winning|leads?)|won the|winner|score|scores|standings|playoffs?|world series|super bowl|finals?|election|results?|news|headlines?|latest|newest|recent(ly)?|current(ly)?|right now|today'?s|tonight|this (week|weekend|month|year)|yesterday|last (night|week)|release date|come out|coming out|price of|how much (is|does|are)|stock|bitcoin|open (now|today|until)|hours|near (me|here|us)|nearby|around here|closest|best .* in|restaurants?|events?|concerts?|showtimes?|traffic|is .* (dead|alive|still)|ceo of|president of|prime minister)\b/i;
// Search engines want keywords, not questions ("who won" reads as the Korean
// currency). Drop filler words, say "winner" / "price" plainly, and pin "the
// latest" anything to the current year.
const STOP = new Set("a an the of to in on at for and or is are was were be been did do does who what when where which how why tell me us can could would will you please hey caden cloak most recent latest newest current currently right now just about any some there my i we our it that this much".split(" "));
function webQuery(text: string, context: string) {
  const q = text.replace(/^(hey )?(caden|cloak)[,.!]?\s*/i, "").replace(/[?!.,]+/g, " ").toLowerCase();
  if (/\b(news|headlines)\b/.test(q) && q.split(/\s+/).length < 6) return "top news today";
  const fresh = /\b(most recent|latest|newest|who won|winner|current(ly)?|this year|recent|won)\b/.test(q);
  const words = q.split(/\s+/).filter((w) => w && !STOP.has(w) && w !== "won");
  if (/\bwho won|won the\b/.test(q)) words.push("winner");
  if (/\bhow much\b/.test(q)) words.push("price");
  const year = context.match(/\b(20\d\d)\b/)?.[1] || String(new Date().getFullYear());
  if (fresh && !words.includes(year)) words.push(year);
  return words.join(" ") || text;
}
const SEARCH_TAG = /^\s*<search\s+q\s*=\s*["\u201c]([^"\u201d]{1,300})["\u201d]\s*\/?>/i;

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
  if ((count || 0) >= TURNS_PER_MINUTE) return json({ error: "Slow down a little, too many turns this minute." }, 429);

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
  const where = body.where as { lat?: number; lon?: number; place?: string; units?: string } | null;
  const local = /\b(near|nearby|around here|closest|in town|local)\b/i.test(text) && where?.place ? ` near ${clip(where.place, 80)}` : "";
  const [wx, web] = await Promise.all([
    weather(where),
    NEEDS_WEB.test(text) ? search(webQuery(text, String(body.context || "")) + local) : Promise.resolve(""),
  ]);
  const system = [
    HOME_NOTE,
    clip(body.context, 1500),
    wx,
    web ? `## WEB RESULTS (searched just now for this question; trust these over what you remember)\n${web}` : "",
    facts.length ? `## THINGS YOU REMEMBER ABOUT THIS HOME\n${facts.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const ask = (msgs: typeof messages) => fetch(CLOAK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: true, messages: msgs, system, max_tokens: 400, effort: "low" }),
  });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  // Pull text deltas out of Cloak's SSE.
  const deltas = (chunk: string, st: { buf: string; text: string }) => {
    st.buf += chunk;
    let i;
    while ((i = st.buf.indexOf("\n\n")) >= 0) {
      const block = st.buf.slice(0, i);
      st.buf = st.buf.slice(i + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          if (ev.delta) st.text += ev.delta;
          else if (ev.done && typeof ev.response === "string" && ev.response.length > st.text.length) st.text = ev.response;
        } catch { /* keep-alive or partial */ }
      }
    }
  };

  let full = "";
  const stream = new ReadableStream({
    async start(ctrl) {
      const say = (delta: string) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
      let msgs = messages;
      try {
        for (let round = 0; ; round++) {
          const up = await ask(msgs);
          if (!up.ok || !up.body) {
            const err = await up.text().catch(() => "");
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: `Cloak ${up.status} ${err.slice(0, 160)}` })}\n\n`));
            break;
          }
          // Hold the first few characters: a reply that opens with <search ...>
          // is a tool call, not words. Anything else streams straight through.
          const reader = up.body.getReader();
          const st = { buf: "", text: "" };
          let passing = false, sent = 0, tool: string | null = null;
          for (;;) {
            const { value, done } = await reader.read();
            if (value) deltas(dec.decode(value, { stream: true }), st);
            if (!passing && !tool) {
              const head = st.text.trimStart();
              const m = head.match(SEARCH_TAG);
              if (m && round < SEARCH_ROUNDS) { tool = m[1]; reader.cancel().catch(() => {}); break; }
              if (head.length >= 8 && !/^<s(e(a(r(c(h)?)?)?)?)?/i.test(head.slice(0, 7))) passing = true;
              else if (head.length >= 60) passing = true;
            }
            if (passing && st.text.length > sent) { say(st.text.slice(sent)); sent = st.text.length; }
            if (done) {
              if (!tool) {
                const m = st.text.trimStart().match(SEARCH_TAG);
                if (m && round < SEARCH_ROUNDS) tool = m[1];
                else if (st.text.length > sent) { say(st.text.slice(sent)); sent = st.text.length; }
              }
              break;
            }
          }
          if (tool) {
            const results = await search(tool);
            msgs = [...msgs, { role: "assistant", content: `<search q="${tool}"/>` }, { role: "user", content: `SEARCH RESULTS for "${tool}":\n${results}\n\nNow answer the question out loud, briefly. Plain spoken text, no URLs. Search again only if these don't answer it.` }];
            continue;
          }
          full = st.text;
          break;
        }
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, response: full })}\n\n`));
      } catch (e) {
        console.error("[brain] stream", e);
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: "brain error" })}\n\n`));
      }
      await finish(home, id, row.who, full).catch((e) => console.error("[brain] save", e));
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

async function finish(home: string, id: string, who: string, full: string) {
  await db.from("home_turns").update({ reply: strip(full) || (full.trim() ? "Done." : "") }).eq("id", id).eq("home", home);
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
