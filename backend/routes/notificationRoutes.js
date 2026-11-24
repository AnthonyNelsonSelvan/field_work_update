import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { listNotifications, markAllNotificationsRead } from "../controller/notificationController.js";

const router = Router();
router.get("/", authenticate, asyncHandler(listNotifications));
router.patch("/read-all", authenticate, asyncHandler(markAllNotificationsRead));

export default router;
