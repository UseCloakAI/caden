// Motion: wakes a locked screen when someone moves in front of it. Reads the
// shared camera (js/camera.js) a few times a second at 48x36 grayscale and
// compares frames; nothing is kept or sent. Calls onMotion once, then stops.
import { acquire, release, video } from './camera.js';

export function watchMotion(onMotion, { every = 350, share = 0.025, delta = 26 } = {}) {
  let stopped = false, timer = null, prev = null, hits = 0, frames = 0;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  const stop = () => { if (stopped) return; stopped = true; clearInterval(timer); release('motion'); };
  acquire('motion').then(() => {
    if (stopped) { release('motion'); return; }
    timer = setInterval(() => {
      const v = video();
      if (!v || v.readyState < 2 || document.hidden) return;
      g.drawImage(v, 0, 0, 48, 36);
      const px = g.getImageData(0, 0, 48, 36).data;
      const cur = new Uint8Array(48 * 36);
      for (let i = 0; i < cur.length; i++) cur[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
      if (prev && ++frames > 2) { // let exposure settle first
        let moved = 0;
        for (let i = 0; i < cur.length; i++) if (Math.abs(cur[i] - prev[i]) > delta) moved++;
        hits = moved / cur.length > share ? hits + 1 : 0;
        if (hits >= 2) { stop(); onMotion(); return; }
      }
      prev = cur;
    }, every);
  }).catch(() => { /* no camera: touch and the wake word still unlock */ });
  return stop;
}
