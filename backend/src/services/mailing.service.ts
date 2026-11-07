import { config } from "../config.js";
import { pool } from "../db/index.js";
import { withActor } from "../db/tx.js";
import { isMailConfigured, sendMail } from "../email/mailer.js";
import {
  eventUpdateEmail,
  listName,
  subscriptionConfirmEmail,
  testEmail,
  type MailEvent,
} from "../email/templates.js";
import { HttpError } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import type { AuthUser } from "../types.js";

export interface SubscribeInput {
  action: "subscribe";
  email: string;
  event_id?: string | null;
  company?: string;
}

export interface SendInput {
  event_id?: string | null;
  subject: string;
  body: string;
  test?: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESEND_AFTER_MS = 10 * 60 * 1000;
const SIGNUPS_PER_HOUR = 100;
const SITE = config.PUBLIC_SITE_URL.replace(/\/$/, "");

type SubscriptionRow = {
  id: string;
  email: string;
  confirmed_at: string | null;
  event_id: string | null;
  eid: string | null;
  title: string | null;
  starts_at: string | null;
  link: string | null;
  group_name: string | null;
};

async function findEvent(
  id: string | null | undefined,
  includeDrafts: boolean,
): Promise<MailEvent | null> {
  if (!id) return null;
  if (!UUID_RE.test(id)) throw new HttpError(404, "That event does not exist.");

  const result = await pool.query<MailEvent>(
    includeDrafts
      ? `select id, title, starts_at, link, group_name from events where id = $1`
      : `select id, title, starts_at, link, group_name
           from events where id = $1 and stage <> 'draft'`,
    [id],
  );

  const event = result.rows[0];
  if (!event) throw new HttpError(404, "That event does not exist.");
  return event;
}

async function byToken(token: string): Promise<SubscriptionRow> {
  const result = await pool.query<SubscriptionRow>(
    `select s.id, s.email, s.confirmed_at, s.event_id,
            e.id as eid, e.title, e.starts_at, e.link, e.group_name
       from subscriptions s
       left join events e on e.id = s.event_id
      where s.token = $1
      limit 1`,
    [token],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      404,
      "This link has already been used, or the subscription was removed.",
    );
  }
  return row;
}

function eventOf(row: SubscriptionRow): MailEvent | null {
  if (!row.eid || !row.title || !row.starts_at) return null;
  return {
    id: row.eid,
    title: row.title,
    starts_at: row.starts_at,
    link: row.link,
    group_name: row.group_name,
  };
}

const mask = (email: string) =>
  email.replace(/^(.)(.*)(@.*)$/, (_, first, rest, domain) =>
    first + "•".repeat(Math.min(rest.length, 6)) + domain,
  );

const unsubscribeURL = (token: string) =>
  `${SITE}/subscribe.html?unsubscribe=${token}`;

/* ---- public subscription flow ------------------------------------------ */

