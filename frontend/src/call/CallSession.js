import { io } from 'socket.io-client';
import { audioSnapshot } from './audioStats';

export function mediaError(error) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return 'Camera or microphone access was blocked. Allow access in your browser site settings, then try again.';
  if (error?.name === 'NotFoundError') return 'No camera or microphone was found. Connect a device, or join without it.';
  if (error?.name === 'NotReadableError') return 'Your camera or microphone is busy. Close other apps using it and try again.';
  return error?.message || 'Unable to start media. Check your device and browser permissions.';
}

export function requireMediaDevices() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera and microphone access requires HTTPS or localhost. Open the site using a secure address.');
}

export function peerConfiguration() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.REACT_APP_TURN_URL) iceServers.push({
    urls: process.env.REACT_APP_TURN_URL.split(','),
    username: process.env.REACT_APP_TURN_USERNAME,
    credential: process.env.REACT_APP_TURN_CREDENTIAL,
  });
  return { iceServers };
}

// Own devices, listeners and connections per call; never share global streams.
export default class CallSession {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.localStream = new MediaStream();
    this.peers = new Map();
    this.disposed = false;
    this.requested = false;
  }

  notifyMedia() {
    if (this.disposed) return;
    const media = {
      audio: this.localStream.getAudioTracks().some(t => t.enabled && t.readyState === 'live'),
      video: this.localStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live'),
      screen: Boolean(this.displayStream),
    };
    this.callbacks.onLocal?.(new MediaStream(this.localStream.getTracks()));
    this.callbacks.onMedia?.(media);
    this.socket?.emit('media-state', { audio: media.audio, video: media.screen || media.video });
  }

  async requestMedia(constraints = { audio: true, video: true }) {
    requireMediaDevices();
    this.requested = true;
    const failures = [];
    // Independent requests allow microphone-only or camera-only participation.
    for (const kind of ['audio', 'video']) {
      if (!constraints[kind]) continue;
      const existing = this.localStream.getTracks().find(t => t.kind === kind && t.readyState === 'live');
      if (existing) { existing.enabled = true; continue; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true });
        if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return; }
        for (const track of stream.getTracks()) {
          this.localStream.getTracks().filter(t => t.kind === track.kind).forEach(t => { this.localStream.removeTrack(t); t.stop(); });
          this.localStream.addTrack(track);
          track.onended = () => { this.notifyMedia(); this.syncTracks().catch(e => this.report(e)); };
        }
      } catch (error) { failures.push(mediaError(error)); }
    }
    await this.syncTracks();
    this.notifyMedia();
    this.callbacks.onError?.([...new Set(failures)].join(' '));
  }

  outgoingTrack(kind) {
    const stream = kind === 'video' && this.displayStream ? this.displayStream : this.localStream;
    return stream.getTracks().find(t => t.kind === kind && t.readyState === 'live') || null;
  }

  async collectAudioStats() {
    if (this.readingStats || this.disposed) return;
    this.readingStats = true;
    let localReported = false;
    try {
      await Promise.all([...this.peers.entries()].map(async ([id, peer]) => {
        try {
          const stats = await peer.pc.getStats();
          if (this.disposed || this.peers.get(id) !== peer) return;
          peer.audioReports ||= new Map();
          stats.forEach(report => {
            if (report.kind !== 'audio' && report.mediaType !== 'audio') return;
            if (!['media-source', 'inbound-rtp'].includes(report.type)) return;
            const snapshot = audioSnapshot(report, peer.audioReports.get(report.id));
            peer.audioReports.set(report.id, report);
            if (report.type === 'inbound-rtp') this.callbacks.onPeer?.({ id, audioStats: snapshot });
            if (report.type === 'media-source' && !localReported) {
              localReported = true;
              this.callbacks.onAudio?.(snapshot);
            }
          });
        } catch { /* Stats may become unavailable while a peer closes. */ }
      }));
    } finally { this.readingStats = false; }
  }

  async syncTracks() {
    await Promise.all([...this.peers.values()].flatMap(peer => ['audio', 'video'].map(kind => peer.senders[kind]?.replaceTrack(this.outgoingTrack(kind)))));
  }

  async toggle(kind) {
    const track = this.localStream.getTracks().find(t => t.kind === kind && t.readyState === 'live');
    if (!track) return this.requestMedia({ [kind]: true });
    track.enabled = !track.enabled;
    this.notifyMedia();
  }

  async stopScreen() {
    const display = this.displayStream;
    this.displayStream = null;
    display?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    await this.syncTracks();
    this.notifyMedia();
  }

  async toggleScreen() {
    if (this.displayStream) return this.stopScreen();
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is unavailable in this browser.');
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    if (this.disposed) { display.getTracks().forEach(t => t.stop()); return; }
    this.displayStream = display;
    display.getVideoTracks()[0].onended = () => this.stopScreen().catch(e => this.report(e));
    // Keep microphone audio while replacing only the video sender.
    await this.syncTracks();
    this.notifyMedia();
  }

  report(error) { if (!this.disposed) this.callbacks.onError?.(mediaError(error)); }

  join(url, room, name, videoId) {
    if (this.socket || this.disposed) return;
    const socket = io(url, { autoConnect: false });
    this.socket = socket;
    socket.on('connect', () => {
      this.clearPeers();
      this.callbacks.onStatus?.('Connected');
      socket.emit('join-call', room, name);
      this.notifyMedia();
      if (videoId) socket.emit('share-youtube-link', videoId);
    });
    socket.on('connect_error', () => this.callbacks.onStatus?.('Cannot reach the call server. Retrying…'));
    socket.on('disconnect', () => { this.clearPeers(); this.callbacks.onStatus?.('Disconnected. Reconnecting…'); });
    socket.on('user-joined', (joinedId, ids, names = {}) => {
      ids.filter(id => id !== socket.id).forEach(id => {
        const peer = this.ensurePeer(id, names[id]);
        // Only the newcomer offers; don't recreate existing calls on later joins.
        if (joinedId === socket.id && !peer.offered) {
          peer.offered = true;
          this.prepareOffer(peer);
          this.queue(peer, async () => {
            await peer.pc.setLocalDescription(await peer.pc.createOffer());
            this.signal(id, { sdp: peer.pc.localDescription });
          });
        }
      });
    });
    socket.on('signal', (id, message) => {
      if (id === socket.id || this.disposed) return;
      let data;
      try { data = JSON.parse(message); } catch { this.report(new Error('Received invalid call signaling.')); return; }
      const peer = this.ensurePeer(id);
      this.queue(peer, async () => {
        if (data.sdp) {
          await peer.pc.setRemoteDescription(data.sdp);
          for (const ice of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(ice);
          if (data.sdp.type === 'offer') {
            await this.prepareAnswer(peer);
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            this.signal(id, { sdp: peer.pc.localDescription });
          }
        }
        if (data.ice) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.ice);
          else peer.pendingIce.push(data.ice);
        }
      });
    });
    socket.on('user-left', id => this.removePeer(id));
    socket.on('media-state', (id, media) => { if (this.peers.has(id)) this.callbacks.onPeer?.({ id, media }); });
    socket.on('chat-message', msg => this.callbacks.onChat?.(msg));
    socket.on('youtube-video-shared', id => this.callbacks.onYoutube?.(id));
    socket.on('youtube-control', action => this.callbacks.onYoutubeControl?.(action));
    socket.connect();
  }

  queue(peer, operation) {
    peer.queue = peer.queue.then(() => {
      if (!this.disposed && peer.pc.signalingState !== 'closed') return operation();
    }).catch(e => this.report(e));
  }

  signal(id, value) { this.socket?.emit('signal', id, JSON.stringify(value)); }

  ensurePeer(id, name) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(peerConfiguration());
    const peer = { pc, stream: new MediaStream(), pendingIce: [], queue: Promise.resolve(), senders: {} };
    this.peers.set(id, peer);

    this.callbacks.onPeer?.({ id, name: name || 'Participant', stream: peer.stream, status: 'Connecting' });
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.signal(id, { ice: candidate }); };
    pc.ontrack = ({ track }) => {
      if (!peer.stream.getTracks().includes(track)) peer.stream.addTrack(track);
      const update = () => { if (!this.disposed && this.peers.get(id) === peer) this.callbacks.onPeer?.({ id, stream: new MediaStream(peer.stream.getTracks()) }); };
      track.onunmute = update;
      track.onended = update;
      update();
    };
    pc.onconnectionstatechange = () => this.callbacks.onPeer?.({ id, status: pc.connectionState });
    return peer;
  }

  prepareOffer(peer) {
    for (const kind of ['audio', 'video']) {
      peer.senders[kind] = peer.pc.addTransceiver(this.outgoingTrack(kind) || kind, {
        direction: 'sendrecv', streams: [this.localStream],
      }).sender;
    }
  }

  async prepareAnswer(peer) {
    // The remote offer creates the answerer's transceivers. Bind local tracks to
    // those exact senders; pre-creating others leaves them outside the answer.
    for (const transceiver of peer.pc.getTransceivers()) {
      const kind = transceiver.receiver.track.kind;
      if (!['audio', 'video'].includes(kind)) continue;
      transceiver.direction = 'sendrecv';
      transceiver.sender.setStreams(this.localStream);
      peer.senders[kind] = transceiver.sender;
      await transceiver.sender.replaceTrack(this.outgoingTrack(kind));
    }
  }
  removePeer(id) {
    const peer = this.peers.get(id);
    this.peers.delete(id);
    if (peer) {
      peer.pc.onconnectionstatechange = null; peer.pc.ontrack = null; peer.pc.onicecandidate = null;
      peer.stream.getTracks().forEach(track => { track.onunmute = null; track.onended = null; });
      peer.pc.close();
    }
    this.callbacks.onLeft?.(id);
  }

  clearPeers() { [...this.peers.keys()].forEach(id => this.removePeer(id)); }

  dispose() {
    this.disposed = true;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.clearPeers();
    [this.localStream, this.displayStream].forEach(stream => stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }));
  }
}
