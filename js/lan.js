// LAN links: direct device-to-device data channels (WebRTC), so a home's
// devices talk to each other over the local network in a few milliseconds
// instead of round-tripping through the cloud.
//
// - Signaling (offer / answer / ICE) rides the mesh's encrypted Realtime
//   channel, so the relay never sees SDP or local addresses in the clear.
// - Packets on a link are the same AES-GCM packets the mesh sends anywhere
//   else (and the channel itself is DTLS), so nothing changes upstream.
// - "Perfect negotiation": either side may start; the device with the
//   higher id is polite and yields on a collision.
// - Each link reports its path: 'lan' when both ends are host candidates
//   (same network), 'p2p' when it went through NAT, plus a measured RTT.
// - If a link can't be made (no WebRTC, different networks with strict NAT),
//   the mesh simply keeps using the cloud relay for that device.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const RETRY_MS = 10000;
const PING_MS = 4000;
export const MAX_DC = 200 * 1024; // bigger packets go through the relay

export class Lan extends EventTarget {
  // signal(to, data) sends a signaling message through the relay.
  // deliver(packet, via) hands a received packet back to the mesh.
  constructor(selfId, { signal, deliver }) {
    super();
    this.self = selfId;
    this.signalOut = signal;
    this.deliver = deliver;
    this.peers = new Map();
    this.cool = new Map(); // id -> time before which we won't retry a failed link
    this.known = new Map(); // every device heard from (any transport) -> last seen
    this.supported = typeof RTCPeerConnection === 'function';
    this.pingT = setInterval(() => this._pingAll(), PING_MS);
  }

  // Called for every message seen from a device: make sure we have a link.
  seen(id) {
    if (id === this.self) return;
    this.known.set(id, Date.now());
    if (!this.supported) return;
    const p = this.peers.get(id);
    if (p) { p.lastSeen = Date.now(); return; }
    if ((this.cool.get(id) || 0) > Date.now()) return; // failed recently; relay meanwhile
    this._open(id);
  }

  // Open data channel to `id`, or null.
  link(id) { const p = this.peers.get(id); return p?.dc?.readyState === 'open' ? p : null; }
  openLinks() { return [...this.peers.values()].filter((p) => p.dc?.readyState === 'open'); }
  // A device we've heard from recently that has no open link yet.
  // Includes devices whose link failed (and was dropped) or that can't do WebRTC.
  missing(maxAge = 15000) {
    const cut = Date.now() - maxAge;
    for (const [id, t] of this.known) if (t > cut && !this.link(id)) return true;
    return false;
  }

  // Summary for the UI: id -> {path, rtt}
  stats() {
    const out = {};
    for (const [id, p] of this.peers) if (p.dc?.readyState === 'open') out[id] = { path: p.path, rtt: p.rtt ?? null };
    return out;
  }

  sendTo(id, str) {
    const p = this.link(id);
    if (!p || str.length > MAX_DC) return false;
    try { p.dc.send(str); return true; } catch { return false; }
  }

  drop(id, { gone = false } = {}) {
    if (gone) this.known.delete(id);
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.dc?.close(); } catch { /* closed */ }
    try { p.pc.close(); } catch { /* closed */ }
    this._changed();
  }

  close() {
    clearInterval(this.pingT);
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  _open(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { id, pc, dc: null, polite: this.self > id, makingOffer: false, ignoreOffer: false, lastSeen: Date.now(), rtt: null, path: null, opened: 0 };
    this.peers.set(id, p);

    pc.onicecandidate = ({ candidate }) => { if (candidate) this.signalOut(id, { cand: candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.signalOut(id, { desc: pc.localDescription.toJSON() });
      } catch { /* superseded */ } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.peers.get(id) !== p) return;
        this.drop(id);
        // Try again later; until then the relay carries everything.
        this.cool.set(id, Date.now() + RETRY_MS);
      }
    };
    pc.ondatachannel = (e) => this._wire(p, e.channel);
    // The impolite side (lower id) opens the channel; that kicks off negotiation.
    if (!p.polite) this._wire(p, pc.createDataChannel('caden', { ordered: true }));
  }

  _wire(p, dc) {
    p.dc = dc;
    dc.onopen = () => { p.opened = Date.now(); this._path(p); this._ping(p); this._changed(); };
    dc.onclose = () => this._changed();
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      if (e.data.startsWith('{"ping"')) { try { dc.send(e.data.replace('"ping"', '"pong"')); } catch { /* closed */ } return; }
      if (e.data.startsWith('{"pong"')) {
        const sent = JSON.parse(e.data).pong;
        const rtt = performance.now() - sent;
        p.rtt = p.rtt == null ? rtt : p.rtt * 0.7 + rtt * 0.3;
        this._changed();
        return;
      }
      let packet; try { packet = JSON.parse(e.data); } catch { return; }
      p.lastSeen = Date.now();
      this.deliver(packet, 'link');
    };
  }

  // Signaling message from `id` (already decrypted by the mesh).
  async signal(id, { desc, cand }) {
    if (!this.supported) return;
    let p = this.peers.get(id);
    if (!p) { this.cool.delete(id); this._open(id); p = this.peers.get(id); }
    const pc = p.pc;
    try {
      if (desc) {
        const collision = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          this.signalOut(id, { desc: pc.localDescription.toJSON() });
        }
      } else if (cand) {
        try { await pc.addIceCandidate(cand); } catch (e) { if (!p.ignoreOffer) throw e; }
      }
    } catch { /* a stale offer or candidate; negotiation recovers on its own */ }
  }

  _ping(p) { try { p.dc.send(JSON.stringify({ ping: performance.now() })); } catch { /* closed */ } }
  _pingAll() { for (const p of this.openLinks()) this._ping(p); }

  // Which way did the connection go? host↔host = same LAN.
  async _path(p, tries = 0) {
    try {
      const stats = await p.pc.getStats();
      let pair = null;
      stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
      if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
      const l = pair && stats.get(pair.localCandidateId), r = pair && stats.get(pair.remoteCandidateId);
      p.path = l?.candidateType === 'host' && r?.candidateType === 'host' ? 'lan' : (l || r ? 'p2p' : null);
      // The selected pair isn't always in the stats the instant the channel opens.
      if (!p.path && tries < 8 && this.peers.get(p.id) === p) setTimeout(() => this._path(p, tries + 1), 250 * (tries + 1));
      this._changed();
    } catch { /* stats unavailable */ }
  }

  _changed() {
    clearTimeout(this.ct);
    this.ct = setTimeout(() => this.dispatchEvent(new CustomEvent('change', { detail: this.stats() })), 30);
  }
}
