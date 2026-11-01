// Caden — the home agent. One Caden per home, living on whichever device
// someone is in front of. Every device listens for its name and watches for
// known faces; the device holding Caden ("the holder") runs the turns.
//
// Moving: a device that recognizes a known face asks the holder for Caden
// (`claim`). The holder lets go once it has seen nobody for a few seconds and
// isn't mid-turn, and sends `handoff` with a bumped epoch. Saying "Hey Caden"
// to any device summons it there right away. Highest epoch wins; ties go to
// the lower device id, so two devices can never both keep it.
import { TUNING, DEFAULT_WAKE } from './config.js';
import { store, uid, device, newHomeCode, normCode } from './store.js';
import { Mesh } from './mesh.js';
import { Faces } from './faces.js';
import { Ears, Mouth, findWake, normalize, hearingEngines } from './voice.js';
import { think, homeContext, homeId, brainSync, brainForget, brainClear, stripRemember } from './brain.js';
import { Orb, E } from './orb.js';
import { Hands } from './hands.js';
import { AirNav } from './airnav.js';

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
const settings = Object.assign({ cam: true, mic: true, engine: '', followUp: true, wake: DEFAULT_WAKE, voice: '', rate: 1, typing: false, awake: true, display: false }, store.get('settings', {}));
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
let air = null; // AirNav, built at boot (needs the DOM)
let orb, miniOrb, setupOrb;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const alive = () => people.filter((p) => !p.deleted);
const iHold = () => holder.id === me.id;

