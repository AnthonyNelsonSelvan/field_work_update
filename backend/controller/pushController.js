import PushSubscription from "../model/PushSubscription.js";
import { config } from "../config.js";

export function getVapidPublicKey(req, res) {
  if (!config.vapidPublicKey) {
    return res.status(503).json({
      message: "Push notifications are not configured.",
    });
  }
  res.json({ publicKey: config.vapidPublicKey });
}

export async function saveSubscription(req, res) {
  const subscription = req.body || {};
  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys?.auth !== "string"
  ) {
    return res.status(400).json({ message: "Invalid push subscription." });
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        user: req.user.id,
        expirationTime: subscription.expirationTime
          ? new Date(subscription.expirationTime)
          : null,
        keys: subscription.keys,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  res.status(201).json({ ok: true });
}

export async function removeSubscription(req, res) {
  await PushSubscription.deleteOne({
    user: req.user.id,
    endpoint: req.body?.endpoint,
  });
  res.json({ ok: true });
}
