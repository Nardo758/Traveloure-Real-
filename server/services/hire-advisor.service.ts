/**
 * HIRE AN EXPERT FROM THE SLIP — the decision half of `POST /api/trips/:tripId/advisors`.
 * Ledger `2026-09-04-hire-from-slip`; the missing piece named by `2026-09-04-slip-precondition`
 * clause (c); CLAUDE.md Locked Decisions 29 (an event IS a `user_experiences` row), 31
 * (`experience_types.roles_needed`) and 12 (a PENDING advisor may not write).
 *
 * WHY A MODULE AND NOT A ROUTE BODY.
 * Every check here is a REFUSAL that has to be right — who owns the plan, whether the chosen
 * expert exists, whether the named event is on this plan — and a refusal that only exists inside
 * an Express handler is a refusal nothing can test without a database and a session. The route
 * keeps the plumbing (auth, parse, status codes); this keeps the decisions, with its four
 * dependencies INJECTED so the whole ladder is exercised by stubs in
 * `server/__tests__/hire-advisor-guards.test.ts`.
 *
 * THE ONE AUTHOR RULE (§18 rule 1) is why `ensureTripAdvisorRow` arrives as a dependency rather
 * than as SQL written here. `trip_expert_advisors` rows for an invited expert are born in ONE
 * place — `booking-actions.service.ts::ensureTripAdvisorRow` — and this lane adds a CALLER, never
 * a second INSERT. That function is idempotent by construction (`WHERE NOT EXISTS` over a
 * pending/accepted row for the pair), so a double-tap on the slip produces one invitation.
 *
 * THE ROW IS BORN `pending`, AND THAT IS THE POINT (Locked Decision 12). Choosing an expert is an
 * INVITATION, not an assignment: the expert must accept before they may write anything to the
 * plan. Nothing in this lane may promote that status, and the traveler-facing copy must say
 * "awaiting" and never imply the expert has started (§13).
 *
 * THERE IS NO ADVISOR→EVENT COLUMN, AND THIS LANE DID NOT ADD ONE.
 * `trip_expert_advisors` is keyed on (trip, expert) — a UNIQUE index says so — so an advisor
 * belongs to the PLAN. The traveler nonetheless presses "Hire an expert" while looking at ONE
 * event, and throwing that context away would be silent. So the event id is accepted, VERIFIED
 * against the trip by the shared resolver, and then used for exactly one thing: naming the event
 * in the human-readable note the expert reads. It is never persisted as a link, and no surface
 * may say an expert is assigned to an event — that would be a claim no row backs (§13). Making it
 * a real link needs a column, which needs the decision-maker and a CLAUDE.md entry first.
 */

/** What the route hands in. `tripId` and `userId` come from the URL and the session — never a body (§14). */
export interface HireAdvisorInput {
  tripId: string;
  userId: string;
  /**
   * The chosen expert's USER id (`trip_expert_advisors.local_expert_id`) — the LEGACY address,
   * sent by `HireExpertDialog`. Locked Decision 40 names it as debt; no new caller may adopt it.
   */
  localExpertId?: string | null;
  /**
   * The chosen expert's storefront HANDLE — the Locked Decision 40 address. Resolved server-side
   * AFTER the ownership check (see the ladder below), so a non-owner learns nothing about which
   * handles exist. Exactly one of `handle` / `localExpertId`.
   */
  handle?: string | null;
  /** The traveler's own words, optional. */
  message?: string | null;
  /** The event the traveler was looking at, optional. Verified, never persisted as a link. */
  userExperienceId?: string | null;
}

/** The event-resolution answer this module needs: does the event belong to THIS trip, and what is it called? */
export type HireAdvisorEventResolution =
  | { ok: true; title: string | null }
  | { ok: false; message: string };

export interface HireAdvisorDeps {
  /** `server/utils/trip-ownership.ts` — the shared owner predicate, fail-closed. */
  verifyTripOwnership(tripId: string, userId: string): Promise<boolean>;
  /** `booking-actions.service.ts::isExpertApproved` — an approved `local_expert_forms` row. */
  isExpertApproved(expertUserId: string): Promise<boolean>;
  /**
   * `contact-rails.service.ts::resolveEarnerByHandle` — the ONE statement of which account a public
   * handle names (§18 rule 1). Returns the account's user id, or `null` for a handle that names no
   * live earner. It says nothing about EXPERT approval; `isExpertApproved` still decides that.
   */
  resolveExpertHandle(handle: string): Promise<string | null>;
  /** Wraps the shared `resolveItemEventLink` (item-event-link.service.ts) plus the title read. */
  resolveEventOnTrip(tripId: string, eventId: string): Promise<HireAdvisorEventResolution>;
  /** `booking-actions.service.ts::ensureTripAdvisorRow` — the ONE author of the row. */
  ensureTripAdvisorRow(tripId: string, expertUserId: string, message: string | null): Promise<void>;
}

