import mongoose from "mongoose";

// Field Desk reads and creates accounts in the Invoice Generator's employees
// collection so one set of credentials is used by both apps.
const schema = new mongoose.Schema(
  {
    name: String,
    role: String,
    password: String,
  },
  { collection: "employees", versionKey: false },
);

export default mongoose.models.InvoiceEmployee ||
  mongoose.model("InvoiceEmployee", schema, "employees");
