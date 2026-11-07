import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../lib/http.js";
import * as teamService from "../services/team.service.js";

const ProfileUpdateSchema = z.object({
  role: z.enum(["admin", "editor", "pending"]).optional(),
  display_name: z.string().trim().max(120).nullable().optional(),
  can_view_analytics: z.boolean().optional(),
  core_member_id: z.string().uuid().nullable().optional(),
  must_reset: z.boolean().optional(),
});

const InviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["admin", "editor"]).default("editor"),
  displayName: z.string().trim().max(120).optional(),
});

export const teamController = {
  async listTeam(_req: Request, res: Response) {
    res.json(await teamService.listTeam());
  },

  async updateMember(req: Request, res: Response) {
    const body = parseBody(ProfileUpdateSchema, req.body);
    res.json(await teamService.updateMember(req.user!, String(req.params.id), body));
  },

  async removeMember(req: Request, res: Response) {
    await teamService.removeMember(req.user!, String(req.params.id));
    res.status(204).end();
  },

  async invite(req: Request, res: Response) {
    const body = parseBody(InviteSchema, req.body);
    res.status(201).json(await teamService.invite(req.user!, body));
  },
};
