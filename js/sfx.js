// Sfx: Caden's sound effects, synthesized (no audio files, no licensing,
// nothing to download, works offline in the APK).
//
// Each sound is rendered once into a 48 kHz stereo buffer with an
// OfflineAudioContext: FM bells, filtered-noise whooshes, soft plucks, all
// through one shared convolution reverb (a seeded stereo impulse response) and
// with click-free fades. Playback is just a buffer → per-sound gain → stereo
// pan → master volume → limiter, so it's cheap and sounds identical every time.
//
//   sfx.play('wake')                    sfx.play('whooshOut', { pan: -1 })
//   sfx.enabled = false                 sfx.volume = 0.6
const SR = 48000;

// Seeded random so every render (and every device) sounds the same.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ── building blocks (all inside an OfflineAudioContext `o`) ─────────────────
function noiseBuffer(o, seconds, seed = 7) {
  const r = rng(seed);
  const b = o.createBuffer(2, Math.ceil(seconds * o.sampleRate), o.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  return b;
}

// Small-room/plate reverb: stereo noise with an exponential decay and a soft
// high-frequency rolloff over time (darker tail).
function reverb(o, seconds = 1.8, decay = 3.2) {
  const c = o.createConvolver();
  const len = Math.ceil(seconds * o.sampleRate);
  const ir = o.createBuffer(2, len, o.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(101 + ch), d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.25 + 0.7 * t; // more smoothing later = darker tail
      lp = lp + (1 - a) * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < 96 ? i / 96 : 1);
    }
  }
  c.buffer = ir;
  return c;
}

// Out bus: dry + reverb send, both to destination.
function bus(o, wet = 0.22) {
  const dry = o.createGain(), send = o.createGain(), rv = reverb(o), ret = o.createGain();
  send.gain.value = wet; ret.gain.value = 0.9;
  dry.connect(o.destination);
  dry.connect(send); send.connect(rv); rv.connect(ret); ret.connect(o.destination);
  return dry;
}

function env(param, t, { a = 0.004, d = 0.4, peak = 1, from = 0.0001 }) {
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// FM bell: carrier + modulator at a bell ratio with a decaying index, plus a
// quiet inharmonic partial for shimmer.
function bell(o, out, t, f, { d = 0.9, g = 0.3, ratio = 3.5, index = 2.2, pan = 0 } = {}) {
  const car = o.createOscillator(), mod = o.createOscillator(), mg = o.createGain(), amp = o.createGain();
  const p = o.createStereoPanner(); p.pan.value = pan;
  car.frequency.value = f; mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + d * 0.6);
  mod.connect(mg); mg.connect(car.frequency);
  env(amp.gain, t, { a: 0.003, d, peak: g });
  car.connect(amp); amp.connect(p); p.connect(out);
  const sh = o.createOscillator(), sg = o.createGain();
  sh.frequency.value = f * 2.756;
  env(sg.gain, t, { a: 0.002, d: d * 0.45, peak: g * 0.18 });
  sh.connect(sg); sg.connect(p);
  for (const n of [car, mod, sh]) { n.start(t); n.stop(t + d + 0.1); }
}

// Soft pluck/blip: a sine (or triangle) with a quick pitch glide and a lowpass.
function blip(o, out, t, f, { d = 0.18, g = 0.35, to = null, type = 'sine', lp = 4000, pan = 0 } = {}) {
  const osc = o.createOscillator(), amp = o.createGain(), filt = o.createBiquadFilter(), p = o.createStereoPanner();
  osc.type = type; filt.type = 'lowpass'; filt.frequency.value = lp; p.pan.value = pan;
  osc.frequency.setValueAtTime(f, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + d * 0.7);
  env(amp.gain, t, { a: 0.004, d, peak: g });
  osc.connect(filt); filt.connect(amp); amp.connect(p); p.connect(out);
  osc.start(t); osc.stop(t + d + 0.05);
}

// Whoosh: noise through a sweeping bandpass with a swell, panned across.
function whoosh(o, out, t, { d = 0.7, f0 = 300, f1 = 2400, g = 0.5, q = 1.1, pan0 = 0, pan1 = 0, swell = 0.55 } = {}) {
  const src = o.createBufferSource(); src.buffer = noiseBuffer(o, d + 0.1, 3);
  const bp = o.createBiquadFilter(), bp2 = o.createBiquadFilter(), amp = o.createGain(), p = o.createStereoPanner();
  bp.type = 'bandpass'; bp.Q.value = q * 1.6; bp2.type = 'bandpass'; bp2.Q.value = q;
  for (const f of [bp, bp2]) { f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d); }
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(g, t + d * swell);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + d);
  p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + d);
  src.connect(bp); bp.connect(bp2); bp2.connect(amp); amp.connect(p); p.connect(out);
  src.start(t); src.stop(t + d + 0.05);
}