export type HireAdvisorOutcome =
  | {
      ok: true;
      /** Always `pending`: the expert must accept (Locked Decision 12). Never derived from input. */
      status: "pending";
      expertUserId: string;
      /**
       * HOW the traveler named the expert. The route reads this to decide what it may RETURN: a
       * handle-addressed request gets no `users.id` back (Locked Decision 40 — the response to a
       * rail a storefront calls carries no user id), while the legacy id path keeps its shape so
       * its one existing caller is unchanged.
       */
      addressedBy: "handle" | "id";
      /** The verified event's title, when one was named and the row has a title. Never invented. */
      eventTitle: string | null;
      /** Exactly what was written to `trip_expert_advisors.message`. */
      note: string | null;
    }
  | { ok: false; httpStatus: 400 | 403 | 404; message: string };

/** The one refusal the traveler sees when a plan is not theirs. Deliberately says nothing about the plan. */
export const NOT_YOUR_PLAN_MESSAGE = "You can only hire an expert for a plan you own.";
/** A nonexistent expert and an unapproved one get the SAME message: the directory is not a probe. */
export const EXPERT_NOT_AVAILABLE_MESSAGE = "That expert is not available to hire.";
/** Both addresses, or neither: the request is malformed, and guessing which was meant would be a lie. */
export const EXPERT_ADDRESS_REQUIRED_MESSAGE = "Choose one expert: send a handle or a localExpertId, not both and not neither.";

/**
 * THE NOTE THE EXPERT READS — the only place the chosen event survives.
 *
 * Rules (§13): the event line appears ONLY when the verified row actually has a title (a row with
 * no title gets no line — "Untitled event" is a name nobody wrote); the traveler's own words are
 * never rewritten, never summarised and never invented; and when there is neither, the note is
 * `null` rather than a manufactured sentence, because `trip_expert_advisors.message` is nullable
 * and an empty request is an honest one.
 */
export function composeAdvisorNote(
  message: string | null | undefined,
  eventTitle: string | null | undefined,
): string | null {
  const words = typeof message === "string" ? message.trim() : "";
  const title = typeof eventTitle === "string" ? eventTitle.trim() : "";
  const lines: string[] = [];
  if (title) lines.push(`Requested from the plan's "${title}".`);
  if (words) lines.push(words);
  return lines.length > 0 ? lines.join("\n\n") : null;
}

/**
 * Run the hire ladder. Order is load-bearing:
 *
 *   0. THE ADDRESS SHAPE (400) — exactly one of `handle` / `localExpertId`.
 *   1. OWNERSHIP (403), before any lookup that could disclose whether an expert exists. A
 *      non-owner must not be able to learn, from the difference between a 404 and a 400, which
 *      expert ids or handles exist, or which events sit on someone else's plan.
 *   2. THE EXPERT (404). A handle is resolved HERE, never earlier. Unknown, not-an-expert and
 *      unapproved are one answer on purpose.
 *   3. THE EVENT (400), only when one was named — absent is a perfectly ordinary hire from a plan
 *      with no events at all.
 *   4. Only then the write, through the ONE author.
 */
export async function hireAdvisorFromSlip(
  deps: HireAdvisorDeps,
  input: HireAdvisorInput,
): Promise<HireAdvisorOutcome> {
  // 0. THE ADDRESS SHAPE (400). Checked first because it is about the REQUEST and discloses nothing
  //    about anyone's data — the same place a schema parse failure already answers. The route's
  //    `tripAdvisorHireSchema` refuses this too; stating it here keeps the refusal testable.
  const handle = typeof input.handle === "string" ? input.handle.trim() : "";
  const legacyId = typeof input.localExpertId === "string" ? input.localExpertId.trim() : "";
  if ((handle ? 1 : 0) + (legacyId ? 1 : 0) !== 1) {
    return { ok: false, httpStatus: 400, message: EXPERT_ADDRESS_REQUIRED_MESSAGE };
  }

  if (!(await deps.verifyTripOwnership(input.tripId, input.userId))) {
    return { ok: false, httpStatus: 403, message: NOT_YOUR_PLAN_MESSAGE };
  }

  // 2. THE EXPERT (404). The handle is resolved only NOW, after ownership: resolving it first would
  //    let a non-owner tell an unknown handle (404) from a real one on someone else's plan (403).
  //    An unknown handle, a live earner who is not an approved expert (a provider, say), and an
  //    unapproved expert are all the same answer — the directory is not a probe.
  const addressedBy: "handle" | "id" = handle ? "handle" : "id";
  const expertUserId = handle ? await deps.resolveExpertHandle(handle) : legacyId;
  if (!expertUserId || !(await deps.isExpertApproved(expertUserId))) {
    return { ok: false, httpStatus: 404, message: EXPERT_NOT_AVAILABLE_MESSAGE };
  }

  let eventTitle: string | null = null;
  if (input.userExperienceId) {
    const resolved = await deps.resolveEventOnTrip(input.tripId, input.userExperienceId);
    if (!resolved.ok) {
      // A refusal, never a silent drop to a plan-level hire: the traveler asked about an event,
      // and quietly hiring "for the plan instead" would misreport what just happened (§13).
      return { ok: false, httpStatus: 400, message: resolved.message };
    }
    eventTitle = resolved.title;
  }

  const note = composeAdvisorNote(input.message, eventTitle);
  await deps.ensureTripAdvisorRow(input.tripId, expertUserId, note);

  return { ok: true, status: "pending", expertUserId, addressedBy, eventTitle, note };
}
