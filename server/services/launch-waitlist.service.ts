// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the ONE writer of `launch_waitlist` and the admin reads.
// Raw SQL against migration 381's tables (`launch_waitlist`, `consent_texts`).
//
//   - One row per (email, market): a repeat sign-up UPDATES the row through the UNIQUE (email, market_slug) index
//     in one statement — never a second row, never a check-then-insert (§15).
//   - The FIRST sign-up's source is kept: a later visit through a different door does not rewrite where the person
//     came from. The latest submission's role and answers replace the earlier ones ("a repeat sign-up updates the
//     answers"), and the other role's fields are set NULL, so a row only ever carries its own role's answers.
//   - Consent is an opt-in, not a gate (Launch ruling 1): ticking stamps consent_at and names the consent version;
//     a repeat sign-up without the tick never clears an earlier consent (withdrawal is its own action, not built).
//   - The caller learns nothing about whether the address was already on the list.
import crypto from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { accessAuditLogs } from "@shared/schema";
import {
  WAITLIST_QA_EMAIL_DOMAIN,
  WAITLIST_SEARCH_LIMIT,
  WAITLIST_CONSENT_KEY,
  WAITLIST_EXPERT_LINK_SOURCE,
  WAITLIST_MARKET_OPTIONS,
  waitlistConsentText,
  waitlistConsentVersion,
  normalizeWaitlistEmail,
  normalizeWaitlistSource,
  type WaitlistJoinBody,
} from "@shared/launch-waitlist";

/**
 * Records the market's consent wording once (ON CONFLICT DO NOTHING on (consent_key, version)); returns its version.
 * LW-2: one row per market, version `f1-2026-10-15:<market>`, body the exact text shown beside that city's tick.
 */
export async function ensureConsentText(marketSlug: string): Promise<string> {
  const version = waitlistConsentVersion(marketSlug);
  await db.execute(sql`
    INSERT INTO consent_texts (id, consent_key, version, body, created_at)
    VALUES (gen_random_uuid(), ${WAITLIST_CONSENT_KEY}, ${version}, ${waitlistConsentText(marketSlug)}, NOW())
    ON CONFLICT (consent_key, version) DO NOTHING
  `);
  return version;
}

/** A credit the server resolved from a short link (`resolveWaitlistReferral`), never from a request body. */
export interface WaitlistCredit {
  referrerUserId: string;
  shortLinkCode: string;
}

/**
 * `credit` (LW-1d) stamps `referrer_user_id`, `short_link_code` and `source = expert_link` on a NEW row. Like the
 * first source, the first credit is kept: a repeat sign-up never writes the credit columns.
 */
export async function joinWaitlist(
  body: Omit<WaitlistJoinBody, "homepage" | "ref">,
  marketSlug: string,
  credit: WaitlistCredit | null = null,
): Promise<void> {
  const email = normalizeWaitlistEmail(body.email);
  const role = body.role ?? "traveler";
  const traveler = role === "traveler";
  const source = credit ? WAITLIST_EXPERT_LINK_SOURCE : normalizeWaitlistSource(body.source, marketSlug);
  const referrerUserId = credit?.referrerUserId ?? null;
  const shortLinkCode = credit?.shortLinkCode ?? null;
  const consent = body.consent === true;
  const consentVersion = consent ? await ensureConsentText(marketSlug) : null;
  const tripType = traveler ? body.tripType ?? null : null;
  const roughMonth = traveler ? body.roughMonth ?? null : null;
  const worry = traveler && body.worry?.trim() ? body.worry.trim() : null;
  const contactName = traveler ? null : body.contactName?.trim() || null;
  const businessName = traveler ? null : body.businessName?.trim() || null;
  const serviceType = traveler ? null : body.serviceType ?? null;
  // LC-1b: the optional "somewhere else" note. `area` is the existing varchar(120); NULL = not answered.
  const area = body.otherCity?.trim() ? body.otherCity.trim() : null;
  await db.execute(sql`
    INSERT INTO launch_waitlist
      (id, email, market_slug, role, source, trip_type, rough_month, worry,
       contact_name, business_name, service_type, area, referrer_user_id, short_link_code,
       consent_at, consent_text_version, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${email}, ${marketSlug}, ${role}, ${source}, ${tripType}, ${roughMonth}, ${worry},
       ${contactName}, ${businessName}, ${serviceType}, ${area}, ${referrerUserId}, ${shortLinkCode},
       CASE WHEN ${consent} THEN NOW() ELSE NULL END, ${consentVersion}, NOW(), NOW())
    ON CONFLICT (email, market_slug) DO UPDATE SET
      updated_at           = NOW(),
      role                 = EXCLUDED.role,
      trip_type            = EXCLUDED.trip_type,
      rough_month          = EXCLUDED.rough_month,
      worry                = EXCLUDED.worry,
      contact_name         = EXCLUDED.contact_name,
      business_name        = EXCLUDED.business_name,
      service_type         = EXCLUDED.service_type,
      area                 = EXCLUDED.area,
      consent_text_version = CASE WHEN launch_waitlist.consent_at IS NULL THEN EXCLUDED.consent_text_version ELSE launch_waitlist.consent_text_version END,
      consent_at           = COALESCE(launch_waitlist.consent_at, EXCLUDED.consent_at)
  `);
}

