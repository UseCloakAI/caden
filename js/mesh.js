// Mesh — every device in a home on one channel.
// Transport: Supabase Realtime broadcast (raw Phoenix websocket, no SDK) plus a
// BroadcastChannel so tabs on one machine also hear each other instantly.
// Every payload is AES-GCM encrypted with a key derived from the home code, and
// the channel name is a hash of it — the server only ever relays ciphertext.
import { SB_URL, SB_KEY } from './config.js';
import { uid } from './store.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('caden-home-v1'), iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function topicFor(code) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode('caden:' + code));
  return 'caden-' + Array.from(new Uint8Array(h).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class Mesh extends EventTarget {
  constructor(selfId) {
    super();
    this.self = selfId;
    this.ws = null;
    this.ref = 0;
    this.seen = new Map(); // message id -> time, dedupes the two transports
    this.online = false;
    this.retry = 0;
  }

  async join(code) {
    this.leave();
    this.code = code;
    this.key = await deriveKey(code);
    this.topic = await topicFor(code);
    this.bc = new BroadcastChannel(this.topic);
    this.bc.onmessage = (e) => this._recv(e.data);
    this._connect();
  }

  leave() {
    this.closed = true;
    clearInterval(this.hb);
    clearTimeout(this.reconnectT);
    try { this.ws?.close(); } catch { /* already closed */ }
    try { this.bc?.close(); } catch { /* already closed */ }
    this.ws = this.bc = null;
    this._status(false);
  }

  _connect() {
    this.closed = false;
    const url = SB_URL.replace(/^http/, 'ws') + `/realtime/v1/websocket?apikey=${SB_KEY}&vsn=1.0.0`;
    const ws = new WebSocket(url);
    this.ws = ws;
    const rt = 'realtime:' + this.topic;
    ws.onopen = () => {
      this._raw({ topic: rt, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' } } } });
      clearInterval(this.hb);
      this.hb = setInterval(() => this._raw({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic !== rt) return;
      if (m.event === 'phx_reply' && m.payload?.status === 'ok' && !this.online) { this.retry = 0; this._status(true); }
      if (m.event === 'broadcast' && m.payload?.event === 'm') this._recv(m.payload.payload);
      if (m.event === 'phx_error' || m.event === 'phx_close') ws.close();
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      this._status(false);
      if (this.closed || this.ws !== ws) return;
      const wait = Math.min(15000, 800 * 2 ** this.retry++);
      this.reconnectT = setTimeout(() => this._connect(), wait);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  _raw(m) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ ...m, ref: String(++this.ref) }));
    return true;
  }

  _status(on) {
    if (this.online === on) return;
    this.online = on;
    this.dispatchEvent(new CustomEvent('status', { detail: on }));
  }

  // Send a message to every other device in the home. `to` targets one device.
  async send(type, data = {}, to = null) {
    if (!this.key) return;
    const msg = { id: uid(8), from: this.self, to, type, t: Date.now(), data };
    this.seen.set(msg.id, Date.now());
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(msg)));
    const packet = { iv: b64(iv), c: b64(ct) };
    try { this.bc?.postMessage(packet); } catch { /* closed */ }
    this._raw({ topic: 'realtime:' + this.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'm', payload: packet } });
  }

  async _recv(packet) {
    if (!packet?.c || !this.key) return;
    let msg;
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(packet.iv) }, this.key, unb64(packet.c));
      msg = JSON.parse(dec.decode(pt));
    } catch { return; } // wrong home code or garbage
    if (!msg?.id || msg.from === this.self || this.seen.has(msg.id)) return;
    if (msg.to && msg.to !== this.self) return;
    this.seen.set(msg.id, Date.now());
    if (this.seen.size > 500) {
      const cut = Date.now() - 60000;
      for (const [k, v] of this.seen) if (v < cut) this.seen.delete(k);
    }
    this.dispatchEvent(new CustomEvent('msg', { detail: msg }));
  }
}
