import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { createMeeting, deleteMeeting, listMeetings, updateMeeting } from "../controller/meetingController.js";

const router = Router();
router.use(authenticate, requireSuperAdmin);
router.get("/", asyncHandler(listMeetings));
router.post("/", asyncHandler(createMeeting));
router.patch("/:id", asyncHandler(updateMeeting));
router.delete("/:id", asyncHandler(deleteMeeting));

export default router;
