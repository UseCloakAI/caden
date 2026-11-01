// Body: touch-free navigation from a webcam, using full-body pose (MediaPipe
// Pose Landmarker, on device). Pose rather than hand tracking because a home
// display is used from across the room, where hands are a few pixels wide but
// arms are still easy to see.
//
// Events
//   pointer  {x, y, active}   raised hand → an air pointer in 0..1 screen space
//   gesture  {name, dir?}     'wave' | 'handsUp' | 'swipe' (dir -1 left / 1 right)
//   pose     {people, main}   landmarks for the skeleton preview (mirrored)
//   state    {state}          off | loading | on | denied | error
//
// Coordinates are mirrored (x = 1 - x) so the user's right hand moves the
// pointer right, like a mirror. Everything is scaled by shoulder width, so the
// same motion works close to the screen or from the couch.
import * as camera from './camera.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Pose landmark indices
const NOSE = 0, LSH = 11, RSH = 12, LEL = 13, REL = 14, LWR = 15, RWR = 16, LIX = 19, RIX = 20;

// One Euro filter: smooth when still, responsive when moving.
class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.9, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff }); this.x = null; }
  static a(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filter(x, t) {
    if (this.x == null) { this.x = x; this.dx = 0; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.a(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cutoff, dt) * (x - this.x);
    return this.x;
  }
  reset() { this.x = null; }
}

const vis = (p, min = 0.5) => p && (p.visibility ?? 1) >= min;
const mirror = (p) => p && { x: 1 - p.x, y: p.y, visibility: p.visibility };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const TUNE = {
  fps: 24,
  handsUpMs: 600,        // both hands above the head this long → talk
  swipeSw: 1.1,          // swipe: travel at least this many shoulder widths…
  swipeMs: 320,          // …within this window
  swipeCooldown: 900,
  waveReversals: 3,      // wave: this many direction changes…
  waveMs: 1500,          // …within this window
  waveAmp: 0.22,         // each swing at least this many shoulder widths
  waveCooldown: 3000,
  dropMs: 260,           // hand down this long → pointer hides
};

export class Body extends EventTarget {
  constructor() {
    super();
    this.state = 'off';
    this.running = false;
    this._reset();
  }

  _reset() {
    this.fx = new OneEuro(); this.fy = new OneEuro();
    this.hand = null;          // 'L' | 'R' (mirrored screen side)
    this.lastRaised = 0;
    this.track = [];           // [{t, x, y}] hand path in shoulder widths
    this.upSince = 0; this.upFired = false;
    this.lastSwipe = 0; this.lastWave = 0;
    this.pointerOn = false;
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _set(state, err) { this.state = state; this._emit('state', { state, err }); }

  async start() {
    if (this.running) return;
    this.running = true;
    this._set('loading');
    try {
      await camera.acquire('body');
      if (!this.lm) {
        const { FilesetResolver, PoseLandmarker } = await import(`${LIB}/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
        const make = (delegate) => PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO', numPoses: 3,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        try { this.lm = await make('GPU'); } catch { this.lm = await make('CPU'); }
      }
    } catch (e) {
      this.running = false;
      camera.release('body');
      this._set(e?.name === 'NotAllowedError' ? 'denied' : 'error', e?.message || String(e));
      return;
    }
    if (!this.running) return;
    this._reset();
    this._set('on');
    this._loop();
  }

  stop() {
    const was = this.running;
    this.running = false;
    cancelAnimationFrame(this.raf);
    camera.release('body');
    if (was) { this._emit('pointer', { active: false }); this._set('off'); }
  }

  _loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this._loop());
    const v = camera.video();
    const now = performance.now();
    if (now - (this.lastRun || 0) < 1000 / TUNE.fps) return;
    if (!v || v.readyState < 2 || document.visibilityState !== 'visible') return;
    this.lastRun = now;
    let res;
    try { res = this.lm.detectForVideo(v, now); } catch { return; }
    this.analyze(res.landmarks || [], now);
  }

  // Pure gesture logic: landmarks for each person (image space) + time in ms.
  analyze(people, t) {
    const bodies = people.map((lm) => this._body(lm)).filter(Boolean);
    // Who's driving: someone with a hand up, nearest first; else the nearest person.
    bodies.sort((a, b) => (b.raised.length ? 1 : 0) - (a.raised.length ? 1 : 0) || b.sw - a.sw);
    const me = bodies[0] || null;
    this._emit('pose', { people: bodies.map((b) => b.pts), main: me ? 0 : -1 });

    if (!me) { this._drop(t); this.upSince = 0; this.upFired = false; return; }

    // Both hands above the head → talk (fires once per raise).
    const handsUp = me.L.up && me.R.up && me.L.wr.y < me.nose.y && me.R.wr.y < me.nose.y;
    if (handsUp) {
      this.upSince ||= t;
      if (!this.upFired && t - this.upSince >= TUNE.handsUpMs) {
        this.upFired = true;
        this._emit('gesture', { name: 'handsUp' });
      }
      this._drop(t, true);
      return;
    }
    if (!me.L.up && !me.R.up) { this.upSince = 0; this.upFired = false; }
    else this.upSince = 0;

    // Active hand: keep the current one while it stays up (hysteresis).
    if (!(this.hand && me[this.hand].up)) {
      const next = me.raised.sort((a, b) => me[a].wr.y - me[b].wr.y)[0] || null;
      if (next !== this.hand) { this.fx.reset(); this.fy.reset(); this.track = []; }
      this.hand = next;
    }
    if (!this.hand) { this._drop(t); return; }
    this.lastRaised = t;

    const arm = me[this.hand];
    const side = this.hand === 'R' ? 1 : -1;
    const p = arm.ix && vis(arm.ix, 0.4)
      ? { x: arm.wr.x * 0.35 + arm.ix.x * 0.65, y: arm.wr.y * 0.35 + arm.ix.y * 0.65 }
      : arm.wr;

    // Map a comfortable box beside the shoulder to the whole screen, so small
    // arm movements reach every corner.
    const w = 2.0 * me.sw, h = 1.4 * me.sw;
    const cx = arm.sh.x + side * 0.6 * me.sw, cy = arm.sh.y - 0.55 * me.sw;
    const nx = Math.min(1, Math.max(0, (p.x - (cx - w / 2)) / w));
    const ny = Math.min(1, Math.max(0, (p.y - (cy - h / 2)) / h));
    const ts = t / 1000;
    this.pointerOn = true;
    this._emit('pointer', { x: this.fx.filter(nx, ts), y: this.fy.filter(ny, ts), active: true, hand: this.hand });

    // Hand path in shoulder widths, for swipes and waves.
    this.track.push({ t, x: p.x / me.sw, y: p.y / me.sw, above: arm.wr.y < arm.el.y });
    const keep = Math.max(TUNE.waveMs, TUNE.swipeMs) + 100;
    while (this.track.length && t - this.track[0].t > keep) this.track.shift();
    if (this._wave(t)) return;
    this._swipe(t);
  }

  _drop(t, now = false) {
    if (this.pointerOn && (now || t - this.lastRaised > TUNE.dropMs)) {
      this.pointerOn = false;
      this.hand = null;
      this.track = [];
      this.fx.reset(); this.fy.reset();
      this._emit('pointer', { active: false });
    }
  }

  _swipe(t) {
    if (t - this.lastSwipe < TUNE.swipeCooldown || t - this.lastWave < 800) return;
    const win = this.track.filter((s) => t - s.t <= TUNE.swipeMs);
    if (win.length < 3) return;
    const a = win[0], b = win[win.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    // one direction only: no turning back inside the window
    let back = 0;
    for (let i = 1; i < win.length; i++) if (Math.sign(win[i].x - win[i - 1].x) === -Math.sign(dx) && Math.abs(win[i].x - win[i - 1].x) > 0.03) back++;
    if (Math.abs(dx) >= TUNE.swipeSw && Math.abs(dy) < Math.abs(dx) * 0.5 && back <= 1) {
      this.lastSwipe = t;
      this.track = [];
      this._emit('gesture', { name: 'swipe', dir: Math.sign(dx) });
    }
  }

  _wave(t) {
    if (t - this.lastWave < TUNE.waveCooldown) return false;
    const win = this.track.filter((s) => t - s.t <= TUNE.waveMs && s.above);
    if (win.length < 6) return false;
    // count direction reversals with a minimum swing between them
    let dir = 0, from = win[0].x, reversals = 0, travel = 0;
    for (let i = 1; i < win.length; i++) {
      const d = win[i].x - win[i - 1].x;
      if (Math.abs(d) < 0.01) continue;
      const s = Math.sign(d);
      if (dir && s !== dir) {
        if (Math.abs(win[i - 1].x - from) >= TUNE.waveAmp) { reversals++; travel += Math.abs(win[i - 1].x - from); }
        from = win[i - 1].x;
      }
      dir = s;
    }
    const span = Math.max(...win.map((s) => s.x)) - Math.min(...win.map((s) => s.x));
    if (reversals >= TUNE.waveReversals && span < 1.6) {
      this.lastWave = t;
      this.track = [];
      this._emit('gesture', { name: 'wave' });
      return true;
    }
    return false;
  }

  // One person, mirrored, with arms labelled by screen side.
  _body(lm) {
    const m = lm.map(mirror);
    // After mirroring, the user's right arm (12/14/16/20) is on screen right.
    const R = { sh: m[RSH], el: m[REL], wr: m[RWR], ix: m[RIX] };
    const L = { sh: m[LSH], el: m[LEL], wr: m[LWR], ix: m[LIX] };
    if (!vis(R.sh, 0.4) || !vis(L.sh, 0.4)) return null;
    const sw = dist(R.sh, L.sh);
    if (sw < 0.03) return null;
    for (const a of [L, R]) {
      a.up = vis(a.wr) && vis(a.el, 0.3) && a.wr.y < a.el.y - 0.08 * sw && a.wr.y < a.sh.y + 0.25 * sw;
    }
    const raised = ['L', 'R'].filter((k) => (k === 'L' ? L : R).up);
    return { L, R, sw, nose: m[NOSE], raised, pts: m };
  }
}
