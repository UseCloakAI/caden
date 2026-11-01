// Faces — on-device face detection + recognition (face-api / tfjs).
// Frames never leave the device. Only 128-number face descriptors are kept,
// and they travel between a home's devices encrypted (see mesh.js).
import { FACE_LIB, FACE_MODELS, TUNING } from './config.js';
import * as camera from './camera.js';

let faceapi = null;
let loading = null;

export function loadFaceApi() {
  if (faceapi) return Promise.resolve(faceapi);
  if (!loading) {
    loading = (async () => {
      const m = await import(FACE_LIB);
      const api = m.default || m;
      try { await api.tf.setBackend('webgl'); } catch { /* falls back to cpu/wasm */ }
      await api.tf.ready();
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(FACE_MODELS),
        api.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS),
        api.nets.faceRecognitionNet.loadFromUri(FACE_MODELS),
      ]);
      faceapi = api;
      return api;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const packDesc = (f32) => btoa(String.fromCharCode(...new Uint8Array(f32.buffer)));
export const unpackDesc = (s) => new Float32Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export class Faces extends EventTarget {
  constructor(video) {
    super();
    this.video = video;
    this.people = [];
    this._cache = new Map();
    this.running = false;
    this.state = 'off'; // off | loading | on | denied | error
  }

  setPeople(list) {
    this.people = list;
    this._cache.clear();
    for (const p of list) this._cache.set(p.id, (p.d || []).map(unpackDesc));
  }

  _set(state, err) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: { state, err } }));
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this._set('loading');
    try {
      await camera.acquire('faces');
      await loadFaceApi();
    } catch (e) {
      this.running = false;
      this.stop();
      this._set(e?.name === 'NotAllowedError' ? 'denied' : 'error', e?.message || String(e));
      return;
    }
    if (!this.running) return;
    this._set('on');
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.t);
    camera.release('faces');
    if (this.state === 'on' || this.state === 'loading') this._set('off');
  }

  async _detectAll() {
    const v = this.video;
    if (!faceapi || !v.videoWidth) return [];
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    return faceapi.detectAllFaces(v, opts).withFaceLandmarks(true).withFaceDescriptors();
  }

  match(desc) {
    let best = null;
    for (const p of this.people) {
      for (const d of this._cache.get(p.id) || []) {
        const x = dist(desc, d);
        if (x < TUNING.matchDistance && (!best || x < best.distance)) best = { person: p, distance: x };
      }
    }
    return best;
  }

  async _loop() {
    if (!this.running) return;
    if (!this.pauseScan && document.visibilityState === 'visible') {
      try {
        const found = await this._detectAll();
        const v = this.video;
        const faces = found.map((f) => {
          const b = f.detection.box;
          const m = this.match(f.descriptor);
          return {
            person: m?.person || null,
            score: m ? 1 - m.distance : 0,
            // normalized, mirrored (the preview is a selfie view)
            x: 1 - (b.x + b.width / 2) / v.videoWidth,
            y: (b.y + b.height / 2) / v.videoHeight,
            size: b.width / v.videoWidth,
          };
        }).sort((a, b) => (b.person ? 1 : 0) - (a.person ? 1 : 0) || b.size - a.size);
        this.dispatchEvent(new CustomEvent('sight', { detail: { faces, at: Date.now() } }));
      } catch { /* a bad frame; keep going */ }
    }
    this.t = setTimeout(() => this._loop(), TUNING.faceEveryMs);
  }

  // Capture `n` descriptors of the single most prominent face, calling
  // onProgress(i, n) after each. Resolves to packed descriptors.
  async enroll(n = 5, onProgress = () => {}) {
    if (!this.running) await this.start();
    if (this.state !== 'on') throw new Error('Camera is not available.');
    this.pauseScan = true;
    const out = [];
    try {
      const deadline = Date.now() + 30000;
      while (out.length < n && Date.now() < deadline) {
        const found = await this._detectAll();
        if (found.length) {
          const f = found.sort((a, b) => b.detection.box.width - a.detection.box.width)[0];
          out.push(packDesc(f.descriptor));
          onProgress(out.length, n);
          await new Promise((r) => setTimeout(r, 350));
        } else {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally { this.pauseScan = false; }
    if (out.length < n) throw new Error("Couldn't see a face clearly. Try more light, and look at the screen.");
    return out;
  }
}
