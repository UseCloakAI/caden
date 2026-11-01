# Caden

A friendly voice agent for the whole home. Caden lives on the screens around a house — phones, tablets, old laptops — and **follows people from room to room**: when a device recognizes a face, Caden flies over to it, mid-conversation, with the turns intact. Say **"Hey Caden"** to any device and it comes to you.

Runs as a web app (GitHub Pages) and as an Android APK. Powered by [Cloak](https://usecloak.org).

## How it works

| Piece | Where | What |
|---|---|---|
| Brain | Caden Supabase project → edge function `brain` | Keeps each home's turns + memories, builds the prompt, streams the reply from Cloak's `home` tier |
| Model | `api.usecloak.org` `/v1/chat`, `model: "home"` | Cloak's NVIDIA key pool only (Nemotron → GLM-5.3-Flash → Laguna XS) + the spoken-reply `HOME_PLAYBOOK` |
| Mesh | WebRTC data channels over the LAN, Supabase Realtime as relay | Devices talk directly over the home network (~1 ms); the relay handles discovery, link setup and fallback. Every message AES-GCM encrypted with the home code |
| Eyes | `js/faces.js` (face-api / tfjs, on device) | Detects + recognizes faces; frames never leave the device, only 128-number descriptors (encrypted) |
| Ears | `js/voice.js` | Wake word + commands: Android SpeechRecognizer → Web Speech API → Cloak `/v1/transcribe` fallback |
| Mouth | `js/voice.js` | Android TextToSpeech or `speechSynthesis`, sentence by sentence as the reply streams |
| Face | `js/orb.js` + `css/caden.css` | The animated orb: idle, listening, thinking, speaking, sleepy, happy, and the fly-out / swoop-in between devices |

### Moving between devices

One device **holds** Caden at a time (`js/app.js`).

- A device that recognizes a known face sends `claim` to the holder. The holder lets go when it hasn't seen anyone for 5s and isn't mid-turn, and sends `handoff` with a bumped `epoch`.
- "Hey Caden" (or tapping **Call Caden here**) on any device summons it immediately; a command said there runs as soon as Caden lands.
- Highest epoch wins, ties go to the lower device id — two devices can't both keep Caden. If the holder disappears, the device that sees someone (else the lowest id) picks it up.
- Turns, people and presence sync over the mesh; the brain keeps the durable history, so a new device catches up on join.

### Touch-free display mode

For a screen with a webcam (wall display, kitchen laptop, TV box): Settings → Home → **Touch-free display**, or open the app with `#display` to boot straight into it. Navigation runs on hand tracking (MediaPipe Gesture Recognizer: 21 hand landmarks plus a gesture class, on device). Works best within about 2m of the camera.

| Do this | Caden does |
|---|---|
| Move your hand | An air cursor follows your index knuckle (it doesn't jump when you pinch). The pointing area shrinks with distance, so small moves reach every corner |
| Pinch thumb and index | Presses what's under the cursor; the ring fills as your fingers close |
| Pinch and drag up/down | Scrolls the list, like a finger on a phone (no press) |
| Make a fist | Rests the cursor so you can lower your hand |
| Wave | Calls Caden to this screen (or it waves back) |
| Thumbs up | Caden listens, like saying its name |
| Thumbs down | Back: closes Settings, stops Caden talking, or ends listening |
| Swipe left/right | Switches Settings tabs |

Targets get bigger, the type box hides, and a small hand preview (drawn from landmarks, never the camera image) shows you're being tracked. External links are not pressable, so a kiosk can't navigate away. Faces and hands share one camera stream (`js/camera.js`). For an unattended kiosk, launch Chrome with `--autoplay-policy=no-user-gesture-required` so Caden can speak without a first tap.

### LAN links

Every device opens a direct WebRTC data channel to every other device in the home (`js/lan.js`). On the same network that's a host-to-host connection: messages arrive in about **1 ms** instead of a cloud round trip (41-49 ms from a datacenter in testing, more from a home connection). Handoffs, claims, turns and face syncs go over the links; heartbeats go over both, so a device that just joined still finds everyone.

- Signaling (offer, answer, ICE) rides the encrypted Realtime channel, so the relay never sees SDP or local addresses.
- Either side may start; the higher id yields on a collision ("perfect negotiation").
- A device without a working link (no WebRTC, strict NAT) just keeps using the relay; a failed link retries after 10s.
- If the internet drops, devices that already have links keep working with each other (Caden still moves; the brain needs the internet).
- Settings → Home → Devices shows each link: **LAN** with its ping, **Direct** (peer to peer over the internet) or **Cloud**.

### Turns

Every exchange is a turn `{who, device, room, text, reply}`. `who` is the person recognized in front of the device (or the last speaker during a follow-up). The model sees the household conversation as `[Name] text` lines, so several people can take turns and Caden answers the right one. After answering, Caden keeps listening for ~8s without the wake word.

### Memory

When someone says something worth keeping, the model adds a `REMEMBER:` line (never spoken). The brain stores it in `home_memories` and feeds it back on every turn. Settings → Home → *What I remember* lists and forgets them.

## Repo

```
index.html            app shell
css/caden.css         design (warm light / cozy dark, rounded, springy; one coral accent, AA contrast)
fonts/                Fredoka + Nunito, self-hosted (OFL)
icons/ph/             Phosphor icon font, vendored (MIT)
js/app.js             the agent: holder election, handoffs, turns, voice loop, settings
js/mesh.js            encrypted messaging: LAN links first, then BroadcastChannel / Realtime relay
js/lan.js             WebRTC data channels between devices, path + ping
js/faces.js           face detection / recognition / enrollment
js/voice.js           ears, mouth, wake-word matching
js/brain.js           brain client (Supabase edge function, Cloak fallback)
js/orb.js             the orb and its flights
js/camera.js          one shared webcam stream (faces + hands)
js/hands.js           hand landmarks → air pointer, pinch, wave / swipe / thumbs gestures
js/airnav.js          air cursor, pinch press, pinch-drag scroll, gesture guide, hand preview
js/config.js          endpoints + tuning
android/              Android app: WebView serving the same files from assets + native speech bridge
supabase/             brain edge function + migration
.github/workflows/    ship.yml: APK → `latest` release + Pages (web + /caden.apk)
```

No build step for the web app — files ship as-is.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` (camera/mic need `localhost` or https). Open a second browser profile to act as a second device.

## Android

```bash
cd android && gradle assembleRelease
```

Needs JDK 17 + Android SDK 35. CI builds it on every push (`.github/workflows/ship.yml`), publishes `caden.apk` to the [`latest` release](../../releases/tag/latest) and to Pages at `/caden.apk`. Optional secrets for a stable signing key: `CADEN_KEYSTORE` (base64 .jks), `CADEN_KEYSTORE_PASS`, `CADEN_KEY_ALIAS`, `CADEN_KEY_PASS`.

The APK serves the bundled web app from `https://caden.app/` (intercepted, offline) and adds `window.CadenNative` (SpeechRecognizer + TextToSpeech). While it listens it mutes the notification/system streams so the recognizer's start chime doesn't ding on every wake-word cycle.

## Backend

- Supabase project **Caden** (`wiimiqqmdmfikuqgqhtm`): tables `home_turns`, `home_memories` (RLS on, service-role only), edge function `brain` (`supabase/functions/brain`). Homes are keyed by `sha256("caden-db:" + homeCode)` — the server never sees the code.
- The `home` tier lives in the Cloak worker (`UseCloakAI/cloak`, `api-worker/src/index.js` + `prompts.js` `HOME_PLAYBOOK`). Until that worker is deployed, the brain falls back to Cloak's `kairos` tier (also NVIDIA-first) with a short spoken-style note.

## Privacy

Video never leaves a device. Face descriptors and everything else on the mesh are encrypted with the home code. The brain stores turn text and memories per home hash; "Clear history" and "Forget" delete them.
