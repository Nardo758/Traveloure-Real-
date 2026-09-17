/**
 * THE MODEL'S OUTPUT IS UNTRUSTED INPUT — this is the ONE place it is admitted and sanitised.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-50** = A, tightened five ways; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 41 (c), Locked Decision 42 D3,
 *  Locked Decision 45 (3), §8, §13, §14, §18 rule 1, §19.)
 *
 * ── WHY A SCHEMA HERE WHEN `planProposalCreateSchema` DELIBERATELY HAS NONE ──────────────────
 * `shared/schema.ts`'s pick-based admission schema says out loud that it does **not** re-parse the
 * jsonb change set, *"it is NOT re-parsed here into a second, narrower authority on that shape
 * (§18 rule 1)"*. That rule is about rows already STORED: the column stays permissive so a later
 * shape is not a publish-time push failure, and a reader that cannot understand a stored row says
 * so rather than guessing.
 *
 * **THIS IS A DIFFERENT JOB.** What is parsed here is not a stored row — it is text a MODEL
 * produced, from a prompt that itself contained catalog listing titles a provider wrote (D-50 d:
 * *"listing text from the catalog is UNTRUSTED model input; the `.strict()` change-set schema plus
 * id validation is the containment"*). So the authority relationship runs one way and only one way:
 * `PlanProposalChangeSet` in `shared/plan-proposals.ts` is the TYPE OF RECORD, and everything below
 * is derived to match it — never the other way round. A field added there and not here is admitted
 * by nothing, which is the §19 posture (an allowlist, so a new field is unreachable until someone
 * deliberately names it) rather than a drift.
 *
 * ── THE FIVE BINDINGS D-50 PUTS ON THIS FILE ────────────────────────────────────────────────
 * **(a) NO NUMBER THE MODEL PRODUCED IS EVER PERSISTED.** Every `estimatedCost` the model emits is
 *     DISCARDED and re-derived from the catalog row's own price. An addition that names no catalog
 *     row carries NO price at all — omitted, never `$0` (§13: "the source did not state one" is a
 *     different fact from "it is free", and only one of them is true).
 * **(b) `providerServiceId` IS VALIDATED AT CREATE**, against the catalog the server itself
 *     resolved for THIS trip, and an invalid one **DROPS that addition from the change set** — it
 *     does not fail the whole ask. A proposal that names a listing the traveler cannot book is a
 *     plan the platform was never going to make.
 * **(d) THE `.strict()` PARSE IS THE CONTAINMENT.** An unknown key is a REFUSAL, not a silent
 *     strip: a model emitting a field nobody defined is a signal, and swallowing it is how an
 *     injected instruction reaches a writer that happens to spread its input later.
 * **(e) NOTHING FROM `fee_bands`** — no commission, no share, no split, no band — is in the model's
 *     input, so no such field exists to admit here either. There is deliberately no key on this
 *     schema that could carry one.
 * Clause **(c)** (the staleness window) is not this file's: it is enforced at apply, in
 * `server/config/proposal-staleness.config.ts` and the apply path.
 *
 * ── LD 42 D3: THE PROTECTED SET IS AN ARGUMENT, NEVER A QUESTION ASKED HERE ──────────────────
 * D3 forbids a THIRD expression of "is this expert work?" — the two that exist are
 * `itineraryItemIsExpertWork` (row-level, `shared/itinerary-item-expert.ts`) and
 * `itineraryItemNotExpertWork()` (WHERE-clause, `server/services/itinerary-rebuild-guard.ts`), and
 * `server/__tests__/expert-work-protected.test.ts` pins them agreeing. So this module takes the
 * PROTECTED ID SET as an input and asks no such question of its own. It is pure: no `db`, no
 * `storage`, no Stripe, no network — which is what lets it be proven in CI with no database.
 *
 * ── THE APPLY'S OWN REFUSALS STAY ────────────────────────────────────────────────────────────
 * Filtering a protected `replaces` out here is the §13 half of the rule (a traveler must not read
 * "I'd swap your expert's restaurant" and then be refused). It is NOT a replacement for the apply's
 * refusal at `server/services/proposal-charge.service.ts` — that is the backstop and it stays.
 */
import { z } from "zod";
import type {
  PlanProposalAddition,
  PlanProposalChangeSet,
  PlanProposalReplacement,
} from "./plan-proposals";

