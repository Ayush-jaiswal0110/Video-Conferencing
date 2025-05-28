import express from 'express';
import { Meeting } from '../models/meeting.model.js';
import { nanoid } from 'nanoid'; // npm i nanoid

const router = express.Router();

router.post('/create-meeting', async (req, res) => {
  try {
    const meetingCode = nanoid(8); // Generates 8-char unique code like "aB3dE1Gh"

    const newMeeting = new Meeting({
      meetingCode,
      createdAt: new Date(),
      youtubeVideoId: "", // Initially empty
    });

    await newMeeting.save();

    res.status(201).json({ success: true, meetingCode });
  } catch (err) {
    console.error("Error creating meeting:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

export default router;
