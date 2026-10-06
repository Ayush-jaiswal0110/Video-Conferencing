# Quikhire video calls and AI voice lab

React provides the lobby, participant tiles and voice test page. Express/Socket.IO handles room membership, chat, YouTube synchronization and WebRTC signaling. Camera/microphone media travels directly between browsers, not through Socket.IO. MongoDB is used for accounts, history and saved YouTube links. The voice lab connects browser audio to OpenAI Realtime over WebRTC; the backend exchanges the initial SDP without exposing its API key.

## Render: fix Not Found when refreshing a page

The frontend uses React Router. Direct requests and refreshes on /random, /agent, /auth, or another room URL must load index.html so React can render that route.

For the **existing frontend static site** at https://video-conferencing-v179.onrender.com:

1. Open the frontend service in the Render dashboard.
2. Open **Redirects/Rewrites** and add a rule:
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** **Rewrite** (not Redirect).
3. Save the rule. Open /random and /agent directly, then refresh each page. The app should load and the address should stay on the requested route.

Apply this to the frontend static site, not the Express backend. Render continues serving existing JavaScript, CSS and image files normally.

The repository's `render.yaml` includes this rule for Blueprint deployments, with frontend as the root directory and build as the publish directory. **Pushing this file alone does not update a manually created Render service.** Use the dashboard steps above for the existing site, or explicitly link/sync a Blueprint. Before adopting the Blueprint, match its service name to the actual frontend service name in your Render dashboard; the onrender.com hostname can differ from the service name.

