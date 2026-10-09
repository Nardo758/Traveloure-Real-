/**
 * FD-2 — CONTENT TIERS, the pure half (decision-maker rulings, Oct 9, 2026; ruling doc
 * `content-tiers-ruling.md` rev 1; Phase 0 `docs/planning/briefs/fd-content-tiers-phase0.md` §B/§D).
 *
 * The value sets and the rules every reader and writer of the content envelope calls — stated ONCE
 * (§18 rule 1). No db, no schema: the columns these values live in arrive with migrations 361/362,
 * which are HELD for the founder; nothing here reads or writes them yet.
 *
 *   · `source_class` — `public | local`. A row with NO source class is UNTAGGED, and an untagged row
 *     never reaches a draft (ruling 3: AI-written gems stay untagged until a person verifies them).
 *   · `reuse_class` — `display_in_plan | link_only | internal | reusable`, a NEW column beside the
 *     existing `license` / `license_class` (ruling 1). The license value keeps its own job.
 *   · Official-source facts are `public` + `link_only` by default (ruling 2); an official source whose
 *     terms say otherwise is a later per-source admin override, never decided here.
 */

export const SOURCE_CLASSES = ["public", "local"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const REUSE_CLASSES = ["display_in_plan", "link_only", "internal", "reusable"] as const;
export type ReuseClass = (typeof REUSE_CLASSES)[number];

export function isSourceClass(v: unknown): v is SourceClass {
  return typeof v === "string" && (SOURCE_CLASSES as readonly string[]).includes(v);
}

export function isReuseClass(v: unknown): v is ReuseClass {
  return typeof v === "string" && (REUSE_CLASSES as readonly string[]).includes(v);
}

/**
 * Admission for a writer that stamps a tag pair. An unknown value is REFUSED by name, never dropped
 * or coerced (§13). `reuseClass` is required whenever a source class is given: a half-tagged row is
 * not a tagged row.
 */
export function admitTag(
  sourceClass: unknown,
  reuseClass: unknown,
): { ok: true; sourceClass: SourceClass; reuseClass: ReuseClass } | { ok: false; refused: string[] } {
  const refused: string[] = [];
  if (!isSourceClass(sourceClass)) refused.push(`source_class:${String(sourceClass)}`);
  if (!isReuseClass(reuseClass)) refused.push(`reuse_class:${String(reuseClass)}`);
  return refused.length ? { ok: false, refused } : { ok: true, sourceClass: sourceClass as SourceClass, reuseClass: reuseClass as ReuseClass };
}

/**
 * Ruling 1's fixed mapping, from the EXISTING license vocabulary (`official | editorial | partner |
 * restricted`, `shared/content-facts.ts`) to the default reuse class. An unknown or absent license has
 * NO default — null, never a guessed class (§13).
 */
const REUSE_FOR_LICENSE: Record<string, ReuseClass> = {
  restricted: "display_in_plan", // Google Places: shown in the plan with attribution, never reused (LD 57)
  official: "link_only", // ruling 2: JNTO-type / an official site — link only unless its terms say otherwise
  editorial: "link_only", // attributed quote + link; never republished
  partner: "internal", // partner content stays server-side (§16)
};

export function reuseClassForLicense(license: string | null | undefined): ReuseClass | null {
  return license && Object.prototype.hasOwnProperty.call(REUSE_FOR_LICENSE, license) ? REUSE_FOR_LICENSE[license] : null;
}

/** Judgment (what is worth doing, how) follows local; every other fact type is a hard fact. */
const JUDGMENT_FACT_TYPES = new Set(["description", "tip"]);

export function isJudgmentFact(factType: string | null | undefined): boolean {
  return !!factType && JUDGMENT_FACT_TYPES.has(factType);
}

/** The smallest shape the precedence and liveness rules read. */
export interface TierCandidate {
  sourceClass: string | null | undefined;
  /** The existing license value; `official` marks an official source. */
  license?: string | null;
  expiresAt?: Date | string | null;
}

/** Hard facts: official > local > aggregator. Judgment: local > official > aggregator. Lower reads first. */
export function precedenceRank(c: TierCandidate, factType: string | null | undefined): number {
  const official = c.license === "official";
  const local = c.sourceClass === "local";
  if (isJudgmentFact(factType)) return local ? 0 : official ? 1 : 2;
  return official ? 0 : local ? 1 : 2;
}

/**
 * Orders candidates for one fact by the ruling's precedence, stably. UNTAGGED candidates are dropped
 * first — an untagged row is never an answer (ruling 3).
 */
export function resolveFactPrecedence<T extends TierCandidate>(candidates: readonly T[], factType: string | null | undefined): T[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => isSourceClass(c.sourceClass))
    .sort((a, b) => precedenceRank(a.c, factType) - precedenceRank(b.c, factType) || a.i - b.i)
    .map(({ c }) => c);
}

function toTime(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Ruling 8: an expired LOCAL item is hidden at build time — never deleted, no status column. A local
 * note that QUOTES an official fact expires with that fact (`quotedOfficialExpiresAt`). A public row is
 * not subject to this rule. A NULL `expires_at` is "no expiry stated" and stays live (§13).
 */
export function isLiveLocal(
  row: TierCandidate & { quotedOfficialExpiresAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (row.sourceClass !== "local") return true;
  const n = now.getTime();
  const own = toTime(row.expiresAt);
  if (own !== null && own <= n) return false;
  const quoted = toTime(row.quotedOfficialExpiresAt);
  if (quoted !== null && quoted <= n) return false;
  return true;
}

/** May this row reach ANY draft? Tagged, and live if local. Untagged ⇒ never (ruling 3). */
export function isDraftEligible(row: TierCandidate & { quotedOfficialExpiresAt?: Date | string | null }, now: Date = new Date()): boolean {
  return isSourceClass(row.sourceClass) && isLiveLocal(row, now);
}

/** May this row reach the FREE draft (the two free rails and quick-start — ruling 5)? Public only. */
export function isFreeDraftEligible(row: TierCandidate, now: Date = new Date()): boolean {
  return row.sourceClass === "public" && isDraftEligible(row, now);
}
