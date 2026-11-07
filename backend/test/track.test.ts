import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("POST /api/track", () => {
  it("allows the beacon response to be read cross-origin", async () => {
    const response = await request(createApp())
      .post("/api/track")
      .set("origin", "https://example.com")
      .set("user-agent", "Mozilla/5.0 Chrome/120")
      .set("content-type", "text/plain")
      .send(JSON.stringify({ type: "view", key: "test", path: "/", session: "test" }));

    // A disallowed origin still gets a quiet 204, but the browser must be
    // allowed to read it: sendBeacon is a no-CORS request.
    expect(response.status).toBe(204);
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
