/**
 * CAP-1 (ledger `2026-11-03-cap1-trip-capabilities`): the shape of `GET /api/trips/:tripId/capabilities`, read by the
 * server's pure derivation and by the client hook. Facts the server already enforces, restated; it grants nothing.
 * It carries NO amounts (§7) — prices stay on the reads that already return them.
 *
 * "verify" (every paid action): the ONLY refusal the server would make is the verified-email gate
 * (`requireVerifiedEmail`, or `refuseUnverifiedTravelerSender` on the handoff ask), reason `email_unverified`. Precedence
 * is viewer "no" → waitlist → verify → the allowed value; any other refusal that also applies wins over "verify".
 */
import type { HandoffKind } from "./handoff";

export type CapabilityViewerRole = "owner" | "author" | "collaborator" | "delegate" | "payer" | "expert" | "concierge";

export type OptimizeAction = "free" | "pay" | "waitlist" | "verify" | "no";
export type AskAction = "free" | "pay" | "waitlist" | "verify" | "no";
export type HandoffAction = "offer" | "in_progress" | "approve" | "verify" | "no";
export type HandoffBookAction = "offer" | "verify" | "no";
export type CheckoutAction = "yes" | "waitlist" | "verify" | "no";
export type TripPassAction = "offer" | "active" | "waitlist" | "verify" | "no";
export type ConciergeAction = "offer" | "in_progress" | "verify" | "no";

export interface TripCapabilityActions {
  optimize: OptimizeAction;
  ask: AskAction;
  handoff: HandoffAction;
  /** A NEW `book`-kind ask (the `handoff_booking` switch); `polish` / `plan_all` follow `handoff`. */
  handoffBook: HandoffBookAction;
  checkout: CheckoutAction;
  tripPass: TripPassAction;
  concierge: ConciergeAction;
}

export interface TripCapabilities {
  viewer: { role: CapabilityViewerRole; canEdit: boolean; canPay: boolean; emailVerified: boolean };
  signup: { mode: "open" | "waitlist"; purchasesAllowed: boolean };
  pass: { active: boolean; runs: { cap: number; used: number; left: number } | null };
  handoff: {
    present: boolean;
    kind: HandoffKind | null;
    status: string | null;
    scopeItemIds: string[];
    pendingSuggestions: number;
    onTripSupport: "none" | "offered" | "accepted";
  };
  concierge: { present: boolean; status: string | null; accessUntil: string | null };
  actions: TripCapabilityActions;
  /** Machine codes only, one per action — never shown as text (review edit 4). */
  reasons: Record<keyof TripCapabilityActions, string>;
}

export const TRIP_CAPABILITY_ACTION_KEYS = ["optimize", "ask", "handoff", "handoffBook", "checkout", "tripPass", "concierge"] as const;
