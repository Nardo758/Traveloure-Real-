/**
 * THE SLIP IS THE PRECONDITION for every expert touchpoint — CLAUDE.md Locked Decision 32,
 * ledger `2026-09-04-slip-precondition` (lane a) / `2026-09-04-template-inquiry-slip`.
 *
 * WHY THIS MODULE EXISTS. A `template_inquiry` lead used to be POSTed from
 * `experience-template.tsx` with NO `tripId` whenever the traveler had not yet made a plan.
 * That lead is a DEAD END and it surfaces to nobody: in `server/routes/booking-actions.ts` the
 * advisor row (`ensureTripAdvisorRow`), the expert's notification and the Assigned Trips entry
 * all sit inside `if (tripId)`; the admin confirm path answers `400 "Request has no associated
 * trip"`; and the traveler's own POST is fire-and-forget behind a bare `catch {}`, so the
 * traveler is told "Shared with an expert" for work no expert can ever reach. The fix is a
 * PRECONDITION, never a drain: the slip is minted FIRST, from basics the traveler already gave,
 * and only then is the expert asked for. Nothing here ever mints a trip *from* a lead.
 *
 * THE RULES IT ENCODES, and why each one is a rule rather than a call-site habit:
 *
 * 1. **NO REQUEST WITHOUT A `tripId`.** `ensureSlipForExpertRequest` hands the trip id to
 *    `sendRequest` as a REQUIRED positional argument, so there is no shape of this flow in
 *    which a request goes out unbound. Every early return leaves `sendRequest` uncalled.
 *
 * 2. **DATES ARE NEVER INVENTED (§13).** `trips.start_date` / `trips.end_date` are NOT NULL.
 *    When the page has no dates the answer is to ASK the traveler — not `new Date()`, not
 *    "a week from now", and not a mint attempt that the server would have to guess for. A
 *    refusal blocks BOTH the mint and the request; the caller surfaces `message` verbatim.
 *    (The template page had exactly the forbidden shape 150 lines away: a `||
 *    new Date().toISOString()` default on its AI-generate path.)
 *
 * 3. **AN EXISTING SLIP IS REUSED, NEVER DUPLICATED.** A trip already bound in trip context is
 *    the plan the expert is meant to read live; minting a second one beside it would split the
 *    traveler's work across two rows and point the expert at the empty one.
 *
 * 4. **ONE MINT DOOR.** `mintTripSlip` is the only place in the client that turns basics into a
 *    `POST /api/trips` body — the same traveler-owned door the planning ladder's "Plan it
 *    myself" branch opens (`PlanningContext.createDraftTrip`, now a caller of this module).
 *    A second copy of that body shape, or of the date/destination checks in front of it, is the
 *    derivation-drift class CLAUDE.md §18 rule 1 names.
 *
 * 5. **NO MONEY, NO IDENTITY.** Nothing here carries an amount, a rate or a user id (§14/§19).
 *    Ownership of the minted trip is the session's, decided by the server.
 *
 * Pure by construction: no React, no DOM, no top-level imports. The network call is reached
 * through a lazy `import()` inside the default poster, so a test may exercise every decision
 * here by injecting its own poster and never touching `fetch`.
 */

/** The traveler-owned mint door. One endpoint, named once. */
export const TRIP_MINT_ENDPOINT = "/api/trips";

/** Basics a slip needs. Dates are `YYYY-MM-DD` — the shape both the ladder's date inputs and
 *  the template page's snapshot already produce. Every field is optional at the type level
 *  precisely because the checks below are what decide whether they are enough. */
export interface SlipBasics {
  destination?: string | null;
  /** `YYYY-MM-DD`. Absent means NOT ANSWERED — never a date to fill in. */
  startDate?: string | null;
  /** `YYYY-MM-DD`. Absent means NOT ANSWERED — never a date to fill in. */
  endDate?: string | null;
  /** Optional traveler-authored title; a destination-derived one is used when absent. */
  title?: string | null;
}

export type SlipRefusalReason =
  | "destination_missing"
  | "dates_missing"
  | "dates_inverted"
  | "mint_failed"
  | "mint_returned_no_id";

/** The traveler-facing sentence for each refusal. Held here so the ladder and the template
 *  page say the same thing about the same missing answer. */
export const SLIP_REFUSAL_MESSAGES: Record<SlipRefusalReason, string> = {
  destination_missing: "Where are you going? A destination starts the plan.",
  dates_missing: "Pick your dates — the plan needs a start and an end.",
  dates_inverted: "The end date can't be before the start date.",
  mint_failed: "Couldn't create the trip. Please try again.",
  mint_returned_no_id: "Couldn't create the trip. Please try again.",
};

export interface SlipRefusal {
  ok: false;
  reason: SlipRefusalReason;
  message: string;
}

/** The body `POST /api/trips` is given. `insertTripSchema` omits `timezone` and `marketSlug`
 *  — both are SERVER-DERIVED (Locked Decision 30) and must never appear here. */
