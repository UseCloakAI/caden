// Wave: Caden is the wave (Ribbon's sky ribbon, UseCloakAI/ribbon Sky.jsx).
// Each ribbon is a bundle of thin strands whose spread twists and pinches.
// Caden's voice drives it: speaking swells the wave with the real audio level
// (or syllable pulses for the device voice), listening follows the mic,
// thinking quickens and shimmers, idle drifts, sleepy settles. Flights: the
// strands retract toward the side Caden leaves by and sweep back in, thread by
// thread, from the side it arrives from.
//
// Same interface the orb had (set / level / talk / perk / shake / squish / hop
// / leave / arrive / look), so the agent logic is unchanged.
const RIBBONS = [
  { y: 0.62, a1: 0.075, k1: 0.55, w1: 0.2, a2: 0.032, k2: 1.35, w2: 0.29, width: 0.17, kt: 0.72, wt: 0.16, p: 0, strands: 22, alpha: 0.5 },
  { y: 0.68, a1: 0.05, k1: 0.82, w1: 0.15, a2: 0.026, k2: 1.75, w2: 0.25, width: 0.11, kt: 1.08, wt: 0.22, p: 2.2, strands: 15, alpha: 0.34 },
];
const TAU = Math.PI * 2;
const ease = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const STRANDS = RIBBONS.map((r) => Array.from({ length: r.strands }, () => ({ delay: rand() * 0.45, dur: 0.9 + rand() * 1.0 })));

// state → [speed, amplitude, brightness]
const MOOD = { idle: [0.55, 1, 1], listening: [0.9, 1.15, 1.15], thinking: [2.1, 0.9, 1.1], speaking: [1.1, 1.05, 1.2], happy: [0.9, 1.1, 1.35], sleepy: [0.18, 0.7, 0.6] };

