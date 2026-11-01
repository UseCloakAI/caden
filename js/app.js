// Caden — the home agent. One Caden per home, living on whichever device
// someone is in front of. Every device listens for its name and watches for
// known faces; the device holding Caden ("the holder") runs the turns.
//
// Moving: a device that recognizes a known face asks the holder for Caden
// (`claim`). The holder lets go once it has seen nobody for a few seconds and
// isn't mid-turn, and sends `handoff` with a bumped epoch. Saying "Hey Caden"
// to any device summons it there right away. Highest epoch wins; ties go to
// the lower device id, so two devices can never both keep it.
import { TUNING, DEFAULT_WAKE, API, NV_VOICE, PUBLIC_URL } from './config.js';
import { qrSvg, QrScanner } from './qr.js';
import { store, uid, device, newHomeCode, normCode } from './store.js';
import { Mesh } from './mesh.js';
import { Faces } from './faces.js';
import { Ears, Mouth, findWake, normalize, hearingEngines } from './voice.js';
import { think, homeContext, homeId, brainSync, brainForget, brainClear, stripRemember, splitActions, speakable } from './brain.js';
import { E } from './orb.js';
import { Wave, quietOrb } from './wave.js';
import { Wheel } from './wheel.js';
import { Hands } from './hands.js';
import { AirNav } from './airnav.js';
import { Meter, score, pickLoudest } from './locate.js';
import { sfx } from './sfx.js';
import { where } from './where.js';
import { still } from './camera.js';
import { watchMotion } from './motion.js';
import { startGlobe } from './globe.js';
import { parseDuration, parseAlarm, sayLeft, showLeft } from './clocks.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const COLORS = ['#FF7A59', '#4FD1A1', '#67B7FF', '#FFC857', '#FF8FB1', '#3CC8C8', '#F2A65A', '#9AD36A'];
const ROOMS = ['Living room', 'Kitchen', 'Bedroom', 'Office', 'Kids room', 'Hallway', 'Garage'];
// Phosphor glyphs (icons/ph, vendored).
const ROOM_ICON = [[/kitchen|dining/i, 'cooking-pot'], [/living|lounge|family/i, 'couch'], [/bed/i, 'bed'], [/office|study|desk/i, 'desktop'],
  [/kid|nursery|play/i, 'baby'], [/bath/i, 'bathtub'], [/hall|entry|door/i, 'door'], [/garage|car/i, 'car'], [/garden|yard|patio/i, 'plant']];
const roomIcon = (r) => `<i class="ph ph-${(ROOM_ICON.find(([re]) => re.test(r || '')) || [0, 'house'])[1]}" aria-hidden="true"></i>`;
const isNative = !!window.CadenNative;

// ── state ────────────────────────────────────────────────────────────────────
const me = device();
me.kind = isNative ? 'app' : 'web';
let home = store.get('home');              // { code, id }
let people = store.get('people', []);      // [{id,name,color,d:[...],updated,deleted?}]
let turns = [];
let memories = [];
const settings = Object.assign({ cam: true, mic: true, engine: '', followUp: true, wake: DEFAULT_WAKE, voice: '', rate: 1, typing: false, awake: true, display: false, voiceEngine: 'nvidia', nvVoice: NV_VOICE, locate: true, voiceCal: null, sfx: true, sfxVol: 0.6, volume: 100, dim: 0, wakeHere: true, quality: 'auto', alertVol: 0.85, theme: 'auto' }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

const devices = new Map();                 // id -> {id,name,room,kind,last,holder,epoch,sees,phase}
let holder = { id: null, epoch: 0 };
let joinedAt = 0;
let phase = 'idle';                        // idle | listening | thinking | speaking (holder only)
let mode = 'wait', modeUntil = 0;          // 'command' = listening without the wake word
let lastSight = null;                      // {person, at}
let lastAnyFace = 0, lastKnownFace = 0, lastClaim = 0;
let lastSpeaker = null;
let activity = now();
let pending = null;                        // a command heard here before Caden arrived
let turnCtrl = null, streaming = false;
const greeted = new Map();                 // person id -> time
let moving = false;

const mesh = new Mesh(me.id);
const ears = new Ears();
const mouth = new Mouth();
const faces = new Faces($('cam'));
const hands = new Hands();
const qrScan = new QrScanner($('cam'));
const meter = new Meter(); // wake-word loudness, for finding the nearest device
let air = null; // AirNav, built at boot (needs the DOM)
let orb, miniOrb, setupOrb, wheel;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const alive = () => people.filter((p) => !p.deleted);
const iHold = () => holder.id === me.id;

function toast(text, sound = 'pop') {
  if (sound) sfx.play(sound);
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3300);
}

// ── devices & ordering ───────────────────────────────────────────────────────
function liveDevices() {
  const cut = now() - TUNING.staleMs;
  const list = [...devices.values()].filter((d) => d.last > cut);
  list.push({ ...me, last: now(), holder: iHold(), sees: freshSight() ? { id: lastSight.person.id, name: lastSight.person.name } : null, phase });
  return list.sort((a, b) => (a.room || a.name).localeCompare(b.room || b.name) || a.id.localeCompare(b.id));
}
const devLabel = (d) => d ? (d.room || d.name) : 'another room';
function direction(fromId, toId) {
  const list = liveDevices();
  const a = list.findIndex((d) => d.id === fromId), b = list.findIndex((d) => d.id === toId);
  return a < 0 || b < 0 || a === b ? 1 : Math.sign(b - a);
}
const freshSight = () => lastSight && now() - lastSight.at < TUNING.seenFreshMs;

// ── turns ────────────────────────────────────────────────────────────────────
function loadTurns() { turns = home ? store.get('turns.' + home.id, []) : []; }
function saveTurns() { if (home) store.set('turns.' + home.id, turns.slice(-TUNING.keepTurns)); }
function mergeTurn(t) {
  if (!t?.id) return;
  const i = turns.findIndex((x) => x.id === t.id);
  if (i >= 0) turns[i] = { ...turns[i], ...t };
  else turns.push(t);
  turns.sort((a, b) => a.at - b.at);
  saveTurns();
  if (sheetTab === 'turns') renderSheet();
}

// ── people ───────────────────────────────────────────────────────────────────
function mergePeople(list) {
  let changed = false;
  for (const p of list || []) {
    const i = people.findIndex((x) => x.id === p.id);
    if (i < 0) { people.push(p); changed = true; }
    else if ((p.updated || 0) > (people[i].updated || 0)) { people[i] = p; changed = true; }
  }
  if (changed) { store.set('people', people); faces.setPeople(alive()); if (sheetTab === 'people') renderSheet(); }
  return changed;
}
function sharePeople(to = null) { if (people.length) mesh.send('people', { list: people }, to); }

// ── holder election ──────────────────────────────────────────────────────────
function beats(a, b) { return a.epoch > b.epoch || (a.epoch === b.epoch && a.id && (!b.id || a.id < b.id)); }

function adoptHolder(id, epoch) {
  if (!beats({ id, epoch }, holder) && !(holder.id === id && holder.epoch === epoch)) return false;
  const was = holder.id;
  holder = { id, epoch };
  if (was === me.id && id !== me.id) leaveHere(id, 'quiet');
  renderView();
  return true;
}

function beat() {
  if (!home) return;
  const s = freshSight() ? { id: lastSight.person.id, name: lastSight.person.name } : null;
  mesh.send('beat', { name: me.name, room: me.room, kind: me.kind, holder: iHold(), hid: holder.id, epoch: holder.epoch, sees: s, phase });
}

// Who should pick Caden up when nobody has it: a device that sees someone,
// else the lowest id. Every device computes the same answer.
function bestCandidate() {
  const list = liveDevices().filter((d) => d.id !== holder.id || d.id === me.id);
  list.sort((a, b) => ((b.sees ? 1 : 0) - (a.sees ? 1 : 0)) || a.id.localeCompare(b.id));
  return list[0];
}

function checkHolder() {
  if (!home || now() - joinedAt < 3500) return;
  const h = holder.id && holder.id !== me.id ? devices.get(holder.id) : null;
  const gone = !holder.id || (holder.id !== me.id && (!h || h.last < now() - TUNING.staleMs));
  if (!gone) return;
  const pick = bestCandidate();
  if (pick?.id === me.id) takeOver(holder.id ? 'rescue' : 'first');
}

function takeOver(reason, person = null) {
  const epoch = holder.epoch + 1;
  const from = holder.id;
  holder = { id: me.id, epoch };
  mesh.send('handoff', { to: me.id, epoch, reason, person, fromName: null });
  arriveHere(from, reason, person);
}

// A non-holder asks for Caden. reason: 'face' | 'voice' | 'tap'
function claim(reason, person = null) {
  if (!home || iHold()) return;
  if (reason === 'face' && now() - lastClaim < 3000) return;
  lastClaim = now();
  const h = holder.id ? devices.get(holder.id) : null;
  if (!holder.id || !h || h.last < now() - TUNING.staleMs) { takeOver(reason, person); return; }
  mesh.send('claim', { reason, person: person ? { id: person.id, name: person.name } : null }, holder.id);
  if (reason !== 'face') {
    // Holder silent? Take it after a moment rather than leave someone waiting.
    const ep = holder.epoch;
    setTimeout(() => { if (!iHold() && holder.epoch === ep) takeOver(reason, person); }, 3500);
  }
}

function onClaim(from, { reason, person }) {
  if (!iHold() || moving) return;
  if (reason === 'face') {
    const busy = phase !== 'idle' || mouth.speaking || (mode === 'command' && now() < modeUntil);
    const someoneHere = now() - lastKnownFace < TUNING.holderQuietMs;
    if (busy || someoneHere) return;
  }
  if (reason !== 'face') { turnCtrl?.abort(); mouth.stop(); }
  giveTo(from, reason, person);
}

function giveTo(to, reason, person, line = null) {
  const epoch = holder.epoch + 1;
  holder = { id: to, epoch };
  mesh.send('handoff', { to, epoch, reason, person, line, fromName: me.room || me.name, turns: turns.slice(-12) });
  leaveHere(to, reason);
}

function onHandoff(from, d) {
  for (const t of d.turns || []) mergeTurn(t);
  if (!beats({ id: d.to, epoch: d.epoch }, holder) && !(d.to === holder.id && d.epoch === holder.epoch)) return;
  const was = holder.id;
  holder = { id: d.to, epoch: d.epoch };
  const fromDev = devices.get(from);
  if (fromDev) fromDev.last = now();
  if (d.to === me.id && was !== me.id) arriveHere(from, d.reason, d.person, d.line);
  else if (was === me.id && d.to !== me.id) leaveHere(d.to, d.reason);
  else renderView();
}

// ── moving between devices (the animations) ──────────────────────────────────
async function leaveHere(to, reason) {
  moving = true;
  turnCtrl?.abort();
  turnCtrl = null;
  streaming = false;
  mouth.stop();
  ears.resume();
  setPhase('idle');
  mode = 'wait';
  renderDock();
  if (reason !== 'quiet' && !$('here').hidden) {
    const dir = direction(me.id, to);
    sfx.play('whooshOut', { pan: dir * 0.5 }); // off toward the side it flies
    await orb.leave(dir);
  }
  moving = false;
  renderView(true);
  $('capYou').innerHTML = '';
  $('capSaid').textContent = '';
  setWide(false);
}

async function arriveHere(from, reason, person, line = null) {
  unlockScreen('quiet');
  moving = true;
  setPhase('idle');
  renderView();
  renderDock();
  await wakeForArrival();
  const dir = from ? direction(from, me.id) : 1;
  sfx.play('whooshIn', { pan: -dir * 0.4 });       // in from the side it came from
  sfx.play('land', { delay: 0.83 });                // the squash at 74% of the 1150 ms swoop
  await orb.arrive(dir);
  moving = false;
  activity = now();
  const p = person ? alive().find((x) => x.id === person.id) || person : (freshSight() ? lastSight.person : null);
  if (line) {
    // sent here to tell the room something ("go to the kitchen and tell them...")
    pending = null;
    sfx.play('announce', { force: true, alert: true });
    setTimeout(() => { showSaid(line); say(line); }, 900);
  } else if (pending && now() - pending.at < 20000) {
    const job = pending; pending = null;
    runTurn(job.text, job.who);
  } else if (reason === 'voice' || reason === 'tap') {
    pending = null;
    listenNow();
  } else if (p && reason === 'face' && now() - (greeted.get(p.id) || 0) > 5 * 60 * 1000) {
    greeted.set(p.id, now());
    const hi = [`Hi ${p.name}!`, `Hey ${p.name}, I'm here.`, `Oh hi, ${p.name}.`][Math.floor(Math.random() * 3)];
    sfx.play('sparkle');
    showSaid(hi);
    say(hi);
  }
  beat();
}

// ── waking an Android screen when Caden flies to it (CadenService.java) ─────
const NativeApp = () => window.CadenNative || null;
function applyKeepAlive() {
  try { NativeApp()?.keepAlive?.(!!(home && settings.wakeHere)); } catch { /* old APK */ }
}
// If this screen is asleep or in the background, wake it and wait until the
// page is actually visible, so the whole arrival plays where someone can see it.
async function wakeForArrival() {
  if (!document.hidden || !settings.wakeHere || !NativeApp()?.wake) return;
  try { NativeApp().wake(); } catch { return; }
  await new Promise((res) => {
    const done = () => { document.removeEventListener('visibilitychange', check); clearTimeout(t); setTimeout(res, 350); };
    const check = () => { if (!document.hidden) done(); };
    const t = setTimeout(done, 6000);
    document.addEventListener('visibilitychange', check);
  });
}
function wakePermissions() {
  try { return JSON.parse(NativeApp()?.wakeStatus?.() || 'null'); } catch { return null; }
}

