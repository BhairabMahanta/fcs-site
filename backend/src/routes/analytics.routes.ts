import express, { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import {
  requireAnalytics,
  requireAuth,
  requireEditor,
} from "../middleware/auth.js";
import { analyticsController } from "../controllers/analytics.controller.js";

export const analyticsTrackRouter = Router();

analyticsTrackRouter.post(
  "/track",
  // sendBeacon is a no-CORS request. Helmet's default CORP header makes the
  // browser discard its response, so allow just this endpoint to be read
  // cross-origin. The request itself was already reaching the server.
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.text({ type: "text/plain", limit: "4kb" }),
  asyncHandler(analyticsController.track),
);

export const analyticsAdminRouter = Router();

analyticsAdminRouter.get(
  "/analytics",
  requireAuth,
  requireAnalytics,
  asyncHandler(analyticsController.getReport),
);
analyticsAdminRouter.get(
  "/blog-posts/:slug/analytics",
  requireEditor,
  asyncHandler(analyticsController.getBlogPostReport),
);
