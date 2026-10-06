import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { frontendOrigins, frontendCors, deployedFrontend } from '../src/cors.js';

test('frontend origins normalize whitespace, quotes, trailing slashes and URL paths', () => {
  assert.deepEqual(frontendOrigins(' https://video-conferencing-v179.onrender.com/ , http://localhost:3000/, "https://video-conferencing-v179.onrender.com/agent" '), [deployedFrontend, 'http://localhost:3000']);
  assert.equal(frontendOrigins('*'), '*');
  assert.throws(() => frontendOrigins('localhost:3000'), /FRONTEND_ORIGIN/);
  assert.throws(() => frontendOrigins('https://user:password@example.com'), /FRONTEND_ORIGIN/);
});

test('production default allows the deployed frontend, not arbitrary sites', () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { assert.deepEqual(frontendOrigins(''), [deployedFrontend]); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('Gemini preflight accepts authorization without authentication; errors retain CORS headers', async t => {
  const previous = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = ' https://video-conferencing-v179.onrender.com/ , http://localhost:3000/ ';
  const app = express(); app.use(frontendCors());
  if (previous === undefined) delete process.env.FRONTEND_ORIGIN; else process.env.FRONTEND_ORIGIN = previous;
  let authCalls = 0;
  app.post('/api/v1/agent/gemini-token', (req, res) => { authCalls++; res.status(401).json({ message: 'Sign in to start an AI voice test.' }); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/agent/gemini-token`;
  const preflight = origin => fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  for (const origin of [deployedFrontend, 'http://localhost:3000']) {
    const response = await preflight(origin);
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/i);
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
  }
  assert.equal(authCalls, 0);
  assert.equal((await preflight('https://untrusted.example')).headers.get('access-control-allow-origin'), null);
  const denied = await fetch(url, { method: 'POST', headers: { Origin: deployedFrontend } });
  assert.equal(denied.status, 401); assert.equal(denied.headers.get('access-control-allow-origin'), deployedFrontend);
  assert.match((await denied.json()).message, /Sign in/);
});