// ── phases & the orb ─────────────────────────────────────────────────────────
function setPhase(p) {
  phase = p;
  renderOrb();
}
function renderOrb() {
  if (!orb) return;
  let s = 'idle';
  if (phase === 'thinking') s = 'thinking';
  else if (phase === 'speaking' || mouth.speaking) s = 'speaking';
  else if (mode === 'command' && now() < modeUntil) s = 'listening';
  else if (now() - activity > 3 * 60 * 1000) s = 'sleepy';
  if (orb.state === 'happy' && s === 'idle') return;
  orb.set(s);
  $('hint').style.opacity = s === 'idle' || s === 'sleepy' ? '1' : '0';
}

// ── hearing ──────────────────────────────────────────────────────────────────
// followUpOpen: listening on after an answer, no wake word needed, so what
// comes in might be people talking to each other, not to Caden.
let followUpOpen = false, endConversation = false;
function listenNow() {
  followUpOpen = false;
  unlockScreen('quiet');
  forceRest = false;
  if (iHold() && !(mode === 'command' && now() < modeUntil)) sfx.play('wake');
  if (iHold() && !(mode === 'command' && now() < modeUntil)) orb?.perk(); // heard you
  mode = 'command';
  modeUntil = now() + 7000;
  clockSoon = false;
  if (document.documentElement.classList.contains('resting')) { document.documentElement.classList.remove('resting'); placeClock(); }
  activity = now();
  if (iHold()) { setPhase('listening'); $('capYou').innerHTML = ''; }
}

function onHeard({ text, final }) {
  if (mouth.speaking || (moving && !iHold())) return;
  const t = now();
  if (calibrating && findWake(text, settings.wake)) { calibrate(); return; }
  if (mode === 'command' && t < modeUntil) {
    activity = t;
    if (iHold() && !arb && text && text !== '…') $('capYou').innerHTML = `<span>${esc(text)}</span>`;
    if (!final) { modeUntil = Math.max(modeUntil, t + 4000); return; }
    const w = findWake(text, settings.wake);
    const cmd = (w ? w.rest : text).trim();
    if (normalize(cmd).length < 2) { modeUntil = t + 6000; return; }
    if (arb) { arb.cmd = cmd; return; } // still deciding who's nearest
    handleCommand(cmd);
    return;
  }
  const w = findWake(text, settings.wake);
  if (!w || now() < quietUntil) return;
  if (calibrating) { calibrate(); return; }
  wake(final && normalize(w.rest).length > 1 ? w.rest : null);
}

// ── voice location: the loudest "Hey Caden" wins ─────────────────────────────
// Each device that hears the wake word scores how loud it was against its own
// close-up calibration and shares the score; after ARB_MS the loudest device
// takes Caden (and the command), the rest stand down. Alone, or with location
// off, a device acts right away like before.
const ARB_MS = 700;
let arb = null;            // {cmd, scores: Map(id → score)}
const heardEarly = [];     // scores that arrived before our own recognizer caught up
let quietUntil = 0;        // ignore the tail of an utterance we lost
let lastLocate = null;     // {win, scores, at} for Settings
let calibrating = null;

function wake(cmd) {
  if (arb) { if (cmd) arb.cmd = cmd; return; }
  const peak = settings.locate && meter.ok ? meter.peak() : null;
  const mine = score(peak, settings.voiceCal, meter.scale);
  if (mine == null || liveDevices().length < 2) { actOnWake(cmd); return; }
  arb = { cmd, scores: new Map([[me.id, mine]]) };
  for (const h of heardEarly) if (now() - h.at < 2000) arb.scores.set(h.from, h.score);
  mode = 'command'; modeUntil = now() + 7000; // keep collecting the command meanwhile
  mesh.send('heard', { score: mine });
  setTimeout(decideWake, ARB_MS);
}

function actOnWake(cmd) {
  if (cmd) { handleCommand(cmd); return; }
  listenNow();
  if (!iHold()) claim('voice', freshSight() ? lastSight.person : null);
}

function decideWake() {
  const a = arb;
  arb = null;
  const win = pickLoudest(a.scores, holder.id);
  lastLocate = { win, scores: Object.fromEntries(a.scores), at: Date.now() };
  if (win === me.id) actOnWake(a.cmd);
  else {
    mode = 'wait';
    quietUntil = now() + 2500;
    if (iHold() && phase === 'listening') setPhase('idle');
  }
  if (sheetTab === 'voice') renderSheet();
}

function onRemoteHeard(from, sc) {
  if (typeof sc !== 'number') return;
  if (arb) { arb.scores.set(from, sc); return; }
  heardEarly.push({ from, score: sc, at: now() });
  while (heardEarly.length && now() - heardEarly[0].at > 3000) heardEarly.shift();
}

// Calibrate: stand next to this device and say "Hey Caden".
function startCalibration() {
  if (!meter.ok) { toast('Turn on "Listen for my name" first.'); return; }
  calibrating = { until: now() + 10000 };
  renderSheet();
  setTimeout(() => {
    if (calibrating && now() >= calibrating.until) { calibrating = null; toast('I didn\'t hear "Hey Caden". Try again.'); renderSheet(); }
  }, 10100);
}
function calibrate() {
  // Let the phrase finish, then take its peak.
  const c = calibrating;
  calibrating = null;
  setTimeout(() => {
    const p = meter.peak();
    if (p == null || !c) { toast('Couldn\'t measure that. Try again.'); renderSheet(); return; }
    settings.voiceCal = { db: Math.round(p * 10) / 10, scale: meter.scale, at: Date.now() };
    saveSettings();
    orb?.hop();
    toast('Got it. This is how you sound up close.', 'success');
    renderSheet();
  }, 400);
}

function whoNow() {
  if (lastSight && now() - lastSight.at < 6000) return lastSight.person;
  if (lastSpeaker && now() - lastSpeaker.at < TUNING.followUpMs + 30000) return lastSpeaker;
  return null;
}

function handleCommand(text) {
  mode = 'wait';
  const who = whoNow();
  if (iHold() && !moving) { runTurn(text, who); return; }
  if (iHold()) { pending = { text, who, at: now() }; return; } // arriving: runs after the landing
  pending = { text, who, at: now() };
  claim('voice', who);
}

const STOP = /^(stop|cancel|never ?mind|be quiet|shh+|quiet|that's all|thanks that's all|nothing)\W*$/i;

// ── a turn ───────────────────────────────────────────────────────────────────
async function runTurn(text, who, step = false, images = null) {
  const overheard = !step && followUpOpen;
  followUpOpen = false;
  if (!iHold()) return;
  activity = now();
  turnCtrl?.abort();
  turnCtrl = null;
  streaming = false;
  mouth.stop();
  if (!step) agentSteps = 0;
  // "Hey Caden, dismiss / stop / snooze": whichever timers and alarms are
  // going off anywhere in the home, from whichever screen heard it
  const due = [...clocks.values()].filter((c) => c.at <= now() + 1000);
  if (due.length && /\b(stop|dismiss|turn (it|that|them) off|enough|okay|ok|snooze|quiet|silence|shut (it|that) off)\b/i.test(text)) {
    const snooze = /\bsnooze\b/i.test(text);
    for (const c of due) stopClock(c.id, snooze);
    sfx.play('cancel');
    setPhase('idle'); return;
  }
  if (STOP.test(normalize(text))) { mode = 'wait'; setPhase('idle'); $('capSaid').textContent = ''; return; }

  const turn = { id: uid(), who: who?.name || 'Someone', whoId: who?.id || null, device: me.name, room: me.room, text, reply: '', at: now() };
  if (who) lastSpeaker = { ...who, at: now() };
  mergeTurn(turn);
  mesh.send('turn', { turn });
  $('capYou').innerHTML = who ? `<b>${esc(who.name)}</b>“${esc(text)}”` : `“${esc(text)}”`;
  $('capSaid').textContent = '';
  setWide(false);
  setPhase('thinking');
  sfx.play('send');

  const ctrl = new AbortController();
  turnCtrl = ctrl;
  // "announce ...": hold Caden's own words until the reply is in. If the
  // announcement plays on this screen, they're dropped and only it is heard.
  const holdSpeech = /\bannounce|announcement|tell (everyone|everybody|the (whole )?house)\b/i.test(text);
  const held = [];
  streaming = true;
  const place = await Promise.race([where(), new Promise((r) => setTimeout(() => r(null), 1500))]).catch(() => null);
  const context = homeContext({
    room: me.room, device: me.name, place,
    rooms: liveDevices().map((d) => d.room || d.name),
    clocks: clockLines(),
    overheard,
    asked: (() => { const r = stripRemember(turns.filter((t) => t.id !== turn.id).at(-1)?.reply || '').trim(); const q = r.match(/[^.!?]*\?\s*$/); return q ? q[0].trim().slice(0, 160) : ''; })(),
    people: alive().map((p) => p.name),
    here: freshSight() ? [lastSight.person.name] : [],
  });
  try {
    const full = await think({
      home: home.id, turn, turns, system: context, where: place, images, signal: ctrl.signal,
      onSentence: (raw) => {
        const s = speakable(raw);
        if (ctrl.signal.aborted || !s || HIDDEN_LINE.test(s)) return;
        if (holdSpeech) { held.push(s); return; }
        appendSaid(s);
        say(s);
      },
    });
    turn.reply = stripRemember(full) || '…';
    const recent = [text, ...turns.slice(-3).filter((t) => t.whoId || t.who !== 'System').map((t) => t.text)].join(' ');
    var stepResult = runActions(splitActions(full), recent);
    if (stepResult.ignored) {
      $('capYou').innerHTML = ''; $('capSaid').textContent = '';
      turn.reply = '';
      if (!mouth.speaking) { endConversation = false; mode = 'wait'; setPhase('idle'); }
    }
    if (holdSpeech) {
      if (stepResult.announcedHere) setPhase('idle');
      else for (const h of held) { appendSaid(h); say(h); }
    }
    // A reply that was only actions: say what actually happened, briefly.
    if (!stripRemember(full) && stepResult.notes.length && !stepResult.more && !stepResult.announcedHere) {
      const line = stepResult.notes.join(' ');
      turn.reply = line; appendSaid(line); say(line);
    }
  } catch (e) {
    if (ctrl.signal.aborted) return;
    turn.reply = "I'm having trouble thinking right now. Ask me again in a moment.";
    orb.shake();
    sfx.play('error');
    appendSaid(turn.reply);
    say(turn.reply);
    console.warn('[caden] turn failed', e);
  }
  mergeTurn(turn);
  mesh.send('turn', { turn });
  if (turnCtrl !== ctrl) return; // a newer turn (or a move) took over
  turnCtrl = null;
  streaming = false;
  if (stepResult) nextStep(stepResult);
  if (!mouth.speaking) afterSpeaking();
}

// ── things Caden can do: DO: lines at the end of a reply (never spoken) ─────
const HIDDEN_LINE = /^\s*(REMEMBER:|DO:|<search\b)/i;
// Things to do once Caden has finished saying what it's doing (moving away,
// telling another room, announcing over its own voice).
let afterSpeech = [];
function later(fn) { afterSpeech.push(fn); }
function flushLater() { const jobs = afterSpeech; afterSpeech = []; jobs.forEach((fn, i) => setTimeout(fn, 300 + i * 150)); }

