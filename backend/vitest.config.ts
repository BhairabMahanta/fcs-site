import { defineConfig } from "vitest/config";

/*
 * Integration tests truncate every application table. Refuse to run them
 * against anything that does not look like a disposable test database.
 * This prevents an accidental `TEST_DATABASE_URL` pointing at `fcs` or at
 * another shared database.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (testDatabaseUrl) {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(testDatabaseUrl).pathname.replace(/^\/+/, ""),
    );
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": ` +
        "the suite truncates every application table. Use a disposable " +
        'database whose name contains "test" (for example fcs_test).',
    );
  }
}

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      // Only used for imports and for tests that touch the database.
      // Integration tests are skipped unless TEST_DATABASE_URL is set.
      // Use a dedicated test role, never the production database role.
      DATABASE_URL:
        testDatabaseUrl ||
        "postgres://fcs_test_app:test@127.0.0.1:5432/fcs_test",
      MEDIA_DIR: "./test-media",
      PUBLIC_API_URL: "http://localhost:5050",
    },
  },
});
