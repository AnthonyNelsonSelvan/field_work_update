import PushSubscription from "../model/PushSubscription.js";
import { config } from "../config.js";
import { sendPushToUser } from "../services/pushNotifications.js";

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

export async function sendTestPush(req, res) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    return res.status(503).json({ message: "Push notifications are not configured on the server." });
  }
  const result = await sendPushToUser(req.user.id, {
    title: "Field Desk test notification",
    body: "Push notifications are connected on this device.",
    url: "/?page=alerts",
    tag: "field-desk-test-" + Date.now(),
  });
  if (result.subscriptionCount === 0) {
    return res.status(400).json({ message: "No device subscription was found. Enable notifications on this device first." });
  }
  if (!result.sentCount) {
    return res.status(502).json({
      message: result.failures[0] || "The push service rejected the notification. Check the backend logs.",
    });
  }
  res.json({
    ok: true,
    accepted: result.sentCount,
    message: "The push service accepted the test notification. Check this device's notification tray.",
  });
}
