/**
 * SLIP FUNNEL EVENTS — the value sets, stated ONCE (docs/planning/slip-funnel-events.md §2
 * principle 9; ratified as design Sep 27, 2026). This file holds only what event 1 (§3.1, "plan
 * created", the existing `trip_created` / T2 row) needs today; the other twelve events add their
 * enums here when their lanes land, never in a second module (§18 rule 1).
 *
 * E1 — THE DOOR PROPERTY (Track A step A0, ledger `2026-09-28-a0-slice-spec`). The server cannot
 * observe which surface opened the ONE planning modal (Locked Decision 33), so the client names it
 * on the mint body as `entry: { door, occasionSource }`. Three rules bind it:
 *
 *   1. ADMITTED BY A `.strict()` PICK USED ONLY BY THE EVENT WRITER (§19). `tripMintEntrySchema`
 *      is parsed by `POST /api/trips` to build the funnel row's properties and for nothing else —
 *      it is never spread into the trip insert and no column stores it. An unknown key or a door
 *      outside the closed list fails the parse, and the EVENT then records nothing about the door;
 *      the trip still mints (an analytics field never fails the action, §15b).
 *   2. CLIENT-SUPPLIED AND LABELLED SO. `door` and `occasionSource` are the client's word, carried
 *      as such in the property names' documentation; the actor stays the session (§14).
 *   3. §13 — NOTHING IS INVENTED. A client that sends no `entry` records nothing: the properties
 *      are OMITTED, never `none` and never a guessed door. `none` is a real answer ("the traveler
 *      reached the finish without naming an occasion"), distinct from "not recorded".
 *
 * Doc §7 Q2's default is followed: a door not in this list sends nothing. The list was extended ONCE by
 * the decision-maker, doc first (§3.1 amendment, ledger `2026-09-28-landing-doors`): billboard,
 * event_strip, events_page.
 */
import { z } from "zod";

/** The closed door list (slip-funnel-events.md §3.1). Adding one is a doc amendment first. */
export const PLAN_DOORS = [
  "hero",
  "start_events",
  "marketplace",
  "moment",
  "nav_occasion",
  "experience_cta",
  "city_grid",
  "trip_strip_edit",
  "concierge",
  "pricing_ladder",
  // Amended 2026-09-28 (slip-funnel-events.md §3.1; ledger `2026-09-28-landing-doors`): the
  // landing billboard tile, the landing events strip and the /events "Coming up" block.
  "billboard",
  "event_strip",
  "events_page",
  // Amended 2026-09-30 (slip-funnel-events.md §3.1; ledger `2026-09-30-blog-event-guide`): an event
  // post's "Start this plan" door.
  "blog_post",
  // Amended 2026-10-06 (slip-funnel-events.md §3.1; ledger `2026-10-06-step8a-experiences-entry`): the
  // /experiences start page's Continue (step 8 D4).
  "experiences",
  // Amended 2026-10-06 (slip-funnel-events.md §3.1; ledger `2026-10-06-event-page`; events-page
  // brief E3): an event's own page's "Plan around it".
  "event_detail",
] as const;
export type PlanDoor = (typeof PLAN_DOORS)[number];

/**
 * Where the plan's occasion answer came from (§3.1):
 *   door_prefilled — step 1 was skipped because the door's occasion resolved to a catalog row;
 *   asked          — step 1 was shown and the traveler picked an occasion;
 *   none           — the finish was reached with no occasion chosen.
 */
export const OCCASION_SOURCES = ["door_prefilled", "asked", "none"] as const;
export type OccasionSource = (typeof OCCASION_SOURCES)[number];

/**
 * WHICH FINISH MINTED THE PLAN (slip-funnel-events.md §3.1 amendment 2026-09-29, ledger
 * `2026-09-29-expert-door`). A door says where the traveler ENTERED the modal; the finish says which
 * way to build they chose at its end — two different facts, so a separate property, never a door
 * value (a plan that entered by the hero and finished with "Get a local expert" keeps both). Only the
 * three finishes that mint are listed; Save and the occasion finish send none.
 */
export const PLAN_FINISHES = ["myself", "ai", "local_expert"] as const;
export type PlanFinish = (typeof PLAN_FINISHES)[number];

