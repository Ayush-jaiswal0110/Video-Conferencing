import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@mui/material';
import GeminiSession from '../call/GeminiSession';
import { percentile } from '../call/latency';
import styles from '../styles/videoComponent.module.css';

export default function GeminiVoice({ providerSelect }) {
  const current = useRef(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [setupMs, setSetupMs] = useState(null);
  const [samples, setSamples] = useState([]);
  const [transcript, setTranscript] = useState('');
  useEffect(() => () => current.current?.close(), []);
  const end = () => { current.current?.close(); current.current = null; setActive(false); setReady(false); setSpeaking(false); setStatus('Ended'); };
  const start = () => {
    if (current.current) return;
    setError(''); setSamples([]); setTranscript(''); setSetupMs(null); setReady(false); setSpeaking(false); setActive(true);
    const call = new GeminiSession({
      onStatus: setStatus,
      onError: message => { end(); setStatus('Not connected'); setError(message); },
      onEnd: end,
      onReady: setup => { if (setup !== undefined) setSetupMs(setup); setReady(true); },
      onSample: sample => setSamples(previous => [...previous, sample]),
      onTranscript: text => setTranscript(previous => (previous + text).slice(-6000)),
    });
    current.current = call; call.start();
  };
  const download = () => {
    const report = { provider: 'Gemini', measuredAt: new Date().toISOString(), setupMs, responseDelayMs: samples, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95), note: 'Client activityEnd send to receipt of first audio chunk. Excludes speaker playback; differs from OpenAI event timing. No scalability or Teams comparison.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'quikhire-gemini-latency.json'; link.click(); URL.revokeObjectURL(url);
  };
  const ms = value => value === null ? '—' : `${value} ms`;
  return <main className={styles.page}>
    <header className={styles.header}><strong>Quikhire · Voice lab</strong><Link to="/">Back home</Link></header>
    <section className={styles.agent}><h1>Talk with an AI agent</h1>{providerSelect(active)}
      <p>Test Gemini Live with short voice turns. Your microphone audio is sent to Google only between Speak and Finish turn. Camera access is not needed. Tests end after 9 minutes.</p>
      <p role="status">{status}</p>{error && <div role="alert" className={styles.notice}>{error}</div>}
      <div className={styles.actions}>
        <Button variant="contained" disabled={active} onClick={start}>Start voice test</Button>
        <Button disabled={!active} onClick={end}>End test</Button>
        <Button variant="outlined" disabled={!ready || speaking} onClick={async () => { setReady(false); const call = current.current; await call?.speak(); if (current.current === call && call?.phase === 'speaking') setSpeaking(true); }}>Speak</Button>
        <Button disabled={!speaking} onClick={() => { setSpeaking(false); current.current?.finish(); }}>Finish turn</Button>
      </div>
      <div className={styles.metrics}><div>Connection setup<strong>{ms(setupMs)}</strong></div><div>Last response<strong>{ms(samples.length ? samples[samples.length - 1] : null)}</strong></div><div>p50 / p95<strong>{ms(percentile(samples, .5))} / {ms(percentile(samples, .95))}</strong></div></div>
      <p>{samples.length} measured turns. Timing starts after your last microphone chunk is sent and ends when the first Gemini audio chunk arrives. It excludes speaker playback delay. OpenAI uses different timing events, so these values are not a direct provider comparison.</p>
      <Button disabled={!samples.length} onClick={download}>Download measurements</Button>
      {transcript && <div><h2>Agent transcript</h2><p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p></div>}
      <p>This measures one conversation. Scalability and comparison with Teams require separate load and network tests.</p>
    </section>
  </main>;
}