export class Wave {
  constructor(canvas) {
    this.el = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.mood = [...MOOD.idle];
    this.t = 8; this.energy = 0; this.push = 0; this.flash = 0;
    this.mic = 0; this.voice = 0; this.pulse = 0; this.shakeT = 0;
    this.dim = 1; this.dimTo = 1;
    this.flight = null; // {kind:'out'|'in', dir, start, dur, resolve}
    this.hidden = false;
    this.speech = null; // () => 0..1 real audio level, set by app
    this.samples = 110;
    this.cy = new Float32Array(this.samples + 1);
    this.hw = new Float32Array(this.samples + 1);
    this.sparks = Array.from({ length: 18 }, () => ({ x: Math.random(), y: 0.4 + Math.random() * 0.46, v: 0.004 + Math.random() * 0.012, p: Math.random() * TAU, r: 0.6 + Math.random() * 1.6 }));
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
    this.last = performance.now();
    const loop = (now) => { this.frame(Math.min(0.05, (now - this.last) / 1000), now); this.last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.W = innerWidth; this.H = innerHeight;
    this.el.width = Math.round(this.W * dpr); this.el.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // mirror: an element whose data-state follows the wave's (CSS, tests, a11y hooks)
  set(state) { if (!MOOD[state]) return; this.state = state; if (this.mirror) this.mirror.dataset.state = state; }
  level(v) { this.mic = Math.max(this.mic, Math.max(0, Math.min(1, v))); }
  talk() { this.pulse = Math.min(1, this.pulse + 0.55); }
  perk() { this.energy += 1.4; this.flash = 1; }
  shake() { this.shakeT = 0.45; }
  squish() { this.energy -= 0.8; this.flash = 0.6; }
  hop() { this.flash = 1; this.energy += 0.9; const was = this.state; this.set('happy'); clearTimeout(this.ht); this.ht = setTimeout(() => { if (this.state === 'happy') this.set(was === 'happy' ? 'idle' : was); }, 1400); }
  look() {}
  lookAway() {}
  // away from this screen: a faint, slow trace of Caden stays in the sky
  setAway(on) { this.dimTo = on ? 0.22 : 1; }

  leave(dir = 1) {
    if (reduce()) { this.dimTo = 0.22; return Promise.resolve(); }
    return new Promise((resolve) => { this.flight = { kind: 'out', dir, start: performance.now(), dur: 850, resolve }; this.energy += 2.2 * dir; });
  }

  arrive(dir = 1) {
    this.dim = this.dimTo = 1;
    if (reduce()) { this.hop(); return Promise.resolve(); }
    return new Promise((resolve) => { this.flight = { kind: 'in', dir, start: performance.now(), dur: 1400, resolve }; this.energy += 1.6 * dir; });
  }

  frame(dt, now) {
    const { ctx, W, H } = this;
    const night = document.documentElement.classList.contains('night');
    const rgb = night ? '168,212,255' : '255,255,255';
    const target = MOOD[this.state] || MOOD.idle;
    for (let i = 0; i < 3; i++) this.mood[i] += (target[i] - this.mood[i]) * Math.min(1, dt * 2.5);
    const [speed, amp, bright] = this.mood;

    // voice: real audio level if there is one, else syllable pulses
    const real = this.state === 'speaking' && this.speech ? this.speech() : 0;
    const drive = Math.max(real, this.pulse * 0.8, this.state === 'listening' ? this.mic : 0);
    this.voice += (drive - this.voice) * Math.min(1, dt * (drive > this.voice ? 14 : 5));
    this.pulse *= Math.exp(-dt * 7);
    this.mic *= Math.exp(-dt * 6);
    this.energy *= Math.exp(-dt * 2.2);
    this.push += this.energy * dt * 1.6;
    this.flash *= Math.exp(-dt * 3);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.dim += (this.dimTo - this.dim) * Math.min(1, dt * 1.6);
    const still = reduce();
    this.t += dt * (still ? 0.08 : speed) * (1 + this.voice * 0.8);

    // flights: how much of the width is drawn, from which side
    let from = 0, to = 1, fprog = 1, f = this.flight;
    if (f) {
      fprog = Math.min(1, (now - f.start) / f.dur);
      if (fprog >= 1) { this.flight = null; if (f.kind === 'out') { this.dimTo = 0.22; this.dim = 0; } f.resolve(); }
    }

    ctx.clearRect(0, 0, W, H);
    const alphaK = this.dim;
    if (alphaK < 0.01 && !this.flight) return;
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 70) * this.shakeT * 18 : 0;

    for (let ri = 0; ri < RIBBONS.length; ri++) {
      const base = RIBBONS[ri];
      const v = this.voice * (ri === 0 ? 1 : 1.3);
      const lift = amp * (1 + v * 1.1);
      const r = { ...base, a1: base.a1 * lift, a2: base.a2 * lift * (1 + v * 0.6), width: base.width * (1 + v * 0.7) * (0.85 + amp * 0.15) };
      const n = this.samples, ph = this.t + this.push;
      for (let i = 0; i <= n; i++) {
        const nx = i / n;
        const hump = 0.4 + 0.6 * Math.sin(nx * Math.PI);
        // speech ripples: a fast travelling wiggle riding on the slow wave
        const ripple = Math.sin(nx * 9 * TAU - ph * 6) * v * 0.022 * hump;
        this.cy[i] = H * r.y + Math.sin(nx * r.k1 * TAU + ph * r.w1 + r.p) * H * r.a1 + Math.sin(nx * r.k2 * TAU - ph * r.w2) * H * r.a2 + ripple * H + shake;
        this.hw[i] = H * r.width * Math.sin(nx * r.kt * TAU + ph * r.wt + r.p) * (0.55 + 0.45 * Math.sin(nx * Math.PI));
      }
      const strandSpan = (s) => {
        // each strand's drawn range during a flight [x0, x1] in 0..1
        if (!f) return [0, 1];
        const rv = STRANDS[ri][s % STRANDS[ri].length];
        const local = Math.max(0, Math.min(1, (fprog * (f.dur / 1000) * 1.6 - rv.delay) / (rv.dur * 0.75)));
        if (f.kind === 'in') { const e = ease(local); return f.dir > 0 ? [0, e] : [1 - e, 1]; }
        const e = easeIn(local); return f.dir > 0 ? [e, 1] : [0, 1 - e];
      };

      // translucent sheet
      const [sx0, sx1] = f ? (f.kind === 'in' ? (f.dir > 0 ? [0, ease(fprog)] : [1 - ease(fprog), 1]) : (f.dir > 0 ? [easeIn(fprog), 1] : [0, 1 - easeIn(fprog)])) : [0, 1];
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= n; i++) { const nx = i / n; if (nx < sx0 || nx > sx1) continue; const x = nx * W, y = this.cy[i] - this.hw[i] / 2; started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
      for (let i = n; i >= 0; i--) { const nx = i / n; if (nx < sx0 || nx > sx1) continue; ctx.lineTo(nx * W, this.cy[i] + this.hw[i] / 2); }
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb},${((night ? 0.05 : 0.12) + this.flash * 0.05 + v * 0.06) * alphaK})`;
      if (started) ctx.fill();

      ctx.lineWidth = 1;
      const count = base.strands;
      for (let s = 0; s < count; s++) {
        const u = s / (count - 1) - 0.5, edge = Math.pow(Math.abs(u) * 2, 2);
        const [a0, a1] = strandSpan(s);
        if (a1 <= a0) continue;
        ctx.strokeStyle = `rgba(${rgb},${Math.min(1, base.alpha * (night ? 1 : 1.3) * (0.22 + 0.78 * edge) * (1 + this.flash * 0.4 + v * 0.5) * bright) * alphaK})`;
        ctx.beginPath();
        let st = false;
        for (let i = 0; i <= n; i++) { const nx = i / n; if (nx < a0 || nx > a1) continue; const x = nx * W, y = this.cy[i] + u * this.hw[i]; st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; }
        ctx.stroke();
      }
    }

    const fast = this.state === 'thinking' ? 4 : 1;
    for (const p of this.sparks) {
      p.x += (p.v * fast * (still ? 0 : 1) + this.energy * 0.01) * dt;
      if (p.x > 1.02) p.x -= 1.04;
      if (p.x < -0.02) p.x += 1.04;
      if (f && (p.x < sx0g(f, fprog)[0] || p.x > sx0g(f, fprog)[1])) continue;
      const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * (1.7 * fast) + p.p))) * (night ? 0.8 : 0.9) * alphaK;
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H + Math.sin(this.t * 0.6 + p.p) * 6, p.r * (1 + this.voice), 0, TAU);
      ctx.fill();
    }
  }
}

function sx0g(f, prog) {
  if (f.kind === 'in') return f.dir > 0 ? [0, ease(prog)] : [1 - ease(prog), 1];
  return f.dir > 0 ? [easeIn(prog), 1] : [0, 1 - easeIn(prog)];
}

// The setup screen and the away card had their own orbs; now there's one sky.
export const quietOrb = { set() {}, hop() {}, look() {}, lookAway() {}, level() {}, talk() {}, perk() {}, shake() {}, squish() {}, leave: () => Promise.resolve(), arrive: () => Promise.resolve() };
