/**
 * CS-1 item 3 — THE REVIEW OF OFFICIAL REFRESH OUTPUT (decision-maker, Oct 19, 2026; ledger `2026-10-19-cs1-fact-review`).
 *
 * The official refresh writes its dated facts with no reviewer (`recordMachineFacts`), so no reader shows them
 * (`reviewedFactRow`). An admin reviews one on the BOT-1 review screen:
 *   · APPROVE writes a NEW reviewed row through `recordFacts` — same content, source and check date, `verified_by` =
 *     the admin, `verified_at` = now, `expires_at` = the reviewer's entry (`resolveReviewedExpiry`) — and supersedes
 *     the unreviewed row by one atomic conditional in the same transaction (§15). The table stays insert-only.
 *   · There is no reject: an unreviewed row is not read, and nothing deletes it.
 * Any admin may review (BOT-1 decision C); `verified_by` records who, and the route writes an admin audit row.
 */
import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contentSources, placeFacts, platformSettingsTable } from "@shared/schema";
import { BOT_FACT_DEFAULT_EXPIRY_SETTING, botFactExpiryDays } from "@shared/bot-proposals";
import { DATED_FACT_TYPES, isSafetyFactType, resolveReviewedExpiry, type ReviewExpiryRefusal } from "@shared/fact-review";
import { REFRESH_ORIGIN } from "@shared/official-refresh";
import type { ContentNeed, FactType, LicenseClass } from "@shared/content-facts";
import { recordFacts } from "./content-facts/place-facts.service";

export interface RefreshFactForReview {
  id: string;
  factType: string;
  safety: boolean;
  placeRefKind: string;
  placeRef: string;
  market: string | null;
  value: unknown;
  sourceId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  checkedAt: string;
  /** The latest expiry the reviewer may enter, or null when neither the source nor the platform states one. */
  latestExpiry: string | null;
}

async function expirySetting(exec: typeof db = db): Promise<string | null> {
  const [row] = await exec
    .select({ v: platformSettingsTable.settingValue })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.settingKey, BOT_FACT_DEFAULT_EXPIRY_SETTING))
    .limit(1);
  return row?.v ?? null;
}

/** The official refresh's dated facts no person has reviewed yet, newest first. */
export async function listRefreshFactsForReview(limit = 200): Promise<RefreshFactForReview[]> {
  const [rows, setting] = await Promise.all([
    db
      .select({ f: placeFacts, sourceName: contentSources.name, interval: contentSources.refreshIntervalDays })
      .from(placeFacts)
      .leftJoin(contentSources, eq(contentSources.id, placeFacts.sourceId))
      .where(
        and(
          eq(placeFacts.origin, REFRESH_ORIGIN),
          inArray(placeFacts.factType, [...DATED_FACT_TYPES]),
          isNull(placeFacts.supersededBy),
          sql`btrim(coalesce(${placeFacts.verifiedBy}, '')) = ''`,
        ),
      )
      .orderBy(desc(placeFacts.fetchedAt))
      .limit(limit),
    expirySetting(),
  ]);
  return rows.map(({ f, sourceName, interval }) => {
    const days = botFactExpiryDays(interval, setting);
    return {
      id: f.id,
      factType: f.factType,
      safety: isSafetyFactType(f.factType),
      placeRefKind: f.placeRefKind,
      placeRef: f.placeRef,
      market: f.market,
      value: f.value,
      sourceId: f.sourceId,
      sourceName: sourceName ?? null,
      sourceUrl: f.sourceUrl,
      checkedAt: f.fetchedAt.toISOString(),
      latestExpiry: days === null ? null : new Date(f.fetchedAt.getTime() + days * 86_400_000).toISOString(),
    };
  });
}

export type RefreshReviewRefusal = "not_found" | "already_reviewed" | "fact_refused" | ReviewExpiryRefusal;

/** Approve one unreviewed refresh fact with the reviewer's expiry. */
export async function approveRefreshFact(
  id: string,
  adminId: string,
  opts: { expiresAt?: unknown } = {},
  now: Date = new Date(),
): Promise<{ ok: true; factId: string } | { ok: false; reason: RefreshReviewRefusal }> {
  class Refused extends Error {}
  try {
    const factId = await db.transaction(async (tx) => {
      const locked: any = await tx.execute(sql`SELECT id FROM place_facts WHERE id = ${id} FOR UPDATE`);
      if (!(locked.rows ?? locked).length) throw new Refused("not_found");
      const [f] = await tx.select().from(placeFacts).where(eq(placeFacts.id, id)).limit(1);
      if (!f || f.origin !== REFRESH_ORIGIN || !(DATED_FACT_TYPES as readonly string[]).includes(f.factType)) throw new Refused("not_found");
      if (f.supersededBy || (f.verifiedBy ?? "").trim() !== "") throw new Refused("already_reviewed");
      const [src] = f.sourceId
        ? await tx.select({ interval: contentSources.refreshIntervalDays }).from(contentSources).where(eq(contentSources.id, f.sourceId)).limit(1)
        : [];
      const expiry = resolveReviewedExpiry({
        factType: f.factType,
        checkedAt: f.fetchedAt,
        sourceIntervalDays: src?.interval ?? null,
        settingValue: await expirySetting(tx as unknown as typeof db),
        entered: opts.expiresAt,
        now,
      });
      if (!expiry.ok) throw new Refused(expiry.reason);
      const newId = crypto.randomUUID();
      const n = await recordFacts(
        [
          {
            id: newId,
            placeRefKind: f.placeRefKind as any,
            placeRef: f.placeRef,
            placeLat: f.placeLat === null ? null : Number(f.placeLat),
            placeLng: f.placeLng === null ? null : Number(f.placeLng),
            market: f.market,
            need: f.need as ContentNeed,
            factType: f.factType as FactType,
            value: f.value as Record<string, unknown>,
            origin: REFRESH_ORIGIN,
            sourceId: f.sourceId,
            sourceUrl: f.sourceUrl,
            license: f.license as LicenseClass | null,
            // The check date is the read, not the review.
            fetchedAt: f.fetchedAt,
            expiresAt: expiry.expiresAt,
            verifiedAt: now,
            verifiedBy: adminId,
            costCents: 0,
          },
        ],
        { planId: f.planId, itemId: f.itineraryItemId },
        tx,
      );
      if (n !== 1) throw new Refused("fact_refused");
      const [superseded] = await tx
        .update(placeFacts)
        .set({ supersededBy: newId })
        .where(and(eq(placeFacts.id, id), isNull(placeFacts.supersededBy)))
        .returning({ id: placeFacts.id });
      if (!superseded) throw new Refused("already_reviewed");
      return newId;
    });
    return { ok: true, factId };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.message as RefreshReviewRefusal };
    throw err;
  }
}