/**
 * The shape a model answer may take. `.strict()` at BOTH levels: an unknown key on the change set
 * or on any addition/replacement is a parse failure, per D-50 (d).
 *
 * Bounds are shape checks, not claims. They cap what can be stored and what a surface has to
 * render; they do not assert that a value is correct. `estimatedCost` is admitted so that a
 * well-formed answer parses, and is then **thrown away** by `sanitizePlanProposalChangeSet` — the
 * parse must not be the place a model price survives.
 */
export const planProposalAdditionSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    dayNumber: z.number().int().min(1).max(365).optional(),
    startTime: z.string().max(10).optional(),
    endTime: z.string().max(10).optional(),
    location: z.string().max(300).optional(),
    // Admitted so a well-formed answer parses; DISCARDED by the sanitiser (D-50 a).
    estimatedCost: z.string().max(40).optional(),
    providerServiceId: z.string().max(100).optional(),
    reason: z.string().max(2000).optional(),
  })
  .strict();

export const planProposalReplacementSchema = z
  .object({
    itemId: z.string().min(1).max(100),
    reason: z.string().max(2000).optional(),
  })
  .strict();

export const planProposalChangeSetSchema = z
  .object({
    additions: z.array(planProposalAdditionSchema).max(50).optional(),
    replaces: z.array(planProposalReplacementSchema).max(50).optional(),
    notes: z.array(z.string().max(2000)).max(20).optional(),
    protectedNote: z.string().max(2000).optional(),
  })
  .strict();

/** One catalog row, reduced to the two facts this module needs. */
export interface ProposalCatalogEntry {
  id: string;
  /**
   * The listing's own price, exactly as the catalog row states it. `null`/absent = the row states
   * no price, and the addition then carries none — never `$0` (§13).
   */
  price?: string | null;
}

export interface SanitizeChangeSetInput {
  /** The catalog the SERVER resolved for THIS trip (`loadOptimizerCatalog`). */
  catalog: ProposalCatalogEntry[];
  /** Every `itinerary_items.id` on this trip. A `replaces` naming anything else is not this plan's. */
  tripItemIds: readonly string[];
  /**
   * The PROTECTED ids — resolved by the caller through the ONE existing pair of predicates
   * (`itineraryItemIsExpertWork` + `itineraryItemIsMoneyCommitted`). Never recomputed here (D3).
   */
  protectedItemIds: readonly string[];
}

/** What the sanitiser removed, so the caller can log it and a test can assert it. */
export interface SanitizeChangeSetReport {
  /** Additions dropped because `providerServiceId` named no catalog row for this trip (D-50 b). */
  droppedAdditionsUnknownService: number;
  /** Additions dropped because they carried no usable title. */
  droppedAdditionsNoTitle: number;
  /** `estimatedCost` values the model emitted that were discarded and NOT re-derived (D-50 a). */
  discardedModelPrices: number;
  /** Replacements dropped because they named a row that is not on this plan. */
  droppedReplacesNotOnPlan: number;
  /** Replacements dropped because they named PROTECTED work (LD 42 D3). */
  droppedReplacesProtected: number;
}

export interface SanitizeChangeSetResult {
  changeSet: PlanProposalChangeSet;
  report: SanitizeChangeSetReport;
}

/**
 * Parse a raw model answer with the `.strict()` schema above.
 *
 * Returns the parsed object, or `null` when it did not parse. The caller writes NO proposal row on
 * `null`: a half-understood answer sitting in the log as something the AI said is the §13 lie the
 * whole review-first posture exists to prevent.
 */
export function parsePlanProposalChangeSet(raw: unknown): PlanProposalChangeSet | null {
  const result = planProposalChangeSetSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data as PlanProposalChangeSet;
}

/**
 * Apply D-50 (a), (b) and LD 42 D3 to a PARSED change set. Pure.
 *
 * The order matters and is the ruling's: validate the id FIRST (an addition naming an unknown
 * listing is dropped entirely), then price from the catalog row — so a dropped addition can never
 * leave a price behind, and a surviving one can never carry a price the model chose.
 */
