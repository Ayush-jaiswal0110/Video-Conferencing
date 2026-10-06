import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';
import connectToSocket, { extractMeetingCode } from '../src/controllers/socketManager.js';
import { createAgentRouter } from '../src/routes/agentRoutes.js';
const require = createRequire(import.meta.url);
const { io: client } = require('../../frontend/node_modules/socket.io-client');
const once = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out: ${event}`)), 3000);
  socket.once(event, (...args) => { clearTimeout(timer); resolve(args); });
});

test('room ids normalize links and reject invalid values', () => {
  assert.equal(extractMeetingCode('http://localhost:3000/interview/?x=1'), 'interview');
  assert.equal(extractMeetingCode({}), null);
  assert.equal(extractMeetingCode('bad room'), null);
});

test('signaling: duplicate join, third participant, media state, isolation and leaving', async t => {
  const server = createServer(); const io = connectToSocket(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise(resolve => io.close(resolve)); });
  const connect = async () => { const socket = client(url, { transports: ['websocket'] }); sockets.push(socket); await once(socket, 'connect'); return socket; };
  const a = await connect(), b = await connect(), c = await connect(), outsider = await connect();
  let joined = once(a, 'user-joined'); a.emit('join-call', 'room', 'Alice'); await joined;
  joined = once(b, 'user-joined'); b.emit('join-call', 'room', 'Bob'); const [, ids, names] = await joined;
  assert.equal(ids.length, 2); assert.equal(names[a.id], 'Alice');
  let duplicateEvents = 0; b.on('user-joined', () => duplicateEvents++);
  b.emit('join-call', 'room', 'Bob');
  joined = once(c, 'user-joined'); c.emit('join-call', 'room', 'Carol'); const [, three] = await joined;
  assert.equal(three.length, 3); assert.equal(new Set(three).size, 3);
  assert.equal(duplicateEvents, 1);
  const signal = once(b, 'signal'); a.emit('signal', b.id, '{"sdp":{"type":"offer"}}'); assert.equal((await signal)[0], a.id);
  const media = once(b, 'media-state'); a.emit('media-state', { audio: true, video: false }); assert.deepEqual((await media)[1], { audio: true, video: false });
  const chat = once(b, 'chat-message'); a.emit('chat-message', 'hello', 'Spoofed name'); assert.equal((await chat)[0].sender, 'Alice');
  joined = once(outsider, 'user-joined'); outsider.emit('join-call', 'elsewhere', 'Other'); await joined;
  let leaked = false; outsider.on('signal', () => { leaked = true; }); a.emit('signal', outsider.id, '{}');
  const left = once(a, 'user-left'); const bId = b.id; b.disconnect(); assert.equal((await left)[0], bId);
  // Flush the event loop through a valid signal before checking isolation.
  const barrier = once(c, 'signal'); a.emit('signal', c.id, '{}'); await barrier; assert.equal(leaked, false);
});

test('AI endpoint keeps credentials server-side, checks requests and bounds session creation', async t => {
  const oldKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-only-placeholder';
  const app = express(); let requests = 0;
  app.use(createAgentRouter({ auth: (req, res, next) => { req.agentUser = 'test-user'; next(); }, fetchImpl: async (url, options) => {
    requests++; assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(options.headers.Authorization, 'Bearer test-only-placeholder');
    assert.equal(JSON.parse(options.body.get('session')).type, 'realtime');
    return new Response('v=0\r\nanswer', { status: 200 });
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; });
  const url = `http://127.0.0.1:${server.address().port}/session`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body });
  assert.equal((await post('bad')).status, 400);
  for (let i = 0; i < 5; i++) { const response = await post('v=0\r\n'); assert.equal(response.status, 200); assert.equal(await response.text(), 'v=0\r\nanswer'); }
  assert.equal((await post('v=0\r\n')).status, 429); assert.equal(requests, 5);
  delete process.env.OPENAI_API_KEY; assert.equal((await post('v=0\r\n')).status, 503);
});

test('AI endpoint requires sign-in and hides upstream errors', async t => {
  const saved = { key: process.env.OPENAI_API_KEY, guest: process.env.ALLOW_GUEST_AGENT };
  process.env.OPENAI_API_KEY = 'test-only-placeholder'; delete process.env.ALLOW_GUEST_AGENT;
  const app = express();
  app.use('/secure', createAgentRouter());
  app.use('/provider-fails', createAgentRouter({ auth: (req, res, next) => { req.agentUser = 'another-user'; next(); }, fetchImpl: async () => new Response('sensitive upstream detail', { status: 401 }) }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key; if (saved.guest === undefined) delete process.env.ALLOW_GUEST_AGENT; else process.env.ALLOW_GUEST_AGENT = saved.guest; });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = path => fetch(base + path + '/session', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0\r\n' });
  assert.equal((await request('/secure')).status, 401);
  const failed = await request('/provider-fails'); assert.equal(failed.status, 502); assert.equal((await failed.text()).includes('sensitive upstream detail'), false);
});
