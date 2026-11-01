// QR codes for joining a home.
//   qrSvg(text)      the invite link as an SVG QR code (qrcode-generator, vendored)
//   QrScanner        reads QR codes from the camera: BarcodeDetector where the
//                    browser has it, else jsQR (vendored, loaded on first use)
//   codeFrom(text)   a home code from a scanned invite link or a bare code
// The QR holds the invite link, so a phone's own camera app can open it too.
import * as camera from './camera.js';
import { normCode } from './store.js';

const loaded = new Map();
function script(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = () => { loaded.delete(src); rej(new Error(`couldn't load ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}
const base = new URL('.', import.meta.url).href;

export async function qrSvg(text, { dark = '#2C2433', light = '#FFFFFF', quiet = 3 } = {}) {
  await script(base + 'vendor/qrcode.js');
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code to join this home"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// "https://…/caden/#join=sunny-otter-42", "#join=…", or just "sunny-otter-42"
export function codeFrom(text) {
  const t = String(text || '').trim();
  const m = /[#&?]join=([\w-]+)/.exec(t);
  const code = normCode(m ? m[1] : t);
  return /^[a-z0-9]+(-[a-z0-9]+){1,4}$/.test(code) && code.length <= 40 ? code : null;
}

export class QrScanner {
  constructor(video) { this.video = video; this.on = false; }

  async start(onCode, { facing = 'environment' } = {}) {
    this.stop();
    this.on = true;
    this.onCode = onCode;
    await camera.acquire('qr', { facing });
    if (!this.on) return;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        if (!formats || formats.includes('qr_code')) this.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch { /* fall back to jsQR */ }
    }
    if (!this.detector) await script(base + 'vendor/jsQR.js');
    this.canvas = document.createElement('canvas');
    this._loop();
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearTimeout(this.t);
    camera.release('qr');
  }

  async _loop() {
    if (!this.on) return;
    const v = this.video;
    try {
      if (v.readyState >= 2 && v.videoWidth) {
        let text = null;
        if (this.detector) {
          const found = await this.detector.detect(v);
          text = found[0]?.rawValue || null;
        } else {
          const w = Math.min(640, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth);
          this.canvas.width = w; this.canvas.height = h;
          const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          text = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })?.data || null;
        }
        if (text && this.on) { const code = codeFrom(text); if (code) { this.stop(); this.onCode(code, text); return; } }
      }
    } catch { /* a bad frame; keep going */ }
    this.t = setTimeout(() => this._loop(), 160);
  }
}
