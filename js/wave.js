// Wave: Caden is the wave (Ribbon's sky ribbon, UseCloakAI/ribbon Sky.jsx).
// Each ribbon is a bundle of thin strands whose spread twists and pinches.
// Caden's voice drives it: speaking swells the wave with the real audio level
// (or syllable pulses for the device voice), listening follows the mic,
// thinking quickens and shimmers, idle drifts, sleepy settles. Flights: the
// strands retract toward the side Caden leaves by and sweep back in, thread by
// thread, from the side it arrives from.
//
// Quality (setQuality): same motion at every level, cheaper drawing. Only the
// band is a canvas (not the whole screen), it stops while the page is hidden,
// and 'auto' steps down when frames get expensive.
//
// Same interface the orb had (set / level / talk / perk / shake / squish / hop
// / leave / arrive / look), so the agent logic is unchanged.
// One ribbon, living in one band along the bottom of the screen. Amplitudes
// are fractions of the band, not the screen, so it never climbs into the words.
const RIBBONS = [
  { y: 0.5, a1: 0.2, k1: 0.5, w1: 0.22, a2: 0.07, k2: 1.1, w2: 0.31, width: 0.42, kt: 0.62, wt: 0.17, p: 0, strands: 30, alpha: 0.55 },
];
const TAU = Math.PI * 2;
// dpr cap, strands drawn, curve samples, sparks, frame-rate cap
export const QUALITY = {
  high: { dpr: 2, strands: 30, samples: 140, sparks: 10, fps: 60, glow: true },
  medium: { dpr: 1.25, strands: 20, samples: 96, sparks: 6, fps: 60 },
  low: { dpr: 1, strands: 12, samples: 60, sparks: 0, fps: 30 },
};
// A first guess for 'auto' from the hardware; frame timing refines it.
export function guessQuality() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 4) return 'low';
  if (mem <= 4 || cores <= 6) return 'medium';
  return 'high';
}
const ease = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const STRANDS = RIBBONS.map((r) => Array.from({ length: r.strands }, () => ({ delay: rand() * 0.45, dur: 0.9 + rand() * 1.0 })));

// state → [speed, amplitude, brightness]
// state → [speed, amplitude, brightness, spread, twist, shimmer, breathe, lean]
//   spread: how wide the strands open (listening gathers them, attentive)
//   twist: how fast the bundle turns over; shimmer: a light running along it
//   breathe: slow swell at rest; lean: rises toward the room (up) or settles
const MOOD = {
  idle: [0.55, 1, 1, 1, 1, 0.15, 1, 0],
  listening: [0.8, 1.1, 1.22, 0.7, 1, 0.3, 0.35, 0.07],
  thinking: [1.9, 0.85, 1.12, 0.92, 1.8, 1, 0.25, 0.02],
  speaking: [1, 1.05, 1.25, 1.06, 1.1, 0.35, 0.15, 0.03],
  happy: [1, 1.22, 1.42, 1.18, 1.45, 0.55, 0.6, 0.05],
  sleepy: [0.16, 0.6, 0.55, 0.8, 0.7, 0.05, 1.4, -0.05],
};

