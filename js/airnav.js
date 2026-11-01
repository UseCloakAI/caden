// AirNav: the on-screen side of touch-free display mode (hand tracking).
//   - an air cursor that follows your hand (hands.js 'pointer')
//   - pinch to press: the cursor's ring fills as thumb and index close, and
//     the press lands when they touch (on release, so a drag can cancel it)
//   - pinch and drag up/down to scroll, like a finger on a phone
//   - the cursor snaps to the nearest control within reach (magnet)
//   - a gesture guide and a small hand preview, drawn from landmarks, never
//     from the camera image
// No external links or downloads: on a kiosk there'd be no way back without touch.
const TARGETS = 'button:not([disabled]), a[href]:not([target="_blank"]):not([download]), [role="button"], [role="tab"], label.line, .chip';
const MAGNET_PX = 64;
const DRAG_PX = 18;     // pinch moving more than this is a scroll, not a press
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hand skeleton (MediaPipe hand landmark connections)
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export class AirNav {
  constructor() {
    this.on = false;
    this.cursor = el('div', 'air-cursor', '<i class="air-ring"></i><i class="air-dot"></i>');
    this.guide = el('div', 'air-guide', `
      <span data-g="point"><i class="ph ph-hand" aria-hidden="true"></i>Point with your hand</span>
      <span data-g="press"><i class="ph ph-hand-tap" aria-hidden="true"></i>Pinch to press</span>
      <span data-g="scroll"><i class="ph ph-hand-grabbing" aria-hidden="true"></i>Pinch and drag to scroll</span>
      <span data-g="wave"><i class="ph ph-hand-waving" aria-hidden="true"></i>Wave to call me</span>
      <span data-g="thumbsUp"><i class="ph ph-thumbs-up" aria-hidden="true"></i>Thumbs up to talk</span>
      <span data-g="thumbsDown"><i class="ph ph-thumbs-down" aria-hidden="true"></i>Thumbs down: back</span>`);
    this.pip = el('canvas', 'air-pip');
    this.pip.width = 168; this.pip.height = 126;
    this.pip.setAttribute('aria-hidden', 'true');
    this.live = el('div', 'sr', '');
    this.live.setAttribute('aria-live', 'polite');
    for (const n of [this.cursor, this.guide, this.pip, this.live]) { n.hidden = true; document.body.appendChild(n); }
    this.x = innerWidth / 2; this.y = innerHeight / 2;
    this.active = false;
    this.target = null;
    this.grab = null; // {target, x, y, scroller, top, dragging}
    this._tick = this._tick.bind(this);
  }

  enable(on) {
    if (this.on === on) return;
    this.on = on;
    document.documentElement.classList.toggle('display', on);
    this.guide.hidden = this.pip.hidden = this.live.hidden = !on;
    if (on) { this.last = performance.now(); this.raf = requestAnimationFrame(this._tick); }
    else { cancelAnimationFrame(this.raf); this.pointer({ active: false }); this.cursor.hidden = true; }
  }

  pointer({ x, y, active, pinch = false, pinchP = 0 }) {
    if (!this.on) return;
    if (!active) {
      if (this.active) {
        this.active = false;
        this.grab = null;
        this.cursor.classList.remove('show', 'pinched', 'dragging');
        this._hover(null);
        document.documentElement.classList.remove('air-pointing');
      }
      return;
    }
    const m = 0.03; // margin so screen edges are easy to reach
    this.tx = Math.min(innerWidth - 4, Math.max(4, ((x - m) / (1 - 2 * m)) * innerWidth));
    this.ty = Math.min(innerHeight - 4, Math.max(4, ((y - m) / (1 - 2 * m)) * innerHeight));
    if (!this.active) {
      this.active = true;
      this.x = this.tx; this.y = this.ty;
      this.cursor.hidden = false;
      void this.cursor.offsetWidth;
      this.cursor.classList.add('show');
      document.documentElement.classList.add('air-pointing');
    }
    this._ring(pinchP);
    if (pinch && !this.grab) this._down();
    else if (!pinch && this.grab) this._up();
  }

  // Gesture feedback: light up the matching guide chip.
  flash(name, text) {
    const g = this.guide.querySelector(`[data-g="${name}"]`);
    if (g) { g.classList.remove('hit'); void g.offsetWidth; g.classList.add('hit'); }
    if (text) this.live.textContent = text;
  }

  // Swipe: switch tabs in an open sheet.
  swipe(dir) {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    if (!tabs.length) return false;
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + dir))];
    if (next && next !== tabs[i]) { next.click(); this.flash('press', next.textContent.trim()); return true; }
    return false;
  }

  pose({ hands, main }) {
    if (!this.on) return;
    const c = this.pip.getContext('2d');
    const W = this.pip.width, H = this.pip.height;
    c.clearRect(0, 0, W, H);
    this.pip.classList.toggle('empty', !hands.length);
    const coral = getComputedStyle(document.documentElement).getPropertyValue('--coral').trim() || '#FF7A59';
    hands.forEach((pts, i) => {
      const lead = i === main;
      // fit the hand into the preview, whatever its size in the frame
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const bx = Math.min(...xs), by = Math.min(...ys);
      const s = Math.min((W - 24) / (Math.max(...xs) - bx || 1), (H - 24) / (Math.max(...ys) - by || 1)) * (lead ? 1 : 0.6);
      const ox = lead ? (W - (Math.max(...xs) - bx) * s) / 2 : W - (Math.max(...xs) - bx) * s - 6;
      const oy = (H - (Math.max(...ys) - by) * s) / 2;
      const P = (p) => [ox + (p.x - bx) * s, oy + (p.y - by) * s];
      c.strokeStyle = lead ? coral : 'rgba(150,140,160,.45)';
      c.lineWidth = lead ? 3 : 2;
      c.lineCap = 'round';
      for (const [a, b] of BONES) { c.beginPath(); c.moveTo(...P(pts[a])); c.lineTo(...P(pts[b])); c.stroke(); }
      if (lead) {
        c.fillStyle = coral;
        for (const k of [4, 8]) { const [px, py] = P(pts[k]); c.beginPath(); c.arc(px, py, this.grab ? 5 : 3.5, 0, Math.PI * 2); c.fill(); }
      }
    });
  }

  _down() {
    const target = this.target;
    const scroller = this._scroller(this.x, this.y);
    this.grab = { target, x: this.x, y: this.y, scroller, top: scroller?.scrollTop || 0, dragging: false };
    this.cursor.classList.add('pinched');
  }

  _up() {
    const g = this.grab;
    this.grab = null;
    this.cursor.classList.remove('pinched', 'dragging');
    if (!g || g.dragging) { if (g?.dragging) this.flash('scroll'); return; }
    if (g.target && g.target === this.target) this._press(g.target);
  }

  _tick(now) {
    this.raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;

    // While pinched: either a press in progress (cursor holds still on the
    // target) or a drag (scroll the list under where the pinch started).
    if (this.grab) {
      const g = this.grab;
      const dy = this.ty - g.y;
      if (!g.dragging && Math.hypot(this.tx - g.x, dy) > DRAG_PX) {
        g.dragging = true;
        this._hover(null);
        this.cursor.classList.add('dragging');
      }
      if (g.dragging) {
        if (g.scroller) g.scroller.scrollTop = g.top - dy * 1.6;
        this.x = this.tx; this.y = this.ty;
        this.cursor.style.translate = `${this.x}px ${this.y}px`;
        return;
      }
      // press pending: keep the cursor locked to where the pinch started
      this.cursor.style.translate = `${this.x}px ${this.y}px`;
      return;
    }

    const hit = this._find(this.tx, this.ty);
    let gx = this.tx, gy = this.ty;
    if (hit?.near) {
      const r = hit.el.getBoundingClientRect();
      gx = this.tx + (r.left + r.width / 2 - this.tx) * 0.35;
      gy = this.ty + (r.top + r.height / 2 - this.ty) * 0.35;
    }
    const k = reduce() ? 1 : 1 - Math.exp(-dt * 24);
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this.cursor.style.translate = `${this.x}px ${this.y}px`;
    this._hover(hit?.el || null);
  }

  _press(target) {
    this.flash('press');
    this.cursor.classList.remove('pop'); void this.cursor.offsetWidth; this.cursor.classList.add('pop');
    target.classList.remove('air-pressed'); void target.offsetWidth; target.classList.add('air-pressed');
    const label = target.getAttribute('aria-label') || target.textContent.trim().slice(0, 40);
    this.live.textContent = label ? `Pressed ${label}` : 'Pressed';
    target.click();
  }

  _ring(p) { this.cursor.style.setProperty('--p', p.toFixed(3)); this.cursor.classList.toggle('dwell', p > 0.05); }

  _hover(target) {
    if (this.target === target) return;
    this.target?.classList.remove('air-hover');
    this.target = target;
    target?.classList.add('air-hover');
  }

  _find(x, y) {
    const under = document.elementFromPoint(x, y)?.closest(TARGETS);
    if (under && visible(under)) return { el: under, near: false };
    let best = null, bd = MAGNET_PX;
    for (const n of document.querySelectorAll(TARGETS)) {
      if (!visible(n)) continue;
      const r = n.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { el: best, near: true } : null;
  }

  _scroller(x, y) {
    let n = document.elementFromPoint(x, y);
    while (n && n !== document.body) {
      if (n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n;
      n = n.parentElement;
    }
    return null;
  }
}

function el(tag, cls, html) { const n = document.createElement(tag); n.className = cls; if (html) n.innerHTML = html; return n; }
function visible(n) {
  if (n.closest('[hidden]') || n.closest('.cam-hidden')) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return false;
  const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(cx, cy);
  return !top || n.contains(top) || top.contains(n);
}
