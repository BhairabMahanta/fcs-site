import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../lib/http.js";
import * as authService from "../services/auth.service.js";

const LoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(20, "Invalid refresh token."),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(10, "The new password must be at least 10 characters."),
});

const ForgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const ResetSchema = z.object({
  token: z.string().min(20, "This reset link is not valid."),
  newPassword: z
    .string()
    .min(10, "The new password must be at least 10 characters."),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(20, "This invite link is not valid."),
  password: z.string().min(10, "The password must be at least 10 characters."),
  displayName: z.string().trim().max(120).optional(),
});

const SignupSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(10, "The password must be at least 10 characters."),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Keep the display name under 80 characters."),
  directoryOptIn: z.boolean().optional().default(false),
  emailUpdates: z.boolean().optional().default(true),
  company: z.string().optional(),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(20, "This verification link is not valid."),
});

const ResendVerificationSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export const authController = {
  async login(req: Request, res: Response) {
    const body = parseBody(LoginSchema, req.body);
    res.json(await authService.login(body));
  },

  async signup(req: Request, res: Response) {
    const body = parseBody(SignupSchema, req.body);

    // Honeypot: a real person never fills this hidden field.
    if (body.company) {
      res.json({ ok: true });
      return;
    }

    const result = await authService.signup(body);
    res.status(result.pending ? 200 : 201).json(result);
  },

  async verifyEmail(req: Request, res: Response) {
    const body = parseBody(VerifyEmailSchema, req.body);
    res.json(await authService.verifyEmail(body.token));
  },

  async resendVerification(req: Request, res: Response) {
    const body = parseBody(ResendVerificationSchema, req.body);
    res.json(await authService.resendVerification(body.email));
  },

  async refresh(req: Request, res: Response) {
    const body = parseBody(RefreshSchema, req.body);
    res.json(await authService.refresh(body.refreshToken));
  },

  async logout(req: Request, res: Response) {
    const refreshToken =
      typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    await authService.logout(refreshToken);
    res.status(204).end();
  },

  async me(req: Request, res: Response) {
    res.json({ user: req.user ? authService.publicUser(req.user) : null });
  },

  async changePassword(req: Request, res: Response) {
    const body = parseBody(ChangePasswordSchema, req.body);
    res.json(
      await authService.changePassword(
        req.user!,
        body.currentPassword,
        body.newPassword,
      ),
    );
  },

  async forgotPassword(req: Request, res: Response) {
    const body = parseBody(ForgotSchema, req.body);
    const { resetUrl } = await authService.forgotPassword(body.email);
    res.json({ ok: true, ...(resetUrl ? { resetUrl } : {}) });
  },

  async resetPassword(req: Request, res: Response) {
    const body = parseBody(ResetSchema, req.body);
    res.json(await authService.resetPassword(body.token, body.newPassword));
  },

  async acceptInvite(req: Request, res: Response) {
    const body = parseBody(AcceptInviteSchema, req.body);
    res.status(201).json(await authService.acceptInvite(body));
  },
};
