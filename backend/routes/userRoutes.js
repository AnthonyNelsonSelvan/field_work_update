import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { createWorker, listWorkers } from "../controller/userController.js";

const router = Router();
router.get("/", authenticate, requireAdmin, asyncHandler(listWorkers));
router.post("/", authenticate, requireAdmin, asyncHandler(createWorker));

export default router;
