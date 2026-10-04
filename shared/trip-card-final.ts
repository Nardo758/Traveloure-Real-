/**
 * What a Trip Card snapshot carries beyond the plan's rows (surface spec v1.3.4 §9 "Finalize";
 * step 6 — ledger `2026-10-04-step6-trip-card`). Written by the ONE finalize writer into
 * `trip_finals.snapshot`, read back by the card. None of it is in the plan fingerprint: a photo
 * re-checked or a run renumbered is not a plan edit.
 *   days      — per day, the run and version its stops were adopted from ({source_run_id,
 *               source_variant_id}, migration 343); null where the day was never adopted
 *   builtFrom — the version most of the plan came from, as the card says it ("Version A, run 1")
 *   photos    — STORED photo references only (ours / Wikimedia); a Google photo is never stored (R-aq)
 * A snapshot written before step 6 has none of these keys and reads as absent — the card then says
 * nothing about them, never a guess (§13).
 */
import type { PhotoView } from "./place-photos";

export interface FinalCardDay {
  dayNumber: number;
  sourceRunId: string | null;
  sourceVariantId: string | null;
}

export interface FinalCardMeta {
  days: FinalCardDay[];
  builtFrom: { versionLabel: string; runNumber: number | null } | null;
  photos: Record<string, PhotoView>;
}

/** Pure. Per day, the first adopted (run, version) pair among its items, in the snapshot's order. */
export function finalCardDays(items: ReadonlyArray<{ dayNumber?: number | null; sourceRunId?: string | null; sourceVariantId?: string | null }>): FinalCardDay[] {
  const out = new Map<number, FinalCardDay>();
  for (const it of items) {
    const d = typeof it.dayNumber === "number" ? it.dayNumber : null;
    if (d == null) continue;
    const cur = out.get(d) ?? { dayNumber: d, sourceRunId: null, sourceVariantId: null };
    if (!cur.sourceVariantId && it.sourceVariantId) {
      cur.sourceVariantId = it.sourceVariantId;
      cur.sourceRunId = it.sourceRunId ?? null;
    }
    out.set(d, cur);
  }
  return Array.from(out.values()).sort((a, b) => a.dayNumber - b.dayNumber);
}

/** Pure. The version the most adopted days came from (ties: the earliest day's). Null when none. */
export function dominantVariant(days: readonly FinalCardDay[]): { sourceVariantId: string; sourceRunId: string | null } | null {
  const counts = new Map<string, { n: number; first: number; runId: string | null }>();
  for (const d of days) {
    if (!d.sourceVariantId) continue;
    const c = counts.get(d.sourceVariantId) ?? { n: 0, first: d.dayNumber, runId: d.sourceRunId };
    c.n += 1;
    counts.set(d.sourceVariantId, c);
  }
  let best: [string, { n: number; first: number; runId: string | null }] | null = null;
  counts.forEach((c, id) => {
    if (!best || c.n > best[1].n || (c.n === best[1].n && c.first < best[1].first)) best = [id, c];
  });
  return best ? { sourceVariantId: best[0], sourceRunId: (best as any)[1].runId } : null;
}

/** Pure. A snapshot's card meta, or null for a pre-step-6 snapshot that carries none. */
export function readFinalCardMeta(snapshot: unknown): FinalCardMeta | null {
  const s = (snapshot ?? {}) as Record<string, any>;
  const card = s.card;
  if (!card || typeof card !== "object") return null;
  return {
    days: Array.isArray(card.days) ? card.days : [],
    builtFrom: card.builtFrom && typeof card.builtFrom.versionLabel === "string" ? card.builtFrom : null,
    photos: card.photos && typeof card.photos === "object" ? card.photos : {},
  };
}
