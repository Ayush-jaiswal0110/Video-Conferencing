import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@mui/material';
import server from '../env';
import GeminiVoice from './GeminiVoice';
import { mediaError, requireMediaDevices } from '../call/CallSession';
import { TurnLatency, percentile } from '../call/latency';
import styles from '../styles/videoComponent.module.css';

function OpenAIVoice({ providerSelect }) {
  const current = useRef(null);
  const audio = useRef(null);
  const [status, setStatus] = useState('Ready');
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [setupMs, setSetupMs] = useState(null);
  const [rtt, setRtt] = useState(null);
  const [samples, setSamples] = useState([]);
  const [transcript, setTranscript] = useState('');

  const cleanup = () => {
    const call = current.current;
    current.current = null;
    if (!call) return;
    call.controller.abort();
    clearInterval(call.timer);
    clearTimeout(call.timeout);
    call.channel?.close();
    call.pc?.close();
    call.stream?.getTracks().forEach(track => track.stop());
    if (audio.current) audio.current.srcObject = null;
  };
  useEffect(() => () => cleanup(), []);

  const stop = () => { cleanup(); setActive(false); setStatus('Ended'); };
  const start = async () => {
    if (current.current) return;
    const call = { controller: new AbortController(), latency: new TurnLatency(), started: performance.now() };
    current.current = call;
    setError(''); setSamples([]); setSetupMs(null); setRtt(null); setTranscript(''); setMuted(false); setBlocked(false);
    setActive(true); setStatus('Requesting microphone…');
    const isCurrent = () => current.current === call;
    try {
      requireMediaDevices();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!isCurrent()) { stream.getTracks().forEach(t => t.stop()); return; }
      call.stream = stream;
      const pc = new RTCPeerConnection();
      call.pc = pc;
      pc.ontrack = event => {
        if (!isCurrent()) return;
        audio.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        audio.current.play().then(() => setBlocked(false)).catch(() => { if (isCurrent()) setBlocked(true); });
      };
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const channel = pc.createDataChannel('oai-events');
      call.channel = channel;
      channel.onopen = () => {
        if (!isCurrent()) return;
        clearTimeout(call.timeout);
        setSetupMs(Math.round(performance.now() - call.started));
        setStatus('Listening — say hello');
      };
      channel.onmessage = message => {
        if (!isCurrent()) return;
        let event;
        try { event = JSON.parse(message.data); } catch { return; }
        const elapsed = call.latency.consume(event, performance.now());
        if (elapsed !== null) setSamples(previous => [...previous, elapsed]);
        if (event.type === 'input_audio_buffer.speech_started') setStatus('Listening…');
        if (event.type === 'input_audio_buffer.speech_stopped') setStatus('Thinking…');
        if (event.type === 'output_audio_buffer.started') setStatus('Agent speaking');
        if (event.type === 'output_audio_buffer.stopped') setStatus('Listening…');
        if (event.type === 'response.output_audio_transcript.delta') setTranscript(previous => (previous + event.delta).slice(-6000));
        if (event.type === 'response.output_audio_transcript.done') setTranscript(previous => previous + '\n');
        if (event.type === 'error') setError(event.error?.message || 'The AI voice service reported an error.');
      };
      pc.onconnectionstatechange = () => {
        if (!isCurrent()) return;
        if (pc.connectionState === 'failed') { stop(); setError('The voice connection failed. Start a new test.'); }
        else if (pc.connectionState === 'disconnected') setStatus('Network interrupted…');
      };
      channel.onclose = () => { if (isCurrent()) stop(); };
      call.timeout = setTimeout(() => { if (isCurrent()) { stop(); setError('Voice connection timed out. Check your network and retry.'); } }, 30000);
      setStatus('Connecting to AI voice…');
      await pc.setLocalDescription(await pc.createOffer());
      const token = localStorage.getItem('token');
      const response = await fetch(`${server}/api/v1/agent/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/sdp', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: pc.localDescription.sdp, signal: call.controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Could not start the AI voice session. Check the backend configuration.');
      }
      const sdp = await response.text();
      if (!isCurrent()) return;
      await pc.setRemoteDescription({ type: 'answer', sdp });
      if (!isCurrent()) return;
      call.timer = setInterval(async () => {
        try {
          const stats = await pc.getStats();
          if (!isCurrent()) return;
          stats.forEach(report => {
            if (report.type === 'transport' && report.selectedCandidatePairId) {
              const pair = stats.get(report.selectedCandidatePairId);
              if (pair?.currentRoundTripTime !== undefined) setRtt(Math.round(pair.currentRoundTripTime * 1000));
            }
          });
        } catch { /* The peer may close while a stats request is pending. */ }
      }, 2000);
    } catch (e) {
      if (isCurrent()) { cleanup(); setActive(false); setStatus('Not connected'); setError(mediaError(e)); }
    }
  };
  const exportResults = () => {
    const report = { measuredAt: new Date().toISOString(), setupMs, rttMs: rtt, responseEventDelayMs: samples, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95), note: 'Client receipt of speech_stopped to output_audio_buffer.started; excludes VAD endpointing and speaker playback. No Teams or load-test comparison has been performed.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'quikhire-voice-latency.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const ms = value => value === null ? '—' : `${value} ms`;
  return <main className={styles.page}>
    <header className={styles.header}><strong>Quikhire · Voice lab</strong><Link to="/">Back home</Link></header>
    <section className={styles.agent}><h1>Talk with an AI agent</h1>{providerSelect(active)}<p>A short voice conversation to test responsiveness. Your microphone audio is sent to OpenAI when you start. Camera access is not needed.</p>
      <p role="status">{status}</p>{error && <div role="alert" className={styles.notice}>{error}</div>}
      <audio ref={audio} autoPlay />
      {blocked && <Button onClick={() => audio.current.play().then(() => setBlocked(false)).catch(() => setError('Audio playback is blocked. Check browser sound settings.'))}>Enable agent audio</Button>}
      <div className={styles.actions}><Button variant="contained" disabled={active} onClick={start}>Start voice test</Button><Button disabled={!active} onClick={stop}>End test</Button><Button disabled={!active} onClick={() => { const next = !muted; current.current?.stream?.getAudioTracks().forEach(t => { t.enabled = !next; }); setMuted(next); }}>{muted ? 'Unmute' : 'Mute'}</Button></div>
      <div className={styles.metrics}><div>Connection setup<strong>{ms(setupMs)}</strong></div><div>Network RTT<strong>{ms(rtt)}</strong></div><div>Last response event<strong>{ms(samples.length ? samples[samples.length - 1] : null)}</strong></div><div>p50 / p95<strong>{ms(percentile(samples, .5))} / {ms(percentile(samples, .95))}</strong></div></div>
      <p>{samples.length} measured turns. Response timing runs from the received end-of-speech event to the agent’s audio-start event. It excludes silence detection time and speaker playback delay.</p>
      <Button disabled={!samples.length} onClick={exportResults}>Download measurements</Button>
      {transcript && <div><h2>Agent transcript</h2><p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p></div>}
      <p>This test measures one conversation. Scalability and a comparison with Teams require separate load and network tests.</p>
    </section>
  </main>;
}

export default function AgentVoice() {
  const [provider, setProvider] = useState('openai');
  const providerSelect = active => <label>Voice provider <select aria-label="Voice provider" value={provider} disabled={active} onChange={event => setProvider(event.target.value)}><option value="openai">OpenAI Realtime</option><option value="gemini">Gemini Live</option></select></label>;
  return provider === 'gemini' ? <GeminiVoice providerSelect={providerSelect} /> : <OpenAIVoice providerSelect={providerSelect} />;
}