export function sanitizePlanProposalChangeSet(
  parsed: PlanProposalChangeSet,
  input: SanitizeChangeSetInput,
): SanitizeChangeSetResult {
  const catalogById = new Map<string, ProposalCatalogEntry>();
  for (const entry of input.catalog) {
    if (entry && typeof entry.id === "string" && entry.id !== "") catalogById.set(entry.id, entry);
  }
  const onPlan = new Set(input.tripItemIds);
  const protectedIds = new Set(input.protectedItemIds);

  const report: SanitizeChangeSetReport = {
    droppedAdditionsUnknownService: 0,
    droppedAdditionsNoTitle: 0,
    discardedModelPrices: 0,
    droppedReplacesNotOnPlan: 0,
    droppedReplacesProtected: 0,
  };

  const additions: PlanProposalAddition[] = [];
  for (const raw of parsed.additions ?? []) {
    const title = (raw.title ?? "").trim();
    if (title === "") {
      report.droppedAdditionsNoTitle += 1;
      continue;
    }

    // (b) — the id is validated against the catalog the SERVER resolved for this trip. An id the
    // catalog does not carry DROPS the addition; it does not fail the ask.
    let catalogEntry: ProposalCatalogEntry | undefined;
    if (raw.providerServiceId != null && raw.providerServiceId !== "") {
      catalogEntry = catalogById.get(raw.providerServiceId);
      if (!catalogEntry) {
        report.droppedAdditionsUnknownService += 1;
        continue;
      }
    }

    // (a) — the model's own price is DISCARDED, always, whether or not a catalog price replaces it.
    if (raw.estimatedCost != null && raw.estimatedCost !== "") report.discardedModelPrices += 1;
    const catalogPrice = (catalogEntry?.price ?? "").toString().trim();

    const cleaned: PlanProposalAddition = { title };
    if (raw.description) cleaned.description = raw.description;
    if (raw.dayNumber != null) cleaned.dayNumber = raw.dayNumber;
    if (raw.startTime) cleaned.startTime = raw.startTime;
    if (raw.endTime) cleaned.endTime = raw.endTime;
    if (raw.location) cleaned.location = raw.location;
    // §13: a price ONLY where the CATALOG ROW stated one. No catalog row, or a row with no price,
    // means the field is OMITTED — never `$0`, and never the model's number.
    if (catalogEntry && catalogPrice !== "") cleaned.estimatedCost = catalogPrice;
    if (catalogEntry) cleaned.providerServiceId = catalogEntry.id;
    if (raw.reason) cleaned.reason = raw.reason;
    additions.push(cleaned);
  }

  const replaces: PlanProposalReplacement[] = [];
  for (const raw of parsed.replaces ?? []) {
    const itemId = (raw.itemId ?? "").trim();
    if (itemId === "" || !onPlan.has(itemId)) {
      report.droppedReplacesNotOnPlan += 1;
      continue;
    }
    // LD 42 D3 — the protected set arrives as an ARGUMENT; this module asks no such question of
    // its own. Filtered BEFORE the row is written so the traveler never reads a swap the apply
    // would refuse.
    if (protectedIds.has(itemId)) {
      report.droppedReplacesProtected += 1;
      continue;
    }
    const cleaned: PlanProposalReplacement = { itemId };
    if (raw.reason) cleaned.reason = raw.reason;
    replaces.push(cleaned);
  }

  const changeSet: PlanProposalChangeSet = {};
  // §13 on the EMPTY states: an empty array is omitted rather than stored, so a reader is never
  // handed `additions: []` to interpret as "the AI considered additions and chose none". An absent
  // key is "nothing here"; two ways to say nothing is how a reader ends up guessing which was meant.
  if (additions.length > 0) changeSet.additions = additions;
  if (replaces.length > 0) changeSet.replaces = replaces;
  const notes = (parsed.notes ?? []).map((n) => n.trim()).filter((n) => n !== "");
  if (notes.length > 0) changeSet.notes = notes;
  const protectedNote = (parsed.protectedNote ?? "").trim();
  // An absent `protectedNote` means NOTHING WAS CLAIMED, which is not "nothing is protected". The
  // drawer says the former and never the latter (brief §4.2).
  if (protectedNote !== "") changeSet.protectedNote = protectedNote;

  return { changeSet, report };
}

/**
 * Every `providerServiceId` a stored change set names, deduplicated.
 *
 * Used by the apply's RE-VALIDATION (D-50 b: validated at create, re-validated at apply) and by the
 * staleness check, which only bites on a proposal that actually carries a catalog price. ONE
 * expression, two callers (§18 rule 1).
 */
export function changeSetProviderServiceIds(
  changeSet: PlanProposalChangeSet | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const addition of changeSet?.additions ?? []) {
    const id = addition?.providerServiceId;
    if (typeof id === "string" && id.trim() !== "") ids.add(id.trim());
  }
  return Array.from(ids);
}
