import server from '../env';
import SpeechTiming from './SpeechTiming';
import { mediaError, requireMediaDevices } from './CallSession';
import { encodePcm, decodePcm } from './pcm';

export default class GeminiSession {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; this.controller = new AbortController();
    this.sources = new Set(); this.closed = false; this.ready = false;
    this.muted = false; this.responseInProgress = true; this.playAt = 0;
    this.timing = new SpeechTiming(); this.responseSample = null;
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
          if (data.samples && this.ready && !this.muted) {
            const level = this.timing.observe(data.samples, this.input.sampleRate, performance.now());
            this.callbacks.onLevel?.(level);
            this.send({ realtimeInput: { audio: { data: encodePcm(data.samples), mimeType: `audio/pcm;rate=${this.input.sampleRate}` } } });
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
      this.limit = setTimeout(() => { this.close(); this.callbacks.onEnd?.('Practice session ended after 9 minutes. Start a new interview to continue.'); }, 9 * 60 * 1000);
    } catch (e) { this.fail(mediaError(e)); }
  }
  receive(event, started) {
    if (event.error) return this.fail('Gemini reported a session error. Check model access and quota.');
    if (event.setupComplete) {
      if (this.ready) return;
      clearTimeout(this.timeout); this.ready = true;
      this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
      if (!this.muted) this.capture.port.postMessage('start');
      this.callbacks.onReady?.(Math.round(performance.now() - started));
      this.status('The interviewer is preparing the first question…');
      this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Start the practice interview now. Introduce yourself and ask your first question.' }] }], turnComplete: true } });
    }
    const content = event.serverContent;
    if (!content) return;
    if (content.interrupted) {
      this.clearPlayback(); this.responseInProgress = false; this.responseSample = null; this.interruptedTurn = true;
      this.status(this.muted ? 'Microphone muted' : 'Listening — go ahead');
    }
    if (content.inputTranscription?.text) this.callbacks.onInputTranscript?.(content.inputTranscription.text);
    if (content.outputTranscription?.text) this.callbacks.onTranscript?.(content.outputTranscription.text);
    for (const part of content.modelTurn?.parts || []) {
      const audio = part.inlineData;
      if (!audio?.mimeType?.startsWith('audio/pcm') || !audio.data) continue;
      // Greeting and subsequent chunks of the same response cannot create samples.
      if (!this.responseInProgress) {
        const delay = this.timing.consume(performance.now());
        this.responseSample = delay === null ? null : { receivedAudioMs: delay, estimatedPlaybackMs: null };
      }
      this.responseInProgress = true; this.interruptedTurn = false;
      const playbackDelay = this.play(audio);
      if (this.responseSample) {
        this.callbacks.onSample?.({ ...this.responseSample, estimatedPlaybackMs: this.responseSample.receivedAudioMs + Math.round(playbackDelay || 0) });
        this.responseSample = null;
      }
      this.status(this.muted ? 'Interviewer speaking · microphone muted' : 'Interviewer speaking — you can interrupt');
    }
    if (content.turnComplete) {
      this.responseInProgress = false; this.responseSample = null;
      if (!this.interruptedTurn) { this.timing.reset(); this.callbacks.onTurn?.(); }
      this.interruptedTurn = false;
      if (!this.sources.size) this.status(this.muted ? 'Microphone muted' : 'Listening — answer when ready');
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
    source.onended = () => {
      this.sources.delete(source); source.disconnect();
      if (!this.closed && !this.sources.size && !this.responseInProgress) this.status(this.muted ? 'Microphone muted' : 'Listening — answer when ready');
    };
    this.sources.add(source); this.playAt = Math.max(this.playAt, this.output.currentTime + .02);
    const playbackDelay = (this.playAt - this.output.currentTime) * 1000;
    source.start(this.playAt); this.playAt += buffer.duration;
    return playbackDelay;
  }
  async setMuted(muted) {
    if (this.closed || !this.ready || this.muted === muted) return;
    this.muted = muted; this.timing.reset(); this.callbacks.onLevel?.(0);
    this.stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    try {
      if (muted) {
        this.capture.port.postMessage('stop');
        this.send({ realtimeInput: { audioStreamEnd: true } });
        this.status('Microphone muted');
      } else {
        await Promise.all([this.input.resume(), this.output.resume()]);
        if (this.closed || this.muted) return;
        this.capture.port.postMessage('start');
        this.status('Listening — answer when ready');
      }
    } catch (e) { this.fail(e.message); }
  }
  clearPlayback() {
    for (const source of this.sources) { try { source.stop(); source.disconnect(); } catch {} }
    this.sources.clear(); this.playAt = 0;
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false; this.controller.abort();
    for (const timer of [this.timeout, this.limit]) clearTimeout(timer);
    if (this.socket) { this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null; this.socket.close(); }
    if (this.capture) { this.capture.port.onmessage = null; this.capture.disconnect(); this.capture.port.close(); }
    this.source?.disconnect(); this.stream?.getTracks().forEach(t => t.stop()); this.clearPlayback();
    for (const context of [this.input, this.output]) if (context && context.state !== 'closed') context.close().catch(() => {});
  }
}
