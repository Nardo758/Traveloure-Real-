/**
 * Saved-plan references, shared by the server and the client.
 *
 * WHY THIS FILE EXISTS (E2): `dedupeSavedRefs` began life inside
 * `server/services/guest-plan.service.ts`, and the client test that exercises it imported that service
 * module directly. On Linux that import is a module-load crash — the service pulls the DB/env graph — so
 * the client lane went red with `exitCode: 1` and no assertion at all. A client test must never import a
 * server service module; the pure rule lives here instead, where both sides can reach it.
 *
 * Behaviour is IDENTICAL to the version it replaced: one entry per (key, plan), the lowest day winning
 * within a pair, sorted by key then plan.
 */
import { savedRefKeyOfItem } from "./plan-item-ref";

export interface SavedRefEntry {
  key: string;
  planId: string;
  dayNumber: number | null;
}

/** The stored row shape this rule reads. Only the columns a saved-ref key needs are named. */
export interface SavedRefRow {
  contentType?: string | null;
  contentId?: string | null;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
  dayNumber?: number | null;
  planId: string | number;
}

/**
 * Pure: stored rows → the entries the saved-refs route answers with.
 *
 * Deduped per (key, plan), NOT per key: the same event on two plans is TWO entries, so the client can pick
 * the one belonging to ITS plan. Within one pair the lowest day wins (an item repeated on the same plan is
 * one answer). Sorted by key, then plan, so the payload is stable across requests.
 */
export function dedupeSavedRefs(rows: ReadonlyArray<SavedRefRow>): SavedRefEntry[] {
  const byPair = new Map<string, SavedRefEntry>();
  for (const r of rows) {
    const key = savedRefKeyOfItem(r);
    if (!key) continue;
    const planId = String(r.planId);
    const dayNumber = typeof r.dayNumber === "number" ? r.dayNumber : null;
    const pair = `${key}|${planId}`;
    const prior = byPair.get(pair);
    if (!prior || (dayNumber ?? Number.MAX_SAFE_INTEGER) < (prior.dayNumber ?? Number.MAX_SAFE_INTEGER)) {
      byPair.set(pair, { key, planId, dayNumber });
    }
  }
  return Array.from(byPair.values()).sort((a, b) =>
    a.key === b.key ? (a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0) : a.key < b.key ? -1 : 1,
  );
}
