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
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [turns, setTurns] = useState(0);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [setupMs, setSetupMs] = useState(null);
  const [samples, setSamples] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [candidateTranscript, setCandidateTranscript] = useState('');
  useEffect(() => () => current.current?.close(), []);
  const end = (message = 'Interview ended') => {
    current.current?.close(); current.current = null; setActive(false); setReady(false); setMuted(false); setLevel(0); setStatus(message);
  };
  const start = () => {
    if (current.current) return;
    setError(''); setSamples([]); setTranscript(''); setCandidateTranscript(''); setTurns(0);
    setSetupMs(null); setReady(false); setMuted(false); setLevel(0); setActive(true);
    const call = new GeminiSession({
      onStatus: setStatus, onLevel: setLevel,
      onError: message => { end(); setStatus('Not connected'); setError(message); },
      onEnd: end, onReady: setup => { setSetupMs(setup); setReady(true); },
      onTurn: () => { setTurns(previous => previous + 1); setTranscript(previous => previous + '\n'); setCandidateTranscript(previous => previous + '\n'); },
      onSample: sample => setSamples(previous => [...previous, sample]),
      onTranscript: text => setTranscript(previous => (previous + text).slice(-12000)),
      onInputTranscript: text => setCandidateTranscript(previous => (previous + text).slice(-12000)),
    });
    current.current = call; call.start();
  };
  const delays = samples.map(s => s.receivedAudioMs);
  const download = () => {
    const report = { provider: 'Gemini', mode: 'automatic-vad', measuredAt: new Date().toISOString(), setupMs, completedAgentTurns: turns,
      samples, p50Ms: percentile(delays, .5), p95Ms: percentile(delays, .95),
      note: 'Approximate client energy-detected speech end to first received audio, including server silence detection. Playback estimate uses the Web Audio schedule, not physical speaker output. Energy detection can mistake noise or echo for speech. No direct comparison with OpenAI manual/event metrics or Teams.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'quikhire-gemini-latency.json'; link.click(); URL.revokeObjectURL(url);
  };
  const ms = value => value == null ? '—' : `${value} ms`;
  const last = samples[samples.length - 1];
  return <main className={styles.page}>
    <header className={styles.header}><strong>Quikhire · Voice lab</strong><Link to="/">Back home</Link></header>
    <section className={styles.agent}><h1>Practice interview with AI</h1>{providerSelect(active)}
      <p>Gemini asks the first question automatically. Answer naturally and pause when finished; the interviewer waits for roughly one second of silence. You can interrupt or ask for more thinking time.</p>
      <p>Your microphone audio is sent to Google continuously while connected and unmuted, including while the interviewer speaks. Camera access is not needed. This practice test ends after 9 minutes.</p>
      <p role="status">{status}</p>{error && <div role="alert" className={styles.notice}>{error}</div>}
      <div className={styles.actions}>
        <Button variant="contained" disabled={active} onClick={start}>Start interview</Button>
        <Button disabled={!active} onClick={() => end()}>End interview</Button>
        <Button variant="outlined" disabled={!ready} onClick={() => { const next = !muted; setMuted(next); current.current?.setMuted(next); }}>{muted ? 'Unmute microphone' : 'Mute microphone'}</Button>
      </div>
      <p><meter min="0" max="1" value={Math.min(1, level * 5)} aria-label="Microphone level" /> {ready ? muted ? 'Microphone muted — audio is not being sent' : 'Microphone live — listening for your answer' : 'Microphone not streaming'}</p>
      <p>{turns} completed interviewer turns, including the introduction. Use headphones to reduce speaker echo.</p>
      <div className={styles.metrics}><div>Connection setup<strong>{ms(setupMs)}</strong></div><div>Estimated response delay<strong>{ms(last?.receivedAudioMs)}</strong></div><div>Estimated playback delay<strong>{ms(last?.estimatedPlaybackMs)}</strong></div><div>p50 / p95<strong>{ms(percentile(delays, .5))} / {ms(percentile(delays, .95))}</strong></div></div>
      <p>{samples.length} estimated timing samples. Timing uses microphone sound levels to estimate the end of speech, then measures arrival of the first response audio. It includes pause detection time. Playback timing uses the browser audio schedule, not your physical speakers. Noise and echo can affect these estimates; they are not directly comparable to the OpenAI measurements.</p>
      <Button disabled={!samples.length} onClick={download}>Download measurements</Button>
      {candidateTranscript && <div><h2>Your transcript</h2><p style={{ whiteSpace: 'pre-wrap' }}>{candidateTranscript}</p></div>}
      {transcript && <div><h2>Interviewer transcript</h2><p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p></div>}
      <p>This is a practice conversation. It does not score candidates or make hiring decisions. Scalability and comparison with Teams require separate tests.</p>
    </section>
  </main>;
}
