/**
 * THE STOREFRONT BOOKING PANEL'S DECISIONS — every rule the panel on `/s/:handle` applies, stated
 * once and tested without a browser (`__tests__/storefront-booking-panel.test.ts`).
 *
 * The panel is the storefront's one decision surface: an EXPERT storefront asks the traveler to
 * start a plan or share the plan they arrived with (the advisors rail, `{ handle }` — Locked
 * Decisions 12, 32, 40); a PROVIDER storefront sends them to a listing to book. Nothing here
 * books, charges or writes anything; it only decides what the panel may truthfully say.
 *
 * §13 IS THE SPINE OF THIS FILE. Every function returns `null` rather than a guess when the data
 * cannot support a claim: no "From $X" without a shown positive price, no lead time or
 * cancellation line unless EVERY listing agrees, no dates in the plan line unless the traveler
 * chose them (`trips.dates_confirmed_at`, Locked Decision 30), no response-time figure that is a
 * bare number with no unit.
 */
import { planDatesAreConfirmed, type PlanDatesConfirmedAt } from "@shared/plan-dates";
import { CANCELLATION_POLICY_TYPE_LABELS, cancellationPolicyTypeEnum } from "@shared/schema";
import { formatExpertResponseTime } from "./expert-response-time";

export interface PanelService {
  id: string;
  price: string | null;
  /** Resolved server-side; `false` means the owner hides the price everywhere. */
  showPrice?: boolean;
  /** Resolved server-side to a concrete value (`loadStorefront`). */
  bookingMode?: "instant" | "request" | "hidden";
  leadTimeHours?: number | null;
  cancellationPolicyType?: string | null;
}

/**
 * The lowest price a traveler can actually see on this storefront, or `null`.
 * A hidden price, a missing price and a non-positive price are all "not a price" — the panel
 * never prints "$0" and never reveals a price the owner chose to hide.
 */
export function lowestListedPrice(services: readonly PanelService[]): number | null {
  let lowest: number | null = null;
  for (const s of services) {
    if (s.showPrice === false || s.price == null) continue;
    const n = Number(s.price);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (lowest === null || n < lowest) lowest = n;
  }
  return lowest;
}

