import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireEditor } from "../middleware/auth.js";
import { integrationsController } from "../controllers/integrations.controller.js";

export const integrationsRouter = Router();

integrationsRouter.post(
  "/medium",
  requireEditor,
  asyncHandler(integrationsController.runAction),
);
