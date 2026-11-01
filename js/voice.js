// Voice — hearing (wake word + commands) and speaking.
// Hearing engines, best first:
//   native   the Android app's SpeechRecognizer (window.CadenNative)
//   browser  Web Speech API (Chrome, Edge, Safari)
//   whisper  mic + voice-activity detection → Cloak's /v1/transcribe
// Speaking: the Android app's TextToSpeech, else speechSynthesis.
import { API } from './config.js';

const Native = () => window.CadenNative || null;
const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
window.__cadenNative = window.__cadenNative || {};

export function hearingEngines() {
  const out = [];
  if (Native()) out.push('native');
  if (SR()) out.push('browser');
  if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) out.push('whisper');
  return out;
}

// ── Hearing ──────────────────────────────────────────────────────────────────
export class Ears extends EventTarget {
  constructor() {
    super();
    this.on = false;
    this.paused = false;
    this.engine = null;
    this.lang = navigator.language || 'en-US';
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  start(pref) {
    const engines = hearingEngines();
    this.engine = engines.includes(pref) ? pref : engines[0] || null;
    if (!this.engine) { this._emit('state', { state: 'unsupported' }); return; }
    if (this.on) this._halt();
    this.on = true;
    this.paused = false;
    this[`_start_${this.engine}`]();
    this._emit('state', { state: 'on', engine: this.engine });
  }

  stop() {
    this.on = false;
    this._halt();
    this._emit('state', { state: 'off', engine: this.engine });
  }

  // Stop hearing while Caden talks, so it doesn't answer itself.
  pause() { if (!this.on || this.paused) return; this.paused = true; this._halt(); }
  resume() {
    if (!this.on || !this.paused) return;
    this.paused = false;
    this[`_start_${this.engine}`]();
  }

  _halt() {
    clearTimeout(this.restartT);
    if (this.engine === 'native') Native()?.stopListening();
    if (this.engine === 'browser' && this.rec) { this.rec.onend = null; try { this.rec.abort(); } catch { /* idle */ } this.rec = null; }
    if (this.engine === 'whisper') this._stopWhisper();
  }

  _again(ms = 250) {
    clearTimeout(this.restartT);
    if (this.on && !this.paused) this.restartT = setTimeout(() => this[`_start_${this.engine}`](), ms);
  }

  // native (Android SpeechRecognizer, one utterance per session — loop it)
  _start_native() {
    const bridge = window.__cadenNative;
    bridge.onSpeech = (kind, text) => {
      if (kind === 'partial') this._emit('heard', { text, final: false });
      else if (kind === 'final') this._emit('heard', { text, final: true });
      else if (kind === 'level') this._emit('level', Number(text) || 0);
      else if (kind === 'rms') this._emit('rms', Number(text));
      else if (kind === 'end' || kind === 'error') this._again(kind === 'error' ? 600 : 150);
    };
    Native().startListening(this.lang);
  }

  // browser (Web Speech API, continuous)
  _start_browser() {
    const Rec = SR();
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        this._emit('heard', { text: r[0].transcript, final: r.isFinal });
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.on = false;
        this._emit('state', { state: 'denied', engine: 'browser' });
      }
    };
    rec.onend = () => this._again(300);
    this.rec = rec;
    try { rec.start(); } catch { this._again(1000); }
  }

  // whisper (VAD clips → /v1/transcribe)
  async _start_whisper() {
    try {
      if (!this.mic) {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = this.ac.createMediaStreamSource(this.mic);
        this.an = this.ac.createAnalyser();
        this.an.fftSize = 1024;
        src.connect(this.an);
      }
    } catch (e) {
      this.on = false;
      this._emit('state', { state: e?.name === 'NotAllowedError' ? 'denied' : 'error', engine: 'whisper' });
      return;
    }
    await this.ac.resume().catch(() => {});
    const buf = new Float32Array(this.an.fftSize);
    let floor = 0.01, voiced = 0, quiet = 0, rec = null, chunks = [], started = 0;
    const tick = () => {
      if (!this.on || this.paused) return;
      this.an.getFloatTimeDomainData(buf);
      let s = 0; for (const v of buf) s += v * v;
      const rms = Math.sqrt(s / buf.length);
      this._emit('level', Math.min(1, rms * 12));
      if (!rec) floor = floor * 0.97 + rms * 0.03;
      const loud = rms > Math.max(0.015, floor * 2.6);
      if (loud) { voiced++; quiet = 0; } else { quiet++; voiced = Math.max(0, voiced - 1); }
      if (!rec && voiced > 3) {
        chunks = [];
        rec = new MediaRecorder(this.mic);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const r = rec;
        rec.onstop = () => {
          const ms = Date.now() - started;
          if (ms > 600) this._transcribe(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
        };
        rec.start();
        started = Date.now();
        this._emit('heard', { text: '…', final: false, vad: true });
      }
      if (rec && (quiet > 22 || Date.now() - started > 12000)) { rec.stop(); rec = null; voiced = 0; }
      this.raf = setTimeout(tick, 40);
    };
    this._whisperRec = () => rec;
    tick();
  }

  _stopWhisper() {
    clearTimeout(this.raf);
    const r = this._whisperRec?.();
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); }
  }

  async _transcribe(blob) {
    try {
      const lang = this.lang.slice(0, 2);
      const r = await fetch(`${API}/v1/transcribe?lang=${lang}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      const j = await r.json();
      const text = (j.text || '').trim();
      if (text) this._emit('heard', { text, final: true });
    } catch { /* offline: drop the clip */ }
  }
}

// ── Speaking ─────────────────────────────────────────────────────────────────
export class Mouth extends EventTarget {
  constructor() {
    super();
    this.queue = [];          // [{text, audio?: Promise<Blob>, ctrl?: AbortController}]
    this.busy = false;
    this.rate = 1;
    this.voiceName = '';
    this.n = 0;
    this.nv = null;           // NVIDIA voice: {url, headers, voice, lang, home}
    this.nvDownUntil = 0;     // after an NVIDIA error, use the device voice for a while
    window.__cadenNative.onSpeakDone = (id) => this._done(id);
  }

  // Use NVIDIA Magpie through the Cloak API (/v1/speech), or null for the device voice.
  useNvidia(cfg) { this.nv = cfg; }
  get nvActive() { return !!this.nv && Date.now() > this.nvDownUntil; }

  voices() {
    if (Native()) return [];
    return (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang?.startsWith((navigator.language || 'en').slice(0, 2)));
  }

  _pickVoice() {
    const all = window.speechSynthesis?.getVoices() || [];
    if (this.voiceName) { const v = all.find((x) => x.name === this.voiceName); if (v) return v; }
    const lang = (navigator.language || 'en-US').slice(0, 2);
    const mine = all.filter((v) => v.lang?.startsWith(lang));
    const like = [/natural/i, /neural/i, /samantha/i, /google us english/i, /aria/i, /jenny/i, /ava/i, /zira/i];
    for (const re of like) { const v = mine.find((x) => re.test(x.name)); if (v) return v; }
    return mine[0] || all[0] || null;
  }

  // iOS/Safari only play sound after a user gesture: call once from a tap.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this._player().play().then(() => this._player().pause()).catch(() => {});
    if (Native() || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  _player() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      // a silent WAV so unlock() has something to play
      this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
    }
    return this.audio;
  }

  say(text) {
    const t = String(text || '').replace(/[*_#`>~]|\[(?:[^\]]{1,24})\]\s*/g, '').trim();
    if (!t) return;
    const item = { text: t };
    // Start synthesizing now, so it overlaps whatever is playing.
    if (this.nvActive) {
      item.ctrl = new AbortController();
      item.audio = this._fetch(t, item.ctrl.signal);
      item.audio.catch(() => {}); // handled in _next
    }
    this.queue.push(item);
    this._next();
  }

  async _fetch(text, signal) {
    const { url, headers, voice, lang } = this.nv;
    const r = await fetch(url, { method: 'POST', headers, signal, body: JSON.stringify({ text, voice, lang }) });
    if (!r.ok) { let e = `voice ${r.status}`; try { e = (await r.json()).error || e; } catch { /* not json */ } throw new Error(e); }
    return r.blob();
  }

  stop() {
    for (const it of this.queue) it.ctrl?.abort();
    this.queue = [];
    this.cur = null;
    if (this.audio) { this.audio.pause(); this.audio.onended = this.audio.onerror = null; }
    if (Native()) Native().stopSpeaking();
    else window.speechSynthesis?.cancel();
    if (this.busy) { this.busy = false; this._emit('end'); }
  }

  get speaking() { return this.busy || this.queue.length > 0; }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async _next() {
    if (this.busy || !this.queue.length) return;
    const item = this.queue.shift();
    const id = String(++this.n);
    this.cur = id;
    this.busy = true;
    if (item.audio) {
      try {
        const blob = await item.audio;
        if (this.cur !== id) return; // stopped while it was synthesizing
        await this._play(blob, id);
        return;
      } catch (e) {
        if (this.cur !== id) return;
        console.warn('[caden] NVIDIA voice failed, using the device voice', e);
        this.nvDownUntil = Date.now() + 60_000;
        this._emit('fallback', String(e.message || e));
      }
    }
    this._device(item.text, id);
  }

  // How loud Caden's voice is right now (0..1), for the wave. Needs a running
  // AudioContext (set by the app after the first tap); otherwise 0 and the
  // wave falls back to syllable pulses.
  level() {
    if (!this._an || !this.busy || this.audio?.paused) return 0;
    const b = this._buf || (this._buf = new Float32Array(this._an.fftSize));
    this._an.getFloatTimeDomainData(b);
    let s = 0; for (const v of b) s += v * v;
    return Math.min(1, Math.sqrt(s / b.length) * 4);
  }

  _meter(a) {
    const ctx = this.audioCtx;
    if (this._an || !ctx || ctx.state !== 'running') return;
    try {
      const src = ctx.createMediaElementSource(a);
      this._an = ctx.createAnalyser();
      this._an.fftSize = 1024;
      src.connect(this._an);
      this._an.connect(ctx.destination);
    } catch { /* already routed or not allowed: no meter */ }
  }

  async _play(blob, id) {
    const a = this._player();
    this._meter(a);
    const url = URL.createObjectURL(blob);
    const done = () => { URL.revokeObjectURL(url); a.onended = a.onerror = null; this._done(id); };
    a.onended = done;
    a.onerror = done;
    a.src = url;
    a.playbackRate = this.rate;
    await a.play();
    this._emit('start');
    clearTimeout(this.watch);
    this.watch = setTimeout(done, 30_000);
  }

  _device(text, id) {
    this._emit('start');
    if (Native()) { Native().speak(text, id, this.rate); return; }
    if (!window.speechSynthesis) { setTimeout(() => this._done(id), 60 * text.length); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = this._pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = this.rate;
    u.pitch = 1.05;
    u.onboundary = () => this._emit('word');
    u.onend = u.onerror = () => this._done(id);
    // Chrome sometimes never fires onend; a generous watchdog keeps the queue moving.
    clearTimeout(this.watch);
    this.watch = setTimeout(() => this._done(id), 4000 + text.length * 110);
    window.speechSynthesis.speak(u);
  }

  _done(id) {
    if (id !== this.cur || !this.busy) return;
    clearTimeout(this.watch);
    this.busy = false;
    if (this.queue.length) this._next();
    else this._emit('end');
  }
}

// ── Wake words ───────────────────────────────────────────────────────────────
// Speech engines spell names creatively; accept the usual misspellings.
const NAME_FORMS = ['caden', 'kaden', 'cayden', 'kayden', 'caiden', 'kaiden', 'cadence', 'katen', 'cadan', 'kadin', 'caten'];

export function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns {rest} when `text` contains a wake phrase (rest = what came after it), else null.
export function findWake(text, phrases) {
  const t = ' ' + normalize(text) + ' ';
  const forms = new Set();
  for (const p of phrases) {
    const n = normalize(p);
    if (!n) continue;
    forms.add(n);
    if (/\bcaden\b/.test(n)) for (const f of NAME_FORMS) forms.add(n.replace(/\bcaden\b/, f));
  }
  let best = null;
  for (const f of forms) {
    const i = t.indexOf(' ' + f + ' ');
    if (i >= 0 && (!best || i < best.i || (i === best.i && f.length > best.f.length))) best = { i, f };
  }
  if (!best) return null;
  const rest = t.slice(best.i + best.f.length + 2).trim();
  return { rest };
}