export class Wave {
  constructor(canvas) {
    this.el = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.mood = [...MOOD.idle];
    this.pulses = []; this.prevLevel = 0; this.clock = 0; // syllable ripples
    this.t = 8; this.energy = 0; this.push = 0; this.flash = 0;
    this.mic = 0; this.voice = 0; this.bright = 0.3; this.pulse = 0; this.shakeT = 0;
    this.dim = 1; this.dimTo = 1;
    this.flight = null; // {kind:'out'|'in', dir, start, dur, resolve}
    this.hidden = false;
    this.speech = null; // () => 0..1 real audio level, set by app
    this.samples = 110;
    this.cy = new Float32Array(141);
    this.hw = new Float32Array(141);
    this.mode = 'auto'; this.level = guessQuality(); this.q = QUALITY[this.level];
    this.cost = 0; this.costN = 0; this.onLevel = null;
    this.sparks = Array.from({ length: 10 }, () => ({ x: Math.random(), y: 0.15 + Math.random() * 0.7, v: 0.004 + Math.random() * 0.012, p: Math.random() * TAU, r: 0.6 + Math.random() * 1.6 }));
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (document.hidden) { this.last = now; return; }        // nothing to see
      if (now - this.last < 1000 / this.q.fps - 3) return;     // frame-rate cap (low)
      const t0 = performance.now();
      this.frame(Math.min(0.05, (now - this.last) / 1000), now);
      this.last = now;
      this.watch(performance.now() - t0);
    };
    requestAnimationFrame(loop);
  }

  // 'auto' | 'high' | 'medium' | 'low'
  setQuality(mode) {
    this.mode = mode;
    this.setLevel(mode === 'auto' ? guessQuality() : mode);
  }
  setLevel(level) {
    if (!QUALITY[level]) return;
    const changed = level !== this.level;
    this.level = level; this.q = QUALITY[level];
    this.samples = this.q.samples;
    this.cost = 0; this.costN = 0;
    this.resize();
    if (changed || !this.told) { this.told = true; this.onLevel?.(level); }
  }
  // auto: average draw cost over ~2 s; step down when it eats the frame budget
  watch(ms) {
    if (this.mode !== 'auto') return;
    this.cost += ms; this.costN++;
    if (this.costN < 120) return;
    const avg = this.cost / this.costN;
    this.cost = 0; this.costN = 0;
    if (avg > 7 && this.level !== 'low') this.setLevel(this.level === 'high' ? 'medium' : 'low');
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.q?.dpr || 1.5);
    this.W = innerWidth; this.H = innerHeight;
    // the band: bottom ~30% of the screen (CSS --wave-h keeps the layout in step)
    this.band = Math.max(150, Math.min(320, this.H * 0.3));
    this.top = this.H - this.band;
    // The canvas only covers the band (plus headroom for big swells), not the
    // whole screen: far fewer pixels to fill and composite.
    this.oy = Math.max(0, Math.round(this.top - this.band * 0.6));
    const h = this.H - this.oy;
    this.el.style.top = this.oy + 'px'; this.el.style.height = h + 'px';
    this.el.width = Math.round(this.W * dpr); this.el.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, -this.oy * dpr);
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
    for (let i = 0; i < this.mood.length; i++) this.mood[i] += (target[i] - this.mood[i]) * Math.min(1, dt * 2.2);
    const [speed, amp0, bright, spread, twist, shimmer, breathe, lean] = this.mood;
    this.clock += dt;
    const amp = amp0 * (1 + breathe * 0.1 * Math.sin(this.clock * 0.9));

    // voice: the real speech envelope while Caden talks (js/voice.js
    // speechTrack), word pulses for the device voice, the mic while listening
    const sp = this.speech ? this.speech() : null;
    const real = sp && typeof sp === 'object' ? sp : null;
    const drive = real ? real.level : Math.max(this.pulse * 0.8, this.state === 'listening' ? this.mic : 0);
    this.voice += (drive - this.voice) * Math.min(1, dt * (real ? 30 : drive > this.voice ? 14 : 5));
    this.bright += ((real ? real.bright : 0.3) - this.bright) * Math.min(1, dt * 10);
    // a syllable starting (the level jumping up) sends a ripple out from the middle
    const lvl = real ? real.level : this.pulse;
    if (lvl - this.prevLevel > 0.12 && (!this.pulses.length || this.pulses[this.pulses.length - 1].age > 0.09) && !reduce()) {
      this.pulses.push({ age: 0, k: Math.min(1, (lvl - this.prevLevel) * 3) });
      if (this.pulses.length > 6) this.pulses.shift();
    }
    this.prevLevel = lvl;
    for (const p of this.pulses) p.age += dt;
    this.pulses = this.pulses.filter((p) => p.age < 1.2);
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

    ctx.clearRect(0, this.oy, W, H - this.oy);
    const alphaK = this.dim;
    if (alphaK < 0.01 && !this.flight) return;
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 70) * this.shakeT * 18 : 0;

    for (let ri = 0; ri < RIBBONS.length; ri++) {
      const base = RIBBONS[ri];
      const v = this.voice;
      const lift = amp;
      const r = { ...base, a1: base.a1 * lift, a2: base.a2 * lift * (1 + v * 0.6), width: base.width * (0.85 + amp * 0.15) };
      const n = this.samples, ph = this.t + this.push, B = this.band;
      const sw = spread * (0.85 + amp * 0.15);
      for (let i = 0; i <= n; i++) {
        const nx = i / n;
        const hump = Math.sin(nx * Math.PI);
        // speech swells the middle with its loudness and rides a travelling
        // ripple whose grain follows the sound (broad vowels, fine s / f / t);
        // each syllable sends a ripple outward from the middle
        const swell = 1 + v * 0.9 * hump;
        const ripple = Math.sin(nx * (5 + this.bright * 11) * TAU - ph * (5 + this.bright * 5)) * v * 0.05 * hump;
        let wake = 0;
        for (const p of this.pulses) {
          const d = Math.abs(nx - 0.5) - p.age * 0.55;
          wake += Math.exp(-d * d * 260) * Math.sin(d * 48) * p.k * (1 - p.age / 1.2) * 0.06;
        }
        this.cy[i] = this.top + B * (r.y - lean) + (Math.sin(nx * r.k1 * TAU + ph * r.w1 + r.p) * r.a1 + Math.sin(nx * r.k2 * TAU - ph * r.w2) * r.a2 + ripple + wake) * B * swell + shake;
        this.hw[i] = B * r.width * sw * swell * Math.sin(nx * r.kt * TAU + ph * r.wt * twist + r.p + 0.9) * (0.35 + 0.65 * hump);
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

      // one gradient per frame: a soft light runs along the strands (shimmer)
      const sh = ((this.clock * (0.18 + shimmer * 0.32)) % 1.6) - 0.3;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      const lo = 0.62 - shimmer * 0.12;
      const stop = (x, a) => grad.addColorStop(Math.max(0, Math.min(1, x)), `rgba(${rgb},${a})`);
      stop(0, lo); stop(sh - 0.18, lo); stop(sh, 1); stop(sh + 0.18, lo); stop(1, lo);
      ctx.strokeStyle = grad;
      const xs = this.xs && this.xs.length === n + 1 ? this.xs : (this.xs = new Float32Array(n + 1));
      for (let i = 0; i <= n; i++) xs[i] = (i / n) * W;
      // a strand as one smooth curve through its points (midpoint quadratics)
      const curve = (a0, a1, yAt) => {
        const i0 = Math.max(0, Math.ceil(a0 * n)), i1 = Math.min(n, Math.floor(a1 * n));
        if (i1 - i0 < 2) return;
        ctx.beginPath();
        ctx.moveTo(xs[i0], yAt(i0));
        for (let i = i0 + 1; i < i1; i++) {
          const y = yAt(i), yn = yAt(i + 1);
          ctx.quadraticCurveTo(xs[i], y, (xs[i] + xs[i + 1]) / 2, (y + yn) / 2);
        }
        ctx.lineTo(xs[i1], yAt(i1));
        ctx.stroke();
      };
      const count = Math.min(base.strands, this.q.strands);
      const glowK = 1 + this.flash * 0.4 + v * 0.5;
      for (let s = 0; s < count; s++) {
        const u = s / (count - 1) - 0.5, edge = Math.pow(Math.abs(u) * 2, 2);
        const [a0, a1] = strandSpan(s);
        if (a1 <= a0) continue;
        // each strand drifts a little against its neighbours: alive, not ruled lines
        const drift = 0.05 * (0.4 + edge), sp2 = ph * 0.7 + s * 0.9;
        ctx.globalAlpha = Math.min(1, base.alpha * (night ? 1 : 1.3) * (0.22 + 0.78 * edge) * glowK * bright) * alphaK;
        ctx.lineWidth = 1;
        curve(a0, a1, (i) => this.cy[i] + (u + Math.sin((i / n) * 3 * TAU + sp2) * drift) * this.hw[i]);
      }
      // high: a soft glowing core gives the bundle depth
      if (this.q.glow) {
        ctx.lineWidth = 6;
        ctx.globalAlpha = (night ? 0.07 : 0.1) * (1 + v * 1.4 + this.flash) * alphaK;
        curve(f ? strandSpan(0)[0] : 0, f ? strandSpan(0)[1] : 1, (i) => this.cy[i]);
      }
      ctx.globalAlpha = 1;
    }

    // soften both ends: one shape, not a strip cut by the screen
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.14, 'rgba(0,0,0,1)'); g.addColorStop(0.86, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, this.oy, W, H - this.oy);
    ctx.restore();

    const fast = this.state === 'thinking' ? 4 : 1;
    const span = f ? sx0g(f, fprog) : null;
    for (let si = 0; si < this.q.sparks; si++) {
      const p = this.sparks[si];
      p.x += (p.v * fast * (still ? 0 : 1) + this.energy * 0.01) * dt;
      if (p.x > 1.02) p.x -= 1.04;
      if (p.x < -0.02) p.x += 1.04;
      if (span && (p.x < span[0] || p.x > span[1])) continue;
      const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * (1.7 * fast) + p.p))) * (night ? 0.8 : 0.9) * alphaK;
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.beginPath();
      ctx.arc(p.x * W, this.top + p.y * this.band + Math.sin(this.t * 0.6 + p.p) * 6, p.r * (1 + this.voice), 0, TAU);
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
