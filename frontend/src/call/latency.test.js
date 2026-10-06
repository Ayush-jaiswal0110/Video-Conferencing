import { TurnLatency, percentile } from './latency';
test('records one timing for the matching response and excludes greetings', () => {
  const tracker = new TurnLatency();
  expect(tracker.consume({ type: 'output_audio_buffer.started', response_id: 'greeting' }, 10)).toBeNull();
  tracker.consume({ type: 'input_audio_buffer.speech_stopped' }, 100);
  tracker.consume({ type: 'response.created', response: { id: 'a' } }, 110);
  expect(tracker.consume({ type: 'output_audio_buffer.started', response_id: 'a' }, 350)).toBe(250);
  expect(tracker.consume({ type: 'output_audio_buffer.started', response_id: 'a' }, 400)).toBeNull();
});
test('interrupted responses do not count as the next turn', () => {
  const tracker = new TurnLatency();
  tracker.consume({ type: 'input_audio_buffer.speech_stopped' }, 100);
  tracker.consume({ type: 'response.created', response: { id: 'a' } }, 110);
  tracker.consume({ type: 'input_audio_buffer.speech_started' }, 200);
  expect(tracker.consume({ type: 'output_audio_buffer.started', response_id: 'a' }, 350)).toBeNull();
  expect(percentile([], .95)).toBeNull(); expect(percentile([100, 900, 300], .5)).toBe(300);
});
