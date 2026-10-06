import SpeechTiming from './SpeechTiming';
import { encodePcm, decodePcm } from './pcm';
import { audioSnapshot } from './audioStats';
import GeminiSession from './GeminiSession';

test('PCM uses signed little-endian 16-bit samples and clips peaks', () => {
  const data = encodePcm(new Float32Array([-2, -.5, 0, .5, 2]));
  const decoded = decodePcm(data);
  expect([...decoded]).toEqual([-1, -.5, 0, .5, 32767 / 32768]);
  expect(() => decodePcm(btoa('x'))).toThrow('Invalid PCM');
});
test('packet arrival is distinct from nonzero sound energy', () => {
  const previous = { packetsReceived: 10, totalSamplesDuration: 1, totalAudioEnergy: .1 };
  expect(audioSnapshot({ packetsReceived: 20, totalSamplesDuration: 2, totalAudioEnergy: .1 }, previous)).toMatchObject({ receiving: true, sound: false });
  expect(audioSnapshot({ packetsReceived: 20, totalSamplesDuration: 2, totalAudioEnergy: .2 }, previous)).toMatchObject({ receiving: true, sound: true });
});

const audioEvent = { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }] } } };
const voice = new Float32Array(1600).fill(.1), silence = new Float32Array(1600);
test('local timing requires sustained voice and a pause, and resumes through short thinking gaps', () => {
  const timing = new SpeechTiming(); timing.observe(silence, 16000, 0); expect(timing.consume(100)).toBeNull();
  timing.observe(voice, 16000, 100); timing.observe(voice, 16000, 200);
  timing.observe(silence, 16000, 400); expect(timing.pending).toBeNull();
  timing.observe(voice, 16000, 500); timing.observe(silence, 16000, 800);
  expect(timing.consume(1500)).toBe(1000); expect(timing.consume(1600)).toBeNull();
});
test('Gemini excludes greeting and duplicate chunks and includes playback scheduling in its estimate', () => {
  const onSample = jest.fn(); const call = new GeminiSession({ onSample }); call.play = jest.fn(() => 20);
  call.receive(audioEvent, 0); expect(onSample).not.toHaveBeenCalled();
  call.receive({ serverContent: { turnComplete: true } }, 0);
  call.timing.pending = performance.now() - 1000;
  call.receive(audioEvent, 0); call.receive(audioEvent, 0);
  expect(onSample).toHaveBeenCalledTimes(1);
  const sample = onSample.mock.calls[0][0]; expect(sample.receivedAudioMs).toBeGreaterThanOrEqual(1000);
  expect(sample.estimatedPlaybackMs).toBe(sample.receivedAudioMs + 20); call.close();
});
test('automatic setup opens the mic and triggers one first question without manual activity messages', () => {
  const call = new GeminiSession(); const mic = { enabled: false, stop: jest.fn() };
  call.stream = { getAudioTracks: () => [mic], getTracks: () => [mic] };
  call.capture = { port: { postMessage: jest.fn(), close: jest.fn() }, disconnect: jest.fn() }; call.send = jest.fn();
  call.receive({ setupComplete: {} }, 0); call.receive({ setupComplete: {} }, 0);
  expect(mic.enabled).toBe(true); expect(call.capture.port.postMessage).toHaveBeenCalledWith('start');
  expect(call.send).toHaveBeenCalledTimes(1); expect(call.send.mock.calls[0][0].clientContent.turnComplete).toBe(true); call.close();
});
test('mute ends the stream, unmute resumes capture, and interruptions empty playback without completing a turn', async () => {
  const onTurn = jest.fn(); const call = new GeminiSession({ onTurn }); call.ready = true;
  const mic = { enabled: true, stop: jest.fn() }; const stop = jest.fn();
  call.stream = { getAudioTracks: () => [mic], getTracks: () => [mic] };
  call.capture = { port: { postMessage: jest.fn(), close: jest.fn() }, disconnect: jest.fn() };
  call.input = call.output = { resume: jest.fn().mockResolvedValue(), state: 'closed' }; call.send = jest.fn();
  await call.setMuted(true); expect(mic.enabled).toBe(false); expect(call.send).toHaveBeenCalledWith({ realtimeInput: { audioStreamEnd: true } });
  await call.setMuted(false); expect(mic.enabled).toBe(true); expect(call.capture.port.postMessage).toHaveBeenLastCalledWith('start');
  call.sources.add({ stop, disconnect: jest.fn() });
  call.receive({ serverContent: { interrupted: true, turnComplete: true } }, 0);
  expect(stop).toHaveBeenCalledTimes(1); expect(call.sources.size).toBe(0); expect(onTurn).not.toHaveBeenCalled(); call.close();
});
test('Gemini cleanup stops devices, playback and sockets once', () => {
  const call = new GeminiSession(); const stop = jest.fn(); const socketClose = jest.fn();
  call.stream = { getTracks: () => [{ stop }] }; call.socket = { close: socketClose };
  call.close(); call.close(); expect(stop).toHaveBeenCalledTimes(1); expect(socketClose).toHaveBeenCalledTimes(1);
  expect(call.controller.signal.aborted).toBe(true);
});
