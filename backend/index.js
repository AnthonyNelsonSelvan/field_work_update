import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "node:crypto";
import argon2 from "argon2";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpush = require("web-push");
import User from "./model/WorkerUser.js";
import Work from "./model/WorkItem.js";
import Note from "./model/Notification.js";
import InvoiceEmployee from "./model/InvoiceEmployee.js";
import PushSubscription from "./model/PushSubscription.js";
const loginAttempts = new Map();

const app = express(),
  port = Number(process.env.PORT || 3001),
  secret = process.env.JWT_SECRET;
if (!process.env.MONGO_URI || !secret)
  throw Error("MONGO_URI and JWT_SECRET are required");
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com";
if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey))
  throw Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be configured.");
if (vapidPublicKey && vapidPrivateKey)
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (o, cb) =>
      !o ||
      (process.env.CORS_ORIGIN || "http://localhost:5174")
        .split(",")
        .map((x) => x.trim())
        .includes(o)
        ? cb(null, true)
        : cb(Error("CORS origin not allowed")),
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
const cookie = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 86400000,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
};
const normalizeInvoiceRole = (role) =>
  ({ admin1: "admin", admin2: "accountant" })[role] || role;
const appRoleFor = (invoiceRole) =>
  invoiceRole === "staff"
    ? "worker"
    : ["admin", "accountant", "superAdmin"].includes(invoiceRole)
      ? "admin"
      : null;
