// Local energy detection estimates timing only. Gemini's server VAD controls replies.
export default class SpeechTiming {
  constructor() { this.reset(); }
  reset() { this.voicedMs = 0; this.lastVoice = null; this.pending = null; this.qualified = false; }
  observe(samples, sampleRate, now) {
    const duration = samples.length / sampleRate * 1000;
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));
    if (rms >= .015) {
      if (this.lastVoice === null || now - this.lastVoice > 300) this.voicedMs = 0;
      this.voicedMs += duration; this.lastVoice = now; this.pending = null;
      if (this.voicedMs >= 200) this.qualified = true;
    } else if (this.qualified && this.lastVoice !== null && now - this.lastVoice >= 300) {
      this.pending = this.lastVoice;
    }
    return rms;
  }
  consume(now) {
    if (this.pending === null) { this.reset(); return null; }
    const delay = Math.round(now - this.pending); this.reset();
    return delay >= 0 && delay < 45000 ? delay : null;
  }
}
