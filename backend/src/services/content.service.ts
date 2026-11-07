import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { HttpError } from "../lib/http.js";
import type { AuthUser } from "../types.js";

export interface ResourceConfig {
  table: string;
  key: "id" | "repo_name";
  order: string;
  fields: readonly string[];
}

export const RESOURCES = {
  events: {
    table: "events",
    key: "id",
    order: "sort_order asc, starts_at asc",
    fields: [
      "title", "group_name", "details", "starts_at", "duration_minutes",
      "stage", "link", "link_text", "sort_order",
    ],
  },
  "class-sessions": {
    table: "class_sessions",
    key: "id",
    order: "sort_order asc, weekday asc",
    fields: [
      "title", "group_name", "weekday", "start_time", "duration_minutes",
      "timezone", "link", "is_active", "sort_order",
    ],
  },
  resources: {
    table: "resources",
    key: "id",
    order: "sort_order asc",
    fields: [
      "title", "kind", "url", "summary", "group_name", "sort_order",
      "is_published",
    ],
  },
  "study-groups": {
    table: "study_groups",
    key: "id",
    order: "sort_order asc",
    fields: [
      "name", "topic", "status", "link", "link_text", "sort_order",
      "is_published",
    ],
  },
  "social-links": {
    table: "social_links",
    key: "id",
    order: "sort_order asc",
    fields: ["platform", "label", "url", "hint", "sort_order", "is_published"],
  },
  "core-members": {
    table: "core_members",
    key: "id",
    order: "sort_order asc",
    fields: [
      "name", "role", "title", "status", "group_name", "focus", "bio",
      "github_username", "photo_url", "photo_thumb_url", "linkedin_url",
      "instagram_url", "x_url", "website_url", "email", "discord_handle",
      "joined_on", "ended_on", "sort_order", "is_published",
    ],
  },
  "blog-posts": {
    table: "blog_posts",
    key: "id",
    order: "created_at desc",
    fields: [
      "title", "slug", "excerpt", "body", "cover_url", "cover_credit",
      "author_name", "authors", "status", "published_at", "icon",
      "cover_position", "font", "small_text", "full_width", "locked",
      "source_url",
    ],
  },
} as const satisfies Record<string, ResourceConfig>;

type ResourceName = keyof typeof RESOURCES;

const JSON_FIELDS = new Set(["authors", "cover_credit"]);
const RESTORABLE = new Set([
  "events", "class_sessions", "resources", "study_groups",
  "social_links", "core_members", "repo_kinds", "blog_posts",
]);

function getResource(name: string): (typeof RESOURCES)[ResourceName] {
  const resource = RESOURCES[name as ResourceName];
  if (!resource) throw new HttpError(404, "That kind of row does not exist.");
  return resource;
}

function serialize(field: string, value: unknown) {
  if (JSON_FIELDS.has(field) && value !== null && value !== undefined) {
    return JSON.stringify(value);
  }
  return value;
}

