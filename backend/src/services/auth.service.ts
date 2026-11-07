import type { Pool, PoolClient } from "pg";
import { config } from "../config.js";
import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { isMailConfigured, sendMail } from "../email/mailer.js";
import { resetEmail, verificationEmail } from "../email/templates.js";
import { HttpError } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  createOpaqueToken,
  createRefreshToken,
  hashToken,
  signAccessToken,
} from "../lib/tokens.js";
import type { AuthUser } from "../types.js";

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  directoryOptIn: boolean;
  emailUpdates: boolean;
  company?: string;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
  displayName?: string;
}

type Db = Pick<Pool, "query"> | PoolClient;

type VerificationUser = Pick<AuthUser, "id" | "email" | "display_name">;

const accountSite = config.PUBLIC_SITE_URL.replace(/\/$/, "");

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    can_view_analytics: user.can_view_analytics,
    core_member_id: user.core_member_id,
    must_reset: user.must_reset,
    email_verified_at: user.email_verified_at,
  };
}

export async function issueSession(user: AuthUser, db: Db = pool) {
  const refresh = createRefreshToken();

  await db.query(
    `insert into auth_refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [user.id, refresh.hash, refresh.expiresAt],
  );

  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.raw,
    user: publicUser(user),
  };
}

/** Create a fresh verification token and send it. Returns the link only
 * outside production, where there is no inbox to read. */
async function sendVerification(
  user: VerificationUser,
): Promise<string | undefined> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    "update auth_email_verifications set used_at = now() where user_id = $1 and used_at is null",
    [user.id],
  );
  await pool.query(
    `insert into auth_email_verifications (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [user.id, token.hash, expiresAt],
  );

  const url = `${accountSite}/#verify=${token.raw}`;

  if (!isMailConfigured()) {
    if (config.isProduction) {
      throw new HttpError(503, "Email verification is not configured yet.");
    }
    logger.info({ email: user.email, url }, "Email verification link (development)");
    return url;
  }

  await sendMail({
    to: user.email,
    ...verificationEmail(user.display_name || user.email, url),
  });

  return config.isProduction ? undefined : url;
}

async function findUserForLogin(email: string): Promise<AuthUser | null> {
  const result = await pool.query<AuthUser>(
    `select id, email, display_name, role, can_view_analytics,
            core_member_id, must_reset, email_verified_at, password_hash
       from profiles
      where lower(email) = lower($1)
      limit 1`,
    [email],
  );
  return result.rows[0] || null;
}

export async function login(input: LoginInput) {
  const user = await findUserForLogin(input.email);
  const valid = await verifyPassword(
    input.password,
    (user as (AuthUser & { password_hash?: string | null }) | null)
      ?.password_hash ?? null,
  );

  if (!user || !valid) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  if (user.role === "member" && !user.email_verified_at) {
    throw new HttpError(
      403,
      "Verify your email address first. Check your inbox or request a new link.",
    );
  }

  return issueSession(user);
}

export async function signup(input: SignupInput): Promise<{
  ok: true;
  pending?: boolean;
  verifyUrl?: string;
}> {
  if (config.isProduction && !isMailConfigured()) {
    throw new HttpError(503, "Member signup is not available right now.");
  }

  const email = input.email.toLowerCase();

  const existing = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    email_verified_at: string | null;
  }>(
    `select id, email, display_name, role, email_verified_at
       from profiles
      where lower(email) = lower($1)
      limit 1`,
    [email],
  );

  const found = existing.rows[0];
  if (found) {
    if (found.role === "member" && !found.email_verified_at) {
      const verifyUrl = await sendVerification(found);
      return { ok: true, pending: true, ...(verifyUrl ? { verifyUrl } : {}) };
    }
    throw new HttpError(
      409,
      "An account with this email already exists. Sign in instead.",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const displayName = input.displayName || email.split("@")[0];

  const created = await pool.query<AuthUser>(
    `insert into profiles
       (email, password_hash, display_name, role, directory_opted_in, email_updates)
     values ($1, $2, $3, 'member', $4, $5)
     returning id, email, display_name, role, can_view_analytics,
               core_member_id, must_reset, email_verified_at`,
    [email, passwordHash, displayName, input.directoryOptIn, input.emailUpdates],
  );

  const user = created.rows[0];
  let verifyUrl: string | undefined;
  try {
    verifyUrl = await sendVerification(user);
  } catch (error) {
    logger.error({ err: error }, "Could not send the verification email");
    throw new HttpError(
      502,
      "Your account was created, but the verification email could not be sent. Request a new link from the sign-in page.",
    );
  }

  return { ok: true, ...(verifyUrl ? { verifyUrl } : {}) };
}

export async function verifyEmail(token: string) {
  const tokenHash = hashToken(token);

  return withActor(null, async (client) => {
    const result = await client.query<{
      id: string;
      user_id: string;
      email: string;
      display_name: string | null;
      email_updates: boolean;
    }>(
      `select v.id, v.user_id, p.email, p.display_name, p.email_updates
         from auth_email_verifications v
         join profiles p on p.id = v.user_id
        where v.token_hash = $1
          and v.used_at is null
          and v.expires_at > now()
        for update of v`,
      [tokenHash],
    );

    const verification = result.rows[0];
    if (!verification) {
      throw new HttpError(400, "This verification link is invalid or expired.");
    }

    await client.query(
      "update auth_email_verifications set used_at = now() where id = $1",
      [verification.id],
    );

    const updated = await client.query<AuthUser>(
      `update profiles
          set email_verified_at = now()
        where id = $1
        returning id, email, display_name, role, can_view_analytics,
                  core_member_id, must_reset, email_verified_at`,
      [verification.user_id],
    );

    if (verification.email_updates) {
      await client.query(
        `insert into subscriptions (email, event_id, confirmed_at, added_by)
         values ($1, null, now(), $2)
         on conflict (email, event_id) do update set confirmed_at = now()`,
        [verification.email, verification.user_id],
      );
    }

    return issueSession(updated.rows[0], client);
  });
}

export async function resendVerification(email: string) {
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    email_verified_at: string | null;
  }>(
    `select id, email, display_name, role, email_verified_at
       from profiles
      where lower(email) = lower($1)
      limit 1`,
    [email.toLowerCase()],
  );

  const user = result.rows[0];
  if (!user || user.role !== "member" || user.email_verified_at) {
    // Same answer whether the address exists, is already verified, or is
    // not a member account.
    return { ok: true };
  }

  let verifyUrl: string | undefined;
  try {
    verifyUrl = await sendVerification(user);
  } catch (error) {
    logger.error({ err: error }, "Could not resend the verification email");
    throw new HttpError(
      502,
      "Could not send the verification email. Try again in a minute.",
    );
  }

  return { ok: true, ...(verifyUrl ? { verifyUrl } : {}) };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);

  return withActor(null, async (client) => {
    const result = await client.query<AuthUser & { token_id: string }>(
      `select t.id as token_id,
              p.id, p.email, p.display_name, p.role, p.can_view_analytics,
              p.core_member_id, p.must_reset, p.email_verified_at
         from auth_refresh_tokens t
         join profiles p on p.id = t.user_id
        where t.token_hash = $1
          and t.revoked_at is null
          and t.expires_at > now()
        for update of t`,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(401, "Your session expired. Sign in again.");
    }

    await client.query(
      "update auth_refresh_tokens set revoked_at = now() where id = $1",
      [row.token_id],
    );

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
      can_view_analytics: row.can_view_analytics,
      core_member_id: row.core_member_id,
      must_reset: row.must_reset,
      email_verified_at: row.email_verified_at,
    };

    return issueSession(user, client);
  });
}

