// AirNav: the on-screen side of touch-free display mode.
//   - an air cursor that follows the raised hand (body.js 'pointer')
//   - hover a control and hold still to press it: a ring fills (dwell)
//   - the cursor snaps to the nearest control within reach (magnet)
//   - hover near the top/bottom edge of a scrolling list to scroll it
//   - a gesture guide, and a small stick-figure preview so people can see
//     they're being tracked (drawn from landmarks, never the camera image)
// No external links or downloads: on a kiosk there'd be no way back without touch.
const TARGETS = 'button:not([disabled]), a[href]:not([target="_blank"]):not([download]), [role="button"], [role="tab"], label.line, .chip';
const DWELL_MS = 900;
const MAGNET_PX = 64;
const EDGE_PX = 72;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Skeleton edges (pose landmark indices)
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [15, 19], [16, 20]];

export class AirNav {
  constructor() {
    this.on = false;
    this.cursor = el('div', 'air-cursor', '<i class="air-ring"></i><i class="air-dot"></i>');
    this.guide = el('div', 'air-guide', `
      <span data-g="point"><i class="ph ph-hand-pointing" aria-hidden="true"></i>Raise a hand to point</span>
      <span data-g="press"><i class="ph ph-timer" aria-hidden="true"></i>Hold still to press</span>
      <span data-g="wave"><i class="ph ph-hand-waving" aria-hidden="true"></i>Wave to call Caden</span>
      <span data-g="handsUp"><i class="ph ph-person-arms-spread" aria-hidden="true"></i>Both hands up to talk</span>
      <span data-g="swipe"><i class="ph ph-arrows-left-right" aria-hidden="true"></i>Swipe to switch tabs</span>`);
    this.pip = el('canvas', 'air-pip');
    this.pip.width = 168; this.pip.height = 126;
    this.pip.setAttribute('aria-hidden', 'true');
    this.live = el('div', 'sr', '');
    this.live.setAttribute('aria-live', 'polite');
    for (const n of [this.cursor, this.guide, this.pip, this.live]) { n.hidden = true; document.body.appendChild(n); }
    this.x = innerWidth / 2; this.y = innerHeight / 2;
    this.active = false;
    this.target = null; this.since = 0; this.pressed = null;
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

  pointer({ x, y, active }) {
    if (!this.on) return;
    if (!active) {
      if (this.active) {
        this.active = false;
        this.cursor.classList.remove('show');
        this._hover(null);
        document.documentElement.classList.remove('air-pointing');
      }
      return;
    }
    // A margin so the edges of the screen are easy to reach.
    const m = 0.04;
    this.tx = ((x - m) / (1 - 2 * m)) * innerWidth;
    this.ty = ((y - m) / (1 - 2 * m)) * innerHeight;
    this.tx = Math.min(innerWidth - 4, Math.max(4, this.tx));
    this.ty = Math.min(innerHeight - 4, Math.max(4, this.ty));
    if (!this.active) {
      this.active = true;
      this.x = this.tx; this.y = this.ty;
      this.cursor.hidden = false;
      void this.cursor.offsetWidth;
      this.cursor.classList.add('show');
      document.documentElement.classList.add('air-pointing');
    }
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
    if (next && next !== tabs[i]) { next.click(); this.flash('swipe', next.textContent.trim()); return true; }
    return false;
  }

  pose({ people, main }) {
    if (!this.on) return;
    const c = this.pip.getContext('2d');
    const W = this.pip.width, H = this.pip.height;
    c.clearRect(0, 0, W, H);
    this.pip.classList.toggle('empty', !people.length);
    const css = getComputedStyle(document.documentElement);
    people.forEach((pts, i) => {
      const lead = i === main;
      c.strokeStyle = lead ? css.getPropertyValue('--coral').trim() || '#FF7A59' : 'rgba(150,140,160,.45)';
      c.lineWidth = lead ? 4 : 2.5;
      c.lineCap = 'round';
      for (const [a, b] of BONES) {
        const p = pts[a], q = pts[b];
        if (!p || !q || (p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
        c.beginPath(); c.moveTo(p.x * W, p.y * H); c.lineTo(q.x * W, q.y * H); c.stroke();
      }
      const n = pts[0];
      if (n && (n.visibility ?? 1) > 0.4) {
        const r = Math.max(6, Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y) * W * 0.32);
        c.beginPath(); c.arc(n.x * W, n.y * H, r, 0, Math.PI * 2); c.stroke();
      }
    });
  }

  _tick(now) {
    this.raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;

    // Find the control under (or near) the hand, and pull the cursor to it.
    const hit = this._find(this.tx, this.ty);
    let gx = this.tx, gy = this.ty;
    if (hit?.near) {
      const r = hit.el.getBoundingClientRect();
      gx = this.tx + (r.left + r.width / 2 - this.tx) * 0.35;
      gy = this.ty + (r.top + r.height / 2 - this.ty) * 0.35;
    }
    const k = reduce() ? 1 : 1 - Math.exp(-dt * 22);
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this.cursor.style.translate = `${this.x}px ${this.y}px`;

    // Edge scroll inside a scrolling panel; no presses while scrolling.
    const sc = this._scroller(this.x, this.y);
    if (sc) {
      const r = sc.getBoundingClientRect();
      const top = this.y - r.top, bottom = r.bottom - this.y;
      const v = top < EDGE_PX ? -(1 - top / EDGE_PX) : bottom < EDGE_PX ? 1 - bottom / EDGE_PX : 0;
      if (v && ((v < 0 && sc.scrollTop > 0) || (v > 0 && sc.scrollTop + sc.clientHeight < sc.scrollHeight))) {
        sc.scrollTop += v * 900 * dt;
        this.cursor.dataset.scroll = v < 0 ? 'up' : 'down';
        this._hover(null);
        this._ring(0);
        return;
      }
    }
    delete this.cursor.dataset.scroll;

    const target = hit?.el || null;
    if (target !== this.target) {
      this._hover(target);
      this.since = now;
      if (target !== this.pressed) this.pressed = null; // leaving re-arms it
    }
    if (!target || target === this.pressed) { this._ring(0); return; }
    const p = Math.min(1, (now - this.since) / DWELL_MS);
    this._ring(p);
    if (p >= 1) this._press(target);
  }

  _press(target) {
    this.pressed = target;
    this._ring(0);
    this.flash('press');
    this.cursor.classList.remove('pop'); void this.cursor.offsetWidth; this.cursor.classList.add('pop');
    target.classList.remove('air-pressed'); void target.offsetWidth; target.classList.add('air-pressed');
    const label = target.getAttribute('aria-label') || target.textContent.trim().slice(0, 40);
    this.live.textContent = label ? `Pressed ${label}` : 'Pressed';
    target.click();
  }

  _ring(p) { this.cursor.style.setProperty('--p', p.toFixed(3)); this.cursor.classList.toggle('dwell', p > 0); }

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
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
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
  // Covered by something else (e.g. the scrim behind a sheet)?
  const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(cx, cy);
  return !top || n.contains(top) || top.contains(n);
}
