import type { AutomationContext, AutomationDefinition } from "../contract";

export const verificationHeldListingActivationAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.verification-held-listing-activation",
  name: "Activate approved listings held for owner verification",
  domain: "moderation",
  type: "operational",
  trigger: {
    kind: "event",
    events: ["identity.verification_session.verified", "account.updated.business_verification_verified"],
  },
  condition: {
    description: "Only a verified identity or business-verification transition with a resolved owner ID may trigger the shared follow-on.",
    evaluate: (context) => typeof context.userId === "string" &&
      (context.event === "identity.verification_session.verified" ||
        (context.event === "account.updated.business_verification_verified" && context.businessVerified === true)),
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "activateVerificationHeldListings re-evaluates the shared role-aware publish predicate and updates only this owner's approved+draft listings; paused listings are excluded.",
  action: { kind: "mutate_record", detail: "Call the existing shared verification-held listing activation service" },
  retryPolicy: "No local retry/backfill; the webhook caller catches and logs failure as non-fatal.",
  failureBehavior: "Verification webhook handling remains successful/non-fatal on activation failure; no approval or owner-paused listing is changed.",
  enabled: true,
};