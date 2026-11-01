// Orb — Caden's face. States: idle, listening, thinking, speaking, sleepy, happy.
// leave(dir) / arrive(dir) are the device-to-device flights (Web Animations).
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Orb {
  constructor(root) {
    this.root = root;
    root.classList.add('orb');
    root.innerHTML = `
      <div class="orb-glow" aria-hidden="true"></div>
      <div class="orb-rings" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="orb-body" aria-hidden="true">
        <div class="orb-shine"></div>
        <div class="orb-face">
          <div class="orb-eyes"><span class="eye"></span><span class="eye"></span></div>
          <div class="orb-cheeks"><span></span><span></span></div>
          <div class="orb-mouth"></div>
        </div>
        <div class="orb-dots"><i></i><i></i><i></i></div>
      </div>
      <div class="orb-z" aria-hidden="true"><i>z</i><i>z</i><i>z</i></div>`;
    this.body = root.querySelector('.orb-body');
    this.mouth = root.querySelector('.orb-mouth');
    this.state = 'idle';
    this.set('idle');
    this._blink();
  }

  set(state) {
    if (this.state === state) return;
    this.state = state;
    this.root.dataset.state = state;
  }

  // Eyes follow a face: x, y in 0..1 of the camera frame (mirrored).
  look(x, y) {
    const lx = Math.max(-1, Math.min(1, (x - 0.5) * 2.2));
    const ly = Math.max(-1, Math.min(1, (y - 0.45) * 2.2));
    this.root.style.setProperty('--lx', lx.toFixed(3));
    this.root.style.setProperty('--ly', ly.toFixed(3));
  }
  lookAway() { this.root.style.setProperty('--lx', '0'); this.root.style.setProperty('--ly', '0'); }

  level(v) { this.root.style.setProperty('--lvl', Math.max(0, Math.min(1, v)).toFixed(3)); }

  // One syllable of mouth movement while speaking.
  talk() {
    if (reduce()) return;
    this.mouth.animate(
      [{ scale: '1 1' }, { scale: `${1 + Math.random() * 0.25} ${1.6 + Math.random() * 1.2}` }, { scale: '1 1' }],
      { duration: 180 + Math.random() * 120, easing: 'ease-in-out' });
  }

  _blink() {
    clearTimeout(this.bt);
    this.bt = setTimeout(() => {
      if (this.state !== 'sleepy') {
        this.root.classList.add('blink');
        setTimeout(() => this.root.classList.remove('blink'), 140);
      }
      this._blink();
    }, 2400 + Math.random() * 3600);
  }

  hop() {
    this.set('happy');
    if (!reduce()) {
      this.body.animate([
        { translate: '0 0', scale: '1 1' },
        { translate: '0 6px', scale: '1.08 .9', offset: 0.15 },
        { translate: '0 -34px', scale: '.94 1.06', offset: 0.45 },
        { translate: '0 0', scale: '1.06 .94', offset: 0.75 },
        { translate: '0 0', scale: '1 1' },
      ], { duration: 720, easing: 'cubic-bezier(.3,.7,.4,1)' });
    }
    clearTimeout(this.ht);
    this.ht = setTimeout(() => { if (this.state === 'happy') this.set('idle'); }, 1500);
  }

  // Fly off toward dir (-1 left, 1 right). Resolves when gone.
  async leave(dir = 1) {
    if (reduce()) { await this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished; return; }
    this.set('happy');
    this._trail(dir);
    const a = this.root.animate([
      { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 },
      { translate: `${-dir * 28}px 10px`, scale: '1.12 .86', rotate: `${-dir * 6}deg`, opacity: 1, offset: 0.22 },
      { translate: `${dir * 30}px -40px`, scale: '.9 1.08', rotate: `${dir * 8}deg`, opacity: 1, offset: 0.4 },
      { translate: `${dir * 110}vw -18vh`, scale: '.35', rotate: `${dir * 40}deg`, opacity: 0.9 },
    ], { duration: 950, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' });
    await a.finished;
  }

  // Swoop in from the side opposite dir, overshoot, land with a squash.
  async arrive(dir = 1) {
    this.root.getAnimations().forEach((a) => a.cancel());
    if (reduce()) { await this.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 }).finished; this.hop(); return; }
    const a = this.root.animate([
      { translate: `${-dir * 110}vw -22vh`, scale: '.35', rotate: `${-dir * 40}deg`, opacity: 0.9 },
      { translate: `${dir * 26}px -30px`, scale: '1.04', rotate: `${dir * 8}deg`, opacity: 1, offset: 0.62 },
      { translate: '0 8px', scale: '1.14 .84', rotate: '0deg', offset: 0.8 },
      { translate: '0 -6px', scale: '.97 1.04', offset: 0.9 },
      { translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)' });
    await a.finished;
    this.hop();
  }

  _trail(dir) {
    const host = this.root.parentElement;
    const r = this.root.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const size = 6 + Math.random() * 12;
      s.style.cssText = `width:${size}px;height:${size}px;left:${r.left - h.left + r.width / 2}px;top:${r.top - h.top + r.height / 2}px;`;
      host.appendChild(s);
      const dx = dir * (80 + Math.random() * 420), dy = -60 - Math.random() * 160 + Math.random() * 120;
      s.animate([
        { translate: '-50% -50%', scale: '0', opacity: 1 },
        { translate: `calc(-50% + ${dx * 0.5}px) calc(-50% + ${dy * 0.5}px)`, scale: '1', opacity: 1, offset: 0.4 },
        { translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)`, scale: '.2', opacity: 0 },
      ], { duration: 700 + Math.random() * 500, delay: 250 + i * 35, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' })
        .finished.then(() => s.remove());
    }
  }
}
