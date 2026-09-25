/**
 * Discover impressions — admin read (board #621, ledger `2026-09-24-discover-impressions-admin`).
 *
 * `content_impressions` has had a writer since migration 116 (`POST /api/tracking/impression`,
 * one row per card per browser session scrolled ≥50% into view) and NO reader. This module is
 * that reader, plus the one piece that makes click-through measurable at all: resolving a
 * card click to the impression it came from.
 *
 * §13, and it is the load-bearing half of this file:
 *  - Until this lane, `POST /api/affiliates/track` DROPPED the `contentType`/`contentId`/
 *    `impressionId` every Discover card sends, so no click before it is linked to a card and
 *    NONE IS BACKFILLED — a click with no recorded card cannot be given one.
 *  - Click-through is therefore counted only over impressions shown from the earliest
 *    impression a click was linked to (`linkingSince`), and is `null` — never 0% — while no
 *    click is linked yet.
 *  - A client-sent impression id is taken only when that impression exists AND names the same
 *    card the click names (`resolveClickImpression`); a stale or foreign id links nothing.
 *  - A card id is shown as the card type plus its id. Discover mixes several sources (some are
 *    external event feeds with no row of ours), so no display name is guessed.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const DISCOVER_IMPRESSION_WINDOWS = ["7", "30", "90", "all"] as const;
export type DiscoverImpressionWindow = (typeof DISCOVER_IMPRESSION_WINDOWS)[number];

/** Bounds match the `content_impressions` column widths (varchar 50 / 255). */
export const CLICK_CONTENT_TYPE_MAX = 50;
export const CLICK_CONTENT_ID_MAX = 255;
const IMPRESSION_ID_MAX = 64;

const CARD_LIMIT = 200;

/**
 * When click-through became countable: the earliest IMPRESSION that a click was linked to.
 * Not the earliest linked click's own time — every click comes after the impression it came
 * from, so a click-time start would exclude the very impression that was clicked. Impressions
 * shown after deploy but before this one are left out of the denominator; that under-counts
 * the denominator slightly, and the page says click-through starts on this date.
 */
const LINKING_START = sql`
  SELECT min(li.created_at)
    FROM content_impressions li
    JOIN affiliate_clicks lc ON lc.source_impression_id::text = li.id::text`;

export interface ClickAttributionInput {
  contentType?: unknown;
  contentId?: unknown;
  impressionId?: unknown;
}

