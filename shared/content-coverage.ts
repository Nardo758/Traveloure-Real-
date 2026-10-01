/**
 * CONTENT COVERAGE — the pure half of `scripts/report-content-coverage.cjs <market>` (content
 * sourcing brief §4/§5; A6 decision 1B, ledger `2026-10-01-a6-sub-needs`).
 *
 * A need × source matrix for one market, with ONE level of nesting: each need row carries its named
 * sub-need rows (`CONTENT_SUB_NEEDS`). Every cell is `sourceNeedStanding` — the ONE rule
 * (`needCovers`) — never a second reading of `covers` / `does_not_cover`. Flags:
 *   - a REQUIRED need with no ACTIVE source covering it (the market-opening gate);
 *   - a required need's sub-need that no active source covers;
 *   - a recommended need or sub-need with no active source (12Go excludes rail ⇒ the JR gap shows);
 *   - a source past `terms_checked_at + 180 d` — FLAG ONLY (a6-design §2: auto-deactivating a
 *     source silently changes plans), and a source with no terms check at all.
 *
 * §13: a market with no stated requirement says so; its needs are listed `unstated`, never
 * presumed required or presumed optional. A source whose stored values are not ours is reported
 * with those values named, never coerced.
 */
import {
  CONTENT_NEEDS,
  isContentNeedKey,
  sourceNeedStanding,
  subNeedsOf,
  type ContentNeed,
  type ContentNeedKey,
  type NeedStanding,
} from "./content-facts";

export const TERMS_STALE_AFTER_DAYS = 180;

export type NeedRequirement = "required" | "recommended" | "not_applicable";

/**
 * Per-market requirements, as the brief states them (§4: "Kyoto Trips: lodging, stop.hours,
 * stop.ticketing, transport.local, dining required; transport.intercity recommended; cruise n/a").
 * A need a market does not name is `unstated`. A new market is a list entry here, reviewed — not a
 * guess at read time.
 */
export const MARKET_NEED_REQUIREMENTS: Record<string, Partial<Record<ContentNeed, NeedRequirement>>> = {
  kyoto: {
    lodging: "required",
    "stop.hours": "required",
    "stop.ticketing": "required",
    "transport.local": "required",
    dining: "required",
    "transport.intercity": "recommended",
    "transport.cruise": "not_applicable",
  },
};

export interface CoverageSourceRow {
  id: string;
  name: string;
  market: string | null;
  covers: readonly unknown[] | null;
  doesNotCover: readonly unknown[] | null;
  active: boolean;
  termsCheckedAt: Date | string | null;
}

export interface CoverageCell { sourceId: string; standing: NeedStanding }
export interface CoverageRow {
  need: ContentNeedKey;
  /** The parent row this sub-need nests under; null on a top-level row. */
  parent: ContentNeed | null;
  requirement: NeedRequirement | "unstated";
  cells: CoverageCell[];
  /** Active sources whose standing is `covers` or `partial`. */
  activeCovering: string[];
  /** Set when this row is a gap the gate cares about. */
  gap: "required_uncovered" | "required_sub_uncovered" | "recommended_uncovered" | null;
}
export interface CoverageReport {
  market: string;
  requirementsStated: boolean;
  sources: { id: string; name: string; scope: "market" | "global"; active: boolean }[];
  rows: CoverageRow[];
  staleTerms: { sourceId: string; termsCheckedAt: string; ageDays: number }[];
  uncheckedTerms: string[];
  /** Stored covers / does_not_cover values that are neither a need nor a named sub-need. */
  unknownValues: { sourceId: string; value: string }[];
}

