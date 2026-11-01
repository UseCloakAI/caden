// Globe: a faint wireframe earth behind everything (lat / long lines,
// orthographic), large and partly off screen, turning very slowly. Only the
// lines on the near side are drawn, the far side faintly, so it reads as a
// sphere without any glow or texture. Static on low quality / reduced motion.
const TAU = Math.PI * 2;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, spin = 0.6, last = performance.now(), raf = 0, drawn = false;
  const tilt = -0.38; // radians: the north pole leans toward the viewer
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the whole sphere, lower right, sitting into the wave's band
    R = Math.min(W * 0.3, H * 0.44);
    cx = W - R * 0.92 - W * 0.03; cy = H - R * 0.78;
    drawn = false;
  };
  // rotate a point on the unit sphere (lat, lon) by the spin and tilt, project
  const proj = (lat, lon) => {
    const x0 = Math.cos(lat) * Math.sin(lon + spin), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon + spin);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt), z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return [cx + x0 * R, cy - y * R, z];
  };
  const line = (pts, night) => {
    // split into near (z>0) and far runs: near stronger, far fainter
    for (const near of [false, true]) {
      ctx.beginPath();
      let on = false;
      for (const [x, y, z] of pts) {
        if ((z > 0) === near) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false;
      }
      ctx.strokeStyle = night ? `rgba(170, 215, 255, ${near ? 0.2 : 0.06})` : `rgba(255, 255, 255, ${near ? 0.32 : 0.1})`;
      ctx.stroke();
    }
  };
  const draw = () => {
    const night = document.documentElement.classList.contains('night');
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    // outline
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = night ? 'rgba(170, 215, 255, 0.22)' : 'rgba(255, 255, 255, 0.4)'; ctx.stroke();
    // parallels every 20 degrees, meridians every 20 degrees
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = []; for (let lon = 0; lon <= 360; lon += 4) pts.push(proj(lat * Math.PI / 180, lon * Math.PI / 180)); line(pts, night);
    }
    for (let lon = 0; lon < 180; lon += 20) {
      const gc = []; // a full great circle through both poles
      for (let a = 0; a <= 360; a += 4) { const t = a * Math.PI / 180; gc.push(projGreat(t, lon * Math.PI / 180)); }
      line(gc, night);
    }
  };
  // a meridian as a great circle: walk the angle t around through both poles
  const projGreat = (t, lon) => {
    const lat = Math.asin(Math.sin(t)), l = Math.cos(t) >= 0 ? lon : lon + Math.PI;
    return proj(lat, l);
  };
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const still = reduce() || document.documentElement.dataset.quality === 'low';
    if (still && drawn) { last = now; return; }
    if (!still && now - last < 66) return; // ~15 fps is plenty for a slow turn
    spin += still ? 0 : ((now - last) / 1000) * 0.035; // about three minutes a turn
    last = now;
    draw(); drawn = true;
  };
  addEventListener('resize', resize);
  new MutationObserver(() => { drawn = false; }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-quality'] });
  resize();
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