export interface TripMintBody {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export type SlipMintOutcome = { ok: true; tripId: string } | SlipRefusal;

function refuse(reason: SlipRefusalReason, message?: string): SlipRefusal {
  return { ok: false, reason, message: message || SLIP_REFUSAL_MESSAGES[reason] };
}

/** A trip id is a real bound slip only when it is a non-empty string. `""`, `null` and
 *  `undefined` are all "no slip", and none of them may be forwarded as one. */
export function hasBoundSlip(tripId?: string | null): tripId is string {
  return typeof tripId === "string" && tripId.trim().length > 0;
}

/**
 * Are the basics enough to mint, WITHOUT inventing anything? Pure; no side effects.
 * Returns `null` when they are, and the refusal to show the traveler when they are not.
 */
export function checkSlipPrecondition(basics: SlipBasics): SlipRefusal | null {
  const destination = (basics.destination ?? "").trim();
  if (!destination) return refuse("destination_missing");

  const startDate = (basics.startDate ?? "").trim();
  const endDate = (basics.endDate ?? "").trim();
  // trips.startDate/endDate are NOT NULL — the schema demands REAL dates, so an absent one is
  // asked for, never defaulted (§13). A guessed date renders identically to a stated one.
  if (!startDate || !endDate) return refuse("dates_missing");

  const start = new Date(startDate);
  const end = new Date(endDate);
  // An unparseable date is a missing answer, not a date to repair.
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return refuse("dates_missing");
  if (end.getTime() < start.getTime()) return refuse("dates_inverted");

  return null;
}

/**
 * The one place basics become a mint body. Only reachable once `checkSlipPrecondition` has
 * passed, so every field below is a value the traveler actually stated.
 */
export function buildTripMintBody(basics: SlipBasics): TripMintBody {
  const destination = (basics.destination ?? "").trim();
  const stated = (basics.title ?? "").trim();
  return {
    title: stated || `${destination.split(",")[0].trim()} trip`,
    destination,
    startDate: (basics.startDate ?? "").trim(),
    endDate: (basics.endDate ?? "").trim(),
  };
}

/** What a poster must do: send the body to the mint door and hand back whatever the server
 *  answered. Injectable so the decisions above are testable without a network. */
export type TripMintPoster = (body: TripMintBody) => Promise<{ id?: string } | null | undefined>;

async function defaultTripMintPoster(body: TripMintBody): Promise<{ id?: string }> {
  // Lazy so this module has no top-level import and stays testable under `tsx --test`.
  const { apiRequest } = await import("@/lib/queryClient");
  const res = await apiRequest("POST", TRIP_MINT_ENDPOINT, body);
  return (await res.json()) as { id?: string };
}

/**
 * Mint the slip. THE traveler-owned client mint door — do not open a second one.
 * Refuses (without calling the server) whenever the basics are not enough.
 */
export async function mintTripSlip(
  basics: SlipBasics,
  post: TripMintPoster = defaultTripMintPoster,
): Promise<SlipMintOutcome> {
  const refusal = checkSlipPrecondition(basics);
  if (refusal) return refusal;

  let trip: { id?: string } | null | undefined;
  try {
    trip = await post(buildTripMintBody(basics));
  } catch (err: any) {
    return refuse("mint_failed", err?.message || SLIP_REFUSAL_MESSAGES.mint_failed);
  }
  // A mint that answers without an id has not produced a slip. Saying otherwise would send an
  // expert request bound to `undefined`, which is the very dead end this module exists to stop.
  if (!hasBoundSlip(trip?.id)) return refuse("mint_returned_no_id");
  return { ok: true, tripId: trip.id };
}

export type ExpertRequestOutcome =
  /** The request went out, bound to `tripId`. `minted` says whether this call created the slip. */
  | { status: "sent"; tripId: string; minted: boolean }
  /** No slip ⇒ NO mint attempt beyond what was refused, and NO request. Show `message`. */
  | { status: "blocked"; reason: SlipRefusalReason; message: string }
  /** The slip exists; the request itself failed. The caller may retry against this same trip. */
  | { status: "request_failed"; tripId: string; minted: boolean; error: unknown };

export interface EnsureSlipDeps {
  /** Normally `mintTripSlip`. Injected so a caller (and a test) can supply its own poster. */
  mint: (basics: SlipBasics) => Promise<SlipMintOutcome>;
  /** Sends the expert request. `tripId` is REQUIRED — rule 1 is enforced by this signature. */
  sendRequest: (tripId: string) => Promise<unknown>;
  /** Fired only after a mint actually produced a slip, so the caller can bind it into trip
   *  context before the request goes out. Never called for a reused trip. */
  onMinted?: (tripId: string) => void;
}

/**
 * SLIP FIRST, THEN THE EXPERT. The whole of lane (a)'s decision, in one place:
 *   - a slip already bound  ⇒ reuse it, mint nothing;
 *   - no slip, basics short ⇒ refuse: no mint, NO request, the traveler is asked;
 *   - no slip, basics good  ⇒ mint, bind, then request with the new id.
 */
export async function ensureSlipForExpertRequest(
  input: { existingTripId?: string | null; basics: SlipBasics },
  deps: EnsureSlipDeps,
): Promise<ExpertRequestOutcome> {
  let tripId: string;
  let minted = false;

  if (hasBoundSlip(input.existingTripId)) {
    tripId = input.existingTripId.trim();
  } else {
    const outcome = await deps.mint(input.basics);
    if (!outcome.ok) {
      return { status: "blocked", reason: outcome.reason, message: outcome.message };
    }
    tripId = outcome.tripId;
    minted = true;
    deps.onMinted?.(tripId);
  }

  try {
    await deps.sendRequest(tripId);
  } catch (error) {
    return { status: "request_failed", tripId, minted, error };
  }
  return { status: "sent", tripId, minted };
}
