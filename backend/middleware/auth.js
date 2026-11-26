import jwt from "jsonwebtoken";
import InvoiceEmployee from "../model/InvoiceEmployee.js";
import { config } from "../config.js";
import { getFieldDeskRole, normalizeInvoiceRole, syncFieldUser } from "../services/fieldUsers.js";

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: "Please log in." });

    const claims = jwt.verify(token, config.jwtSecret);
    const employeeId = String(claims._id || claims.id || "");
    if (!employeeId) return res.status(401).json({ message: "Please log in." });

    const employee = await InvoiceEmployee.findById(employeeId).select("name role");
    if (!employee) {
      return res.status(401).json({
        message: "This Invoice Generator account is no longer available.",
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
    req.user = {
      id: String(fieldUser._id),
      employeeId,
      name: employee.name,
      role,
      invoiceRole,
    };
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please sign in again." });
  }
}

export function requireSuperAdmin(req, res, next) {
  if (req.user?.invoiceRole === "superAdmin") return next();
  return res.status(403).json({ message: "Super admin access required." });
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ message: "Admin access required." });
}
