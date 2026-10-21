// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A): the ONE writer and the reads of `ticker_items`
// (migration 384). Raw SQL, like the waitlist service.
//
//   - Every admin write (create, edit, reorder) and its audit row are ONE transaction: a change is never made
//     without a trail, and a trail never names a change that did not happen.
//   - No dead links (Part A item 4, as amended by brief ruling 2): an href is NULL or a relative internal path that
//     is a client route (the committed list, shared/client-routes.generated.ts); a `/blog/<slug>` line can be ON
//     only while that post is published. The public read re-checks both, so a post unpublished later, or a route
//     removed later, drops the line without anyone editing it.
//   - The public read is cached briefly in this process (TICKER_CACHE_MS) and cleared on every write here.
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { accessAuditLogs } from "@shared/schema";
import {
  blogSlugOf,
  hrefRefusal,
  internalPathOf,
  isClientRoutePath,
  type PublicTickerItem,
  type TickerItemCreate,
  type TickerItemPatch,
} from "@shared/ticker";
import { publicSupplyEntryHref } from "@shared/supply-entry";

export const TICKER_CACHE_MS = 30_000;
const cache = new Map<string, { at: number; items: PublicTickerItem[] }>();
export function clearTickerCache(): void {
  cache.clear();
}

/** A refusal the route answers with its status and sentence. */
export class TickerRefusal extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export interface AdminTickerItem {
  id: string;
  text: string | null;
  href: string | null;
  marketSlug: string | null;
  sortOrder: number | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** For a `/blog/<slug>` link: whether that post is published now. NULL for any other link. */
  postPublished: boolean | null;
  /** Whether the public read shows this line right now. */
  showing: boolean;
}

/** ISO-8601 in UTC with an explicit offset; the stored `timestamp` is read in the connection's own zone. */
function iso(column: string) {
  return sql.raw(
    `to_char((${column} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`,
  );
}
/** An ISO instant from the admin, stored as a `timestamp` in the connection's own zone (how NOW() is stored). */
function storedInstant(value: string | null | undefined) {
  if (value === null || value === undefined) return sql`NULL`;
  return sql`(${value}::timestamptz AT TIME ZONE current_setting('TimeZone'))`;
}

async function postPublished(slug: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`);
  return r.rows.length > 0;
}

/** Shared SQL: is this row's `/blog/<slug>` link (if any) to a published post? */
const BLOG_LINK_OK = sql.raw(`(
  t.href IS NULL
  OR split_part(split_part(t.href, '?', 1), '#', 1) NOT LIKE '/blog/%'
  OR EXISTS (
    SELECT 1 FROM blog_posts b
    WHERE b.status = 'published' AND '/blog/' || b.slug = split_part(split_part(t.href, '?', 1), '#', 1)
  )
)`);
const IN_WINDOW = sql.raw(`((t.starts_at IS NULL OR t.starts_at <= NOW()) AND (t.ends_at IS NULL OR t.ends_at > NOW()))`);

/** True when a stored href is still a live internal page (or no link at all). */
function hrefStillLive(href: string | null): boolean {
  if (href === null) return true;
  const pathPart = internalPathOf(href);
  return !!pathPart && isClientRoutePath(pathPart);
}

/** The public read: active lines inside their window, linking only to live pages, in order — text and href only. */
export async function publicTickerItems(marketSlug: string): Promise<PublicTickerItem[]> {
  const hit = cache.get(marketSlug);
  if (hit && Date.now() - hit.at < TICKER_CACHE_MS) return hit.items;
  const r = await db.execute(sql`
    SELECT t.text, t.href
    FROM ticker_items t
    WHERE t.market_slug = ${marketSlug}
      AND t.active IS TRUE
      AND t.text IS NOT NULL AND btrim(t.text) <> ''
      AND ${IN_WINDOW}
      AND ${BLOG_LINK_OK}
    ORDER BY t.sort_order ASC NULLS LAST, t.id ASC
  `);
  // The stored join line is `/signup?intent=supply` (migration 384). The public read
  // continues that door into the role chooser or the named application. The row itself
  // is unchanged, and the admin editor still shows the stored href.
  const items = (r.rows as any[])
    .map((row) => ({ text: String(row.text), href: row.href === null ? null : String(row.href) }))
    .filter((item) => hrefStillLive(item.href))
    .map((item) => ({ text: item.text, href: publicSupplyEntryHref(item.href) }));
  cache.set(marketSlug, { at: Date.now(), items });
  return items;
}

/** Every line of the market, for the admin page, with whether each is showing and why a blog link is not. */
export async function adminTickerItems(marketSlug: string): Promise<AdminTickerItem[]> {
  const r = await db.execute(sql`
    SELECT t.id, t.text, t.href, t.market_slug, t.sort_order, t.active,
           ${iso("t.starts_at")} AS starts_at, ${iso("t.ends_at")} AS ends_at,
           t.updated_by, ${iso("t.updated_at")} AS updated_at,
           ${BLOG_LINK_OK} AS blog_ok, ${IN_WINDOW} AS in_window
    FROM ticker_items t
    WHERE t.market_slug = ${marketSlug}
    ORDER BY t.sort_order ASC NULLS LAST, t.id ASC
  `);
  return (r.rows as any[]).map((row) => {
    const href = row.href === null ? null : String(row.href);
    const isBlog = blogSlugOf(href) !== null;
    const active = row.active === true;
    return {
      id: String(row.id),
      text: row.text ?? null,
      href,
      marketSlug: row.market_slug ?? null,
      sortOrder: row.sort_order === null ? null : Number(row.sort_order),
      active,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
      updatedBy: row.updated_by ?? null,
      updatedAt: row.updated_at ?? null,
      postPublished: isBlog ? row.blog_ok === true : null,
      showing: active && !!row.text && row.in_window === true && row.blog_ok === true && hrefStillLive(href),
    };
  });
}

interface Actor {
  id: string;
  role: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** The checks every save runs on the row as it WILL be: the link's shape, and a blog line only while published. */
async function assertSavable(next: { href: string | null; active: boolean; startsAt: string | null; endsAt: string | null }) {
  const refusal = hrefRefusal(next.href);
  if (refusal) throw new TickerRefusal(400, refusal);
  if (next.startsAt && next.endsAt && Date.parse(next.startsAt) >= Date.parse(next.endsAt)) {
    throw new TickerRefusal(400, "The end must be after the start.");
  }
  const slug = blogSlugOf(next.href);
  if (next.active && slug !== null && !(await postPublished(slug))) {
    throw new TickerRefusal(409, `The post /blog/${slug} is not published, so this line cannot be turned on yet.`);
  }
}

async function audit(tx: any, actor: Actor, action: string, resourceId: string, metadata: Record<string, unknown>) {
  await tx.insert(accessAuditLogs).values({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    resourceType: "ticker_item",
    resourceId,
    metadata,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

export async function createTickerItem(marketSlug: string, body: TickerItemCreate, actor: Actor): Promise<string> {
  const next = {
    text: body.text.trim(),
    href: body.href ?? null,
    active: body.active === true,
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
  };
  await assertSavable(next);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO ticker_items (id, text, href, market_slug, sort_order, active, starts_at, ends_at, updated_by, updated_at)
      SELECT ${id}, ${next.text}, ${next.href}, ${marketSlug},
             COALESCE((SELECT MAX(sort_order) FROM ticker_items WHERE market_slug = ${marketSlug}), 0) + 1,
             ${next.active}, ${storedInstant(next.startsAt)}, ${storedInstant(next.endsAt)}, ${actor.id}, NOW()
    `);
    await audit(tx, actor, "ticker_item_create", id, { marketSlug, ...next });
  });
  clearTickerCache();
  return id;
}

