/**
 * A ROUTED LEG'S MODE OPTIONS — the pure half (step 9c, ledger `2026-10-07-step9c-leg-options`; architect
 * rulings D1–D3 on the 9c Phase 0, Oct 7, 2026; brief L4, L6).
 *
 *   · D1 — options are asked ON TAP only (never at Optimize, never on page load), at most TWO calls per
 *     leg, and stored on the leg's OWN `transport_legs.alternative_modes` row: plan data, never a cache
 *     (LD 63). Only an engine leg on a routed plan has options.
 *   · D2 — the candidates are L4's: walk when the straight line is ≤ 1.2 km, transit where the market has
 *     transit coverage, drive. The leg's current mode is first (the default), so there are at most three.
 *     A mode the source cannot route is OMITTED, never shown as "unavailable" (§13). No chauffeured
 *     pseudo-modes here — those are the expert picker's (`legModeOptions`).
 *   · D3 — the traveler picks through the existing leg PATCH; a picked option is moved to entry 0 (the
 *     entry the engine and every reader treat as the leg's own), so the pick costs no call.
 *
 * An option entry is the engine's own alternative-entry shape plus `checkedAt` and `distanceMeters`, so
 * each option carries its own provenance. No I/O.
 */
import { haversineMeters } from "./geo";
import { ROUTED_WALK_MAX_METERS, TRANSIT_UNAVAILABLE_REASON, toRouteFacts, type RouteAnswer, type RoutingMode } from "./routing-engine";
import { LEG_MODE_STORED, normalizeLegMode } from "./travel-speeds";

/** D2: never more than this many options on one leg, the default included. */
export const MAX_LEG_OPTIONS = 3;

/** The stored shape of one routed alternative entry (entry 0 = the leg's own mode). */
export interface StoredLegOption {
  mode: string;
  durationMinutes: number;
  costUsd: null;
  energyCost: number;
  /** The routing source (`google_routes`, `stub`). */
  reason: string;
  line: string | null;
  fare: { amount: number; currency: string } | null;
  legKey: string;
  hourBucket: number | null;
  /** When the source answered this option (ISO). Entry 0 may lack it (the row's `calculated_at` is its time). */
  checkedAt?: string;
  distanceMeters?: number;
  /** Set on entry 0 once the leg's options were asked, so a re-open never asks again (D1). */
  optionsCheckedAt?: string;
}

export interface LegOptionView {
  mode: RoutingMode;
  route: RouteAnswer;
  /** True for entry 0 — the leg's current mode. */
  current: boolean;
}

/** D2: the options a leg may offer, current first, de-duplicated, at most three. */
export function legOptionCandidates(input: {
  current: RoutingMode;
  straightLineMeters: number;
  hasTransitCoverage: boolean;
}): RoutingMode[] {
  const out: RoutingMode[] = [input.current];
  const add = (m: RoutingMode) => {
    if (!out.includes(m) && out.length < MAX_LEG_OPTIONS) out.push(m);
  };
  if (input.straightLineMeters <= ROUTED_WALK_MAX_METERS) add("walk");
  if (input.hasTransitCoverage) add("transit");
  add("drive");
  return out;
}

/** The modes still to ask for (the candidates minus what the leg already holds). */
export function legOptionsToAsk(candidates: readonly RoutingMode[], held: readonly RoutingMode[]): RoutingMode[] {
  return candidates.filter((m) => !held.includes(m));
}

/** The straight-line metres between a leg's two ends, or null when either end has no point. */
export function legStraightLineMeters(leg: { fromLat?: unknown; fromLng?: unknown; toLat?: unknown; toLng?: unknown }): number | null {
  const n = [leg.fromLat, leg.fromLng, leg.toLat, leg.toLng].map((v) => (v == null ? NaN : Number(v)));
  if (n.some((v) => !Number.isFinite(v))) return null;
  return haversineMeters(n[0], n[1], n[2], n[3]);
}

function isRoutedEntry(a: unknown): a is StoredLegOption {
  const e = a as StoredLegOption | null;
  return !!e && typeof e.mode === "string" && typeof e.legKey === "string" && Number(e.durationMinutes) > 0;
}

/** Was this leg's option set already asked for? (entry 0's marker — D1: never ask twice). */
export function legOptionsChecked(alternativeModes: unknown): boolean {
  const first = Array.isArray(alternativeModes) ? (alternativeModes[0] as StoredLegOption | undefined) : undefined;
  return typeof first?.optionsCheckedAt === "string";
}

/**
 * The options an ENGINE leg shows, current first. Each option's provenance is its own; entry 0 falls
 * back to the row's `source`/`calculated_at`. Non-routed entries (no leg key) are not options. Capped at
 * three (D2). Null for a leg that is not an engine leg.
 */
