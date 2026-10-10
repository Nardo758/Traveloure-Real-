/**
 * SS-1a — CONTENT SOURCE TARGETS, the pure half (decision-maker rulings, Oct 10, 2026 — SS-1 ruling 2;
 * ledger `2026-10-10-ss1a-registry-entry-sheet`; entry sheet docs/planning/ss-1-entry-sheet.md).
 *
 * A registry row (`content_sources`) says WHO a source is and what it covers. What the market-level
 * refresh lane (SS-1b) actually fetches from it is CONFIG, not a column: `server/config/
 * content-source-targets.config.ts`, keyed by source id, a list of `{ label, url, need, anchor }`.
 * An operator is ONE row with several targets (one per line or station page); a temple is one row with
 * one target (brief §9). No migration.
 *
 *   · `anchor` is what a fetched fact attaches to:
 *       - `station` — a station slug, for `transport.local.last_service` (FD-3 places a last-service fact
 *         by its station's POINT; how a slug resolves to a point is SS-1b's, and no coordinate is typed here);
 *       - `place`   — a Google `place_id`, for `stop.hours` / `last_admission` (FD-3's cross-plan read
 *         matches an official fact to a plan's stop by place id only — `feasibilityFactsForTrip`).
 *   · `validateTargets` is the ONE check, read by the coverage report and the nightly census: a target
 *     naming a source id the registry does not hold FAILS LOUDLY (SS-1 ruling 2), as does a target whose
 *     need the row does not cover, whose url is off the row's own host, or whose anchor does not fit its need.
 *
 * No db: the registry rows are passed in.
 */
import { isContentNeedKey, sourceNeedStanding } from "./content-facts";

export type TargetAnchor =
  | { kind: "station"; slug: string }
  | { kind: "place"; placeId: string };

export interface ContentSourceTarget {
  /** What a human reads in the census ("Keihan Main Line — last trains, Gion-Shijo"). */
  label: string;
  /** The official page itself, on the source's own host. */
  url: string;
  /** A need or a named sub-need the source's row covers. */
  need: string;
  anchor: TargetAnchor;
}

export type ContentSourceTargets = Record<string, readonly ContentSourceTarget[]>;

/** The needs a station anchor answers; every other need takes a place anchor. */
export const STATION_ANCHORED_NEEDS = ["transport.local.last_service"] as const;

const STATION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export interface RegistryRowForTargets {
  id: string;
  homepage: string | null;
  covers: readonly unknown[] | null;
  doesNotCover: readonly unknown[] | null;
}

export type TargetProblem =
  | { sourceId: string; problem: "unknown_source" }
  | { sourceId: string; index: number; problem: "bad_url" | "off_host" | "unknown_need" | "need_not_covered" | "bad_anchor" | "anchor_need_mismatch" | "no_label" };

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** Is `host` the row's own host or a subdomain of it (www2.city.kyoto.lg.jp under city.kyoto.lg.jp)? */
function onHost(host: string, home: string): boolean {
  return host === home || host.endsWith(`.${home}`);
}

/** Pure. Every problem with the config against the registry; an empty list is a clean config. */
export function validateTargets(config: ContentSourceTargets, rows: readonly RegistryRowForTargets[]): TargetProblem[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const out: TargetProblem[] = [];
  for (const [sourceId, targets] of Object.entries(config)) {
    const row = byId.get(sourceId);
    if (!row) {
      out.push({ sourceId, problem: "unknown_source" });
      continue;
    }
    const home = hostOf(row.homepage);
    targets.forEach((t, index) => {
      if (!t.label || !t.label.trim()) out.push({ sourceId, index, problem: "no_label" });
      const host = hostOf(t.url);
      if (!host) out.push({ sourceId, index, problem: "bad_url" });
      else if (!home || !onHost(host, home)) out.push({ sourceId, index, problem: "off_host" });
      if (!isContentNeedKey(t.need)) out.push({ sourceId, index, problem: "unknown_need" });
      else if (!["covers", "partial"].includes(sourceNeedStanding(row, t.need))) out.push({ sourceId, index, problem: "need_not_covered" });
      const a = t.anchor as TargetAnchor | undefined;
      const wellFormed =
        (a?.kind === "station" && STATION_SLUG.test(a.slug ?? "")) || (a?.kind === "place" && PLACE_ID.test(a.placeId ?? ""));
      if (!wellFormed) out.push({ sourceId, index, problem: "bad_anchor" });
      else {
        const wantsStation = (STATION_ANCHORED_NEEDS as readonly string[]).includes(t.need);
        if (wantsStation !== (a!.kind === "station")) out.push({ sourceId, index, problem: "anchor_need_mismatch" });
      }
    });
  }
  return out;
}

/** One line per problem, for the report and the job log. */
export function targetProblemLine(p: TargetProblem): string {
  return "index" in p ? `${p.sourceId}[${p.index}]: ${p.problem}` : `${p.sourceId}: ${p.problem} — no content_sources row has this id`;
}
