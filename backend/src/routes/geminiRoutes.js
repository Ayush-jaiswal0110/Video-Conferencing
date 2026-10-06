import express from 'express';
import { authorize } from './agentRoutes.js';

export function createGeminiRouter({ fetchImpl = globalThis.fetch, auth = authorize } = {}) {
  const router = express.Router();
  const attempts = new Map();
  router.post('/gemini-token', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ message: 'Gemini is not configured. Set GEMINI_API_KEY in backend/.env and restart the backend.' });
    const now = Date.now();
    for (const [key, entry] of attempts) if (!entry.active && now - entry.started > 60000) attempts.delete(key);
    const entry = attempts.get(req.agentUser) || { started: now, count: 0, active: false };
    if (entry.active || entry.count >= 5) return res.status(429).json({ message: 'Too many Gemini test starts. Wait a minute before retrying.' });
    entry.active = true; entry.count++; attempts.set(req.agentUser, entry);
    const model = 'models/' + (process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live').replace(/^models\//, '');
    const config = {
      generationConfig: { responseModalities: ['AUDIO'] },
      systemInstruction: { parts: [{ text: 'You are Quikhire’s AI voice test assistant. Identify yourself as AI. Respond briefly, in one or two sentences, to help test voice responsiveness. Do not evaluate candidates or make hiring decisions.' }] },
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      outputAudioTranscription: {},
    };
    try {
      const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
        method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uses: 1, expireTime: new Date(now + 10 * 60 * 1000).toISOString(), newSessionExpireTime: new Date(now + 60000).toISOString(), bidiGenerateContentSetup: { model, ...config } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ message: response.status === 429
        ? 'Gemini rejected this test because of API quota or rate limits. Check the project quota and billing in Google AI Studio.'
        : 'Gemini rejected the token request. Check GEMINI_API_KEY, Live API model access and key restrictions in Google AI Studio.' });
      const token = await response.json();
      if (typeof token.name !== 'string' || !token.name) throw new Error('Missing token');
      // Only a one-use, short-lived token reaches the browser; never the API key.
      res.json({ token: token.name, setup: { model, ...config } });
    } catch { res.status(502).json({ message: 'Could not connect to Gemini Live. Check backend network access and try again.' }); }
    finally { entry.active = false; }
  });
  return router;
}
export default createGeminiRouter();
