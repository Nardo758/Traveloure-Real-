/**
 * Payout setup rules (ledger `2026-10-23-payout-setup-server`). Pure: no database, no Stripe.
 *
 * Stripe Connect is the primary method. paypal and other can be recorded on the users row.
 * A handle is a PayPal email or username. Anything that looks like a bank account or routing
 * number is rejected, and a rejected stored value is never copied onto a response.
 *
 * Experts: Connect status is local_expert_forms.stripe_connect_status.
 * Providers: the users row (stripe account id + can_receive_payments) is the Connect fact.
 * The duplicate Connect columns on the expert form are not retired here.
 */
import { z } from "zod";
import { isEarnerRole, isExpertRole } from "@shared/roles";
import { connectStatusSatisfied } from "./stripe-connect-reminder-policy";

export const PAYOUT_METHOD_TYPES = ["stripe_connect", "paypal", "other"] as const;
export type PayoutMethodType = (typeof PAYOUT_METHOD_TYPES)[number];
export type EarnerType = "expert" | "provider";

export const PAYOUT_HANDLE_MAX = 254;

/** Kept verbatim so POST /api/payouts/request still returns this block. */
export const STRIPE_NOT_CONNECTED_MESSAGE =
  "Connect your Stripe account before requesting a payout. Finish setup in Settings to get started.";

export const PAYOUT_SETUP_INCOMPLETE_MESSAGE =
  "Payout setup is not complete. Earnings stay on the account until payout setup is finished. No payout was sent.";

export const PAYOUT_NOT_STRIPE_TRANSFER_MESSAGE =
  "This payout method is outside Stripe. No Stripe transfer was sent.";

export const ADMIN_PAYOUT_NOT_CREATED_MESSAGE =
  "Payout setup is not complete. No payout was created.";

// A keyword glued to digits (`acct1234567`) has no trailing word boundary: the next
// character is a word character. `(?=\d|\b)` still matches that shape, and still
// refuses a longer word such as `accountable`.
const BANK_KEYWORD = /\b(routing|rtn|aba|account|acct|iban|swift|bic|sort[\s-]?code|bsb|micr)(?=\d|\b)/i;

/**
 * True when the text looks like a bank account number, a routing number, or an IBAN.
 * A 9-digit routing number is rejected whether or not the ABA checksum matches.
 * PayPal emails and usernames (no long digit run, no account keyword) are not matches.
 */
export function payoutHandleLooksLikeBankOrRouting(raw: string): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  const compact = value.replace(/[\s-]/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(compact)) return true;
  const collapsed = value.replace(/(?<=\d)[\s.\-]+(?=\d)/g, "");
  if (/^\d{6,}$/.test(collapsed)) return true;
  if (/\d{8,}/.test(collapsed)) return true;
  const runs = collapsed.match(/\d{6,}/g);
  if (BANK_KEYWORD.test(value) && runs?.some((run) => run.length >= 6)) return true;
  return false;
}

export function asPayoutMethodType(value: string | null | undefined): PayoutMethodType | null {
  if (value === "stripe_connect" || value === "paypal" || value === "other") return value;
  return null;
}

/** A stored handle safe to return and to treat as setup. A bank-like value becomes null. */
export function usablePayoutHandle(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const handle = stored.trim();
  if (!handle || handle.length > PAYOUT_HANDLE_MAX) return null;
  if (/[\s\u0000-\u001f]/.test(handle)) return null;
  if (payoutHandleLooksLikeBankOrRouting(handle)) return null;
  return handle;
}

export const payoutSetupBodySchema = z.object({
  payoutMethodType: z.enum(PAYOUT_METHOD_TYPES),
  payoutHandle: z.string().max(PAYOUT_HANDLE_MAX).nullable().optional(),
}).strict();

export type PayoutSetupWrite =
  | { ok: true; payoutMethodType: PayoutMethodType; payoutHandle: string | null }
  | { ok: false; error: "invalid_payout_setup" | "payout_handle_required" | "payout_handle_rejected" | "payout_handle_not_allowed"; message: string };

const INVALID_SETUP_MESSAGE = "Payout method must be stripe_connect, paypal, or other.";
const HANDLE_REQUIRED_MESSAGE = "A PayPal email or username is required for this payout method.";
const HANDLE_REJECTED_MESSAGE = "Use a PayPal email or username. Bank account and routing numbers cannot be stored.";
const HANDLE_NOT_ALLOWED_MESSAGE = "Stripe Connect does not take a payout handle.";

export function validatePayoutSetupWrite(body: unknown): PayoutSetupWrite {
  const parsed = payoutSetupBodySchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: "invalid_payout_setup", message: INVALID_SETUP_MESSAGE };
  const method = parsed.data.payoutMethodType;
  const raw = parsed.data.payoutHandle;
  const trimmed = raw == null ? "" : raw.trim();
  if (method === "stripe_connect") {
    if (trimmed) return { ok: false, error: "payout_handle_not_allowed", message: HANDLE_NOT_ALLOWED_MESSAGE };
    return { ok: true, payoutMethodType: method, payoutHandle: null };
  }
  if (!trimmed) return { ok: false, error: "payout_handle_required", message: HANDLE_REQUIRED_MESSAGE };
  if (trimmed.length > PAYOUT_HANDLE_MAX || /[\s\u0000-\u001f]/.test(trimmed) || payoutHandleLooksLikeBankOrRouting(trimmed)) {
    return { ok: false, error: "payout_handle_rejected", message: HANDLE_REJECTED_MESSAGE };
  }
  return { ok: true, payoutMethodType: method, payoutHandle: trimmed };
}