function toast(text) {
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

function giveTo(to, reason, person) {
  const epoch = holder.epoch + 1;
  holder = { id: to, epoch };
  mesh.send('handoff', { to, epoch, reason, person, fromName: me.room || me.name, turns: turns.slice(-12) });
  leaveHere(to, reason);
}

function onHandoff(from, d) {
  for (const t of d.turns || []) mergeTurn(t);
  if (!beats({ id: d.to, epoch: d.epoch }, holder) && !(d.to === holder.id && d.epoch === holder.epoch)) return;
  const was = holder.id;
  holder = { id: d.to, epoch: d.epoch };
  const fromDev = devices.get(from);
  if (fromDev) fromDev.last = now();
  if (d.to === me.id && was !== me.id) arriveHere(from, d.reason, d.person);
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
  if (reason !== 'quiet' && !$('here').hidden) await orb.leave(direction(me.id, to));
  moving = false;
  renderView(true);
  $('capYou').innerHTML = '';
  $('capSaid').textContent = '';
}

async function arriveHere(from, reason, person) {
  moving = true;
  setPhase('idle');
  renderView();
  renderDock();
  await orb.arrive(from ? direction(from, me.id) : 1);
  moving = false;
  activity = now();
  const p = person ? alive().find((x) => x.id === person.id) || person : (freshSight() ? lastSight.person : null);
  if (pending && now() - pending.at < 20000) {
    const job = pending; pending = null;
    runTurn(job.text, job.who);
  } else if (reason === 'voice' || reason === 'tap') {
    pending = null;
    listenNow();
  } else if (p && reason === 'face' && now() - (greeted.get(p.id) || 0) > 5 * 60 * 1000) {
    greeted.set(p.id, now());
    const hi = [`Hi ${p.name}!`, `Hey ${p.name}, I'm here.`, `Oh hi, ${p.name}.`][Math.floor(Math.random() * 3)];
    showSaid(hi);
    say(hi);
  }
  beat();
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
function listenNow() {
  if (iHold() && !(mode === 'command' && now() < modeUntil)) orb?.perk(); // heard you
  mode = 'command';
  modeUntil = now() + 7000;
  activity = now();
  if (iHold()) { setPhase('listening'); $('capYou').innerHTML = ''; }
}

function onHeard({ text, final }) {
  if (mouth.speaking || (moving && !iHold())) return;
  const t = now();
  if (mode === 'command' && t < modeUntil) {
    activity = t;
    if (iHold() && text && text !== '…') $('capYou').innerHTML = `<span>${esc(text)}</span>`;
    if (!final) { modeUntil = Math.max(modeUntil, t + 4000); return; }
    const w = findWake(text, settings.wake);
    const cmd = (w ? w.rest : text).trim();
    if (normalize(cmd).length < 2) { modeUntil = t + 6000; return; }
    handleCommand(cmd);
    return;
  }
  const w = findWake(text, settings.wake);
  if (!w) return;
  if (final && normalize(w.rest).length > 1) { handleCommand(w.rest); return; }
  listenNow();
  if (!iHold()) claim('voice', freshSight() ? lastSight.person : null);
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
async function runTurn(text, who) {
  if (!iHold()) return;
  activity = now();
  turnCtrl?.abort();
  turnCtrl = null;
  streaming = false;
  mouth.stop();
  if (STOP.test(normalize(text))) { mode = 'wait'; setPhase('idle'); $('capSaid').textContent = ''; return; }

  const turn = { id: uid(), who: who?.name || 'Someone', whoId: who?.id || null, device: me.name, room: me.room, text, reply: '', at: now() };
  if (who) lastSpeaker = { ...who, at: now() };
  mergeTurn(turn);
  mesh.send('turn', { turn });
  $('capYou').innerHTML = who ? `<b>${esc(who.name)}</b>“${esc(text)}”` : `“${esc(text)}”`;
  $('capSaid').textContent = '';
  setPhase('thinking');

  const ctrl = new AbortController();
  turnCtrl = ctrl;
  streaming = true;
  const context = homeContext({
    room: me.room, device: me.name,
    people: alive().map((p) => p.name),
    here: freshSight() ? [lastSight.person.name] : [],
  });
  try {
    const full = await think({
      home: home.id, turn, turns, system: context, signal: ctrl.signal,
      onSentence: (s) => {
        if (ctrl.signal.aborted || /^\s*REMEMBER:/i.test(s)) return;
        appendSaid(s);
        say(s);
      },
    });
    turn.reply = stripRemember(full) || '…';
  } catch (e) {
    if (ctrl.signal.aborted) return;
    turn.reply = "Sorry, I couldn't reach my brain just now. Try again in a moment.";
    orb.shake();
    appendSaid(turn.reply);
    say(turn.reply);
    console.warn('[caden] turn failed', e);
  }
  mergeTurn(turn);
  mesh.send('turn', { turn });
  if (turnCtrl !== ctrl) return; // a newer turn (or a move) took over
  turnCtrl = null;
  streaming = false;
  if (!mouth.speaking) afterSpeaking();
}

function say(s) {
  ears.pause();
  mouth.say(s);
}

function afterSpeaking() {
  if (streaming) return;
  ears.resume();
  if (!iHold()) return;
  activity = now();
  if (settings.followUp && phase !== 'idle') { mode = 'command'; modeUntil = now() + TUNING.followUpMs; setPhase('listening'); }
  else setPhase('idle');
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
  const setup = !home;
  $('setup').hidden = !setup;
  for (const id of ['top', 'stage', 'dock']) $(id).hidden = setup;
  if (setup) return;
  $('where').innerHTML = `${roomIcon(me.room)}${esc(me.room || me.name)}`;
  const here = iHold() || moving;
  document.documentElement.classList.toggle('is-away', !here);
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
    b.onclick = d.id === me.id && !iHold() ? () => claim('tap') : null;
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

function tickClock() {
  const d = new Date();
  $('clockTime').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('clockDate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── status dots ──────────────────────────────────────────────────────────────
function dot(id, cls, title) { const el = $(id); el.className = 'dot ' + cls; el.title = title; }
mesh.addEventListener('status', (e) => dot('dotNet', e.detail ? 'on' : 'warn', e.detail ? 'Linked with your home' : 'Reconnecting to your home…'));
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
    if (sheetTab) closeSheet();
    else if (iHold() && (mouth.speaking || phase === 'thinking')) orbTap();
    else if (mode === 'command') { mode = 'wait'; if (iHold()) setPhase('idle'); }
  } else if (name === 'swipe') {
    air?.swipe(dir);
  }
});

// ── wiring ───────────────────────────────────────────────────────────────────
ears.addEventListener('heard', (e) => onHeard(e.detail));
ears.addEventListener('level', (e) => orb?.level(e.detail));
faces.addEventListener('sight', (e) => onSight(e.detail));
let talkT = null;
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
      break;
    case 'bye':
      devices.delete(from);
      renderView();
      break;
    case 'people': mergePeople(data.list); break;
    case 'turn': mergeTurn(data.turn); break;
    case 'turns': for (const t of data.list || []) mergeTurn(t); break;
    case 'claim': onClaim(from, data); break;
    case 'handoff': onHandoff(from, data); break;
  }
});

