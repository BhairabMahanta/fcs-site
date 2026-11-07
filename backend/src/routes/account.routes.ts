import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireAuth, requireVerified } from "../middleware/auth.js";
import { accountController } from "../controllers/account.controller.js";

export const accountRouter = Router();

accountRouter.use(requireAuth, requireVerified);

accountRouter.get("/profile", asyncHandler(accountController.getProfile));
accountRouter.patch("/profile", asyncHandler(accountController.updateProfile));
accountRouter.patch(
  "/email-preferences",
  asyncHandler(accountController.updateEmailPreferences),
);
