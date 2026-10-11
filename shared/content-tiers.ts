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
import { isPageReadOrigin } from "./content-facts";

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

/**
 * Ruling 9 — `itinerary_items.source_class`, server-stamped at creation, never client-settable. ONE
 * derivation (§18 rule 1), read by every item writer:
 *   · a local input produced it (an expert's work, a gem, a nugget, a Ready Made copy, an expert-recommended
 *     option) ⇒ `local`;
 *   · otherwise an item the traveler (or their assistant) added, or a draft built from public inputs ⇒ `public`;
 *   · an item whose origin the writer does not know ⇒ NULL (§13) — untagged, never guessed.
 */
export function itemSourceClass(input: {
  origin?: string | null;
  gemId?: string | null;
  fromLocalInput?: boolean;
}): SourceClass | null {
  if (input.fromLocalInput || input.origin === "expert" || (input.gemId != null && input.gemId !== "")) return "local";
  if (input.origin === "traveler" || input.origin === "assistant" || input.origin === "ai") return "public";
  return null;
}

/**
 * The tag pair a `place_facts` row is born with (ruling 1/2), from its origin and license. An expert-confirmed
 * nugget is ours and local; Places is display-in-plan; a crawled fact follows the license mapping, and an unknown
 * license on a crawled fact is link-only, as migration 362 backfills it. Any other origin has no ruled tag ⇒ null.
 */
export function placeFactTags(
  origin: string | null | undefined,
  license: string | null | undefined,
  factType?: string | null,
): { sourceClass: SourceClass; reuseClass: ReuseClass } | null {
  // FD-3 rulings 1/3 (ledger `2026-10-10-fd3-feasibility`): a feasibility fact is public + link_only whoever
  // wrote it — an expert citing an official page writes the official fact, not a local note.
  if ((factType === "last_admission" || factType === "last_service") && (isPageReadOrigin(origin) || origin === "expert_nugget") && license === "official") {
    return { sourceClass: "public", reuseClass: "link_only" };
  }
  if (origin === "expert_nugget") return { sourceClass: "local", reuseClass: "reusable" };
  if (origin === "places_api") return { sourceClass: "public", reuseClass: "display_in_plan" };
  // SS-1b: the market-level official refresh is tagged exactly as an official crawl (`isPageReadOrigin`).
  if (isPageReadOrigin(origin)) return { sourceClass: "public", reuseClass: reuseClassForLicense(license) === "display_in_plan" ? "display_in_plan" : license === "partner" ? "internal" : "link_only" };
  return null;
}

/** "Traveloure team" — only on a row a person on the team seeded; never on machine output (ruling 3). */
export const TEAM_AUTHOR_LABEL = "Traveloure team";

/**
 * FD-2 ruling 9 (ledger `2026-10-09-fd2-content-tier-tags`): stamp `itinerary_items.source_class` on a row
 * about to be INSERTED, from the server's own facts — the row's `origin` and `gemId` and the writer's
 * `fromLocalInput` — through the ONE derivation `itemSourceClass` (§18 rule 1). Any client-supplied value
 * was already removed by the storage strip (`stripItineraryItemRoutingFields`) or never accepted by the writer; an origin the writer does not know stays NULL.
 */
export function stampItemSourceClass<T extends Record<string, unknown>>(row: T, opts: { fromLocalInput?: boolean } = {}): T {
  const { sourceClass: _ignored, ...rest } = row as Record<string, unknown>;
  const stamped = itemSourceClass({
    origin: (rest.origin as string | null | undefined) ?? null,
    gemId: (rest.gemId as string | null | undefined) ?? null,
    fromLocalInput: opts.fromLocalInput,
  });
  return { ...rest, sourceClass: stamped } as unknown as T;
}


/**
 * The tags a GEM is born with (FD-2; ledger `2026-10-09-fd2-content-tier-tags`). Three writers, three shapes:
 *   · a gem a person on the team SEEDED ⇒ local, reusable, "Traveloure team", verified at insert;
 *   · a gem an EXPERT curated (nugget promotion, a curated seed) ⇒ local, reusable, verified BY that expert;
 *   · an AI-written gem ⇒ NOTHING (ruling 3) — it stays out of every draft until a person verifies it
 *     (`gemVerificationTags`, which makes the verifier its author).
 */
export function teamSeededGemTags(now: Date = new Date()) {
  return { sourceClass: "local" as const, reuseClass: "reusable" as const, authorLabel: TEAM_AUTHOR_LABEL, verifiedAt: now };
}

export function curatedGemTags(expertUserId: string, now: Date = new Date()) {
  return { sourceClass: "local" as const, reuseClass: "reusable" as const, verifiedBy: expertUserId, verifiedAt: now };
}

/** Ruling 3: verifying an untagged gem makes the verifier its author — never "Traveloure team". */
export function gemVerificationTags(verifierUserId: string, now: Date = new Date()) {
  return { sourceClass: "local" as const, reuseClass: "reusable" as const, verifiedBy: verifierUserId, verifiedAt: now, authorLabel: null };
}

/** An expert's own nugget: local, ours, verified at the moment the expert wrote it (as migration 362 backfills). */
export function expertNuggetTags(now: Date = new Date()) {
  return { sourceClass: "local" as const, reuseClass: "reusable" as const, verifiedAt: now };
}

/** Seasons and neighbourhood descriptions are public (ruling 4) and ours to reuse. */
export const PUBLIC_REUSABLE_TAGS = { sourceClass: "public" as const, reuseClass: "reusable" as const };

/**
 * A `plan_options` row's source class (FD-2). An incumbent carries its item's own class; an option an expert
 * recommended or added is a local input; anything else the traveler, their assistant or a public catalog
 * put there is public.
 */
export function optionSourceClass(input: {
  sourceKind?: string | null;
  incumbentSourceClass?: string | null;
  expertRecommendedBy?: string | null;
  addedByRole?: string | null;
}): SourceClass | null {
  if (input.sourceKind === "incumbent") return isSourceClass(input.incumbentSourceClass) ? input.incumbentSourceClass : null;
  if (input.expertRecommendedBy || input.addedByRole === "expert") return "local";
  return "public";
}
