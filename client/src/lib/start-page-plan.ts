/**
 * THE ZERO-QUESTION START (Lane E1; ledger `2026-10-08-e1-zero-questions`; decision-maker, Oct 7–8, 2026 —
 * Locked Decision 33 amended for the start-page branch).
 *
 * The Experiences page has already asked the two questions it needs — the occasion and the city — so its
 * Continue opens the Trip Slip straight away: no When, no Who. ONE module, two callers (§18 rule 1): the
 * page itself (signed in) and the sign-in replay of a guest's record (`PlanningContext`).
 *
 *   signed in  — `POST /api/trips` with the city only (no dates: the server stores its placeholder window,
 *                the mint day, and certifies nothing), then the EXISTING occasion PATCH — the same two
 *                calls `commitPlan` makes — and the plan opens on its map, Browse.
 *   signed out — the page writes the sign-in record ITSELF (no modal is opened) and lands on the 8d guest
 *                map; after sign-in the record replays through THIS mint, never the modal's auto-finish.
 *
 * Every other door keeps the one planning modal unchanged.
 */
import { mintTripSlip, type TripMintPoster } from "./trip-slip";
import type { PendingPlanRecord } from "./pending-plan-record";
import type { DraftAnswers } from "./plan-resume";

export const START_PAGE_DOOR = "experiences" as const;

export interface StartPageAnswers {
  experienceSlug: string;
  city: string;
  country: string;
}

/** The plan's destination, spelled as the modal spelled it for this door ("Kyoto, Japan"). */
export function startPageDestination(a: Pick<StartPageAnswers, "city" | "country">): string {
  return [a.city, a.country].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

/** Pure. Is this sign-in record a zero-question start (replayed through `mintStartPagePlan`)? */
export function isStartPageRecord(record: Pick<PendingPlanRecord, "door" | "branch"> | null | undefined): boolean {
  return !!record && record.door === START_PAGE_DOOR && record.branch === "myself";
}

/**
 * Pure. The guest's sign-in record for the zero-question start: the occasion and the city, and nothing
 * the page did not ask — no dates, no party (§13: empty, never a default). `answers.stops[0]` is the
 * destination the guest map reads.
 */
export function startPageGuestRecord(a: StartPageAnswers): Omit<PendingPlanRecord, "v" | "savedAt" | "expiresAt"> {
  const destination = startPageDestination(a);
  const answers: DraftAnswers = {
    title: "",
    stops: [destination],
    startDate: "",
    endDate: "",
    adults: "",
    kids: "",
    budgetApproverName: "",
    budgetApproverEmail: "",
    accessibilityNote: "",
    mainMomentTime: "",
    mainMomentDate: "",
    events: [],
    occasionSlug: a.experienceSlug,
  };
  return {
    branch: "myself",
    door: START_PAGE_DOOR,
    answers,
    source: { experienceSlug: a.experienceSlug, city: a.city, country: a.country, destination },
  };
}

export type OccasionPatcher = (tripId: string, experienceSlug: string) => Promise<void>;

async function defaultOccasionPatcher(tripId: string, experienceSlug: string): Promise<void> {
  const { apiRequest } = await import("@/lib/queryClient");
  await apiRequest("PATCH", `/api/trips/${tripId}/occasion`, { experienceSlug });
}

export type StartPageMintOutcome =
  | { ok: true; tripId: string; occasionSaved: boolean }
  | { ok: false; message: string };

/**
 * Mint the plan for the zero-question start: the ONE client mint door (`mintTripSlip`) with dates
 * optional, then the occasion through its one rail. A plan whose occasion PATCH failed still exists and
 * is still opened — the slip shows it without an occasion rather than the traveler losing the plan
 * (`occasionSaved: false` says so; nothing is retried behind their back).
 */
export async function mintStartPagePlan(
  a: StartPageAnswers,
  deps: { post?: TripMintPoster; patchOccasion?: OccasionPatcher } = {},
): Promise<StartPageMintOutcome> {
  const outcome = await mintTripSlip(
    { destination: startPageDestination(a), entry: { door: START_PAGE_DOOR, occasionSource: "asked", finish: "myself" } },
    deps.post,
    { datesOptional: true },
  );
  if (!outcome.ok) return { ok: false, message: outcome.message };
  let occasionSaved = true;
  try {
    await (deps.patchOccasion ?? defaultOccasionPatcher)(outcome.tripId, a.experienceSlug);
  } catch {
    occasionSaved = false;
  }
  return { ok: true, tripId: outcome.tripId, occasionSaved };
}