/** "$85", "$120", "$42.50" — whole dollars stay whole. */
export function formatPanelPrice(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export type BookingModeSummary = "instant" | "request" | "mixed";

/**
 * How the BOOKABLE listings confirm. `hidden` listings (enquiry only) say nothing either way and
 * are skipped; with no bookable listing there is nothing to summarise, so `null`.
 */
export function summarizeBookingModes(services: readonly PanelService[]): BookingModeSummary | null {
  const modes = new Set(
    services.map((s) => s.bookingMode).filter((m): m is "instant" | "request" => m === "instant" || m === "request"),
  );
  if (modes.size === 0) return null;
  if (modes.size === 2) return "mixed";
  return modes.has("instant") ? "instant" : "request";
}

export const BOOKING_MODE_LINES: Record<BookingModeSummary, string> = {
  instant: "Every service confirms instantly.",
  request: "Every service is by request — the provider confirms your booking.",
  mixed: "Some services confirm instantly; others are by request.",
};

/**
 * The lead time EVERY listing shares, or `null`. One listing that differs (or states none) means
 * the storefront as a whole has no single answer, and the panel must not pick one.
 */
export function sharedLeadTimeHours(services: readonly PanelService[]): number | null {
  if (services.length === 0) return null;
  const first = services[0].leadTimeHours;
  if (typeof first !== "number" || !Number.isFinite(first) || first <= 0) return null;
  return services.every((s) => s.leadTimeHours === first) ? first : null;
}

export function leadTimeLine(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `Book at least ${hours / 24} days ahead.`;
  return `Book at least ${hours} hour${hours === 1 ? "" : "s"} ahead.`;
}

/** The cancellation policy EVERY listing shares, as its canonical label — or `null`. */
export function sharedCancellationLabel(services: readonly PanelService[]): string | null {
  if (services.length === 0) return null;
  const first = services[0].cancellationPolicyType;
  if (!first || !(cancellationPolicyTypeEnum as readonly string[]).includes(first)) return null;
  if (!services.every((s) => s.cancellationPolicyType === first)) return null;
  return CANCELLATION_POLICY_TYPE_LABELS[first as (typeof cancellationPolicyTypeEnum)[number]];
}

/**
 * The response-time figure for the header, or `null`. It reuses the one formatter and then refuses
 * a value with no letters in it: a bare "2" is a raw field leaking, not a promise anyone made.
 */
export function responseTimeFigure(raw: string | null | undefined): string | null {
  const formatted = formatExpertResponseTime(raw);
  if (!formatted || !/[a-z]/i.test(formatted)) return null;
  return formatted;
}

export interface PanelTrip {
  id: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  datesConfirmedAt?: PlanDatesConfirmedAt;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a `YYYY-MM-DD` (or ISO) date as a calendar day — no timezone shift. */
function calendarDay(value: string | null): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/** "Nov 8–11", "Nov 28 – Dec 2", or `null` when either end is unreadable. */
export function formatPlanWindow(startDate: string | null, endDate: string | null): string | null {
  const a = calendarDay(startDate);
  const b = calendarDay(endDate);
  if (!a || !b || a.m < 0 || a.m > 11 || b.m < 0 || b.m > 11) return null;
  if (a.y === b.y && a.m === b.m) {
    return a.d === b.d ? `${MONTHS[a.m]} ${a.d}` : `${MONTHS[a.m]} ${a.d}–${b.d}`;
  }
  return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}`;
}

/**
 * The panel's plan line: "Your plan · Jaipur · Nov 8–11". The window appears ONLY when the
 * traveler chose it (Locked Decision 30: a placeholder window is never presented as theirs).
 */
export function planContextLine(trip: PanelTrip): string {
  const parts = ["Your plan"];
  if (trip.destination?.trim()) parts.push(trip.destination.trim());
  if (planDatesAreConfirmed(trip.datesConfirmedAt)) {
    const window = formatPlanWindow(trip.startDate, trip.endDate);
    if (window) parts.push(window);
  }
  return parts.join(" · ");
}

/** "Porto · Oct 3–6" — the plan chip on a provider panel (same dates rule). */
export function planChipText(trip: PanelTrip): string | null {
  const parts: string[] = [];
  if (trip.destination?.trim()) parts.push(trip.destination.trim());
  if (planDatesAreConfirmed(trip.datesConfirmedAt)) {
    const window = formatPlanWindow(trip.startDate, trip.endDate);
    if (window) parts.push(window);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Where this expert stands on the traveler's plan, read from the owner's advisor list. */
export type AdvisorStanding = "none" | "pending" | "on_plan";

export interface PanelAdvisorRow {
  handle?: string | null;
  status?: string | null;
}

/**
 * Match by HANDLE (Locked Decision 40 — the handle is the public address; no user id is compared
 * on this page). `accepted`/`assigned` are Locked Decision 12's write statuses: the expert is on
 * the plan. `pending` is invited and waiting. Anything else, or no match, is "none".
 */
export function advisorStanding(advisors: readonly PanelAdvisorRow[] | null | undefined, handle: string): AdvisorStanding {
  const wanted = handle.trim().toLowerCase();
  if (!wanted || !advisors) return "none";
  let standing: AdvisorStanding = "none";
  for (const a of advisors) {
    if (!a.handle || a.handle.trim().toLowerCase() !== wanted) continue;
    if (a.status === "accepted" || a.status === "assigned") return "on_plan";
    if (a.status === "pending") standing = "pending";
  }
  return standing;
}

export type PanelKind =
  | "hidden"
  | "expert_start"
  | "expert_share"
  | "expert_pending"
  | "expert_on_plan"
  | "provider";

/**
 * Which panel to draw. The owner of the storefront sees none (their header has "Edit profile").
 * "provider" is the BOOKING panel — every provider, and any earner who cannot take a shared plan.
 * An expert panel offers SHARING only when a plan the viewer owns was resolved — never on the
 * strength of a `?tripId=` alone, which anyone can type.
 */
export function resolvePanelKind(input: {
  isProvider: boolean;
  isOwnStorefront: boolean;
  /**
   * The server's own answer (`loadStorefront` → `isExpertHireable`, the predicate the advisors rail
   * uses): an approved expert profile, not the platform's reserved concierge account. An expert
   * storefront that cannot take a shared plan gets the BOOKING panel instead — offering a share the
   * server refuses would be a dead button.
   */
  acceptsPlanShares: boolean;
  ownedTrip: PanelTrip | null;
  standing: AdvisorStanding;
}): PanelKind {
  if (input.isOwnStorefront) return "hidden";
  if (input.isProvider || !input.acceptsPlanShares) return "provider";
  if (!input.ownedTrip) return "expert_start";
  if (input.standing === "on_plan") return "expert_on_plan";
  if (input.standing === "pending") return "expert_pending";
  return "expert_share";
}

/** The message that opens the conversation after sharing — a composer PREFILL, never sent (LD 40). */
export function shareConversationSubject(trip: PanelTrip): string {
  const where = trip.destination?.trim();
  return where ? `My plan for ${where}` : "My plan";
}
