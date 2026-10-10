/**
 * FD-5 — COVERAGE TARGETS, the pure half (decision-maker rulings, Oct 10, 2026; ledger
 * `2026-10-10-fd5-coverage-targets`; brief docs/planning/briefs/fd-5-coverage-targets.md).
 *
 *   · `coverageDayType` — ruling 1/2: a day is `peak` when its date is a Saturday or Sunday, or falls in a
 *     market season whose demand multiplier is at or above the configured threshold; a plan whose dates are
 *     not confirmed is gated against `peak` (the stricter target). Public holidays are not read now — the
 *     Nager.Date trend adapter is the named later source.
 *   · `meetsTarget` — ruling 3/4: ONE neighbourhood against its own target for that day type, on the
 *     teaser's own counts only. An unset field does not gate; a slug with no target has no gate.
 *   · `buildCoverageCensus` — per slug, local and official counts against both day types' targets, plus the
 *     unplaced gems and the target slugs the market does not have.
 *
 * No db, no clock: every date and row is passed in.
 */

export const COVERAGE_DAY_TYPES = ["peak", "normal_weekday"] as const;
export type CoverageDayType = (typeof COVERAGE_DAY_TYPES)[number];

/** Gating fields (ruling 4) and census-only official fields. Every field optional; unset = no target. */
export interface CoverageTarget {
  localPicks?: number;
  localNotes?: number;
  officialHours?: number;
  officialLastAdmission?: number;
  officialLastService?: number;
}
export type SlugTargets = Partial<Record<CoverageDayType, CoverageTarget>>;
/** market → slug → day type → target. */
export type CoverageTargets = Record<string, Record<string, SlugTargets>>;

