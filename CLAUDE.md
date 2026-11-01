# Caden

Multi-device home voice agent. Static web app (no build) + Android WebView wrapper. See README.md for the architecture.

- Web app files ship as-is: `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`. The Android app bundles the same files (`android/app/build.gradle` `syncWeb`) — new top-level web files must be added there, to `SHELL` in `sw.js`, and to the Pages stage step in `.github/workflows/ship.yml`.
- Bump `CACHE` in `sw.js` when shipping changes to shell files.
- Brain = Caden Supabase project (`wiimiqqmdmfikuqgqhtm`) edge function `brain`; model = Cloak `/v1/chat` `model:"home"` (NVIDIA key pool). Background/utility work must not use chat tiers.
- Mesh payloads are always encrypted (`js/mesh.js`); never send plaintext over Realtime, and never send camera frames anywhere.
- The holder protocol (claim / handoff / epoch) is in `js/app.js` — keep "highest epoch wins, ties to lower id".
- Replies are spoken: keep `HOME_PLAYBOOK` (Cloak repo) and the `SPOKEN_NOTE` fallback in `supabase/functions/brain/index.ts` in sync.
- Respect `prefers-reduced-motion` (orb flights degrade to fades).
