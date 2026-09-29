/**
 * PLAN OPTION SETS — the value sets and the pure rules, stated ONCE (ledger `2026-09-29-a3-option-sets`;
 * product map §E2/§E3, R124–R126, R129; §M1/§M7–M9). The service and the slip both import these; no
 * second list exists anywhere (§18 rule 1). No CHECK in the database — these are app-enforced.
 */
export const OPTION_SET_STATUSES = ["open", "chosen", "closed"] as const;
export type OptionSetStatus = (typeof OPTION_SET_STATUSES)[number];

export const OPTION_SOURCE_KINDS = ["incumbent", "listing", "affiliate", "saved_place", "custom", "engine"] as const;
export type OptionSourceKind = (typeof OPTION_SOURCE_KINDS)[number];

export const ANCHOR_ROLES = ["primary", "secondary"] as const;
export type AnchorRole = (typeof ANCHOR_ROLES)[number];

export const CHOSEN_VIA = ["choose", "version_whole", "version_stop"] as const;

export const LOCATION_PRECISIONS = ["exact", "neighborhood_centroid"] as const;

/** §E2: a set holds at most three candidates — "two or three places in mind". */
export const OPTION_SET_CAP = 3;

/** The next position for a new option, or null when the set is full (a 409, never a clamp). */
export function nextOptionPosition(existing: readonly number[]): number | null {
  if (existing.length >= OPTION_SET_CAP) return null;
  for (let p = 1; p <= OPTION_SET_CAP; p++) if (!existing.includes(p)) return p;
  return null;
}

/**
 * A pin is `exact` only when BOTH coordinates are present and finite; a half coordinate is refused
 * (LD 34's rule for stops), and no coordinate at all is an honest unlocated option.
 */
export function pinPrecision(lat: unknown, lng: unknown): { ok: true; precision: "exact" | null } | { ok: false } {
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (!has(lat) && !has(lng)) return { ok: true, precision: null };
  if (!has(lat) || !has(lng)) return { ok: false };
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return { ok: false };
  return { ok: true, precision: "exact" };
}
