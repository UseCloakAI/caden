// Locate: which device is the person nearest to, by how loud "Hey Caden" was.
//
// Every device keeps a rolling loudness history of its microphone. When it hears
// the wake word it takes the peak of the last ~2s (the wake phrase itself) and
// subtracts its calibration: the peak it measured with you standing right next
// to it (Settings → Voice → Calibrate). That cancels out different mics and
// gains, so the scores are comparable between devices. Devices share scores
// over the mesh (LAN links or the Supabase relay) and the loudest one wins.
//
// Browser: a separate mic stream with auto gain control OFF (AGC would flatten
// exactly the difference we're measuring). Android app: the native recognizer's
// RMS dB, fed in with push(), so the mic isn't opened twice.
const KEEP_MS = 3000;
export const PEAK_MS = 2000;
export const DEFAULT_CAL = { web: -18, native: 8 }; // rough close-up peaks per scale

export class Meter {
  constructor() {
    this.hist = [];       // [{t, db}]
    this.on = false;
    this.scale = 'web';   // 'web' (dBFS) or 'native' (Android RMS dB): calibrations don't mix
  }

  get ok() { return this.on && this.hist.length > 5; }

  // Browser mic, no AGC / noise suppression.
  async start() {
    if (this.on) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: true, channelCount: 1 },
      });
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ac.createMediaStreamSource(this.stream);
      this.an = this.ac.createAnalyser();
      this.an.fftSize = 2048;
      src.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
      this.on = true;
      this.scale = 'web';
      this.t = setInterval(() => this._sample(), 50);
      // Autoplay rules can start the context suspended; resume on the first tap.
      if (this.ac.state !== 'running') document.addEventListener('pointerdown', () => this.ac?.resume(), { once: true });
      return true;
    } catch { return false; }
  }

  // Native feed (Android): RMS dB straight from SpeechRecognizer.
  useFeed() { this.stop(); this.on = true; this.scale = 'native'; }
  push(db, t = performance.now()) { if (this.scale === 'native') this._add(t, db); }

  stop() {
    clearInterval(this.t);
    this.stream?.getTracks().forEach((x) => x.stop());
    this.ac?.close().catch(() => {});
    this.stream = this.ac = this.an = null;
    this.on = false;
    this.hist = [];
  }

  _sample() {
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (const v of this.buf) s += v * v;
    this._add(performance.now(), 20 * Math.log10(Math.sqrt(s / this.buf.length) + 1e-6));
  }

  _add(t, db) {
    this.hist.push({ t, db });
    while (this.hist.length && t - this.hist[0].t > KEEP_MS) this.hist.shift();
  }

  // Loudest moment in the window, smoothed over 3 samples so one click can't win.
  peak(windowMs = PEAK_MS, end = performance.now()) {
    const h = this.hist.filter((x) => x.t >= end - windowMs && x.t <= end);
    if (h.length < 3) return null;
    let best = -Infinity;
    for (let i = 1; i < h.length - 1; i++) best = Math.max(best, (h[i - 1].db + h[i].db + h[i + 1].db) / 3);
    return best;
  }
}

// Score relative to this device's close-up calibration. ~0 means "right here",
// negative means farther away. Uncalibrated devices use a rough default.
export function score(peakDb, cal, scale) {
  if (peakDb == null) return null;
  const ref = cal && cal.scale === scale ? cal.db : DEFAULT_CAL[scale];
  return peakDb - ref;
}

// Who wins: highest score; ties (within 0.5 dB) go to the holder, then lower id.
export function pickLoudest(entries, holderId) {
  const list = [...entries].filter(([, s]) => s != null);
  if (!list.length) return null;
  list.sort(([a, sa], [b, sb]) => {
    if (Math.abs(sa - sb) > 0.5) return sb - sa;
    if (a === holderId) return -1;
    if (b === holderId) return 1;
    return a < b ? -1 : 1;
  });
  return list[0][0];
}