export function routedLegOptions(leg: {
  source?: string | null;
  calculatedAt?: Date | string | null;
  distanceMeters?: number | null;
  alternativeModes?: unknown;
}): LegOptionView[] | null {
  if (!leg.source || !leg.calculatedAt || !Array.isArray(leg.alternativeModes)) return null;
  const rowAt = new Date(leg.calculatedAt as any);
  if (Number.isNaN(rowAt.getTime())) return null;
  const out: LegOptionView[] = [];
  (leg.alternativeModes as unknown[]).forEach((raw, i) => {
    if (!isRoutedEntry(raw) || out.length >= MAX_LEG_OPTIONS) return;
    const mode = normalizeLegMode(raw.mode);
    if (!mode || out.some((o) => o.mode === mode)) return;
    const checkedAt = raw.checkedAt ?? (i === 0 ? rowAt.toISOString() : null);
    if (!checkedAt) return;
    out.push({
      mode,
      current: i === 0,
      route: toRouteFacts({
        durationMin: Number(raw.durationMinutes),
        distanceM: Number(raw.distanceMeters ?? (i === 0 ? leg.distanceMeters ?? 0 : 0)),
        line: raw.line ?? null,
        fare: raw.fare ?? null,
        // The P0 fallback marker is a reason, not a source: such an entry's provenance is the row's.
        provenance: { source: raw.reason && raw.reason !== TRANSIT_UNAVAILABLE_REASON ? raw.reason : String(leg.source), checkedAt },
      }),
    });
  });
  return out.length ? out : null;
}

/** The stored entry for a freshly routed option. */
export function storedLegOption(mode: RoutingMode, route: RouteAnswer, legKey: string, hourBucket: number | null): StoredLegOption {
  const r = toRouteFacts(route);
  return {
    mode: LEG_MODE_STORED[mode],
    durationMinutes: r.durationMin,
    costUsd: null,
    energyCost: 0,
    reason: r.provenance.source,
    line: r.line,
    fare: r.fare,
    legKey,
    hourBucket,
    checkedAt: r.provenance.checkedAt,
    distanceMeters: r.distanceM,
  };
}

/**
 * The leg's alternative entries after an ask: entry 0 is kept (stamped with its own time and distance and
 * the `optionsCheckedAt` marker), the new options follow, de-duplicated by mode, capped at three.
 */
export function withLegOptions(
  alternativeModes: unknown,
  row: { calculatedAt?: Date | string | null; distanceMeters?: number | null },
  added: readonly StoredLegOption[],
  checkedAt: string,
): StoredLegOption[] {
  const list = (Array.isArray(alternativeModes) ? alternativeModes : []).filter(isRoutedEntry);
  const head = list[0];
  const out: StoredLegOption[] = [];
  if (head) {
    out.push({
      ...head,
      checkedAt: head.checkedAt ?? (row.calculatedAt ? new Date(row.calculatedAt as any).toISOString() : undefined),
      distanceMeters: head.distanceMeters ?? (row.distanceMeters ?? undefined),
      optionsCheckedAt: checkedAt,
    });
  }
  for (const e of [...list.slice(1), ...added]) {
    const m = normalizeLegMode(e.mode);
    if (!m || out.some((o) => normalizeLegMode(o.mode) === m) || out.length >= MAX_LEG_OPTIONS) continue;
    out.push(e);
  }
  return out;
}

/**
 * D3: the traveler picks `mode`. Returns the reordered entries (the picked option first, carrying the
 * `optionsCheckedAt` marker) and the row facts it implies — or null when the leg holds no routed option
 * in that mode (the caller then keeps its existing path).
 */
export function pickLegOption(
  alternativeModes: unknown,
  rawMode: string,
): {
  entries: StoredLegOption[];
  row: { recommendedMode: string; estimatedDurationMinutes: number; distanceMeters: number | null; source: string; calculatedAt: Date };
} | null {
  const mode = normalizeLegMode(rawMode);
  if (!mode || !Array.isArray(alternativeModes)) return null;
  const list = (alternativeModes as unknown[]).filter(isRoutedEntry);
  const idx = list.findIndex((e) => normalizeLegMode(e.mode) === mode);
  if (idx <= 0) return null;
  const picked = list[idx];
  if (!picked.checkedAt) return null;
  const marker = list[0].optionsCheckedAt;
  const { optionsCheckedAt: _drop, ...oldHead } = list[0];
  const entries: StoredLegOption[] = [
    { ...picked, ...(marker ? { optionsCheckedAt: marker } : {}) },
    oldHead,
    ...list.slice(1).filter((_, i) => i + 1 !== idx),
  ];
  return {
    entries,
    row: {
      recommendedMode: LEG_MODE_STORED[mode],
      estimatedDurationMinutes: Number(picked.durationMinutes),
      distanceMeters: picked.distanceMeters ?? null,
      source: picked.reason,
      calculatedAt: new Date(picked.checkedAt),
    },
  };
}
