import { io } from 'socket.io-client';
import CallSession from './CallSession';
jest.mock('socket.io-client', () => ({ io: jest.fn() }));

class Stream {
  constructor(tracks = []) { if (tracks.some(t => !t.kind)) throw new TypeError('Invalid track'); this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(t => t !== track); }
}
const track = kind => ({ kind, enabled: true, readyState: 'live', stop: jest.fn() });
let socket;
let handlers;
beforeEach(() => {
  global.MediaStream = Stream;
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(), getDisplayMedia: jest.fn() } });
  global.RTCPeerConnection = jest.fn(() => ({
    signalingState: 'stable', remoteDescription: null,
    addTransceiver: jest.fn(value => ({ sender: { track: typeof value === 'string' ? null : value, replaceTrack: jest.fn().mockResolvedValue() } })),
    setRemoteDescription: jest.fn(async function (sdp) { this.remoteDescription = sdp; }),
    setLocalDescription: jest.fn(async function (sdp) { this.localDescription = sdp; }),
    getTransceivers: jest.fn(() => ['audio', 'video'].map(kind => ({ receiver: { track: { kind } }, sender: { setStreams: jest.fn(), replaceTrack: jest.fn().mockResolvedValue() } }))),
    createOffer: jest.fn().mockResolvedValue({ type: 'offer' }), createAnswer: jest.fn().mockResolvedValue({ type: 'answer' }),
    addIceCandidate: jest.fn().mockResolvedValue(), close: jest.fn(),
  }));
  handlers = {};
  socket = { id: 'self', on: jest.fn((name, fn) => { handlers[name] = fn; }), emit: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn() };
  io.mockReturnValue(socket);
});

test('device-free joins create receive-capable peers without constructing fake tracks or duplicate sockets', () => {
  const call = new CallSession(); call.join('server', 'room', 'You'); call.join('server', 'room', 'You');
  handlers.connect(); handlers['user-joined']('self', ['self', 'other']);
  expect(io).toHaveBeenCalledTimes(1);
  expect(call.peers.size).toBe(1);
  expect(call.peers.get('other').pc.addTransceiver).toHaveBeenCalledWith('audio', expect.objectContaining({ direction: 'sendrecv' }));
  call.dispose(); expect(socket.disconnect).toHaveBeenCalled();
});

test('camera denial preserves microphone and reports a usable error', async () => {
  const mic = track('audio'); const onError = jest.fn();
  navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(new Stream([mic])).mockRejectedValueOnce({ name: 'NotAllowedError' });
  const call = new CallSession({ onError }); await call.requestMedia();
  expect(call.localStream.getAudioTracks()).toEqual([mic]);
  expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('blocked'));
  await call.toggle('audio'); expect(mic.enabled).toBe(false); expect(mic.stop).not.toHaveBeenCalled();
});

test('third participant does not recreate existing peers or offer from existing participants', () => {
  const call = new CallSession(); call.join('server', 'room', 'You');
  handlers['user-joined']('other', ['self', 'other']); const first = call.peers.get('other');
  handlers['user-joined']('third', ['self', 'other', 'third']);
  expect(call.peers.get('other')).toBe(first); expect(first.pc.createOffer).not.toHaveBeenCalled(); expect(call.peers.size).toBe(2);
});

test('ICE received before SDP is queued and flushed after remote description', async () => {
  const call = new CallSession(); call.join('server', 'room', 'You');
  handlers.signal('other', JSON.stringify({ ice: { candidate: 'candidate' } }));
  const peer = call.peers.get('other'); await peer.queue;
  expect(peer.pc.addIceCandidate).not.toHaveBeenCalled();
  handlers.signal('other', JSON.stringify({ sdp: { type: 'offer' } })); await peer.queue;
  expect(peer.pc.addIceCandidate).toHaveBeenCalledTimes(1); expect(peer.pc.createAnswer).toHaveBeenCalledTimes(1);
});

test('screen sharing keeps mic live and restores the camera on stop', async () => {
  const call = new CallSession(); const mic = track('audio'); const camera = track('video'); const screen = track('video');
  call.localStream.addTrack(mic); call.localStream.addTrack(camera); const peer = call.ensurePeer('other'); call.prepareOffer(peer);
  navigator.mediaDevices.getDisplayMedia.mockResolvedValue(new Stream([screen]));
  await call.toggleScreen(); expect(peer.senders.video.replaceTrack).toHaveBeenLastCalledWith(screen);
  expect(peer.senders.audio.replaceTrack).toHaveBeenLastCalledWith(mic); expect(mic.stop).not.toHaveBeenCalled();
  await call.stopScreen(); expect(peer.senders.video.replaceTrack).toHaveBeenLastCalledWith(camera); expect(screen.stop).toHaveBeenCalled();
});

test('late permission results release devices after leaving', async () => {
  let resolve; navigator.mediaDevices.getUserMedia.mockReturnValue(new Promise(r => { resolve = r; }));
  const call = new CallSession(); const pending = call.requestMedia(); call.dispose();
  const mic = track('audio'); resolve(new Stream([mic])); await pending;
  expect(mic.stop).toHaveBeenCalled(); expect(call.localStream.getTracks()).toHaveLength(0);
});


test('late track events cannot resurrect a departed participant tile', () => {
  const onPeer = jest.fn(); const call = new CallSession({ onPeer }); const peer = call.ensurePeer('other');
  const remote = track('video'); peer.pc.ontrack({ track: remote }); const late = remote.onended;
  call.removePeer('other'); onPeer.mockClear(); late();
  expect(onPeer).not.toHaveBeenCalled(); expect(peer.pc.close).toHaveBeenCalled();
});
