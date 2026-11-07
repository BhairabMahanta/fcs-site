import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";
import { teamController } from "../controllers/team.controller.js";

export const teamRouter = Router();

teamRouter.use(requireAdmin);

teamRouter.get("/", asyncHandler(teamController.listTeam));
teamRouter.patch("/:id", asyncHandler(teamController.updateMember));
teamRouter.delete("/:id", asyncHandler(teamController.removeMember));
teamRouter.post("/invite", asyncHandler(teamController.invite));
