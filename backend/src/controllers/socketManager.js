import { Server } from "socket.io";
import { Meeting } from "../models/meeting.model.js"; // Adjust path if needed

let connections = {};
let messages = {};
let timeOnline = {};
let socketToRoom = {};
let sharedVideoByRoom = {};

const extractMeetingCode = (room) => {
  if (!room) return null;
  return room.split("/").pop(); // Extracts 'abc123' from '/abc123' or full URL
};


const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("[Socket.IO] Connected:", socket.id);

    socket.on("join-call", async (rawRoom) => {
      const room = extractMeetingCode(rawRoom);
      if (!room) return;

      if (!connections[room]) connections[room] = [];
      connections[room].push(socket.id);
      timeOnline[socket.id] = new Date();
      socketToRoom[socket.id] = room;
      socket.join(room);

      console.log(`[JOIN] ${socket.id} joined room ${room}`);
      io.to(room).emit("user-joined", socket.id, connections[room]);

      (messages[room] || []).forEach((msg) => {
        socket.emit("chat-message", {
          message: msg.data,
          sender: msg.sender,
          socketIdSender: msg["socket-id-sender"],
        });
      });

      // YouTube video sharing
      if (sharedVideoByRoom[room]) {
        console.log(`[YOUTUBE] Sending cached video ID ${sharedVideoByRoom[room]} to ${socket.id}`);
        socket.emit("youtube-video-shared", sharedVideoByRoom[room]);
      } else {
        try {
          const meeting = await Meeting.findOne({ meetingCode: room });
          if (meeting?.youtubeVideoId) {
            console.log(`[YOUTUBE] Found video ID in DB for room ${room}: ${meeting.youtubeVideoId}`);
            sharedVideoByRoom[room] = meeting.youtubeVideoId;
            socket.emit("youtube-video-shared", meeting.youtubeVideoId);
          } else {
            console.log(`[YOUTUBE] No video found in DB for room ${room}`);
          }
        } catch (err) {
          console.error("DB Error fetching video:", err);
        }
      }
    });

    socket.on("signal", (toId, message) => {
      io.to(toId).emit("signal", socket.id, message);
    });

    socket.on("chat-message", (data, sender) => {
      const room = socketToRoom[socket.id];
      if (!room) return;

      const msg = { sender, data, "socket-id-sender": socket.id };
      messages[room] = messages[room] || [];
      messages[room].push(msg);

      io.to(room).emit("chat-message", {
        message: data,
        sender,
        socketIdSender: socket.id,
      });
    });

    socket.on("share-youtube-link", async (videoId) => {
      const rawRoom = socketToRoom[socket.id];
      const room = extractMeetingCode(rawRoom);
      if (!room || !videoId) {
        return console.warn(`[YouTube] Missing room or videoId for ${socket.id}`);
      }

      console.log(`[YOUTUBE] Received videoId "${videoId}" from ${socket.id} in room ${room}`);

      try {
        sharedVideoByRoom[room] = videoId;

        const updated = await Meeting.findOneAndUpdate(
          { meetingCode: room },
          { youtubeVideoId: videoId },
          { new: true }
        );

        if (updated) {
          console.log(`[YOUTUBE] Successfully saved video ID "${videoId}" to MongoDB for room ${room}`);
        } else {
          console.warn(`[YOUTUBE] No meeting found to update for room ${room}`);
        }

        io.to(room).emit("youtube-video-shared", videoId);
      } catch (error) {
        console.error("Failed to store video ID:", error);
      }
    });

    socket.on("youtube-control", (action) => {
      const room = socketToRoom[socket.id];
      if (room) {
        socket.to(room).emit("youtube-control", action);
      }
    });

    socket.on("disconnect", () => {
      const room = socketToRoom[socket.id];
      const onlineDuration = timeOnline[socket.id]
        ? new Date() - timeOnline[socket.id]
        : 0;

      if (room && connections[room]) {
        connections[room] = connections[room].filter((id) => id !== socket.id);
        socket.leave(room);

        io.to(room).emit("user-left", socket.id);

        if (connections[room].length === 0) {
          delete connections[room];
          delete messages[room];
          delete sharedVideoByRoom[room];
        }
      }

      delete timeOnline[socket.id];
      delete socketToRoom[socket.id];

      console.log(`[Socket.IO] Disconnected: ${socket.id} (Online ${onlineDuration} ms)`);
    });
  });

  return io;
};

export default connectToSocket;