const syncFieldUser = async (employee, appRole) => {
  const invoiceEmployeeId = String(employee._id);
  let user = await User.findOne({ invoiceEmployeeId });
  if (!user) user = await User.findOne({ name: employee.name });
  if (user) {
    user.invoiceEmployeeId = invoiceEmployeeId;
    user.name = employee.name;
    user.role = appRole;
    user.active = true;
    await user.save();
    return user;
  }
  return User.create({
    invoiceEmployeeId,
    name: employee.name,
    role: appRole,
    password: "",
  });
};
const migrateLegacyWorkers = async () => {
  const legacyWorkers = await User.find({
    role: "worker",
    active: true,
    invoiceEmployeeId: { $exists: false },
  });
  for (const legacy of legacyWorkers) {
    let employee = await InvoiceEmployee.findOne({ name: legacy.name });
    if (!employee && legacy.password) {
      try {
        employee = await InvoiceEmployee.create({
          name: legacy.name,
          role: "staff",
          // Existing WorkerUser passwords are already Argon2 hashes; Invoice
          // Generator uses the same password format.
          password: legacy.password,
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        employee = await InvoiceEmployee.findOne({ name: legacy.name });
      }
    }
    if (employee) {
      legacy.invoiceEmployeeId = String(employee._id);
      legacy.name = employee.name;
      legacy.role = "worker";
      await legacy.save();
    }
  }
};
const auth = async (q, s, n) => {
  try {
    if (!q.cookies.token)
      return s.status(401).json({ message: "Please log in." });
    const claims = jwt.verify(q.cookies.token, secret);
    const employeeId = String(claims._id || claims.id || "");
    if (!employeeId) return s.status(401).json({ message: "Please log in." });
    const employee = await InvoiceEmployee.findById(employeeId).select("name role");
    if (!employee)
      return s.status(401).json({ message: "This Invoice Generator account is no longer available." });
    const invoiceRole = normalizeInvoiceRole(employee.role);
    const role = appRoleFor(invoiceRole);
    if (!role)
      return s.status(403).json({ message: "This account cannot use Field Desk." });
    const fieldUser = await syncFieldUser(employee, role);
    q.user = {
      id: String(fieldUser._id),
      employeeId,
      name: employee.name,
      role,
      invoiceRole,
    };
    return n();
  } catch {
    return s
      .status(401)
      .json({ message: "Session expired. Please sign in again." });
  }
};
const admin = (q, s, n) =>
  q.user.role === "admin"
    ? n()
    : s.status(403).json({ message: "Admin access required." });
const route = (f) => (q, s, n) => Promise.resolve(f(q, s, n)).catch(n);
async function sendPushToUser(userId, data) {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  const subscriptions = await PushSubscription.find({ user: userId });
  await Promise.allSettled(
    subscriptions.map(async (saved) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: saved.endpoint,
            expirationTime: saved.expirationTime?.getTime() || null,
            keys: saved.keys,
          },
          JSON.stringify(data),
          { TTL: 86400 },
        );
      } catch (error) {
        if ([404, 410].includes(error.statusCode))
          await PushSubscription.deleteOne({ _id: saved._id });
        else console.error("Web push delivery failed", error.statusCode || error.message);
      }
    }),
  );
}
app.get("/api/health", (q, s) =>
  s.json({
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  }),
);
app.post("/api/auth/logout", (q, s) => {
  const options = { ...cookie, maxAge: undefined };
  s.clearCookie("token", options);
  s.clearCookie("csrfToken", { ...options, httpOnly: false });
  s.json({ ok: true });
});
app.post(
  "/api/auth/login",
  route(async (q, s) => {
    const name = String(q.body?.name || "").trim();
    const password = String(q.body?.password || "");
    if (!name || !password)
      return s.status(400).json({ message: "Enter your username and password." });

    const now = Date.now();
    const key = q.ip || q.socket.remoteAddress || "unknown";
    const previous = loginAttempts.get(key);
    if (previous && now - previous.startedAt < 15 * 60 * 1000 && previous.count >= 10)
      return s.status(429).json({ message: "Too many sign-in attempts. Try again in 15 minutes." });
    if (!previous || now - previous.startedAt >= 15 * 60 * 1000)
      loginAttempts.set(key, { startedAt: now, count: 1 });
    else previous.count += 1;

    const employee = await InvoiceEmployee.findOne({ name }).select("name role password");
    if (!employee?.password || !(await argon2.verify(employee.password, password)))
      return s.status(401).json({ message: "Username or password is incorrect." });
    const invoiceRole = normalizeInvoiceRole(employee.role);
    const role = appRoleFor(invoiceRole);
    if (!role)
      return s.status(403).json({ message: "This account cannot use Field Desk." });

    loginAttempts.delete(key);
    const employeeId = String(employee._id);
    const token = jwt.sign(
      { _id: employeeId, id: employeeId, name: employee.name, role: invoiceRole },
      secret,
      { expiresIn: "1d" },
    );
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const cookieOptions = { ...cookie, path: "/" };
    s.cookie("token", token, cookieOptions);
    s.cookie("csrfToken", csrfToken, { ...cookieOptions, httpOnly: false });
    s.json({ user: { name: employee.name, role } });
  }),
);
app.get(
  "/api/auth/me",
  auth,
  route(async (q, s) => {
    const u = await User.findById(q.user.id).select("name role active");
    if (!u?.active) return s.status(401).json({ message: "Account disabled." });
    s.json({ user: { ...q.user, _id: u._id } });
  }),
);
app.use((q, s, n) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(q.method) &&
    q.cookies.csrfToken !== q.get("x-csrf-token")
  )
    return s
      .status(403)
      .json({ message: "Security token missing. Refresh and retry." });
  n();
});
app.get("/api/push/vapid-public-key", auth, (q, s) => {
  if (!vapidPublicKey)
    return s.status(503).json({ message: "Push notifications are not configured." });
  s.json({ publicKey: vapidPublicKey });
});
app.post(
  "/api/push/subscriptions",
  auth,
  route(async (q, s) => {
    const subscription = q.body || {};
    if (
      typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      typeof subscription.keys?.p256dh !== "string" ||
      typeof subscription.keys?.auth !== "string"
    )
      return s.status(400).json({ message: "Invalid push subscription." });
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          user: q.user.id,
          expirationTime: subscription.expirationTime
            ? new Date(subscription.expirationTime)
            : null,
          keys: subscription.keys,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
    s.status(201).json({ ok: true });
  }),
);
app.delete(
  "/api/push/subscriptions",
  auth,
  route(async (q, s) => {
    await PushSubscription.deleteOne({
      user: q.user.id,
      endpoint: q.body?.endpoint,
    });
    s.json({ ok: true });
  }),
);
app.get(
  "/api/users",
  auth,
  admin,
  route(async (q, s) => {
    const employees = await InvoiceEmployee.find({ role: "staff" })
      .select("name role")
      .sort({ name: 1 });
    const users = await Promise.all(
      employees.map((employee) => syncFieldUser(employee, "worker")),
    );
    s.json(users.map(({ _id, name, active, createdAt }) => ({ _id, name, active, createdAt })));
  }),
);
app.post(
  "/api/users",
  auth,
  admin,
  route(async (q, s) => {
    let name = String(q.body.name || "").trim(),
      password = String(q.body.password || "");
    if (name.length < 2 || password.length < 8)
      return s
        .status(400)
        .json({
          message: "Enter a name and password of at least 8 characters.",
        });
    try {
      const existing = await InvoiceEmployee.findOne({ name });
      if (existing)
        return s.status(409).json({ message: "That username is already in use." });
      const employee = await InvoiceEmployee.create({
        name,
        password: await argon2.hash(password),
        role: "staff",
      });
      const u = await syncFieldUser(employee, "worker");
      s.status(201).json({ user: { _id: u._id, name: u.name, role: u.role } });
    } catch (e) {
      if (e.code === 11000)
        return s
          .status(409)
          .json({ message: "That username is already in use." });
      throw e;
    }
  }),
);
app.get(
  "/api/server-options",
  auth,
  route(async (q, s) => {
    const options = await mongoose.connection.collection("wifioptions").find({ type: "server" }).sort({ createdAt: 1 }).toArray();
    s.json(options);
  }),
);
app.get(
  "/api/work",
  auth,
  route(async (q, s) => {
    let filter = q.user.role === "admin" ? {} : { assignedTo: q.user.id };
    if (["pending", "completed"].includes(q.query.status))
      filter.status = q.query.status;
    s.json(
      await Work.find(filter)
        .populate("assignedTo", "name")
        .sort({ createdAt: -1 }),
    );
  }),
);
app.post(
  "/api/work",
  auth,
  admin,
  route(async (q, s) => {
    let { scope, location, contactPerson, assignedTo } = q.body;
    if (
      !scope?.trim() ||
      !location?.trim() ||
      !contactPerson?.trim() ||
      !assignedTo
    )
      return s
        .status(400)
        .json({
          message: "Scope, location, contact person, and worker are required.",
        });
    let worker = await User.findOne({
      _id: assignedTo,
      role: "worker",
      active: true,
    });
    if (!worker)
      return s.status(400).json({ message: "Choose an active worker." });
    s.status(201).json(
      await Work.create({
        scope,
        location,
        contactPerson,
        assignedTo,
        createdBy: q.user.id,
      }),
    );
  }),
);
app.patch(
  "/api/work/:id",
  auth,
  route(async (q, s) => {
    let w = await Work.findById(q.params.id);
    if (!w) return s.status(404).json({ message: "Work not found." });
    let wasPending = w.status === "pending";
    if (q.user.role === "admin") {
      for (let k of ["scope", "location", "contactPerson"])
        if (q.body[k] !== undefined) w[k] = String(q.body[k]).trim();
      if (q.body.assignedTo !== undefined) {
        let u = await User.findOne({
          _id: q.body.assignedTo,
          role: "worker",
          active: true,
        });
        if (!u)
          return s.status(400).json({ message: "Choose an active worker." });
        w.assignedTo = u._id;
      }
      if (q.body.status !== undefined) {
        if (!["pending", "completed"].includes(q.body.status))
          return s.status(400).json({ message: "Invalid status." });
        w.status = q.body.status;
        w.completedAt =
          w.status === "completed"
            ? new Date(q.body.completedAt || Date.now())
            : null;
      }
    } else {
      if (String(w.assignedTo) !== q.user.id)
        return s
          .status(403)
          .json({ message: "This work is assigned to another worker." });
      if (q.body.status !== "completed" || !q.body.completedAt)
        return s.status(400).json({ message: "Choose a completion date." });
      w.status = "completed";
      w.completedAt = new Date(q.body.completedAt);
      if (isNaN(w.completedAt))
        return s
          .status(400)
          .json({ message: "Choose a valid completion date." });
    }
    await w.save();
    if (w.status === "completed" && wasPending) {
      const adminEmployees = await InvoiceEmployee.find({
        role: { $in: ["admin", "accountant", "superAdmin", "admin1", "admin2"] },
      }).select("name role");
      const admins = await Promise.all(
        adminEmployees.map((employee) => syncFieldUser(employee, "admin")),
      );
      const notifications = await Note.insertMany(
        admins.map((u) => ({
          user: u._id,
          kind: "completion",
          title: "Work completed",
          message: w.scope,
          workItem: w._id,
        })),
      ).catch((error) => {
        console.error("Could not save admin completion notifications", error);
        return [];
      });
      for (const notification of notifications)
        sendPushToUser(notification.user, {
          title: notification.title,
          body: "A work item was marked complete. Open Field Desk for details.",
          url: "/?page=alerts",
          tag: `work-completed-${w._id}`,
        }).catch((error) => console.error("Could not send admin push", error));
    }
    s.json(w);
  }),
);
app.delete(
  "/api/work/:id",
  auth,
  admin,
  route(async (q, s) => {
    await Work.findByIdAndDelete(q.params.id);
    s.json({ ok: true });
  }),
);
app.get(
  "/api/notifications",
  auth,
  route(async (q, s) =>
    s.json(
      await Note.find({ user: q.user.id }).sort({ createdAt: -1 }).limit(30),
    ),
  ),
);
app.patch(
  "/api/notifications/read-all",
  auth,
  route(async (q, s) => {
    await Note.updateMany(
      { user: q.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    s.json({ ok: true });
  }),
);
// Service Call Reports are handled by the Invoice Generator app and API.
app.use((e, q, s, n) => {
  console.error(e);
  s.status(e.code === 11000 ? 409 : (e.status || 500)).json({
    message:
      e.code === 11000
        ? "That value is already in use."
        : e.message && e.status ? e.message : "Something went wrong. Please retry.",
  });
});
const dayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function remind() {
  let key = dayKey();
  for (let u of await User.find({ role: "worker", active: true }).select(
    "_id",
  )) {
    let n = await Work.countDocuments({ assignedTo: u._id, status: "pending" });
    if (n) {
      const result = await Note.updateOne(
        { user: u._id, kind: "daily-reminder", dayKey: key },
        {
          $setOnInsert: {
            user: u._id,
            kind: "daily-reminder",
            dayKey: key,
            title: "Pending work reminder",
            message:
              n + " work item" + (n === 1 ? "" : "s") + " still pending.",
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount)
        await sendPushToUser(u._id, {
          title: "Pending work reminder",
          body: n + " work item" + (n === 1 ? "" : "s") + " still pending.",
          url: "/?page=alerts",
          tag: `daily-pending-${key}`,
        });
    }
  }
}
function schedule() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const configuredHour = Number(process.env.DAILY_REMINDER_HOUR || 9);
  const hour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23
    ? configuredHour
    : 9;
  const indiaOffsetMinutes = 330;
  let next = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour) -
      indiaOffsetMinutes * 60 * 1000,
  );
  if (next <= now) {
    next = new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, hour) -
        indiaOffsetMinutes * 60 * 1000,
    );
  }
  setTimeout(async () => {
    try {
      await remind();
    } catch (e) {
      console.error("Reminder failed", e);
    }
    schedule();
  }, Math.max(0, next.getTime() - Date.now()));
}
await mongoose.connect(process.env.MONGO_URI);
await migrateLegacyWorkers();
console.log("Connected to shared MongoDB");
schedule();
app.listen(port, () => console.log("Work status API listening on " + port));
