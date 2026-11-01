// Caden's voice: NVIDIA Magpie TTS Multilingual (Riva TTS on NVIDIA's hosted
// API, free trial key). Riva speaks gRPC only, which browsers can't, so this
// function is a tiny gRPC client: protobuf encoded by hand, gRPC framing over
// fetch (HTTP/2). Returns a WAV the browser can play as-is.
//
//   POST {action:"say", home, text, voice?, lang?} → audio/wav (16-bit mono)
//   POST {action:"voices"}                         → {voices:[{name, lang}]}
// The NVIDIA key is ours, so calls need a home id and are rate limited per IP
// and per home (in memory, per isolate: a speed bump, not a vault).
//
// Secret: NVIDIA_API_KEY (an nvapi- key from build.nvidia.com).
const HOST = "https://grpc.nvcf.nvidia.com";
const MAGPIE = "877104f7-e885-42b9-8de8-f6e4c6303969"; // Magpie TTS Multilingual
const SERVICE = "/nvidia.riva.tts.RivaSpeechSynthesis";
const RATE = 22050;
const LINEAR_PCM = 1;
export const DEFAULT_VOICE = "Magpie-Multilingual.EN-US.Aria";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ── protobuf (just what Riva TTS needs) ─────────────────────────────────────
const te = new TextEncoder(), td = new TextDecoder();
function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); }
  out.push(n);
  return out;
}
const tag = (field: number, wire: number) => varint(field * 8 + wire);
const pbBytes = (field: number, b: Uint8Array) => [...tag(field, 2), ...varint(b.length), ...b];
const pbString = (field: number, s: string) => (s ? pbBytes(field, te.encode(s)) : []);
const pbInt = (field: number, n: number) => (n ? [...tag(field, 0), ...varint(n)] : []);

export function synthesizeRequest(text: string, voice: string, lang: string): Uint8Array {
  return new Uint8Array([
    ...pbString(1, text), ...pbString(2, lang), ...pbInt(3, LINEAR_PCM), ...pbInt(4, RATE), ...pbString(5, voice),
  ]);
}

// Decode a message into {field: [values]} (bytes for wire 2, numbers for wire 0).
export function decode(buf: Uint8Array): Record<number, (Uint8Array | number)[]> {
  const out: Record<number, (Uint8Array | number)[]> = {};
  let i = 0;
  const rv = () => { let x = 0, m = 1, b; do { b = buf[i++]; x += (b & 127) * m; m *= 128; } while (b & 128); return x; };
  while (i < buf.length) {
    const key = rv(), field = Math.floor(key / 8), wire = key & 7;
    let val: Uint8Array | number;
    if (wire === 0) val = rv();
    else if (wire === 2) { const n = rv(); val = buf.subarray(i, i + n); i += n; }
    else if (wire === 1) { val = buf.subarray(i, i + 8); i += 8; }
    else if (wire === 5) { val = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`protobuf wire type ${wire}`);
    (out[field] ||= []).push(val);
  }
  return out;
}

// ── gRPC over fetch ─────────────────────────────────────────────────────────
const GRPC_ERR: Record<number, string> = { 3: "invalid argument", 5: "not found", 7: "permission denied", 8: "rate limited", 13: "internal", 14: "unavailable", 16: "unauthenticated" };

export async function grpc(method: string, msg: Uint8Array, key: string, fn = MAGPIE): Promise<Uint8Array[]> {
  const frame = new Uint8Array(5 + msg.length);
  new DataView(frame.buffer).setUint32(1, msg.length);
  frame.set(msg, 5);
  const res = await fetch(HOST + SERVICE + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/grpc", te: "trailers", "function-id": fn, authorization: `Bearer ${key}` },
    body: frame,
  });
  const status = res.headers.get("grpc-status");
  if (!res.ok || (status && status !== "0")) {
    const why = decodeURIComponent(res.headers.get("grpc-message") || "") || GRPC_ERR[Number(status)] || res.statusText;
    throw new Error(`riva ${status ?? res.status}: ${why}`);
  }
  const body = new Uint8Array(await res.arrayBuffer());
  const msgs: Uint8Array[] = [];
  for (let i = 0; i + 5 <= body.length;) {
    const n = new DataView(body.buffer, body.byteOffset + i + 1, 4).getUint32(0);
    msgs.push(body.subarray(i + 5, i + 5 + n));
    i += 5 + n;
  }
  if (!msgs.length) throw new Error("riva: empty response (check the API key and function id)");
  return msgs;
}

export function wav(pcm: Uint8Array, rate = RATE): Uint8Array<ArrayBuffer> {
  const h = new DataView(new ArrayBuffer(44));
  const s = (o: number, t: string) => [...t].forEach((c, k) => h.setUint8(o + k, c.charCodeAt(0)));
  s(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); s(8, "WAVE"); s(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  s(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(new ArrayBuffer(44 + pcm.length));
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

const hits = new Map<string, number[]>();
function limited(id: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}

// Voices from the model's config, cached per isolate.
let voices: Promise<{ name: string; lang: string }[]> | null = null;
function listVoices(key: string) {
  return voices ??= grpc("GetRivaSynthesisConfig", new Uint8Array(), key).then(([m]) => {
    const out: { name: string; lang: string }[] = [];
    for (const cfg of decode(m)[1] || []) {
      const params: Record<string, string> = {};
      for (const e of decode(cfg as Uint8Array)[2] || []) {
        const kv = decode(e as Uint8Array);
        params[td.decode(kv[1]?.[0] as Uint8Array)] = td.decode((kv[2]?.[0] as Uint8Array) || new Uint8Array());
      }
      const base = params.voice_name, lang = params.language_code || "";
      for (const sub of (params.subvoices || "").split(",").map((x) => x.split(":")[0].trim()).filter(Boolean)) {
        out.push({ name: base ? `${base}.${sub}` : sub, lang });
      }
      if (base && !params.subvoices) out.push({ name: base, lang });
    }
    return out;
  }).catch((e) => { voices = null; throw e; });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) return json({ error: "voice not set up: NVIDIA_API_KEY missing" }, 503);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  try {
    if (body.action === "voices") return json({ voices: await listVoices(key) });
    if (body.action === "say") {
      const home = String(body.home || "");
      if (!/^[0-9a-f]{64}$/.test(home)) return json({ error: "home required" }, 400);
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
      if (limited("ip:" + ip, 90) || limited("home:" + home, 60)) return json({ error: "Too many voice requests, slow down." }, 429);
      const text = String(body.text || "").trim().slice(0, 600);
      if (!text) return json({ error: "text required" }, 400);
      const voice = String(body.voice || DEFAULT_VOICE).slice(0, 80);
      const lang = String(body.lang || "en-US").slice(0, 12);
      const [m] = await grpc("Synthesize", synthesizeRequest(text, voice, lang), key);
      const pcm = decode(m)[1]?.[0] as Uint8Array | undefined;
      if (!pcm?.length) return json({ error: "no audio" }, 502);
      return new Response(wav(pcm), { headers: { ...cors, "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[voice]", e);
    const msg = String((e as Error).message || e);
    return json({ error: msg }, /unauthenticated|permission|401|403/i.test(msg) ? 502 : /rate/i.test(msg) ? 429 : 502);
  }
});
