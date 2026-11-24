import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { healthCheck, listServerOptions } from "../controller/systemController.js";

const router = Router();
router.get("/health", healthCheck);
router.get("/server-options", authenticate, asyncHandler(listServerOptions));

export default router;
