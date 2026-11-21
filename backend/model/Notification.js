import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["completion", "daily-reminder"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    workItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkItem",
      default: null,
    },
    readAt: { type: Date, default: null },
    dayKey: { type: String, default: null },
  },
  { timestamps: true },
);
schema.index(
  { user: 1, kind: 1, dayKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: "daily-reminder",
      dayKey: { $type: "string" },
    },
  },
);
export default mongoose.model("WorkNotification", schema);
