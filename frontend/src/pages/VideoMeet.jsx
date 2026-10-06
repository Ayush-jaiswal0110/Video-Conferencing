import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, TextField, IconButton } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import YouTube from 'react-youtube';
import server from '../env';
import CallSession, { mediaError } from '../call/CallSession';
import styles from '../styles/videoComponent.module.css';

function VideoTile({ stream, name, local = false, status, media, audioStats }) {
  const video = useRef(null);
  const audio = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const audioTrack = stream?.getAudioTracks()[0];
  const videoTrack = stream?.getVideoTracks()[0];
  useEffect(() => {
    const element = video.current;
    element.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    if (videoTrack) element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [videoTrack]);
  useEffect(() => {
    if (local || !audio.current) return;
    const element = audio.current;
    let cancelled = false;
    // A never-started camera track must not hold back audio-only playback.
    element.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
    element.muted = false;
    element.volume = 1;
    setBlocked(false);
    if (audioTrack) element.play().catch(error => {
      if (!cancelled && error.name !== 'AbortError') setBlocked(true);
    });
    return () => { cancelled = true; element.srcObject = null; };
  }, [audioTrack, local]);
  const soundLabel = media?.audio === false ? 'Mic off' : !audioTrack ? 'No audio track'
    : audioStats?.sound ? 'Sound detected' : 'Quiet';
  return <article className={styles.videoTile} data-participant={local ? 'local' : 'remote'}>
    <video ref={video} autoPlay playsInline muted aria-label={name + ' video'} />
    {!local && <audio ref={audio} autoPlay aria-label={name + ' audio'} />}
    {(!videoTrack || media?.video === false) && <div className={styles.avatar}>{name.slice(0, 1).toUpperCase()}</div>}
    <div className={styles.tileLabel}>
      <div>{name}{local ? ' (you)' : ''} · {status}</div>
      <div className={styles.audioStatus} data-audio-state={soundLabel}>
        <meter min="0" max="1" value={media?.audio === false ? 0 : Math.min(1, (audioStats?.level || 0) * 5)} aria-label={local ? 'Microphone input level' : name + ' received audio level'} />
        <span>{local ? 'Mic: ' : audioStats?.receiving ? 'Receiving audio · ' : 'Audio: '}{soundLabel}</span>
      </div>
    </div>
    {!local && audioTrack && <Button className={styles.playButton} onClick={() => {
      audio.current.muted = false; audio.current.volume = 1;
      audio.current.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }}>{blocked ? 'Enable sound' : 'Play sound'}</Button>}
  </article>;
}

export default function VideoMeetComponent() {
  const { url: room } = useParams();
  const session = useRef(null);
  const player = useRef(null);
  const remoteControl = useRef(false);
  const syncTimer = useRef(null);
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Ready to join');
  const [localStream, setLocalStream] = useState(null);
  const [audioStats, setAudioStats] = useState(null);
  const [media, setMedia] = useState({ video: false, audio: false, screen: false });
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [youtubeLink, setYoutubeLink] = useState('');
  const [youtubeId, setYoutubeId] = useState(null);

  useEffect(() => {
    const call = new CallSession({
      onLocal: setLocalStream, onAudio: setAudioStats, onMedia: setMedia, onError: setError, onStatus: setStatus,
      onPeer: update => setPeers(previous => previous.some(p => p.id === update.id)
        ? previous.map(p => p.id === update.id ? { ...p, ...update } : p) : [...previous, update]),
      onLeft: id => setPeers(previous => previous.filter(p => p.id !== id)),
      onChat: msg => setMessages(previous => [...previous, msg].slice(-200)),
      onYoutube: setYoutubeId,
      onYoutubeControl: action => {
        if (!player.current) return;
        remoteControl.current = true;
        if (action.type === 'play') player.current.playVideo();
        if (action.type === 'pause') player.current.pauseVideo();
        if (action.type === 'seek') player.current.seekTo(action.time, true);
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => { remoteControl.current = false; }, 600);
      },
    });
    session.current = call;
    const audioTimer = setInterval(() => call.collectAudioStats(), 500);
    return () => { clearInterval(audioTimer); clearTimeout(syncTimer.current); call.dispose(); };
  }, [room]);

  const run = async action => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); } catch (e) { setError(mediaError(e)); }
    finally { setBusy(false); }
  };

  const join = withoutDevices => run(async () => {
    if (!username.trim()) throw new Error('Enter your name before joining.');
    let videoId;
    if (youtubeLink.trim()) {
      const match = youtubeLink.match(/(?:youtu\.be\/|[?&]v=|embed\/)([\w-]{11})(?:[?&#/]|$)/);
      if (!match) throw new Error('Enter a valid YouTube link or leave the field empty.');
      videoId = match[1];
    }
    if (!withoutDevices && !session.current.requested) await session.current.requestMedia();
    if (withoutDevices) {
      session.current.localStream.getTracks().forEach(track => { track.enabled = false; });
      session.current.notifyMedia();
    }
    setStatus('Connecting…');
    session.current.join(server, room, username.trim(), videoId);
    setJoined(true);
  });

  const controls = <div className={styles.controls}>
    <IconButton disabled={busy} aria-label={media.video ? 'Turn camera off' : 'Turn camera on'} onClick={() => run(() => session.current.toggle('video'))}>{media.video ? <VideocamIcon /> : <VideocamOffIcon />}</IconButton>
    <IconButton disabled={busy} aria-label={media.audio ? 'Mute microphone' : 'Unmute microphone'} onClick={() => run(() => session.current.toggle('audio'))}>{media.audio ? <MicIcon /> : <MicOffIcon />}</IconButton>
    {joined && <>
      <IconButton disabled={busy} aria-label={media.screen ? 'Stop screen sharing' : 'Share screen'} onClick={() => run(() => session.current.toggleScreen())}>{media.screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}</IconButton>
      <IconButton aria-label="Toggle chat" onClick={() => setChatOpen(!chatOpen)}><ChatIcon /></IconButton>
      <IconButton aria-label="Leave call" onClick={() => { session.current.dispose(); window.location.assign('/'); }}><CallEndIcon color="error" /></IconButton>
    </>}
  </div>;

  return <main className={styles.page}>
    <header className={styles.header}><div><strong>Quikhire · Video room</strong><p>Room: {room} · {status}</p></div>{!joined && <Link to="/agent">Talk with AI agent →</Link>}</header>
    {error && <div role="alert" className={styles.notice}>{error}</div>}
    {!joined ? <section className={styles.lobby}>
      <div><h1>Ready to connect?</h1><p>Allow your camera and microphone to preview them before joining.</p>
        <TextField label="Your name" value={username} onChange={e => setUsername(e.target.value)} fullWidth />
        <TextField label="Optional YouTube link" value={youtubeLink} onChange={e => setYoutubeLink(e.target.value)} fullWidth />
        <Button disabled={busy} variant="outlined" onClick={() => run(() => session.current.requestMedia())}>Enable camera & microphone</Button>
        <div className={styles.actions}><Button disabled={busy} variant="contained" onClick={() => join(false)}>{busy ? 'Please wait…' : 'Join meeting'}</Button><Button disabled={busy} onClick={() => join(true)}>Join without devices</Button></div>
        <p>Already blocked access? Use your browser’s site settings to allow camera and microphone, then enable them again.</p>
      </div><div><VideoTile local stream={localStream} name={username.trim() || 'You'} media={media} />{controls}</div>
    </section> : <>
      <details className={styles.audioHelp}><summary>Cannot hear the other participant?</summary><p>Mic: {localStream?.getAudioTracks()[0]?.label || 'No microphone selected'}. Speak and look for “Sound detected” on your tile and the remote tile. “Receiving audio · Quiet” means packets are arriving but no sound is detected.</p><p>For two browsers on one computer: pause YouTube, use headphones, mute the microphone in one browser, and speak through the other. Click Play sound on the receiving tile and check the browser tab and Windows volume mixer are unmuted.</p></details>
      <div className={styles.meetingBody}>
        <section className={styles.conferenceView} aria-label="Participants">
          <VideoTile local stream={localStream} name={username} media={media} audioStats={audioStats} status={media.screen ? 'Sharing screen' : 'Connected'} />
          {peers.map(peer => <VideoTile key={peer.id} {...peer} name={peer.name || 'Participant'} />)}
          {!peers.length && <p>Waiting for another participant. Share this page’s link so they can join the same room.</p>}
          {peers.some(p => p.status === 'failed') && <p role="alert">A participant could not connect. Check network access and configure a TURN relay for restrictive networks.</p>}
        </section>
        {chatOpen && <aside className={styles.chatRoom}><h2>Chat</h2><div className={styles.chattingDisplay}>{messages.map((msg, i) => <p key={i}><strong>{msg.sender}: </strong>{msg.message}</p>)}</div><form onSubmit={e => { e.preventDefault(); if (message.trim()) { session.current.socket?.emit('chat-message', message.trim(), username); setMessage(''); } }}><TextField label="Message" value={message} onChange={e => setMessage(e.target.value)} /><Button type="submit">Send</Button></form></aside>}
      </div>
      {youtubeId && <div className={styles.youtube}><YouTube videoId={youtubeId} opts={{ width: '100%', height: '300' }} onReady={event => { player.current = event.target; }} onStateChange={event => {
        if (remoteControl.current || !player.current) return;
        const type = event.data === 1 ? 'play' : event.data === 2 ? 'pause' : event.data === 3 ? 'seek' : null;
        if (type) session.current.socket?.emit('youtube-control', { type, time: player.current.getCurrentTime() });
      }} /></div>}
      {controls}
    </>}
  </main>;
}
