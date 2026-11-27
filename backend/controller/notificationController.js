import Note from "../model/Notification.js";
import Meeting from "../model/Meeting.js";

export async function listNotifications(req, res) {
  const ownedMeetings = await Meeting.find({ createdBy: req.user.id }).distinct("_id");
  const notifications = await Note.find({
    user: req.user.id,
    $or: [{ meeting: null }, { meeting: { $in: ownedMeetings } }],
  })
    .sort({ createdAt: -1 })
    .limit(30);
  res.json(notifications);
}

export async function markAllNotificationsRead(req, res) {
  await Note.updateMany(
    { user: req.user.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true });
}