/**
 * LW-1e: the SQL twin of `isWaitlistQaEmail` — a row on the QA domain. Computed from the address (no stored column
 * yet), so a QA row is flagged from its insert. Counts and the default export leave these rows out.
 */
function isQaSql(emailColumn: SQL): SQL {
  return sql`(lower(${emailColumn}) LIKE ${`%@${WAITLIST_QA_EMAIL_DOMAIN}`})`;
}
const QA = isQaSql(sql.raw("email"));
const QA_W = isQaSql(sql.raw("w.email"));

/**
 * LW-1e: export timestamps as ISO-8601 with an explicit offset. The columns are `timestamp` without a zone, written
 * by `NOW()` in the connection's own zone, so each value is read back in that zone and rendered in UTC as
 * `YYYY-MM-DDTHH:MM:SS+00:00`. NULL stays NULL (an empty cell), never a made-up date.
 */
function isoUtc(column: string): SQL {
  return sql.raw(
    `to_char((${column} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`,
  );
}

export interface WaitlistCount { key: string; count: number }
/** One expert credited through their short link (LW-1d): the referrer's id and handle (null when unclaimed). */
export interface WaitlistReferrerCount { referrerUserId: string; handle: string | null; count: number }
export interface WaitlistCounts {
  marketSlug: string | null;
  referrers: WaitlistReferrerCount[];
  travelers: { total: number; consented: number; byTripType: WaitlistCount[]; bySource: WaitlistCount[] };
  providers: { total: number; consented: number; byServiceType: WaitlistCount[] };
  /** LW-1e: QA rows (QA-domain addresses) in the market, left out of every number above. */
  qaExcluded: number;
  /** LW-2: every market's travelers and providers, QA rows left out — operating markets first, in their order. */
  byMarket: WaitlistMarketCount[];
}
export interface WaitlistMarketCount { marketSlug: string; travelers: number; providers: number }

async function grouped(column: "trip_type" | "service_type" | "source", role: "traveler" | "provider", marketSlug: string | null): Promise<WaitlistCount[]> {
  const market = marketSlug ? sql`AND market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT COALESCE(${sql.raw(column)}, 'not_answered') AS key, COUNT(*)::int AS count
    FROM launch_waitlist WHERE COALESCE(role, 'traveler') = ${role} ${market} AND NOT ${QA}
    GROUP BY 1 ORDER BY 2 DESC, 1
  `);
  return (r.rows as any[]).map((row) => ({ key: String(row.key), count: Number(row.count) }));
}