export type PayoutFacts = {
  role: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  canReceivePayments: boolean | null;
  payoutMethodType: string | null;
  payoutHandle: string | null;
  formStripeConnectStatus: string | null;
};

export type AdminPayoutSetup = {
  earnerType: EarnerType;
  connectStatus: string | null;
  connectSource: "local_expert_forms" | "users";
  stripeAccountPresent: boolean;
  canReceivePayments: boolean;
  stripeTransferReady: boolean;
  payoutMethodType: PayoutMethodType | null;
  payoutHandlePresent: boolean;
  payoutHandleAccepted: boolean;
  setupComplete: boolean;
};

export type OwnPayoutSetup = AdminPayoutSetup & {
  /** Usable handle only. A bank-like stored value is omitted. */
  payoutHandle: string | null;
};

export function buildPayoutSetup(facts: PayoutFacts, earnerType: EarnerType): OwnPayoutSetup {
  const method = asPayoutMethodType(facts.payoutMethodType);
  const unrecognizedMethod = !!facts.payoutMethodType && !method;
  const stored = facts.payoutHandle?.trim() ?? "";
  const usable = usablePayoutHandle(facts.payoutHandle);
  const stripeTransferReady = !!facts.stripeAccountId && !!facts.canReceivePayments;
  const connectReady = earnerType === "expert"
    ? connectStatusSatisfied(facts.formStripeConnectStatus)
    : stripeTransferReady;
  const external = method === "paypal" || method === "other";
  let setupComplete = false;
  if (!unrecognizedMethod) {
    if (external) setupComplete = usable != null;
    else setupComplete = connectReady;
  }
  return {
    earnerType,
    connectStatus: earnerType === "expert" ? (facts.formStripeConnectStatus ?? null) : (facts.stripeAccountStatus ?? null),
    connectSource: earnerType === "expert" ? "local_expert_forms" : "users",
    stripeAccountPresent: !!facts.stripeAccountId,
    canReceivePayments: !!facts.canReceivePayments,
    stripeTransferReady,
    payoutMethodType: method,
    payoutHandlePresent: stored.length > 0,
    payoutHandleAccepted: usable != null,
    setupComplete,
    payoutHandle: usable,
  };
}

export function toAdminPayoutSetup(setup: OwnPayoutSetup): AdminPayoutSetup {
  const { payoutHandle: _omitted, ...admin } = setup;
  return admin;
}

export type PayoutRequestDecision =
  | { action: "proceed"; rail: "stripe_connect" | "external" }
  | { action: "block"; error: "stripe_not_connected" | "payout_setup_incomplete"; message: string };

/**
 * Request gate. A complete paypal/other method skips the Stripe block and stops at the
 * existing pending-payout row (no PayPal API). Every other earner keeps the Stripe block,
 * and an earner whose Connect setup is not complete is held even when the users Stripe
 * columns would have allowed a transfer.
 */
export function decidePayoutRequest(facts: PayoutFacts | null): PayoutRequestDecision {
  if (!facts || !isEarnerRole(facts.role)) {
    return { action: "block", error: "payout_setup_incomplete", message: PAYOUT_SETUP_INCOMPLETE_MESSAGE };
  }
  const earnerType: EarnerType = isExpertRole(facts.role) ? "expert" : "provider";
  const setup = buildPayoutSetup(facts, earnerType);
  const external = setup.payoutMethodType === "paypal" || setup.payoutMethodType === "other";
  if (external && setup.setupComplete) return { action: "proceed", rail: "external" };
  if (!setup.stripeTransferReady) {
    return { action: "block", error: "stripe_not_connected", message: STRIPE_NOT_CONNECTED_MESSAGE };
  }
  if (!setup.setupComplete) {
    return { action: "block", error: "payout_setup_incomplete", message: PAYOUT_SETUP_INCOMPLETE_MESSAGE };
  }
  return { action: "proceed", rail: "stripe_connect" };
}

export type StripeTransferDecision =
  | { action: "transfer" }
  | { action: "block"; error: "payout_setup_incomplete" | "payout_not_stripe_transfer"; message: string };

/** Whether an admin completion may call Stripe. External methods never transfer. */
export function decideStripeTransfer(facts: PayoutFacts | null, earnerType: EarnerType): StripeTransferDecision {
  if (!facts) {
    return { action: "block", error: "payout_setup_incomplete", message: PAYOUT_SETUP_INCOMPLETE_MESSAGE };
  }
  const setup = buildPayoutSetup(facts, earnerType);
  if (!setup.setupComplete) {
    return { action: "block", error: "payout_setup_incomplete", message: PAYOUT_SETUP_INCOMPLETE_MESSAGE };
  }
  if (setup.payoutMethodType === "paypal" || setup.payoutMethodType === "other") {
    return { action: "block", error: "payout_not_stripe_transfer", message: PAYOUT_NOT_STRIPE_TRANSFER_MESSAGE };
  }
  return { action: "transfer" };
}
