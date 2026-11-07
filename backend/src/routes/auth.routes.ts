import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { asyncHandler } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { authController } from "../controllers/auth.controller.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a minute." },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many password-reset requests. Try again later." },
});

const signupLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Try again later." },
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification requests. Try again later." },
});

authRouter.post("/login", loginLimiter, asyncHandler(authController.login));
authRouter.post("/signup", signupLimiter, asyncHandler(authController.signup));
authRouter.post(
  "/verify-email",
  verificationLimiter,
  asyncHandler(authController.verifyEmail),
);
authRouter.post(
  "/resend-verification",
  verificationLimiter,
  asyncHandler(authController.resendVerification),
);
authRouter.post("/refresh", asyncHandler(authController.refresh));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
authRouter.post(
  "/password",
  requireAuth,
  asyncHandler(authController.changePassword),
);
authRouter.post(
  "/forgot-password",
  resetLimiter,
  asyncHandler(authController.forgotPassword),
);
authRouter.post(
  "/reset-password",
  resetLimiter,
  asyncHandler(authController.resetPassword),
);
authRouter.post("/accept-invite", asyncHandler(authController.acceptInvite));
