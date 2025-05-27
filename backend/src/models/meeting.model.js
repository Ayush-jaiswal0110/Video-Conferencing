import mongoose, { Schema } from "mongoose";

// Define the schema for a meeting
const meetingSchema = new Schema({
  user_id: { type: String },
  meetingCode: { type: String, required: true },
  date: { type: Date, default: Date.now, required: true },
  youtubeVideoId: { type: String }, // ✅ New field to store the video
});

const Meeting = mongoose.model("Meeting", meetingSchema);

export { Meeting };
