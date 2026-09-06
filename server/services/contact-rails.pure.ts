/**
 * contact-rails.pure.ts — the decisions the contact start rail makes that need no database.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * Split out from `contact-rails.service.ts` on the `trip-destinations.pure.ts` /
 * `pending-events.pure.ts` precedent, precisely so the ownership rule below keeps its proof in an
 * environment where `DATABASE_URL` is unset. The rules here are the ones worth proving — who counts
 * as a party to a booking, who counts as the other person on a PLAN (D22), and what a context row
 * is called on screen — and all three are pure functions of rows the caller has already fetched.
 */
import type { ConversationContextKind } from "@shared/schema";

/** The subset of a `service_bookings` row the counterpart rule reads. */
export interface BookingParties {
  travelerId: string | null;
  providerId: string | null;
  /** `provider_services.user_id` for the booking's service, when it has one. */
  serviceOwnerId?: string | null;
}

/**
 * Who the OTHER party of a booking is, from the point of view of `sessionUserId`.
 *
 * Returns null when the caller is not a party to this booking AT ALL — which the route answers as a
 * 404, the same answer it gives for a booking id that does not exist (§13: "no such booking" and
 * "not your booking" are one sentence, so the rail cannot be used to probe which ids are real).
 *
 * The earner side is checked against BOTH `service_bookings.provider_id` and the service's own
 * `provider_services.user_id`. They are normally the same person; `provider_id` is denormalized and
 * `service_id` is nullable (the documented transport-commerce exception), so neither alone covers
 * every real booking, and accepting either is strictly more correct than picking one.
 *
 * The traveler check comes FIRST and returns the earner: a person who is somehow both (an earner
 * booking their own listing) has nobody to message, and falls out as null below rather than being
 * handed a thread with themself.
 */
export function resolveBookingCounterpart(
  booking: BookingParties,
  sessionUserId: string,
): string | null {
  const earnerId = booking.serviceOwnerId ?? booking.providerId ?? null;
  const travelerId = booking.travelerId ?? null;

  const callerIsTraveler = !!travelerId && travelerId === sessionUserId;
  const callerIsEarner =
    (!!earnerId && earnerId === sessionUserId) ||
    (!!booking.providerId && booking.providerId === sessionUserId);

  if (callerIsTraveler && callerIsEarner) return null; // nobody to message
  if (callerIsTraveler) return earnerId;
  if (callerIsEarner) return travelerId;
  return null;
}

/**
 * ── D22 · THE PLAN-SCOPED THREAD ──────────────────────────────────────────────────────────────
 * Ledger `2026-09-05-slip-decisions-d18-d22`; CLAUDE.md Locked Decision 42's D22 addendum, which
 * amends Locked Decision 40's three address kinds with a fourth, `advisor`.
 *
 * The client names a PLAN (`{ tripId }`) and the server answers "who is the other person on it".
 * This is the ONLY address kind whose counterpart depends on WHO IS ASKING, which is exactly why
 * it can carry no id: an address that resolves differently per caller has to be resolved by the
 * side that knows who the caller is (§14's identity rule, applied to the other end of a message
 * exactly as Locked Decision 40 applies it to the first three kinds).
 *
 * NEGATIVE SPACE, and it is load-bearing. This function is handed the trip's advisor rows ALREADY
 * FILTERED to the §12 access statuses; it does not know what those statuses are and must not
 * restate them. `TRIP_ADVISOR_READ_ACCESS_STATUSES` (`server/utils/trip-advisor.ts`) is the ONE
 * closed allow-list and the caller applies it in SQL, the same way `isTripAdvisor` does — a second
 * copy of "which statuses grant access" here would be the derivation-drift class §18 rule 1 names,
 * and that module cannot be imported into a pure file because it opens a database handle.
 */

/** One advisor row as the plan-thread rule reads it — already status-filtered by the caller. */
export interface PlanAdvisorRow {
  /** `trip_expert_advisors.local_expert_id` — the advisor's own user id. */
  userId: string | null;
  /** `trip_expert_advisors.assigned_at`, for the ordering rule below. NULL sorts LAST. */
  assignedAt?: string | Date | null;
}