// The model sometimes adds a screen action nobody asked for; only act on the
// kind of thing someone in the conversation actually said.
const ASKED = {
  go: /\b(go|move|head|come|switch|send|jump|hop|over to|to the|in the)\b/i,
  dim: /\b(dim|dark|darker|bright|brighter|brightness|screen|light)\b/i,
  volume: /\b(volume|loud|louder|quiet|quieter|soft|softer|turn (it |yourself )?(up|down)|mute)\b/i,
  clock: /\b(clock|rest|sleep|idle|screensaver|that's all|good ?night)\b/i,
  lock: /\b(lock|sleep|dark|night|bed|screen off|turn (the )?screen off|good ?night|blank)\b/i,
};
const MAX_STEPS = 4;
let agentSteps = 0;

// Which screens: "everywhere" / "all", "here", or room / device names.
function resolveWhere(text) {
  const t = normalize(String(text || '')).trim();
  const list = liveDevices();
  if (!t || /^(everywhere|all|every ?(room|screen|device|where)|whole house|the house|all (rooms|screens|devices))$/.test(t)) return { ids: list.map((d) => d.id), missing: [] };
  const ids = new Set(), missing = [];
  // split the raw text (normalize drops commas), then try each part, then its words
  for (const raw of String(text).split(/\s*(?:,|;|\band\b|&|\+|\/)\s*/i).map((x) => normalize(x).trim()).filter(Boolean)) {
    const part = raw.replace(/^(the|in the|on the)\s+/, '');
    if (/^(here|this (one|room|screen))$/.test(part)) { ids.add(me.id); continue; }
    const d = findRoom(part);
    if (d) { ids.add(d.id); continue; }
    const byWord = part.split(/\s+/).map((w) => findRoom(w)).filter(Boolean);
    if (byWord.length) byWord.forEach((x) => ids.add(x.id)); else missing.push(part);
  }
  return { ids: [...ids], missing };
}
const roomsOf = (ids) => ids.map((id) => devLabel(liveDevices().find((d) => d.id === id))).join(', ');

// Run the DO: lines of a reply. Returns what happened, for the next agent step.
function runActions(full, said = '') {
  const notes = [];
  let more = false, announcedHere = false, ignored = false, look = false;
  const lines = String(full || '').split('\n');
  // "tell <room>" already takes Caden there; drop a "go" to the same room
  const told = new Set(lines.map((l) => l.match(/^\s*DO:\s*tell\s+([^|]+)\|/i)?.[1]).filter(Boolean).map((r) => findRoom(r.trim())?.id).filter(Boolean));
  for (const line of lines) {
    const m = line.match(/^\s*DO:\s*([a-z]+)\s*(.*)$/i);
    if (!m) continue;
    const verb = m[1].toLowerCase();
    const raw = m[2].trim().replace(/\s+to move.*$/i, '').replace(/\s{2,}\(.*\)\s*$/, '');
    const parts = raw.split('|').map((x) => x.trim());
    const arg = parts[0].replace(/[.]+$/, '');
    const kind = verb === 'bright' || verb === 'undim' ? 'dim' : verb;
    if (ASKED[kind] && !ASKED[kind].test(said)) continue;
    if (verb === 'continue') { more = true; continue; }
    if (verb === 'look') { look = true; continue; } // Caden wants to see: one still, then its next step
    if (verb === 'ignore') { endConversation = true; ignored = true; continue; } // not meant for Caden: stay silent
    if (verb === 'done') { endConversation = true; continue; }                    // conversation over: stop listening
    if (verb === 'go') {
      const d = findRoom(arg);
      if (d && told.has(d.id)) continue;
      if (d) later(() => sendTo(d, true)); else notes.push(`No screen called "${arg}" is on.`);
    } else if (verb === 'dim') { setDim(parseFloat(arg)); notes.push(`Screen dimmed to ${settings.dim}%.`); }
    else if (verb === 'bright' || verb === 'undim') setDim(0);
    else if (verb === 'volume') { setVolume(parseFloat(arg)); notes.push(`Volume is ${settings.volume}.`); }
    else if (verb === 'clock') clockSoon = true;
    else if (verb === 'lock') { later(lockScreen); notes.push('Screen locked: it wakes when someone moves in front of it.'); }
    else if (verb === 'announce') {
      const msg = (parts[1] || '').replace(/\s*\(.*\)\s*$/, '');
      const w = resolveWhere(arg);
      if (!msg) notes.push('Announce needs a message.');
      else if (!w.ids.length) notes.push(`Couldn't find ${w.missing.join(', ')} to announce on.`);
      else {
        if (w.ids.includes(me.id)) announcedHere = true;
        later(() => announce(msg, w.ids)); notes.push(`Announced on ${roomsOf(w.ids)}.`);
      }
      if (w.missing.length && w.ids.length) notes.push(`No screen called ${w.missing.join(', ')}.`);
    } else if (verb === 'tell') {
      const d = findRoom(arg), msg = (parts[1] || '').replace(/\s*\(.*\)\s*$/, '');
      if (!d) notes.push(`No screen called "${arg}" is on.`);
      else if (!msg) notes.push('Tell needs a message.');
      else { later(() => tellRoom(d, msg)); notes.push(`Went to ${devLabel(d)} to say it.`); }
    } else if (verb === 'timer' || verb === 'alarm') {
      const label = (parts[1] || (verb === 'timer' ? 'Timer' : 'Alarm')).slice(0, 40);
      const at = verb === 'timer' ? (parseDuration(arg) ? now() + parseDuration(arg) : null) : parseAlarm(arg);
      const w = resolveWhere(parts[2] || 'here');
      if (!at) notes.push(`Couldn't read "${arg}" as a ${verb === 'timer' ? 'duration' : 'time'}.`);
      else if (!w.ids.length) notes.push(`Couldn't find ${w.missing.join(', ')}.`);
      else {
        const c = setClock({ kind: verb, label, at, where: w.ids });
        notes.push(`${verb === 'timer' ? 'Timer' : 'Alarm'} "${c.label}" set on ${roomsOf(c.where)}, ${verb === 'timer' ? `goes off in ${sayLeft(c.at - now())}` : `for ${new Date(c.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}.`);
        if (w.missing.length) notes.push(`No screen called ${w.missing.join(', ')}.`);
      }
    } else if (verb === 'cancel') {
      const n = cancelClocks(arg);
      notes.push(n ? `Cancelled ${n} ${n === 1 ? 'one' : 'of them'}.` : `Nothing called "${arg}" is set.`);
    }
  }
  if (!mouth.speaking) flushLater();
  return { notes, more, announcedHere, ignored, look };
}

// Agent steps: if the model asked to continue (DO: continue), or one of its
// actions didn't work, it gets a [System] turn with what happened and keeps
// going, up to MAX_STEPS in a row.
function nextStep(result) {
  if (result.look && agentSteps < MAX_STEPS) {
    agentSteps++;
    const go = async () => {
      let img = null, why = '';
      notice({ key: 'look', icon: 'camera', title: 'Looking', body: 'One picture, just for this answer.', ms: 2500 });
      try { img = await still(); } catch (e) { why = String(e.message || e); }
      const asked = [...turns].reverse().find((t) => t.who !== 'System')?.text || '';
      const note = img
        ? `Results: the picture attached is what this screen's camera sees right now. They asked: "${asked}". ${result.notes.join(' ')} You're already looking, so don't say "let me look". Answer from what is actually in the picture, briefly; if you can't make it out, say so instead of guessing. Don't look again unless they ask.`
        : `Results: couldn't get a picture (${why || 'no camera'}). Tell them briefly.`;
      runTurn(note, { name: 'System', id: null }, true, img ? [img] : null);
    };
    if (mouth.speaking) later(go); else setTimeout(go, 200);
    return;
  }
  const failed = result.notes.some((n) => /^(no |couldn't|nothing|.* needs )/i.test(n));
  if (!(result.more || failed) || agentSteps >= MAX_STEPS) { agentSteps = 0; return; }
  agentSteps++;
  const note = `Results: ${result.notes.join(' ') || 'done.'} These are done; don't repeat them. ${result.more ? 'Take your next step if one is left, otherwise just confirm briefly.' : 'Tell them briefly what went wrong, or fix it.'}`;
  const go = () => runTurn(note, { name: 'System', id: null }, true);
  if (mouth.speaking) later(go); else setTimeout(go, 300);
}

function findRoom(name) {
  const q = normalize(String(name || '')).replace(/^the /, '');
  if (!q) return null;
  const list = liveDevices();
  return list.find((d) => normalize(d.room || '') === q) || list.find((d) => normalize(d.name || '') === q)
    || list.find((d) => normalize(`${d.room} ${d.name}`).includes(q) || q.includes(normalize(d.room || '\u0000')));
}

// Send Caden to a device (rooms bar, or "go to the kitchen").
function sendTo(d, quiet = false) {
  if (!d || d.id === holder.id) { if (!quiet) sfx.play('bump'); return; }
  if (d.id === me.id) { claim('tap'); return; }
  if (iHold()) giveTo(d.id, 'tap', null);
  else mesh.send('sendto', { to: d.id }, holder.id);
}
function setDim(v) {
  settings.dim = Math.max(0, Math.min(90, isFinite(v) ? v : 0));
  saveSettings(); applyDim();
}
function applyDim() {
  const el = $('dimmer');
  if (el) el.style.opacity = String((settings.dim / 100) * 0.9);
  if (!locked) { try { window.CadenNative?.setBrightness?.(settings.dim ? 1 - settings.dim / 100 : -1); } catch { /* old APK */ } }
}
function setVolume(v) {
  if (!isFinite(v)) return;
  settings.volume = Math.max(0, Math.min(100, v));
  saveSettings(); applyVolume();
}
function applyVolume() {
  mouth.volume = settings.volume / 100;
  sfx.setVolume(settings.sfxVol * (settings.volume / 100));
  sfx.setAlertVolume(settings.alertVol);
}

// ── resting: after a quiet minute the clock takes the middle of the screen ──
let clockSoon = false;
// ── lock: the screen goes almost dark, a faint clock stays; motion in front of
// the camera, a touch, a key or the wake word brings it back ─────────────────
let locked = false, stopMotion = null, forceRest = false;
function lockScreen() {
  if (locked) return;
  locked = true;
  wheel?.close(true);
  document.documentElement.classList.add('locked', 'resting');
  placeClock(true);
  try { window.CadenNative?.setBrightness?.(0.02); } catch { /* old APK */ }
  setTimeout(() => { if (locked) stopMotion = watchMotion(() => unlockScreen('motion')); }, 1500); // ignore the hand that asked
}
function unlockScreen(why = '') {
  if (!locked) return;
  locked = false;
  stopMotion?.(); stopMotion = null;
  document.documentElement.classList.remove('locked');
  activity = now(); forceRest = false;
  applyDim();
  if (why !== 'quiet') sfx.play('enter');
  setTimeout(() => { document.documentElement.classList.toggle('resting', isResting()); placeClock(true); }, 30);
}
// tap the clock: rest now, or come back
function toggleRest() {
  if (locked) { unlockScreen(); return; }
  if (document.documentElement.classList.contains('resting')) { forceRest = false; stir(); sfx.play('back'); }
  else { forceRest = true; document.documentElement.classList.add('resting'); placeClock(true); sfx.play('enter'); }
}

function isResting() {
  if (locked || forceRest) return true;
  if (clockSoon && phase === 'idle' && !mouth.speaking) return true;
  return now() - activity > 45000 && phase === 'idle' && !mouth.speaking && !streaming
    && !(mode === 'command' && now() < modeUntil) && !wheel?.open && !$('sheetHost').firstElementChild;
}
function stir(e) {
  if (e?.target?.closest?.('#clock')) return; // the clock's own tap toggles resting
  if (locked) { unlockScreen(); e?.preventDefault?.(); e?.stopPropagation?.(); return; }
  forceRest = false;
  activity = now(); clockSoon = false;
  if (document.documentElement.classList.contains('resting')) { document.documentElement.classList.remove('resting'); placeClock(); }
}

// ── announcements & telling a room ──────────────────────────────────────────
function announce(text, ids) {
  const from = me.room || me.name;
  for (const id of ids) {
    if (id === me.id) hearAnnouncement(text, from);
    else mesh.send('announce', { text, from }, id);
  }
}
function hearAnnouncement(text, from) {
  unlockScreen('quiet');
  if (document.hidden) { try { NativeApp()?.wake?.(); } catch { /* */ } }
  sfx.unlock();
  sfx.play('announce', { force: true, alert: true });
  notice({ icon: 'megaphone-simple', title: `Announcement${from && from !== (me.room || me.name) ? ` from the ${from}` : ''}`, body: text, ms: 20000 });
  setTimeout(() => { ears.pause(); mouth.say(text); }, 1500); // after the third tone
}
function tellRoom(d, text) {
  if (d.id === me.id && iHold()) { sfx.play('announce', { force: true, alert: true }); setTimeout(() => { showSaid(text); say(text); }, 900); return; }
  if (iHold()) giveTo(d.id, 'tell', null, text);
  else mesh.send('announce', { text, from: me.room || me.name }, d.id);
}

// ── timers & alarms ──────────────────────────────────────────────────────────
let clocks = new Map();        // id → { id, kind, label, at, where: [deviceIds], by }
const ringing = new Map();     // id → { loop, started }
function loadClocks() { clocks = new Map((home ? store.get('clocks.' + home.id, []) : []).map((c) => [c.id, c])); renderClocks(); }
function saveClocks() { if (home) store.set('clocks.' + home.id, [...clocks.values()]); }
function setClock(c, share = true) {
  const clock = { id: c.id || uid(), kind: c.kind, label: c.label, at: c.at, where: c.where, by: c.by || me.room || me.name };
  clocks.set(clock.id, clock);
  saveClocks(); renderClocks();
  if (share) mesh.send('clock', { op: 'set', clock });
  return clock;
}
function cancelClocks(what) {
  const q = normalize(String(what || ''));
  const hit = [...clocks.values()].filter((c) => !q || /^(all|everything|every(thing| timer| alarm)?)$/.test(q) || normalize(c.label).includes(q) || q.includes(normalize(c.label)) || (q.includes('timer') && c.kind === 'timer' && !q.replace('timer', '').trim()) || (q.includes('alarm') && c.kind === 'alarm' && !q.replace('alarm', '').trim()));
  for (const c of hit) stopClock(c.id);
  return hit.length;
}
function stopClock(id, snooze = false, share = true) {
  const c = clocks.get(id);
  const r = ringing.get(id);
  if (r) { clearInterval(r.loop); ringing.delete(id); }
  if (c && snooze) { setClock({ ...c, at: now() + 5 * 60e3 }, share); hideNotice('clock-' + id); return; }
  clocks.delete(id);
  saveClocks(); renderClocks(); hideNotice('clock-' + id);
  if (share) mesh.send('clock', { op: 'stop', id });
}
function onClockMessage(data) {
  if (data.op === 'set' && data.clock?.id) setClock(data.clock, false);
  else if (data.op === 'stop' && data.id) stopClock(data.id, false, false);
  else if (data.op === 'all') for (const c of data.list || []) if (!clocks.has(c.id) && c.at > now() - 600e3) setClock(c, false);
}
function ring(c) {
  if (ringing.has(c.id)) return;
  unlockScreen('quiet');
  if (document.hidden) { try { NativeApp()?.wake?.(); } catch { /* */ } }
  sfx.unlock();
  const sound = c.kind === 'alarm' ? 'alarm' : 'ring';
  const started = now();
  const play = () => sfx.play(sound, { force: true, alert: true, gain: Math.min(1, 0.4 + ((now() - started) / 45000) * 0.6) });
  play();
  ringing.set(c.id, { loop: setInterval(play, c.kind === 'alarm' ? 3900 : 3500), started });
  orb?.perk();
  notice({
    key: 'clock-' + c.id, icon: c.kind === 'alarm' ? 'alarm' : 'timer',
    title: c.label || (c.kind === 'alarm' ? 'Alarm' : 'Timer'),
    body: c.kind === 'alarm' ? new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Time is up.',
    actions: [['Stop', () => stopClock(c.id), true], ...(c.kind === 'alarm' ? [['Snooze 5 min', () => stopClock(c.id, true)]] : [])],
  });
}
function tickClocks() {
  const t = now();
  for (const c of clocks.values()) {
    if (c.at <= t && c.where.includes(me.id) && !ringing.has(c.id)) ring(c);
    if (c.at < t - 10 * 60e3) stopClock(c.id, false, false); // stop ringing after 10 minutes
  }
  renderClocks();
}
function clockLines() {
  if (!clocks.size) return [];
  return [...clocks.values()].sort((a, b) => a.at - b.at).map((c) => `${c.kind === 'timer' ? 'Timer' : 'Alarm'} "${c.label}" on ${roomsOf(c.where.filter((id) => liveDevices().some((d) => d.id === id))) || 'a screen that is off'}: ${ringing.has(c.id) ? 'ringing now' : c.kind === 'timer' ? `${sayLeft(c.at - now())} left` : new Date(c.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`);
}
// Countdown pills: built once per clock, then only their text changes (no
// rebuild every second, so nothing flashes).
function renderClocks() {
  const host = $('clocks');
  if (!host) return;
  const mine = [...clocks.values()].filter((c) => c.where.includes(me.id)).sort((a, b) => a.at - b.at).slice(0, 4);
  const want = new Set(mine.map((c) => c.id));
  let changed = false;
  for (const el of [...host.children]) if (!want.has(el.dataset.clock)) { el.remove(); changed = true; }
  mine.forEach((c, i) => {
    let el = host.querySelector(`[data-clock="${CSS.escape(c.id)}"]`);
    if (!el) {
      el = document.createElement('button');
      el.className = 'clock-pill';
      el.dataset.clock = c.id;
      el.innerHTML = `<i class="ph ph-${c.kind === 'alarm' ? 'alarm' : 'timer'}" aria-hidden="true"></i><span></span><b></b>`;
      el.onclick = () => { sfx.play('click'); stopClock(c.id); };
      changed = true;
    }
    if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
    const left = c.kind === 'timer' ? showLeft(c.at - now()) : new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const label = c.label || (c.kind === 'alarm' ? 'Alarm' : 'Timer');
    if (el.children[1].textContent !== label) el.children[1].textContent = label;
    if (el.children[2].textContent !== left) el.children[2].textContent = left;
    el.classList.toggle('ringing', ringing.has(c.id));
    el.setAttribute('aria-label', `${label}, ${c.kind === 'timer' ? sayLeft(c.at - now()) + ' left' : 'alarm at ' + left}. Tap to cancel.`);
  });
  if (changed) placeClock(true);
}

// ── the notice card: announcements and ringing timers ───────────────────────
function notice({ key = 'n' + uid(), icon, title, body, actions = [], ms = 0 }) {
  const host = $('notices');
  hideNotice(key, true);
  const el = document.createElement('div');
  el.className = 'notice';
  el.dataset.key = key;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<i class="ph ph-${icon} notice-icon" aria-hidden="true"></i><div class="notice-text"><b>${esc(title)}</b><span>${esc(body)}</span></div><div class="notice-actions"></div>`;
  const row = el.querySelector('.notice-actions');
  for (const [label, fn, primary] of actions.length ? actions : [['OK', () => hideNotice(key)]]) {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.textContent = label;
    b.onclick = () => { sfx.play('click'); fn(); };
    row.appendChild(b);
  }
  host.appendChild(el);
  if (ms) setTimeout(() => hideNotice(key), ms);
  return key;
}
function hideNotice(key, instant = false) {
  const el = document.querySelector(`.notice[data-key="${CSS.escape(key)}"]`);
  if (!el) return;
  if (instant || reduced()) { el.remove(); return; }
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 260);
}

function say(s) {
  ears.pause();
  mouth.say(s);
}

function afterSpeaking() {
  if (streaming) return;
  if (afterSpeech.length) flushLater();
  ears.resume();
  if (!iHold()) return;
  activity = now();
  // A while after a long answer, step back to the middle.
  if (wide) { clearTimeout(wideT); wideT = setTimeout(() => { if (!streaming && !mouth.speaking && phase !== 'thinking') setWide(false); }, 25000); }
  // the model said the conversation is over (DO: done) or that wasn't for it (DO: ignore)
  if (endConversation) { endConversation = false; followUpOpen = false; mode = 'wait'; setPhase('idle'); return; }
  if (settings.followUp && phase !== 'idle') { mode = 'command'; modeUntil = now() + TUNING.followUpMs; followUpOpen = true; setPhase('listening'); }
  else setPhase('idle');
}

// ── long replies: Caden steps aside (FLIP tween) ────────────────────────────
let wide = false, wideT = null;
function setWide(on) {
  clearTimeout(wideT);
  const here = $('here');
  if (wide === on) return;
  wide = on;
  if (here.hidden) { here.classList.toggle('wide', on); return; }
  const slot = here.querySelector('.orb-slot'), cap = here.querySelector('.caption');
  const first = slot.getBoundingClientRect();
  here.classList.toggle('wide', on);
  const last = slot.getBoundingClientRect();
  if (reduced() || !last.width) return;
  const dx = first.left - last.left, dy = first.top - last.top, k = first.width / last.width;
  slot.animate([
    { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${k})` },
    { transformOrigin: '0 0', transform: 'translate(0, 0) scale(1)' },
  ], { duration: 720, easing: 'cubic-bezier(.34,1.3,.64,1)' });
  cap.animate(on
    ? [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }]
    : [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
  { duration: 520, delay: 120, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
}
// Caden's words take the largest size that fits between the top bar and the
// wave (measured, not guessed from length), down to a floor; past the floor
// they scroll in place. The "Say Hey Caden" hint steps aside while words show.
// One run per frame at most (a sentence landing and the observer both ask).
// Within a reply the size only ever steps down, so the common case is a
// single measurement: "still fits at the current size" and done.
let fitQueued = false, fitSize = 0, fitText = 0;
function fitWords() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fitWordsNow(); });
}
function fitWordsNow() {
  const here = $('here'), cap = here?.querySelector('.caption'), said = $('capSaid');
  if (!cap || !said) return;
  const len = said.textContent.length;
  const has = len > 0 && !!said.textContent.trim();
  document.documentElement.classList.toggle('talking-words', has);
  if (!has) { said.style.fontSize = ''; fitSize = 0; fitText = 0; return; }
  const room = here.clientHeight - 8;
  if (fitSize && len >= fitText) {            // same reply, more words
    fitText = len;
    if (cap.scrollHeight <= room) return;      // still fits: one measurement
  } else { said.style.fontSize = ''; fitSize = 0; fitText = len; }
  const max = fitSize || parseFloat(getComputedStyle(said).fontSize);
  const min = innerWidth <= 720 ? 19 : 22;
  let lo = min, hi = max, best = min;
  for (let i = 0; i < 7; i++) { // binary search on the font size
    const mid = (lo + hi) / 2;
    said.style.fontSize = mid + 'px';
    if (cap.scrollHeight <= room) { best = mid; lo = mid; } else hi = mid;
  }
  said.style.fontSize = best.toFixed(1) + 'px';
  fitSize = best;
}
addEventListener('resize', () => fitWords());
queueMicrotask(() => { const el = document.getElementById('capSaid'); if (el) new MutationObserver(() => fitWords()).observe(el, { childList: true, characterData: true, subtree: true }); });
function fitCaption() {
  const cap = document.querySelector('.here .caption'), said = $('capSaid');
  $('here').classList.toggle('long', said.textContent.length > 150);
  fitWords();
  if (!wide && (said.textContent.length > 160 || cap.scrollHeight > cap.clientHeight + 4)) setWide(true);
  // follow the newest words unless someone scrolled up to reread
  if (cap.scrollHeight - cap.scrollTop - cap.clientHeight < 80 || !cap.dataset.read) cap.scrollTop = cap.scrollHeight;
}

function showSaid(text) { $('capSaid').innerHTML = ''; appendSaid(text); }
function appendSaid(text) {
  const el = $('capSaid');
  const words = String(text).split(/(\s+)/);
  const frag = document.createDocumentFragment();
  if (el.childNodes.length) frag.appendChild(document.createTextNode(' '));
  words.forEach((w, i) => {
    if (!w) return;
    if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
    const s = document.createElement('span');
    s.className = 'w';
    s.style.animationDelay = `${Math.min(i * 14, 280)}ms`; // i counts spaces too: 28ms a word, capped
    s.textContent = w;
    frag.appendChild(s);
  });
  el.appendChild(frag);
  // Keep the caption to the last few lines.
  while (el.childNodes.length > 160) el.removeChild(el.firstChild);
  fitCaption();
}

// ── seeing ───────────────────────────────────────────────────────────────────
function onSight({ faces: found }) {
  const t = now();
  if (!found.length) { if (t - lastAnyFace > 2000) orb?.lookAway(); return; }
  lastAnyFace = t;
  activity = t;
  orb?.look(found[0].x, found[0].y);
  const known = found.find((f) => f.person);
  if (!known) return;
  const wasFresh = freshSight() && lastSight.person.id === known.person.id;
  lastSight = { person: known.person, at: t };
  lastKnownFace = t;
  if (!iHold()) claim('face', known.person);
  else if (!wasFresh) beat();
}

// ── views ────────────────────────────────────────────────────────────────────
function renderView(animate = false) {
  requestAnimationFrame(() => placeClock());
  const setup = !home;
  $('setup').hidden = !setup;
  for (const id of ['top', 'stage', 'dock']) $(id).hidden = setup;
  if (setup) return;
  $('where').innerHTML = `${roomIcon(me.room)}${esc(me.room || me.name)}`;
  const here = iHold() || moving;
  document.documentElement.classList.toggle('is-away', !here);
  if (!moving) orb?.setAway?.(!here);
  $('here').hidden = !here;
  $('away').hidden = here;
  $('clock').style.opacity = here ? '1' : '.5';
  if (!here) {
    const h = holder.id ? devices.get(holder.id) : null;
    if (h) {
      $('awayTitle').textContent = `Caden is in the ${devLabel(h).toLowerCase()}`;
      $('awaySub').textContent = h.sees ? `Hanging out with ${h.sees.name}.` : (h.phase && h.phase !== 'idle' ? 'Talking with someone right now.' : 'Say "Hey Caden" and I\'ll come over.');
    } else {
      $('awayTitle').textContent = 'Looking for Caden…';
      $('awaySub').textContent = 'One moment.';
    }
    if (animate) { $('away').classList.remove('view-in'); void $('away').offsetWidth; $('away').classList.add('view-in'); }
  }
  renderDock();
}

// Dock: one chip per device, keyed by id so chips can pop in and out. The
// coral puck marks where Caden is; when Caden moves it stretches from the old
// chip to the new one, leading edge first, then the tail catches up.
let puckAt = null; // { id, x, w }
function renderDock() {
  const nav = $('rooms');
  const list = liveDevices();
  const have = new Map([...nav.querySelectorAll('.room')].filter((n) => !n.classList.contains('pop-out')).map((n) => [n.dataset.id, n]));
  const want = new Set(list.map((d) => d.id));
  for (const [id, n] of have) {
    if (want.has(id)) continue;
    if (reduced()) { n.remove(); continue; }
    n.classList.add('pop-out');
    n.addEventListener('animationend', () => { n.remove(); placePuck(); }, { once: true });
  }
  let prev = null;
  for (const d of list) {
    let b = have.get(d.id);
    if (!b) {
      b = document.createElement('button');
      b.dataset.id = d.id;
      if (joinedAt && now() - joinedAt > 1500) b.classList.add('pop-in');
      b.addEventListener('animationend', () => b.classList.remove('pop-in'), { once: true });
    }
    b.className = 'room' + (b.classList.contains('pop-in') ? ' pop-in' : '') + (d.id === me.id ? ' me' : '') + (d.id === holder.id ? ' holder' : '');
    const html = `<span class="k" aria-hidden="true">${roomIcon(d.room)}</span>${esc(d.room || d.name)}`;
    if (b.innerHTML !== html) b.innerHTML = html;
    b.setAttribute('aria-label', `${d.room || d.name}${d.id === holder.id ? ', Caden is here' : ''}${d.id === me.id ? ', this device' : ''}`);
    b.onclick = () => { sfx.play('click'); sendTo(d); };
    // keep DOM order = sorted order
    const after = prev ? prev.nextSibling : nav.querySelector('.puck').nextSibling;
    if (b !== after) nav.insertBefore(b, after);
    prev = b;
  }
  placePuck();
}

function placePuck() {
  const nav = $('rooms'), puck = $('puck');
  const target = nav.querySelector(`.room[data-id="${CSS.escape(holder.id || '')}"]:not(.pop-out)`);
  if (!target) { puck.style.opacity = '0'; puckAt = null; return; }
  const to = { id: holder.id, x: target.offsetLeft, w: target.offsetWidth };
  puck.style.opacity = '1';
  const moved = puckAt && puckAt.id !== to.id;
  if (moved && !reduced()) {
    const from = puckAt;
    const right = to.x > from.x;
    // Leading edge reaches the new chip first, the tail follows (gooey stretch).
    const midX = right ? from.x : to.x;
    const midW = right ? to.x + to.w - from.x : from.x + from.w - to.x;
    puck.getAnimations().forEach((a) => a.cancel());
    puck.animate([
      { translate: `${from.x}px 0`, width: `${from.w}px`, easing: E.in },
      { translate: `${midX}px 0`, width: `${midW}px`, scale: '1 .86', offset: 0.45, easing: E.out },
      { translate: `${to.x - (right ? -4 : 4)}px 0`, width: `${to.w}px`, scale: '1 1.04', offset: 0.8, easing: E.io },
      { translate: `${to.x}px 0`, width: `${to.w}px`, scale: '1 1' },
    ], { duration: 900 });
  }
  puck.style.translate = `${to.x}px 0`;
  puck.style.width = `${to.w}px`;
  puckAt = to;
}

// The clock lives in the top-right corner, and in the middle, large, while
// resting. Both are the same element moved by transform only (see css), with
// the date tagging along underneath.
const BIG = 200, DATE = 22;
let clockKey = '';
function placeClock(force = false) {
  const b = $('clockTime'), d = $('clockDate');
  if (!b || !d) return;
  const W = innerWidth, H = innerHeight, narrow = W <= 720;
  const resting = document.documentElement.classList.contains('resting');
  const pills = $('clocks');
  const nPills = pills ? pills.children.length : 0;
  const key = [W, H, resting, b.textContent, d.textContent, nPills].join('|');
  if (!force && key === clockKey) return;
  const tw = b.offsetWidth, th = b.offsetHeight, dw = d.offsetWidth, dh = d.offsetHeight;
  if (!tw) return; // stage hidden (setup); placed once it shows
  const first = !clockKey;
  clockKey = key;
  const wave = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wave-h')) || Math.max(150, Math.min(320, H * 0.3));
  const ob = $('btnOptions')?.getBoundingClientRect();
  const safeTop = ob && ob.height ? ob.top : 20; // the options button already sits under the status bar
  let ts, ds, tx, ty, dx, dy;
  if (pills) pills.classList.toggle('row', resting);
  const pillsH = nPills ? (resting ? 44 : nPills * 44) : 0;
  if (resting) {
    ds = Math.max(16, Math.min(22, W * 0.02)) / DATE;
    // fit time + date + the timer row between the top bar and the wave
    const room = H - wave - (safeTop + 70) - 20;
    const extra = 12 + dh * ds + (nPills ? 18 + pillsH : 0);
    ts = Math.min(Math.max(64, Math.min(200, W * 0.19)), (room - extra) / (th * 0.98) * BIG) / BIG;
    ts = Math.max(48 / BIG, ts);
    const blockH = th * ts * 0.98 + extra;
    const top = Math.max(safeTop + 70, safeTop + 70 + (room - blockH) / 2);
    tx = (W - tw * ts) / 2; ty = top;
    dx = (W - dw * ds) / 2; dy = top + th * ts * 0.98 + 12;
    if (pills) pills.style.setProperty('--clocks-top', `${dy + dh * ds + 18}px`);
  } else {
    const right = (narrow ? 22 : 34) + safeRight();
    ts = (narrow ? 26 : 34) / BIG; ds = 14 / DATE;
    tx = W - right - tw * ts; ty = safeTop + 4;
    dx = W - right - dw * ds; dy = ty + th * ts * 0.9 + 4;
    if (pills) pills.style.setProperty('--clocks-top', `${dy + dh * ds + 12}px`);
  }
  const clock = $('clock');
  if (first) clock.classList.add('no-anim');
  b.style.transform = `translate(${tx}px, ${ty}px) scale(${ts})`;
  d.style.transform = `translate(${dx}px, ${dy}px) scale(${ds})`;
  if (first) { void clock.offsetWidth; clock.classList.remove('no-anim'); clock.classList.add('placed'); }
}
addEventListener('resize', () => placeClock(true));
// Geist arriving changes the clock's width: measure again (the corner clock
// was overflowing the right edge when it was placed with the fallback font)
document.fonts?.ready.then(() => placeClock(true));
document.fonts?.addEventListener?.('loadingdone', () => placeClock(true));
// the screen's safe area on the right (rounded corners, cutouts, edge-to-edge APK)
let safeProbe = null;
function safeRight() {
  if (!safeProbe) { safeProbe = document.createElement('div'); safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-right:env(safe-area-inset-right)'; document.body.appendChild(safeProbe); }
  return parseFloat(getComputedStyle(safeProbe).paddingRight) || 0;
}

function tickClock() {
  const d = new Date();
  // Ribbon's sky: day 7am-7pm, night otherwise (or when the device is in dark mode)
  // theme: auto follows Ribbon's sky (night 7pm to 7am, or the device's dark mode)
  const auto = d.getHours() < 7 || d.getHours() >= 19 || matchMedia('(prefers-color-scheme: dark)').matches;
  const night = settings.theme === 'dark' ? true : settings.theme === 'light' ? false : auto;
  document.documentElement.classList.toggle('night', night);
  $('clockTime').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('clockDate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  placeClock();
}

// ── status dots ──────────────────────────────────────────────────────────────
function dot(id, cls, title) { const el = $(id); el.className = 'dot ' + cls; el.title = title; }
// Home link dot: direct LAN links first, then the cloud relay.
let linkStats = {};
function netDot() {
  const ls = Object.values(linkStats);
  const lan = ls.filter((l) => l.path === 'lan'), direct = ls.filter((l) => l.path !== 'lan');
  const ms = (arr) => { const r = arr.map((l) => l.rtt).filter((x) => x != null); if (!r.length) return ''; const m = Math.max(...r); return m < 1 ? ' (<1 ms)' : ` (${Math.round(m)} ms)`; };
  const cloud = mesh.online ? '' : ', cloud offline';
  if (lan.length) dot('dotNet', 'on', `Linked over your home network${ms(lan)}${cloud}`);
  else if (direct.length) dot('dotNet', 'on', `Linked directly${ms(direct)}${cloud}`);
  else if (mesh.online) dot('dotNet', 'on', 'Linked through the cloud');
  else dot('dotNet', 'warn', 'Reconnecting to your home…');
}
mesh.addEventListener('status', netDot);
mesh.addEventListener('links', (e) => {
  linkStats = e.detail;
  netDot();
  if (sheetTab === 'home') renderSheet();
});
const linkBadge = (id) => {
  if (id === me.id) return '';
  const l = linkStats[id];
  if (!l) return '<span class="badge soft" title="Messages go through the cloud">Cloud</span>';
  const ms = l.rtt != null ? ` ${l.rtt < 1 ? '<1' : Math.round(l.rtt)} ms` : '';
  return l.path === 'lan'
    ? `<span class="badge" title="Direct over your home network"><i class="ph ph-wifi-high" aria-hidden="true"></i> LAN${ms}</span>`
    : `<span class="badge soft" title="Direct, over the internet"><i class="ph ph-arrows-left-right" aria-hidden="true"></i> Direct${ms}</span>`;
};
ears.addEventListener('state', (e) => {
  const { state, engine } = e.detail;
  dot('dotMic', state === 'on' ? 'on' : state === 'off' ? '' : 'off', state === 'on' ? `Hearing (${engine})` : state === 'unsupported' ? 'No microphone support here' : state === 'denied' ? 'Microphone blocked' : 'Not hearing');
  if (state === 'denied') toast('Microphone is blocked. Allow it in your browser settings.');
});
// The camera dot covers both faces and body tracking.
function camDot() {
  const f = faces.state, b = hands.state;
  const any = (s) => f === s || b === s;
  if (any('denied')) { dot('dotCam', 'off', 'Camera blocked'); return; }
  if (any('loading')) { dot('dotCam', 'warn', 'Waking up my eyes…'); return; }
  if (f === 'on' || b === 'on') {
    dot('dotCam', 'on', [f === 'on' && 'Seeing faces', b === 'on' && 'Tracking hands'].filter(Boolean).join(' and ')); return;
  }
  if (any('error')) { dot('dotCam', 'off', 'Camera unavailable'); return; }
  dot('dotCam', '', 'Camera off');
}
faces.addEventListener('state', camDot);
hands.addEventListener('state', (e) => {
  camDot();
  if (e.detail.state === 'error') toast("Hand tracking couldn't start on this device.");
});

// ── touch-free display: hand gestures ───────────────────────────────────────
hands.addEventListener('pointer', (e) => { air?.pointer(e.detail); if (e.detail.active) activity = now(); });
hands.addEventListener('pose', (e) => { air?.pose(e.detail); if (e.detail.hands.length) activity = now(); });
hands.addEventListener('gesture', (e) => {
  const { name, dir } = e.detail;
  activity = now();
  if (name === 'wave') {
    air?.flash('wave', 'Wave');
    if (!iHold()) claim('tap', freshSight() ? lastSight.person : null); // come here
    else if (!moving) orb.hop();                                       // wave back
  } else if (name === 'thumbsUp') {
    air?.flash('thumbsUp', 'Listening');
    if (sheetTab) closeSheet();
    if (iHold()) { if (mouth.speaking || phase === 'thinking') orbTap(); else listenNow(); }
    else claim('voice', freshSight() ? lastSight.person : null); // arrives listening
  } else if (name === 'thumbsDown') {
    // Back: close Settings, or stop Caden mid-sentence, or end listening.
    air?.flash('thumbsDown', 'Back');
    if (wheel?.open) wheel.close();
    else if (sheetTab) closeSheet();
    else if (iHold() && (mouth.speaking || phase === 'thinking')) orbTap();
    else if (mode === 'command') { mode = 'wait'; if (iHold()) setPhase('idle'); }
  } else if (name === 'swipe') {
    if (wheel?.open) wheel.step(dir);
    else { sfx.play('swish', { pan: dir * 0.5 }); air?.swipe(dir); }
  }
});

// ── wiring ───────────────────────────────────────────────────────────────────
ears.addEventListener('heard', (e) => onHeard(e.detail));
ears.addEventListener('level', (e) => orb?.level(e.detail));
ears.addEventListener('rms', (e) => meter.push(e.detail));
faces.addEventListener('sight', (e) => onSight(e.detail));
let talkT = null;
// Caden's voice: NVIDIA Magpie through the Cloak API (`/v1/speech`, Cloak's
// NVIDIA key pool), else the device's own voice.
const VOICE_URL = `${API}/v1/speech`;
const VOICE_HEADERS = { 'Content-Type': 'application/json' };
let nvVoices = null; // [{name, lang}] from NVIDIA, loaded when Settings → Voice opens
const langOf = (name) => { const m = /\.([A-Z]{2})-([A-Z]{2})\./.exec(name || ''); return m ? `${m[1].toLowerCase()}-${m[2]}` : 'en-US'; };
function applyVoice() {
  warnedVoice = false;
  if (settings.voiceEngine === 'nvidia' && home) {
    const v = settings.nvVoice || NV_VOICE;
    // one language, from the voice's own name: the voices list's `lang` is every
    // language the model supports ("en-US,es-US,..."), which NVIDIA rejects
    mouth.useNvidia({ url: VOICE_URL, headers: VOICE_HEADERS, voice: v, lang: langOf(v), home: home.id });
  } else mouth.useNvidia(null);
}
async function loadNvVoices() {
  if (nvVoices) return nvVoices;
  const r = await fetch(`${VOICE_URL}/voices`);
  if (!r.ok) throw new Error(`voices ${r.status}`);
  nvVoices = (await r.json()).voices || [];
  return nvVoices;
}
let warnedVoice = false;
mouth.addEventListener('fallback', () => {
  if (warnedVoice) return;
  warnedVoice = true;
  toast("NVIDIA voice isn't reachable. Using this device's voice for now.");
});
mouth.addEventListener('start', () => {
  if (iHold()) setPhase('speaking');
  clearInterval(talkT);
  talkT = setInterval(() => orb?.talk(), 210);
});
mouth.addEventListener('end', () => {
  clearInterval(talkT);
  if (!streaming) afterSpeaking(); // mid-stream: the next sentence is on its way
});

mesh.addEventListener('msg', (e) => {
  const { from, type, data } = e.detail;
  const d = devices.get(from) || { id: from };
  d.last = now();
  devices.set(from, d);
  switch (type) {
    case 'beat':
      Object.assign(d, { name: data.name, room: data.room, kind: data.kind, holder: data.holder, epoch: data.epoch, sees: data.sees, phase: data.phase });
      if (data.holder) adoptHolder(from, data.epoch);
      else if (data.hid && data.hid !== me.id && data.hid !== holder.id && data.epoch > holder.epoch) adoptHolder(data.hid, data.epoch);
      if (iHold() && data.holder && beats({ id: from, epoch: data.epoch }, { id: me.id, epoch: holder.epoch })) adoptHolder(from, data.epoch);
      renderView();
      break;
    case 'hello':
      beat();
      sharePeople(from);
      if (iHold()) mesh.send('turns', { list: turns.slice(-30) }, from);
      if (clocks.size) mesh.send('clock', { op: 'all', list: [...clocks.values()] }, from);
      break;
    case 'bye':
      devices.delete(from);
      renderView();
      break;
    case 'people': mergePeople(data.list); break;
    case 'turn': mergeTurn(data.turn); break;
    case 'turns': for (const t of data.list || []) mergeTurn(t); break;
    case 'claim': onClaim(from, data); break;
    case 'announce': if (data.text) hearAnnouncement(String(data.text).slice(0, 400), String(data.from || '').slice(0, 40)); break;
    case 'clock': onClockMessage(data); break;
    case 'sendto': if (iHold() && data.to) { const d = liveDevices().find((x) => x.id === data.to); if (d) sendTo(d); } break;
    case 'heard': onRemoteHeard(from, data.score); break;
    case 'handoff': onHandoff(from, data); break;
  }
});

// ── senses ───────────────────────────────────────────────────────────────────
function startSenses() {
  faces.setPeople(alive());
  if (settings.mic) ears.start(settings.engine); else ears.stop();
  if (settings.mic && settings.locate) { if (ears.engine === 'native') meter.useFeed(); else meter.start(); }
  else meter.stop();
  if (settings.cam) faces.start(); else faces.stop();
  applyDisplay();
  requestWake();
}

// Touch-free display mode: body tracking drives an air cursor + gestures.
function applyDisplay() {
  air?.enable(!!settings.display && !!home);
  if (settings.display && home) hands.start(); else hands.stop();
  applyTyping();
  if (!$('hint')) return;
  $('hint').innerHTML = settings.display
    ? 'Wave, give a thumbs up, or say <kbd>Hey Caden</kbd>'
    : (/iPhone|iPad/.test(navigator.userAgent) && !isNative ? 'Tap me once, then say <kbd>Hey Caden</kbd>' : 'Say <kbd>Hey Caden</kbd>');
}
let wakeLock = null;
async function requestWake() {
  if (!settings.awake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  requestWake();
  applyKeepAlive();
  if (sheetTab === 'home' && $('sheetHost').firstElementChild) renderSheet();
});

// ── home lifecycle ───────────────────────────────────────────────────────────
async function enterHome(code) {
  code = normCode(code);
  home = { code, id: await homeId(code) };
  store.set('home', home);
  applyVoice(); // the voice function wants the home id
  loadTurns();
  loadClocks();
  joinedAt = now();
  await mesh.join(code);
  applyKeepAlive();
  renderView();
  setTimeout(() => mesh.send('hello', {}), 400);
  setTimeout(checkHolder, 3700);
  brainSync(home.id).then((r) => {
    for (const t of r.turns || []) mergeTurn(t);
    memories = r.memories || [];
    if (sheetTab === 'home') renderSheet();
  }).catch(() => {});
}

function leaveHome() {
  if (iHold()) handOffBeforeLeaving();
  mesh.send('bye', {});
  try { NativeApp()?.keepAlive?.(false); } catch { /* */ }
  setTimeout(() => { mesh.leave(); store.del('home'); location.hash = ''; location.reload(); }, 300);
}

function handOffBeforeLeaving() {
  const next = liveDevices().filter((d) => d.id !== me.id).sort((a, b) => (b.sees ? 1 : 0) - (a.sees ? 1 : 0))[0];
  if (next) giveTo(next.id, 'quiet', null);
}
addEventListener('pagehide', () => { if (!home) return; if (iHold()) handOffBeforeLeaving(); mesh.send('bye', {}); });

// ── onboarding ───────────────────────────────────────────────────────────────
let draft = null, draftNew = false;
function showStep(name) {
  if (name !== 'join' && qrScan.on) stopScan();
  document.querySelectorAll('.step').forEach((s) => { s.hidden = s.dataset.step !== name; });
  setupOrb?.hop();
  if (name === 'device') {
    $('devName').value = me.name;
    const chips = $('roomChips');
    chips.innerHTML = '';
    for (const r of ROOMS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.innerHTML = `${roomIcon(r)}${r}`;
      b.setAttribute('aria-pressed', String(me.room === r));
      b.onclick = () => { chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); $('roomOther').value = ''; draftRoom = r; };
      chips.appendChild(b);
    }
  }
}
let draftRoom = me.room;
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const go = b.dataset.go;
  if (go === 'create') { draft = newHomeCode(); draftNew = true; showStep('device'); return; }
  if (go === 'senses') {
    me.name = $('devName').value.trim() || me.name;
    me.room = $('roomOther').value.trim() || draftRoom || '';
    store.set('device', { id: me.id, name: me.name, room: me.room });
  }
  showStep(go);
}));
// Scan a join QR (shown in Settings on a device that's already in the home).
function stopScan() {
  qrScan.stop();
  $('qrBox').hidden = true;
  $('btnScan').innerHTML = '<i class="ph ph-qr-code" aria-hidden="true"></i>Scan QR code';
  stopEnroll(); // puts the camera <video> back where it lives
}
$('btnScan').onclick = async () => {
  if (qrScan.on) { stopScan(); return; }
  const box = $('qrBox'), vid = $('cam');
  box.hidden = false;
  box.prepend(vid);
  vid.hidden = false;
  vid.className = '';
  $('btnScan').innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>Stop scanning';
  try {
    await qrScan.start((code) => {
      stopScan();
      $('joinCode').value = code;
      toast(`Found ${code}`, 'success');
      draft = code;
      draftNew = false;
      showStep('device');
    });
    // Mirror the preview only for a front camera, so it feels natural.
    const s = vid.srcObject?.getVideoTracks?.()[0]?.getSettings?.() || {};
    box.classList.toggle('mirror', s.facingMode !== 'environment');
  } catch (e) {
    stopScan();
    toast(e?.name === 'NotAllowedError' ? 'Camera is blocked. Type the code instead.' : 'No camera here. Type the code instead.');
  }
};
$('btnJoin').onclick = () => {
  const c = normCode($('joinCode').value);
  if (c.length < 4) { $('joinCode').focus(); return; }
  draft = c;
  draftNew = false;
  showStep('device');
};
async function finishSetup(cam) {
  mouth.unlock();
  settings.mic = true;
  settings.cam = cam;
  saveSettings();
  await enterHome(draft);
  sfx.play('success');
  if (draftNew) takeOver('first'); // a brand-new home: Caden starts right here
  startSenses();
  if (!alive().length) setTimeout(() => toast('Add your face in Settings so I can follow you between rooms.'), 2500);
}
$('btnSenses').onclick = () => finishSetup(true);
$('btnMicOnly').onclick = () => finishSetup(false);

