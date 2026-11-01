// Timers and alarms, shared by the whole home. Every device keeps the full
// list (so Caden can say what's running anywhere); only the devices a clock is
// set "where" ring for it. Pure helpers here; the app owns mesh + UI.

// "10m", "1h30m", "90s", "5 minutes", "1 hour and 20 minutes", "2:30" (m:s)
export function parseDuration(text) {
  const t = String(text || '').toLowerCase().trim();
  const clock = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) return clock[3] != null ? (+clock[1] * 3600 + +clock[2] * 60 + +clock[3]) * 1000 : (+clock[1] * 60 + +clock[2]) * 1000;
  let ms = 0, hit = false;
  const re = /(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)(?![a-z])/g; // "1h10m": no word break after h
  let m;
  while ((m = re.exec(t))) {
    hit = true;
    const n = parseFloat(m[1]), u = m[2][0];
    ms += n * (u === 'h' ? 3600e3 : u === 'm' ? 60e3 : 1e3);
  }
  if (!hit && /^\d+(\.\d+)?$/.test(t)) ms = parseFloat(t) * 60e3; // a bare number means minutes
  return ms > 0 && ms <= 24 * 3600e3 ? Math.round(ms) : null;
}

// "07:30", "7:30 am", "6 pm", "tomorrow 06:45", "2026-11-02 07:30": the next time it happens
export function parseAlarm(text, from = new Date()) {
  const t = String(text || '').toLowerCase().trim();
  const date = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  const tm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!tm) return null;
  let h = +tm[1], min = tm[2] ? +tm[2] : 0;
  const ap = tm[3]?.[0];
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = date ? new Date(+date[1], +date[2] - 1, +date[3], h, min) : new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, min);
  if (!date && /tomorrow/.test(t)) d.setDate(d.getDate() + 1);
  else if (!date && d <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function sayLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return r ? `${m} min ${r} s` : `${m} min`;
  return `${r} s`;
}
export function showLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
