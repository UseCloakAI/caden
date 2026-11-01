# Caden

Multi-device home voice agent. Static web app (no build) + Android WebView wrapper. See README.md for the architecture.

- Web app files ship as-is: `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`. The Android app bundles the same files (`android/app/build.gradle` `syncWeb`) — new top-level web files must be added there, to `SHELL` in `sw.js`, and to the Pages stage step in `.github/workflows/ship.yml`.
- Bump `CACHE` in `sw.js` when shipping changes to shell files.
- Design: one accent (coral; `--acc-ink` for coral text, `--on-acc` for text on coral fills), text colors checked against WCAG AA. Shapes: controls are pills, inputs 16px, cards/sheets 24px. Icons are Phosphor (`icons/ph`, vendored); no emoji, no hand-drawn SVG icons. Fonts are self-hosted (`fonts/`). No em-dashes or middot chains in UI copy.
- Brain = Caden Supabase project (`wiimiqqmdmfikuqgqhtm`) edge function `brain`; model = Cloak `/v1/chat` `model:"home"` (NVIDIA key pool). Background/utility work must not use chat tiers.
- Touch-free display mode (`html.display`, `settings.display`, `#display`): hand tracking. `js/hands.js` turns MediaPipe Gesture Recognizer output into a pointer (index knuckle, so pinching doesn't move it), pinch state and gestures (wave / swipe / thumbs up / thumbs down / fist rests); its `analyze(hands, t)` is pure and unit-testable. `js/airnav.js` owns the cursor, pinch-to-press (on release, so a drag cancels it), pinch-drag scroll and the hand preview. Air targets exclude external links and downloads (a kiosk must not navigate away). Faces and hands share `js/camera.js`; never open a second `getUserMedia`. `?debug` exposes `window.__caden` for tests.
- Mesh payloads are always encrypted (`js/mesh.js`); never send plaintext over Realtime, and never send camera frames anywhere.
- The holder protocol (claim / handoff / epoch) is in `js/app.js` — keep "highest epoch wins, ties to lower id".
- Replies are spoken: keep `HOME_PLAYBOOK` (Cloak repo) and the `SPOKEN_NOTE` fallback in `supabase/functions/brain/index.ts` in sync.
- Motion identity (Playful): tokens `--e-out/--e-pop/--e-in/--e-sine` + `--t-quick/std/slow` in `css/caden.css`, mirrored as `E`/`T` in `js/orb.js`. Entrances decelerate and rise 12px, exits accelerate and run ~35% shorter. Flights arc with keyframes every <1/3 screen, with three layers: orb, ground shadow + trailing face, sparks + room light (`html.is-away` dims it). Staggers stay under 400ms. Animate `translate`/`scale`/`opacity` (the dock puck also animates `width`).
- Respect `prefers-reduced-motion` (orb flights degrade to fades, CSS durations collapse).
