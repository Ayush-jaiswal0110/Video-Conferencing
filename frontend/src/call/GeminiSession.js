import server from '../env';
import { requireMediaDevices } from './CallSession';
import { encodePcm, decodePcm } from './pcm';

export default class GeminiSession {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; this.controller = new AbortController();
    this.sources = new Set(); this.closed = false; this.ready = false;
    this.phase = 'connecting'; this.pending = null; this.playAt = 0;
  }
  status(text) { this.callbacks.onStatus?.(text); }
  fail(message) { if (!this.closed) { this.close(); this.callbacks.onError?.(message); } }
  send(message) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) throw new Error('Gemini connection is not open.');
    if (this.socket.bufferedAmount > 1024 * 1024) throw new Error('Audio upload cannot keep up with the connection. Restart on a faster network.');
    this.socket.send(JSON.stringify(message));
  }
  async start() {
    try {
      requireMediaDevices();
      const started = performance.now();
      // Resume speaker playback in the Start button gesture before awaiting permissions.
      this.input = new AudioContext({ sampleRate: 16000 });
      this.output = new AudioContext({ sampleRate: 24000 });
      await Promise.all([this.input.resume(), this.output.resume()]);
      if (this.closed) return;
      this.status('Requesting microphone…');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; stream.getTracks().forEach(t => { t.enabled = false; });
      await this.input.audioWorklet.addModule(`${process.env.PUBLIC_URL || ''}/pcm-capture.worklet.js`);
      if (this.closed) return;
      this.capture = new AudioWorkletNode(this.input, 'pcm-capture');
      this.source = this.input.createMediaStreamSource(stream);
      this.source.connect(this.capture); this.capture.connect(this.input.destination);
      this.capture.port.onmessage = ({ data }) => {
        if (this.closed) return;
        try {
          if (data.samples && ['speaking', 'finishing'].includes(this.phase)) {
            this.send({ realtimeInput: { audio: { data: encodePcm(data.samples), mimeType: `audio/pcm;rate=${this.input.sampleRate}` } } });
          }
          if (data.finished && this.phase === 'finishing') {
            clearTimeout(this.flushTimer);
            this.pending = performance.now();
            this.send({ realtimeInput: { activityEnd: {} } });
            this.phase = 'waiting'; this.status('Waiting for Gemini…');
            this.responseTimer = setTimeout(() => this.fail('Gemini did not respond within 45 seconds. Start a new test.'), 45000);
          }
        } catch (e) { this.fail(e.message); }
      };
      this.status('Connecting to Gemini…');
      this.timeout = setTimeout(() => this.fail('Gemini connection timed out. Check your network and configuration.'), 30000);
      const token = localStorage.getItem('token');
      const response = await fetch(`${server}/api/v1/agent/gemini-token`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: this.controller.signal,
      });
      const body = await response.json();
      if (this.closed) return;
      if (!response.ok) throw new Error(body.message || 'Could not start Gemini.');
      if (!body.token || !body.setup) throw new Error('The backend returned an invalid Gemini session.');
      const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(body.token)}`);
      this.socket = socket;
      socket.onopen = () => { try { this.send({ setup: body.setup }); } catch (e) { this.fail(e.message); } };
      let queue = Promise.resolve();
      socket.onmessage = message => {
        queue = queue.then(async () => {
          const text = typeof message.data === 'string' ? message.data : await message.data.text();
          if (!this.closed) this.receive(JSON.parse(text), started);
        }).catch(() => this.fail('Gemini returned an unreadable audio message.'));
      };
      socket.onerror = () => this.fail('Gemini connection failed. Check API access, network and browser settings.');
      socket.onclose = event => this.fail(`Gemini connection closed (code ${event.code}). Check model access and quota, then start a new test.`);
      this.limit = setTimeout(() => { this.close(); this.callbacks.onEnd?.(); }, 9 * 60 * 1000);
    } catch (e) { this.fail(e.message); }
  }
  receive(event, started) {
    if (event.error) return this.fail('Gemini reported a session error. Check model access and quota.');
    if (event.setupComplete) {
      clearTimeout(this.timeout); this.ready = true; this.phase = 'ready';
      this.callbacks.onReady?.(Math.round(performance.now() - started)); this.status('Ready — click Speak');
    }
    const content = event.serverContent;
    if (!content) return;
    if (content.interrupted) { this.clearPlayback(); this.pending = null; }
    if (content.outputTranscription?.text) this.callbacks.onTranscript?.(content.outputTranscription.text);
    for (const part of content.modelTurn?.parts || []) {
      const audio = part.inlineData;
      if (!audio?.mimeType?.startsWith('audio/pcm') || !audio.data) continue;
      if (this.pending !== null) {
        this.callbacks.onSample?.(Math.round(performance.now() - this.pending)); this.pending = null;
        clearTimeout(this.responseTimer);
      }
      this.play(audio); this.status('Gemini speaking');
    }
    if (content.turnComplete) {
      clearTimeout(this.responseTimer); this.pending = null; this.phase = 'ready';
      this.callbacks.onReady?.(); this.status('Ready — click Speak for another turn');
    }
  }
  play(audio) {
    const samples = decodePcm(audio.data);
    if (!samples.length) return;
    const rate = Number(audio.mimeType.match(/rate=(\d+)/)?.[1] || 24000);
    if (rate < 8000 || rate > 96000) throw new Error('Unsupported audio rate');
    if (this.playAt - this.output.currentTime > 30) throw new Error('Audio playback backlog');
    const buffer = this.output.createBuffer(1, samples.length, rate); buffer.copyToChannel(samples, 0);
    const source = this.output.createBufferSource(); source.buffer = buffer; source.connect(this.output.destination);
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
    this.sources.add(source); this.playAt = Math.max(this.playAt, this.output.currentTime + .02);
    source.start(this.playAt); this.playAt += buffer.duration;
  }
  async speak() {
    if (this.closed || !this.ready || this.phase !== 'ready') return;
    try {
      this.phase = 'starting';
      await Promise.all([this.input.resume(), this.output.resume()]);
      if (this.closed) return;
      this.clearPlayback(); this.pending = null;
      this.send({ realtimeInput: { activityStart: {} } });
      this.stream.getAudioTracks().forEach(t => { t.enabled = true; });
      this.phase = 'speaking'; this.capture.port.postMessage('start'); this.status('Listening — click Finish turn when done');
    } catch (e) { this.fail(e.message); }
  }
  finish() {
    if (this.closed || this.phase !== 'speaking') return;
    this.phase = 'finishing'; this.stream.getAudioTracks().forEach(t => { t.enabled = false; });
    this.capture.port.postMessage('finish');
    this.flushTimer = setTimeout(() => this.fail('Microphone capture stalled. Start a new test.'), 3000);
  }
  clearPlayback() {
    for (const source of this.sources) { try { source.stop(); source.disconnect(); } catch {} }
    this.sources.clear(); this.playAt = 0;
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false; this.controller.abort();
    for (const timer of [this.timeout, this.limit, this.responseTimer, this.flushTimer]) clearTimeout(timer);
    if (this.socket) { this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null; this.socket.close(); }
    if (this.capture) { this.capture.port.onmessage = null; this.capture.disconnect(); this.capture.port.close(); }
    this.source?.disconnect(); this.stream?.getTracks().forEach(t => t.stop()); this.clearPlayback();
    for (const context of [this.input, this.output]) if (context && context.state !== 'closed') context.close().catch(() => {});
  }
}
