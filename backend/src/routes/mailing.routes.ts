import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";
import { mailingController } from "../controllers/mailing.controller.js";

export const mailingPublicRouter = Router();

mailingPublicRouter.post(
  "/",
  asyncHandler(mailingController.handlePublicAction),
);

export const mailingAdminRouter = Router();

mailingAdminRouter.get(
  "/subscriptions",
  requireAdmin,
  asyncHandler(mailingController.listSubscriptions),
);
mailingAdminRouter.post(
  "/subscriptions",
  requireAdmin,
  asyncHandler(mailingController.addSubscribers),
);
mailingAdminRouter.delete(
  "/subscriptions/:id",
  requireAdmin,
  asyncHandler(mailingController.removeSubscriber),
);
mailingAdminRouter.get(
  "/email-sends",
  requireAdmin,
  asyncHandler(mailingController.listEmailSends),
);
mailingAdminRouter.post(
  "/event-mail",
  requireAdmin,
  asyncHandler(mailingController.sendEventMail),
);

// The email test has always lived under /api/admin/team; keep that URL.
export const mailingTeamRouter = Router();
mailingTeamRouter.post(
  "/email-test",
  requireAdmin,
  asyncHandler(mailingController.sendTestEmail),
);