export async function logout(refreshToken: string) {
  if (!refreshToken) return;

  await pool.query(
    "update auth_refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null",
    [hashToken(refreshToken)],
  );
}

export async function changePassword(
  actor: Pick<AuthUser, "id" | "email">,
  currentPassword: string,
  newPassword: string,
) {
  const current = await pool.query<{ password_hash: string | null }>(
    "select password_hash from profiles where id = $1",
    [actor.id],
  );

  if (
    !(await verifyPassword(
      currentPassword,
      current.rows[0]?.password_hash ?? null,
    ))
  ) {
    throw new HttpError(400, "Your current password is incorrect.");
  }

  const passwordHash = await hashPassword(newPassword);

  return withActor(actor, async (client) => {
    const result = await client.query<AuthUser>(
      `update profiles
          set password_hash = $1, must_reset = false
        where id = $2
        returning id, email, display_name, role, can_view_analytics,
                  core_member_id, must_reset, email_verified_at`,
      [passwordHash, actor.id],
    );

    await client.query(
      "update auth_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null",
      [actor.id],
    );

    return issueSession(result.rows[0], client);
  });
}

export async function forgotPassword(email: string) {
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
  }>(
    `select id, email, display_name, role
       from profiles
      where lower(email) = lower($1)
      limit 1`,
    [email],
  );

  const user = result.rows[0];
  if (!user) {
    // Same answer whether or not the account exists.
    return { resetUrl: undefined };
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query(
    `insert into auth_password_resets (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [user.id, token.hash, expiresAt],
  );

  const resetUrl = user.role === "member"
    ? `${accountSite}/#type=recovery&token=${token.raw}`
    : `${accountSite}/admin.html#type=recovery&token=${token.raw}`;

  if (isMailConfigured()) {
    try {
      const message = resetEmail(user.display_name || user.email, resetUrl);
      await sendMail({ to: user.email, ...message });
    } catch (error) {
      logger.error({ err: error }, "Could not send the password-reset email");
    }
  } else if (!config.isProduction) {
    // Development fallback: no email credentials, so expose the link.
    logger.info(
      { email, resetUrl },
      "Password reset link (development)",
    );
  }

  return { resetUrl: config.isProduction ? undefined : resetUrl };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);

  return withActor(null, async (client) => {
    const result = await client.query<{ id: string; user_id: string }>(
      `select id, user_id
         from auth_password_resets
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        for update`,
      [tokenHash],
    );

    const reset = result.rows[0];
    if (!reset) {
      throw new HttpError(400, "This reset link is invalid or expired.");
    }

    const passwordHash = await hashPassword(newPassword);

    const userResult = await client.query<AuthUser>(
      `update profiles
          set password_hash = $1,
              must_reset = false,
              email_verified_at = coalesce(email_verified_at, now())
        where id = $2
        returning id, email, display_name, role, can_view_analytics,
                  core_member_id, must_reset, email_verified_at`,
      [passwordHash, reset.user_id],
    );

    await client.query(
      "update auth_password_resets set used_at = now() where id = $1",
      [reset.id],
    );
    await client.query(
      "update auth_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null",
      [reset.user_id],
    );

    return issueSession(userResult.rows[0], client);
  });
}