/** The modal's branch → its finish value; a branch that does not mint has none. */
export function finishForBranch(branch: string): PlanFinish | null {
  if (branch === "myself") return "myself";
  if (branch === "ai") return "ai";
  if (branch === "local") return "local_expert";
  return null;
}

/** The mint body's event-only `entry` (§19 — `.strict()`: an extra key is refused, not stripped). */
export const tripMintEntrySchema = z
  .object({
    door: z.enum(PLAN_DOORS).optional(),
    occasionSource: z.enum(OCCASION_SOURCES).optional(),
    finish: z.enum(PLAN_FINISHES).optional(),
    // SH-1 Launch Q14.3/Q15.3 (ledger `2026-10-22-sh1-launch-pr5`): the `city_events.source_id` a plan is built around. The
    // mint looks it up to refuse an ended event and to clamp the start to the market's today; it is never stored on
    // the trip and never a funnel property.
    eventSourceId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type TripMintEntry = z.infer<typeof tripMintEntrySchema>;

export function isPlanDoor(value: unknown): value is PlanDoor {
  return typeof value === "string" && (PLAN_DOORS as readonly string[]).includes(value);
}

/**
 * The ONE derivation of `occasionSource` from what the modal knew at the finish. Pure.
 *   - `openedAtOccasionStep`: did `resolvePlanSteps` open this modal at step 1 (Occasion)?
 *   - `occasionChosen`: does the plan carry a resolved occasion at the finish?
 * Opened past step 1 with an occasion ⇒ the door (or the plan) pre-filled it; opened at step 1 with
 * one ⇒ asked; no occasion ⇒ none.
 */
export function deriveOccasionSource(input: {
  openedAtOccasionStep: boolean;
  occasionChosen: boolean;
}): OccasionSource {
  if (!input.occasionChosen) return "none";
  return input.openedAtOccasionStep ? "asked" : "door_prefilled";
}

/**
 * §3.14–3.15 (ledger `2026-10-18-teaser-copy-events`; decision-maker, Oct 18, 2026). Two client views of
 * the free plan's upgrade path, written through the ONE writer `recordSlipEvent`
 * (`server/services/slip-events.service.ts`) — ids and enums only, never text.
 *   · `slip_local_teaser_shown` — a FREE plan rendered at least one day's local teaser (FD-1/FD-5) on a
 *     surface; once per page view. `teaserDays` is the client's count of days carrying a teaser.
 *   · `slip_routed_legs_cta_tapped` — the traveler tapped the free plan's "Add drive and walk times"
 *     line (`LEAVE_BY_COPY.needsRoutedLegDoor`).
 */
export const SLIP_LOCAL_TEASER_SHOWN_EVENT = "slip_local_teaser_shown";
export const SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT = "slip_routed_legs_cta_tapped";
export const LOCAL_TEASER_SURFACES = ["slip", "trip_card"] as const;
export type LocalTeaserSurface = (typeof LOCAL_TEASER_SURFACES)[number];
export const ROUTED_LEGS_CTA_SURFACES = ["trip_card"] as const;
export type RoutedLegsCtaSurface = (typeof ROUTED_LEGS_CTA_SURFACES)[number];
/** The most days a plan can carry (the trip window's own ceiling is far below it). */
export const LOCAL_TEASER_MAX_DAYS = 60;

/** The `.strict()` bodies of the two events on `POST /api/trips/:tripId/slip-events` (§19). */
export const slipLocalTeaserShownBody = z
  .object({
    type: z.literal(SLIP_LOCAL_TEASER_SHOWN_EVENT),
    surface: z.enum(LOCAL_TEASER_SURFACES),
    teaserDays: z.number().int().min(1).max(LOCAL_TEASER_MAX_DAYS),
    viewId: z.string().min(1).max(64),
  })
  .strict();
export const slipRoutedLegsCtaTappedBody = z
  .object({
    type: z.literal(SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT),
    surface: z.enum(ROUTED_LEGS_CTA_SURFACES),
    viewId: z.string().min(1).max(64),
  })
  .strict();
export type SlipClientEvent = z.infer<typeof slipLocalTeaserShownBody> | z.infer<typeof slipRoutedLegsCtaTappedBody>;
