import User from "../model/WorkerUser.js";
import InvoiceEmployee from "../model/InvoiceEmployee.js";

export function normalizeInvoiceRole(role) {
  return { admin1: "admin", admin2: "accountant" }[role] || role;
}

export function getFieldDeskRole(invoiceRole) {
  if (invoiceRole === "staff") return "worker";
  if (["admin", "accountant", "superAdmin"].includes(invoiceRole)) return "admin";
  return null;
}

export async function syncFieldUser(employee, role) {
  const invoiceEmployeeId = String(employee._id);
  let user = await User.findOne({ invoiceEmployeeId });
  if (!user) user = await User.findOne({ name: employee.name });

  if (user) {
    user.invoiceEmployeeId = invoiceEmployeeId;
    user.name = employee.name;
    user.role = role;
    user.active = true;
    await user.save();
    return user;
  }

  return User.create({
    invoiceEmployeeId,
    name: employee.name,
    role,
    password: "",
  });
}

export async function migrateLegacyWorkers() {
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
}
