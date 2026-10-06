// This measures arrival of provider events, not sound at the listener's speaker.
export class TurnLatency {
  constructor() { this.pending = null; this.responses = new Map(); }
  consume(event, now) {
    if (event.type === 'input_audio_buffer.speech_started') { this.pending = null; this.responses.clear(); }
    if (event.type === 'input_audio_buffer.speech_stopped') this.pending = now;
    if (event.type === 'response.created' && this.pending !== null) {
      this.responses.set(event.response.id, this.pending);
      this.pending = null;
    }
    if (event.type === 'output_audio_buffer.started' && this.responses.has(event.response_id)) {
      const elapsed = Math.round(now - this.responses.get(event.response_id));
      this.responses.delete(event.response_id);
      return elapsed;
    }
    return null;
  }
}
export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
