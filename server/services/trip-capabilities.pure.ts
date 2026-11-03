/**
 * CAP-1 (ledger `2026-11-03-cap1-trip-capabilities`; Leon, Nov 3: "one server-derived read; the client renders from it
 * and never reasons about money, kinds or roles itself"). PURE: no database, no clock, no Stripe. The route gathers the
 * inputs from the reads the enforcing routes already use; this module only restates their decisions.
 *
 * Every allowed action is backed by the gate that would also accept the action (cited per action below). Where a
 * route would refuse, the capability says no — never the other way round. The verified-email gate is modelled as its
 * own value, "verify" (reason `email_unverified`), emitted only when it is the ONE refusal left: precedence is viewer
 * "no" → waitlist → verify → the allowed value (decision-maker, Nov 3, 2026). A surface treats "verify" as it treats the
 * allowed value today — the existing verify prompt runs.
 */
import type { HandoffKind } from "@shared/handoff";
import type {
  CapabilityViewerRole,
  TripCapabilities,
  TripCapabilityActions,
} from "@shared/trip-capabilities";

export interface CapabilityInputs {
  viewer: {
    /** The plancard gate's own `tripRole` (resolvePlancardViewer): owner/expert/friend, delegate, payer, or null. */
    tripRole: string | null;
    isAssignedExpert: boolean;
    isAuthor: boolean;
    /** The viewer's own `trip_expert_advisors.source` on this trip, when they hold a row. */
    advisorSource: string | null;
    /** `trips.user_id === viewer` — the owner test the trip-pass, optimizer and handoff routes run. */
    ownsTrip: boolean;
    /** `authorizeTripLogistics(..., { requireWriteAccess: true })` let this viewer through. */
    canEdit: boolean;
    /** `users.email_verified` is set. */
    emailVerified: boolean;
  };
  /**
   * `requireVerifiedEmail("checkout")` would refuse this viewer (enforcement on and the email unverified) — the
   * middleware in front of /api/checkout, the optimizer and proposal pay routes and the Trip Pass purchase.
   */
  checkoutEmailDenied: boolean;
  /** `refuseUnverifiedTravelerSender` would refuse this viewer's handoff quote / ask. */
  handoffEmailDenied: boolean;
  signup: { mode: "open" | "waitlist"; purchasesAllowed: boolean };
  pass: { active: boolean; runs: { cap: number; used: number; left: number } | null };
  /** The Trip Pass plan row is active with a positive price (the purchase route's 400 otherwise). */
  tripPassPlanAvailable: boolean;
  /** The optimizer fee row for this plan's event type is disabled (the pay route's 400 `ai_concierge_disabled`). */
  optimizerFeeDisabled: boolean;
  handoff: {
    kind: string | null;
    status: string | null;
    scopeItemIds: string[];
    onTripSupportOfferedAt: unknown;
    onTripSupportAcceptedAt: unknown;
  } | null;
  pendingSuggestions: number;
  /** The `handoff_booking` platform switch (shared/traveler-doors.ts). */
  handoffBookingOn: boolean;
  /** The CN-1 concierge booking on this trip (a `serviceType = 'concierge'` listing), newest first. */
  concierge: { status: string | null; accessUntil: Date | string | null } | null;
}

/** A handoff that still holds the plan or a hold: `askHandoff` refuses a new ask while one of these stands. */
export const HANDOFF_IN_PROGRESS_STATUSES = ["authorizing", "proposed", "unmatched", "accepted", "release_pending"] as const;

/** A concierge booking that has ended. Any other status is an engagement still under way. */
export const CONCIERGE_ENDED_STATUSES = ["completed", "partially_completed", "cancelled", "refunded", "expired", "failed"] as const;

export function capabilityViewerRole(v: CapabilityInputs["viewer"]): CapabilityViewerRole {
  const advisorRole: CapabilityViewerRole = v.advisorSource === "concierge" ? "concierge" : "expert";
  switch (v.tripRole) {
    case "owner":
      return "owner";
    case "friend":
      return "collaborator";
    case "expert":
      return advisorRole;
    case "delegate":
      return "delegate";
    case "payer":
      return "payer";
    case null:
      if (v.isAuthor) return "author";
      if (v.isAssignedExpert) return advisorRole;
      return "collaborator";
    default:
      return "collaborator";
  }
}