async function totals(role: "traveler" | "provider", marketSlug: string | null) {
  const market = marketSlug ? sql`AND market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS total, COUNT(consent_at)::int AS consented
    FROM launch_waitlist WHERE COALESCE(role, 'traveler') = ${role} ${market} AND NOT ${QA}
  `);
  const t = (r.rows[0] as any) ?? {};
  return { total: Number(t.total ?? 0), consented: Number(t.consented ?? 0) };
}

/** Counts by trip type and role; provider rows are counted apart and never in the traveler numbers. */
async function referrerCounts(marketSlug: string | null): Promise<WaitlistReferrerCount[]> {
  const market = marketSlug ? sql`AND w.market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT w.referrer_user_id, u.handle, COUNT(*)::int AS count
    FROM launch_waitlist w LEFT JOIN users u ON u.id = w.referrer_user_id
    WHERE w.referrer_user_id IS NOT NULL ${market} AND NOT ${QA_W}
    GROUP BY 1, 2 ORDER BY 3 DESC, 1
  `);
  return (r.rows as any[]).map((row) => ({
    referrerUserId: String(row.referrer_user_id),
    handle: row.handle === null || row.handle === undefined ? null : String(row.handle),
    count: Number(row.count),
  }));
}

async function qaCount(marketSlug: string | null): Promise<number> {
  const market = marketSlug ? sql`AND market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM launch_waitlist WHERE ${QA} ${market}`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

/** LW-2: per-market counts (QA rows left out). An operating market with no row reads 0, which is its real count. */
async function marketCounts(): Promise<WaitlistMarketCount[]> {
  const r = await db.execute(sql`
    SELECT market_slug,
           COUNT(*) FILTER (WHERE COALESCE(role, 'traveler') = 'traveler')::int AS travelers,
           COUNT(*) FILTER (WHERE role = 'provider')::int AS providers
    FROM launch_waitlist WHERE market_slug IS NOT NULL AND NOT ${QA}
    GROUP BY 1
  `);
  const found = new Map((r.rows as any[]).map((row) => [String(row.market_slug), row]));
  const out: WaitlistMarketCount[] = WAITLIST_MARKET_OPTIONS.map((m) => ({
    marketSlug: m.key,
    travelers: Number(found.get(m.key)?.travelers ?? 0),
    providers: Number(found.get(m.key)?.providers ?? 0),
  }));
  found.forEach((row, slug) => {
    if (!WAITLIST_MARKET_OPTIONS.some((m) => m.key === slug)) {
      out.push({ marketSlug: slug, travelers: Number(row.travelers), providers: Number(row.providers) });
    }
  });
  return out;
}

export async function waitlistCounts(marketSlug: string | null): Promise<WaitlistCounts> {
  return {
    byMarket: await marketCounts(),
    qaExcluded: await qaCount(marketSlug),
    marketSlug,
    referrers: await referrerCounts(marketSlug),
    travelers: {
      ...(await totals("traveler", marketSlug)),
      byTripType: await grouped("trip_type", "traveler", marketSlug),
      bySource: await grouped("source", "traveler", marketSlug),
    },
    providers: {
      ...(await totals("provider", marketSlug)),
      byServiceType: await grouped("service_type", "provider", marketSlug),
    },
  };
}

/** CSV columns, in order: the hand-off's field names, so the provider export lines up with Supply Scout's list. */
export const WAITLIST_CSV_COLUMNS = [
  "id",
  "email",
  "role",
  "market_slug",
  "source",
  "trip_type",
  "rough_month",
  "worry",
  "contact_name",
  "business_name",
  "service_type",
  "website",
  "area",
  "languages",
  "referrer_user_id",
  "referrer_handle",
  "short_link_code",
  "consent_at",
  "consent_text_version",
  "created_at",
  "updated_at",
  "unsubscribed_at",
  "is_qa",
] as const;
export type WaitlistExportRow = Record<(typeof WAITLIST_CSV_COLUMNS)[number], string | null>;

/** LW-1e: QA rows are left out unless `includeQa` is set; each row says whether it is one (`is_qa`). */
export async function waitlistExportRows(
  marketSlug: string | null,
  role: "traveler" | "provider" | null,
  options: { includeQa?: boolean } = {},
): Promise<WaitlistExportRow[]> {
  const market = marketSlug ? sql`AND w.market_slug = ${marketSlug}` : sql``;
  const byRole = role ? sql`AND COALESCE(w.role, 'traveler') = ${role}` : sql``;
  const qa = options.includeQa ? sql`` : sql`AND NOT ${QA_W}`;
  const r = await db.execute(sql`
    SELECT w.id, w.email, w.role, w.market_slug, w.source, w.trip_type, w.rough_month, w.worry,
           w.contact_name, w.business_name, w.service_type, w.website, w.area,
           array_to_string(w.languages, '; ') AS languages,
           w.referrer_user_id, u.handle AS referrer_handle, w.short_link_code,
           ${isoUtc("w.consent_at")} AS consent_at,
           w.consent_text_version,
           ${isoUtc("w.created_at")} AS created_at,
           ${isoUtc("w.updated_at")} AS updated_at,
           ${isoUtc("w.unsubscribed_at")} AS unsubscribed_at,
           CASE WHEN ${QA_W} THEN 'true' ELSE 'false' END AS is_qa
    FROM launch_waitlist w
    LEFT JOIN users u ON u.id = w.referrer_user_id
    WHERE TRUE ${market} ${byRole} ${qa}
    ORDER BY w.created_at ASC NULLS LAST, w.email ASC
  `);
  return r.rows as unknown as WaitlistExportRow[];
}

export interface WaitlistSearchRow {
  id: string;
  email: string;
  role: string;
  marketSlug: string | null;
  source: string | null;
  createdAt: string | null;
  isQa: boolean;
}

/**
 * LW-1e: admin search by email — a case-insensitive substring match across every market (an admin looking for a
 * person to remove may not know which list they joined), newest first, at most WAITLIST_SEARCH_LIMIT rows. `%`, `_`
 * and `\` in the query are matched literally.
 */
export async function searchWaitlistByEmail(query: string): Promise<WaitlistSearchRow[]> {
  const needle = query.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const r = await db.execute(sql`
    SELECT w.id, w.email, COALESCE(w.role, 'traveler') AS role, w.market_slug, w.source,
           ${isoUtc("w.created_at")} AS created_at,
           ${QA_W} AS is_qa
    FROM launch_waitlist w
    WHERE lower(w.email) LIKE ${`%${needle}%`}
    ORDER BY w.created_at DESC NULLS LAST, w.email ASC
    LIMIT ${WAITLIST_SEARCH_LIMIT}
  `);
  return (r.rows as any[]).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    role: String(row.role),
    marketSlug: row.market_slug ?? null,
    source: row.source ?? null,
    createdAt: row.created_at ?? null,
    isQa: row.is_qa === true,
  }));
}

/** sha256 hex of the normalized address — what the audit row keeps instead of the address. */
export function waitlistEmailSha256(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * LW-1e: delete ONE waitlist row (a hard delete) and write its audit row in the SAME transaction, so a row is never
 * gone without a trail and a trail never names a row that is still there. The audit row carries the row id and the
 * sha256 of the address — never the address. Returns false when no such row exists (nothing is written).
 */
export async function deleteWaitlistRow(
  id: string,
  actor: { id: string; role: string; ipAddress: string | null; userAgent: string | null },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      DELETE FROM launch_waitlist WHERE id = ${id}
      RETURNING id, email, market_slug, COALESCE(role, 'traveler') AS role
    `);
    const row = r.rows[0] as { id: string; email: string | null; market_slug: string | null; role: string } | undefined;
    if (!row) return false;
    await tx.insert(accessAuditLogs).values({
      actorId: actor.id,
      actorRole: actor.role,
      action: "waitlist_row_delete",
      resourceType: "launch_waitlist",
      resourceId: row.id,
      metadata: {
        emailSha256: row.email ? waitlistEmailSha256(row.email) : null,
        marketSlug: row.market_slug,
        role: row.role,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    return true;
  });
}
