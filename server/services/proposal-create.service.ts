/**
 * proposal-create.service.ts — THE ASK, END TO END: read the plan live, call the model once,
 * sanitise what comes back, write ONE proposal row.
 *
 * (decision-maker rulings 2026-09-16, punchlist **D-45..D-50**; ledger
 *  `2026-09-16-l16-rulings-d45-d50`, built by `2026-09-16-l16-lane1b-model-call`. Design of
 *  record: `docs/lane-reports/2026-09-16-l16-lane1-create-rail.md` §4, which the decision-maker
 *  read and accepted BEFORE this file existed. Brief: `docs/design/ASK_AI_DRAWER_BRIEF.md` §4.
 *  CLAUDE.md Locked Decision 41 (b)/(c), Locked Decision 42 D3/D4, Locked Decision 45 (3), §8,
 *  §13, §14, §18 rule 1, §19. **No schema change, no migration.**)
 *
 * ── WHAT THIS FILE IS AND IS NOT ────────────────────────────────────────────────────────────
 * It is the ONE consumer of five things that already existed and are NOT re-implemented here
 * (§18 rule 1): `loadOptimizerCatalog` (the one catalog read), `itineraryItemIsExpertWork` +
 * `itineraryItemIsMoneyCommitted` (the one protected-set pair — Locked Decision 42 D3 forbids a
 * third expression), `decideAiDraftEligibility` (the one "is this plan empty?" answer),
 * `parsePlanProposalChangeSet` + `sanitizePlanProposalChangeSet` (the one admission of model
 * output), `callAiTaskModel` (the one model call) and `trackAnthropicResponse` (the one cost row).
 *
 * **IT PERFORMS NO AUTHORIZATION.** The ROUTE runs `authorizeTripLogistics(..., requireWriteAccess)`
 * before calling in, and §14 holds there: the asker is the SESSION and the plan is the PATH's.
 * This function takes both as parameters and must never be called with an unauthorized trip.
 *
 * **IT TAKES NO CLAIM AND TOUCHES NO MONEY.** Asking is free (D-21); the charge point is the
 * APPLY and it is a different file. Nothing here reads a fee band, a price band or Stripe.
 *
 * **IT IS NOT A SECOND FREE-DRAFT RAIL** (Locked Decision 41 (b)). It calls no
 * `saveGeneratedItinerarySnapshot` and performs no rebuild delete — it writes ONE jsonb row — so
 * `check-ai-draft-eligibility`'s predicate correctly does not reach it. Do not add either call.
 *
 * ── THE FAILURE PATHS ARE §4.4's TABLE, VERBATIM ────────────────────────────────────────────
 *   model returned a usable change set  → row WRITTEN, cost row written, `ok: true`
 *   model ERRORED, SDK surfaced usage   → NO row, cost row WRITTEN (attributable, D-46 (i))
 *   model errored, NO usage available   → NO row, NO cost row, and the LOG SAYS WHY (§13 — a
 *                                          fabricated token count is worse than a missing row)
 *   output failed the `.strict()` parse → NO row, cost row written if usage exists
 * The in-flight marker and the rate limits are the ROUTE's, taken before this is called and
 * released in its `finally` — this function neither takes nor releases them.
 *
 * ── AN EMPTY CHANGE SET IS STILL AN ANSWER, AND IS STILL WRITTEN ────────────────────────────
 * §4.4's table refuses a row for exactly two reasons: a model error and a parse failure. A model
 * that parsed cleanly and proposed nothing is neither — the traveler asked, and "nothing to
 * change here" is the answer they got. The row is written with whatever survived (typically the
 * model's own `notes`), and NO summary is invented for it: `PlanProposalChangeSet` has no summary
 * field, and adding one to make an empty answer read better would be words nobody said (§13,
 * Locked Decision 42 D4's false-attribution line one step further out).
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  experienceTypes,
  itineraryItems,
  tripDestinations,
  trips,
  userExperiences,
} from "@shared/schema";
import { itineraryItemIsExpertWork } from "@shared/itinerary-item-expert";
import { itineraryItemIsMoneyCommitted } from "@shared/itinerary-item-money";
import {
  parsePlanProposalChangeSet,
  sanitizePlanProposalChangeSet,
  type SanitizeChangeSetReport,
} from "@shared/plan-proposal-changeset";
import type { PlanProposalChangeSet } from "@shared/plan-proposals";
import type { PlanProposal } from "@shared/schema";
import { decideAiDraftEligibility } from "./ai-draft-eligibility.pure";
import { loadOptimizerCatalog } from "./optimizer-baseline.service";
import { trackAnthropicResponse } from "./ai-cost-tracker";
import { resolveAiTaskModel } from "../config/ai-task-model";
import {
  AiTaskModelError,
  callAiTaskModel,
  type AiTaskModelResult,
} from "./ai-task-model-client";
import {
  buildAiTaskPromptScope,
  planProposalChangeSetIsEmpty,
  renderAiTaskPrompt,
  type AiTaskPromptScope,
} from "./ai-task-prompt";
import { createPlanProposal } from "./plan-proposals.service";

export interface CreateProposalFromAskParams {
  /** The PRE-MINTED id (D-46 (i)) — minted by the route before the marker, and the `requestId`
   *  every cost row this call writes carries, whether or not a proposal row is ever written. */
  proposalId: string;
  tripId: string;
  /** The SESSION asker (§14). Spend is attributed to whoever caused it, never to the plan's owner
   *  — an advisor's ask is the advisor's spend (D-47). */
  askerUserId: string;
  question: string;
}