export async function updateTickerItem(marketSlug: string, id: string, patch: TickerItemPatch, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the row so two edits cannot both pass the checks against the same old state.
    const r = await tx.execute(sql`
      SELECT id, text, href, active, ${iso("starts_at")} AS starts_at, ${iso("ends_at")} AS ends_at
      FROM ticker_items WHERE id = ${id} AND market_slug = ${marketSlug} FOR UPDATE
    `);
    const row = r.rows[0] as any;
    if (!row) throw new TickerRefusal(404, "Not found");
    const before = {
      text: row.text ?? null,
      href: row.href ?? null,
      active: row.active === true,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
    };
    const next = {
      text: patch.text !== undefined ? patch.text.trim() : before.text,
      href: patch.href !== undefined ? patch.href : before.href,
      active: patch.active !== undefined ? patch.active : before.active,
      startsAt: patch.startsAt !== undefined ? patch.startsAt : before.startsAt,
      endsAt: patch.endsAt !== undefined ? patch.endsAt : before.endsAt,
    };
    await assertSavable(next);
    await tx.execute(sql`
      UPDATE ticker_items SET
        text       = ${next.text},
        href       = ${next.href},
        active     = ${next.active},
        starts_at  = ${patch.startsAt !== undefined ? storedInstant(next.startsAt) : sql`starts_at`},
        ends_at    = ${patch.endsAt !== undefined ? storedInstant(next.endsAt) : sql`ends_at`},
        updated_by = ${actor.id},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    const changed = Object.fromEntries(
      (Object.keys(patch) as (keyof typeof next)[]).map((k) => [k, { from: before[k], to: next[k] }]),
    );
    await audit(tx, actor, "ticker_item_update", id, { marketSlug, changed });
  });
  clearTickerCache();
}

/** Reorder: `ids` must be exactly the market's item ids, each once; sort_order becomes their position (1-based). */
export async function reorderTickerItems(marketSlug: string, ids: string[], actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const r = await tx.execute(sql`SELECT id FROM ticker_items WHERE market_slug = ${marketSlug} FOR UPDATE`);
    const current = new Set((r.rows as any[]).map((x) => String(x.id)));
    if (new Set(ids).size !== ids.length || ids.length !== current.size || ids.some((id) => !current.has(id))) {
      throw new TickerRefusal(400, "Send every line of this ticker exactly once, in the new order.");
    }
    for (let i = 0; i < ids.length; i += 1) {
      await tx.execute(sql`
        UPDATE ticker_items SET sort_order = ${i + 1}, updated_by = ${actor.id}, updated_at = NOW()
        WHERE id = ${ids[i]} AND sort_order IS DISTINCT FROM ${i + 1}
      `);
    }
    await audit(tx, actor, "ticker_item_reorder", marketSlug, { marketSlug, order: ids });
  });
  clearTickerCache();
}
