import Note from "../model/Notification.js";
import Meeting from "../model/Meeting.js";

const notificationsPerPage = 20;

export async function listNotifications(req, res) {
  const requestedPage = Number.parseInt(req.query.page, 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const ownedMeetings = await Meeting.find({ createdBy: req.user.id }).distinct("_id");
  const filter = {
    user: req.user.id,
    $or: [{ meeting: null }, { meeting: { $in: ownedMeetings } }],
  };
  const [total, unread] = await Promise.all([
    Note.countDocuments(filter),
    Note.countDocuments({ ...filter, readAt: null }),
  ]);
  const pages = Math.max(1, Math.ceil(total / notificationsPerPage));
  const currentPage = Math.min(page, pages);
  const notifications = await Note.find(filter)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * notificationsPerPage)
    .limit(notificationsPerPage);
  res.json({
    notifications,
    page: currentPage,
    pages,
    total,
    unread,
  });
}

export async function markAllNotificationsRead(req, res) {
  await Note.updateMany(
    { user: req.user.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true });
}
