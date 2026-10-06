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
      systemInstruction: { parts: [{ text: 'You are Quikhire’s AI practice interviewer. Introduce yourself clearly as AI and explain this is a practice interview. Begin by asking the candidate to introduce themselves and describe the role they are preparing for. Ask one relevant question at a time, listen to the answer, then ask a brief follow-up or the next question. Allow thinking time. If the candidate asks for more time, acknowledge briefly and wait. If interrupted, listen and respond to the new request. Keep your spoken turns short. After about five main questions, offer a short recap and ask whether they want to continue or finish. Do not make hiring decisions or claim to score suitability.' }] },
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false, silenceDurationMs: 1000, prefixPaddingMs: 100,
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW' },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
      },
      inputAudioTranscription: {},
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