/** Why an ask produced no proposal. The route maps these to a status and a stated reason (§13). */
export type CreateProposalFailureReason =
  /** The plan the path named is not there. */
  | "trip_not_found"
  /** The model could not be reached or refused. */
  | "model_call_failed"
  /** This deployment has no model configured. */
  | "model_unavailable"
  /** The answer did not survive the `.strict()` parse — including a truncated one. */
  | "model_output_unusable";

export type CreateProposalResult =
  | {
      ok: true;
      proposal: PlanProposal;
      /** What the sanitiser removed. Logged; never shown to the traveler as a number. */
      report: SanitizeChangeSetReport;
      /** True when the model proposed nothing at all. The row is written either way. */
      empty: boolean;
    }
  | { ok: false; reason: CreateProposalFailureReason; detail: string };

/** Test seam, the `applyPlanProposal` precedent (ledger `2026-09-16-l16-lane1-review-fixes`):
 *  injected dependencies, so the suite drives the real function with a stubbed model. Never
 *  supplied in production. */
export interface CreateProposalDeps {
  callModel?: typeof callAiTaskModel;
  trackCost?: typeof trackAnthropicResponse;
}

/**
 * ONE JSON object is what the model was asked for, and `JSON.parse` is what reads it. The only
 * tolerance is a single markdown fence, because a model that wraps its answer in ```json has
 * still answered.
 *
 * Deliberately NOT a shared helper with `server/itinerary-optimizer.ts`'s module-private
 * `extractJSON`: that one is shaped for a different product's multi-section answers, and exporting
 * it would make one product's tolerance the other's contract — the coupling §18 rule 1 names, in
 * the direction nobody looks. Anything this does not read is a parse failure, which is a REFUSAL
 * and never a silent strip (D-50 d).
 */
function readOneJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Read the plan LIVE and build the model's whole input scope.
 *
 * "Live" is Locked Decision 32's own rule for the expert workspace — *"slip content is NEVER
 * copied into the jsonb — the workspace reads the trip LIVE"* — applied to the machine reader:
 * nothing here comes from a client-supplied snapshot, and the only client value in the whole scope
 * is the traveler's own question.
 */
