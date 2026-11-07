import { config } from "../config.js";
import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { isMailConfigured, sendMail } from "../email/mailer.js";
import { inviteEmail } from "../email/templates.js";
import { HttpError } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { createOpaqueToken } from "../lib/tokens.js";
import type { AuthUser } from "../types.js";

export interface ProfileUpdateInput {
  role?: "admin" | "editor" | "pending";
  display_name?: string | null;
  can_view_analytics?: boolean;
  core_member_id?: string | null;
  must_reset?: boolean;
}

export interface InviteInput {
  email: string;
  role: "admin" | "editor";
  displayName?: string;
}

export async function listTeam() {
  const result = await pool.query(
    `select id, email, display_name, role, can_view_analytics,
            core_member_id, must_reset, created_at
       from profiles
      where role <> 'member'
      order by created_at asc`,
  );
  return result.rows;
}

export async function updateMember(
  actor: Pick<AuthUser, "id" | "email">,
  targetId: string,
  input: ProfileUpdateInput,
) {
  if (input.role === undefined && input.display_name === undefined &&
      input.can_view_analytics === undefined && input.core_member_id === undefined &&
      input.must_reset === undefined) {
    throw new HttpError(400, "Send at least one field to update.");
  }

  return withActor(actor, async (client) => {
    const current = await client.query<{ id: string; role: string }>(
      "select id, role from profiles where id = $1 for update",
      [targetId],
    );

    const target = current.rows[0];
    if (!target) throw new HttpError(404, "That account does not exist.");

    if (input.role && target.role === "admin" && input.role !== "admin") {
      const admins = await client.query<{ count: string }>(
        "select count(*)::text as count from profiles where role = 'admin'",
      );
      if (Number(admins.rows[0]?.count || 0) <= 1) {
        throw new HttpError(400, "There must always be at least one admin.");
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [field, value] of Object.entries(input)) {
      if (value !== undefined) {
        values.push(value);
        fields.push(`${field} = $${values.length}`);
      }
    }
    values.push(targetId);

    const updated = await client.query(
      `update profiles
          set ${fields.join(", ")}
        where id = $${values.length}
        returning id, email, display_name, role, can_view_analytics,
                  core_member_id, must_reset, created_at`,
      values,
    );
    return updated.rows[0];
  });
}

export async function removeMember(
  actor: Pick<AuthUser, "id" | "email">,
  targetId: string,
) {
  if (targetId === actor.id) {
    throw new HttpError(400, "You cannot remove your own account.");
  }

  await withActor(actor, async (client) => {
    const target = await client.query<{ role: string }>(
      "select role from profiles where id = $1 for update",
      [targetId],
    );
    const row = target.rows[0];
    if (!row) throw new HttpError(404, "That account does not exist.");

    if (row.role === "admin") {
      const admins = await client.query<{ count: string }>(
        "select count(*)::text as count from profiles where role = 'admin'",
      );
      if (Number(admins.rows[0]?.count || 0) <= 1) {
        throw new HttpError(400, "There must always be at least one admin.");
      }
    }

    await client.query("delete from profiles where id = $1", [targetId]);
  });
}

export async function invite(
  actor: Pick<AuthUser, "id" | "email">,
  input: InviteInput,
) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await pool.query(
    "select 1 from profiles where lower(email) = lower($1)",
    [input.email],
  );
  if (existing.rowCount) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  await withActor(actor, async (client) => {
    await client.query(
      `insert into auth_invites (email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [input.email.toLowerCase(), input.role, token.hash, actor.id, expiresAt],
    );
  });

  const inviteUrl = `${config.PUBLIC_SITE_URL}/admin.html#type=invite&token=${token.raw}`;
  let emailed = false;
  let emailError: string | null = null;

  if (isMailConfigured()) {
    try {
      await sendMail({
        to: input.email,
        ...inviteEmail(input.role, inviteUrl),
      });
      emailed = true;
    } catch (error) {
      emailError = error instanceof Error
        ? error.message
        : "Could not send the invite email.";
      logger.error({ err: error }, "Could not send the invite email");
    }
  }

  return { ok: true, inviteUrl, emailed, emailError };
}
