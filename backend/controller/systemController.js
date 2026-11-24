import mongoose from "mongoose";

export function healthCheck(req, res) {
  res.json({
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
}

export async function listServerOptions(req, res) {
  const options = await mongoose.connection
    .collection("wifioptions")
    .find({ type: "server" })
    .sort({ createdAt: 1 })
    .toArray();
  res.json(options);
}
