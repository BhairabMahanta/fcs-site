import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/index.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    { host: config.HOST, port: config.PORT, env: config.NODE_ENV },
    "fcs-backend listening",
  );
  // PM2 waits for this when ecosystem.config.cjs sets wait_ready.
  process.send?.("ready");
});

async function cleanupAnalytics() {
  await pool.query(`
    delete from analytics_pageviews where at < now() - interval '13 months';
    delete from analytics_events where at < now() - interval '13 months';
    delete from analytics_salts where day < current_date - 1;
  `);
}

// One process is deployed, so a simple timer is enough for retention.
const analyticsCleanupTimer = setInterval(() => {
  cleanupAnalytics().catch((error) => {
    logger.error({ err: error }, "Analytics cleanup failed");
  });
}, 6 * 60 * 60 * 1000);
analyticsCleanupTimer.unref();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await pool.end();
    } catch (error) {
      logger.error({ err: error }, "Error closing database pool");
    }
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
