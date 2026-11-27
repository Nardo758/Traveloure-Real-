/**
 * DX-4 gate inventory pin. Step 0 Table A had 38 gate mounts; commit 4 added
 * two `requireVerifiedEmail` mounts (quote accept = booking, on-trip support =
 * checkout). This test fails if any listed route loses its gate or the count
 * drops.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type Gate =
  | "requireVerifiedEmail"
  | "refuseUnverifiedTravelerContact"
  | "refuseUnverifiedTravelerSender"
  | "payoutEmailVerificationDenial";

interface Mount {
  file: string;
  /** A unique route declaration (or function declaration for storage). */
  anchor: string;
  route: string;
  gate: Gate;
}

const MOUNTS: Mount[] = [
  // Step 0 Table A — requireVerifiedEmail (17)
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/checkout"', route: "POST /api/checkout", gate: "requireVerifiedEmail" },
  { file: "server/routes.ts", anchor: 'app.post("/api/bookings"', route: "POST /api/bookings", gate: "requireVerifiedEmail" },
  { file: "server/routes/bookings.ts", anchor: "router.post('/process-cart'", route: "POST /api/bookings/process-cart", gate: "requireVerifiedEmail" },
  { file: "server/routes/booking-actions.ts", anchor: "router.post('/expert-requests/payment-intent'", route: "POST /api/expert-requests/payment-intent", gate: "requireVerifiedEmail" },
  { file: "server/routes/content.routes.ts", anchor: 'router.post("/api/participants/:id/payment"', route: "POST /api/participants/:id/payment", gate: "requireVerifiedEmail" },
  { file: "server/routes/content.routes.ts", anchor: 'router.post("/api/spontaneous/:id/book"', route: "POST /api/spontaneous/:id/book", gate: "requireVerifiedEmail" },
  { file: "server/routes.ts", anchor: 'app.post("/api/coordination-states/:id/pay"', route: "POST /api/coordination-states/:id/pay", gate: "requireVerifiedEmail" },
  { file: "server/routes.ts", anchor: 'app.post("/api/contracts/:id/payment"', route: "POST /api/contracts/:id/payment", gate: "requireVerifiedEmail" },
  { file: "server/routes/plan-option-sets.routes.ts", anchor: 'router.post("/api/trips/:tripId/items/:itemId/stay-booking/prebook"', route: "POST stay-booking/prebook", gate: "requireVerifiedEmail" },
  { file: "server/routes/plan-option-sets.routes.ts", anchor: 'router.post("/api/trips/:tripId/items/:itemId/stay-booking/book"', route: "POST stay-booking/book", gate: "requireVerifiedEmail" },
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/bookings/:id/resume-payment"', route: "POST /api/bookings/:id/resume-payment", gate: "requireVerifiedEmail" },
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/bookings/:id/pay-balance"', route: "POST /api/bookings/:id/pay-balance", gate: "requireVerifiedEmail" },
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/memberships/checkout"', route: "POST /api/memberships/checkout", gate: "requireVerifiedEmail" },
  { file: "server/routes/optimization.routes.ts", anchor: 'router.post("/api/optimization-payments"', route: "POST /api/optimization-payments", gate: "requireVerifiedEmail" },
  { file: "server/routes/ready-made.routes.ts", anchor: 'router.post("/api/ready-made/:id/purchase"', route: "POST /api/ready-made/:id/purchase", gate: "requireVerifiedEmail" },
  { file: "server/routes/trip-pass.routes.ts", anchor: 'router.post("/api/trips/:tripId/trip-pass/purchase"', route: "POST /api/trips/:tripId/trip-pass/purchase", gate: "requireVerifiedEmail" },
  { file: "server/routes/trips.routes.ts", anchor: 'router.post("/api/trips/:tripId/proposals/:id/pay"', route: "POST /api/trips/:tripId/proposals/:id/pay", gate: "requireVerifiedEmail" },
  // Step 0 Table A — contact (6)
  { file: "server/routes/conversations.routes.ts", anchor: 'router.post("/api/conversations/start"', route: "POST /api/conversations/start", gate: "refuseUnverifiedTravelerContact" },
  { file: "server/routes/messages.ts", anchor: 'router.post("/", isAuthenticated', route: "POST /api/messages", gate: "refuseUnverifiedTravelerContact" },
  { file: "server/routes.ts", anchor: "app.post(api.chats.create.path", route: "POST /api/chats", gate: "refuseUnverifiedTravelerContact" },
  { file: "server/routes.ts", anchor: "app.post(api.chats.create.path", route: "POST /api/chats (second branch)", gate: "refuseUnverifiedTravelerContact" },
  { file: "server/routes/content.routes.ts", anchor: 'router.post("/api/chat/start"', route: "POST /api/chat/start", gate: "refuseUnverifiedTravelerContact" },
  { file: "server/routes/trips.routes.ts", anchor: "router.post(api.chats.create.path", route: "POST /api/chats (trips router)", gate: "refuseUnverifiedTravelerContact" },
  // Step 0 Table A — sender (7)
  { file: "server/routes.ts", anchor: 'app.post("/api/expert-booking-requests"', route: "POST /api/expert-booking-requests", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/booking-actions.ts", anchor: "router.post('/expert-requests'", route: "POST /api/expert-requests", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/booking-actions.ts", anchor: "router.post('/trips/:id/expert-advisor'", route: "POST /api/trips/:id/expert-advisor", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/booking-actions.ts", anchor: "router.post('/trips/:tripId/advisors'", route: "POST /api/trips/:tripId/advisors", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/handoff.routes.ts", anchor: 'router.post("/api/trips/:tripId/handoff/quote"', route: "POST /api/trips/:tripId/handoff/quote", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/handoff.routes.ts", anchor: 'router.post("/api/trips/:tripId/handoff", isAuthenticated', route: "POST /api/trips/:tripId/handoff", gate: "refuseUnverifiedTravelerSender" },
  { file: "server/routes/service-quotes.routes.ts", anchor: 'router.post("/api/services/:id/quote-requests"', route: "POST /api/services/:id/quote-requests", gate: "refuseUnverifiedTravelerSender" },
  // Step 0 Table A — payout (8)
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/payouts/request"', route: "POST /api/payouts/request", gate: "payoutEmailVerificationDenial" },
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/payouts/request"', route: "POST /api/payouts/request (stale)", gate: "payoutEmailVerificationDenial" },
  { file: "server/routes/payments.routes.ts", anchor: 'router.post("/api/payouts/request"', route: "POST /api/payouts/request (normal)", gate: "payoutEmailVerificationDenial" },
  { file: "server/routes/admin.routes.ts", anchor: 'router.post("/api/admin/payouts"', route: "POST /api/admin/payouts", gate: "payoutEmailVerificationDenial" },
  { file: "server/routes/admin.routes.ts", anchor: 'router.post("/api/admin/payouts"', route: "POST /api/admin/payouts (tx)", gate: "payoutEmailVerificationDenial" },
  { file: "server/routes/admin.routes.ts", anchor: 'router.patch("/api/admin/payouts/:id"', route: "PATCH /api/admin/payouts/:id", gate: "payoutEmailVerificationDenial" },
  { file: "server/storage.ts", anchor: "private async claimPayoutForProcessing", route: "claimPayoutForProcessing", gate: "payoutEmailVerificationDenial" },
  { file: "server/storage.ts", anchor: "async recheckStripeTransferBeforeSend", route: "recheckStripeTransferBeforeSend", gate: "payoutEmailVerificationDenial" },
  // Commit 4 — new gates (2)
  { file: "server/routes/service-quotes.routes.ts", anchor: 'router.post("/api/quotes/:quoteId/accept"', route: "POST /api/quotes/:quoteId/accept", gate: "requireVerifiedEmail" },
  { file: "server/routes/handoff.routes.ts", anchor: 'router.post("/api/handoffs/:id/on-trip-support"', route: "POST /api/handoffs/:id/on-trip-support", gate: "requireVerifiedEmail" },
];

function routeBody(source: string, anchor: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) return "";
  const rest = source.slice(at + anchor.length);
  const next = rest.search(/\n\s*(?:router|app)\.(?:get|post|put|patch|delete)\(/);
  return source.slice(at, next < 0 ? source.length : at + anchor.length + next);
}

test("every inventoried gate mount is present", () => {
  let missing = 0;
  const failures: string[] = [];
  for (const mount of MOUNTS) {
    const source = fs.readFileSync(path.join(process.cwd(), mount.file), "utf8");
    const body = mount.file === "server/storage.ts" ? source.slice(source.indexOf(mount.anchor)) : routeBody(source, mount.anchor);
    if (!body.includes(mount.gate)) {
      missing += 1;
      failures.push(`${mount.file}: ${mount.route} lost ${mount.gate}`);
    }
  }
  assert.equal(MOUNTS.length, 40);
  assert.equal(missing, 0, failures.join("\n"));
  console.log(`[dx4-gate-pin] mounts=${MOUNTS.length} missing=${missing}`);
});