const KINDS: readonly HandoffKind[] = ["polish", "book", "plan_all"];

export function deriveCapabilities(input: CapabilityInputs): TripCapabilities {
  const role = capabilityViewerRole(input.viewer);
  // canPay: the plan's owner, by BOTH the plancard role and `trips.user_id` — the owner test every paid route below runs.
  const canPay = role === "owner" && input.viewer.ownsTrip;
  const viewerNo = `viewer_${role}`;
  const allowed = input.signup.purchasesAllowed;
  const actions = {} as TripCapabilityActions;
  const reasons = {} as Record<keyof TripCapabilityActions, string>;

  // optimize — mirrors POST /api/optimization-payments (optimization.routes.ts): owner by trips.user_id, the P-1s
  // waitlist gate FIRST, the fee row's isDisabled, then `coversAction(optimizer_run)` (pass with runs left) → free.
  if (!canPay) [actions.optimize, reasons.optimize] = ["no", viewerNo];
  else if (!allowed) [actions.optimize, reasons.optimize] = ["waitlist", "waitlist"];
  else if (input.optimizerFeeDisabled) [actions.optimize, reasons.optimize] = ["no", "optimizer_disabled"];
  else if (input.checkoutEmailDenied) [actions.optimize, reasons.optimize] = ["verify", "email_unverified"];
  else if (input.pass.active && (input.pass.runs?.left ?? 0) > 0) [actions.optimize, reasons.optimize] = ["free", "pass_runs_left"];
  else [actions.optimize, reasons.optimize] = ["pay", input.pass.active ? "pass_runs_used" : "pay"];

  // ask — mirrors POST /api/trips/:tripId/proposals/:id/pay (trips.routes.ts): owner tier, the waitlist gate first,
  // then `coversAction(ai_task)` (any active pass) → free.
  if (!canPay) [actions.ask, reasons.ask] = ["no", viewerNo];
  else if (!allowed) [actions.ask, reasons.ask] = ["waitlist", "waitlist"];
  else if (input.checkoutEmailDenied) [actions.ask, reasons.ask] = ["verify", "email_unverified"];
  else if (input.pass.active) [actions.ask, reasons.ask] = ["free", "pass_active"];
  else [actions.ask, reasons.ask] = ["pay", "pay"];

  // handoff — mirrors the handoff routes (handoff.routes.ts): ask/quote are owner-only (verifyTripOwnership) behind the
  // waitlist gate, `askHandoff` refuses while a request is in progress, and approve takes `status = 'delivered'` on
  // the owner's own row. Approve moves no money at the route (the fee was captured at accept), so the waitlist does
  // not hide it.
  const h = input.handoff;
  const hStatus = h?.status ?? null;
  if (!canPay) [actions.handoff, reasons.handoff] = ["no", viewerNo];
  else if (hStatus === "delivered") [actions.handoff, reasons.handoff] = ["approve", "handoff_delivered"];
  else if (hStatus && (HANDOFF_IN_PROGRESS_STATUSES as readonly string[]).includes(hStatus)) [actions.handoff, reasons.handoff] = ["in_progress", `handoff_${hStatus}`];
  else if (!allowed) [actions.handoff, reasons.handoff] = ["no", "waitlist"];
  else if (input.handoffEmailDenied) [actions.handoff, reasons.handoff] = ["verify", "email_unverified"];
  else [actions.handoff, reasons.handoff] = ["offer", h ? `handoff_${hStatus ?? "ended"}` : "no_handoff"];

  // handoffBook — the same gate plus the `handoff_booking` switch: a NEW `book` ask or quote is refused with 410
  // `handoff_booking_off` while it is off (handoff.routes.ts bookingHandoffOff). polish / plan_all are unaffected.
  if (actions.handoff !== "offer" && actions.handoff !== "verify") [actions.handoffBook, reasons.handoffBook] = ["no", reasons.handoff];
  else if (!input.handoffBookingOn) [actions.handoffBook, reasons.handoffBook] = ["no", "handoff_booking_off"];
  else if (actions.handoff === "verify") [actions.handoffBook, reasons.handoffBook] = ["verify", "email_unverified"];
  else [actions.handoffBook, reasons.handoffBook] = ["offer", "handoff_booking_on"];

  // checkout — mirrors POST /api/checkout (payments.routes.ts): the P-1s gate, the viewer and requireVerifiedEmail.
  // No handoff kind or status lowers it (ruling 1: no server gate blocks checkout during a handoff).
  if (!canPay) [actions.checkout, reasons.checkout] = ["no", viewerNo];
  else if (!allowed) [actions.checkout, reasons.checkout] = ["waitlist", "waitlist"];
  else if (input.checkoutEmailDenied) [actions.checkout, reasons.checkout] = ["verify", "email_unverified"];
  else [actions.checkout, reasons.checkout] = ["yes", "purchases_allowed"];

  // tripPass — mirrors POST /api/trips/:tripId/trip-pass/purchase (trip-pass.routes.ts): owner by trips.user_id, the
  // waitlist gate, one active pass per trip (409), and an active, positively priced plan row (400).
  if (!canPay) [actions.tripPass, reasons.tripPass] = ["no", viewerNo];
  else if (input.pass.active) [actions.tripPass, reasons.tripPass] = ["active", "pass_active"];
  else if (!allowed) [actions.tripPass, reasons.tripPass] = ["waitlist", "waitlist"];
  else if (!input.tripPassPlanAvailable) [actions.tripPass, reasons.tripPass] = ["no", "trip_pass_unavailable"];
  else if (input.checkoutEmailDenied) [actions.tripPass, reasons.tripPass] = ["verify", "email_unverified"];
  else [actions.tripPass, reasons.tripPass] = ["offer", "no_pass"];

  // concierge — the CN-1 hire is the ordinary cart + checkout of a concierge listing (R796: requestOnlyListingRefusals
  // exempts it), so it takes checkout's gate; an engagement already under way on this trip is "in_progress".
  const c = input.concierge;
  const cLive = !!c && !(CONCIERGE_ENDED_STATUSES as readonly string[]).includes(String(c.status ?? ""));
  if (!canPay) [actions.concierge, reasons.concierge] = ["no", viewerNo];
  else if (cLive) [actions.concierge, reasons.concierge] = ["in_progress", `concierge_${c!.status ?? "unknown"}`];
  else if (!allowed) [actions.concierge, reasons.concierge] = ["no", "waitlist"];
  else if (input.checkoutEmailDenied) [actions.concierge, reasons.concierge] = ["verify", "email_unverified"];
  else [actions.concierge, reasons.concierge] = ["offer", c ? `concierge_${c.status ?? "ended"}` : "no_concierge"];

  const kind = h?.kind && (KINDS as readonly string[]).includes(h.kind) ? (h.kind as HandoffKind) : null;
  const accessUntil = c?.accessUntil ? new Date(c.accessUntil as any) : null;
  return {
    viewer: { role, canEdit: input.viewer.canEdit, canPay, emailVerified: input.viewer.emailVerified },
    signup: { mode: input.signup.mode, purchasesAllowed: allowed },
    pass: { active: input.pass.active, runs: input.pass.active ? input.pass.runs : null },
    handoff: {
      present: !!h,
      kind,
      status: hStatus,
      scopeItemIds: h ? [...h.scopeItemIds] : [],
      pendingSuggestions: input.pendingSuggestions,
      onTripSupport: h?.onTripSupportAcceptedAt ? "accepted" : h?.onTripSupportOfferedAt ? "offered" : "none",
    },
    concierge: {
      present: !!c,
      status: c?.status ?? null,
      accessUntil: accessUntil && !Number.isNaN(accessUntil.getTime()) ? accessUntil.toISOString() : null,
    },
    actions,
    reasons,
  };
}