// ── controls ─────────────────────────────────────────────────────────────────
function orbTap() {
  mouth.unlock();
  if (!iHold()) return;
  if (mouth.speaking || phase === 'thinking') { orb.squish(); turnCtrl?.abort(); turnCtrl = null; streaming = false; mouth.stop(); mode = 'wait'; setPhase('idle'); return; }
  listenNow();
  if (!settings.mic) { settings.typing = true; saveSettings(); applyTyping(); $('typeIn').focus(); }
}
$('btnSummon').onclick = () => { mouth.unlock(); claim('tap', freshSight() ? lastSight.person : null); };
$('typebar').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('typeIn').value.trim();
  if (!v) return;
  $('typeIn').value = '';
  mouth.unlock();
  handleCommand(v);
});
function applyTyping() { $('typebar').hidden = !settings.typing || !!settings.display; }
$('btnSettings').onclick = () => openSheet('home');

// ── full screen (desktop) ───────────────────────────────────────────────────
// Desktop browsers only: a mouse/trackpad, and the Fullscreen API. Phones and
// the Android app already run edge to edge. F toggles it too.
const canFull = () => !isNative && document.fullscreenEnabled && matchMedia('(hover: hover) and (pointer: fine)').matches;
function syncFull() {
  const btn = $('btnFull');
  btn.hidden = !canFull();
  const on = !!document.fullscreenElement;
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  btn.title = on ? 'Exit full screen (F)' : 'Full screen (F)';
  btn.querySelector('.ph').className = `ph ph-corners-${on ? 'in' : 'out'}`;
}
async function toggleFull() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { toast("Full screen isn't available here."); }
}
$('btnFull').onclick = () => { mouth.unlock(); toggleFull(); };
document.addEventListener('fullscreenchange', () => { syncFull(); requestWake(); renderDock(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.ctrlKey || e.metaKey || e.altKey || sheetTab || !home || !canFull()) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  toggleFull();
});
matchMedia('(hover: hover) and (pointer: fine)').addEventListener('change', syncFull);
syncFull();

