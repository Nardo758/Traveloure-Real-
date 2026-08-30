/**
 * Task #1675 payment mutation authorization audit inventory.
 *
 * This is deliberately a manifest rather than a collection of made-up route tests.  A row is
 * only promoted to `exercised` when the audit can create the referenced User B resource, mount
 * the real route, and snapshot all rows it may mutate.  In particular, a 404 against a random
 * UUID is not authorization evidence.
 */
export type AuditState = "untested" | "exercised";

export type PaymentMutationAuditRow = {
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  source: string;
  /** Exact route declaration, used by the integrity test to catch inventory drift. */
  declaration: string;
  ownership: "none" | "session" | "resource" | "admin" | "stripe-signature";
  state: AuditState;
  reason: string;
};

const notYetSafelyMounted =
  "Untested: this repository has no isolated authenticated HTTP fixture that mounts the real " +
  "route with User A/User B sessions and a disposable DB transaction. Do not substitute a random-id 404.";

export const paymentMutationAuthorizationManifest: readonly PaymentMutationAuditRow[] = [
  // Checkout / booking payment rail.
  { method: "POST", path: "/api/checkout", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/checkout", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/:id/pay-balance", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/bookings/:id/pay-balance", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/process-cart", source: "server/routes/bookings.ts", declaration: "router.post('/process-cart', isAuthenticated", ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/confirm-payment", source: "server/routes/bookings.ts", declaration: "router.post('/confirm-payment', isAuthenticated", ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/refund", source: "server/routes/bookings.ts", declaration: "router.post('/refund', isAuthenticated", ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/:id/confirm-completion", source: "server/routes/bookings.ts", declaration: "router.post('/:id/confirm-completion', isAuthenticated", ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/bookings/:id/dispute", source: "server/routes/bookings.ts", declaration: "router.post('/:id/dispute', isAuthenticated", ownership: "resource", state: "untested", reason: notYetSafelyMounted },

  // Per-user payment instruments and paid AI / expert services.
  { method: "POST", path: "/api/me/payment-methods/setup-intent", source: "server/routes/payment-methods.routes.ts", declaration: 'router.post("/api/me/payment-methods/setup-intent", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/me/payment-methods/default", source: "server/routes/payment-methods.routes.ts", declaration: 'router.post("/api/me/payment-methods/default", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "DELETE", path: "/api/me/payment-methods/:id", source: "server/routes/payment-methods.routes.ts", declaration: 'router.delete("/api/me/payment-methods/:id", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/optimization-payments", source: "server/routes/optimization.routes.ts", declaration: 'router.post("/api/optimization-payments", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/optimization-payments/confirm", source: "server/routes/optimization.routes.ts", declaration: 'router.post("/api/optimization-payments/confirm", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/expert-requests/payment-intent", source: "server/routes/booking-actions.ts", declaration: "router.post('/expert-requests/payment-intent', isAuthenticated", ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/contracts/:id/payment", source: "server/routes.ts", declaration: 'app.post("/api/contracts/:id/payment", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/contracts/:id/milestone", source: "server/routes.ts", declaration: 'app.post("/api/contracts/:id/milestone", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/participants/:id/payment", source: "server/routes/content.routes.ts", declaration: 'router.post("/api/participants/:id/payment", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },

  // Coordination and ready-made purchase rails.
  { method: "POST", path: "/api/coordination-states/:id/pay", source: "server/routes.ts", declaration: 'app.post("/api/coordination-states/:id/pay", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/coordination-states/:id/pay/confirm", source: "server/routes.ts", declaration: 'app.post("/api/coordination-states/:id/pay/confirm", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/coordination-states/:id/refund", source: "server/routes.ts", declaration: 'app.post("/api/coordination-states/:id/refund", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/ready-made/:id/purchase", source: "server/routes/ready-made.routes.ts", declaration: 'router.post("/api/ready-made/:id/purchase", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/ready-made/:id/purchase/confirm", source: "server/routes/ready-made.routes.ts", declaration: 'router.post("/api/ready-made/:id/purchase/confirm", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/ready-made/purchases/:id/concern", source: "server/routes/ready-made.routes.ts", declaration: 'router.post("/api/ready-made/purchases/:id/concern", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/ready-made/purchases/:id/request-revision", source: "server/routes/ready-made.routes.ts", declaration: 'router.post("/api/ready-made/purchases/:id/request-revision", isAuthenticated', ownership: "resource", state: "untested", reason: notYetSafelyMounted },

  // Credits are retired endpoints, retained because callers can still send a mutation request.
  { method: "POST", path: "/api/wallet/add-credits", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/wallet/add-credits", isAuthenticated', ownership: "session", state: "untested", reason: "Untested: retired (410) endpoint; audit needs a mounted auth fixture to prove the unauthenticated gate." },
  { method: "POST", path: "/api/credits/purchase", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/credits/purchase", isAuthenticated', ownership: "session", state: "untested", reason: "Untested: retired (410) endpoint; audit needs a mounted auth fixture to prove the unauthenticated gate." },

  // Connect, payouts, and privileged money operations.
  { method: "POST", path: "/api/stripe/connect/onboard", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/stripe/connect/onboard", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/payouts/request", source: "server/routes/payments.routes.ts", declaration: 'router.post("/api/payouts/request", isAuthenticated', ownership: "session", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/admin/payouts", source: "server/routes/admin.routes.ts", declaration: 'router.post("/api/admin/payouts", isAuthenticated', ownership: "admin", state: "untested", reason: notYetSafelyMounted },
  { method: "PATCH", path: "/api/admin/payouts/:id", source: "server/routes/admin.routes.ts", declaration: 'router.patch("/api/admin/payouts/:id", isAuthenticated', ownership: "admin", state: "untested", reason: notYetSafelyMounted },
  { method: "POST", path: "/api/admin/ready-made/disputes/:purchaseId/refund", source: "server/routes/admin.routes.ts", declaration: 'router.post("/api/admin/ready-made/disputes/:purchaseId/refund", isAuthenticated', ownership: "admin", state: "untested", reason: notYetSafelyMounted },

  // Financial webhooks are authorization by verified Stripe signature, not a user session.
  { method: "POST", path: "/api/webhooks/stripe", source: "server/routes/webhooks.routes.ts", declaration: 'router.post("/stripe", async', ownership: "stripe-signature", state: "untested", reason: "Untested: requires signed raw-body Stripe event fixture and asynchronous DB snapshot." },
  { method: "POST", path: "/api/bookings/webhooks/stripe", source: "server/routes/bookings.ts", declaration: "router.post('/webhooks/stripe', async", ownership: "stripe-signature", state: "untested", reason: "Untested: requires signed raw-body Stripe event fixture and asynchronous DB snapshot." },
];

export const knownAuthorizationReviewFindings = [
  {
    endpoint: "/api/optimization-payments/confirm",
    severity: "review-required",
    detail:
      "The PaymentIntent owner check is conditional (`pi.metadata?.userId && ...`). A real fixture " +
      "test must determine whether an optimization_fee intent missing userId can mutate another user's comparison.",
  },
] as const;