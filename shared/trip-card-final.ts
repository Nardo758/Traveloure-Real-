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

/**
 * A flight anchor frozen into `trip_finals.snapshot.anchors` at Make final (row 185 J6).
 * `time` is the wall-clock "HH:MM" (`anchorWallTime`). `airportLegMinutes` is a positive
 * integer only when the plan already had a shown routed leg touching this anchor; otherwise null.
 */
export interface FrozenFlight {
  time: string | null;
  airport: string | null;
  description: string | null;
  airportLegMinutes: number | null;
}

/** `trip_finals.snapshot.airportLeg` — the one fact the airport ↔ lodging row cannot derive itself. */
export interface FrozenAirportLeg {
  platformCarFits: boolean;
}

/**
 * What the Trip Card read forwards for the owner's final. Absent `platformCarFits` on the
 * snapshot reads as false. This is the ONE reader: the server forwards it and the client imports it.
 */
export interface FinalAirportLeg {
  flightArrival: FrozenFlight | null;
  flightDeparture: FrozenFlight | null;
  platformCarFits: boolean;
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** A flight object, or null when the direction was absent or not an object. Bad field types become null. */
function readFrozenFlight(value: unknown): FrozenFlight | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    time: typeof v.time === "string" ? v.time : null,
    airport: typeof v.airport === "string" ? v.airport : null,
    description: typeof v.description === "string" ? v.description : null,
    airportLegMinutes: positiveInt(v.airportLegMinutes),
  };
}

/**
 * Pure. The frozen airport leg, or null when the snapshot carries no `anchors` or both
 * directions are null (a final written before these keys, or a plan with no flight).
 * Wrong types become null for that field. Never throws. `platformCarFits` is true only
 * for boolean true.
 */
export function readFinalAirportLeg(snapshot: unknown): FinalAirportLeg | null {
  try {
    if (snapshot == null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
    const anchors = (snapshot as Record<string, unknown>).anchors;
    if (anchors == null || typeof anchors !== "object" || Array.isArray(anchors)) return null;
    const bag = anchors as Record<string, unknown>;
    const flightArrival = readFrozenFlight(bag.flightArrival);
    const flightDeparture = readFrozenFlight(bag.flightDeparture);
    if (flightArrival == null && flightDeparture == null) return null;
    const airportLeg = (snapshot as Record<string, unknown>).airportLeg;
    const platformCarFits =
      airportLeg != null && typeof airportLeg === "object" && !Array.isArray(airportLeg)
        ? (airportLeg as Record<string, unknown>).platformCarFits === true
        : false;
    return { flightArrival, flightDeparture, platformCarFits };
  } catch {
    return null;
  }
}
