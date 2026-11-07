import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { HttpError } from "../lib/http.js";
import type { AuthUser } from "../types.js";

export async function listPublishedPosts() {
  const result = await pool.query(
    `select * from blog_posts
      where status = 'published'
      order by published_at desc nulls last, created_at desc`,
  );
  return result.rows;
}

export async function getPublishedPost(slug: string) {
  const result = await pool.query(
    `select * from blog_posts
      where slug = $1 and status = 'published'
      limit 1`,
    [slug],
  );

  const post = result.rows[0];
  if (!post) throw new HttpError(404, "That post does not exist.");
  return post;
}

export async function getDraft(postId: string) {
  const result = await pool.query(
    `select content, updated_at
       from blog_drafts
      where post_id = $1
      limit 1`,
    [postId],
  );
  return result.rows[0] || null;
}

export async function saveDraft(
  actor: Pick<AuthUser, "id" | "email">,
  postId: string,
  content: unknown,
) {
  if (content === undefined) {
    throw new HttpError(400, "Send the draft content.");
  }

  return withActor(actor, async (client) => {
    const result = await client.query(
      `insert into blog_drafts (post_id, content, updated_at, updated_by)
       values ($1, $2::jsonb, now(), $3)
       on conflict (post_id) do update
         set content = excluded.content,
             updated_at = now(),
             updated_by = excluded.updated_by
       returning content, updated_at`,
      [postId, JSON.stringify(content), actor.id],
    );
    return result.rows[0];
  });
}

export async function deleteDraft(postId: string) {
  await pool.query("delete from blog_drafts where post_id = $1", [postId]);
}

export async function listVersions(postId: string, limit: number) {
  const result = await pool.query(
    `select id, content, kind, created_at, created_by
       from blog_versions
      where post_id = $1
      order by created_at desc
      limit $2`,
    [postId, limit],
  );
  return result.rows;
}

export async function createVersion(
  actor: Pick<AuthUser, "id" | "email">,
  postId: string,
  content: unknown,
  kind: "edit" | "publish",
) {
  return withActor(actor, async (client) => {
    const result = await client.query(
      `insert into blog_versions (post_id, content, kind, created_by)
       values ($1, $2::jsonb, $3, $4)
       returning id, created_at`,
      [postId, JSON.stringify(content), kind, actor.id],
    );
    return result.rows[0];
  });
}

export async function listAuthors() {
  const result = await pool.query(
    `select p.id,
            coalesce(nullif(trim(p.display_name), ''), m.name, split_part(p.email, '@', 1)) as name,
            coalesce(
              m.photo_url,
              case when m.github_username is not null
                   then 'https://github.com/' || m.github_username || '.png?size=96' end
            ) as avatar,
            coalesce(
              case when m.github_username is not null
                   then 'https://github.com/' || m.github_username end,
              m.website_url,
              m.linkedin_url
            ) as url,
            p.role,
            m.id as member_id,
            p.core_member_id is not null as linked
       from profiles p
       left join lateral (
         select *
           from core_members c
          where c.id = p.core_member_id
             or (p.core_member_id is null
                 and c.email is not null
                 and lower(c.email) = lower(p.email))
          order by c.id = p.core_member_id desc nulls last,
                   c.status = 'active' desc
          limit 1
       ) m on true
      where p.role in ('admin', 'editor')
      order by 2`,
  );
  return result.rows;
}
