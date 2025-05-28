import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";

// Custom Modules
import connectToSocket from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";
import meetingRoutes from "./routes/meetingRoutes.js"; // ✅ newly added

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

// Config
const PORT = process.env.PORT || 8000;
app.set("port", PORT);

// Middleware
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// Routes
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/meetings", meetingRoutes); // ✅ new endpoint for meeting code generation


// MongoDB Connection + Server Start
const start = async () => {
  try {
    const db = await mongoose.connect(
      "mongodb+srv://ayushjaiswalji6:sC0njnCSneNb89zM@cluster0.pfkyi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    );
    console.log(`[MongoDB] Connected at host: ${db.connection.host}`);

    server.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("[MongoDB] Connection failed:", error);
    process.exit(1); // Fatal error
  }
};

start();