// ── the options wheel (top-left button) ─────────────────────────────────────
function buildWheel() {
  const items = [
    { id: 'talk', icon: 'microphone', label: 'Talk', run: () => { mouth.unlock(); sfx.unlock(); if (iHold()) listenNow(); else claim('voice', freshSight() ? lastSight.person : null); } },
    { id: 'here', icon: 'hand-waving', label: 'Call Caden here', run: () => { if (!iHold()) claim('tap', freshSight() ? lastSight.person : null); else orb.hop(); } },
    { id: 'home', icon: 'house', label: 'Home', run: () => openSheet('home') },
    { id: 'people', icon: 'users-three', label: 'People', run: () => openSheet('people') },
    { id: 'voice', icon: 'waveform', label: 'Voice', run: () => openSheet('voice') },
    { id: 'turns', icon: 'chats-circle', label: 'Turns', run: () => openSheet('turns') },
    { id: 'lock', icon: 'lock-simple', label: 'Lock screen', run: () => lockScreen() },
    { id: 'display', icon: 'hand-pointing', label: 'Touch-free', run: () => { settings.display = !settings.display; saveSettings(); applyDisplay(); toast(settings.display ? 'Touch-free on. Point with your hand.' : 'Touch-free off.'); } },
    { id: 'full', icon: 'corners-out', label: 'Full screen', run: () => toggleFull() },
  ];
  return new Wheel($('btnOptions'), items.filter((it) => it.id !== 'full' || canFull()));
}

