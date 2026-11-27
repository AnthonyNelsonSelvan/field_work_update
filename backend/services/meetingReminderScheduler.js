import Meeting from "../model/Meeting.js";
import { notifyUsers } from "./pushNotifications.js";

const reminderStages = [
  { key: "24h", offsetMs: 24 * 60 * 60 * 1000, title: "Meeting reminder: 24 hours" },
  { key: "12h", offsetMs: 12 * 60 * 60 * 1000, title: "Meeting reminder: 12 hours" },
  { key: "6h", offsetMs: 6 * 60 * 60 * 1000, title: "Meeting reminder: 6 hours" },
  { key: "3h", offsetMs: 3 * 60 * 60 * 1000, title: "Meeting reminder: 3 hours" },
  { key: "30m", offsetMs: 30 * 60 * 1000, title: "Final meeting reminder" },
];

function describeMeeting(meeting) {
  const time = new Date(meeting.scheduledAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
  return [
    meeting.client,
    time,
    meeting.location,
    meeting.purpose,
  ].join(" · ");
}

async function processMeetingReminders() {
  const now = new Date();
  const meetings = await Meeting.find({
    scheduledAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  }).limit(500);

  for (const meeting of meetings) {
    for (const stage of reminderStages) {
      const alertAt = new Date(meeting.scheduledAt.getTime() - stage.offsetMs);
      const remindersStartAt = meeting.remindersStartAt || meeting.createdAt;
      if (now < alertAt || remindersStartAt > alertAt) continue;

      const claim = await Meeting.updateOne(
        {
          _id: meeting._id,
          scheduledAt: meeting.scheduledAt,
          remindersSent: { $ne: stage.key },
        },
        { $addToSet: { remindersSent: stage.key } },
      );
      if (claim.modifiedCount !== 1) continue;

      // Meeting reminders are private to the super admin who created the meeting.
      const recipients = [meeting.createdBy];
      const isFinal = stage.key === "30m";
      await notifyUsers(recipients, {
        kind: "meeting-reminder",
        title: stage.title,
        message: describeMeeting(meeting),
        meeting: meeting._id,
        pushBody: isFinal
          ? "Final alert: " + meeting.client + " meeting starts in 30 minutes."
          : meeting.client + " meeting is in " + stage.key + ".",
        tag: "meeting-" + meeting._id + "-" + stage.key,
      });
    }
  }
}

export function startMeetingReminderScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processMeetingReminders();
    } catch (error) {
      console.error("Meeting reminder scheduler failed", error);
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(run, 60 * 1000);
}
