const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('node:http');
const express = require('../backend/node_modules/express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { default: connectToSocket } = await import(pathToFileURL(path.resolve('backend/src/controllers/socketManager.js')));
  const app = express();
  app.use(express.static(path.resolve('frontend/build')));
  app.get('*', (req, res) => res.sendFile(path.resolve('frontend/build/index.html')));
  const server = createServer(app);
  const io = connectToSocket(server);
  const port = Number(process.env.TEST_PORT || 8000);
  const base = `http://localhost:${port}`;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const newPage = async () => {
      const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const NativePeer = window.RTCPeerConnection;
        window.__peers = [];
        window.__streams = [];
        const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await getMedia(...args); window.__streams.push(stream); return stream; };
        window.RTCPeerConnection = class extends NativePeer { constructor(...args) { super(...args); window.__peers.push(this); } };
      });
      await page.goto(base + '/browser-test');
      return page;
    };
    const join = async (page, name, without = false) => {
      await page.getByLabel('Your name', { exact: true }).fill(name);
      await page.getByRole('button', { name: without ? 'Join without devices' : 'Join meeting', exact: true }).click();
      await page.getByRole('region', { name: 'Participants' }).waitFor();
    };
    const connected = page => page.waitForFunction(() => window.__peers.some(pc => pc.connectionState === 'connected'), { timeout: 15000 });
    const received = page => page.evaluate(async () => {
      const reports = await Promise.all(window.__peers.filter(pc => pc.connectionState === 'connected').map(pc => pc.getStats()));
      return reports.flatMap(stats => [...stats.values()].filter(s => s.type === 'inbound-rtp').map(s => ({ kind: s.kind, bytes: s.bytesReceived, frames: s.framesDecoded })));
    });
    if (!process.env.TEST_GEMINI_ONLY) {
    const a = await newPage(); await join(a, 'Alice');
    const b = await newPage(); await join(b, 'Bob');
    await Promise.all([connected(a), connected(b)]);
    await a.waitForFunction(() => { const video = document.querySelector('[data-participant="remote"] video'); return video && video.videoWidth > 0; });
    await b.waitForFunction(() => { const video = document.querySelector('[data-participant="remote"] video'); return video && video.videoWidth > 0; });
    const before = await received(a);
    await a.waitForFunction(async initial => {
      for (const pc of window.__peers) if (pc.connectionState === 'connected') {
        const stats = await pc.getStats();
        const audio = [...stats.values()].find(s => s.type === 'inbound-rtp' && s.kind === 'audio');
        if (audio?.bytesReceived > initial) return true;
      }
      return false;
    }, before.find(s => s.kind === 'audio')?.bytes || 0);
    const twoWay = { alice: await received(a), bob: await received(b) };
    for (const report of Object.values(twoWay)) { assert.ok(report.some(s => s.kind === 'audio' && s.bytes > 0)); assert.ok(report.some(s => s.kind === 'video' && s.frames > 0)); }
    console.log('PASS: two-way audio bytes and decoded video frames', JSON.stringify(twoWay));
    await a.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    assert.equal(await a.evaluate(() => window.__peers[0].getSenders().find(s => s.track?.kind === 'audio').track.enabled), false);
    await a.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
    await a.getByRole('button', { name: 'Turn camera off', exact: true }).click();
    await a.getByRole('button', { name: 'Turn camera on', exact: true }).click();
    const c = await newPage(); await join(c, 'Carol', true); await connected(c);
    await a.waitForFunction(() => document.querySelectorAll('[data-participant="remote"]').length === 2);
    assert.equal(await a.evaluate(() => window.__peers.length), 2);
    await c.getByRole('button', { name: 'Turn camera on', exact: true }).click();
    await c.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
    await a.waitForFunction(() => [...document.querySelectorAll('[data-participant="remote"] video')].every(v => v.videoWidth > 0));
    console.log('PASS: three participants, device-free join, camera/mic enabled after join, mute/unmute');
    await a.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, 640, 480);
        return canvas.captureStream(5);
      };
    });
    await a.getByRole('button', { name: 'Share screen', exact: true }).click();
    assert.equal(await a.evaluate(() => window.__peers[0].getSenders().find(s => s.track?.kind === 'audio').track.readyState), 'live');
    await a.getByRole('button', { name: 'Stop screen sharing', exact: true }).click();
    await a.getByRole('button', { name: 'Toggle chat', exact: true }).click();
    await b.getByRole('button', { name: 'Toggle chat', exact: true }).click();
    await a.getByLabel('Message', { exact: true }).fill('Hello from Alice'); await a.getByRole('button', { name: 'Send', exact: true }).click();
    await b.getByText('Hello from Alice', { exact: false }).waitFor();
    await c.getByRole('button', { name: 'Leave call', exact: true }).click();
    await a.waitForFunction(() => document.querySelectorAll('[data-participant="remote"]').length === 1);
    await a.screenshot({ path: 'test-results/meeting.png', fullPage: true });
    console.log('PASS: screen replacement/restoration, chat, participant departure');
    }
    const denied = await newPage();
    await denied.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await denied.getByRole('button', { name: 'Enable camera & microphone', exact: true }).click();
    await denied.getByRole('alert').filter({ hasText: 'blocked' }).waitFor();
    if (!process.env.TEST_GEMINI_ONLY) await join(denied, 'Guest', true);
    await denied.goto(base + '/agent');
    await denied.getByRole('heading', { name: 'Talk with an AI agent' }).waitFor();
    await denied.screenshot({ path: 'test-results/agent.png', fullPage: true });
    await denied.route('**/api/v1/agent/session', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'AI voice is not configured.' }) }));
    await denied.getByRole('button', { name: 'Start voice test', exact: true }).click();
    await denied.getByRole('alert').filter({ hasText: 'AI voice is not configured.' }).waitFor();
    assert.equal(await denied.evaluate(() => window.__streams.every(stream => stream.getTracks().every(t => t.readyState === 'ended'))), true);
    if (!process.env.TEST_GEMINI_ONLY) {
    const micA = await newPage(); await micA.goto(base + '/mic-only');
    const micB = await newPage(); await micB.goto(base + '/mic-only');
    await join(micA, 'Mic Alice', true); await join(micB, 'Mic Bob', true);
    await micA.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
    await micB.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
    for (const page of [micA, micB]) {
      await page.waitForFunction(async () => {
        const audio = document.querySelector('[data-participant="remote"] audio');
        if (!audio || audio.paused || audio.muted || audio.currentTime <= 0) return false;
        for (const pc of window.__peers) {
          const stats = await pc.getStats();
          if ([...stats.values()].some(s => s.type === 'inbound-rtp' && s.kind === 'audio' && s.totalAudioEnergy > 0)) return true;
        }
        return false;
      });
      assert.equal(await page.locator('[data-participant="remote"] audio').evaluate(el => el.srcObject.getVideoTracks().length), 0);
    }
    console.log('PASS: microphone-only calls receive nonzero sound energy and advance unmuted audio playback in both browsers');
    }
    await denied.getByLabel('Voice provider').selectOption('gemini');
    await denied.route('**/api/v1/agent/gemini-token', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Gemini is not configured.' }) }));
    await denied.getByRole('button', { name: 'Start interview', exact: true }).click();
    await denied.getByRole('alert').filter({ hasText: 'Gemini is not configured.' }).waitFor().catch(async error => { console.log('Gemini failure diagnostic:', await denied.locator('main').innerText(), errors); throw error; });
    assert.equal(await denied.evaluate(() => window.__streams.every(stream => stream.getTracks().every(t => t.readyState === 'ended'))), true);
    console.log('PASS: Gemini provider selection and failure releases microphone');
    await denied.unroute('**/api/v1/agent/gemini-token');
    await denied.route('**/api/v1/agent/gemini-token', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'auth_tokens/test', setup: { model: 'models/test', generationConfig: { responseModalities: ['AUDIO'] } } }) }));
    const geminiMessages = []; let audioChunks = 0;
    await denied.routeWebSocket(/generativelanguage.googleapis.com/, socket => {
      const reply = text => socket.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] }, outputTranscription: { text }, turnComplete: true } }));
      socket.onMessage(raw => {
        const message = JSON.parse(raw); geminiMessages.push(message);
        if (message.setup) socket.send(JSON.stringify({ setupComplete: {} }));
        if (message.clientContent) reply('Welcome. Tell me about yourself.');
        if (message.realtimeInput?.audio && ++audioChunks === 6) {
          socket.send(JSON.stringify({ serverContent: { interrupted: true } }));
          socket.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'I am practising for an interview.' } } }));
          reply('Tell me about a project you worked on.');
        }
      });
    });
    await denied.goto(base + '/agent');
    await denied.getByLabel('Voice provider').selectOption('gemini');
    await denied.getByRole('button', { name: 'Start interview', exact: true }).click();
    await denied.getByText(/Welcome. Tell me about yourself/).waitFor();
    await denied.getByText(/Tell me about a project you worked on/).waitFor();
    await denied.getByText(/I am practising for an interview/).waitFor();
    assert.ok(geminiMessages.some(m => m.realtimeInput?.audio?.mimeType === 'audio/pcm;rate=16000'));
    assert.equal(geminiMessages.filter(m => m.clientContent).length, 1);
    assert.equal(geminiMessages.some(m => m.realtimeInput?.activityStart || m.realtimeInput?.activityEnd), false);
    assert.equal(await denied.getByRole('button', { name: 'Finish turn', exact: true }).count(), 0);
    await denied.getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await denied.getByText('Microphone muted — audio is not being sent').waitFor();
    assert.equal(await denied.evaluate(() => window.__streams.every(stream => stream.getAudioTracks().every(t => !t.enabled || t.readyState === 'ended'))), true);
    await new Promise(resolve => setTimeout(resolve, 200));
    const mutedCount = audioChunks;
    await new Promise(resolve => setTimeout(resolve, 400)); assert.equal(audioChunks, mutedCount);
    assert.ok(geminiMessages.some(m => m.realtimeInput?.audioStreamEnd));
    await denied.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
    const deadline = Date.now() + 5000;
    while (audioChunks === mutedCount && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(audioChunks > mutedCount);
    await denied.screenshot({ path: 'test-results/gemini-handsfree.png', fullPage: true });
    await denied.getByRole('button', { name: 'End interview', exact: true }).click();
    assert.equal(await denied.evaluate(() => window.__streams.every(stream => stream.getTracks().every(t => t.readyState === 'ended'))), true);
    console.log('PASS: Gemini hands-free opening question, continuous PCM, automatic mocked replies, interruption, transcripts, mute/resume and cleanup');
    assert.deepEqual(errors, []);
    console.log('PASS: permissions-denied recovery, AI page and no uncaught browser errors');
  } finally { await browser.close(); await new Promise(resolve => io.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