const DAY_MS = 86_400_000;
const toMs = (v: Date | string | null): number | null => {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export function buildCoverageReport(market: string, allSources: readonly CoverageSourceRow[], now: Date = new Date()): CoverageReport {
  const m = market.trim().toLowerCase();
  const reqs = MARKET_NEED_REQUIREMENTS[m];
  const sources = allSources.filter((s) => s.market == null || s.market.trim().toLowerCase() === m);

  const row = (need: ContentNeedKey, parent: ContentNeed | null): CoverageRow => {
    const cells = sources.map((s) => ({ sourceId: s.id, standing: sourceNeedStanding(s, need) }));
    const activeCovering = sources
      .filter((s, i) => s.active && (cells[i].standing === "covers" || cells[i].standing === "partial"))
      .map((s) => s.id);
    const requirement = reqs ? (reqs[(parent ?? need) as ContentNeed] ?? "unstated") : "unstated";
    let gap: CoverageRow["gap"] = null;
    if (activeCovering.length === 0) {
      if (requirement === "required") gap = parent ? "required_sub_uncovered" : "required_uncovered";
      else if (requirement === "recommended") gap = "recommended_uncovered";
    }
    return { need, parent, requirement, cells, activeCovering, gap };
  };

  const rows: CoverageRow[] = [];
  for (const need of CONTENT_NEEDS) {
    rows.push(row(need, null));
    for (const sub of subNeedsOf(need)) rows.push(row(sub, need));
  }

  const staleTerms: CoverageReport["staleTerms"] = [];
  const uncheckedTerms: string[] = [];
  const unknownValues: CoverageReport["unknownValues"] = [];
  for (const s of sources) {
    const ms = toMs(s.termsCheckedAt);
    if (ms == null) uncheckedTerms.push(s.id);
    else {
      const ageDays = Math.floor((now.getTime() - ms) / DAY_MS);
      if (ageDays > TERMS_STALE_AFTER_DAYS) staleTerms.push({ sourceId: s.id, termsCheckedAt: new Date(ms).toISOString(), ageDays });
    }
    for (const v of [...(s.covers ?? []), ...(s.doesNotCover ?? [])]) {
      if (!isContentNeedKey(v)) unknownValues.push({ sourceId: s.id, value: String(v) });
    }
  }

  return {
    market: m,
    requirementsStated: !!reqs,
    sources: sources.map((s) => ({ id: s.id, name: s.name, scope: s.market == null ? "global" : "market", active: s.active })),
    rows,
    staleTerms,
    uncheckedTerms,
    unknownValues,
  };
}

const CELL: Record<NeedStanding, string> = { covers: "✓", partial: "◐", excludes: "✗", none: "" };

/** Markdown rendering: sub-need rows are indented under their parent. */
export function renderCoverageMarkdown(r: CoverageReport): string {
  const out: string[] = [];
  out.push(`# Content coverage — ${r.market}`, "");
  if (!r.requirementsStated) out.push(`_No coverage requirement is stated for \`${r.market}\`; every need is listed as unstated._`, "");
  if (r.sources.length === 0) out.push("_No registry rows apply to this market (market or global)._", "");
  const head = ["need", "requirement", ...r.sources.map((s) => `${s.id}${s.active ? "" : " (inactive)"}`), "gap"];
  out.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
  for (const row of r.rows) {
    const label = row.parent ? `&nbsp;&nbsp;↳ \`${row.need}\`` : `\`${row.need}\``;
    const gap = row.gap === "required_uncovered" ? "**no active source**" : row.gap === "required_sub_uncovered" ? "**sub-need uncovered**" : row.gap === "recommended_uncovered" ? "no active source (recommended)" : "";
    out.push(`| ${[label, row.requirement, ...row.cells.map((c) => CELL[c.standing]), gap].join(" | ")} |`);
  }
  out.push("", "Legend: ✓ covers · ◐ covers, but excludes a sub-need · ✗ explicitly not covered.", "");
  if (r.staleTerms.length) {
    out.push(`## Terms checked more than ${TERMS_STALE_AFTER_DAYS} days ago (flag only)`, "");
    for (const s of r.staleTerms) out.push(`- \`${s.sourceId}\` — checked ${s.termsCheckedAt.slice(0, 10)} (${s.ageDays} days)`);
    out.push("");
  }
  if (r.uncheckedTerms.length) out.push("## Terms never checked", "", ...r.uncheckedTerms.map((id) => `- \`${id}\``), "");
  if (r.unknownValues.length) {
    out.push("## Stored values that are not a need or a named sub-need", "");
    for (const u of r.unknownValues) out.push(`- \`${u.sourceId}\`: \`${u.value}\``);
    out.push("");
  }
  return out.join("\n");
}