// ── app updates (Android app; see Updater.java) ──────────────────────────────
// Web builds download in the background and apply on the next idle moment;
// a native (APK) update waits for a tap in Settings.
const N = () => window.CadenNative;
let appInfo = {};
let nativeNoticed = false;
function refreshAppInfo() { try { appInfo = JSON.parse(N()?.updateInfo?.() || '{}'); } catch { appInfo = {}; } }
function idleForUpdate() {
  return phase === 'idle' && !mouth.speaking && !moving && !streaming && !(mode === 'command' && now() < modeUntil)
    && !sheetTab && !enrolling && !qrScan.on && !calibrating;
}
function applyWhenIdle() {
  if (!idleForUpdate()) { setTimeout(applyWhenIdle, 10000); return; }
  toast('Updating Caden…');
  setTimeout(() => N()?.applyUpdate(), 1500);
}
if (isNative) {
  window.__cadenNative.onUpdate = (kind) => {
    refreshAppInfo();
    if (kind === 'web') applyWhenIdle();
    else if (!nativeNoticed) { nativeNoticed = true; toast('A new version of the app is ready. See Settings.'); }
    if (sheetTab === 'home') renderSheet();
  };
  refreshAppInfo();
}

// ── settings sheet ───────────────────────────────────────────────────────────
let sheetTab = null;
let qrUntil = 0, qrT = null; // join QR is shown on request, then hides itself
function openSheet(tab) { sfx.play('sheetOpen'); sheetTab = tab; renderSheet(); }
function closeSheet() {
  if (sheetTab) sfx.play('sheetClose');
  sheetTab = null;
  stopEnroll();
  const host = $('sheetHost');
  delete host.dataset.open;
  const done = () => { if (!sheetTab) host.innerHTML = ''; };
  const sheet = host.querySelector('.sheet');
  if (!sheet || reduced()) done();
  else {
    host.querySelector('.scrim')?.classList.add('closing');
    sheet.classList.add('closing');
    setTimeout(done, 250);
  }
  $('btnSettings').focus();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetTab) closeSheet(); });

