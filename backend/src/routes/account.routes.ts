import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../lib/http.js";
import { requireAuth, requireVerified } from "../middleware/auth.js";
import { accountController } from "../controllers/account.controller.js";

export const accountRouter = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

accountRouter.use(requireAuth, requireVerified);

accountRouter.get("/profile", asyncHandler(accountController.getProfile));
accountRouter.patch("/profile", asyncHandler(accountController.updateProfile));
accountRouter.patch(
  "/email-preferences",
  asyncHandler(accountController.updateEmailPreferences),
);
accountRouter.post(
  "/avatar",
  avatarUpload.single("file"),
  asyncHandler(accountController.uploadAvatar),
);
accountRouter.delete("/avatar", asyncHandler(accountController.removeAvatar));
