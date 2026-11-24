import User from "../model/WorkerUser.js";
import Work from "../model/WorkItem.js";
import Note from "../model/Notification.js";
import { config } from "../config.js";
import { sendPushToUser } from "./pushNotifications.js";

function indiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getNextReminderTime(now) {
  const hour = Number.isInteger(config.dailyReminderHour) &&
    config.dailyReminderHour >= 0 && config.dailyReminderHour <= 23
    ? config.dailyReminderHour
    : 9;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const indiaOffsetMs = 330 * 60 * 1000;
  let next = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour) -
      indiaOffsetMs,
  );
  if (next <= now) {
    next = new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, hour) -
        indiaOffsetMs,
    );
  }
  return next;
}

async function sendDailyReminders() {
  const dayKey = indiaDateKey();
  const workers = await User.find({ role: "worker", active: true }).select("_id");

  for (const worker of workers) {
    const pendingCount = await Work.countDocuments({
      status: "pending",
      $or: [
        { assignedTo: worker._id },
        { assignmentMode: "any" },
        { assignmentMode: "all", assignedUsers: worker._id },
      ],
    });
    if (!pendingCount) continue;

    const result = await Note.updateOne(
      { user: worker._id, kind: "daily-reminder", dayKey },
      {
        $setOnInsert: {
          user: worker._id,
          kind: "daily-reminder",
          dayKey,
          title: "Pending work reminder",
          message: pendingCount + " work item" + (pendingCount === 1 ? "" : "s") + " still pending.",
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount) {
      await sendPushToUser(worker._id, {
        title: "Pending work reminder",
        body: pendingCount + " work item" + (pendingCount === 1 ? "" : "s") + " still pending.",
        url: "/?page=alerts",
        tag: "daily-pending-" + dayKey,
      });
    }
  }
}

export function scheduleDailyReminders() {
  const nextReminder = getNextReminderTime(new Date());
  const delay = Math.max(0, nextReminder.getTime() - Date.now());

  setTimeout(async () => {
    try {
      await sendDailyReminders();
    } catch (error) {
      console.error("Reminder failed", error);
    }
    scheduleDailyReminders();
  }, delay);
}
