import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    scheduledAt: { type: Date, required: true, index: true },
    client: { type: String, required: true, trim: true, maxlength: 200 },
    location: { type: String, required: true, trim: true, maxlength: 300 },
    purpose: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      required: true,
    },
    notifyUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "WorkerUser" }],
    remindersSent: { type: [String], default: [] },
    remindersStartAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

schema.index({ scheduledAt: 1, remindersSent: 1 });
export default mongoose.model("Meeting", schema);
