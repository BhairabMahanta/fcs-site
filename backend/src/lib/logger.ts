import pino from "pino";
import { config } from "../config.js";

/*
 * One structured logger for the API, the services and the process lifecycle.
 * pino-http attaches a request-scoped child logger as req.log, so request and
 * error lines share the same request id.
 *
 * Never log credentials or client IP headers. nginx access logs are separate;
 * these application logs deliberately redact the forwarded address headers.
 */
export const logger = pino({
  level: config.isTest ? "silent" : config.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      'req.headers["x-real-ip"]',
      'req.headers["x-forwarded-for"]',
      'req.headers["cf-connecting-ip"]',
      'res.headers["set-cookie"]',
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.refreshToken",
      "req.body.token",
    ],
    censor: "[redacted]",
  },
});