// Low soft thump (a landing): sine drop with a touch of filtered noise.
function thump(o, out, t, { f = 140, g = 0.55 } = {}) {
  blip(o, out, t, f, { to: f * 0.45, d: 0.22, g, lp: 900 });
  const src = o.createBufferSource(); src.buffer = noiseBuffer(o, 0.08, 9);
  const lp = o.createBiquadFilter(), amp = o.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 1200;
  env(amp.gain, t, { a: 0.002, d: 0.06, peak: g * 0.35 });
  src.connect(lp); lp.connect(amp); amp.connect(out); src.start(t); src.stop(t + 0.1);
}

// Notes (Hz). The palette is a warm D major pentatonic: friendly, never tense.
const N = { A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, Fs6: 1479.98, A6: 1760 };

// ── the sounds ──────────────────────────────────────────────────────────────
// Each recipe returns its length in seconds (the reverb tail is added on top).
const RECIPES = {
  // Heard its name: two quick rising bell notes, short so it doesn't cover your voice.
  wake: (o, out) => { bell(o, out, 0, N.A5, { d: 0.5, g: 0.22 }); bell(o, out, 0.085, N.D6, { d: 0.65, g: 0.2 }); return 0.75; },
  // Listening window closed without a command.
  cancel: (o, out) => { bell(o, out, 0, N.D6, { d: 0.35, g: 0.12, index: 1.2 }); bell(o, out, 0.08, N.A5, { d: 0.45, g: 0.12, index: 1.2 }); return 0.55; },
  // A turn was sent to the brain.
  send: (o, out) => { blip(o, out, 0, N.D5, { to: N.A5, d: 0.12, g: 0.16 }); return 0.15; },
  // Something failed: a gentle falling minor-ish pair, never harsh.
  error: (o, out) => { blip(o, out, 0, N.E4, { d: 0.22, g: 0.3, type: 'triangle', lp: 1800 }); blip(o, out, 0.14, 277.18, { d: 0.32, g: 0.3, type: 'triangle', lp: 1500 }); return 0.5; },
  // Caden flies off (pan set at play time follows the flight).
  whooshOut: (o, out) => { whoosh(o, out, 0, { d: 0.75, f0: 380, f1: 3200, g: 0.55, pan0: 0, pan1: 1 }); bell(o, out, 0.05, N.Fs6, { d: 0.4, g: 0.05, index: 0.8, pan: 0.6 }); return 0.8; },
  // Caden swoops in.
  whooshIn: (o, out) => { whoosh(o, out, 0, { d: 0.8, f0: 3000, f1: 420, g: 0.5, pan0: -1, pan1: 0, swell: 0.75 }); return 0.85; },
  // Touchdown after the swoop, with a little happy sparkle.
  land: (o, out) => { thump(o, out, 0); bell(o, out, 0.05, N.D6, { d: 0.5, g: 0.1, pan: -0.2 }); bell(o, out, 0.11, N.Fs6, { d: 0.5, g: 0.08, pan: 0.2 }); return 0.6; },
  // Greeting / hop: a quick bright arpeggio.
  sparkle: (o, out) => { [N.D6, N.Fs6, N.A6].forEach((f, i) => bell(o, out, i * 0.055, f, { d: 0.5, g: 0.09, index: 1.4, pan: -0.4 + i * 0.4 })); return 0.7; },
  // Something worked (face learned, calibrated, QR found, joined).
  success: (o, out) => { [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => bell(o, out, i * 0.07, f, { d: 0.7, g: 0.13, index: 1.8, pan: -0.3 + i * 0.2 })); return 1.0; },
  // UI press (button, pinch in the air).
  click: (o, out) => { blip(o, out, 0, 1800, { to: 1200, d: 0.045, g: 0.22, lp: 6000 }); blip(o, out, 0, 420, { d: 0.05, g: 0.12, lp: 1200 }); return 0.06; },
  // A notice appeared.
  pop: (o, out) => { blip(o, out, 0, N.A4, { to: N.A5, d: 0.1, g: 0.16 }); return 0.12; },
  toggleOn: (o, out) => { blip(o, out, 0, N.A4, { d: 0.09, g: 0.18 }); blip(o, out, 0.06, N.D5, { d: 0.12, g: 0.18 }); return 0.2; },
  toggleOff: (o, out) => { blip(o, out, 0, N.D5, { d: 0.09, g: 0.16 }); blip(o, out, 0.06, N.A4, { d: 0.12, g: 0.16 }); return 0.2; },
  sheetOpen: (o, out) => { whoosh(o, out, 0, { d: 0.22, f0: 900, f1: 2600, g: 0.12, q: 0.8, pan0: 0.6, pan1: 0.3 }); return 0.25; },
  sheetClose: (o, out) => { whoosh(o, out, 0, { d: 0.18, f0: 2400, f1: 800, g: 0.1, q: 0.8, pan0: 0.3, pan1: 0.7 }); return 0.2; },
  // Swipe gesture.
  swish: (o, out) => { whoosh(o, out, 0, { d: 0.25, f0: 700, f1: 3600, g: 0.2, q: 1.4, pan0: -0.6, pan1: 0.6 }); return 0.28; },
};

