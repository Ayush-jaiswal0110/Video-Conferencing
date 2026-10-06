import express from 'express';
import { openAIError } from './providerErrors.js';
import { User } from '../models/user.model.js';

export async function authorize(req, res, next) {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_GUEST_AGENT === 'true' && loopback) {
    req.agentUser = 'local-test';
    return next();
  }
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token || User.db.readyState !== 1) return res.status(401).json({ message: 'Sign in to start an AI voice test.' });
  try {
    const user = await User.findOne({ token });
    if (!user) return res.status(401).json({ message: 'Please sign in again.' });
    req.agentUser = String(user._id);
    next();
  } catch { res.status(503).json({ message: 'Sign-in verification is temporarily unavailable.' }); }
}

export function createAgentRouter({ fetchImpl = globalThis.fetch, auth = authorize } = {}) {
  const router = express.Router();
  const attempts = new Map();
  router.post('/session', auth, express.text({ type: 'application/sdp', limit: '64kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'AI voice is not configured. Set OPENAI_API_KEY on the backend and restart it.' });
    if (typeof req.body !== 'string' || !req.body.startsWith('v=0')) return res.status(400).json({ message: 'A valid audio session offer is required.' });
    const now = Date.now();
    for (const [key, value] of attempts) if (now - value.started > 60000 && !value.active) attempts.delete(key);
    const key = req.agentUser;
    const limit = attempts.get(key) || { count: 0, started: now, active: false };
    if (limit.active || limit.count >= 5) return res.status(429).json({ message: 'Too many voice session requests. Wait a minute and retry.' });
    limit.count++;
    limit.active = true;
    attempts.set(key, limit);
    try {
      const body = new FormData();
      body.set('sdp', req.body);
      body.set('session', JSON.stringify({
        type: 'realtime', model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
        instructions: 'You are Quikhire’s AI voice test assistant. Introduce yourself as AI. Have a short, friendly conversation to test voice latency. Keep each response to one or two short sentences and ask one question at a time. Do not claim to evaluate candidates or make hiring decisions.',
        audio: { input: { turn_detection: { type: 'server_vad', silence_duration_ms: 500, create_response: true, interrupt_response: true } }, output: { voice: 'marin' } },
      }));
      const response = await fetchImpl('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body,
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const failure = openAIError(response.status, details);
        return res.status(response.status === 429 ? 429 : 502).json(failure);
      }
      res.type('application/sdp').send(await response.text());
    } catch { res.status(502).json({ message: 'Could not connect to the AI voice provider. Please retry.' }); }
    finally { limit.active = false; }
  });
  return router;
}
export default createAgentRouter();
