import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import csrfProtection from "./middleware/csrfProtection.js";
import errorHandler from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import pushRoutes from "./routes/pushRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import workRoutes from "./routes/workRoutes.js";

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/users", userRoutes);
app.use("/api/work", workRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", systemRoutes);

app.use(errorHandler);
export default app;
