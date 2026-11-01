// Sfx: Caden's interface sounds. Smart-speaker character: warm, deep and
// rounded, like a home speaker, not a toy. Soft sine tones with a little
// second and third harmonic (so they still read on small phone speakers), a
// sub an octave down for weight, gentle attacks (no clicks), everything under
// 2.5 kHz, through a dark, warm room. G major, mostly between G2 and G4.
// Rising two-note "bloop" to listen, falling to stop, a deep swell when Caden
// moves, a rolled low chord for good news, a muffled low fall for errors.
//
// Pre-rendered once through an OfflineAudioContext into stereo buffers, each
// peak-normalized to its own target. Playback: buffer → gain → pan → master →
// gentle compressor.
//
//   sfx.play('tick', { dir: -1 })     sfx.play('arrive', { pan: -0.4 })
//   sfx.enabled = false               sfx.setVolume(0.6)
const SR = 44100;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79]; // G3 up two octaves, pentatonic

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
      const k = 0.3 - 0.25 * p; // darker tail
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
  hs.type = 'highshelf'; hs.frequency.value = 2200; hs.gain.value = -12;
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

// A warm tone: sine + soft 2nd/3rd harmonics + optional sub, low-passed.
// glide: slide from f to `to` over the first `glide` seconds.
function tone(oc, bus, { t = 0, f, to, glide = 0.08, dur = 0.4, gain = 0.2, attack = 0.012, pan = 0, send = 0.25, sub = 0.35, warm = 0.35, cut = 2400 }) {
  const lp = oc.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.5;
  const a = oc.createGain();
  env(a.gain, t, gain, attack, dur);
  lp.connect(a).connect(out(oc, bus, { pan, send }));
  const partials = [[1, 1], [2, warm], [3, warm * 0.3]];
  if (sub) partials.push([0.5, sub]);
  for (const [mul, amp] of partials) {
    const o = oc.createOscillator(), g = oc.createGain();
    g.gain.value = amp;
    o.frequency.setValueAtTime(f * mul, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to * mul, t + glide);
    o.connect(g).connect(lp);
    o.start(t); o.stop(t + attack + dur + 0.1);
  }
}