async function loadAskScope(
  tripId: string,
  question: string,
): Promise<{ scope: AiTaskPromptScope; tripItemIds: string[]; protectedItemIds: string[] } | null> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return null;

  // EVERY row on the plan, in the plan's own order — no routing-status filter. The optimizer's own
  // loader excludes `with_expert` by contract; this is a different question ("what is on this
  // plan?") and hiding a row from the model would produce a proposal that talks past it.
  const itemRows = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.createdAt));

  // The plan's events (Locked Decision 29), with the occasion's slug so it can be resolved EXACTLY.
  const eventRows = await db
    .select({ event: userExperiences, occasionSlug: experienceTypes.slug })
    .from(userExperiences)
    .leftJoin(experienceTypes, eq(userExperiences.experienceTypeId, experienceTypes.id))
    .where(eq(userExperiences.tripId, tripId))
    .orderBy(asc(userExperiences.eventDate), asc(userExperiences.startTime), asc(userExperiences.createdAt));

  const stopRows = await db
    .select()
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId))
    .orderBy(asc(tripDestinations.position));

  // Locked Decision 42 D1's OWN RULE, server side: the occasion resolves only when the plan's
  // events AGREE on one `experience_type_id`. Events that disagree, or that name none, resolve
  // NOTHING — the field is omitted rather than filled with the nearest-looking row (§13).
  // `trips.experience_type_id` (D1, wave 3) is not on `main`, so nothing here reads it.
  let occasionSlug: string | null = null;
  if (eventRows.length > 0) {
    const typeIds = new Set(eventRows.map((r) => r.event.experienceTypeId));
    if (typeIds.size === 1) occasionSlug = eventRows[0].occasionSlug ?? null;
  }

  // Locked Decision 42 D3 — the protected set, from the ONE existing pair of predicates.
  const marked = itemRows.map((row) => ({
    id: row.id,
    title: row.title,
    dayNumber: row.dayNumber,
    startTime: row.startTime,
    endTime: row.endTime,
    locationName: row.locationName,
    description: row.description,
    isExpertWork: itineraryItemIsExpertWork(row),
    isMoneyCommitted: itineraryItemIsMoneyCommitted(row),
  }));

  // D-50 — the catalog is `loadOptimizerCatalog` ONLY (no second catalog read) and is for the
  // PAID task only. Which ask is the paid one is the ONE existing empty-plan predicate: Locked
  // Decision 41 (b) gives an EMPTY slip to the free draft and Locked Decision 41 (c) rules that
  // the free sketch runs with **no live catalog pricing**, so an ask on a plan holding nothing
  // gets no catalog and the prompt says so. A plan that HOLDS items is the paid task and gets one.
  // A second "is this plan empty?" test written here is the drift §18 rule 1 names.
  const eligibility = decideAiDraftEligibility(tripId, itemRows.length);
  const catalog = eligibility.eligible
    ? null
    : await loadOptimizerCatalog(trip.destination);

  const scope = buildAiTaskPromptScope({
    question,
    trip: {
      destination: trip.destination,
      startDate: String(trip.startDate),
      endDate: String(trip.endDate),
      adults: trip.adults,
      kids: trip.kids,
      timezone: trip.timezone,
      eventType: trip.eventType,
    },
    occasionSlug,
    items: marked,
    events: eventRows.map((r) => ({
      id: r.event.id,
      title: r.event.title,
      eventDate: r.event.eventDate,
      startTime: r.event.startTime,
      location: r.event.location,
    })),
    stops: stopRows.map((s) => ({
      position: s.position,
      name: s.name,
      city: s.city,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
    })),
    catalog: catalog
      ? catalog.map((row) => ({
          id: row.id,
          serviceName: row.serviceName,
          serviceType: row.serviceType,
          location: row.location,
          price: row.price,
        }))
      : null,
    ...(catalog ? {} : { catalogOmittedReason: "empty_plan_defers_to_free_draft" as const }),
  });

  return {
    scope,
    tripItemIds: itemRows.map((r) => r.id),
    protectedItemIds: marked.filter((m) => m.isExpertWork || m.isMoneyCommitted).map((m) => m.id),
  };
}

/**
 * THE ASK. One model call, one row, one cost row.
 */
