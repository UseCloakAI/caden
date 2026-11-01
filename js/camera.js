// Camera: one webcam stream shared by everything that looks (faces.js,
// hands.js), on the single #cam <video>. Ref-counted: the camera turns off
// when the last user lets go. Frames never leave the device.
let stream = null;
let opening = null;
const users = new Set();

export const video = () => document.getElementById('cam');

export async function acquire(user) {
  users.add(user);
  if (stream) return stream;
  if (!opening) {
    opening = navigator.mediaDevices.getUserMedia({
      // 640x480: enough for pose at couch distance; face-api downsamples anyway.
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    }).then(async (s) => {
      stream = s;
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
