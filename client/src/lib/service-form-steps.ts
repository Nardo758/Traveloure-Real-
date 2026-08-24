/**
 * WAVE 2 / LANE A1 (S1+S3) — THE SERVICE-CREATION FLOW'S STEP SHAPE, AS DATA.
 *
 * ── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────────────────────────
 * Before this lane the wizard was FOUR FIXED STEPS ("What you offer" · "Details" · "Photos" ·
 * "Terms & requirements") for every listing, and the delivery method — the one answer that decides
 * what the rest of the form even means — was asked halfway down step 2. The ratified mock
 * (decision-maker, Aug 13 2026; `docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md` Gate G) inverts
 * that: **method is asked on step 1, and the step list is built from the answer.**
 *
 * A branching wizard has one failure mode that matters more than any other: a field that belongs
 * to no step in some branch becomes **unreachable** — the provider can neither see it nor fix it,
 * while the payload still carries whatever was stored. So the mapping is not written inline in a
 * 4,000-line component where nothing can check it. It lives here, as two total functions
 * (`flowForMethod`, `stepForSection`) over closed unions, and the unit test asserts the invariant
 * that matters: **every section resolves to a step that exists in every branch's flow.**
 *
 * ── WHAT IS NOT DECIDED HERE ─────────────────────────────────────────────────────────────────
 * VISIBILITY. `stepForSection` answers "if this section renders, WHICH step holds it" — never
 * "does it render". That stays with the shared predicates the form already uses
 * (`isPlaceAnchored` / `needsScheduling` from `@shared/service-fundamentals`, plus the
 * method-specific gates like `deliveryMethod === "pdf"`). Two authorities for one question is how
 * a section ends up rendered twice or never; this module deliberately owns only placement.
 *
 * ── THE RENAMES (mock, ratified in full) ─────────────────────────────────────────────────────
 * Map authoring becomes the flow's 4th step and takes the name **Logistics**, so the two steps
 * that used to share that vocabulary are renamed:
 *   old "Logistics" (timing, duration, cutoffs, booking rules) → **Scheduling**
 *   old "Group"     (party size / capacity)                    → **Capacity**
 */

/** The wizard's UI delivery vocabulary (`toCanonicalDelivery` maps these to the canonical 7). */
export type UiDeliveryMethod =
  | "in-person"
  | "video-call"
  | "hybrid"
  | "pdf"
  | "call"
  | "voice_notes"
  | "async_messaging";

/** A step in the flow. Which of these appear is decided by the delivery method. */
export type StepKey =
  | "basics"
  | "scheduling"
  | "capacity"
  | "logistics"
  | "online"
  | "session"
  | "artifact"
  | "asyncdet"
  | "review";

/**
 * A block of the form. Coarser than a field: the unit is "a card the provider recognises",
 * because that is the unit that moves between steps.
 */
export type SectionKey =
  // ── Basics (the fast path) ──
  | "offering" // the /earn offering picker + "start from a template"
  | "identity" // name, category, subcategory, pricing model + price, expert tier
  | "method" // delivery method + the languages it is delivered in
  | "description" // the one-line description
  // ── The branch's second step ──
  | "duration" // how long it takes / turnaround — temporal, so it follows the branch
  | "deliverable" // the pdf branch's file (upload or link)
  | "asyncNotice" // the async branch's honest "what is not captured yet" panel
  | "onlineHalf" // the hybrid branch's online half
  // ── Scheduled ──
  | "timing" // start window + timezone
  | "bookingRules" // change cutoff
  | "capacityFields" // party size min/max
  // ── Place-anchored ──
  | "place" // meeting point, the confirm-gated pin, neighborhoods, service area
  | "map" // the map canvas + route stops (ruling 22 replace-list)
  | "transport" // "Getting there": provision, pickup/drop-off, coverage, radius
  | "surcharge" // travel surcharge config
  // ── Everything that is the same in every branch ──
  | "whatIncluded"
  | "categoryFields"
  | "photos"
  | "bookingTerms"
  | "requirements"
  | "attestations"
  | "roleExtras";

/** The ratified branch shapes. Source: the mock's `METHODS` table, one line per method. */
export const FLOWS: Readonly<Record<UiDeliveryMethod, readonly StepKey[]>> = {
  "in-person": ["basics", "scheduling", "capacity", "logistics", "review"],
  hybrid: ["basics", "scheduling", "capacity", "logistics", "online", "review"],
  "video-call": ["basics", "session", "review"],
  call: ["basics", "session", "review"],
  pdf: ["basics", "artifact", "review"],
  voice_notes: ["basics", "asyncdet", "review"],
  async_messaging: ["basics", "asyncdet", "review"],
};

/** Short label — the step indicator. */
export const STEP_SHORT_TITLES: Readonly<Record<StepKey, string>> = {
  basics: "Basics",
  scheduling: "Scheduling",
  capacity: "Capacity",
  logistics: "Logistics",
  online: "Online half",
  session: "Session details",
  artifact: "What they get",
  asyncdet: "Async details",
  review: "Review & submit",
};

/** Full sentence — the card heading on the step itself. */
export const STEP_LONG_TITLES: Readonly<Record<StepKey, string>> = {
  basics: "Basics",
  scheduling: "Scheduling — timing, duration & booking rules",
  capacity: "Capacity — how many people",
  logistics: "Logistics — where it happens",
  online: "The online half",
  session: "Session details",
  artifact: "What they get",
  asyncdet: "Async delivery details",
  review: "Review & submit",
};

