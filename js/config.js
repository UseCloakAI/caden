// Caden — static config. No build step: these ship as-is to the web and the APK.

export const API = 'https://api.usecloak.org';
// The Cloak worker's `home` tier: NVIDIA key pool only, spoken-reply playbook.
export const MODEL = 'home';

// The Caden Supabase project: Realtime broadcast links a home's devices (every
// message AES-GCM encrypted with the home code), and the `brain` edge function
// keeps each home's turns + memories. The anon key is publishable.
export const SB_URL = 'https://wiimiqqmdmfikuqgqhtm.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaW1pcXFtZG1maWt1cWdxaHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODA3ODgsImV4cCI6MjEwNTY1Njc4OH0.ptGrSbZHWCYjArX7XHpPZ575zvl5rU9ii1Gix4bvikI';

// face-api (tfjs bundled) + its weights, pinned on jsDelivr.
export const FACE_LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
export const FACE_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';

export const TUNING = {
  beatMs: 3000,          // presence heartbeat
  staleMs: 11000,        // a device that hasn't beat in this long is gone
  faceEveryMs: 650,      // face scan interval
  matchDistance: 0.52,   // face descriptor distance that counts as "same person"
  seenFreshMs: 2500,     // a sighting this recent counts as "here now"
  holderQuietMs: 5000,   // holder must have seen nobody this long before Caden walks away
  followUpMs: 8000,      // after a reply, listen this long without the wake word
  historyTurns: 24,      // turns sent to the model
  keepTurns: 200,        // turns kept on each device
};

export const DEFAULT_WAKE = ['hey caden', 'caden', 'hey cloak'];
