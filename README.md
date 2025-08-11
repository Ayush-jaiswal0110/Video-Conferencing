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

### 🤝 Contributing
Pull requests are welcome!
If you find bugs or have suggestions, please open an issue.

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



👨‍💻 Author
Ayush Jaiswal

GitHub: Ayush-jaiswal0110




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


