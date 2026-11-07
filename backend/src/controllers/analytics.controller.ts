import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, parseBody } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import * as analyticsService from "../services/analytics.service.js";

const RangeSchema = z.object({
  since: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
  tz: z.string().max(80).default("UTC"),
});

const BOTS = /bot|crawl|spider|slurp|headless|preview|lighthouse|pingdom|monitor|curl|wget|python|go-http|java\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cut(value: unknown, length: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, length)
    : null;
}

export const analyticsController = {
  async track(req: Request, res: Response) {
    const done = () => res.status(204).end();
    const origin = req.headers.origin || "";

    if (!config.SITE_ORIGINS.includes(origin)) return done();

    const userAgent = req.headers["user-agent"] || "";
    if (!userAgent || BOTS.test(userAgent)) return done();

    let body: Record<string, unknown>;
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body.slice(0, 4000))
        : (req.body as Record<string, unknown>);
    } catch {
      return done();
    }

    const session = cut(body.session, 64);
    if (!session) return done();

    const ip = req.ip || "";

    try {
      if (body.type === "view" && typeof body.key === "string" && UUID.test(body.key)) {
        const path = cut(body.path, 200);
        if (!path || !path.startsWith("/")) return done();

        await analyticsService.recordPageview({
          ip,
          userAgent,
          viewKey: body.key,
          path,
          referrerHost: cut(body.ref, 100),
          utmSource: cut(body.utm_source, 60),
          utmMedium: cut(body.utm_medium, 60),
          utmCampaign: cut(body.utm_campaign, 60),
          session,
          isNew: body.is_new === true,
          device: ["mobile", "tablet", "desktop"].includes(String(body.device))
            ? String(body.device)
            : null,
          timezone: cut(body.tz, 60),
        });
      } else if (body.type === "engage" && typeof body.key === "string" && UUID.test(body.key)) {
        const ms = Math.min(Math.max(Math.round(Number(body.ms) || 0), 0), 30 * 60 * 1000);
        await analyticsService.recordEngagement({
          viewKey: body.key,
          session,
          ms,
        });
      } else if (body.type === "event") {
        await analyticsService.recordEvent({
          ip,
          userAgent,
          name: String(body.name),
          label: cut(body.label, 80),
          path: cut(body.path, 200),
          session,
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Analytics beacon failed");
    }

    return done();
  },

  async getReport(req: Request, res: Response) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const parsed = parseBody(RangeSchema, {
      since: req.query.since ?? weekAgo.toISOString(),
      until: req.query.until ?? now.toISOString(),
      tz: req.query.tz ?? "UTC",
    });

    if (new Date(parsed.since) >= new Date(parsed.until)) {
      throw new HttpError(400, "The start of the range must be before the end.");
    }

    res.json(await analyticsService.getReport(parsed.since, parsed.until, parsed.tz));
  },

  async getBlogPostReport(req: Request, res: Response) {
    const days = Math.min(Math.max(Number(req.query.days) || 28, 1), 365);
    const tz = typeof req.query.tz === "string" ? req.query.tz.slice(0, 80) : "UTC";

    res.json(
      await analyticsService.getBlogPostReport(String(req.params.slug), days, tz),
    );
  },
};
