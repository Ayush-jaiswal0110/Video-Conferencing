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

## 📦 Installation & Setup

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Ayush-jaiswal0110/Video-Conferencing.git
cd Video-Conferencing


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
