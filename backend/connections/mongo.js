import mongoose from "mongoose";

export default function connectMongo(uri) {
  return mongoose.connect(uri);
}