export async function subscribe(input: SubscribeInput) {
  if (input.company) return { ok: true };

  const email = input.email.toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new HttpError(400, "That does not look like an email address.");
  }

  const event = await findEvent(input.event_id, false);
  const existing = await pool.query<{
    id: string;
    token: string;
    confirmed_at: string | null;
    created_at: string;
  }>(
    `select id, token, confirmed_at, created_at
       from subscriptions
      where lower(email) = lower($1)
        and event_id is not distinct from $2::uuid
      limit 1`,
    [email, event?.id ?? null],
  );

  const row = existing.rows[0];
  if (row?.confirmed_at) return { ok: true };
  if (row && Date.now() - new Date(row.created_at).getTime() < RESEND_AFTER_MS) {
    return { ok: true };
  }

  const recent = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from subscriptions
      where confirmed_at is null and created_at > now() - interval '1 hour'`,
  );
  if (Number(recent.rows[0]?.count || 0) >= SIGNUPS_PER_HOUR) {
    throw new HttpError(429, "Too many signups right now. Try again in an hour.");
  }

  let token = row?.token;
  if (row) {
    await pool.query("update subscriptions set created_at = now() where id = $1", [row.id]);
  } else {
    const inserted = await pool.query<{ token: string }>(
      `insert into subscriptions (email, event_id)
       values ($1, $2)
       returning token`,
      [email, event?.id ?? null],
    );
    token = inserted.rows[0].token;
  }

  const confirmUrl = `${SITE}/subscribe.html?confirm=${token}`;

  if (!isMailConfigured()) {
    throw new HttpError(503, "Email updates are not configured yet.");
  }

  try {
    await sendMail({
      to: email,
      ...subscriptionConfirmEmail(email, event, confirmUrl),
    });
  } catch (error) {
    if (row) {
      await pool.query("update subscriptions set created_at = $1 where id = $2", [
        row.created_at,
        row.id,
      ]);
    } else {
      await pool.query("delete from subscriptions where token = $1", [token]);
    }
    logger.error({ err: error }, "Could not send the subscription confirmation");
    throw new HttpError(
      502,
      "Could not send the confirmation email. Try again in a minute.",
    );
  }

  return { ok: true };
}

export async function lookup(token: string) {
  const row = await byToken(token);
  return {
    email: mask(row.email),
    list: listName(eventOf(row)),
    confirmed: Boolean(row.confirmed_at),
  };
}

export async function confirm(token: string) {
  const row = await byToken(token);
  if (!row.confirmed_at) {
    await pool.query("update subscriptions set confirmed_at = now() where id = $1", [row.id]);
  }
  if (row.event_id === null) {
    await pool.query(
      "update profiles set email_updates = true where lower(email) = lower($1)",
      [row.email],
    );
  }
  return { email: mask(row.email), list: listName(eventOf(row)) };
}

export async function unsubscribe(token: string, everything: boolean) {
  const row = await byToken(token);
  const event = eventOf(row);

  if (everything) {
    await pool.query("delete from subscriptions where lower(email) = lower($1)", [row.email]);
  } else {
    await pool.query("delete from subscriptions where id = $1", [row.id]);
  }

  if (everything || row.event_id === null) {
    await pool.query(
      "update profiles set email_updates = false where lower(email) = lower($1)",
      [row.email],
    );
  }

  return {
    email: mask(row.email),
    list: everything ? "every FCS list" : listName(event),
  };
}

/* ---- admin lists and sends --------------------------------------------- */

export async function listSubscriptions() {
  const result = await pool.query(
    `select id, email, event_id, confirmed_at, added_by, created_at
       from subscriptions
      order by created_at desc`,
  );
  return result.rows;
}

export async function addSubscribers(
  actor: Pick<AuthUser, "id" | "email">,
  emails: string[],
  eventId: string | null | undefined,
) {
  const event = eventId ?? null;
  if (event) await findEvent(event, true);

  const cleaned = [...new Set(
    emails
      .map((email) => email.trim().toLowerCase())
      .filter((email) => EMAIL_RE.test(email)),
  )];
  if (!cleaned.length) {
    throw new HttpError(400, "None of those look like email addresses.");
  }

  let added = 0;
  await withActor(actor, async (client) => {
    for (const email of cleaned) {
      const result = await client.query(
        `insert into subscriptions (email, event_id, confirmed_at, added_by)
         values ($1, $2, now(), $3)
         on conflict (email, event_id) do nothing
         returning id`,
        [email, event, actor.id],
      );
      added += result.rowCount ?? 0;
    }
  });

  return { added };
}

export async function removeSubscriber(id: string) {
  const result = await pool.query(
    "delete from subscriptions where id = $1 returning id",
    [id],
  );
  if (!result.rowCount) {
    throw new HttpError(404, "That subscriber does not exist.");
  }
}

export async function listEmailSends() {
  const result = await pool.query(
    `select id, title, body, event_id, sent_by_email, recipients, failed, created_at
       from email_sends
      order by created_at desc
      limit 50`,
  );
  return result.rows;
}

export async function sendEventMail(
  actor: Pick<AuthUser, "id" | "email">,
  input: SendInput,
) {
  const event = await findEvent(input.event_id, true);

  if (input.test) {
    if (!actor.email) throw new HttpError(400, "Your account has no email address.");
    const message = eventUpdateEmail(
      `[Test] ${input.subject}`,
      input.body,
      event,
      null,
    );
    await sendMail({ to: actor.email, ...message });
    return { sent: 1, failed: 0, test: true };
  }

  const result = await pool.query<{
    email: string;
    token: string;
    event_id: string | null;
  }>(
    `select email, token, event_id
       from subscriptions
      where confirmed_at is not null
        and ($1::uuid is null or event_id = $1 or event_id is null)`,
    [event?.id ?? null],
  );

  if (!result.rowCount) {
    throw new HttpError(400, "Nobody is on this list yet.");
  }

  const recipients = new Map<string, string>();
  for (const row of result.rows) {
    if (!recipients.has(row.email) || row.event_id === event?.id) {
      recipients.set(row.email, row.token);
    }
  }

  let sent = 0;
  let failed = 0;

  for (const [email, token] of recipients) {
    try {
      const message = eventUpdateEmail(
        input.subject,
        input.body,
        event,
        unsubscribeURL(token),
      );
      await sendMail({ to: email, ...message });
      sent++;
    } catch (error) {
      failed++;
      logger.error({ err: error }, "Event update send failed");
    }
  }

  await withActor(actor, async (client) => {
    await client.query(
      `insert into email_sends
         (title, body, event_id, sent_by_email, recipients, failed)
       values ($1, $2, $3, $4, $5, $6)`,
      [input.subject, input.body, event?.id ?? null, actor.email, sent, failed],
    );
  });

  return { sent, failed };
}

export async function sendTestEmail(
  actor: Pick<AuthUser, "id" | "email">,
  to?: string,
) {
  if (!isMailConfigured()) {
    throw new HttpError(503, "Email is not configured.");
  }

  const recipient = to || actor.email;
  const message = testEmail(recipient);
  const info = await sendMail({ to: recipient, ...message });

  return { ok: true, to: recipient, messageId: info.messageId };
}
