import "dotenv/config";

const production = process.env.NODE_ENV === "production";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  throw new Error("MONGO_URI and JWT_SECRET are required.");
}
if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
  throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be configured.");
}

export const config = {
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieOptions: {
    httpOnly: true,
    sameSite: production ? "strict" : "lax",
    secure: production,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  },
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:notifications@example.com",
  dailyReminderHour: Number(process.env.DAILY_REMINDER_HOUR || 9),
};
