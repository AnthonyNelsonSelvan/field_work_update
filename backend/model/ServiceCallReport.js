import mongoose from "mongoose";

const subcategoryValues = [
  "installation",
  "cctvCamera",
  "biometrics",
  "intercom",
  "vdpSystem",
  "xrayBaggageScanner",
  "fireIntruderAlarm",
  "automation",
  "wiring",
  "computers",
  "laptop",
  "posSystem",
  "printer",
  "drawer",
  "other",
];
const schema = new mongoose.Schema(
  {
    reportNo: { type: Number, required: true, unique: true },
    date: { type: Date, required: true },
    companyName: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    category: {
      type: String,
      required: true,
      enum: ["amcService", "paidService", "freeService"],
    },
    subCategories: {
      type: [{ type: String, enum: subcategoryValues }],
      default: [],
    },
    subCategoryOther: { type: String, trim: true, default: "" },
    workRemark: {
      type: String,
      required: true,
      enum: ["pending", "complete"],
      default: "pending",
    },
    payment: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    resolution: { type: String, trim: true, default: "" },
    receiver: { type: String, required: true, trim: true },
    receiverMobile: { type: String, trim: true, default: "" },
    deliveryPerson: { type: String, trim: true, default: "" },
    receiverPhoto: { type: String, trim: true, default: "" },
    confirmationToken: { type: String, default: null, index: true },
    confirmationStatus: {
      type: String,
      enum: ["pending", "confirmed"],
      default: "pending",
    },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "servicecallreports" },
);
export default mongoose.model("ServiceCallReport", schema);
