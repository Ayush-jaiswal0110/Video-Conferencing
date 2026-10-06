import express from 'express';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import cors from 'cors';
import connectToSocket from './controllers/socketManager.js';
import userRoutes from './routes/users.routes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import geminiRoutes from './routes/geminiRoutes.js';

const app = express();
const server = createServer(app);
connectToSocket(server);
const PORT = process.env.PORT || 8000;
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || '*' }));
app.use(express.json({ limit: '40kb' }));
app.use(express.urlencoded({ limit: '40kb', extended: true }));
app.get('/health', (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/agent', geminiRoutes);
const requireDatabase = (req, res, next) => mongoose.connection.readyState === 1
  ? next() : res.status(503).json({ message: 'Database unavailable. Configure MONGODB_URI to use accounts and meeting history.' });
app.use('/api/v1/users', requireDatabase, userRoutes);
app.use('/api/v1/meetings', requireDatabase, meetingRoutes);

// Guest calls and local AI tests can run without an account database.
server.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).then(() => console.log('[MongoDB] Connected'))
    .catch(() => console.error('[MongoDB] Connection failed. Check MONGODB_URI and database access.'));
} else console.log('[MongoDB] MONGODB_URI not set; account/history features are unavailable.');
