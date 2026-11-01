// Brain — the Caden Supabase project's `brain` edge function. It keeps each
// home's turns and memories, builds the prompt, and streams the reply from
// Cloak's `kairos` tier (NVIDIA Nemotron first). If the brain is unreachable, Caden
// talks to Cloak directly with the turns this device has.
// Sentences are handed out as they complete so Caden starts talking early.
import { API, MODEL, HOME_NOTE, TUNING, SB_URL, SB_KEY } from './config.js';

const BRAIN = `${SB_URL}/functions/v1/brain`;
const brainHeaders = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// The database never sees the home code, only this hash of it.
export async function homeId(code) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('caden-db:' + code));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function brainCall(body) {
  const r = await fetch(BRAIN, { method: 'POST', headers: brainHeaders, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`brain ${r.status}`);
  return r.json();
}
export const brainSync = (home) => brainCall({ action: 'sync', home });
export const brainForget = (home, id) => brainCall({ action: 'forget', home, id });
export const brainClear = (home) => brainCall({ action: 'clear', home });
// The model sometimes runs an action onto the end of a sentence ("Done.DO: ...").
// Put every DO: / REMEMBER: / <search> on its own line before anything reads it.
export const splitActions = (s) => String(s || '').replace(/([^\n])[ \t]*(?=\b(?:DO|REMEMBER):|<search\b)/g, '$1\n');
// The speakable part of a sentence: everything before an inline action.
export const speakable = (s) => String(s || '').split(/\b(?:DO|REMEMBER):|<search\b/)[0].trim();
export const stripRemember = (s) => splitActions(s).split('\n').filter((l) => !/^\s*(REMEMBER:|DO:|<search\b)/i.test(l)).join('\n').trim().replace(/^\[[^\]\n]{1,40}\]\s*/, '');

export function homeContext({ room, device, people, here, place, rooms = [], clocks = [] }) {
  const now = new Date();
  const time = now.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [
    '## HOME CONTEXT',
    `- You are on the ${device}${room ? ` in the ${room}` : ''}.`,
    `- Local time: ${time} (${tz}).`,
    place?.place ? `- The home is in or near ${place.place} (${place.how === 'device' ? 'from the device' : 'approximate, from the network'}). Use ${place.units === 'imperial' ? 'Fahrenheit and miles' : 'Celsius and kilometres'}.` : '',
    rooms.length ? `- Screens in this home right now: ${[...new Set(rooms)].join(', ')}.` : '',
    clocks.length ? `- Timers and alarms:\n${clocks.map((c) => `  - ${c}`).join('\n')}` : '- No timers or alarms are set.',
    people.length ? `- People in this home: ${people.join(', ')}.` : '- Nobody has been introduced to you yet.',
    here.length ? `- In front of this device right now: ${here.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

export function toMessages(turns) {
  const out = [];
  for (const t of turns.slice(-TUNING.historyTurns)) {
    out.push({ role: 'user', content: `[${t.who || 'Someone'}] ${t.text}` });
    if (t.reply) out.push({ role: 'assistant', content: t.reply });
  }
  return out;
}

// Streams a reply. onSentence(text) per finished sentence, onDelta(full) per token.
// `home` + `turn` go to the brain (it has the history); `turns` is the local
// fallback history if the brain can't be reached.
export async function think({ home, turn, turns, system, where, signal, onSentence, onDelta }) {
  let res = null;
  try {
    res = await fetch(BRAIN, { method: 'POST', headers: brainHeaders, body: JSON.stringify({ action: 'turn', home, turn, context: system, where: where ? { lat: where.lat, lon: where.lon, place: where.place, units: where.units } : null }), signal });
    if (!res.ok || !res.body) res = null;
  } catch (e) { if (signal?.aborted) throw e; res = null; }
  if (!res) {
    res = await fetch(`${API}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: true, messages: toMessages(turns), system: `${HOME_NOTE}\n\n${system}`, max_tokens: 400, effort: 'low' }),
      signal,
    });
  }
  if (!res.ok || !res.body) {
    let msg = `Cloak is busy (${res.status}).`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', spoken = 0;

  // Hand out whole sentences: a run of . ! ? (plus a closing quote) followed by
  // whitespace, or a newline. "3.5" and "e.g.x" stay together.
  const flush = (final) => {
    let from = spoken;
    for (let i = spoken; i < full.length; i++) {
      const c = full[i];
      let end = -1;
      if (c === '\n') end = i;
      else if ('.!?'.includes(c)) {
        let j = i + 1;
        while (j < full.length && '.!?"\')]'.includes(full[j])) j++;
        if (j < full.length && /\s/.test(full[j])) end = j - 1;
        i = j - 1;
      }
      if (end >= 0) {
        const sentence = full.slice(from, end + 1).trim().replace(/^\[[^\]\n]{1,40}\]\s*/, '');
        if (sentence.length > 1 || /\w/.test(sentence)) onSentence(sentence);
        from = end + 1;
      }
    }
    spoken = from;
    if (final) { const rest = full.slice(spoken).trim().replace(/^\[[^\]\n]{1,40}\]\s*/, ''); if (rest) onSentence(rest); spoken = full.length; }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.delta) { full += ev.delta; onDelta?.(full); flush(false); }
        else if (ev.done) { if (ev.response && ev.response.length > full.length) full = ev.response; }
        else if (ev.error) { if (!full) throw new Error(ev.error); full += ev.partial && !full ? ev.partial : ''; }
      }
    }
  }
  flush(true);
  return full.trim();
}
