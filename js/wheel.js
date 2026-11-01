// Wheel: Caden's options. One button in the top-left corner; pressing it
// unfurls a ring of options around that corner (Ribbon's orbit: a spring with
// ~2% overshoot, nodes that trail when it spins fast, rubber-banded ends).
// The option at the 45° slot is selected: full ink, slightly larger.
//
// Turn it any way you like: drag along it (with a flick it keeps going),
// mouse wheel / trackpad, arrow keys, or swipe a hand in the air. Tap or pinch
// any option to open it; Enter opens the selected one; Esc, the button again,
// a tap outside, or a thumbs down closes it.
import { sfx } from './sfx.js';

const STEP = 21;          // degrees between options
const SLOT = 45;          // the selection slot (degrees from the x axis, clockwise)
const SPRING = { k: 200, c: 25 }; // Ribbon's orbit spring
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = (d) => (d * Math.PI) / 180;

export class Wheel {
  // items: [{id, icon, label, run()}]
  constructor(button, items) {
    this.btn = button;
    this.items = items;
    this.open = false;
    this.index = 0; this.pos = 0; this.vel = 0; this.target = 0;
    this.root = document.createElement('div');
    this.root.className = 'wheel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-label', 'Options');
    this.root.innerHTML = '<div class="wheel-scrim" data-close></div><svg class="wheel-track" aria-hidden="true"><circle></circle></svg><div class="wheel-ring"></div>';
    document.body.appendChild(this.root);
    this.ring = this.root.querySelector('.wheel-ring');
    this.track = this.root.querySelector('.wheel-track circle');
    this.nodes = items.map((it, i) => {
      const b = document.createElement('button');
      b.className = 'wheel-item';
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.i = i;
      b.innerHTML = `<span class="wheel-icon"><i class="ph ph-${it.icon}" aria-hidden="true"></i></span><span class="wheel-label">${it.label}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.dragged) return; this.choose(i); });
      this.ring.appendChild(b);
      return b;
    });
    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    button.addEventListener('click', () => (this.open ? this.close() : this.show()));
    this._wire();
    this._tick = this._tick.bind(this);
  }

  get radius() { return Math.max(170, Math.min(330, Math.min(innerWidth, innerHeight) * 0.42)); }

  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.btn.classList.add('is-open');
    // unfurl: start wound back two steps, spring into place
    this.pos = this.index - 2.4; this.vel = 0; this.target = this.index;
    this.openedAt = performance.now();
    this.root.classList.remove('closing');
    void this.root.offsetWidth;
    this.root.classList.add('opening');
    sfx.play('enter');
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
    setTimeout(() => this.nodes[this.index]?.focus({ preventScroll: true }), 60);
  }

  close(silent = false) {
    if (!this.open) return;
    this.open = false;
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.classList.remove('is-open');
    this.root.classList.remove('opening');
    this.root.classList.add('closing');
    if (!silent) sfx.play('back');
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (!this.open) { this.root.hidden = true; cancelAnimationFrame(this.raf); } }, reduce() ? 0 : 320);
  }

  // Move the selection by n steps (rubber-bands and thocks at the ends).
  step(n) {
    if (!this.open) return;
    const next = this.index + n;
    if (next < 0 || next >= this.items.length) {
      sfx.play('bump');
      this.vel += n * 9; // stretch past the end, spring back
      return;
    }
    this.index = next;
    this.target = next;
    sfx.play('tick', { dir: n });
    this._mark();
  }

  choose(i = this.index) {
    const it = this.items[i];
    if (!it) return;
    this.index = i; this.target = i; this._mark();
    sfx.play('select');
    const node = this.nodes[i];
    node.classList.remove('chosen'); void node.offsetWidth; node.classList.add('chosen');
    setTimeout(() => { this.close(true); it.run(); }, reduce() ? 0 : 220);
  }

  _mark() {
    this.nodes.forEach((n, i) => n.setAttribute('aria-current', String(i === this.index)));
  }

  _wire() {
    // drag along the ring (touch, pen, mouse): angle around the corner → steps
    let drag = null;
    const angleAt = (x, y) => (Math.atan2(y - this.cy, x - this.cx) * 180) / Math.PI;
    this.ring.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      drag = { id: e.pointerId, a0: angleAt(e.clientX, e.clientY), p0: this.pos, last: performance.now(), lastA: angleAt(e.clientX, e.clientY), v: 0, moved: 0 };
      this.dragged = false;
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const a = angleAt(e.clientX, e.clientY), now = performance.now();
      const da = a - drag.a0;
      drag.moved = Math.max(drag.moved, Math.abs(da));
      if (drag.moved > 4) { this.dragged = true; this.ring.setPointerCapture?.(e.pointerId); }
      if (!this.dragged) return;
      // dragging clockwise (down the arc) brings later options up
      const p = drag.p0 - da / STEP;
      const lo = -0.35, hi = this.items.length - 0.65;
      this.pos = p < lo ? lo - (lo - p) * 0.3 : p > hi ? hi + (p - hi) * 0.3 : p; // rubber band
      const want = Math.round(Math.max(0, Math.min(this.items.length - 1, this.pos)));
      if (want !== this.index) { sfx.play('tick', { dir: want > this.index ? 1 : -1 }); this.index = want; this._mark(); }
      const dt = Math.max(1, now - drag.last);
      drag.v = (-(a - drag.lastA) / STEP) / (dt / 1000);
      drag.last = now; drag.lastA = a;
      this.vel = 0; this.target = this.pos;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (this.dragged) {
        // a flick keeps going a little, then lands on the nearest option
        const fling = Math.max(-3, Math.min(3, drag.v * 0.18));
        const land = Math.round(Math.max(0, Math.min(this.items.length - 1, this.pos + fling)));
        if (land !== this.index) sfx.play('tick', { dir: land > this.index ? 1 : -1 });
        if (this.pos < 0 || this.pos > this.items.length - 1) sfx.play('bump');
        this.index = land; this.target = land; this._mark();
        setTimeout(() => (this.dragged = false), 0);
      }
      drag = null;
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);

    // mouse wheel / trackpad: one option per notch, smoothed for trackpads
    let acc = 0, lastWheel = 0;
    this.root.addEventListener('wheel', (e) => {
      if (!this.open) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel > 250) acc = 0;
      lastWheel = now;
      acc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const notch = e.deltaMode === 1 ? 1 : 50;
      while (Math.abs(acc) >= notch) { this.step(Math.sign(acc)); acc -= Math.sign(acc) * notch; }
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); this.step(1); }
      else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); this.step(-1); }
      else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement?.closest?.('.wheel-item')) return; e.preventDefault(); this.choose(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); this.btn.focus(); }
    });
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.open && this.root.hidden) return;
    // spring toward the target (Ribbon's orbit spring)
    if (reduce()) { this.pos = this.target; this.vel = 0; }
    else {
      const f = -SPRING.k * (this.pos - this.target) - SPRING.c * this.vel;
      this.vel += f * dt; this.pos += this.vel * dt;
    }
    const b = this.btn.getBoundingClientRect();
    this.cx = b.left + b.width / 2; this.cy = b.top + b.height / 2;
    const R = this.radius;
    this.track.setAttribute('cx', this.cx); this.track.setAttribute('cy', this.cy); this.track.setAttribute('r', R);
    const since = (now - this.openedAt) / 1000;
    this.nodes.forEach((n, i) => {
      // follow-through: fast spins leave nodes a few degrees behind
      const trail = Math.max(-5, Math.min(5, this.vel * 0.9));
      const a = SLOT + (i - this.pos) * STEP + trail;
      const x = this.cx + R * Math.cos(rad(a)), y = this.cy + R * Math.sin(rad(a));
      const d = Math.abs(a - SLOT);
      // visible arc: from just right of the button (−2°) down to just below it (92°)
      const fade = a < -2 || a > 92 ? 0 : d <= 28 ? 1 : Math.max(0, 1 - (d - 28) / 22);
      const focus = Math.max(0, 1 - Math.abs(i - this.pos));
      const enter = this.root.classList.contains('opening') && !reduce() ? Math.min(1, Math.max(0, (since - 0.06 * i) / 0.45)) : 1;
      n.style.translate = `${x}px ${y}px`;
      n.style.opacity = (fade * enter).toFixed(3);
      n.style.setProperty('--f', focus.toFixed(3));
      n.style.pointerEvents = fade > 0.3 ? 'auto' : 'none';
      n.tabIndex = fade > 0.3 ? 0 : -1;
    });
    this.raf = requestAnimationFrame(this._tick);
  }
}
