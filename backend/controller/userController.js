import argon2 from "argon2";
import InvoiceEmployee from "../model/InvoiceEmployee.js";
import { syncFieldUser } from "../services/fieldUsers.js";

export async function listWorkers(req, res) {
  const employees = await InvoiceEmployee.find({ role: "staff" })
    .select("name role")
    .sort({ name: 1 });
  const users = await Promise.all(
    employees.map((employee) => syncFieldUser(employee, "worker")),
  );
  res.json(
    users.map(({ _id, name, active, createdAt }) => ({
      _id,
      name,
      active,
      createdAt,
    })),
  );
}

export async function createWorker(req, res) {
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  if (name.length < 2 || password.length < 8) {
    return res.status(400).json({
      message: "Enter a name and password of at least 8 characters.",
    });
  }

  try {
    const existing = await InvoiceEmployee.findOne({ name });
    if (existing) {
      return res.status(409).json({
        message: "That username is already in use.",
      });
    }

    const employee = await InvoiceEmployee.create({
      name,
      password: await argon2.hash(password),
      role: "staff",
    });
    const user = await syncFieldUser(employee, "worker");
    res.status(201).json({
      user: { _id: user._id, name: user.name, role: user.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "That username is already in use.",
      });
    }
    throw error;
  }
}
