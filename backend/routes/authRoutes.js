import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { getCurrentUser, login, logout } from "../controller/authController.js";

const router = Router();
router.post("/login", asyncHandler(login));
router.post("/logout", asyncHandler(logout));
router.get("/me", authenticate, asyncHandler(getCurrentUser));

export default router;