function renderSheet() {
  if (!sheetTab) return;
  const host = $('sheetHost');
  const scroll = host.querySelector('.panel')?.scrollTop || 0;
  const tabs = [['home', 'Home'], ['people', 'People'], ['voice', 'Voice'], ['turns', 'Turns']];
  host.innerHTML = `
    <div class="scrim" data-close></div>
    <aside class="sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <header><h2>Settings</h2><button class="icon-btn" data-close aria-label="Close">
        <i class="ph ph-x" aria-hidden="true"></i></button></header>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === sheetTab}">${l}</button>`).join('')}</div>
      <div class="panel">${panel(sheetTab)}</div>
    </aside>`;
  if (host.dataset.open) host.querySelector('.sheet').style.animation = 'none';
  if (host.dataset.open) host.querySelector('.scrim').style.animation = 'none';
  host.dataset.open = '1';
  host.querySelector('.panel').scrollTop = scroll;
  host.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeSheet));
  host.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    if (b.dataset.tab === sheetTab) return;
    stopEnroll(); sheetTab = b.dataset.tab; renderSheet();
    host.querySelector('.panel').classList.add('swap');
  }));
  bindPanel(host);
}

function wakeCard() {
  const st = wakePermissions() || {};
  const need = [
    st.notifications === false && ['notifications', 'Allow notifications'],
    st.fullScreen === false && ['fullScreen', 'Allow waking over the lock screen'],
    st.overlay === false && ['overlay', 'Allow opening from the background'],
  ].filter(Boolean);
  return `<div class="card"><h3>Waking</h3>
    ${toggleRow('wakeHere', 'Wake this screen for Caden', 'Stays connected while asleep, and turns on when Caden moves here.')}
    ${settings.wakeHere && need.length ? `<p class="fine" style="margin:0">Android needs your OK for this to work while the phone is locked or in another app.</p>
      <div class="row">${need.map(([k, l]) => `<button class="btn small" data-act="wakePerm" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
  </div>`;
}

// Quality: Auto / Low / Medium / High. Same animations everywhere; lower levels
// draw the wave with fewer strands at a lower resolution and drop the blur.
const QUALITIES = ['auto', 'low', 'medium', 'high'];
const QUALITY_NOTE = {
  auto: (l) => `Picks for this device and steps down if it struggles. Now: ${l}.`,
  low: () => 'For older or slower screens. Solid panels, a lighter wave at 30 frames a second.',
  medium: () => 'A lighter wave and softer glass.',
  high: () => 'Full glass and the full wave.',
};
function qualityCard() {
  const i = QUALITIES.indexOf(settings.quality);
  const level = document.documentElement.dataset.quality || 'high';
  const themes = [['auto', 'Auto', 'circle-half'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']];
  return `<div class="card"><h3>Display</h3>
    <div class="field"><label>Theme</label><div class="chips" role="radiogroup" aria-label="Theme">${themes.map(([v, l, ic]) => `<button class="chip" type="button" role="radio" data-act="theme" data-v="${v}" aria-pressed="${settings.theme === v}" aria-checked="${settings.theme === v}"><i class="ph ph-${ic}" aria-hidden="true"></i>${l}</button>`).join('')}</div><small class="fine">Auto is light by day and dark from 7 pm, or dark whenever this device is in dark mode.</small></div>
    <div class="quality">
      <label for="sQuality" class="sr">Quality</label>
      <input type="range" id="sQuality" min="0" max="3" step="1" value="${i < 0 ? 0 : i}" aria-valuetext="${settings.quality}">
      <div class="stops" aria-hidden="true">${QUALITIES.map((q, k) => `<span class="${k === i ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</span>`).join('')}</div>
      <p class="fine" id="qualityNote" style="margin:0">${QUALITY_NOTE[settings.quality](level)}</p>
    </div>
  </div>`;
}
function refreshQuality() {
  const note = $('qualityNote');
  if (note) note.textContent = QUALITY_NOTE[settings.quality](document.documentElement.dataset.quality || 'high');
  document.querySelectorAll('.quality .stops span').forEach((el, k) => el.classList.toggle('on', QUALITIES[k] === settings.quality));
}

function toggleRow(key, label, sub) {
  return `<label class="line"><span class="grow">${label}<small>${sub}</small></span><input type="checkbox" class="toggle" data-set="${key}" ${settings[key] ? 'checked' : ''}></label>`;
}

function panel(tab) {
  if (tab === 'home') {
    const link = `${PUBLIC_URL}#join=${home.code}`;
    const showQr = now() < qrUntil;
    const devs = liveDevices();
    return `
      <div class="card"><h3>Home code</h3>
        <div class="code">${esc(home.code)}</div>
        <p class="fine" style="margin:0">Type this on another phone, tablet or laptop to add it to your home. Everything between your devices is encrypted with it.</p>
        <div class="qr-show" id="qrShow" ${showQr ? '' : 'hidden'} data-link="${esc(link)}"></div>
        ${showQr ? '<p class="fine" style="margin:0">Scan it in Caden\'s Join screen, or with any phone camera. Anyone who scans it can join, so it hides itself in 2 minutes.</p>' : ''}
        <div class="row"><button class="btn small ${showQr ? '' : 'primary'}" data-act="qr"><i class="ph ph-qr-code" aria-hidden="true"></i>${showQr ? 'Hide QR code' : 'Show QR code'}</button><button class="btn small" data-act="copy" data-v="${esc(link)}">Copy link</button></div>
        <button class="btn small ghost danger" data-act="leave">Leave home</button>
      </div>
      <div class="card"><h3>This device</h3>
        <div class="field"><label for="sName">Name</label><input class="input" id="sName" value="${esc(me.name)}" maxlength="24"></div>
        <div class="field"><label for="sRoom">Room</label><input class="input" id="sRoom" value="${esc(me.room)}" maxlength="24" list="roomList"><datalist id="roomList">${ROOMS.map((r) => `<option value="${r}">`).join('')}</datalist></div>
        <button class="btn small primary" data-act="saveDevice">Save</button>
      </div>
      ${qualityCard()}
      ${NativeApp()?.wake ? wakeCard() : ''}
      <div class="card"><h3>Devices (${devs.length})</h3>
        ${devs.map((d) => `<div class="line"><span class="avatar" style="background:var(--bg2);color:var(--ink)">${roomIcon(d.room)}</span><span class="grow"><b>${esc(d.room || d.name)}</b><small>${esc(d.name)}, ${d.kind === 'app' ? 'Android app' : 'web'}</small>${d.sees ? `<small>Sees ${esc(d.sees.name)}</small>` : ''}</span>${linkBadge(d.id)}${d.id === me.id ? '<span class="badge soft">This one</span>' : ''}${d.id === holder.id ? '<span class="badge">Caden</span>' : ''}</div>`).join('')}
      </div>
      <div class="card"><h3>Senses</h3>
        ${toggleRow('mic', 'Listen for my name', `Hearing: ${esc(ears.engine || hearingEngines()[0] || 'not supported')}`)}
        ${toggleRow('cam', 'Recognize faces', 'Lets me follow people between rooms. Video stays on this device.')}
        ${toggleRow('followUp', 'Keep listening after I answer', 'For a few seconds, no wake word needed')}
        ${toggleRow('typing', 'Show a type box', 'Talk to me with the keyboard')}
        ${toggleRow('awake', 'Keep screen awake', 'Good for a wall tablet or kitchen display')}
        ${toggleRow('display', 'Touch-free display', 'Navigate with your hand: point, pinch to press, pinch and drag to scroll, wave to call me. Needs a webcam.')}
      </div>
      <div class="card"><h3>What I remember</h3>
        ${memories.length ? memories.map((m) => `<div class="line"><span class="grow">${esc(m.fact)}<small>${esc(m.who || '')}</small></span><button class="btn small ghost" data-act="forget" data-id="${m.id}">Forget</button></div>`).join('') : '<div class="empty">Nothing yet. Tell me things worth remembering.</div>'}
      </div>
      ${isNative ? `<div class="card"><h3>App</h3>
        <div class="line"><span class="grow">Build ${esc(appInfo.build ?? '?')}<small>${appInfo.web === 'downloaded' ? 'Updated over the air' : 'As installed'}. Updates download by themselves and apply when I'm idle.</small></span>
          <button class="btn small" data-act="checkUpdate"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Check</button></div>
        ${appInfo.nativeUpdate ? '<button class="btn primary" data-act="installUpdate"><i class="ph ph-download-simple" aria-hidden="true"></i>Install app update</button><p class="fine" style="margin:0">Android will ask you to confirm. Allow installs from Caden if it asks.</p>' : ''}
        ${appInfo.nativeReinstall ? `<p class="fine" style="margin:0">A new app version is out that can't update in place. <a href="${PUBLIC_URL}caden.apk" target="_blank" rel="noopener">Download it</a> and reinstall.</p>` : ''}
      </div>` : '<a class="btn" href="caden.apk" download><i class="ph ph-android-logo" aria-hidden="true"></i>Get the Android app</a>'}
      <p class="fine foot">Powered by <a href="https://usecloak.org" target="_blank" rel="noopener">Cloak</a></p>`;
  }
  if (tab === 'people') {
    const list = alive();
    return `
      <div class="card"><h3>Add someone</h3>
        <p class="fine" style="margin:0">Look at this screen while I take a few quick looks. I only keep a face fingerprint, never a picture.</p>
        <div class="field"><label for="pName">Name</label><input class="input" id="pName" placeholder="Their name" maxlength="20"></div>
        <div class="cam-box" id="camBox" hidden><span class="ring"></span><span class="prog"><i id="camProg"></i></span></div>
        <button class="btn primary" data-act="enroll" id="btnEnroll">Learn this face</button>
      </div>
      ${list.length ? list.map((p) => `<div class="card"><div class="line"><span class="avatar" style="background:${esc(p.color)}">${esc(p.name[0] || '?')}</span><span class="grow"><b>${esc(p.name)}</b><small>${(p.d || []).length} looks</small></span><button class="btn small ghost" data-act="relearn" data-id="${p.id}">Add looks</button><button class="btn small ghost danger" data-act="forgetPerson" data-id="${p.id}">Remove</button></div></div>`).join('') : '<div class="empty">No one yet. Add the people who live here.</div>'}`;
  }
  if (tab === 'voice') {
    const vs = mouth.voices();
    const engines = hearingEngines();
    return `
      <div class="card"><h3>Wake words</h3>
        <div class="field"><label for="sWake">Separate with commas</label><input class="input" id="sWake" value="${esc(settings.wake.join(', '))}"></div>
        <button class="btn small primary" data-act="saveWake">Save</button>
      </div>
      <div class="card"><h3>Hearing</h3>
        <div class="field"><label for="sEngine">Engine</label><select class="input" id="sEngine">
          <option value="">Best available</option>
          ${engines.map((e) => `<option value="${e}" ${settings.engine === e ? 'selected' : ''}>${{ native: 'Android speech', browser: 'Browser speech', whisper: 'Cloak transcribe' }[e]}</option>`).join('')}
        </select></div>
      </div>
      <div class="card"><h3>Find me by voice</h3>
        ${toggleRow('locate', 'Go to the nearest screen', 'When several screens hear "Hey Caden", the one that heard you loudest answers.')}
        <div class="line"><span class="grow">${settings.voiceCal
          ? `Calibrated ${new Date(settings.voiceCal.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}<small>Your up-close level here: ${settings.voiceCal.db} dB</small>`
          : 'Not calibrated<small>Stand right next to this screen, tap Calibrate, then say "Hey Caden".</small>'}</span>
          <button class="btn small ${calibrating ? 'primary' : ''}" data-act="calibrate">${calibrating ? '<i class="ph ph-microphone" aria-hidden="true"></i>Say "Hey Caden"' : 'Calibrate'}</button></div>
        ${lastLocate ? `<div class="locate-result"><small>Last "Hey Caden"</small>${Object.entries(lastLocate.scores).sort((a, b) => b[1] - a[1]).map(([id, sc]) => {
          const d = id === me.id ? me : devices.get(id);
          return `<span class="${id === lastLocate.win ? 'win' : ''}">${roomIcon(d?.room)}${esc(d?.room || d?.name || 'Device')} <b>${sc >= 0 ? '+' : ''}${sc.toFixed(1)} dB</b></span>`;
        }).join('')}</div>` : ''}
      </div>
      <div class="card"><h3>Sounds</h3>
        ${toggleRow('sfx', 'Sound effects', 'Little chimes when I hear you, fly between rooms, or finish something.')}
        <div class="field"><label for="sSfxVol">Volume</label><input type="range" id="sSfxVol" min="0" max="1" step="0.05" value="${settings.sfxVol}"></div>
        <button class="btn small" data-act="sfxTest"><i class="ph ph-speaker-high" aria-hidden="true"></i>Play a sample</button>
        <div class="field"><label for="sAlertVol">Alerts volume</label><input type="range" id="sAlertVol" min="0" max="1" step="0.05" value="${settings.alertVol}"><small class="fine">Timers, alarms and announcements. They play even with sound effects off.</small></div>
        <button class="btn small" data-act="alertTest"><i class="ph ph-bell-ringing" aria-hidden="true"></i>Play the alert</button>
      </div>
      <div class="card"><h3>My voice</h3>
        <div class="chips" role="radiogroup" aria-label="Which voice">
          <button class="chip" type="button" role="radio" data-act="engine" data-v="nvidia" aria-pressed="${settings.voiceEngine === 'nvidia'}" aria-checked="${settings.voiceEngine === 'nvidia'}"><i class="ph ph-waveform" aria-hidden="true"></i>NVIDIA Magpie</button>
          <button class="chip" type="button" role="radio" data-act="engine" data-v="device" aria-pressed="${settings.voiceEngine !== 'nvidia'}" aria-checked="${settings.voiceEngine !== 'nvidia'}"><i class="ph ph-device-mobile-speaker" aria-hidden="true"></i>This device</button>
        </div>
        ${settings.voiceEngine === 'nvidia'
          ? (nvVoices
            ? `<div class="field"><label for="sNvVoice">Voice</label><select class="input" id="sNvVoice">${nvVoices.map((v) => `<option value="${esc(v.name)}" ${settings.nvVoice === v.name ? 'selected' : ''}>${esc(v.name.replace(/^Magpie-Multilingual\./, '').replace(/\./g, ' '))}</option>`).join('')}</select></div>`
            : '<p class="fine" style="margin:0" id="nvVoiceNote">Loading NVIDIA voices…</p>')
          : (vs.length ? `<div class="field"><label for="sVoice">Voice</label><select class="input" id="sVoice"><option value="">Friendliest available</option>${vs.map((v) => `<option ${settings.voice === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : '<p class="fine" style="margin:0">Using this device\'s built-in voice.</p>')}
        <p class="fine" style="margin:0">${settings.voiceEngine === 'nvidia' ? 'One natural voice on every screen. Needs the internet; falls back to the device voice if NVIDIA is busy.' : 'Works offline. Sounds different on each device.'}</p>
        <div class="field"><label for="sRate">Speed</label><input type="range" id="sRate" min="0.7" max="1.4" step="0.05" value="${settings.rate}"></div>
        <button class="btn small" data-act="testVoice">Test my voice</button>
      </div>`;
  }
  // turns
  const list = turns.slice().reverse();
  return `
    ${list.length ? list.slice(0, 80).map((t) => `<div class="turn"><div class="meta"><span><i class="ph ph-user" aria-hidden="true"></i>${esc(t.who)}</span><span>${roomIcon(t.room)}${esc(t.room || t.device)}</span><span><i class="ph ph-clock" aria-hidden="true"></i>${new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div><div class="q">${esc(t.text)}</div><div class="a">${esc(stripRemember(t.reply) || '…')}</div></div>`).join('') : '<div class="empty">No turns yet. Say "Hey Caden".</div>'}
    ${list.length ? '<button class="btn small ghost danger" data-act="clearTurns">Clear history on every device</button>' : ''}`;
}

function bindPanel(host) {
  host.querySelectorAll('[data-set]').forEach((el) => (el.onchange = () => {
    settings[el.dataset.set] = el.checked;
    sfx.play(el.checked ? 'toggleOn' : 'toggleOff');
    if (el.dataset.set === 'sfx') sfx.enabled = el.checked;
    saveSettings();
    if (el.dataset.set === 'typing') applyTyping();
    if (el.dataset.set === 'mic' || el.dataset.set === 'cam' || el.dataset.set === 'locate') startSenses();
    if (el.dataset.set === 'display') { applyDisplay(); if (el.checked) toast('Point with your hand. Pinch to press.'); }
    if (el.dataset.set === 'wakeHere') { applyKeepAlive(); renderSheet(); }
    if (el.dataset.set === 'awake') { if (el.checked) requestWake(); else wakeLock?.release().catch(() => {}); }
  }));
  const eng = host.querySelector('#sEngine');
  if (eng) eng.onchange = () => { settings.engine = eng.value; saveSettings(); if (settings.mic) { ears.stop(); ears.start(settings.engine); } };
  const qrBox = host.querySelector('#qrShow');
  if (qrBox && !qrBox.hidden) qrSvg(qrBox.dataset.link).then((svg) => { qrBox.innerHTML = svg; }).catch(() => { qrBox.textContent = 'Couldn\'t draw the QR code. Use Copy link instead.'; });
  const ql = host.querySelector('#sQuality');
  if (ql) ql.oninput = () => {
    const q = QUALITIES[Number(ql.value)] || 'auto';
    if (q === settings.quality) return;
    settings.quality = q; saveSettings();
    ql.setAttribute('aria-valuetext', q);
    sfx.play('tick', { dir: 1 });
    orb.setQuality(q);
    refreshQuality();
  };
  const av = host.querySelector('#sAlertVol');
  if (av) av.oninput = () => { settings.alertVol = Number(av.value); sfx.setAlertVolume(settings.alertVol); saveSettings(); };
  const vol = host.querySelector('#sSfxVol');
  if (vol) vol.oninput = () => { settings.sfxVol = Number(vol.value); sfx.setVolume(settings.sfxVol); saveSettings(); };
  const nv = host.querySelector('#sNvVoice');
  if (nv) nv.onchange = () => { settings.nvVoice = nv.value; saveSettings(); applyVoice(); };
  if (host.querySelector('#nvVoiceNote')) loadNvVoices().then(() => { if (sheetTab === 'voice') renderSheet(); })
    .catch(() => { const n = $('nvVoiceNote'); if (n) n.textContent = "Couldn't load NVIDIA voices right now. Using the default voice."; });
  const v = host.querySelector('#sVoice');
  if (v) v.onchange = () => { settings.voice = v.value; mouth.voiceName = v.value; saveSettings(); };
  const rate = host.querySelector('#sRate');
  if (rate) rate.oninput = () => { settings.rate = Number(rate.value); mouth.rate = settings.rate; saveSettings(); };
  host.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act, b)));
}

