import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    scope: { type: String, required: true, trim: true, maxlength: 1000 },
    location: { type: String, required: true, trim: true, maxlength: 300 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 200 },
    scheduledDate: { type: Date, default: null },
    assignmentMode: {
      type: String,
      enum: ["specific", "any", "all"],
      default: "specific",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      default: null,
    },
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "WorkerUser" }],
    completionRecords: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "WorkerUser", required: true },
        completedAt: { type: Date, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    completedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index({ createdAt: -1 });
export default mongoose.model("WorkItem", schema);
