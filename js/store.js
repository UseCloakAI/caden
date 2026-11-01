// Tiny localStorage wrapper. Everything Caden keeps lives on the device.
const P = 'caden.';

export const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* quota */ } },
  del(k) { localStorage.removeItem(P + k); },
};

export function uid(n = 10) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

const WORDS_A = ['sunny', 'cozy', 'mellow', 'lucky', 'breezy', 'gentle', 'merry', 'snug', 'bright', 'happy', 'calm', 'golden'];
const WORDS_B = ['otter', 'maple', 'harbor', 'pebble', 'meadow', 'robin', 'cedar', 'lantern', 'willow', 'comet', 'acorn', 'fern'];
export function newHomeCode() {
  const r = crypto.getRandomValues(new Uint8Array(3));
  return `${WORDS_A[r[0] % 12]}-${WORDS_B[r[1] % 12]}-${10 + (r[2] % 90)}`;
}
export const normCode = (c) => String(c || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function device() {
  let d = store.get('device');
  if (!d) {
    d = { id: uid(), name: guessName(), room: '' };
    store.set('device', d);
  }
  return d;
}
function guessName() {
  const ua = navigator.userAgent;
  if (/CadenApp/.test(ua)) return 'Android';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC';
  return 'Screen';
}
