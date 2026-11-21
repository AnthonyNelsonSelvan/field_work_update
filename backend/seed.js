import "dotenv/config";
import mongoose from "mongoose";

if (!process.env.MONGO_URI) throw Error("Set MONGO_URI.");
await mongoose.connect(process.env.MONGO_URI);
console.log(
  "Field Desk uses Invoice Generator employee accounts. Create admin and staff accounts in Field Desk after signing in with an Invoice Generator admin account.",
);
await mongoose.disconnect();
