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
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  WAITLIST_CONSENT_KEY,
  WAITLIST_CONSENT_TEXT,
  WAITLIST_CONSENT_VERSION,
  WAITLIST_EXPERT_LINK_SOURCE,
  normalizeWaitlistEmail,
  normalizeWaitlistSource,
  type WaitlistJoinBody,
} from "@shared/launch-waitlist";

/** Records the current consent wording once (ON CONFLICT DO NOTHING on (consent_key, version)); returns its version. */
export async function ensureConsentText(): Promise<string> {
  await db.execute(sql`
    INSERT INTO consent_texts (id, consent_key, version, body, created_at)
    VALUES (gen_random_uuid(), ${WAITLIST_CONSENT_KEY}, ${WAITLIST_CONSENT_VERSION}, ${WAITLIST_CONSENT_TEXT}, NOW())
    ON CONFLICT (consent_key, version) DO NOTHING
  `);
  return WAITLIST_CONSENT_VERSION;
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
  const consentVersion = consent ? await ensureConsentText() : null;
  const tripType = traveler ? body.tripType ?? null : null;
  const roughMonth = traveler ? body.roughMonth ?? null : null;
  const worry = traveler && body.worry?.trim() ? body.worry.trim() : null;
  const contactName = traveler ? null : body.contactName?.trim() || null;
  const businessName = traveler ? null : body.businessName?.trim() || null;
  const serviceType = traveler ? null : body.serviceType ?? null;
  await db.execute(sql`
    INSERT INTO launch_waitlist
      (id, email, market_slug, role, source, trip_type, rough_month, worry,
       contact_name, business_name, service_type, referrer_user_id, short_link_code,
       consent_at, consent_text_version, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${email}, ${marketSlug}, ${role}, ${source}, ${tripType}, ${roughMonth}, ${worry},
       ${contactName}, ${businessName}, ${serviceType}, ${referrerUserId}, ${shortLinkCode},
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
      consent_text_version = CASE WHEN launch_waitlist.consent_at IS NULL THEN EXCLUDED.consent_text_version ELSE launch_waitlist.consent_text_version END,
      consent_at           = COALESCE(launch_waitlist.consent_at, EXCLUDED.consent_at)
  `);
}

export interface WaitlistCount { key: string; count: number }
/** One expert credited through their short link (LW-1d): the referrer's id and handle (null when unclaimed). */
export interface WaitlistReferrerCount { referrerUserId: string; handle: string | null; count: number }
export interface WaitlistCounts {
  marketSlug: string | null;
  referrers: WaitlistReferrerCount[];
  travelers: { total: number; consented: number; byTripType: WaitlistCount[]; bySource: WaitlistCount[] };
  providers: { total: number; consented: number; byServiceType: WaitlistCount[] };
}

async function grouped(column: "trip_type" | "service_type" | "source", role: "traveler" | "provider", marketSlug: string | null): Promise<WaitlistCount[]> {
  const market = marketSlug ? sql`AND market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT COALESCE(${sql.raw(column)}, 'not_answered') AS key, COUNT(*)::int AS count
    FROM launch_waitlist WHERE COALESCE(role, 'traveler') = ${role} ${market}
    GROUP BY 1 ORDER BY 2 DESC, 1
  `);
  return (r.rows as any[]).map((row) => ({ key: String(row.key), count: Number(row.count) }));
}

async function totals(role: "traveler" | "provider", marketSlug: string | null) {
  const market = marketSlug ? sql`AND market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS total, COUNT(consent_at)::int AS consented
    FROM launch_waitlist WHERE COALESCE(role, 'traveler') = ${role} ${market}
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
    WHERE w.referrer_user_id IS NOT NULL ${market}
    GROUP BY 1, 2 ORDER BY 3 DESC, 1
  `);
  return (r.rows as any[]).map((row) => ({
    referrerUserId: String(row.referrer_user_id),
    handle: row.handle === null || row.handle === undefined ? null : String(row.handle),
    count: Number(row.count),
  }));
}

export async function waitlistCounts(marketSlug: string | null): Promise<WaitlistCounts> {
  return {
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
] as const;
export type WaitlistExportRow = Record<(typeof WAITLIST_CSV_COLUMNS)[number], string | null>;

export async function waitlistExportRows(marketSlug: string | null, role: "traveler" | "provider" | null): Promise<WaitlistExportRow[]> {
  const market = marketSlug ? sql`AND w.market_slug = ${marketSlug}` : sql``;
  const byRole = role ? sql`AND COALESCE(w.role, 'traveler') = ${role}` : sql``;
  const r = await db.execute(sql`
    SELECT w.email, w.role, w.market_slug, w.source, w.trip_type, w.rough_month, w.worry,
           w.contact_name, w.business_name, w.service_type, w.website, w.area,
           array_to_string(w.languages, '; ') AS languages,
           w.referrer_user_id, u.handle AS referrer_handle, w.short_link_code,
           to_char(w.consent_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS consent_at,
           w.consent_text_version,
           to_char(w.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           to_char(w.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
           to_char(w.unsubscribed_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS unsubscribed_at
    FROM launch_waitlist w
    LEFT JOIN users u ON u.id = w.referrer_user_id
    WHERE TRUE ${market} ${byRole}
    ORDER BY w.created_at ASC NULLS LAST, w.email ASC
  `);
  return r.rows as unknown as WaitlistExportRow[];
}
