import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createGeminiRouter } from '../src/routes/geminiRoutes.js';
import { openAIError } from '../src/routes/providerErrors.js';

test('OpenAI errors distinguish credits, quota and temporary rate limits without leaking messages', () => {
  assert.equal(openAIError(429, null).code, 'provider_limit');
  assert.equal(openAIError(429, { error: { code: '__proto__' } }).code, 'provider_limit');
  assert.match(openAIError(429, { error: { code: 'credit_balance_exhausted' } }).message, /credits are exhausted/);
  assert.match(openAIError(429, { error: { type: 'insufficient_quota' } }).message, /Retrying alone will not fix/);
  assert.match(openAIError(429, { error: { code: 'rate_limit_exceeded' } }).message, /temporarily/);
  assert.equal(JSON.stringify(openAIError(429, { error: { message: 'SECRET' } })).includes('SECRET'), false);
});
test('Gemini issues only a restricted single-use token, checks auth and handles upstream limits', async t => {
  const saved = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'backend-only-test-key';
  const app = express(); let fail = false; let requests = 0;
  const auth = (req, res, next) => { req.agentUser = 'test'; next(); };
  app.use('/secure', createGeminiRouter({ auth: (req, res) => res.sendStatus(401) }));
  app.use(createGeminiRouter({ auth, fetchImpl: async (url, options) => {
    requests++; assert.match(url, /v1beta\/auth_tokens$/);
    assert.equal(options.headers['x-goog-api-key'], 'backend-only-test-key');
    const body = JSON.parse(options.body); assert.equal(body.uses, 1);
    assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ['AUDIO']);
    assert.equal(body.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection.disabled, false);
    assert.equal(body.bidiGenerateContentSetup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 1000);
    assert.equal(body.bidiGenerateContentSetup.realtimeInputConfig.activityHandling, 'START_OF_ACTIVITY_INTERRUPTS');
    assert.deepEqual(body.bidiGenerateContentSetup.inputAudioTranscription, {});
    assert.ok(Date.parse(body.expireTime) - Date.now() <= 600000);
    return fail ? new Response('PRIVATE', { status: 429 }) : Response.json({ name: 'auth_tokens/test' });
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved; });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = path => fetch(base + path + '/gemini-token', { method: 'POST' });
  assert.equal((await post('/secure')).status, 401);
  const response = await post(''); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.token, 'auth_tokens/test'); assert.ok(body.setup.model.startsWith('models/'));
  assert.equal(JSON.stringify(body).includes('backend-only-test-key'), false);
  fail = true; const failed = await post(''); assert.equal(failed.status, 429); assert.equal((await failed.text()).includes('PRIVATE'), false);
  for (let i = 0; i < 3; i++) await post('');
  assert.equal((await post('')).status, 429); assert.equal(requests, 5);
  delete process.env.GEMINI_API_KEY; assert.equal((await post('')).status, 503);
});
