/**
 * The ONE client owner of starting membership checkout.
 *
 * The server remains authoritative for eligibility, price selection, and entitlement. This
 * module sends only the plan key, names every server refusal for the traveler, and redirects to
 * Stripe only when the server returns a Checkout Session URL.
 */

export const MEMBERSHIP_CHECKOUT_REFUSALS = [
  "sales_disabled",
  "plan_not_subscribable",
  "plan_unavailable",
  "already_member",
  "price_not_configured",
  "stripe_error",
] as const;

export type MembershipCheckoutRefusal = (typeof MEMBERSHIP_CHECKOUT_REFUSALS)[number];

export interface MembershipCheckoutNotice {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}

const REFUSAL_COPY: Record<MembershipCheckoutRefusal, MembershipCheckoutNotice> = {
  sales_disabled: {
    title: "Plus is coming soon",
    description: "Plus purchases are not open yet. You can still set up your occasions now.",
  },
  plan_not_subscribable: {
    title: "This plan is not a membership",
    description: "This plan cannot be purchased as a recurring membership.",
    variant: "destructive",
  },
  plan_unavailable: {
    title: "Plus is unavailable",
    description: "Plus is not available to purchase right now. Please check back later.",
    variant: "destructive",
  },
  already_member: {
    title: "You already have Plus",
    description: "Your Plus membership is active. Open your occasions to use it.",
  },
  price_not_configured: {
    title: "Plus is not purchasable right now",
    description: "We have not finished configuring Plus checkout. You were not charged.",
    variant: "destructive",
  },
  stripe_error: {
    title: "Checkout could not start",
    description: "Stripe could not open checkout. You were not charged; please try again.",
    variant: "destructive",
  },
};

export function membershipCheckoutRefusalCopy(reason: MembershipCheckoutRefusal): MembershipCheckoutNotice {
  return REFUSAL_COPY[reason];
}

function isMembershipCheckoutRefusal(value: unknown): value is MembershipCheckoutRefusal {
  return (
    typeof value === "string" &&
    (MEMBERSHIP_CHECKOUT_REFUSALS as readonly string[]).includes(value)
  );
}

interface StartMembershipCheckoutOptions {
  planKey: "plus_annual";
  onSignInRequired: () => void;
  onNotice: (notice: MembershipCheckoutNotice) => void;
}

export async function startMembershipCheckout({
  planKey,
  onSignInRequired,
  onNotice,
}: StartMembershipCheckoutOptions): Promise<void> {
  let response: Response;

  try {
    response = await fetch("/api/memberships/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey }),
    });
  } catch (error) {
    console.error("[membership-checkout] Stripe checkout request failed", error);
    onNotice(membershipCheckoutRefusalCopy("stripe_error"));
    return;
  }

  if (response.status === 401) {
    onSignInRequired();
    return;
  }

  const body = await response.json().catch(() => ({})) as {
    reason?: unknown;
    message?: unknown;
    url?: unknown;
  };

  if (!response.ok) {
    const reason = isMembershipCheckoutRefusal(body.reason) ? body.reason : "stripe_error";
    if (reason === "price_not_configured") {
      console.error("[membership-checkout] Plus price is not configured for the active Stripe mode", {
        status: response.status,
        message: typeof body.message === "string" ? body.message : undefined,
      });
    }
    onNotice(membershipCheckoutRefusalCopy(reason));
    return;
  }

  if (typeof body.url !== "string" || body.url.length === 0) {
    console.error("[membership-checkout] Successful response did not contain a Checkout Session URL");
    onNotice(membershipCheckoutRefusalCopy("stripe_error"));
    return;
  }

  window.location.assign(body.url);
}