/** The plan, as much of it as this rule reads. */
export interface PlanParties {
  /** `trips.user_id`. NULL on the expert AUTHORING builds (migration 133), which have no owner. */
  ownerId: string | null;
  /** The trip's advisors in a §12 access status, filtered by the CALLER (see negative space). */
  advisors: readonly PlanAdvisorRow[];
}

function advisorSortKey(row: PlanAdvisorRow): number {
  const raw = row.assignedAt;
  if (raw == null) return Number.NEGATIVE_INFINITY; // never assigned ⇒ sorts last under DESC
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * WHICH advisor a plan means when it holds more than one.
 *
 * `trip_expert_advisors` has always permitted several rows per trip (the UNIQUE is on the PAIR),
 * and D7 rules that the READER returns all of them. A THREAD, though, is between two people, so
 * one has to be named — and the rule is stated here ONCE rather than being decided by whatever
 * order a query happened to return: **most recently assigned first (a NULL `assigned_at` sorts
 * last), ties broken by user id ascending**, which is deterministic for the same rows every time.
 *
 * §13 — THIS IS A STATED TIE-BREAK, NOT A CLAIM ABOUT WHO THE TRAVELER MEANT. A plan with several
 * advisors has several possible threads, and addressing a SPECIFIC one is what Locked Decision
 * 40's `handle` kind is for; that kind is untouched and remains the precise address. The plan
 * address answers the question the slip's single "Message your expert" row actually asks.
 */
export function pickPlanAdvisor(advisors: readonly PlanAdvisorRow[]): PlanAdvisorRow | null {
  const named = advisors.filter((a) => typeof a.userId === "string" && a.userId.length > 0);
  if (named.length === 0) return null;
  return [...named].sort((a, b) => {
    const diff = advisorSortKey(b) - advisorSortKey(a);
    if (diff !== 0 && Number.isFinite(diff)) return diff;
    return String(a.userId).localeCompare(String(b.userId));
  })[0];
}

/**
 * Who the OTHER person on a plan is, from the point of view of `sessionUserId`.
 *
 * OWNER ⇒ the plan's advisor (`pickPlanAdvisor`). ADVISOR ⇒ the plan's owner. Anybody else — a
 * collaborator, a ready-made author, a signed-in stranger — gets `null`, which the route answers
 * as the SAME 404 it gives for a trip that does not exist (§13: "no such plan" and "not your plan"
 * are one sentence, so the rail cannot be used to probe which trip ids are real).
 *
 * A person who is somehow BOTH the owner and an advisor on their own plan has nobody to message
 * and falls out as `null`, the same shape `resolveBookingCounterpart` uses for the earner who
 * booked their own listing — never a thread with themself.
 */
export function resolvePlanCounterpart(plan: PlanParties, sessionUserId: string): string | null {
  const ownerId = plan.ownerId ?? null;
  const callerIsOwner = !!ownerId && ownerId === sessionUserId;
  const callerIsAdvisor = plan.advisors.some((a) => !!a.userId && a.userId === sessionUserId);

  if (callerIsOwner && callerIsAdvisor) return null; // nobody to message
  if (callerIsOwner) {
    const advisor = pickPlanAdvisor(plan.advisors);
    return advisor?.userId ?? null;
  }
  if (callerIsAdvisor) return ownerId;
  return null;
}

/** A context row as a client reads it. `label` is resolved server-side, never restated by a client. */
export interface ConversationContextView {
  kind: ConversationContextKind;
  id: string;
  label: string;
}

/**
 * The on-screen name of one context row.
 *
 * §13: `name` is what the server could actually resolve — a service that has since been deleted, or
 * a booking whose short reference is missing, has NO name, and the label then says what KIND of
 * thing the thread is about without inventing a title for it. It never renders "Unknown service",
 * which claims the platform looked and found a service called nothing.
 */
export function contextLabel(
  kind: ConversationContextKind,
  contextId: string,
  name?: string | null,
): string {
  if (kind === "storefront") return `@${name ?? contextId}`;
  if (kind === "service") return name ? name : "A service listing";
  // D22 — a PLAN-scoped advisor thread. The plan's title when we have one, and otherwise the KIND
  // of thing the thread is about; never a fabricated plan name, and never the trip id, which is
  // an internal key and not something to show a person.
  if (kind === "advisor") return name ? `Plan: ${name}` : "A plan";
  return name ? `Booking ${name}` : "A booking";
}
