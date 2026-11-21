import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    role: { type: String, enum: ["admin", "worker"], default: "worker" },
    password: { type: String, default: "" },
    invoiceEmployeeId: { type: String, unique: true, sparse: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "workerUser" },
);
// These records remain as Field Desk identity references for existing work
// assignments and notifications. Credentials are now owned by Invoice.
export default mongoose.model("WorkerUser", schema);