// Reverb per sound: notes and flights live in the room; UI ticks stay dry and
// tight (a wet click rings and reads as mush). Tail = how much render to keep.
const SPACE = {
  click: { wet: 0.04, tail: 0.12 }, pop: { wet: 0.06, tail: 0.18 }, send: { wet: 0.08, tail: 0.2 },
  toggleOn: { wet: 0.06, tail: 0.18 }, toggleOff: { wet: 0.06, tail: 0.18 },
  sheetOpen: { wet: 0.05, tail: 0.15 }, sheetClose: { wet: 0.05, tail: 0.15 }, swish: { wet: 0.1, tail: 0.3 },
};
const space = (name) => SPACE[name] || { wet: 0.22, tail: 0.9 };

export const sfx = {
  enabled: true,
  volume: 0.6,
  ctx: null,
  bank: new Map(),
  pending: new Map(),

  // Audio needs a user gesture on the web; call from any tap (also fine in the APK).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
      this.master.connect(this.limiter); this.limiter.connect(this.ctx.destination);
      this.master.gain.value = this.volume;
      this.warm();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },

  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.volume; },

  // Pre-render everything in the background so the first play is instant.
  warm() { for (const name of Object.keys(RECIPES)) this.render(name); },

  render(name) {
    if (this.bank.has(name)) return Promise.resolve(this.bank.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !RECIPES[name]) return Promise.resolve(null);
    // Measure the length first with a throwaway pass, then render for real.
    const job = (async () => {
      const { wet, tail } = space(name);
      const probe = new OAC(2, SR, SR);
      const len = RECIPES[name](probe, bus(probe, wet)) + tail;
      const o = new OAC(2, Math.ceil(len * SR), SR);
      RECIPES[name](o, bus(o, wet));
      const buf = await o.startRendering();
      // Normalize every sound to the same peak, with click-free edges.
      let peak = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
      const k = peak > 0 ? 0.7 / peak : 1, fade = Math.floor(0.01 * SR);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch), n = d.length;
        for (let i = 0; i < n; i++) d[i] *= k * (i >= n - fade ? (n - i) / fade : 1);
      }
      this.bank.set(name, buf);
      this.pending.delete(name);
      return buf;
    })().catch(() => { this.pending.delete(name); return null; });
    this.pending.set(name, job);
    return job;
  },

  // Per-sound loudness, so the palette sits together after normalization.
  LEVEL: { wake: 0.55, cancel: 0.35, send: 0.3, error: 0.55, whooshOut: 0.7, whooshIn: 0.65, land: 0.55, sparkle: 0.45, success: 0.55, click: 0.35, pop: 0.3, toggleOn: 0.35, toggleOff: 0.3, sheetOpen: 0.25, sheetClose: 0.22, swish: 0.35 },

  async play(name, { pan = 0, gain = 1, delay = 0 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state === 'closed') return;
    const buf = this.bank.get(name) || await this.render(name);
    if (!buf || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), p = this.ctx.createStereoPanner();
    src.buffer = buf;
    g.gain.value = gain * (this.LEVEL[name] ?? 0.4);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g); g.connect(p); p.connect(this.master);
    src.start(this.ctx.currentTime + delay);
  },
};

export const SFX_NAMES = Object.keys(RECIPES);
