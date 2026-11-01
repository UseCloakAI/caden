// Sfx: Caden's interface sounds, the Ribbon palette (UseCloakAI/ribbon,
// src/lib/sound.js), ported as-is.
//
// Everything is synthesized, then pre-rendered once through an
// OfflineAudioContext into stereo buffers: two-operator FM (glass bells,
// kalimba plucks), shaped noise, a detuned saw pad, all through a stereo room
// with early reflections and a damped tail. G major pentatonic. Navigation is
// close and dry (a glass tick per notch, a felt thock at a ring's end, a rising
// fifth to step in, falling to step out); moments open into the room. Each
// sound is peak-normalized to its own target so the constant companions sit
// quietest. Playback: buffer → gain → pan → master → gentle compressor.
//
//   sfx.play('tick', { dir: -1 })     sfx.play('arrive', { pan: -0.4 })
//   sfx.enabled = false               sfx.setVolume(0.6)
const SR = 44100;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91];

// ---------- shared material ----------
let IR = null, NOISE = null;
function material() {
  if (IR) return;
  const len = Math.floor(SR * 2.4);
  IR = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SR });
  for (let ch = 0; ch < 2; ch++) {
    const d = IR.getChannelData(ch);
    const early = [0.011, 0.019, 0.027, 0.041, 0.053].map((t) => t + ch * 0.003);
    early.forEach((t, i) => (d[Math.floor(t * SR)] += 0.5 / (i + 1)));
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const k = 0.55 - 0.45 * p;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] += lp * Math.pow(1 - p, 2.6) * Math.min(1, i / (SR * 0.02)) * 0.6;
    }
  }
  NOISE = new AudioBuffer({ numberOfChannels: 1, length: SR * 2, sampleRate: SR });
  const n = NOISE.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
}

