import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    scope: { type: String, required: true, trim: true, maxlength: 1000 },
    location: { type: String, required: true, trim: true, maxlength: 300 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 200 },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      required: true,
    },
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