function pickFields(resource: ResourceConfig, body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  return resource.fields.filter((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
}

/* ---- public content ---------------------------------------------------- */

export async function listEvents() {
  const result = await pool.query(
    "select * from events where stage <> 'draft' order by starts_at asc",
  );
  return result.rows;
}

export async function listClassSessions() {
  const result = await pool.query(
    "select * from class_sessions where is_active order by sort_order asc, weekday asc",
  );
  return result.rows;
}

export async function listResources() {
  const result = await pool.query(
    "select * from resources where is_published order by sort_order asc",
  );
  return result.rows;
}

export async function listStudyGroups() {
  const result = await pool.query(
    "select * from study_groups where is_published order by sort_order asc",
  );
  return result.rows;
}

export async function listSocialLinks() {
  const result = await pool.query(
    "select * from social_links where is_published order by sort_order asc",
  );
  return result.rows;
}

export async function listCoreMembers() {
  const result = await pool.query(
    "select * from core_members where is_published order by sort_order asc",
  );
  return result.rows;
}

export async function listRepoKinds() {
  const result = await pool.query("select * from repo_kinds order by repo_name");
  return result.rows;
}

export async function listPublicMembers() {
  const result = await pool.query(
    `select id, display_name, bio, website_url, github_username, avatar_url,
            created_at
       from profiles
      where role = 'member'
        and email_verified_at is not null
        and directory_opted_in
      order by lower(coalesce(display_name, email)) asc, created_at asc
      limit 200`,
  );
  return result.rows;
}

/* ---- admin activity and restore ---------------------------------------- */

export async function listActivity(limit: number) {
  const result = await pool.query(
    `select id, at, actor_email, action, table_name, row_id, row_label, changed
       from activity_log
      order by at desc
      limit $1`,
    [limit],
  );
  return result.rows;
}

export async function listRowActivity(
  table: string,
  rowId: string,
  limit: number,
) {
  const result = await pool.query(
    `select at, actor_id, actor_email, action, changed
       from activity_log
      where table_name = $1 and row_id = $2
      order by at desc
      limit $3`,
    [table, rowId, limit],
  );
  return result.rows;
}

export async function restoreRow(
  actor: Pick<AuthUser, "id" | "email">,
  table: string,
  rowId: string,
) {
  if (!RESTORABLE.has(table)) {
    throw new HttpError(400, "That kind of row cannot be restored.");
  }

  return withActor(actor, async (client) => {
    const snapshotResult = await client.query<{
      snapshot: Record<string, unknown> | null;
    }>(
      `select snapshot
         from activity_log
        where table_name = $1 and row_id = $2 and action = 'delete'
        order by at desc
        limit 1`,
      [table, rowId],
    );

    const snapshot = snapshotResult.rows[0]?.snapshot;
    if (!snapshot) {
      throw new HttpError(404, "There is no deleted copy of that row to restore.");
    }

    const columns = Object.keys(snapshot);
    const values = Object.values(snapshot);
    const placeholders = columns.map((_, index) => `$${index + 1}`);

    const restored = await client.query(
      `insert into ${table} (${columns.join(", ")})
       values (${placeholders.join(", ")})
       returning *`,
      values,
    );

    return restored.rows[0];
  });
}

export async function setMemberCard(
  actor: Pick<AuthUser, "id" | "email">,
  memberId: unknown,
) {
  if (memberId !== null && typeof memberId !== "string") {
    throw new HttpError(400, "memberId must be a UUID or null.");
  }

  return withActor(actor, async (client) => {
    const result = await client.query(
      `update profiles
          set core_member_id = $1
        where id = $2
        returning id, email, display_name, role, can_view_analytics,
                  core_member_id, must_reset`,
      [memberId, actor.id],
    );
    return result.rows[0];
  });
}

/* ---- admin repo curation ----------------------------------------------- */

export async function upsertRepoKind(
  actor: Pick<AuthUser, "id" | "email">,
  repoName: string,
  body: Record<string, unknown>,
) {
  const allowed = ["kind", "note", "pinned", "sort_order", "group_id"] as const;
  const fields = allowed.filter((field) =>
    Object.prototype.hasOwnProperty.call(body || {}, field),
  );

  if (!fields.length) {
    throw new HttpError(400, "Send at least one field to update.");
  }

  const values = fields.map((field) => body[field]);
  const placeholders = fields.map((_, index) => `$${index + 1}`);
  values.push(repoName);

  return withActor(actor, async (client) => {
    const result = await client.query(
      `insert into repo_kinds (repo_name, ${fields.join(", ")})
       values ($${values.length}, ${placeholders.join(", ")})
       on conflict (repo_name) do update
         set ${fields.map((field) => `${field} = excluded.${field}`).join(", ")}
       returning *`,
      values,
    );
    return result.rows[0];
  });
}

export async function deleteRepoKind(
  actor: Pick<AuthUser, "id" | "email">,
  repoName: string,
) {
  const row = await withActor(actor, async (client) => {
    const result = await client.query(
      "delete from repo_kinds where repo_name = $1 returning *",
      [repoName],
    );
    return result.rows[0];
  });

  if (!row) throw new HttpError(404, "That repository is not curated.");
}

/* ---- admin generic content CRUD ---------------------------------------- */

export async function listResourceRows(name: string) {
  const resource = getResource(name);
  const result = await pool.query(
    `select * from ${resource.table} order by ${resource.order}`,
  );
  return result.rows;
}

export async function createResourceRow(
  actor: Pick<AuthUser, "id" | "email">,
  name: string,
  body: Record<string, unknown>,
) {
  const resource = getResource(name);
  const fields = pickFields(resource, body);

  if (!fields.length) {
    throw new HttpError(400, "Send at least one field.");
  }

  const values = fields.map((field) => serialize(field, body[field]));
  const placeholders = fields.map((_, index) => `$${index + 1}`);

  return withActor(actor, async (client) => {
    const result = await client.query(
      `insert into ${resource.table} (${fields.join(", ")})
       values (${placeholders.join(", ")})
       returning *`,
      values,
    );
    return result.rows[0];
  });
}

export async function updateResourceRow(
  actor: Pick<AuthUser, "id" | "email">,
  name: string,
  id: string,
  body: Record<string, unknown>,
) {
  const resource = getResource(name);
  const fields = pickFields(resource, body);

  if (!fields.length) {
    throw new HttpError(400, "Send at least one field to update.");
  }

  const values = fields.map((field) => serialize(field, body[field]));
  values.push(id);

  const row = await withActor(actor, async (client) => {
    const result = await client.query(
      `update ${resource.table}
          set ${fields.map((field, index) => `${field} = $${index + 1}`).join(", ")}
        where ${resource.key} = $${values.length}
        returning *`,
      values,
    );
    return result.rows[0];
  });

  if (!row) throw new HttpError(404, "That row does not exist.");
  return row;
}

export async function deleteResourceRow(
  actor: Pick<AuthUser, "id" | "email">,
  name: string,
  id: string,
) {
  const resource = getResource(name);

  const row = await withActor(actor, async (client) => {
    const result = await client.query(
      `delete from ${resource.table}
        where ${resource.key} = $1
        returning *`,
      [id],
    );
    return result.rows[0];
  });

  if (!row) throw new HttpError(404, "That row does not exist.");
}