// ---------- voices (inside an offline context) ----------
function chain(oc, wetLevel) {
  const dry = oc.createGain(), wet = oc.createGain();
  wet.gain.value = wetLevel;
  const conv = oc.createConvolver();
  conv.normalize = true;
  conv.buffer = IR;
  const hs = oc.createBiquadFilter();
  hs.type = 'highshelf'; hs.frequency.value = 5000; hs.gain.value = -6;
  dry.connect(oc.destination);
  wet.connect(conv).connect(hs).connect(oc.destination);
  return { dry, wet };
}
function out(oc, bus, { pan = 0, send = 0 }) {
  const p = oc.createStereoPanner();
  p.pan.value = pan;
  p.connect(bus.dry);
  if (send) { const s = oc.createGain(); s.gain.value = send; p.connect(s).connect(bus.wet); }
  return p;
}
function env(param, t, peak, attack, decay, floor = 0.0001) {
  param.setValueAtTime(floor, t);
  param.exponentialRampToValueAtTime(Math.max(peak, floor * 2), t + attack);
  param.exponentialRampToValueAtTime(floor, t + attack + decay);
}
function fm(oc, bus, { t = 0, f, dur = 0.6, gain = 0.2, ratio = 1.4, index = 2.5, bright = 0.08, attack = 0.002, pan = 0, send = 0.2 }) {
  const c = oc.createOscillator(), a = oc.createGain();
  c.frequency.value = f;
  env(a.gain, t, gain, attack, dur);
  if (index > 0) {
    const m = oc.createOscillator(), mg = oc.createGain();
    m.frequency.value = f * ratio;
    env(mg.gain, t, index * f * ratio, 0.001, dur * bright * 6);
    m.connect(mg).connect(c.frequency);
    m.start(t); m.stop(t + dur + 0.1);
  }
  c.connect(a).connect(out(oc, bus, { pan, send }));
  c.start(t); c.stop(t + dur + 0.1);
}
function pluck(oc, bus, o) {
  fm(oc, bus, { ratio: 2, index: 1.6, bright: 0.02, dur: 0.5, ...o });
  fm(oc, bus, { ...o, f: o.f * 5.4, index: 0, gain: (o.gain ?? 0.2) * 0.12, dur: 0.08 });
}
function noise(oc, bus, { t = 0, dur = 0.2, type = 'bandpass', from = 2000, to, q = 1, gain = 0.1, attack = 0.002, pan = 0, send = 0 }) {
  const s = oc.createBufferSource();
  s.buffer = NOISE;
  const fl = oc.createBiquadFilter();
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(from, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const a = oc.createGain();
  env(a.gain, t, gain, attack, dur);
  s.connect(fl).connect(a).connect(out(oc, bus, { pan, send }));
  s.start(t, Math.random());
  s.stop(t + dur + attack + 0.05);
}
function sine(oc, bus, { t = 0, f, to, dur = 0.1, gain = 0.2, attack = 0.002, pan = 0, send = 0 }) {
  const o = oc.createOscillator();
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const a = oc.createGain();
  env(a.gain, t, gain, attack, dur);
  o.connect(a).connect(out(oc, bus, { pan, send }));
  o.start(t); o.stop(t + dur + attack + 0.05);
}

// ---------- the palette: [length s, reverb, builder] (Ribbon's, unchanged) ----------
const DEFS = {
  tick: [0.25, 0.08, (oc, b) => {
    noise(oc, b, { dur: 0.012, type: 'highpass', from: 6500, gain: 0.07 });
    fm(oc, b, { f: hz(98), ratio: 1.41, index: 1.2, bright: 0.01, dur: 0.06, gain: 0.05, send: 0.3 });
    sine(oc, b, { f: 190, dur: 0.02, gain: 0.05 });
  }],
  bump: [0.35, 0.05, (oc, b) => {
    sine(oc, b, { f: 120, to: 62, dur: 0.16, gain: 0.32 });
    noise(oc, b, { dur: 0.05, type: 'lowpass', from: 420, gain: 0.12 });
  }],
  press: [0.4, 0.1, (oc, b) => {
    noise(oc, b, { dur: 0.015, type: 'highpass', from: 4000, gain: 0.06 });
    pluck(oc, b, { f: hz(79), gain: 0.07, dur: 0.18, send: 0.2 });
  }],
  enter: [1.2, 0.18, (oc, b) => {
    pluck(oc, b, { f: hz(79), gain: 0.12, pan: -0.1 });
    pluck(oc, b, { t: 0.07, f: hz(86), gain: 0.11, pan: 0.1, send: 0.35 });
  }],
  back: [1.1, 0.16, (oc, b) => {
    pluck(oc, b, { f: hz(86), gain: 0.1, pan: 0.1 });
    pluck(oc, b, { t: 0.065, f: hz(79), gain: 0.1, pan: -0.1, send: 0.3 });
  }],
  launch: [3.2, 0.32, (oc, b) => {
    noise(oc, b, { dur: 0.62, from: 300, to: 4200, q: 1.4, gain: 0.07, attack: 0.4, send: 0.6 });
    sine(oc, b, { f: hz(43), dur: 0.9, gain: 0.08, attack: 0.5 });
    [67, 74, 79, 83, 86].forEach((n, i) => fm(oc, b, { t: 0.58 + i * 0.028, f: hz(n), ratio: 3.5, index: 0.9, bright: 0.05, dur: 1.9, gain: 0.05, pan: (i - 2) * 0.25, send: 0.7 }));
  }],
  close: [1.4, 0.22, (oc, b) => {
    noise(oc, b, { dur: 0.36, from: 3200, to: 380, q: 1.2, gain: 0.06, attack: 0.05, send: 0.4 });
    fm(oc, b, { t: 0.06, f: hz(74), ratio: 3.5, index: 0.7, dur: 0.9, gain: 0.05, send: 0.5 });
  }],
  grab: [0.9, 0.14, (oc, b) => { pluck(oc, b, { f: hz(72), gain: 0.09 }); pluck(oc, b, { t: 0.05, f: hz(79), gain: 0.09, send: 0.3 }); }],
  release: [0.9, 0.14, (oc, b) => { pluck(oc, b, { f: hz(79), gain: 0.08 }); pluck(oc, b, { t: 0.05, f: hz(72), gain: 0.08, send: 0.25 }); }],
  value: [0.6, 0.1, (oc, b) => {
    noise(oc, b, { dur: 0.01, type: 'highpass', from: 6000, gain: 0.04 });
    pluck(oc, b, { f: hz(69), gain: 0.09, dur: 0.3, send: 0.2 });
  }],
  toggleOn: [0.8, 0.12, (oc, b) => { pluck(oc, b, { f: hz(79), gain: 0.08 }); pluck(oc, b, { t: 0.05, f: hz(83), gain: 0.08, send: 0.25 }); }],
  toggleOff: [0.8, 0.12, (oc, b) => { pluck(oc, b, { f: hz(83), gain: 0.07 }); pluck(oc, b, { t: 0.05, f: hz(76), gain: 0.07, send: 0.2 }); }],
  select: [1.2, 0.2, (oc, b) => {
    noise(oc, b, { dur: 0.012, type: 'highpass', from: 5000, gain: 0.05 });
    fm(oc, b, { f: hz(83), ratio: 3.5, index: 0.9, dur: 0.8, gain: 0.07, send: 0.45 });
  }],
  pop: [0.7, 0.18, (oc, b) => { sine(oc, b, { f: hz(86), to: hz(93), dur: 0.09, gain: 0.06, send: 0.3 }); }],
  step: [0.9, 0.2, (oc, b) => { fm(oc, b, { f: hz(91), ratio: 3.5, index: 0.5, dur: 0.5, gain: 0.04, send: 0.5 }); }],
  connected: [3, 0.3, (oc, b) => {
    [67, 71, 74, 79, 83, 86].forEach((n, i) => fm(oc, b, { t: i * 0.06, f: hz(n), ratio: 3.5, index: 0.8, dur: 1.6, gain: 0.05, pan: (i - 2.5) * 0.2, send: 0.6 }));
    sine(oc, b, { f: hz(43), dur: 1.2, gain: 0.07, attack: 0.02 });
  }],
  error: [1.2, 0.12, (oc, b) => {
    fm(oc, b, { f: hz(62), ratio: 1, index: 1.5, dur: 0.22, gain: 0.1 });
    fm(oc, b, { t: 0.16, f: hz(58), ratio: 1, index: 1.5, dur: 0.4, gain: 0.1, send: 0.2 });
  }],
  chime: [3.4, 0.35, (oc, b) => {
    [79, 83, 86, 91].forEach((n, i) => fm(oc, b, { t: i * 0.05, f: hz(n), ratio: 3.5, index: 1, bright: 0.04, dur: 2.2, gain: 0.05, pan: (i - 1.5) * 0.3, send: 0.6 }));
  }],
  arrive: [1.6, 0.2, (oc, b) => {
    sine(oc, b, { f: hz(55), to: hz(43), dur: 0.6, gain: 0.14, attack: 0.02 });
    noise(oc, b, { dur: 0.5, from: 600, to: 2400, q: 1, gain: 0.03, attack: 0.25, send: 0.4 });
    [79, 83, 86, 91].forEach((n, i) => pluck(oc, b, { t: 0.4 + i * 0.07, f: hz(n), gain: 0.035, dur: 0.3, pan: -0.3 + i * 0.2, send: 0.3 }));
  }],
};
const PEAK = { tick: -16, value: -14, press: -15, bump: -14, pop: -16, step: -16, chime: -10, launch: -10, connected: -10 };

// Caden's moments → Ribbon's sounds.
const ALIAS = {
  wake: 'select', cancel: 'release', send: 'press', whooshOut: 'close', whooshIn: 'arrive', land: null,
  sparkle: 'chime', success: 'connected', click: 'press', sheetOpen: 'enter', sheetClose: 'back', swish: 'tick',
};

function normalize(buf, dB) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  if (!peak) return;
  const k = Math.pow(10, dB / 20) / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
}

