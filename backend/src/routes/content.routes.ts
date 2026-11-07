import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireEditor, requireRole } from "../middleware/auth.js";
import { contentController } from "../controllers/content.controller.js";

export const contentPublicRouter = Router();

contentPublicRouter.get("/events", asyncHandler(contentController.listEvents));
contentPublicRouter.get(
  "/class-sessions",
  asyncHandler(contentController.listClassSessions),
);
contentPublicRouter.get(
  "/resources",
  asyncHandler(contentController.listResources),
);
contentPublicRouter.get(
  "/study-groups",
  asyncHandler(contentController.listStudyGroups),
);
contentPublicRouter.get(
  "/social-links",
  asyncHandler(contentController.listSocialLinks),
);
contentPublicRouter.get(
  "/core-members",
  asyncHandler(contentController.listCoreMembers),
);
contentPublicRouter.get(
  "/repo-kinds",
  asyncHandler(contentController.listRepoKinds),
);
contentPublicRouter.get(
  "/members",
  asyncHandler(contentController.listPublicMembers),
);

export const contentAdminRouter = Router();

contentAdminRouter.use(requireEditor);

contentAdminRouter.get("/activity", asyncHandler(contentController.listActivity));
contentAdminRouter.get(
  "/activity/:table/:rowId",
  asyncHandler(contentController.listRowActivity),
);
contentAdminRouter.post("/restore", asyncHandler(contentController.restore));
contentAdminRouter.patch(
  "/me/member-card",
  asyncHandler(contentController.setMemberCard),
);
contentAdminRouter.put(
  "/repo-kinds/:repoName",
  asyncHandler(contentController.upsertRepoKind),
);
contentAdminRouter.delete(
  "/repo-kinds/:repoName",
  requireRole("admin"),
  asyncHandler(contentController.deleteRepoKind),
);

// Keep these generic routes last: they match every remaining /:resource path.
contentAdminRouter.get(
  "/:resource",
  asyncHandler(contentController.listResourceRows),
);
contentAdminRouter.post(
  "/:resource",
  asyncHandler(contentController.createResourceRow),
);
contentAdminRouter.patch(
  "/:resource/:id",
  asyncHandler(contentController.updateResourceRow),
);
contentAdminRouter.delete(
  "/:resource/:id",
  requireRole("admin"),
  asyncHandler(contentController.deleteResourceRow),
);
