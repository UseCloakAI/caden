// Orb: Caden's face. States: idle, listening, thinking, speaking, sleepy, happy.
//
// Motion identity (Playful, mirrors the tokens in css/caden.css):
//   E.out  decelerate, entrances        E.in   accelerate, exits
//   E.pop  small overshoot, friendly    E.io   on-screen moves
// Three layers on every flight: the orb (primary), its ground shadow and a
// trailing face (secondary), sparks and the room light (ambient). Paths arc,
// and no segment crosses more than about a third of the screen.
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const E = {
  out: 'cubic-bezier(.2,.8,.3,1)',
  in: 'cubic-bezier(.5,0,.75,0)',
  pop: 'cubic-bezier(.34,1.56,.64,1)',
  io: 'cubic-bezier(.45,0,.55,1)',
};
export const T = { quick: 140, std: 280, slow: 560 };

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
    this.face = root.querySelector('.orb-face');
    this.mouth = root.querySelector('.orb-mouth');
    // The ground shadow stays on the floor while the orb hops and flies.
    this.ground = document.createElement('div');
    this.ground.className = 'orb-ground';
    this.ground.setAttribute('aria-hidden', 'true');
    root.parentElement?.insertBefore(this.ground, root);
    this.state = 'idle';
    this.root.dataset.state = 'idle';
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
      { duration: 180 + Math.random() * 120, easing: E.io });
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

  // Ground shadow tracks height: higher orb, smaller and fainter shadow.
  _shadow(frames, opts) {
    if (!this.ground.isConnected) return null;
    return this.ground.animate(frames, opts);
  }

  // Heard its name: a quick anticipation dip, then it perks up (~300ms).
  perk() {
    if (reduce()) return;
    this.body.animate([
      { scale: '1 1', translate: '0 0' },
      { scale: '1.04 .94', translate: '0 4px', offset: 0.2 },
      { scale: '.96 1.08', translate: '0 -10px', offset: 0.55 },
      { scale: '1 1', translate: '0 0' },
    ], { duration: 320, easing: E.out });
    this._shadow([{ scale: '1' }, { scale: '.8', opacity: 0.7, offset: 0.55 }, { scale: '1' }], { duration: 320, easing: E.out });
  }

  // Something went wrong: a firm head shake, no overshoot (~360ms).
  shake() {
    if (reduce()) return;
    this.body.animate([
      { translate: '0 0', rotate: '0deg' },
      { translate: '-12px 0', rotate: '-4deg', offset: 0.2 },
      { translate: '10px 0', rotate: '3deg', offset: 0.45 },
      { translate: '-6px 0', rotate: '-2deg', offset: 0.7 },
      { translate: '0 0', rotate: '0deg' },
    ], { duration: 360, easing: E.io });
  }

  // Tapped to stop: squish down and spring back.
  squish() {
    if (reduce()) return;
    this.body.animate([
      { scale: '1 1' }, { scale: '1.1 .88', offset: 0.35 }, { scale: '.97 1.03', offset: 0.7 }, { scale: '1 1' },
    ], { duration: 260, easing: E.out });
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
      ], { duration: 720, easing: E.out });
      this._shadow([
        { scale: '1', opacity: 1 }, { scale: '1.08', offset: 0.15 },
        { scale: '.7', opacity: 0.55, offset: 0.45 }, { scale: '1.1', opacity: 1, offset: 0.75 }, { scale: '1', opacity: 1 },
      ], { duration: 720, easing: E.out });
    }
    clearTimeout(this.ht);
    this.ht = setTimeout(() => { if (this.state === 'happy') this.set('idle'); }, 1500);
  }

  // Fly off toward dir (-1 left, 1 right): lean back, launch up, arc away.
  // 800ms, accelerating: exits are shorter than entrances.
  async leave(dir = 1) {
    if (reduce()) { await this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished; return; }
    this.set('happy');
    this._trail(dir);
    const d = dir;
    const fly = this.root.animate([
      { translate: '0 0', scale: '1 1', rotate: '0deg', opacity: 1, easing: E.out },
      { translate: `${-d * 26}px 10px`, scale: '1.12 .86', rotate: `${-d * 6}deg`, offset: 0.18, easing: E.in },
      { translate: `${d * 24}px -48px`, scale: '.9 1.12', rotate: `${d * 8}deg`, offset: 0.36, easing: 'linear' },
      { translate: `${d * 30}vw -20vh`, scale: '.72 .64', rotate: `${d * 18}deg`, offset: 0.62, easing: 'linear' },
      { translate: `${d * 66}vw -26vh`, scale: '.5 .44', rotate: `${d * 30}deg`, offset: 0.82, easing: 'linear' },
      { translate: `${d * 112}vw -18vh`, scale: '.34 .3', rotate: `${d * 40}deg`, opacity: 0.85 },
    ], { duration: 800, fill: 'forwards' });
    // The face lags behind the body on launch (follow-through).
    this.face.animate([
      { translate: '0 0' }, { translate: `${d * 8}% 4%`, offset: 0.2 }, { translate: `${-d * 10}% 6%`, offset: 0.45 }, { translate: `${-d * 6}% 3%` },
    ], { duration: 800, easing: E.io, fill: 'forwards' });
    this._shadow([
      { scale: '1', opacity: 1 }, { scale: '1.12', opacity: 1, offset: 0.18 },
      { scale: '.55', opacity: 0.4, offset: 0.4 }, { scale: '.2', opacity: 0 },
    ], { duration: 800, easing: E.out, fill: 'forwards' });
    await fly.finished;
  }

  // Swoop in from the side opposite dir along a falling arc, overshoot, land
  // with a squash, rebound, settle. 1150ms, decelerating.
  async arrive(dir = 1) {
    for (const el of [this.root, this.face, this.ground]) el.getAnimations().forEach((a) => a.cancel());
    if (reduce()) { await this.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 }).finished; this.hop(); return; }
    const d = dir;
    const fly = this.root.animate([
      { translate: `${-d * 112}vw -22vh`, scale: '.34 .3', rotate: `${-d * 40}deg`, opacity: 0.85, easing: 'linear' },
      { translate: `${-d * 70}vw -28vh`, scale: '.52 .48', rotate: `${-d * 26}deg`, opacity: 1, offset: 0.2, easing: 'linear' },
      { translate: `${-d * 32}vw -20vh`, scale: '.74 .7', rotate: `${-d * 12}deg`, offset: 0.38, easing: E.out },
      { translate: `${d * 22}px -26px`, scale: '1.02 1.06', rotate: `${d * 6}deg`, offset: 0.6, easing: E.in },
      { translate: '0 8px', scale: '1.16 .84', rotate: '0deg', offset: 0.74, easing: E.out },
      { translate: '0 -8px', scale: '.96 1.05', offset: 0.87, easing: E.io },
      { translate: '0 0', scale: '1 1', rotate: '0deg', opacity: 1 },
    ], { duration: 1150 });
    // Face trails the body and catches up a beat after landing.
    this.face.animate([
      { translate: `${d * 10}% 4%` }, { translate: `${d * 8}% 2%`, offset: 0.6 },
      { translate: '0 8%', offset: 0.78 }, { translate: '0 -3%', offset: 0.9 }, { translate: '0 0' },
    ], { duration: 1150, easing: E.out });
    // The shadow appears as the orb nears the floor, darkest at contact.
    this._shadow([
      { scale: '.2', opacity: 0 }, { scale: '.45', opacity: 0.35, offset: 0.38 },
      { scale: '.85', opacity: 0.8, offset: 0.6 }, { scale: '1.25', opacity: 1, offset: 0.74 },
      { scale: '.92', opacity: 0.9, offset: 0.87 }, { scale: '1', opacity: 1 },
    ], { duration: 1150, easing: E.out });
    await fly.finished;
    this.hop();
  }

  _trail(dir) {
    const host = this.root.parentElement;
    const r = this.root.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const size = 6 + Math.random() * 12;
      s.style.cssText = `width:${size}px;height:${size}px;left:${r.left - h.left + r.width / 2}px;top:${r.top - h.top + r.height / 2}px;`;
      host.appendChild(s);
      // Sparks drift back against the flight (counter-motion), on an arc.
      const dx = -dir * (40 + Math.random() * 140), dy = 30 + Math.random() * 90;
      s.animate([
        { translate: '-50% -50%', scale: '0', opacity: 1 },
        { translate: `calc(-50% + ${dx * 0.5}px) calc(-50% - ${dy * 0.6}px)`, scale: '1', opacity: 1, offset: 0.4 },
        { translate: `calc(-50% + ${dx}px) calc(-50% + ${dy * 0.3}px)`, scale: '.2', opacity: 0 },
      ], { duration: 600 + Math.random() * 300, delay: 220 + i * 30, easing: E.out, fill: 'both' })
        .finished.then(() => s.remove());
    }
  }
}