export const sfx = {
  enabled: true,
  volume: 0.6,
  ctx: null,
  bank: new Map(),
  pending: new Map(),
  lastTick: 0,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.15;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      this.setVolume(this.volume);
      this.warm();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(Math.pow(this.volume, 1.5) * 1.1, this.ctx.currentTime, 0.02);
  },

  warm() { for (const n of Object.keys(DEFS)) this.render(n); },

  render(name) {
    name = name in ALIAS ? ALIAS[name] : name;
    if (!name || !DEFS[name]) return Promise.resolve(null);
    if (this.bank.has(name)) return Promise.resolve(this.bank.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const job = (async () => {
      material();
      const [len, wet, build] = DEFS[name];
      const oc = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
      build(oc, chain(oc, wet));
      const buf = await oc.startRendering();
      normalize(buf, PEAK[name] ?? -12);
      this.bank.set(name, buf);
      this.pending.delete(name);
      return buf;
    })().catch(() => { this.pending.delete(name); return null; });
    this.pending.set(name, job);
    return job;
  },

  // dir: for 'tick' (down a step when turning back), value: 0..1 for 'value' (snapped to the scale)
  async play(name, { pan = 0, gain = 1, delay = 0, dir = 1, value = null } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state === 'closed') return;
    const real = name in ALIAS ? ALIAS[name] : name;
    if (!real) return;
    const buf = this.bank.get(real) || await this.render(real);
    if (!buf || this.ctx.state !== 'running') return;
    let semis = 0, jitter = 0.012, g = gain;
    if (real === 'tick') {
      const now = performance.now(), fast = now - this.lastTick < 70;
      this.lastTick = now;
      semis = dir > 0 ? 0 : -2; jitter = 0.04; if (fast) g *= 0.6;
    }
    if (real === 'value' && value != null) {
      semis = PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.round(value * (PENTA.length - 1))))] - 69; jitter = 0;
    }
    const src = this.ctx.createBufferSource(), gn = this.ctx.createGain(), p = this.ctx.createStereoPanner();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, semis / 12) * (1 + (Math.random() - 0.5) * jitter);
    gn.gain.value = g;
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(gn).connect(p).connect(this.master);
    src.start(this.ctx.currentTime + delay);
  },
};

export const SFX_NAMES = Object.keys(DEFS);
