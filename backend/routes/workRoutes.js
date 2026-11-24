import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { createWork, deleteWork, listWork, updateWork } from "../controller/workController.js";

const router = Router();
router.get("/", authenticate, asyncHandler(listWork));
router.post("/", authenticate, requireAdmin, asyncHandler(createWork));
router.patch("/:id", authenticate, asyncHandler(updateWork));
router.delete("/:id", authenticate, requireAdmin, asyncHandler(deleteWork));

export default router;
