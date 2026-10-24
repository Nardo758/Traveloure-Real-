/**
 * Earner payout setup screens (ledger `2026-10-23-payout-setup-screens`; fix-queue row 115). The words (FOUNDER
 * WORDING REVIEW on the PR) and the small client rules over `GET/PUT /api/me/payout-setup`.
 *
 * Stripe Connect is the primary method; PayPal or another method is the alternative. Earnings accrue from the first
 * booking and payouts are held until setup is complete — the screens say so and never block earning. Nothing here
 * asks for, or hints at, bank details. The server decides `setupComplete` and refuses a bad handle; the screen
 * shows the server's message.
 */
export const PAYOUT_SETUP_URL = "/api/me/payout-setup";

export type PayoutMethodType = "stripe_connect" | "paypal" | "other";

export interface PayoutSetup {
  earnerType: "expert" | "provider";
  connectStatus: string | null;
  connectSource: string | null;
  stripeAccountPresent: boolean;
  canReceivePayments: boolean;
  stripeTransferReady: boolean;
  payoutMethodType: PayoutMethodType | null;
  payoutHandlePresent: boolean;
  payoutHandleAccepted: boolean;
  setupComplete: boolean;
  payoutHandle: string | null;
}

export const PAYOUT_HANDLE_MAX = 254;

export const PAYOUT_SETUP_COPY = {
  cardTitle: "Payout details",
  cardDescription: "Where we send the money you earn on Traveloure.",
  completeStripe: "Payouts are set up. We send them to your Stripe account.",
  completeHandle: (method: string, handle: string) => `Payouts are set up. We send them by ${method} to ${handle}.`,
  incomplete: "Payouts are on hold until you finish setup. You still earn from every booking, and your earnings stay on your account until then.",
  connectInProgress: "Your Stripe account is connected but not ready for payouts yet. Finish the steps Stripe asks for.",
  stripePrimary: "Set up payouts with Stripe",
  stripeContinue: "Continue Stripe setup",
  stripeOpening: "Opening Stripe…",
  stripeFailed: "Could not open Stripe setup",
  useAlternative: "Use PayPal or another method instead",
  useStripeInstead: "Use Stripe instead",
  fieldMethod: "Payout method",
  fieldHandlePaypal: "PayPal email or username",
  fieldHandleOther: "How we should pay you",
  handleHintPaypal: "The email or username on your PayPal account.",
  handleHintOther: "The name of the service and your username on it.",
  save: "Save payout details",
  saving: "Saving…",
  saved: "Payout details saved",
  saveFailed: "Could not save payout details",
  change: "Change payout details",
  loadFailed: "Could not load your payout details",
  noSavedCardNeeded: "You don't need a saved card to get paid.",

  promptOnboardingTitle: "Set up payouts",
  promptOnboardingBody: "Add your payout details now so you are paid as soon as you start earning.",
  promptEarningTitle: "You have earnings waiting",
  promptEarningBody: "Your payouts are on hold until you finish payout setup. Your earnings stay on your account.",
  promptAction: "Set up payouts",

  payoutBlockedTitle: "Payout on hold",
} as const;

export const PAYOUT_METHOD_LABELS: Record<PayoutMethodType, string> = {
  stripe_connect: "Stripe",
  paypal: "PayPal",
  other: "Other",
};

/** Which state the card draws. One derivation, from the server's own fields. */
export type PayoutCardState = "complete_stripe" | "complete_handle" | "connect_in_progress" | "incomplete";
export function payoutCardState(s: PayoutSetup): PayoutCardState {
  if (s.setupComplete) {
    return s.payoutMethodType === "paypal" || s.payoutMethodType === "other" ? "complete_handle" : "complete_stripe";
  }
  if (s.payoutMethodType !== "paypal" && s.payoutMethodType !== "other" && s.stripeAccountPresent) return "connect_in_progress";
  return "incomplete";
}

/** The PUT body. Stripe sends no handle; PayPal and other send the trimmed handle. */
export function payoutSetupBody(method: PayoutMethodType, handle: string) {
  return method === "stripe_connect" ? { payoutMethodType: method } : { payoutMethodType: method, payoutHandle: handle.trim() };
}

export function handleReady(method: PayoutMethodType, handle: string): boolean {
  if (method === "stripe_connect") return true;
  const t = handle.trim();
  return t.length > 0 && t.length <= PAYOUT_HANDLE_MAX;
}

/** The server's own `{ error, message }` from an `apiRequest` error ("<status>: <body>"). */
export function serverError(err: unknown): { status: number | null; error: string | null; message: string | null } {
  const raw = String((err as Error)?.message ?? "");
  const m = /^(\d{3}):\s*([\s\S]*)$/.exec(raw);
  if (!m) return { status: null, error: null, message: null };
  try {
    const body = JSON.parse(m[2]);
    return { status: Number(m[1]), error: typeof body?.error === "string" ? body.error : null, message: typeof body?.message === "string" ? body.message : null };
  } catch {
    return { status: Number(m[1]), error: null, message: null };
  }
}

/** A payout request refused for setup: the server's message, as-is. Null for every other refusal. */
export function payoutSetupBlock(err: unknown): string | null {
  const e = serverError(err);
  if (e.error === "stripe_not_connected" || e.error === "payout_setup_incomplete") return e.message;
  return null;
}

/** The in-app prompt shows only while setup is incomplete; which one depends on whether anything was earned yet. */
export function payoutPromptMoment(setup: PayoutSetup | undefined, hasEarnings: boolean): "onboarding" | "first_earning" | null {
  if (!setup || setup.setupComplete) return null;
  return hasEarnings ? "first_earning" : "onboarding";
}
