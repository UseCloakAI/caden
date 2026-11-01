// Hands: touch-free navigation from a webcam with hand tracking (MediaPipe
// Gesture Recognizer: 21 hand landmarks + a gesture class per hand, on device).
//
// Events
//   pointer  {x, y, active, pinch, pinchP}   hand → air pointer in 0..1 screen
//            space; pinch = fingers closed (with hysteresis), pinchP = 0..1 how
//            close thumb and index are (drives the cursor ring)
//   gesture  {name, dir?}   'wave' | 'thumbsUp' | 'thumbsDown' | 'swipe' (dir ±1)
//   pose     {hands, main}  landmarks for the preview (mirrored)
//   state    {state}        off | loading | on | denied | error
//
// Mirrored (x = 1 - x), so moving your hand right moves the pointer right.
// Distances are in palm widths, so it behaves the same near or far.
import * as camera from './camera.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// Hand landmark indices
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9, RING_MCP = 13, PINKY_MCP = 17;

class OneEuro {
  constructor(minCutoff = 1.2, beta = 1.2, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff }); this.x = null; }
  static a(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filter(x, t) {
    if (this.x == null) { this.x = x; this.dx = 0; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    this.dx += OneEuro.a(this.dCutoff, dt) * ((x - this.x) / dt - this.dx);
    this.x += OneEuro.a(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
  reset() { this.x = null; }
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const avg = (...ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });

export const TUNE = {
  fps: 30,
  pinchOn: 0.30,        // thumb–index gap / hand size: closed below this…
  pinchOff: 0.45,       // …open again above this (hysteresis)
  pinchFar: 0.75,       // ring starts filling below this
  regionPalms: 7,       // the pointer region is this many palm widths wide…
  regionMin: 0.32, regionMax: 0.72, // …within these fractions of the frame
  holdMs: 450,          // thumbs up/down held this long
  minScore: 0.6,        // gesture classifier confidence
  swipePalms: 3.2,      // swipe: travel this many palm widths…
  swipeMs: 300,         // …within this window
  swipeCooldown: 900,
  waveReversals: 3, waveMs: 1500, waveAmp: 0.55, waveSpeed: 2.5, waveCooldown: 3000,
  lostMs: 300,          // hand gone this long → pointer hides
};

export class Hands extends EventTarget {
  constructor() {
    super();
    this.state = 'off';
    this.running = false;
    this._reset();
  }

  _reset() {
    this.fx = new OneEuro(); this.fy = new OneEuro();
    this.lastSeen = 0;
    this.pointerOn = false;
    this.pinched = false;
    this.track = [];
    this.hold = { name: null, since: 0, fired: false };
    this.lastSwipe = 0; this.lastWave = 0;
    this.main = null; // last driving hand's palm center, to stick to the same hand
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _set(state, err) { this.state = state; this._emit('state', { state, err }); }

  async start() {
    if (this.running) return;
    this.running = true;
    this._set('loading');
    try {
      await camera.acquire('hands');
      if (!this.gr) {
        const { FilesetResolver, GestureRecognizer } = await import(`${LIB}/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
        const make = (delegate) => GestureRecognizer.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        try { this.gr = await make('GPU'); } catch { this.gr = await make('CPU'); }
      }
    } catch (e) {
      this.running = false;
      camera.release('hands');
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
    camera.release('hands');
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
    try { res = this.gr.recognizeForVideo(v, now); } catch { return; }
    const hands = (res.landmarks || []).map((lm, i) => ({
      lm, gesture: res.gestures?.[i]?.[0]?.categoryName || 'None', score: res.gestures?.[i]?.[0]?.score || 0,
    }));
    this.analyze(hands, now);
  }

  // Pure logic. hands: [{lm: 21 landmarks (image space), gesture, score}], t in ms.
  analyze(hands, t) {
    const list = hands.map((h) => this._hand(h)).filter(Boolean);
    // Stick with the hand that was driving; otherwise the biggest (nearest).
    if (this.main && list.length > 1) list.sort((a, b) => d2(a.palm, this.main) - d2(b.palm, this.main));
    else list.sort((a, b) => b.size - a.size);
    const h = list[0] || null;
    this._emit('pose', { hands: list.map((x) => x.pts), main: h ? 0 : -1 });

    if (!h) { this._lost(t); return; }
    this.lastSeen = t;
    this.main = h.palm;

    // Held poses: thumbs up (talk), thumbs down (back). Fire once per hold.
    const pose = h.score >= TUNE.minScore && (h.gesture === 'Thumb_Up' || h.gesture === 'Thumb_Down') ? h.gesture : null;
    if (pose !== this.hold.name) this.hold = { name: pose, since: t, fired: false };
    else if (pose && !this.hold.fired && t - this.hold.since >= TUNE.holdMs) {
      this.hold.fired = true;
      this._emit('gesture', { name: pose === 'Thumb_Up' ? 'thumbsUp' : 'thumbsDown' });
    }

    // A fist rests the pointer (put your hand down without clicking anything).
    if (h.gesture === 'Closed_Fist' && h.score >= TUNE.minScore) { this._hide(); this.track = []; return; }

    // Pinch with hysteresis; pinchP fills the ring as fingers close.
    const gap = d2(h.pts[THUMB_TIP], h.pts[INDEX_TIP]) / h.size;
    if (!this.pinched && gap < TUNE.pinchOn) this.pinched = true;
    else if (this.pinched && gap > TUNE.pinchOff) this.pinched = false;
    const pinchP = this.pinched ? 1 : Math.max(0, Math.min(1, (TUNE.pinchFar - gap) / (TUNE.pinchFar - TUNE.pinchOn)));

    // Pointer: the index knuckle, which barely moves when you pinch (the
    // fingertip does, and would drag the cursor off the button).
    const p = avg(h.pts[INDEX_MCP], h.pts[INDEX_MCP], h.pts[MIDDLE_MCP]);
    const w = Math.min(TUNE.regionMax, Math.max(TUNE.regionMin, TUNE.regionPalms * h.palmW));
    const hgt = w * 0.75;
    const cx = 0.5, cy = 0.45;
    const nx = Math.min(1, Math.max(0, (p.x - (cx - w / 2)) / w));
    const ny = Math.min(1, Math.max(0, (p.y - (cy - hgt / 2)) / hgt));
    const ts = t / 1000;
    if (!this.pointerOn) { this.fx.reset(); this.fy.reset(); }
    this.pointerOn = true;
    this._emit('pointer', { x: this.fx.filter(nx, ts), y: this.fy.filter(ny, ts), active: true, pinch: this.pinched, pinchP });

    // Path in palm widths, for waves and swipes (not while pinching: that's a drag).
    if (this.pinched || pose) { this.track = []; return; }
    this.track.push({ t, x: h.palm.x / h.palmW, y: h.palm.y / h.palmW, open: h.gesture === 'Open_Palm' });
    const keep = Math.max(TUNE.waveMs, TUNE.swipeMs) + 100;
    while (this.track.length && t - this.track[0].t > keep) this.track.shift();
    if (this._wave(t)) return;
    this._swipe(t);
  }

  _hide() {
    if (!this.pointerOn) return;
    this.pointerOn = false;
    this.pinched = false;
    this._emit('pointer', { active: false });
  }

  _lost(t) {
    if (t - this.lastSeen > TUNE.lostMs) { this._hide(); this.main = null; this.track = []; this.hold = { name: null, since: 0, fired: false }; }
  }

  _swipe(t) {
    if (t - this.lastSwipe < TUNE.swipeCooldown || t - this.lastWave < 800) return;
    const win = this.track.filter((s) => t - s.t <= TUNE.swipeMs);
    if (win.length < 3) return;
    const a = win[0], b = win[win.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    let back = 0;
    for (let i = 1; i < win.length; i++) if (Math.sign(win[i].x - win[i - 1].x) === -Math.sign(dx) && Math.abs(win[i].x - win[i - 1].x) > 0.1) back++;
    if (Math.abs(dx) >= TUNE.swipePalms && Math.abs(dy) < Math.abs(dx) * 0.5 && back <= 1) {
      this.lastSwipe = t;
      this.track = [];
      this._emit('gesture', { name: 'swipe', dir: Math.sign(dx) });
    }
  }

  _wave(t) {
    if (t - this.lastWave < TUNE.waveCooldown) return false;
    const win = this.track.filter((s) => t - s.t <= TUNE.waveMs);
    if (win.length < 8) return false;
    // A wave is an open hand: most of the window should be classified Open_Palm.
    if (win.filter((s) => s.open).length < win.length * 0.5) return false;
    let dir = 0, from = win[0].x, reversals = 0, path = 0;
    for (let i = 1; i < win.length; i++) {
      const d = win[i].x - win[i - 1].x;
      path += Math.abs(d);
      if (Math.abs(d) < 0.03) continue;
      const s = Math.sign(d);
      if (dir && s !== dir) {
        if (Math.abs(win[i - 1].x - from) >= TUNE.waveAmp) reversals++;
        from = win[i - 1].x;
      }
      dir = s;
    }
    const speed = path / ((win[win.length - 1].t - win[0].t) / 1000 || 1);
    if (reversals >= TUNE.waveReversals && speed >= TUNE.waveSpeed) {
      this.lastWave = t;
      this.track = [];
      this._emit('gesture', { name: 'wave' });
      return true;
    }
    return false;
  }

  _hand({ lm, gesture, score }) {
    if (!lm || lm.length < 21) return null;
    const pts = lm.map((p) => ({ x: 1 - p.x, y: p.y }));
    const size = d2(pts[WRIST], pts[MIDDLE_MCP]);          // wrist → middle knuckle
    const palmW = d2(pts[INDEX_MCP], pts[PINKY_MCP]) || size * 0.8;
    if (size < 0.02) return null;
    const palm = avg(pts[WRIST], pts[INDEX_MCP], pts[MIDDLE_MCP], pts[RING_MCP], pts[PINKY_MCP]);
    return { pts, size, palmW, palm, gesture, score };
  }
}
