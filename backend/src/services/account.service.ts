import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { HttpError } from "../lib/http.js";
import type { AuthUser } from "../types.js";

export interface ProfileInput {
  display_name?: string;
  bio?: string | null;
  website_url?: string | null;
  github_username?: string | null;
  avatar_url?: string | null;
  directory_opted_in?: boolean;
}

type AccountProfile = {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  website_url: string | null;
  github_username: string | null;
  avatar_url: string | null;
  directory_opted_in: boolean;
  email_updates: boolean;
  role: string;
  created_at: string;
  email_verified_at: string | null;
};

const PROFILE_COLUMNS = `
  id, email, display_name, bio, website_url, github_username, avatar_url,
  directory_opted_in, email_updates, role, created_at, email_verified_at
`;

export async function getProfile(userId: string): Promise<AccountProfile> {
  const result = await pool.query<AccountProfile>(
    `select ${PROFILE_COLUMNS} from profiles where id = $1`,
    [userId],
  );
  const profile = result.rows[0];
  if (!profile) throw new HttpError(404, "That account does not exist.");
  return profile;
}

export async function updateProfile(
  actor: Pick<AuthUser, "id" | "email">,
  input: ProfileInput,
): Promise<AccountProfile> {
  if (Object.values(input).every((value) => value === undefined)) {
    throw new HttpError(400, "Send at least one field to update.");
  }

  return withActor(actor, async (client) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [field, value] of Object.entries(input)) {
      if (value !== undefined) {
        values.push(value);
        fields.push(`${field} = $${values.length}`);
      }
    }
    values.push(actor.id);

    const result = await client.query<AccountProfile>(
      `update profiles
          set ${fields.join(", ")}
        where id = $${values.length}
        returning ${PROFILE_COLUMNS}`,
      values,
    );

    const row = result.rows[0];
    if (!row) throw new HttpError(404, "That account does not exist.");
    return row;
  });
}

export async function updateEmailPreferences(
  actor: Pick<AuthUser, "id" | "email">,
  enabled: boolean,
) {
  await withActor(actor, async (client) => {
    await client.query(
      "update profiles set email_updates = $1 where id = $2",
      [enabled, actor.id],
    );

    if (enabled) {
      await client.query(
        `insert into subscriptions (email, event_id, confirmed_at, added_by)
         values ($1, null, now(), $2)
         on conflict (email, event_id) do update set confirmed_at = now()`,
        [actor.email, actor.id],
      );
    } else {
      await client.query(
        "delete from subscriptions where lower(email) = lower($1) and event_id is null",
        [actor.email],
      );
    }
  });

  return { emailUpdates: enabled };
}
