import Note from "../model/Notification.js";

export async function listNotifications(req, res) {
  const notifications = await Note.find({ user: req.user.id })
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
