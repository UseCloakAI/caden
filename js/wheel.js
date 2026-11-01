// Wheel: Caden's options. One button in the top-left corner; pressing it drops
// a glass list of options under it. A highlight rides on Ribbon's orbit spring
// (k 200, c 25) from option to option and rubber-bands at the ends.
//
// Every option is a plain, labelled row you can tap or pinch. To move the
// highlight: slide a finger or mouse along the list, scroll the mouse wheel /
// trackpad, arrow keys, or swipe a hand in the air. Enter opens the
// highlighted one; Esc, the button again, a tap outside or a thumbs down
// closes it.
import { sfx } from './sfx.js';

const SPRING = { k: 200, c: 25 }; // Ribbon's orbit spring
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    this.root.innerHTML = '<div class="wheel-scrim" data-close></div><div class="wheel-ring"><span class="wheel-hl" aria-hidden="true"></span></div>';
    document.body.appendChild(this.root);
    this.ring = this.root.querySelector('.wheel-ring');
    this.hl = this.root.querySelector('.wheel-hl');
    this.nodes = items.map((it, i) => {
      const b = document.createElement('button');
      b.className = 'wheel-item';
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.i = i;
      b.style.setProperty('--n', i);
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


  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.btn.classList.add('is-open');
    this.pos = this.index; this.vel = 0; this.target = this.index;
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
      this.vel += n * 6; // stretch past the end, spring back
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
    // slide along the list (touch, pen, mouse): the highlight follows the finger
    let drag = null;
    const rowAt = (y) => { const r = this.ring.getBoundingClientRect(); return (y - r.top - this.pad) / this.rowH - 0.5; };
    this.ring.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      drag = { id: e.pointerId, y0: e.clientY, moved: 0 };
      this.dragged = false;
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.y0));
      if (drag.moved > 8) { this.dragged = true; this.ring.setPointerCapture?.(e.pointerId); }
      if (!this.dragged) return;
      const p = rowAt(e.clientY), max = this.items.length - 1;
      this.pos = this.target = p < 0 ? p * 0.3 : p > max ? max + (p - max) * 0.3 : p;
      this.vel = 0;
      const want = Math.round(Math.max(0, Math.min(max, p)));
      if (want !== this.index) { sfx.play('tick', { dir: want > this.index ? 1 : -1 }); this.index = want; this._mark(); }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (this.dragged) {
        if (this.pos < -0.2 || this.pos > this.items.length - 0.8) sfx.play('bump');
        this.target = this.index;
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

    // hover moves the highlight too (desktop), quietly
    this.nodes.forEach((n, i) => n.addEventListener('pointerenter', (e) => {
      if (!this.open || e.pointerType !== 'mouse' || i === this.index) return;
      this.index = i; this.target = i; this._mark(); sfx.play('tick', { dir: 1, gain: 0.5 });
    }));

    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); this.step(1); this.nodes[this.index].focus({ preventScroll: true }); }
      else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); this.step(-1); this.nodes[this.index].focus({ preventScroll: true }); }
      else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement?.closest?.('.wheel-item')) return; e.preventDefault(); this.choose(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); this.btn.focus(); }
    });
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.open && this.root.hidden) return;
    if (reduce()) { this.pos = this.target; this.vel = 0; }
    else {
      const f = -SPRING.k * (this.pos - this.target) - SPRING.c * this.vel;
      this.vel += f * dt; this.pos += this.vel * dt;
    }
    const first = this.nodes[0];
    this.rowH = first.offsetHeight || 56;
    this.pad = first.offsetTop;
    // the highlight stretches a little in the direction it's moving (follow-through)
    const stretch = Math.min(0.35, Math.abs(this.vel) * 0.04);
    this.hl.style.translate = `0 ${this.pad + this.pos * this.rowH}px`;
    this.hl.style.scale = `1 ${1 + stretch}`;
    this.raf = requestAnimationFrame(this._tick);
  }
}
