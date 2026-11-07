import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError, parseBody } from "../lib/http.js";
import * as mailingService from "../services/mailing.service.js";

const SubscribeSchema = z.object({
  action: z.literal("subscribe"),
  email: z.string().trim().max(254),
  event_id: z.string().uuid().nullable().optional(),
  company: z.string().optional(),
});

const LookupSchema = z.object({
  action: z.literal("lookup"),
  token: z.string().uuid("This link is not valid."),
});

const ConfirmSchema = z.object({
  action: z.literal("confirm"),
  token: z.string().uuid("This link is not valid."),
});

const UnsubscribeSchema = z.object({
  action: z.literal("unsubscribe"),
  token: z.string().uuid("This link is not valid."),
  everything: z.boolean().optional(),
});

const AddSubscribersSchema = z.object({
  emails: z.array(z.string().trim()).min(1, "Add at least one email address."),
  eventId: z.string().uuid().nullable().optional(),
});

const SendSchema = z.object({
  event_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().min(1, "Write a subject.").max(150),
  body: z.string().trim().min(1, "Write a message.").max(20_000),
  test: z.boolean().optional(),
});

const TestEmailSchema = z.object({
  to: z.string().trim().email("Enter a valid email address.").optional(),
});

export const mailingController = {
  async handlePublicAction(req: Request, res: Response) {
    const action = req.body?.action;

    if (action === "subscribe") {
      const body = parseBody(SubscribeSchema, req.body);
      res.json(await mailingService.subscribe(body));
      return;
    }

    if (action === "lookup") {
      const body = parseBody(LookupSchema, req.body);
      res.json(await mailingService.lookup(body.token));
      return;
    }

    if (action === "confirm") {
      const body = parseBody(ConfirmSchema, req.body);
      res.json(await mailingService.confirm(body.token));
      return;
    }

    if (action === "unsubscribe") {
      const body = parseBody(UnsubscribeSchema, req.body);
      res.json(
        await mailingService.unsubscribe(body.token, body.everything === true),
      );
      return;
    }

    throw new HttpError(400, "Unknown action.");
  },

  async listSubscriptions(_req: Request, res: Response) {
    res.json(await mailingService.listSubscriptions());
  },

  async addSubscribers(req: Request, res: Response) {
    const body = parseBody(AddSubscribersSchema, req.body);
    res.status(201).json(
      await mailingService.addSubscribers(req.user!, body.emails, body.eventId),
    );
  },

  async removeSubscriber(req: Request, res: Response) {
    await mailingService.removeSubscriber(String(req.params.id));
    res.status(204).end();
  },

  async listEmailSends(_req: Request, res: Response) {
    res.json(await mailingService.listEmailSends());
  },

  async sendEventMail(req: Request, res: Response) {
    const body = parseBody(SendSchema, req.body);
    res.json(await mailingService.sendEventMail(req.user!, body));
  },

  async sendTestEmail(req: Request, res: Response) {
    const body = parseBody(TestEmailSchema, req.body);
    res.json(await mailingService.sendTestEmail(req.user!, body.to));
  },
};