const PLACE_ANCHORED: ReadonlySet<UiDeliveryMethod> = new Set<UiDeliveryMethod>(["in-person", "hybrid"]);
const SCHEDULED_REMOTE: ReadonlySet<UiDeliveryMethod> = new Set<UiDeliveryMethod>(["call", "video-call"]);

/** An unknown/legacy value falls back to the in-person shape — the widest flow, so nothing a
 *  stored row carries can become unreachable because its method string was not recognised. */
export function flowForMethod(method: string): readonly StepKey[] {
  return FLOWS[method as UiDeliveryMethod] ?? FLOWS["in-person"];
}

/** The branch's SECOND step — "scheduling" | "session" | "artifact" | "asyncdet". Every flow has
 *  one, which is what makes it a safe home for a section whose branch-specific step is absent. */
export function detailsStepFor(method: string): StepKey {
  return flowForMethod(method)[1];
}

/**
 * WHICH STEP HOLDS THIS SECTION, for this method. Total by construction: a section whose natural
 * step is not in this branch's flow falls back to the branch's second step, so the result is
 * ALWAYS a step the flow contains (asserted by the unit test). Such a section is invariably one
 * the form's own visibility predicate suppresses anyway — the fallback exists so that a future
 * predicate change can never strand a card off the step list.
 */
export function stepForSection(section: SectionKey, method: string): StepKey {
  const placeAnchored = PLACE_ANCHORED.has(method as UiDeliveryMethod);
  const scheduledRemote = SCHEDULED_REMOTE.has(method as UiDeliveryMethod);
  const details = detailsStepFor(method);

  switch (section) {
    // The fast path — five answers, one screen, a resumable draft.
    case "offering":
    case "identity":
    case "method":
    case "description":
      return "basics";

    // Temporal / branch-shaped: always the branch's own second step.
    case "duration":
    case "deliverable":
    case "asyncNotice":
      return details;

    case "onlineHalf":
      return flowForMethod(method).includes("online") ? "online" : details;

    // Scheduled: place-anchored listings get named steps, remote sessions get one combined step.
    case "timing":
    case "bookingRules":
      return placeAnchored ? "scheduling" : scheduledRemote ? "session" : details;
    case "capacityFields":
      return placeAnchored ? "capacity" : scheduledRemote ? "session" : details;

    // Everything spatial — the ruling of Aug 12, 2026: ONE step, named Logistics.
    case "place":
    case "map":
    case "transport":
    case "surcharge":
      return placeAnchored ? "logistics" : details;

    // Branch-independent: the last step, which is also where the final action lives.
    case "whatIncluded":
    case "categoryFields":
    case "photos":
    case "bookingTerms":
    case "requirements":
    case "attestations":
    case "roleExtras":
      return "review";
  }
}

/** 1-based position of a step in this method's flow; 0 when the flow does not contain it. */
export function stepNumberOf(method: string, step: StepKey): number {
  return flowForMethod(method).indexOf(step) + 1;
}

/** 1-based position of the step that holds a section — what the "still needed" jump link uses. */
export function stepNumberForSection(section: SectionKey, method: string): number {
  return stepNumberOf(method, stepForSection(section, method));
}

/** Clamp a 1-based step number into this method's flow. Used when a method switch SHORTENS the
 *  flow under the provider's feet: they land on the last step of the new branch, never off it. */
export function clampStep(method: string, step: number): number {
  const length = flowForMethod(method).length;
  if (!Number.isFinite(step)) return 1;
  return Math.min(Math.max(Math.trunc(step), 1), length);
}

/**
 * THE BASICS FAST PATH (mock ②): the sections that make a one-screen resumable draft. Named here
 * so the test can hold the promise — "step 1 alone is enough to Save Draft" is only true while
 * these four sections all live on `basics`, and a draft save is check-free (see
 * `service-form-required.ts`: `missingRequiredForFinal` is consulted by the FINAL action only).
 */
export const FAST_PATH_SECTIONS: readonly SectionKey[] = ["offering", "identity", "method", "description"];

/** Every section, for exhaustiveness checks in the test. */
export const ALL_SECTIONS: readonly SectionKey[] = [
  "offering",
  "identity",
  "method",
  "description",
  "duration",
  "deliverable",
  "asyncNotice",
  "onlineHalf",
  "timing",
  "bookingRules",
  "capacityFields",
  "place",
  "map",
  "transport",
  "surcharge",
  "whatIncluded",
  "categoryFields",
  "photos",
  "bookingTerms",
  "requirements",
  "attestations",
  "roleExtras",
];

export const ALL_METHODS: readonly UiDeliveryMethod[] = [
  "in-person",
  "hybrid",
  "video-call",
  "call",
  "pdf",
  "voice_notes",
  "async_messaging",
];

/**
 * SECTIONS SHARED BY TWO BRANCHES — the never-clobber question, stated as data (FP-1's B5
 * posture). Switching the delivery method mid-draft **hides** the sections the new branch does
 * not ask for; it never erases what was entered. This function names the sections that stay
 * VISIBLE across a switch, so the test can assert that the shared ones (basics, the review
 * block) survive every pair — and the form's own `set("deliveryMethod", …)` stays a pure field
 * write with no reset beside it, which is the other half of the same promise.
 */
export function sectionsVisibleInBoth(from: string, to: string): SectionKey[] {
  const fromFlow = new Set(flowForMethod(from));
  const toFlow = new Set(flowForMethod(to));
  return ALL_SECTIONS.filter(
    (s) => fromFlow.has(stepForSection(s, from)) && toFlow.has(stepForSection(s, to)),
  );
}