export async function createProposalFromAsk(
  params: CreateProposalFromAskParams,
  deps: CreateProposalDeps = {},
): Promise<CreateProposalResult> {
  const callModel = deps.callModel ?? callAiTaskModel;
  const trackCost = deps.trackCost ?? trackAnthropicResponse;

  const loaded = await loadAskScope(params.tripId, params.question);
  if (!loaded) {
    return { ok: false, reason: "trip_not_found", detail: "the plan does not exist" };
  }
  const prompt = renderAiTaskPrompt(loaded.scope);

  // D-47 — the cost row, through the EXISTING `trackAnthropicResponse` (§18 rule 1, one more
  // caller): `sourceType: "ai_task"`, `userId` = the SESSION asker, `requestId` = the PRE-MINTED
  // proposal id. Called on the success path AND on the error path that surfaced usage; never
  // called with a usage nobody reported. AWAITED: a reader that arrives right after the response
  // must find the row, so the response never precedes the cost record.
  const writeCostRow = async (usage: { input_tokens: number; output_tokens: number }, model: string) => {
    await trackCost(
      { usage, model },
      { sourceType: "ai_task", userId: params.askerUserId, requestId: params.proposalId },
    );
  };

  let result: AiTaskModelResult;
  try {
    result = await callModel({ system: prompt.system, user: prompt.user });
  } catch (err: any) {
    const modelId = err instanceof AiTaskModelError ? err.model ?? resolveAiTaskModel() : resolveAiTaskModel();
    if (err instanceof AiTaskModelError && err.usage) {
      await writeCostRow(err.usage, modelId);
    } else {
      // §13 — THE HONEST RECORD IS NO ROW, AND THE LOG SAYS WHY. `trackAnthropicResponse` returns
      // early without usage, so inventing one here is the only way a row could exist — and a
      // fabricated token count is worse than a missing row. The proposal id is named so the gap
      // in `ai_cost_tracking` is reconcilable rather than a silence.
      console.error(
        `[ai-task] model call failed with NO usage surfaced — writing no ai_cost_tracking row ` +
          `(proposal=${params.proposalId} trip=${params.tripId}): ${err?.message ?? err}`,
      );
    }
    const reason: CreateProposalFailureReason =
      err instanceof AiTaskModelError && err.code === "model_unavailable"
        ? "model_unavailable"
        : "model_call_failed";
    return { ok: false, reason, detail: err?.message ?? "the model call failed" };
  }

  if (result.usage) await writeCostRow(result.usage, result.model);

  // A truncated answer is unparseable JSON — reported as what it is rather than as a generic
  // parse failure (the optimizer's own posture). Either way NO row is written: a half-understood
  // answer sitting in the log as something the AI said is the §13 lie the whole review-first
  // posture exists to prevent.
  if (result.truncated) {
    console.error(
      `[ai-task] the model answer was truncated at max_tokens — no proposal row written ` +
        `(proposal=${params.proposalId} trip=${params.tripId})`,
    );
    return { ok: false, reason: "model_output_unusable", detail: "the answer was cut off" };
  }

  const parsed = parsePlanProposalChangeSet(readOneJsonObject(result.text));
  if (!parsed) {
    console.error(
      `[ai-task] the model answer failed the strict change-set parse — no proposal row written ` +
        `(proposal=${params.proposalId} trip=${params.tripId})`,
    );
    return { ok: false, reason: "model_output_unusable", detail: "the answer was not a usable change set" };
  }

  // D-50 (a)/(b) and Locked Decision 42 D3, in the ONE pure sanitiser: every model price is
  // discarded and re-derived from the catalog row, an addition naming a listing this trip's
  // catalog does not carry is DROPPED, and a `replaces` naming a protected row is filtered out
  // BEFORE the row is written. The protected set arrives as an ARGUMENT — this rail asks no
  // "is this expert work?" question of its own.
  const { changeSet, report } = sanitizePlanProposalChangeSet(parsed, {
    catalog: (loaded.scope.catalog ?? []).map((entry) => ({ id: entry.id, price: entry.price ?? null })),
    tripItemIds: loaded.tripItemIds,
    protectedItemIds: loaded.protectedItemIds,
  });

  const proposal = await createPlanProposal({
    id: params.proposalId,
    tripId: params.tripId,
    question: params.question,
    proposal: changeSet as unknown as PlanProposal["proposal"],
    // The tier is a COST RECORD ONLY (Locked Decision 41 (c)): the row may carry it, and no
    // surface may read it — no badge, and equally no degraded-quality disclaimer.
    modelTier: result.model,
    // `conversationId` is deliberately not set: D-45 = A, the drawer is STATELESS and every L16
    // ask names no thread. The `question` column plus the proposal log IS the thread.
  });

  return { ok: true, proposal, report, empty: planProposalChangeSetIsEmpty(changeSet as PlanProposalChangeSet) };
}

/** Exported for the suite only: the scope a question would build for a plan, with no model call.
 *  It is the same function the ask itself runs — a second scope builder for tests would prove the
 *  test's copy and nothing about the rail (§18 rule 1). */
export async function __buildAskScopeForTests(
  tripId: string,
  question: string,
): Promise<AiTaskPromptScope | null> {
  const loaded = await loadAskScope(tripId, question);
  return loaded?.scope ?? null;
}
