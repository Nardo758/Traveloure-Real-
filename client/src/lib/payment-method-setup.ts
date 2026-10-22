/**
 * payment-method-setup.ts — the signed-in payment-method step
 * (ledger `2026-10-21-signup-payment-step`, amending Locked Decision 43(a)).
 *
 * The password form does not sign the person in, so it cannot open a SetupIntent.
 * Email sign-up and social sign-in (Facebook, Replit OIDC) both land in a session.
 * This predicate is the one decision for that session.
 *
 * Accounts created before the ruling's own date are existing accounts: a dismissible
 * prompt on this sign-in, not a lock-out. The first paid action still uses the two
 * SavePaymentMethodPrompt mounts (Trip Pass and Finalize). Accounts created on or
 * after that date are asked to save a method before continuing.
 *
 * A missing or unreadable createdAt is not treated as a new account. A list read
 * that is still loading, or that came back `available: false`, is not "no method"
 * (§13) and never locks the account out.
 */

/** The ruling's own date (Leon Dixon, Oct 21, 2026). Not a product timer. */
export const SAVED_METHOD_REQUIRED_FROM = "2026-10-21T00:00:00.000Z";

export const PAYMENT_METHOD_PROMPT_DISMISS_KEY = "traveloure.paymentMethodSetup.dismissed";

export const SIGNUP_PAYMENT_STEP_NOTE =
  "Saving a payment method happens after you sign in, not on this form.";

export const REQUIRED_PAYMENT_STEP_TITLE = "Add a payment method";

export const REQUIRED_PAYMENT_STEP_BODY =
  "This account needs a saved payment method before you continue. You are charged only when you choose to pay. Stripe stores the details, not Traveloure.";

export const REQUIRED_PAYMENT_STEP_SIGNIN_NOTE =
  "Password sign-up and social sign-in both reach this step after the account is signed in.";

export const PAYMENT_METHOD_CHECKING = "Checking saved payment methods.";

export const EXISTING_ACCOUNT_PAYMENT_PROMPT =
  "Save a payment method for the next time you pay. You can skip this and keep using your account.";

export const PAYMENT_METHOD_PROMPT_DISMISS = "Not now";

export const PAYMENT_METHOD_STEP_SIGN_OUT = "Sign out";

export type PaymentMethodSetupMode = "hidden" | "checking" | "required" | "prompt";

export interface PaymentMethodSetupInput {
  signedIn: boolean;
  /** Terms or privacy not accepted yet. The terms page stays reachable. */
  termsPending: boolean;
  createdAt: string | Date | null | undefined;
  /** `available` from GET /api/me/payment-methods. False means the read did not answer. */
  available: boolean;
  /** The list read is still in flight. */
  isLoading: boolean;
  methodCount: number;
  dismissedThisSession: boolean;
}

const REQUIRED_FROM_MS = Date.parse(SAVED_METHOD_REQUIRED_FROM);

/** True only for an account whose createdAt is on or after the ruling. Unknown dates are false. */
export function accountRequiresSavedMethod(createdAt: string | Date | null | undefined): boolean {
  if (createdAt == null || createdAt === "") return false;
  const ms = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  if (!Number.isFinite(ms)) return false;
  return ms >= REQUIRED_FROM_MS;
}

export function paymentMethodSetupMode(input: PaymentMethodSetupInput): PaymentMethodSetupMode {
  if (!input.signedIn || input.termsPending) return "hidden";
  const requires = accountRequiresSavedMethod(input.createdAt);
  if (input.isLoading) return requires ? "checking" : "hidden";
  if (!input.available) return "hidden";
  if (input.methodCount > 0) return "hidden";
  if (requires) return "required";
  if (input.dismissedThisSession) return "hidden";
  return "prompt";
}

export function readPaymentMethodPromptDismissed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(PAYMENT_METHOD_PROMPT_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePaymentMethodPromptDismissed(): void {
  try {
    globalThis.sessionStorage?.setItem(PAYMENT_METHOD_PROMPT_DISMISS_KEY, "1");
  } catch {
    /* a blocked store shows the prompt again; it never locks the account. */
  }
}

/** Called on sign-out so the next sign-in in this tab asks again. */
export function clearPaymentMethodPromptDismissed(): void {
  try {
    globalThis.sessionStorage?.removeItem(PAYMENT_METHOD_PROMPT_DISMISS_KEY);
  } catch {
    /* sign-out still proceeds. */
  }
}
