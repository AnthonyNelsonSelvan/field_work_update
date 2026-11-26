import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { getVapidPublicKey, removeSubscription, saveSubscription, sendTestPush } from "../controller/pushController.js";

const router = Router();
router.get("/vapid-public-key", authenticate, getVapidPublicKey);
router.post("/subscriptions", authenticate, asyncHandler(saveSubscription));
router.delete("/subscriptions", authenticate, asyncHandler(removeSubscription));
router.post("/test", authenticate, asyncHandler(sendTestPush));

export default router;