export interface SeasonRow {
  startMonthDay: string;
  endMonthDay: string;
  multiplier: number;
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function inSeason(s: SeasonRow, md: string): boolean {
  return s.startMonthDay <= s.endMonthDay ? md >= s.startMonthDay && md <= s.endMonthDay : md >= s.startMonthDay || md <= s.endMonthDay;
}

/** Pure. Rulings 1/2. An unknown or malformed date is gated as `peak`, the stricter target. */
export function coverageDayType(input: {
  dateIso: string | null | undefined;
  datesConfirmed: boolean;
  seasons: readonly SeasonRow[];
  peakMultiplier: number;
}): CoverageDayType {
  if (!input.datesConfirmed || !input.dateIso || !ISO_DATE.test(input.dateIso)) return "peak";
  const weekday = new Date(`${input.dateIso}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "peak";
  const md = input.dateIso.slice(5, 10);
  if (input.seasons.some((s) => Number.isFinite(s.multiplier) && s.multiplier >= input.peakMultiplier && inSeason(s, md))) return "peak";
  return "normal_weekday";
}

/** Pure. The ISO date of plan day N (1-based) from the plan's start date, or null. */
export function planDayIso(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate || !ISO_DATE.test(startDate.slice(0, 10)) || !Number.isInteger(dayNumber) || dayNumber < 1) return null;
  const d = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayNumber - 1);
  return d.toISOString().slice(0, 10);
}

/** Pure. Rulings 3/4: is this neighbourhood at or above its target? No target ⇒ no gate ⇒ true. */
export function meetsTarget(counts: { localPicks: number; localNotes: number }, target: CoverageTarget | null | undefined): boolean {
  if (!target) return true;
  if (typeof target.localPicks === "number" && counts.localPicks < target.localPicks) return false;
  if (typeof target.localNotes === "number" && counts.localNotes < target.localNotes) return false;
  return true;
}

// ── census ───────────────────────────────────────────────────────────────────────────────────────

export interface CensusNeighbourhood { id: string; slug: string; name: string; lat: number | null; lng: number | null }
export interface CensusInput {
  market: string;
  neighbourhoods: readonly CensusNeighbourhood[];
  /** Draft-eligible local gems (tagged local, unexpired), by their soft slug. */
  gems: ReadonlyArray<{ neighbourhoodSlug: string | null }>;
  /** Live local nuggets, by id or by name (the teaser's own matching). */
  notes: ReadonlyArray<{ neighbourhoodId: string | null; neighbourhoodName: string | null }>;
  /** Live, tagged place facts with a point: local ones, and official ones of the three feasibility types. */
  facts: ReadonlyArray<{ lat: number | null; lng: number | null; sourceClass: string | null; license: string | null; factType: string; sourceName: string | null }>;
  targets: Record<string, SlugTargets>;
}

export interface CensusRow {
  slug: string;
  name: string;
  localPicks: number;
  localNotes: number;
  localFacts: number;
  officialHours: number;
  officialLastAdmission: number;
  officialLastService: number;
  /** Official facts by source name (a fact with no registered source reads "unregistered source"). */
  officialBySource: Record<string, number>;
  targets: SlugTargets | null;
  /** Ruling 4: whether the teaser may speak for this neighbourhood on each day type. Null = no target. */
  gate: Record<CoverageDayType, boolean> | null;
}

export interface CoverageCensus {
  market: string;
  rows: CensusRow[];
  /** Gems whose slug names no neighbourhood of this market (e.g. 042's never-shipped slugs). */
  unplacedGems: number;
  /** Target slugs the market has no `city_neighborhoods` row for. */
  unknownTargetSlugs: string[];
}

const OFFICIAL_TYPES: Record<string, keyof Pick<CensusRow, "officialHours" | "officialLastAdmission" | "officialLastService">> = {
  hours: "officialHours",
  last_admission: "officialLastAdmission",
  last_service: "officialLastService",
};

/**
 * The ONE nearest-centroid rule: the FD-1 teaser places a day's stops with it and the census places a fact
 * with it (§18 rule 1). Planar distance with a latitude-scaled longitude — fine inside one city.
 */
export function nearestArea<N extends { lat: number | null; lng: number | null }>(p: { lat: number; lng: number }, hoods: readonly N[]): N | null {
  let best: { n: N; d: number } | null = null;
  for (const n of hoods) {
    if (n.lat == null || n.lng == null || !Number.isFinite(n.lat) || !Number.isFinite(n.lng)) continue;
    const d = (n.lat - p.lat) ** 2 + ((n.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
    if (!best || d < best.d) best = { n, d };
  }
  return best?.n ?? null;
}

export function buildCoverageCensus(input: CensusInput): CoverageCensus {
  const rows = new Map<string, CensusRow>();
  const byId = new Map<string, CensusRow>();
  const byName = new Map<string, CensusRow>();
  for (const n of input.neighbourhoods) {
    const targets = input.targets[n.slug] ?? null;
    const row: CensusRow = {
      slug: n.slug, name: n.name, localPicks: 0, localNotes: 0, localFacts: 0,
      officialHours: 0, officialLastAdmission: 0, officialLastService: 0, officialBySource: {}, targets, gate: null,
    };
    rows.set(n.slug.toLowerCase(), row);
    byId.set(n.id, row);
    byName.set(n.name.trim().toLowerCase(), row);
  }
  let unplacedGems = 0;
  for (const g of input.gems) {
    const row = g.neighbourhoodSlug ? rows.get(g.neighbourhoodSlug.toLowerCase()) : undefined;
    if (row) row.localPicks++;
    else unplacedGems++;
  }
  for (const note of input.notes) {
    const row = (note.neighbourhoodId && byId.get(note.neighbourhoodId)) || (note.neighbourhoodName && byName.get(note.neighbourhoodName.trim().toLowerCase())) || null;
    if (row) row.localNotes++;
  }
  for (const f of input.facts) {
    if (f.lat == null || f.lng == null || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) continue;
    const hood = nearestArea({ lat: f.lat, lng: f.lng }, input.neighbourhoods);
    const row = hood ? rows.get(hood.slug.toLowerCase()) : undefined;
    if (!row) continue;
    if (f.sourceClass === "local") row.localFacts++;
    const key = OFFICIAL_TYPES[f.factType];
    if (f.license === "official" && key) {
      row[key]++;
      const src = f.sourceName ?? "unregistered source";
      row.officialBySource[src] = (row.officialBySource[src] ?? 0) + 1;
    }
  }
  for (const row of Array.from(rows.values())) {
    if (!row.targets) continue;
    row.gate = {
      peak: meetsTarget(row, row.targets.peak),
      normal_weekday: meetsTarget(row, row.targets.normal_weekday),
    };
  }
  const known = new Set(Array.from(rows.keys()));
  return {
    market: input.market,
    rows: Array.from(rows.values()).sort((a, b) => a.slug.localeCompare(b.slug)),
    unplacedGems,
    unknownTargetSlugs: Object.keys(input.targets).filter((s) => !known.has(s.toLowerCase())).sort(),
  };
}

/** One line for the nightly census log: how many targeted neighbourhoods the teaser may speak for. */
export function censusSummary(c: CoverageCensus): { market: string; targeted: number; atTargetPeak: number; atTargetNormal: number; unplacedGems: number; unknownTargetSlugs: string[] } {
  const targeted = c.rows.filter((r) => r.gate);
  return {
    market: c.market,
    targeted: targeted.length,
    atTargetPeak: targeted.filter((r) => r.gate!.peak).length,
    atTargetNormal: targeted.filter((r) => r.gate!.normal_weekday).length,
    unplacedGems: c.unplacedGems,
    unknownTargetSlugs: c.unknownTargetSlugs,
  };
}

export function renderCensusMarkdown(c: CoverageCensus): string {
  const t = (r: CensusRow, d: CoverageDayType) => {
    const x = r.targets?.[d];
    return x && (x.localPicks != null || x.localNotes != null) ? `${x.localPicks ?? "–"}/${x.localNotes ?? "–"}` : "none";
  };
  const g = (r: CensusRow, d: CoverageDayType) => (r.gate ? (r.gate[d] ? "at target" : "under") : "no gate");
  const lines = [
    `# Coverage census — ${c.market}`,
    "",
    "| slug | picks | notes | local facts | official hours | last entry | last service | target peak (picks/notes) | peak | target weekday | weekday | official by source |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...c.rows.map((r) =>
      `| ${r.slug} | ${r.localPicks} | ${r.localNotes} | ${r.localFacts} | ${r.officialHours} | ${r.officialLastAdmission} | ${r.officialLastService} | ${t(r, "peak")} | ${g(r, "peak")} | ${t(r, "normal_weekday")} | ${g(r, "normal_weekday")} | ${Object.entries(r.officialBySource).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} |`),
    "",
    `Unplaced gems (slug names no neighbourhood here): ${c.unplacedGems}`,
    `Target slugs with no neighbourhood row: ${c.unknownTargetSlugs.length ? c.unknownTargetSlugs.join(", ") : "none"}`,
  ];
  return lines.join("\n");
}