async function act(a, el) {
  if (a === 'copy') { try { await navigator.clipboard.writeText(el.dataset.v); toast('Invite link copied'); } catch { toast(el.dataset.v); } }
  if (a === 'theme') { settings.theme = el.dataset.v; saveSettings(); sfx.play('toggleOn'); tickClock(); renderSheet(); return; }
  if (a === 'alertTest') { sfx.unlock(); sfx.play('ring', { force: true, alert: true }); return; }
  if (a === 'wakePerm') { try { NativeApp()?.openWakeSettings?.(el.dataset.v); } catch { /* */ } return; }
  if (a === 'leave' && confirm('Leave this home on this device?')) leaveHome();
  if (a === 'saveDevice') {
    me.name = $('sName').value.trim() || me.name;
    me.room = $('sRoom').value.trim();
    store.set('device', { id: me.id, name: me.name, room: me.room });
    beat(); renderView(); renderSheet(); toast('Saved');
  }
  if (a === 'forget') { memories = memories.filter((m) => String(m.id) !== el.dataset.id); renderSheet(); brainForget(home.id, Number(el.dataset.id)).catch(() => {}); }
  if (a === 'saveWake') {
    const w = $('sWake').value.split(',').map((x) => normalize(x)).filter((x) => x.length > 2);
    settings.wake = w.length ? w : DEFAULT_WAKE;
    saveSettings(); renderSheet(); toast('Wake words saved');
  }
  if (a === 'sfxTest') { sfx.unlock(); sfx.play('wake'); sfx.play('whooshIn', { delay: 0.6 }); sfx.play('land', { delay: 1.43 }); sfx.play('success', { delay: 2.2 }); }
  if (a === 'checkUpdate') { N()?.checkUpdate(); toast('Checking for updates…'); setTimeout(() => { refreshAppInfo(); if (sheetTab === 'home') renderSheet(); }, 5000); }
  if (a === 'installUpdate') { N()?.installUpdate(); toast('Downloading the update…'); }
  if (a === 'qr') {
    qrUntil = now() < qrUntil ? 0 : now() + 120000;
    clearTimeout(qrT);
    if (qrUntil) qrT = setTimeout(() => { qrUntil = 0; if (sheetTab === 'home') renderSheet(); }, 120000);
    renderSheet();
  }
  if (a === 'calibrate') { if (calibrating) { calibrating = null; renderSheet(); } else startCalibration(); }
  if (a === 'engine') { settings.voiceEngine = el.dataset.v; saveSettings(); applyVoice(); warnedVoice = false; renderSheet(); }
  if (a === 'testVoice') { mouth.unlock(); mouth.stop(); say(`Hi! I'm Caden. I'm in the ${me.room || 'room'} with you.`); }
  if (a === 'clearTurns' && confirm('Clear the conversation history on every device?')) {
    turns = []; saveTurns(); renderSheet();
    brainClear(home.id).catch(() => {});
  }
  if (a === 'enroll' || a === 'relearn') enroll(a === 'relearn' ? el.dataset.id : null);
  if (a === 'forgetPerson') {
    const p = people.find((x) => x.id === el.dataset.id);
    if (p && confirm(`Forget ${p.name}'s face?`)) {
      Object.assign(p, { deleted: true, d: [], updated: now() });
      store.set('people', people); faces.setPeople(alive()); sharePeople(); renderSheet();
    }
  }
}

// Enrollment borrows the hidden camera <video> and shows it in the sheet.
let enrolling = false;
async function enroll(existingId) {
  if (enrolling) return;
  const name = existingId ? people.find((p) => p.id === existingId)?.name : $('pName').value.trim();
  if (!name) { $('pName').focus(); toast('Type their name first'); return; }
  enrolling = true;
  const box = $('camBox'), vid = $('cam'), btn = $('btnEnroll');
  if (box) { box.hidden = false; box.prepend(vid); vid.hidden = false; vid.className = ''; }
  if (btn) { btn.disabled = true; btn.textContent = 'Looking…'; }
  try {
    const d = await faces.enroll(6, (i, n) => { const p = $('camProg'); if (p) p.style.scale = `${i / n} 1`; });
    if (existingId) {
      const p = people.find((x) => x.id === existingId);
      p.d = [...(p.d || []), ...d].slice(-18);
      p.updated = now();
    } else {
      people.push({ id: uid(), name, color: COLORS[alive().length % COLORS.length], d, updated: now() });
    }
    store.set('people', people);
    faces.setPeople(alive());
    sharePeople();
    toast(`Nice to meet you, ${name}!`, 'success');
    if (iHold()) { orb.hop(); say(`Nice to meet you, ${name}.`); }
    if (!settings.cam) { settings.cam = true; saveSettings(); }
  } catch (e) {
    toast(e.message || 'Could not learn that face');
  } finally {
    enrolling = false;
    stopEnroll();
    renderSheet();
  }
}
function stopEnroll() {
  const vid = $('cam');
  if (vid.parentElement !== document.body) { document.body.appendChild(vid); }
  vid.hidden = false;
  vid.className = 'cam-hidden';
}

// ── ticks ────────────────────────────────────────────────────────────────────
setInterval(() => {
  tickClock();
  tickClocks();
  const was = document.documentElement.classList.contains('resting');
  document.documentElement.classList.toggle('resting', isResting());
  if (was !== document.documentElement.classList.contains('resting')) placeClock();
  if (mode === 'command' && now() > modeUntil) {
    mode = 'wait';
    if (iHold() && phase === 'listening') { setPhase('idle'); sfx.play('cancel'); }
  }
  renderOrb();
}, 1000);
setInterval(() => { beat(); checkHolder(); renderDock(); }, TUNING.beatMs);
addEventListener('resize', () => renderDock());

// ── boot ─────────────────────────────────────────────────────────────────────
function boot() {
  startGlobe($('globe'));
  orb = new Wave($('wave'));            // Caden is the wave
  orb.speech = () => mouth.speech();      // speaking swells it with the real voice
  orb.onLevel = (level) => { document.documentElement.dataset.quality = level; if (sheetTab === 'home' && $('sheetHost').firstElementChild) refreshQuality(); };
  orb.setQuality(settings.quality);
  orb.mirror = $('orb'); orb.set('idle');
  miniOrb = quietOrb;
  miniOrb.set('sleepy');
  setupOrb = { ...quietOrb, hop: () => orb.hop() };
  wheel = buildWheel();
  // Touch the wave: tap to talk; drag across it and it surges under your
  // finger with soft plucks pitched by height (Ribbon's value sound).
  let waveDrag = null;
  $('orb').addEventListener('pointerdown', (e) => { waveDrag = { x: e.clientX, y: e.clientY, moved: 0, last: 0 }; });
  addEventListener('pointermove', (e) => {
    if (!waveDrag) return;
    const dx = e.clientX - waveDrag.x;
    waveDrag.moved += Math.abs(dx) + Math.abs(e.clientY - waveDrag.y);
    waveDrag.x = e.clientX; waveDrag.y = e.clientY;
    orb.energy += dx * 0.02;
    orb.pulse = Math.min(1, orb.pulse + Math.abs(dx) * 0.004);
    const now = performance.now();
    if (waveDrag.moved > 12 && now - waveDrag.last > 90) { waveDrag.last = now; sfx.play('value', { value: 1 - e.clientY / innerHeight, pan: (e.clientX / innerWidth) * 2 - 1, gain: 0.7 }); }
  });
  addEventListener('pointerup', () => { if (waveDrag && waveDrag.moved > 12) waveDrag.dragged = true; setTimeout(() => (waveDrag = null), 0); });
  $('orb').addEventListener('click', (e) => { if (waveDrag?.dragged) { e.stopImmediatePropagation(); return; } orbTap(); });
  $('orb').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orbTap(); } });
  document.addEventListener('pointerdown', () => { mouth.unlock(); sfx.unlock(); }, { once: true });
  document.addEventListener('keydown', () => sfx.unlock(), { once: true });
  sfx.enabled = settings.sfx;
  sfx.setVolume(settings.sfxVol);
  sfx.unlock(); // allowed in the app and on kiosks; elsewhere it waits for the first tap
  const giveVoiceMeter = () => { if (sfx.ctx) mouth.audioCtx = sfx.ctx; };
  giveVoiceMeter();
  document.addEventListener('pointerdown', giveVoiceMeter, { once: true });
  mouth.rate = settings.rate;
  applyVolume(); applyDim();
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, stir, { capture: true });
  $('clock').addEventListener('click', (e) => { e.stopPropagation(); toggleRest(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && ringing.size) for (const id of [...ringing.keys()]) stopClock(id); });
  where().catch(() => {});
  mouth.voiceName = settings.voice;
  applyVoice();
  applyTyping();
  tickClock();
  stopEnroll();
  air = new AirNav();
  air.onPress = () => sfx.play('click');
  if (/[?&]debug\b/.test(location.search)) window.__caden = { wheel: () => wheel, setWide: (v) => setWide(v), appendSaid: (t) => appendSaid(t), hands, air, settings, mesh, meter, sfx, onHeard, holder: () => holder, lastLocate: () => lastLocate, runActions: (f, t) => runActions(f, t), mouth, wave: () => orb, clocks: () => clocks, ringing: () => ringing, announce: (t, ids) => announce(t, ids), resolveWhere: (t) => resolveWhere(t), runTurn: (t, w, s, i) => runTurn(t, w, s, i), lock: () => lockScreen(), unlock: () => unlockScreen(), locked: () => locked, toggleRest: () => toggleRest(), rest: () => { activity = 0; } }; // test hook
  // #display boots straight into touch-free mode (kiosk screens).
  if (/(^|[#&])display\b/.test(location.hash)) { settings.display = true; saveSettings(); }
  applyDisplay();

  const join = (location.hash.match(/join=([\w-]+)/) || [])[1];
  if (join && (!home || normCode(join) !== home.code)) {
    home = null;
    store.del('home');
    renderView();
    showStep('join');
    $('joinCode').value = normCode(join);
    return;
  }
  renderView();
  if (home) { enterHome(home.code); startSenses(); }
  else showStep('hello');
}
boot();
