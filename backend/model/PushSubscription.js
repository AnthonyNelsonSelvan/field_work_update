import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerUser",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Date, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true, collection: "fieldDeskPushSubscriptions" },
);

export default mongoose.model("FieldDeskPushSubscription", schema);