// ── senses ───────────────────────────────────────────────────────────────────
function startSenses() {
  faces.setPeople(alive());
  if (settings.mic) ears.start(settings.engine); else ears.stop();
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWake(); });

// ── home lifecycle ───────────────────────────────────────────────────────────
async function enterHome(code) {
  code = normCode(code);
  home = { code, id: await homeId(code) };
  store.set('home', home);
  loadTurns();
  joinedAt = now();
  await mesh.join(code);
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
  if (draftNew) takeOver('first'); // a brand-new home: Caden starts right here
  startSenses();
  if (!alive().length) setTimeout(() => toast('Tip: add your face in Settings → People.'), 2500);
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

// ── settings sheet ───────────────────────────────────────────────────────────
let sheetTab = null;
function openSheet(tab) { sheetTab = tab; renderSheet(); }
function closeSheet() {
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

function toggleRow(key, label, sub) {
  return `<label class="line"><span class="grow">${label}<small>${sub}</small></span><input type="checkbox" class="toggle" data-set="${key}" ${settings[key] ? 'checked' : ''}></label>`;
}

function panel(tab) {
  if (tab === 'home') {
    const link = `${location.origin}${location.pathname}#join=${home.code}`;
    const devs = liveDevices();
    return `
      <div class="card"><h3>Home code</h3>
        <div class="code">${esc(home.code)}</div>
        <p class="fine" style="margin:0">Type this on another phone, tablet or laptop to add it to your home. Everything between your devices is encrypted with it.</p>
        <div class="row"><button class="btn small" data-act="copy" data-v="${esc(link)}">Copy invite link</button><button class="btn small ghost danger" data-act="leave">Leave home</button></div>
      </div>
      <div class="card"><h3>This device</h3>
        <div class="field"><label for="sName">Name</label><input class="input" id="sName" value="${esc(me.name)}" maxlength="24"></div>
        <div class="field"><label for="sRoom">Room</label><input class="input" id="sRoom" value="${esc(me.room)}" maxlength="24" list="roomList"><datalist id="roomList">${ROOMS.map((r) => `<option value="${r}">`).join('')}</datalist></div>
        <button class="btn small primary" data-act="saveDevice">Save</button>
      </div>
      <div class="card"><h3>Devices (${devs.length})</h3>
        ${devs.map((d) => `<div class="line"><span class="avatar" style="background:var(--bg2);color:var(--ink)">${roomIcon(d.room)}</span><span class="grow"><b>${esc(d.room || d.name)}</b><small>${esc(d.name)}, ${d.kind === 'app' ? 'Android app' : 'web'}</small>${d.sees ? `<small>Sees ${esc(d.sees.name)}</small>` : ''}</span>${d.id === me.id ? '<span class="badge soft">This one</span>' : ''}${d.id === holder.id ? '<span class="badge">Caden</span>' : ''}</div>`).join('')}
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
      ${isNative ? '' : '<a class="btn" href="caden.apk" download><i class="ph ph-android-logo" aria-hidden="true"></i>Get the Android app</a>'}
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
      <div class="card"><h3>My voice</h3>
        ${vs.length ? `<div class="field"><label for="sVoice">Voice</label><select class="input" id="sVoice"><option value="">Friendliest available</option>${vs.map((v) => `<option ${settings.voice === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : '<p class="fine" style="margin:0">Using this device\'s built-in voice.</p>'}
        <div class="field"><label for="sRate">Speed</label><input type="range" id="sRate" min="0.7" max="1.4" step="0.05" value="${settings.rate}"></div>
        <button class="btn small" data-act="testVoice">Test my voice</button>
      </div>`;
  }
  // turns
  const list = turns.slice().reverse();
  return `
    ${list.length ? list.slice(0, 80).map((t) => `<div class="turn"><div class="meta"><span><i class="ph ph-user" aria-hidden="true"></i>${esc(t.who)}</span><span>${roomIcon(t.room)}${esc(t.room || t.device)}</span><span><i class="ph ph-clock" aria-hidden="true"></i>${new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div><div class="q">${esc(t.text)}</div><div class="a">${esc(t.reply || '…')}</div></div>`).join('') : '<div class="empty">No turns yet. Say "Hey Caden".</div>'}
    ${list.length ? '<button class="btn small ghost danger" data-act="clearTurns">Clear history on every device</button>' : ''}`;
}

function bindPanel(host) {
  host.querySelectorAll('[data-set]').forEach((el) => (el.onchange = () => {
    settings[el.dataset.set] = el.checked;
    saveSettings();
    if (el.dataset.set === 'typing') applyTyping();
    if (el.dataset.set === 'mic' || el.dataset.set === 'cam') startSenses();
    if (el.dataset.set === 'display') { applyDisplay(); if (el.checked) toast('Point with your hand. Pinch to press.'); }
    if (el.dataset.set === 'awake') { if (el.checked) requestWake(); else wakeLock?.release().catch(() => {}); }
  }));
  const eng = host.querySelector('#sEngine');
  if (eng) eng.onchange = () => { settings.engine = eng.value; saveSettings(); if (settings.mic) { ears.stop(); ears.start(settings.engine); } };
  const v = host.querySelector('#sVoice');
  if (v) v.onchange = () => { settings.voice = v.value; mouth.voiceName = v.value; saveSettings(); };
  const rate = host.querySelector('#sRate');
  if (rate) rate.oninput = () => { settings.rate = Number(rate.value); mouth.rate = settings.rate; saveSettings(); };
  host.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => act(b.dataset.act, b)));
}

async function act(a, el) {
  if (a === 'copy') { try { await navigator.clipboard.writeText(el.dataset.v); toast('Invite link copied'); } catch { toast(el.dataset.v); } }
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
    toast(`Nice to meet you, ${name}!`);
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
  if (mode === 'command' && now() > modeUntil) {
    mode = 'wait';
    if (iHold() && phase === 'listening') setPhase('idle');
  }
  renderOrb();
}, 1000);
setInterval(() => { beat(); checkHolder(); renderDock(); }, TUNING.beatMs);
addEventListener('resize', () => renderDock());

// ── boot ─────────────────────────────────────────────────────────────────────
function boot() {
  orb = new Orb($('orb'));
  miniOrb = new Orb($('miniOrb'));
  miniOrb.set('sleepy');
  setupOrb = new Orb($('setupOrb'));
  $('orb').addEventListener('click', orbTap);
  $('orb').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orbTap(); } });
  document.addEventListener('pointerdown', () => mouth.unlock(), { once: true });
  mouth.rate = settings.rate;
  mouth.voiceName = settings.voice;
  applyTyping();
  tickClock();
  stopEnroll();
  air = new AirNav();
  if (/[?&]debug\b/.test(location.search)) window.__caden = { hands, air, settings }; // test hook
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
