// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the ONE writer of `launch_waitlist` and the admin reads.
// Raw SQL against migration 381's tables (`launch_waitlist`, `consent_texts`).
//
//   - One row per (email, market): a repeat sign-up UPDATES the row through the UNIQUE (email, market_slug) index
//     in one statement — never a second row, never a check-then-insert (§15).
//   - The FIRST sign-up's source and source_ref are kept: a later visit through a different door does not rewrite
//     where the person came from.
//   - Consent is an opt-in, not a gate (Launch ruling 1): ticking stamps consent_at and names the consent text;
//     a repeat sign-up without the tick never clears an earlier consent (withdrawal is its own action, not built).
//   - The caller learns nothing about whether the address was already on the list.
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  WAITLIST_CONSENT_KEY,
  WAITLIST_CONSENT_TEXT,
  WAITLIST_CONSENT_VERSION,
  normalizeSourceRef,
  normalizeWaitlistEmail,
  normalizeWaitlistSource,
} from "@shared/launch-waitlist";

/** The current consent text's row id, inserting it once (ON CONFLICT DO NOTHING on (consent_key, version)). */
export async function ensureConsentTextId(): Promise<string> {
  await db.execute(sql`
    INSERT INTO consent_texts (id, consent_key, version, body, created_at)
    VALUES (gen_random_uuid(), ${WAITLIST_CONSENT_KEY}, ${WAITLIST_CONSENT_VERSION}, ${WAITLIST_CONSENT_TEXT}, NOW())
    ON CONFLICT (consent_key, version) DO NOTHING
  `);
  const r = await db.execute(sql`
    SELECT id FROM consent_texts WHERE consent_key = ${WAITLIST_CONSENT_KEY} AND version = ${WAITLIST_CONSENT_VERSION} LIMIT 1
  `);
  return String((r.rows[0] as any).id);
}

export async function joinWaitlist(input: {
  email: string;
  marketSlug: string;
  source?: unknown;
  sourceRef?: unknown;
  consent?: boolean;
}): Promise<void> {
  const email = normalizeWaitlistEmail(input.email);
  const source = normalizeWaitlistSource(input.source);
  const sourceRef = normalizeSourceRef(input.sourceRef);
  const consent = input.consent === true;
  const consentTextId = consent ? await ensureConsentTextId() : null;
  await db.execute(sql`
    INSERT INTO launch_waitlist
      (id, email, market_slug, source, source_ref, consent_at, consent_text_id, created_at, updated_at)
    VALUES
      (gen_random_uuid(), ${email}, ${input.marketSlug}, ${source}, ${sourceRef},
       CASE WHEN ${consent} THEN NOW() ELSE NULL END, ${consentTextId}, NOW(), NOW())
    ON CONFLICT (email, market_slug) DO UPDATE SET
      updated_at      = NOW(),
      consent_text_id = CASE WHEN launch_waitlist.consent_at IS NULL THEN EXCLUDED.consent_text_id ELSE launch_waitlist.consent_text_id END,
      consent_at      = COALESCE(launch_waitlist.consent_at, EXCLUDED.consent_at)
  `);
}

export interface WaitlistCounts {
  marketSlug: string | null;
  total: number;
  consented: number;
  bySource: { source: string; count: number }[];
}

export async function waitlistCounts(marketSlug: string | null): Promise<WaitlistCounts> {
  const where = marketSlug ? sql`WHERE market_slug = ${marketSlug}` : sql``;
  const totals = await db.execute(sql`
    SELECT COUNT(*)::int AS total, COUNT(consent_at)::int AS consented FROM launch_waitlist ${where}
  `);
  const bySource = await db.execute(sql`
    SELECT COALESCE(source, 'unknown') AS source, COUNT(*)::int AS count
    FROM launch_waitlist ${where} GROUP BY 1 ORDER BY 2 DESC, 1
  `);
  const t = (totals.rows[0] as any) ?? {};
  return {
    marketSlug,
    total: Number(t.total ?? 0),
    consented: Number(t.consented ?? 0),
    bySource: (bySource.rows as any[]).map((r) => ({ source: String(r.source), count: Number(r.count) })),
  };
}

export interface WaitlistExportRow {
  email: string | null;
  market_slug: string | null;
  source: string | null;
  source_ref: string | null;
  consent_at: string | null;
  consent_version: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function waitlistExportRows(marketSlug: string | null): Promise<WaitlistExportRow[]> {
  const where = marketSlug ? sql`WHERE w.market_slug = ${marketSlug}` : sql``;
  const r = await db.execute(sql`
    SELECT w.email, w.market_slug, w.source, w.source_ref,
           to_char(w.consent_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS consent_at,
           c.version AS consent_version,
           to_char(w.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           to_char(w.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
    FROM launch_waitlist w
    LEFT JOIN consent_texts c ON c.id = w.consent_text_id
    ${where}
    ORDER BY w.created_at ASC NULLS LAST, w.email ASC
  `);
  return r.rows as unknown as WaitlistExportRow[];
}