export async function acceptInvite(input: AcceptInviteInput) {
  const tokenHash = hashToken(input.token);

  return withActor(null, async (client) => {
    const result = await client.query<{
      id: string;
      email: string;
      role: "admin" | "editor";
    }>(
      `select id, email, role
         from auth_invites
        where token_hash = $1
          and accepted_at is null
          and expires_at > now()
        for update`,
      [tokenHash],
    );

    const invite = result.rows[0];
    if (!invite) {
      throw new HttpError(400, "This invite link is invalid or expired.");
    }

    const existing = await client.query(
      "select 1 from profiles where lower(email) = lower($1)",
      [invite.email],
    );
    if (existing.rowCount) {
      throw new HttpError(409, "An account with this email already exists.");
    }

    const passwordHash = await hashPassword(input.password);
    const userResult = await client.query<AuthUser>(
      `insert into profiles (email, password_hash, display_name, role, email_verified_at)
       values ($1, $2, $3, $4, now())
       returning id, email, display_name, role, can_view_analytics,
                 core_member_id, must_reset, email_verified_at`,
      [invite.email, passwordHash, input.displayName || null, invite.role],
    );

    await client.query(
      "update auth_invites set accepted_at = now() where id = $1",
      [invite.id],
    );

    return issueSession(userResult.rows[0], client);
  });
}
