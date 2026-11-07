import assert from "node:assert/strict";
import { test } from "node:test";

const memory = new Map();

function installBrowser(config = { apiBaseUrl: "https://api.test" }) {
  memory.clear();
  globalThis.FCS_CONFIG = config;
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  globalThis.location = { hash: "" };
}

async function load() {
  // Each test gets a fresh module instance, so the in-memory session does
  // not leak between tests.
  return import(`../api.js?test=${Math.random()}`);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("public reads fall back to seed data when the API fails", async () => {
  installBrowser();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const api = await load();
  const seed = [{ id: "seed" }];
  assert.deepEqual(await api.getEvents(seed), seed);
});

test("public reads prefer API data, even when it is empty", async () => {
  installBrowser();
  globalThis.fetch = async () => json([]);

  const api = await load();
  assert.deepEqual(await api.getResources([{ id: "seed" }]), []);
});

test("sign in stores the session and user", async () => {
  installBrowser();
  globalThis.fetch = async () =>
    json({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "a@example.com", role: "admin" },
    });

  const api = await load();
  const user = await api.signIn("a@example.com", "password");

  assert.equal(user.email, "a@example.com");
  assert.equal((await api.getSession()).user.id, "u1");
  assert.equal(api.isConfigured(), true);
});

test("sign up posts the member fields without creating a session", async () => {
  installBrowser();

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ ok: true });
  };

  const api = await load();
  await api.signUp({
    email: "member@example.com",
    password: "member-password-123",
    displayName: "Test Member",
    emailUpdates: true,
  });

  assert.equal(request.url, "https://api.test/api/auth/signup");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), {
    email: "member@example.com",
    password: "member-password-123",
    displayName: "Test Member",
    directoryOptIn: false,
    emailUpdates: true,
    company: "",
  });
  assert.equal(await api.getSession(), null);
});

test("verifying an email stores the returned session", async () => {
  installBrowser();

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    });
  };

  const api = await load();
  const user = await api.verifyEmail("verify-token");

  assert.equal(request.url, "https://api.test/api/auth/verify-email");
  assert.deepEqual(JSON.parse(request.options.body), { token: "verify-token" });
  assert.equal(user.role, "member");
  assert.equal((await api.getSession()).user.id, "u1");
});

test("resend verification asks the API", async () => {
  installBrowser();

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ ok: true });
  };

  const api = await load();
  await api.resendVerification("member@example.com");

  assert.equal(request.url, "https://api.test/api/auth/resend-verification");
  assert.deepEqual(JSON.parse(request.options.body), {
    email: "member@example.com",
  });
});

test("profile requests send the session token", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ id: "u1", display_name: "Test Member" });
  };

  const api = await load();
  const profile = await api.getProfile();

  assert.equal(request.url, "https://api.test/api/account/profile");
  assert.equal(request.options.headers.authorization, "Bearer access");
  assert.equal(profile.display_name, "Test Member");
});

test("profile updates patch the supplied fields", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ id: "u1", display_name: "New Name" });
  };

  const api = await load();
  const profile = await api.updateProfile({ display_name: "New Name", bio: "Hello" });

  assert.equal(request.url, "https://api.test/api/account/profile");
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.options.headers.authorization, "Bearer access");
  assert.deepEqual(JSON.parse(request.options.body), {
    display_name: "New Name",
    bio: "Hello",
  });
  assert.equal(profile.display_name, "New Name");
});

test("avatar upload sends the file as multipart form data", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ id: "u1", avatar_url: "https://api.test/media/members/avatars/a.png" });
  };

  const api = await load();
  const file = new Blob(["png"], { type: "image/png" });
  const profile = await api.uploadMyAvatar(file);

  assert.equal(request.url, "https://api.test/api/account/avatar");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer access");
  assert.ok(request.options.body instanceof FormData);
  assert.equal(request.options.body.get("file").type, "image/png");
  assert.equal(profile.avatar_url, "https://api.test/media/members/avatars/a.png");
});

test("removing an avatar sends a DELETE request", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ id: "u1", avatar_url: null });
  };

  const api = await load();
  await api.removeMyAvatar();

  assert.equal(request.url, "https://api.test/api/account/avatar");
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.headers.authorization, "Bearer access");
});

test("email preference updates patch the switch state", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "member@example.com", role: "member" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ emailUpdates: false });
  };

  const api = await load();
  const result = await api.updateEmailPreferences(false);

  assert.equal(request.url, "https://api.test/api/account/email-preferences");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), { emailUpdates: false });
  assert.equal(result.emailUpdates, false);
});

test("admin writes send the bearer token and JSON body", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "a@example.com", role: "admin" },
    }),
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({ id: "e1", title: "New event" }, 201);
  };

  const api = await load();
  const event = await api.createEvent({ title: "New event", starts_at: "2030-01-01T00:00:00.000Z" });

  assert.equal(event.id, "e1");
  assert.equal(request.url, "https://api.test/api/admin/events");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer access");
  assert.deepEqual(JSON.parse(request.options.body), {
    title: "New event",
    starts_at: "2030-01-01T00:00:00.000Z",
  });
});

test("password reset uses the token from the URL hash", async () => {
  installBrowser();
  globalThis.location.hash = "#type=recovery&token=reset-token";

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return json({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "a@example.com", role: "admin" },
    });
  };

  const api = await load();
  await api.updatePassword("new-password-123");

  assert.equal(request.url, "https://api.test/api/auth/reset-password");
  assert.deepEqual(JSON.parse(request.options.body), {
    token: "reset-token",
    newPassword: "new-password-123",
  });
});

test("readAdminTable maps database names to API routes", async () => {
  installBrowser();
  memory.set(
    "fcs-api-session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: "u1", email: "a@example.com", role: "admin" },
    }),
  );

  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return json([]);
  };

  const api = await load();
  await api.readAdminTable("class_sessions");
  await api.readAdminTable("repo_kinds");

  assert.deepEqual(urls, [
    "https://api.test/api/admin/class-sessions",
    "https://api.test/api/public/repo-kinds",
  ]);
});
