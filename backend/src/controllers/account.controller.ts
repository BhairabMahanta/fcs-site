import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../lib/http.js";
import * as accountService from "../services/account.service.js";

const optionalHttpURL = (label: string) =>
  z
    .string()
    .trim()
    .max(500, `${label} is too long.`)
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      `${label} must start with http:// or https://.`,
    )
    .transform((value) => value || null);

const optionalAvatarURL = z
  .string()
  .trim()
  .max(500, "The avatar URL is too long.")
  .refine(
    (value) => !value || /^https:\/\//i.test(value),
    "The avatar URL must start with https://.",
  )
  .transform((value) => value || null);

const optionalGitHub = z
  .string()
  .trim()
  .max(40, "The GitHub username is too long.")
  .transform((value) => value.replace(/^@/, ""))
  .refine(
    (value) => !value || /^[A-Za-z0-9-]{1,39}$/.test(value),
    "A GitHub username can only use letters, numbers and hyphens.",
  )
  .transform((value) => value || null);

const ProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Keep the display name under 80 characters.")
    .optional(),
  bio: z
    .string()
    .trim()
    .max(1200, "Keep the bio under 1200 characters.")
    .transform((value) => value || null)
    .optional(),
  website_url: optionalHttpURL("The website URL").optional(),
  github_username: optionalGitHub.optional(),
  avatar_url: optionalAvatarURL.optional(),
  directory_opted_in: z.boolean().optional(),
});

const EmailPreferencesSchema = z.object({
  emailUpdates: z.boolean(),
});

export const accountController = {
  async getProfile(req: Request, res: Response) {
    res.json(await accountService.getProfile(req.user!.id));
  },

  async updateProfile(req: Request, res: Response) {
    const body = parseBody(ProfileSchema, req.body);
    res.json(await accountService.updateProfile(req.user!, body));
  },

  async updateEmailPreferences(req: Request, res: Response) {
    const body = parseBody(EmailPreferencesSchema, req.body);
    res.json(
      await accountService.updateEmailPreferences(req.user!, body.emailUpdates),
    );
  },
};
