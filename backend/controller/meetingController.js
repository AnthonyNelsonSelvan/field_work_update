import InvoiceEmployee from "../model/InvoiceEmployee.js";
import Meeting from "../model/Meeting.js";
import { syncFieldUser } from "../services/fieldUsers.js";
import { notifyUsers } from "../services/pushNotifications.js";

const finalReminderMs = 30 * 60 * 1000;

function parseMeetingDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getSuperAdminUserIds() {
  const employees = await InvoiceEmployee.find({ role: "superAdmin" }).select("name role");
  const users = await Promise.all(
    employees.map((employee) => syncFieldUser(employee, "admin")),
  );
  return users.map((user) => user._id);
}

function getMeetingMessage(meeting) {
  return [
    "Client: " + meeting.client,
    "When: " + new Date(meeting.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    "Where: " + meeting.location,
    "Purpose: " + meeting.purpose,
  ].join(" · ");
}

export async function listMeetings(req, res) {
  const meetings = await Meeting.find({ scheduledAt: { $gte: new Date() } })
    .sort({ scheduledAt: 1 });
  res.json(meetings);
}

export async function createMeeting(req, res) {
  const client = String(req.body.client || "").trim();
  const location = String(req.body.location || "").trim();
  const purpose = String(req.body.purpose || "").trim();
  const scheduledAt = parseMeetingDate(req.body.scheduledAt);

  if (!client || !location || !purpose || !scheduledAt) {
    return res.status(400).json({
      message: "Enter a valid meeting date, time, client, location, and purpose.",
    });
  }
  if (scheduledAt <= new Date()) {
    return res.status(400).json({ message: "Choose a future meeting date and time." });
  }

  const notifyUsersList = await getSuperAdminUserIds();
  const meeting = await Meeting.create({
    scheduledAt,
    client,
    location,
    purpose,
    createdBy: req.user.id,
    notifyUsers: notifyUsersList,
  });

  if (scheduledAt.getTime() - Date.now() <= finalReminderMs) {
    meeting.remindersSent.push("30m");
    await meeting.save();
    await notifyUsers(notifyUsersList, {
      kind: "meeting-reminder",
      title: "Final meeting reminder",
      message: getMeetingMessage(meeting),
      meeting: meeting._id,
      pushBody: "Final reminder: " + client + " meeting starts soon.",
      tag: "meeting-final-" + meeting._id,
    });
  }

  res.status(201).json(meeting);
}

export async function updateMeeting(req, res) {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ message: "Meeting not found." });

  const client = String(req.body.client || "").trim();
  const location = String(req.body.location || "").trim();
  const purpose = String(req.body.purpose || "").trim();
  const scheduledAt = parseMeetingDate(req.body.scheduledAt);
  if (!client || !location || !purpose || !scheduledAt) {
    return res.status(400).json({
      message: "Enter a valid meeting date, time, client, location, and purpose.",
    });
  }
  if (scheduledAt <= new Date()) {
    return res.status(400).json({ message: "Choose a future meeting date and time." });
  }

  const scheduleChanged = meeting.scheduledAt.getTime() !== scheduledAt.getTime();
  meeting.client = client;
  meeting.location = location;
  meeting.purpose = purpose;
  meeting.scheduledAt = scheduledAt;
  if (scheduleChanged) {
    meeting.remindersSent = [];
    meeting.remindersStartAt = new Date();
  }
  await meeting.save();

  if (scheduleChanged && scheduledAt.getTime() - Date.now() <= finalReminderMs) {
    meeting.remindersSent.push("30m");
    await meeting.save();
    await notifyUsers(meeting.notifyUsers, {
      kind: "meeting-reminder",
      title: "Final meeting reminder",
      message: getMeetingMessage(meeting),
      meeting: meeting._id,
      pushBody: "Final reminder: " + client + " meeting starts soon.",
      tag: "meeting-final-" + meeting._id,
    });
  }
  res.json(meeting);
}

export async function deleteMeeting(req, res) {
  const meeting = await Meeting.findByIdAndDelete(req.params.id);
  if (!meeting) return res.status(404).json({ message: "Meeting not found." });
  res.json({ ok: true });
}
