import { Server } from 'socket.io';
import { Meeting } from '../models/meeting.model.js';

export function extractMeetingCode(raw) {
  if (typeof raw !== 'string') return null;
  const room = raw.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
  return /^[\w-]{1,128}$/.test(room || '') ? room : null;
}

export default function connectToSocket(server) {
  const io = new Server(server, { cors: { origin: process.env.FRONTEND_ORIGIN?.split(',') || '*', methods: ['GET', 'POST'] } });
  const rooms = new Map();
  const leave = socket => {
    const room = socket.data.room;
    const state = rooms.get(room);
    if (!state) return;
    state.users.delete(socket.id);
    socket.leave(room);
    socket.to(room).emit('user-left', socket.id);
    if (!state.users.size) rooms.delete(room);
    delete socket.data.room;
  };
  io.on('connection', socket => {
    socket.on('join-call', async (rawRoom, name) => {
      const room = extractMeetingCode(rawRoom);
      if (!room || socket.data.room === room) return;
      leave(socket);
      if (!rooms.has(room)) rooms.set(room, { users: new Map(), messages: [], videoId: null });
      const state = rooms.get(room);
      state.users.set(socket.id, { name: typeof name === 'string' ? name.trim().slice(0, 80) || 'Participant' : 'Participant' });
      socket.data.room = room;
      socket.join(room);
      const names = Object.fromEntries([...state.users].map(([id, user]) => [id, user.name]));
      io.to(room).emit('user-joined', socket.id, [...state.users.keys()], names);
      state.messages.forEach(msg => socket.emit('chat-message', msg));
      for (const [id, user] of state.users) if (id !== socket.id && user.media) socket.emit('media-state', id, user.media);
      if (state.videoId) socket.emit('youtube-video-shared', state.videoId);
      else if (Meeting.db.readyState === 1) {
        try {
          const meeting = await Meeting.findOne({ meetingCode: room });
          if (meeting?.youtubeVideoId && socket.data.room === room && rooms.get(room) === state && !state.videoId) {
            state.videoId = meeting.youtubeVideoId;
            io.to(room).emit('youtube-video-shared', state.videoId);
          }
        } catch { console.error('Unable to restore shared video.'); }
      }
    });
    socket.on('signal', (toId, message) => {
      const state = rooms.get(socket.data.room);
      if (state?.users.has(toId) && toId !== socket.id && typeof message === 'string' && message.length < 100000) io.to(toId).emit('signal', socket.id, message);
    });
    socket.on('media-state', media => {
      const state = rooms.get(socket.data.room);
      if (!state || !media) return;
      const clean = { audio: media.audio === true, video: media.video === true };
      state.users.get(socket.id).media = clean;
      socket.to(socket.data.room).emit('media-state', socket.id, clean);
    });
    socket.on('chat-message', data => {
      const state = rooms.get(socket.data.room);
      if (!state || typeof data !== 'string' || !data.trim()) return;
      const msg = { message: data.trim().slice(0, 4000), sender: state.users.get(socket.id).name, socketIdSender: socket.id };
      state.messages.push(msg);
      if (state.messages.length > 200) state.messages.shift();
      io.to(socket.data.room).emit('chat-message', msg);
    });
    socket.on('share-youtube-link', async videoId => {
      const room = socket.data.room;
      const state = rooms.get(room);
      if (!state || typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId)) return;
      state.videoId = videoId;
      io.to(room).emit('youtube-video-shared', videoId);
      if (Meeting.db.readyState === 1) {
        try { await Meeting.findOneAndUpdate({ meetingCode: room }, { youtubeVideoId: videoId }); }
        catch { console.error('Unable to persist shared video.'); }
      }
    });
    socket.on('youtube-control', action => {
      if (!socket.data.room || !['play', 'pause', 'seek'].includes(action?.type)) return;
      if (action.type === 'seek' && (!Number.isFinite(action.time) || action.time < 0)) return;
      socket.to(socket.data.room).emit('youtube-control', { type: action.type, time: action.time });
    });
    socket.on('disconnect', () => leave(socket));
  });
  return io;
}
