/**
 * payment-method-setup.ts — the signed-in payment-method step
 * (ledger `2026-10-21-signup-payment-step`, amended by
 * `2026-10-22-card-gate-skippable`).
 *
 * The password form does not sign the person in, so it cannot open a SetupIntent.
 * Email sign-up and social sign-in (Facebook, Replit OIDC) both land in a session.
 * This predicate is the one decision for that session.
 *
 * Every account is offered the same dismissible prompt. There is no createdAt
 * cutoff and no lock-out. "Not now" hides it until the next sign-in (session
 * storage, cleared on sign-out). The first paid action still uses the two
 * SavePaymentMethodPrompt mounts (Trip Pass and Finalize).
 *
 * A list read that is still loading, or that came back `available: false`, is
 * not "no method" (§13) and shows nothing.
 *
 * Supply sessions skip the prompt (ledger `2026-10-22-card-gate-skip-supply`).
 * `supplyPaymentGateSkipped` is the one decision: a supply route, an earner role,
 * or a recorded supply sign-up. Traveler pages stay on the prompt.
 */
import { isEarnerRole } from "@shared/roles";
import { SUPPLY_APPLICATION_BY_ROLE } from "@shared/supply-entry";

export const PAYMENT_METHOD_PROMPT_DISMISS_KEY = "traveloure.paymentMethodSetup.dismissed";

export const SIGNUP_PAYMENT_STEP_NOTE =
  "Saving a payment method happens after you sign in, not on this form.";

export const PAYMENT_METHOD_OFFER =
  "Save a payment method for the next time you pay. You can skip this and keep using your account.";

/** The same sentence, under the name the pre-cutoff prompt already used. */
export const EXISTING_ACCOUNT_PAYMENT_PROMPT = PAYMENT_METHOD_OFFER;

export const ADD_PAYMENT_METHOD_BUTTON = "Add a payment method";

export const PAYMENT_METHOD_PROMPT_DISMISS = "Not now";

export type PaymentMethodSetupMode = "hidden" | "prompt";

export interface PaymentMethodSetupInput {
  signedIn: boolean;
  /** Terms or privacy not accepted yet. The terms page stays reachable. */
  termsPending: boolean;
  /** `available` from GET /api/me/payment-methods. False means the read did not answer. */
  available: boolean;
  /** The list read is still in flight. */
  isLoading: boolean;
  methodCount: number;
  dismissedThisSession: boolean;
  /** Current location, query included or not. Supply routes skip the prompt. */
  pathname?: string | null;
  /** `users.role`. Earner roles skip the prompt on every page. */
  role?: string | null;
  /**
   * `users.signup_source`. Written only by `recordSignupSource`, and only for a
   * supply sign-up that offered a source tag. A non-empty value is that sign-up.
   */
  signupSource?: string | null;
}

/**
 * Routes the traveler card prompt must not cover.
 * Application hrefs come from `SUPPLY_APPLICATION_BY_ROLE`, so the sign-in
 * return `/become-expert?type=local_expert` stays on that list. `/earn` is the
 * role-less continuation. Expert and provider consoles use a segment boundary
 * so `/experts` and `/providers` stay traveler pages.
 */
const SUPPLY_ROUTE_PREFIXES = [
  "/earn",
  "/expert-status",
  "/provider-status",
  "/travel-experts",
  "/services-provider",
  "/partner-with-us",
] as const;

function normalizedGatePath(pathname: string | null | undefined): string {
  const bare = (pathname ?? "").split("#")[0].split("?")[0].trim();
  if (!bare) return "/";
  const withSlash = bare.startsWith("/") ? bare : `/${bare}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function pathUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** True for a supply application, chooser, status page, or expert/provider console. */
export function isSupplyPaymentGatePath(pathname: string | null | undefined): boolean {
  const path = normalizedGatePath(pathname);
  if (path === "/expert" || path.startsWith("/expert/")) return true;
  if (path === "/provider" || path.startsWith("/provider/")) return true;
  if (SUPPLY_ROUTE_PREFIXES.some((prefix) => pathUnder(path, prefix))) return true;
  for (const href of Object.values(SUPPLY_APPLICATION_BY_ROLE)) {
    if (pathUnder(path, normalizedGatePath(href))) return true;
  }
  return false;
}

/**
 * True when `recordSignupSource` stored a tag. Intent itself is not a column:
 * the writer runs only for `intent=supply`, and a supply sign-up with no tag
 * stays NULL. That account is exempted by the route it is on.
 */
export function hasRecordedSupplySignup(signupSource: string | null | undefined): boolean {
  return typeof signupSource === "string" && signupSource.trim().length > 0;
}

/** The one skip. A supply route, an earner role, or a recorded supply sign-up. */
export function supplyPaymentGateSkipped(input: {
  pathname?: string | null;
  role?: string | null;
  signupSource?: string | null;
}): boolean {
  return (
    isSupplyPaymentGatePath(input.pathname) ||
    isEarnerRole(input.role) ||
    hasRecordedSupplySignup(input.signupSource)
  );
}

export function paymentMethodSetupMode(input: PaymentMethodSetupInput): PaymentMethodSetupMode {
  if (supplyPaymentGateSkipped(input)) return "hidden";
  if (!input.signedIn || input.termsPending) return "hidden";
  if (input.isLoading) return "hidden";
  if (!input.available) return "hidden";
  if (input.methodCount > 0) return "hidden";
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
