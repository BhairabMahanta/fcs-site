import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../lib/http.js";
import { requireEditor } from "../middleware/auth.js";
import { mediaController } from "../controllers/media.controller.js";

export const mediaAdminRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 2 },
});

mediaAdminRouter.use(requireEditor);

mediaAdminRouter.post(
  "/member-photos",
  upload.fields([
    { name: "full", maxCount: 1 },
    { name: "thumb", maxCount: 1 },
  ]),
  asyncHandler(mediaController.uploadMemberPhotos),
);

mediaAdminRouter.delete(
  "/member-photos",
  asyncHandler(mediaController.deleteMemberPhotos),
);
