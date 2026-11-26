import { createRequire } from "node:module";
import PushSubscription from "../model/PushSubscription.js";
import Note from "../model/Notification.js";
import { config } from "../config.js";

const require = createRequire(import.meta.url);
const webpush = require("web-push");

if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
}

export async function sendPushToUser(userId, data) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return;

  const subscriptions = await PushSubscription.find({ user: userId });
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime() || null,
            keys: subscription.keys,
          },
          JSON.stringify(data),
          { TTL: 86400 },
        );
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          console.error("Web push delivery failed", error.statusCode || error.message);
        }
      }
    }),
  );
}

export async function notifyUsers(
  userIds,
  { kind, title, message, workItem, meeting, pushBody, tag },
) {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  if (!ids.length) return;

  let notifications;
  try {
    notifications = await Note.insertMany(
      ids.map((user) => ({ user, kind, title, message, workItem, meeting })),
    );
  } catch (error) {
    console.error("Could not save work notifications", error);
    return;
  }

  await Promise.allSettled(
    notifications.map((notification) =>
      sendPushToUser(notification.user, {
        title,
        body: pushBody || message,
        url: "/?page=alerts",
        tag: tag || "work-" + kind + "-" + workItem,
      }),
    ),
  );
}
