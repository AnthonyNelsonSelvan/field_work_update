import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import InvoiceEmployee from "../model/InvoiceEmployee.js";
import User from "../model/WorkerUser.js";
import { config } from "../config.js";
import { getFieldDeskRole, normalizeInvoiceRole, syncFieldUser } from "../services/fieldUsers.js";

const loginAttempts = new Map();
const sessionDuration = () => config.sessionDurationDays + "d";
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 10;

function isLoginRateLimited(key, now) {
  const previous = loginAttempts.get(key);
  if (!previous || now - previous.startedAt >= loginWindowMs) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  if (previous.count >= maxLoginAttempts) return true;
  previous.count += 1;
  return false;
}

export async function login(req, res) {
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!name || !password) {
    return res.status(400).json({ message: "Enter your username and password." });
  }

  const attemptKey = req.ip || req.socket.remoteAddress || "unknown";
  if (isLoginRateLimited(attemptKey, Date.now())) {
    return res.status(429).json({
      message: "Too many sign-in attempts. Try again in 15 minutes.",
    });
  }

  const employee = await InvoiceEmployee.findOne({ name }).select("name role password");
  if (!employee?.password || !(await argon2.verify(employee.password, password))) {
    return res.status(401).json({
      message: "Username or password is incorrect.",
    });
  }

  const invoiceRole = normalizeInvoiceRole(employee.role);
  const role = getFieldDeskRole(invoiceRole);
  if (!role) {
    return res.status(403).json({
      message: "This account cannot use Field Desk.",
    });
  }

  const fieldUser = await syncFieldUser(employee, role);
  loginAttempts.delete(attemptKey);

  const employeeId = String(employee._id);
  const token = jwt.sign(
    { _id: employeeId, id: employeeId, name: employee.name, role: invoiceRole },
    config.jwtSecret,
    { expiresIn: sessionDuration() },
  );
  const csrfToken = crypto.randomBytes(32).toString("hex");
  res.cookie("token", token, config.cookieOptions);
  res.cookie("csrfToken", csrfToken, {
    ...config.cookieOptions,
    httpOnly: false,
  });

  res.json({
    user: {
      _id: fieldUser._id,
      employeeId,
      name: employee.name,
      role,
      invoiceRole,
    },
  });
}

export function logout(req, res) {
  const cookieOptions = { ...config.cookieOptions, maxAge: undefined };
  res.clearCookie("token", cookieOptions);
  res.clearCookie("csrfToken", { ...cookieOptions, httpOnly: false });
  res.json({ ok: true });
}

export async function getCurrentUser(req, res) {
  const user = await User.findById(req.user.id).select("name role active");
  if (!user?.active) {
    return res.status(401).json({ message: "Account disabled." });
  }
  res.json({ user: { ...req.user, _id: user._id } });
}
