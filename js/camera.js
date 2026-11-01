// Camera: one webcam stream shared by everything that looks (faces.js,
// hands.js), on the single #cam <video>. Ref-counted: the camera turns off
// when the last user lets go. Frames never leave the device.
let stream = null;
let opening = null;
const users = new Set();

export const video = () => document.getElementById('cam');

// facing: 'user' (front, default) or 'environment' (back: for scanning a QR on
// another screen). Only applies when the stream opens; reopen to switch.
export const facing = () => currentFacing;
let currentFacing = 'user';
export async function acquire(user, { facing = 'user' } = {}) {
  users.add(user);
  if (stream) return stream;
  if (!opening) {
    opening = navigator.mediaDevices.getUserMedia({
      // 640x480: enough for pose at couch distance; face-api downsamples anyway.
      video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    }).then(async (s) => {
      stream = s;
      currentFacing = facing;
      const v = video();
      v.srcObject = s;
      await v.play().catch(() => {});
      return s;
    }).finally(() => { opening = null; });
  }
  try { return await opening; } catch (e) { users.delete(user); throw e; }
}

export function release(user) {
  users.delete(user);
  if (users.size || !stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  const v = video();
  if (v) v.srcObject = null;
}

// One still from the camera, as base64 JPEG (for Caden to look, DO: look).
// Opens the camera just for this if nothing else is using it.
export async function still(maxSide = 768) {
  await acquire('look');
  try {
    const v = video();
    const t0 = Date.now();
    while ((v.readyState < 2 || !v.videoWidth) && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
    if (!v.videoWidth) throw new Error('camera has no picture');
    await new Promise((r) => setTimeout(r, 250)); // let exposure settle on a fresh open
    const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.8).split(',')[1], mime: 'image/jpeg' };
  } finally { release('look'); }
}
