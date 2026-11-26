import InvoiceEmployee from "../model/InvoiceEmployee.js";
import User from "../model/WorkerUser.js";
import Work from "../model/WorkItem.js";
import { syncFieldUser } from "../services/fieldUsers.js";
import { notifyUsers } from "../services/pushNotifications.js";

const assignmentModes = ["specific", "any", "all"];

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

async function getActiveWorkers() {
  return User.find({ role: "worker", active: true }).select("_id");
}

export async function listWork(req, res) {
  const filter =
    req.user.role === "admin"
      ? {}
      : {
          $or: [
            { assignedTo: req.user.id },
            { assignmentMode: "any" },
            { assignmentMode: "all", assignedUsers: req.user.id },
          ],
        };

  if (["pending", "completed"].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const workItems = await Work.find(filter)
    .populate("assignedTo", "name")
    .populate("assignedUsers", "name")
    .sort({ createdAt: -1 });
  res.json(workItems);
}

export async function createWork(req, res) {
  const scope = String(req.body.scope || "").trim();
  const location = String(req.body.location || "").trim();
  const contactPerson = String(req.body.contactPerson || "").trim();
  const scheduledDate = parseDateOnly(req.body.scheduledDate);
  const assignmentMode = req.body.assignmentMode || "specific";

  if (!scope || !location || !contactPerson || !scheduledDate) {
    return res.status(400).json({
      message: "Scope, location, contact person, and scheduled date are required.",
    });
  }
  if (!assignmentModes.includes(assignmentMode)) {
    return res.status(400).json({
      message: "Choose a valid assignment option.",
    });
  }

  let assignedTo = null;
  let assignedUsers = [];
  if (assignmentMode === "specific") {
    const worker = await User.findOne({
      _id: req.body.assignedTo,
      role: "worker",
      active: true,
    }).select("_id");
    if (!worker) {
      return res.status(400).json({ message: "Choose an active worker." });
    }
    assignedTo = worker._id;
    assignedUsers = [worker._id];
  } else {
    const workers = await getActiveWorkers();
    assignedUsers = workers.map((worker) => worker._id);
    if (!assignedUsers.length) {
      return res.status(400).json({
        message: "Create an active worker before assigning this work.",
      });
    }
  }

  const work = await Work.create({
    scope,
    location,
    contactPerson,
    scheduledDate,
    assignmentMode,
    assignedTo,
    assignedUsers,
    createdBy: req.user.id,
  });

  await notifyUsers(assignedUsers, {
    kind: "assignment",
    title: "New work assigned",
    message: scope,
    workItem: work._id,
    pushBody: "New work: " + scope,
    tag: "work-assigned-" + work._id,
  });
  res.status(201).json(work);
}

function getPriorWorkerIds(work) {
  const workers = work.assignedUsers?.length
    ? work.assignedUsers
    : work.assignedTo
      ? [work.assignedTo]
      : [];
  return workers.map(String).sort();
}

async function applyAssignment(work, body) {
  const assignmentMode = body.assignmentMode || work.assignmentMode || "specific";
  if (!assignmentModes.includes(assignmentMode)) {
    return { error: "Choose a valid assignment option." };
  }

  const oldIds = getPriorWorkerIds(work);
  if (assignmentMode === "specific") {
    const workerId = body.assignedTo || work.assignedTo;
    const worker = await User.findOne({
      _id: workerId,
      role: "worker",
      active: true,
    }).select("_id");
    if (!worker) return { error: "Choose an active worker." };
    work.assignedTo = worker._id;
    work.assignedUsers = [worker._id];
  } else {
    const workers = await getActiveWorkers();
    work.assignedTo = null;
    work.assignedUsers = workers.map((worker) => worker._id);
    if (!work.assignedUsers.length) {
      return { error: "Create an active worker before assigning this work." };
    }
  }

  const newIds = work.assignedUsers.map(String).sort();
  const changed =
    (work.assignmentMode || "specific") !== assignmentMode ||
    oldIds.join(",") !== newIds.join(",");
  work.assignmentMode = assignmentMode;

  if (changed) {
    work.completionRecords = [];
    work.status = "pending";
    work.completedAt = null;
  }
  return { changed };
}

async function updateAsAdmin(work, body) {
  const previousStatus = work.status;
  for (const field of ["scope", "location", "contactPerson"]) {
    if (body[field] !== undefined) {
      work[field] = String(body[field]).trim();
    }
  }

  if (body.scheduledDate !== undefined) {
    if (!body.scheduledDate) {
      work.scheduledDate = null;
    } else {
      const scheduledDate = parseDateOnly(body.scheduledDate);
      if (!scheduledDate) return { error: "Choose a valid scheduled date." };
      work.scheduledDate = scheduledDate;
    }
  }

  let assignmentChanged = false;
  if (body.assignmentMode !== undefined || body.assignedTo !== undefined) {
    const result = await applyAssignment(work, body);
    if (result.error) return result;
    assignmentChanged = result.changed;
  }

  if (body.status !== undefined && !assignmentChanged) {
    if (!["pending", "completed"].includes(body.status)) {
      return { error: "Invalid status." };
    }
    work.status = body.status;
    work.completedAt =
      work.status === "completed"
        ? new Date(body.completedAt || Date.now())
        : null;
    if (work.status === "pending" && previousStatus !== "pending") {
      work.completionRecords = [];
    }
  }
  return { assignmentChanged };
}

function validateCompletionDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function updateAsWorker(work, body, user) {
  const mode = work.assignmentMode || "specific";
  const assignedIds = (work.assignedUsers || []).map(String);
  const isAssignedSpecifically =
    mode === "specific" && String(work.assignedTo) === user.id;
  const isAvailableToAnyWorker = mode === "any";
  const isAssignedToAll = mode === "all" && assignedIds.includes(user.id);

  if (!isAssignedSpecifically && !isAvailableToAnyWorker && !isAssignedToAll) {
    return { error: "This work is not assigned to you.", status: 403 };
  }
  if (body.status !== "completed") {
    return { error: "Choose a completion date." };
  }

  const completedAt = validateCompletionDate(body.completedAt);
  if (!completedAt) return { error: "Choose a valid completion date." };
  if (work.status === "completed") {
    return { error: "This work is already completed.", status: 409 };
  }
  if (work.completionRecords.some((record) => String(record.user) === user.id)) {
    return { error: "You already marked this work complete.", status: 409 };
  }

  work.completionRecords.push({ user: user.id, completedAt });
  if (!isAssignedToAll) {
    work.status = "completed";
    work.completedAt = completedAt;
  } else {
    const completedIds = new Set(
      work.completionRecords.map((record) => String(record.user)),
    );
    const everyoneCompleted =
      assignedIds.length > 0 && assignedIds.every((id) => completedIds.has(id));
    if (everyoneCompleted) {
      work.status = "completed";
      work.completedAt = completedAt;
    }
  }
  return { ok: true };
}

async function notifyAdminsOfCompletion(work, user) {
  const employees = await InvoiceEmployee.find({
    role: { $in: ["admin", "accountant", "superAdmin", "admin1", "admin2"] },
  }).select("name role");
  const admins = await Promise.all(
    employees.map((employee) => syncFieldUser(employee, "admin")),
  );
  await notifyUsers(admins.map((admin) => admin._id), {
    kind: "completion",
    title: "Work progress updated",
    message: user.name + " completed: " + work.scope,
    workItem: work._id,
    pushBody: user.name + " marked work complete: " + work.scope,
    tag: "work-completed-" + work._id + "-" + user.id,
  });
}

export async function updateWork(req, res) {
  const work = await Work.findById(req.params.id);
  if (!work) return res.status(404).json({ message: "Work not found." });

  let assignmentChanged = false;
  if (req.user.role === "admin") {
    const result = await updateAsAdmin(work, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({ message: result.error });
    }
    assignmentChanged = result.assignmentChanged;
  } else {
    const result = await updateAsWorker(work, req.body, req.user);
    if (result.error) {
      return res.status(result.status || 400).json({ message: result.error });
    }
  }

  await work.save();
  if (assignmentChanged) {
    await notifyUsers(work.assignedUsers || [], {
      kind: "assignment",
      title: "Work assignment updated",
      message: work.scope,
      workItem: work._id,
      pushBody: "Work assignment updated: " + work.scope,
      tag: "work-assigned-" + work._id + "-" + Date.now(),
    });
  }
  if (req.user.role !== "admin") {
    await notifyAdminsOfCompletion(work, req.user);
  }
  res.json(work);
}

export async function deleteWork(req, res) {
  await Work.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}