export interface ClickAttribution {
  clickContentType: string | null;
  clickContentId: string | null;
  sourceImpressionId: string | null;
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * The card a click names, and the impression it came from — the impression only when the row
 * exists and is for that same card. Analytics-only: never throws, and an absent answer is NULL.
 */
export async function resolveClickAttribution(input: ClickAttributionInput): Promise<ClickAttribution> {
  const clickContentType = boundedString(input.contentType, CLICK_CONTENT_TYPE_MAX);
  const clickContentId = boundedString(input.contentId, CLICK_CONTENT_ID_MAX);
  const impressionId = boundedString(input.impressionId, IMPRESSION_ID_MAX);
  if (!clickContentType || !clickContentId) {
    // A click that names no card cannot be linked to one.
    return { clickContentType: null, clickContentId: null, sourceImpressionId: null };
  }
  let sourceImpressionId: string | null = null;
  if (impressionId) {
    try {
      const rows = await db.execute(sql`
        SELECT id FROM content_impressions
         WHERE id::text = ${impressionId}
           AND content_type = ${clickContentType}
           AND content_id = ${clickContentId}
         LIMIT 1`);
      const row = (rows as any).rows?.[0] ?? (Array.isArray(rows) ? (rows as any)[0] : undefined);
      sourceImpressionId = row?.id ?? null;
    } catch {
      sourceImpressionId = null;
    }
  }
  return { clickContentType, clickContentId, sourceImpressionId };
}

export interface DiscoverImpressionCard {
  contentType: string;
  contentId: string;
  city: string | null;
  impressions: number;
  sessions: number;
  /** Average feed slot (1-indexed); null when no impression recorded a position. */
  averagePosition: number | null;
  firstSeen: string;
  lastSeen: string;
  /** Impressions shown since `linkingSince` — the only ones click-through is counted over. */
  impressionsSinceLinking: number;
  /** Of those, how many led to at least one linked click. */
  impressionsClicked: number;
  /** impressionsClicked / impressionsSinceLinking; null when nothing is countable. */
  clickThroughRate: number | null;
}

export interface DiscoverImpressionGroup {
  key: string | null;
  impressions: number;
  sessions: number;
  cards: number;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

export interface DiscoverImpressionsReport {
  window: DiscoverImpressionWindow;
  city: string | null;
  /** Earliest impression on record (any city, any window); null = none recorded ever. */
  impressionsRecordedSince: string | null;
  /** Earliest impression a click was linked to; null = click-through is not countable yet. */
  linkingSince: string | null;
  totals: DiscoverImpressionGroup;
  byCity: DiscoverImpressionGroup[];
  byType: DiscoverImpressionGroup[];
  cards: DiscoverImpressionCard[];
  cardLimit: number;
  cities: string[];
}

function rowsOf(result: unknown): any[] {
  const r = result as any;
  if (Array.isArray(r)) return r;
  return r?.rows ?? [];
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Pure: a rate is only a claim when there is something to divide by. */
export function clickThroughRate(clicked: number, countable: number): number | null {
  if (!Number.isFinite(countable) || countable <= 0) return null;
  return Math.round((clicked / countable) * 1000) / 10; // percent, one decimal
}

function group(row: any, key: string | null): DiscoverImpressionGroup {
  const impressionsSinceLinking = Number(row.impressions_since_linking ?? 0);
  const impressionsClicked = Number(row.impressions_clicked ?? 0);
  return {
    key,
    impressions: Number(row.impressions ?? 0),
    sessions: Number(row.sessions ?? 0),
    cards: Number(row.cards ?? 0),
    impressionsSinceLinking,
    impressionsClicked,
    clickThroughRate: clickThroughRate(impressionsClicked, impressionsSinceLinking),
  };
}

function windowFilterFor(window: DiscoverImpressionWindow) {
  return window === "all"
    ? sql`TRUE`
    : sql`ci.created_at >= NOW() - (${Number(window)} * INTERVAL '1 day')`;
}

/**
 * One row per impression passing `filter`, carrying whether it led to a linked click — aggregated
 * once by each caller so a card clicked twice is still ONE clicked impression and never inflates
 * the impression count. ONE derivation for the admin and the earner views (§18 rule 1).
 *
 * `countable` is compared in SQL against the same LINKING_START, never round-tripped through a JS
 * Date. No linked click yet ⇒ the comparison is NULL ⇒ nothing is countable: every "since
 * linking" figure stays 0 and every rate null, rather than dividing by impressions no click could
 * have been linked to.
 */
function impressionBase(filter: ReturnType<typeof sql>) {
  return sql`
    WITH linked AS (
      SELECT DISTINCT source_impression_id::text AS impression_id
        FROM affiliate_clicks
       WHERE source_impression_id IS NOT NULL
    ),
    imp AS (
      SELECT ci.id, ci.content_type, ci.content_id, ci.city, ci.card_position,
             ci.session_id, ci.created_at,
             COALESCE(ci.created_at >= (${LINKING_START}), FALSE) AS countable,
             (l.impression_id IS NOT NULL) AS clicked
        FROM content_impressions ci
        LEFT JOIN linked l ON l.impression_id = ci.id::text
       WHERE ${filter}
    )`;
}

const IMPRESSION_AGGREGATES = sql`
    count(*)::int AS impressions,
    count(DISTINCT session_id)::int AS sessions,
    count(DISTINCT (content_type, content_id))::int AS cards,
    count(*) FILTER (WHERE countable)::int AS impressions_since_linking,
    count(*) FILTER (WHERE countable AND clicked)::int AS impressions_clicked`;

export async function loadDiscoverImpressions(opts: {
  window: DiscoverImpressionWindow;
  city: string | null;
}): Promise<DiscoverImpressionsReport> {
  const [boundsRes, citiesRes] = await Promise.all([
    db.execute(sql`
      SELECT (SELECT min(created_at) FROM content_impressions) AS impressions_since,
             (${LINKING_START}) AS linking_since`),
    db.execute(sql`
      SELECT DISTINCT city FROM content_impressions
       WHERE city IS NOT NULL AND city <> '' ORDER BY city LIMIT 500`),
  ]);
  const bounds = rowsOf(boundsRes)[0] ?? {};
  const impressionsRecordedSince = toIso(bounds.impressions_since);
  const linkingSince = toIso(bounds.linking_since);

  const base = impressionBase(sql`${windowFilterFor(opts.window)} AND ${
    opts.city ? sql`ci.city = ${opts.city}` : sql`TRUE`
  }`);
  const aggregates = IMPRESSION_AGGREGATES;

  const [totalsRes, byCityRes, byTypeRes, cardsRes] = await Promise.all([
    db.execute(sql`${base} SELECT ${aggregates} FROM imp`),
    db.execute(sql`${base} SELECT city AS key, ${aggregates} FROM imp
                    GROUP BY city ORDER BY impressions DESC LIMIT 100`),
    db.execute(sql`${base} SELECT content_type AS key, ${aggregates} FROM imp
                    GROUP BY content_type ORDER BY impressions DESC`),
    db.execute(sql`${base}
      SELECT content_type, content_id, city,
             count(*)::int AS impressions,
             count(DISTINCT session_id)::int AS sessions,
             round(avg(card_position)::numeric, 1) AS average_position,
             min(created_at) AS first_seen,
             max(created_at) AS last_seen,
             count(*) FILTER (WHERE countable)::int AS impressions_since_linking,
             count(*) FILTER (WHERE countable AND clicked)::int AS impressions_clicked
        FROM imp
       GROUP BY content_type, content_id, city
       ORDER BY impressions DESC, content_type, content_id
       LIMIT ${CARD_LIMIT}`),
  ]);

  const cards: DiscoverImpressionCard[] = rowsOf(cardsRes).map((r) => {
    const impressionsSinceLinking = Number(r.impressions_since_linking ?? 0);
    const impressionsClicked = Number(r.impressions_clicked ?? 0);
    return {
      contentType: String(r.content_type),
      contentId: String(r.content_id),
      city: r.city ?? null,
      impressions: Number(r.impressions ?? 0),
      sessions: Number(r.sessions ?? 0),
      averagePosition: r.average_position == null ? null : Number(r.average_position),
      firstSeen: toIso(r.first_seen) ?? "",
      lastSeen: toIso(r.last_seen) ?? "",
      impressionsSinceLinking,
      impressionsClicked,
      clickThroughRate: clickThroughRate(impressionsClicked, impressionsSinceLinking),
    };
  });

  return {
    window: opts.window,
    city: opts.city,
    impressionsRecordedSince,
    linkingSince,
    totals: group(rowsOf(totalsRes)[0] ?? {}, null),
    byCity: rowsOf(byCityRes).map((r) => group(r, r.key ?? null)),
    byType: rowsOf(byTypeRes).map((r) => group(r, r.key ?? null)),
    cards,
    cardLimit: CARD_LIMIT,
    cities: rowsOf(citiesRes).map((r) => String(r.city)),
  };
}

// ─── Earner view (board #621, second half; ledger `2026-09-25-discover-impressions-earner`) ─────
//
// An earner sees Discover impressions of THEIR OWN LISTINGS only — the decision-maker ruled
// "listings only" (Sep 25, 2026), so curated gems are not counted as theirs. A listing reaches
// Discover as a `vendor-service` card whose id is the `provider_services.id` (location-view
// service → `CityFeedCardVendorService`), so ownership is `provider_services.user_id` = the
// SESSION user (§14 applied to a read — never a query value). Nothing else on the page is theirs
// to see: no other listing, no other card type, no session or viewer detail beyond counts.

export const EARNER_LISTING_CARD_TYPE = "vendor-service";

export interface EarnerListingImpressions {
  serviceId: string;
  serviceName: string;
  impressions: number;
  sessions: number;
  averagePosition: number | null;
  lastSeen: string;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

export interface EarnerDiscoverImpressionsReport {
  window: DiscoverImpressionWindow;
  linkingSince: string | null;
  totals: DiscoverImpressionGroup;
  byCity: DiscoverImpressionGroup[];
  listings: EarnerListingImpressions[];
}

export async function loadEarnerDiscoverImpressions(opts: {
  userId: string;
  window: DiscoverImpressionWindow;
}): Promise<EarnerDiscoverImpressionsReport> {
  if (!opts.userId) throw new Error("loadEarnerDiscoverImpressions requires the session user");
  const boundsRes = await db.execute(sql`SELECT (${LINKING_START}) AS linking_since`);
  const linkingSince = toIso(rowsOf(boundsRes)[0]?.linking_since);

  const base = impressionBase(sql`${windowFilterFor(opts.window)}
    AND ci.content_type = ${EARNER_LISTING_CARD_TYPE}
    AND ci.content_id IN (SELECT ps.id::text FROM provider_services ps WHERE ps.user_id = ${opts.userId})`);

  const [totalsRes, byCityRes, listingsRes] = await Promise.all([
    db.execute(sql`${base} SELECT ${IMPRESSION_AGGREGATES} FROM imp`),
    db.execute(sql`${base} SELECT city AS key, ${IMPRESSION_AGGREGATES} FROM imp
                    GROUP BY city ORDER BY impressions DESC LIMIT 50`),
    db.execute(sql`${base}
      SELECT imp.content_id, ps.service_name,
             count(*)::int AS impressions,
             count(DISTINCT imp.session_id)::int AS sessions,
             round(avg(imp.card_position)::numeric, 1) AS average_position,
             max(imp.created_at) AS last_seen,
             count(*) FILTER (WHERE imp.countable)::int AS impressions_since_linking,
             count(*) FILTER (WHERE imp.countable AND imp.clicked)::int AS impressions_clicked
        FROM imp
        JOIN provider_services ps ON ps.id::text = imp.content_id AND ps.user_id = ${opts.userId}
       GROUP BY imp.content_id, ps.service_name
       ORDER BY impressions DESC, ps.service_name`),
  ]);

  return {
    window: opts.window,
    linkingSince,
    totals: group(rowsOf(totalsRes)[0] ?? {}, null),
    byCity: rowsOf(byCityRes).map((r) => group(r, r.key ?? null)),
    listings: rowsOf(listingsRes).map((r) => {
      const impressionsSinceLinking = Number(r.impressions_since_linking ?? 0);
      const impressionsClicked = Number(r.impressions_clicked ?? 0);
      return {
        serviceId: String(r.content_id),
        serviceName: String(r.service_name ?? ""),
        impressions: Number(r.impressions ?? 0),
        sessions: Number(r.sessions ?? 0),
        averagePosition: r.average_position == null ? null : Number(r.average_position),
        lastSeen: toIso(r.last_seen) ?? "",
        impressionsSinceLinking,
        impressionsClicked,
        clickThroughRate: clickThroughRate(impressionsClicked, impressionsSinceLinking),
      };
    }),
  };
}
