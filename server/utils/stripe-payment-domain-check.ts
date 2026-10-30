// Row 283 (ledger `2026-10-29-apple-pay-domain-check`): a read-only boot check that warns when the
// site's domain is not registered (and Apple Pay active) as a Stripe payment method domain.
//
// LD 43(e): Apple Pay needs a one-time Stripe-dashboard domain registration, and that registration
// is an OPERATOR step (Leon, in the Stripe dashboard) — this code never registers anything. It only
// LISTS `payment_method_domains` and logs a warning naming each problem.
//
// Architect, Oct 29, 2026: warn-only, env-gated, never fails boot, no Stripe call in tests.
//   - Off unless STRIPE_PAYMENT_DOMAIN_CHECK=1. Off, or with no usable Stripe key, it makes no call.
//   - Every failure (the list throws, a bad answer) is one warning; nothing is thrown to the caller.
//   - The comparison is pure (`paymentDomainProblems`) and the lister is injected, so tests make no
//     Stripe call.
import { logger } from "../infrastructure/logger";
import { getStripeSecretKey } from "./stripe-key";
import { SITE_ORIGIN } from "@shared/site-origin";

export const STRIPE_PAYMENT_DOMAIN_CHECK_ENV = "STRIPE_PAYMENT_DOMAIN_CHECK";

/** The fields of a Stripe `payment_method_domain` this check reads. */
export interface PaymentMethodDomainView {
  domain_name: string;
  enabled: boolean;
  apple_pay?: { status?: string | null } | null;
}

export type PaymentDomainProblem = {
  domain: string;
  problem: "not_registered" | "disabled" | "apple_pay_inactive";
};

export type PaymentDomainCheckOutcome = "off" | "no_key" | "ok" | "warned" | "error";

/** The domain the checkout is served from: the canonical origin's host (www, row 258). */
export function expectedPaymentDomains(origin: string = SITE_ORIGIN): string[] {
  return [new URL(origin).hostname.toLowerCase()];
}

/** Pure: each expected domain that is missing, disabled, or has Apple Pay not active. */
export function paymentDomainProblems(
  expected: readonly string[],
  listed: readonly PaymentMethodDomainView[],
): PaymentDomainProblem[] {
  const byName = new Map(listed.map((d) => [String(d.domain_name ?? "").toLowerCase(), d]));
  const problems: PaymentDomainProblem[] = [];
  for (const domain of expected) {
    const row = byName.get(domain.toLowerCase());
    if (!row) problems.push({ domain, problem: "not_registered" });
    else if (!row.enabled) problems.push({ domain, problem: "disabled" });
    else if (row.apple_pay?.status !== "active") problems.push({ domain, problem: "apple_pay_inactive" });
  }
  return problems;
}

async function listFromStripe(): Promise<PaymentMethodDomainView[]> {
  const { stripe } = await import("../services/stripe-payment.service");
  const page = await stripe.paymentMethodDomains.list({ limit: 100 });
  return page.data;
}

/**
 * Warn (never throw) when the site's domain is not a ready Stripe payment method domain. Returns
 * what happened so a caller or a test can tell "off" from "checked and fine".
 */
export async function warnIfPaymentDomainsUnregistered(
  opts: {
    env?: NodeJS.ProcessEnv;
    list?: () => Promise<readonly PaymentMethodDomainView[]>;
    warn?: (obj: Record<string, unknown>, msg: string) => void;
    expected?: readonly string[];
  } = {},
): Promise<PaymentDomainCheckOutcome> {
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((obj, msg) => logger.warn(obj, msg));
  try {
    if (env[STRIPE_PAYMENT_DOMAIN_CHECK_ENV] !== "1") return "off";
    if (!getStripeSecretKey(env)) return "no_key";
    const listed = await (opts.list ?? listFromStripe)();
    const problems = paymentDomainProblems(opts.expected ?? expectedPaymentDomains(), listed);
    if (problems.length === 0) return "ok";
    warn(
      { problems },
      "Stripe payment method domain not ready — Apple Pay will not show on this domain until it is registered and verified in the Stripe dashboard (Settings → Payment method domains)",
    );
    return "warned";
  } catch (err) {
    warn({ error: err instanceof Error ? err.message : String(err) }, "Stripe payment method domain check could not run");
    return "error";
  }
}
