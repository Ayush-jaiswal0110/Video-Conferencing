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
test('Gemini records one sample per completed user turn, excludes greetings and interruptions', () => {
  const onSample = jest.fn(); const call = new GeminiSession({ onSample });
  call.play = jest.fn(); const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }] } } };
  call.receive(audio, 0); expect(onSample).not.toHaveBeenCalled();
  call.pending = performance.now() - 100; call.receive(audio, 0); call.receive(audio, 0);
  expect(onSample).toHaveBeenCalledTimes(1); expect(onSample.mock.calls[0][0]).toBeGreaterThanOrEqual(100);
  call.pending = performance.now(); call.receive({ serverContent: { interrupted: true } }, 0); call.receive(audio, 0);
  expect(onSample).toHaveBeenCalledTimes(1); call.close();
});
test('Gemini cleanup stops devices, playback and sockets once', () => {
  const call = new GeminiSession(); const stop = jest.fn(); const socketClose = jest.fn();
  call.stream = { getTracks: () => [{ stop }] }; call.socket = { close: socketClose };
  call.close(); call.close(); expect(stop).toHaveBeenCalledTimes(1); expect(socketClose).toHaveBeenCalledTimes(1);
  expect(call.controller.signal.aborted).toBe(true);
});