Reference: [Render's React Router deployment instructions](https://render.com/docs/deploy-create-react-app#using-client-side-routing).

## Run locally

Use Node.js 22.9 or later. Install dependencies with `npm install` in `backend` and `frontend` if needed.

1. Copy `backend/.env.example` to `backend/.env`. Set `MONGODB_URI` for accounts/history. Guest video rooms work without MongoDB. Set `OPENAI_API_KEY` to enable the AI test. Never place this key in a `REACT_APP_*` variable.
2. Copy `frontend/.env.example` to `frontend/.env.local`. Its API address defaults to `http://localhost:8000` for local development. Restart the frontend after changing it.
3. In `backend`, run `npm start` (or `npm run dev`). In `frontend`, run `npm start`.
4. Open `http://localhost:3000/interview-test` in two browsers. Enter names, choose **Enable camera & microphone**, approve the browser prompts, and **Join meeting**. Use headphones or separate devices to avoid speaker feedback.
5. Open `http://localhost:3000/agent`, select **Start voice test**, approve microphone access and speak. The example backend setting `ALLOW_GUEST_AGENT=true` permits local loopback tests only. Production requires a signed-in account and ignores that bypass.

The backend start command loads `.env`. If using Node directly: `node --env-file-if-exists=.env src/app.js` from `backend`.

A database credential was previously embedded in the source. Rotate that password and place the replacement in the ignored backend `.env`. Removing it from the current source does not remove it from Git history.

## Permissions and cross-network calls

Camera and microphone prompts come from `getUserMedia`, initiated by the user controls. The page explains blocked permissions, missing devices and busy devices. Browser settings must be changed manually if permission was previously blocked. A missing camera does not prevent microphone access. Joining without devices still creates a participant tile and receives other participants' streams.

Use HTTPS in deployment (localhost is also allowed). Plain HTTP on a LAN IP does not qualify for camera/microphone access. When embedding the app in another portal, its iframe and Permissions-Policy must allow camera, microphone and display capture. Screen sharing has a separate browser chooser and shares screen video while retaining microphone audio.

Set `REACT_APP_API_URL` to the deployed backend URL and `FRONTEND_ORIGIN` to the frontend origin. Production calls across restrictive NATs/firewalls need a TURN relay; STUN alone cannot guarantee connectivity. Optional `REACT_APP_TURN_URL`, `REACT_APP_TURN_USERNAME`, and `REACT_APP_TURN_CREDENTIAL` settings enable a relay for testing. They are visible in browser code: production should obtain short-lived TURN credentials from an authenticated backend.

## Main fixes

- Removed the invalid `new MediaStream([black(...args), silence])` fallback. It passed a function instead of an audio track. Empty-device calls now use audio/video transceivers instead of artificial tracks.
- One Socket.IO connection per call, one normalized room ID, listeners registered before joining, and idempotent server joins.
- Only the joining browser creates offers. Existing peer connections survive subsequent joins. The answerer binds tracks to the transceivers created by the remote offer.
- Queue early ICE until remote SDP is set; serialize signaling operations; render participant tiles on membership events using `ontrack` for incoming media.
- Keep camera/mic ownership scoped to the call, mute using track enablement, preserve microphone audio during screen sharing, and close peers/devices on leaving. Late media events cannot resurrect departed tiles.
- Room-restricted signaling and bounded chat history; YouTube broadcast works even without a database.
- Fixed initial sign-in mode, missing-token history handling, stale history effect dependencies and login payload logging.

## AI latency measurements

The voice page uses the [official Realtime WebRTC handshake](https://developers.openai.com/api/docs/guides/voice-webrtc). Configure `OPENAI_REALTIME_MODEL` if your account uses another supported Realtime model; the sample defaults to `gpt-realtime-2.1`.

The page shows connection setup time (including the permission prompt), WebRTC round-trip time when available, and a response-event delay for each turn, plus p50/p95 and JSON export. The response delay runs from client receipt of `input_audio_buffer.speech_stopped` to the matching `output_audio_buffer.started` event. This excludes VAD silence detection and actual speaker playout; it is not a full end-to-end audible latency measurement. Interrupted turns and unmatched greetings are excluded. Audio/transcripts are not persisted by this app.

The endpoint requires authentication in production, bounds session starts per user, times out upstream requests and keeps the provider key on the backend. Provider account limits and spend limits still need configuring before a public rollout.

## Scalability and comparison with Teams

No Teams comparison or production load test has been performed. This is a small-room peer-to-peer mesh: each participant sends media to every other participant. Per-user upload grows with room size; room state currently lives in one backend process. It is suitable for testing small interview calls but is not evidence of Teams-scale capacity.

To evaluate Quikhire, collect at least 30 voice turns per network condition, report p50/p95, errors, disconnects, RTT and packet loss, and repeat with the intended number of concurrent sessions. Compare human-call audio/video on the same devices and network against Teams separately from AI model response delay. For large meetings use an SFU; for multiple signaling instances use shared room state, a Socket.IO adapter and appropriate load-balancer routing. TURN is needed for network coverage, independent of room size.

## Verification

- Frontend: `npm test -- --watchAll=false --runInBand`, then `npm run build` in `frontend`.
- Backend: `npm test` in `backend`.
- Browser regression: build the frontend with `REACT_APP_API_URL=http://localhost:8000`, then run `node scripts/verify-browser.cjs` from the repository root. It starts an isolated server on port 8000 (keep that port free), uses simulated camera/mic in headless Chrome and verifies received media bytes/frames, three participants, device-free joining, device toggles, screen replacement, chat, departure and denied permissions. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH` if the tools are installed elsewhere.

Automated browser tests use simulated media; real hardware, cross-network TURN, live provider credentials, account database flows, and load/cost limits need testing in your deployment.

## Microphone troubleshooting and Gemini Live

Meeting sound now uses a separate audio element, independent of camera/video playback. Each participant tile shows input/received sound activity; incoming packet counts alone do not establish audible sound. The **Play sound** button retries browser playback. The local preview stays muted to avoid hearing yourself directly.

For two browsers on one computer, pause YouTube, use headphones, mute one browser's microphone and speak through the other. Check **Sound detected** on both the sending and receiving tiles. If packets arrive but remain **Quiet**, inspect the selected microphone and Windows input level. If sound is detected remotely but inaudible, check **Play sound**, tab sound and Windows volume mixer. A second device is a useful independent check; same-device echo suppression can affect this test.

To test Gemini:

1. Put GEMINI_API_KEY in the ignored backend/.env. GEMINI_LIVE_MODEL defaults to gemini-3.8-live; choose a Live model available to your project. Keep credentials out of .env.example.
2. Restart the backend and frontend, open /agent, choose **Gemini Live**, and click **Start interview**.
3. The agent introduces itself and asks the first practice question automatically. Speak naturally and pause after your answer. Automatic voice detection waits for about 1 second of silence; thinking pauses may need tuning.
4. The mic stays live during replies so you can interrupt. **Mute microphone** stops capture/upload and sends audioStreamEnd; **Unmute microphone** resumes. **End interview** releases devices. This practice test still stops after 9 minutes.
5. Download measurements. Timing estimates the last voiced microphone chunk using local sound energy and measures receipt of the first response audio, including server pause-detection delay. Playback delay additionally includes browser scheduling, not physical speaker output. Noise/echo affect estimates, and unqualified turns are omitted. These values use different boundaries from the OpenAI metrics; neither is a Teams benchmark.

Gemini uses the [Live WebSocket API](https://ai.google.dev/api/live) and [one-use ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens). The permanent key stays on the backend. PCM microphone audio streams directly to Google while connected and unmuted, including during agent playback. API access and quota depend on the Google project. OpenAI errors distinguish recognized billing/quota failures from temporary rate limits.

The backend locks automatic VAD (1,000 ms silence, low speech-start/end sensitivity) and interruption handling into the temporary token setup. Capture starts only after setupComplete. The browser sends continuous audio without manual activityStart/activityEnd messages and requests the first question once. On interruption it discards queued playback; on mute it stops audio upload. Candidate and interviewer transcripts appear on the page and are not persisted by this app. Completed agent turns are counted, excluding interrupted turns. This is a practice conversation, not a scored interview or durable question tracker.

Test a short answer, a thinking pause, an interruption during a question, mute/unmute, and End interview. Use headphones. End should release the microphone indicator. The model finishing a turn is separate from queued speaker playback ending.

The 9-minute limit remains intentional for this prototype. Longer production interviews still need session resumption, durable progress and reconnect recovery. Automatic speech boundaries and follow-up quality require live testing. Browser tests mock server replies, verify continuous capture and mute/resume, and consume no API credits. Set TEST_GEMINI_ONLY=true and TEST_PORT=8010 to run the AI browser checks without a live backend; requests are mocked. Full meeting regressions still require a build configured with the test server's API URL.

# 🎥 Video Conferencing & Shared YouTube Watching App

A **real-time video conferencing web application** with **integrated chat** and **synchronized YouTube watching**.  
Users can create or join rooms, share YouTube links, chat, and control playback in sync with all participants.

---

## 🚀 Features

- **Real-time Video & Audio** – High-quality multi-user video conferencing using **WebRTC**
- **Text Chat** – Live chat within meeting rooms
- **Synchronized YouTube Playback** – Share a YouTube link and watch together with synced play/pause/seek controls
- **Meeting Rooms** – Join meetings with a meeting code
- **Persistent Storage** – Save meeting codes & video links using **MongoDB**
- **Socket.IO Powered** – Real-time events for chat, video sharing, and controls

---

## 🛠️ Tech Stack

**Frontend**
- React.js (or your preferred frontend framework)
- WebRTC for peer-to-peer video/audio
- Socket.IO client

**Backend**
- Node.js & Express
- Socket.IO server
- MongoDB with Mongoose

---


### 🤝 Contributing
Pull requests are welcome!
If you find bugs or have suggestions, please open an issue.

---

📖 Usage
Create/Join a Meeting

Start a new meeting to generate a meeting code

Share the meeting code with friends

Enable Camera & Mic

Allow permissions when prompted

Chat

Use the built-in chat panel to communicate

Share YouTube Link

Paste a YouTube video link to watch together

Playback Sync

Play/Pause/Seek is synced for all participants


---

👨‍💻 Author
Ayush Jaiswal

GitHub: Ayush-jaiswal0110


---

## 📦 Installation & Setup

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Ayush-jaiswal0110/Video-Conferencing.git
cd Video-Conferencing

### 2️⃣ Install Dependencies
npm install

3️⃣ Environment Variables
PORT=5000
MONGO_URI=mongodb://localhost:27017/video-conferencing
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY   # Optional for advanced features


4️⃣ Run the Application
npm run dev
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm start

---
## 🗂️ Project Structure
Video-Conferencing/
│
├── backend/               # Express + Socket.IO server
│   ├── models/             # MongoDB models
│   ├── routes/             # API routes
│   ├── socket/             # Socket.IO event handling
│   └── server.js           # Server entry point
│
├── frontend/              # React frontend
│   ├── components/         # UI components
│   ├── pages/              # App pages
│   └── App.js              # Main entry
│
└── README.md









---



## Render deployment: CORS and AI requests

For the backend service video-conferencing-backend-carn on Render, set:

- FRONTEND_ORIGIN=https://video-conferencing-v179.onrender.com
- NODE_ENV=production
- GEMINI_API_KEY to your Gemini API key (backend environment only).
- MONGODB_URI to your account database connection string (backend environment only).

For the frontend service, set REACT_APP_API_URL=https://video-conferencing-backend-carn.onrender.com and rebuild after changes. Render environment settings are separate from your local .env. Save backend environment changes and redeploy/restart the backend service. A localhost-only FRONTEND_ORIGIN will not allow the deployed site. If both origins are needed, use https://video-conferencing-v179.onrender.com,http://localhost:3000.

The shared HTTP/Socket.IO CORS configuration trims whitespace and normalizes URLs to origins. Production defaults to the known deployed frontend when no origin is configured. An explicit FRONTEND_ORIGIN overrides that default. Preflight OPTIONS requests are handled before authentication; Authorization and Content-Type are allowed. An authenticated AI route still requires sign-in in production; ALLOW_GUEST_AGENT does not bypass that on Render.

To diagnose: GET /health should return 200. An OPTIONS request to /api/v1/agent/gemini-token with Origin: https://video-conferencing-v179.onrender.com, Access-Control-Request-Method: POST, and Access-Control-Request-Headers: authorization must return Access-Control-Allow-Origin matching that origin. A 204 with no allow-origin header means the configured allowlist does not match. A Render error page or 502/503 without CORS headers instead requires checking service startup, logs or availability.