// ---------- the palette: [length s, reverb, builder] ----------
const G2 = hz(43), G3 = hz(55), B3 = hz(59), D4 = hz(62), G4 = hz(67), B4 = hz(71), D5 = hz(74);
const DEFS = {
  // a soft low tap per step
  tick: [0.25, 0.06, (oc, b) => {
    tone(oc, b, { f: G3, dur: 0.05, gain: 0.08, attack: 0.003, sub: 0.5, warm: 0.2, cut: 1400, send: 0.15 });
  }],
  // a deep thud at an end
  bump: [0.4, 0.05, (oc, b) => {
    sine(oc, b, { f: 95, to: 46, dur: 0.22, gain: 0.32, attack: 0.004 });
    noise(oc, b, { dur: 0.05, type: 'lowpass', from: 260, gain: 0.08 });
  }],
  press: [0.45, 0.1, (oc, b) => {
    tone(oc, b, { f: D4, dur: 0.12, gain: 0.1, attack: 0.005, cut: 1800, send: 0.2 });
  }],
  // open: a rounded rising fifth
  enter: [1.1, 0.2, (oc, b) => {
    tone(oc, b, { f: G3, dur: 0.3, gain: 0.11, pan: -0.08 });
    tone(oc, b, { t: 0.085, f: D4, dur: 0.45, gain: 0.1, pan: 0.08, send: 0.35 });
  }],
  back: [1.0, 0.18, (oc, b) => {
    tone(oc, b, { f: D4, dur: 0.25, gain: 0.1, pan: 0.08 });
    tone(oc, b, { t: 0.08, f: G3, dur: 0.4, gain: 0.1, pan: -0.08, send: 0.3 });
  }],
  // Caden leaves: a deep swell that rises away
  launch: [2.6, 0.3, (oc, b) => {
    noise(oc, b, { dur: 0.7, type: 'lowpass', from: 180, to: 1100, q: 0.8, gain: 0.06, attack: 0.35, send: 0.5 });
    tone(oc, b, { f: G2, to: G3, glide: 0.6, dur: 0.9, gain: 0.12, attack: 0.3, sub: 0.6, cut: 900, send: 0.4 });
    [G3, D4, G4].forEach((f, i) => tone(oc, b, { t: 0.5 + i * 0.06, f, dur: 1.2, gain: 0.05, attack: 0.04, pan: (i - 1) * 0.3, send: 0.6 }));
  }],
  // a sweep falling away
  close: [1.5, 0.24, (oc, b) => {
    noise(oc, b, { dur: 0.45, type: 'lowpass', from: 1100, to: 140, q: 0.8, gain: 0.06, attack: 0.05, send: 0.4 });
    tone(oc, b, { t: 0.05, f: D4, to: G3, glide: 0.3, dur: 0.7, gain: 0.08, attack: 0.03, send: 0.45 });
  }],
  grab: [0.8, 0.14, (oc, b) => { tone(oc, b, { f: G3, dur: 0.16, gain: 0.09 }); tone(oc, b, { t: 0.06, f: B3, dur: 0.25, gain: 0.08, send: 0.3 }); }],
  release: [0.8, 0.14, (oc, b) => { tone(oc, b, { f: B3, dur: 0.16, gain: 0.08 }); tone(oc, b, { t: 0.06, f: G3, dur: 0.3, gain: 0.08, send: 0.25 }); }],
  // pitched by play({ value }) along PENTA, starting at A3
  value: [0.6, 0.1, (oc, b) => {
    tone(oc, b, { f: hz(57), dur: 0.22, gain: 0.1, attack: 0.006, send: 0.2 });
  }],
  toggleOn: [0.8, 0.12, (oc, b) => { tone(oc, b, { f: G3, dur: 0.14, gain: 0.08 }); tone(oc, b, { t: 0.07, f: D4, dur: 0.3, gain: 0.08, send: 0.25 }); }],
  toggleOff: [0.8, 0.12, (oc, b) => { tone(oc, b, { f: D4, dur: 0.14, gain: 0.07 }); tone(oc, b, { t: 0.07, f: G3, dur: 0.3, gain: 0.07, send: 0.2 }); }],
  // "I'm listening": the signature. Two deep, overlapping notes gliding up.
  select: [1.4, 0.24, (oc, b) => {
    tone(oc, b, { f: G3, to: B3, glide: 0.09, dur: 0.35, gain: 0.12, attack: 0.015, sub: 0.45 });
    tone(oc, b, { t: 0.1, f: D4, to: G4, glide: 0.08, dur: 0.6, gain: 0.11, attack: 0.02, send: 0.4 });
  }],
  pop: [0.6, 0.16, (oc, b) => { tone(oc, b, { f: G4, dur: 0.1, gain: 0.06, attack: 0.006, sub: 0, send: 0.25 }); }],
  step: [0.8, 0.2, (oc, b) => { tone(oc, b, { f: B4, dur: 0.3, gain: 0.04, sub: 0, send: 0.45 }); }],
  // good news: a rolled low major chord
  connected: [2.6, 0.32, (oc, b) => {
    [G3, B3, D4, G4].forEach((f, i) => tone(oc, b, { t: i * 0.07, f, dur: 1.4, gain: 0.06, attack: 0.03, sub: i ? 0 : 0.6, pan: (i - 1.5) * 0.2, send: 0.55 }));
  }],
  // something went wrong: a muffled low fall
  error: [1.1, 0.12, (oc, b) => {
    tone(oc, b, { f: hz(50), dur: 0.2, gain: 0.12, cut: 900, warm: 0.5 });
    tone(oc, b, { t: 0.18, f: hz(46), dur: 0.42, gain: 0.12, cut: 800, warm: 0.5, send: 0.2 });
  }],
  // greeting someone: warm and open
  chime: [2.8, 0.34, (oc, b) => {
    [G3, D4, G4, B4].forEach((f, i) => tone(oc, b, { t: i * 0.06, f, dur: 1.6, gain: 0.05, attack: 0.025, sub: 0, pan: (i - 1.5) * 0.25, send: 0.6 }));
  }],
  // Caden lands here: a deep swell settling into a soft rising pair
  arrive: [2.0, 0.24, (oc, b) => {
    tone(oc, b, { f: G3, to: G2, glide: 0.5, dur: 0.7, gain: 0.12, attack: 0.08, sub: 0.6, cut: 800 });
    noise(oc, b, { dur: 0.55, type: 'lowpass', from: 300, to: 1000, q: 0.8, gain: 0.04, attack: 0.25, send: 0.4 });
    [G3, D4, G4].forEach((f, i) => tone(oc, b, { t: 0.42 + i * 0.08, f, dur: 0.6, gain: 0.05, attack: 0.02, sub: 0, pan: -0.25 + i * 0.25, send: 0.4 }));
  }],
};
const PEAK = { tick: -15, value: -13, press: -14, bump: -12, pop: -15, step: -15, chime: -9, launch: -9, connected: -9, select: -9, arrive: -9 };

// Caden's moments → palette sounds.
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
