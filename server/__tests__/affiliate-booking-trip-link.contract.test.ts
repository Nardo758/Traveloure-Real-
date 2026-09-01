import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const finalizeModal = fs.readFileSync(
  "client/src/components/plancard/FinalizeBookingModal.tsx",
  "utf8",
);
const contentRoutes = fs.readFileSync("server/routes/content.routes.ts", "utf8");
const storageSource = fs.readFileSync("server/storage.ts", "utf8");
const schemaSource = fs.readFileSync("shared/schema.ts", "utf8");
const expertWorkspace = fs.readFileSync("client/src/pages/expert/workspace.tsx", "utf8");

describe("affiliate booking requests retain their source trip", () => {
  it("sends the finalized trip id with each booking-agent handoff", () => {
    const agentBranch = finalizeModal.match(
      /else if \(lane === "agent"\)([\s\S]*?)else if \(lane === "expert"\)/,
    )?.[1];

    assert.ok(agentBranch, "booking-agent branch should exist");
    assert.match(agentBranch, /\/api\/affiliate-booking-requests/);
    assert.match(agentBranch, /tripId:\s*trip\.id/);
  });

  it("authorizes an optional trip link before persisting it", () => {
    const createRoute = contentRoutes.match(
      /router\.post\("\/api\/affiliate-booking-requests"([\s\S]*?)router\.post\("\/api\/affiliate-booking-requests\/from-catalog"/,
    )?.[1];

    assert.ok(createRoute, "affiliate booking create route should exist");
    assert.match(createRoute, /rawTripId !== undefined/);
    assert.match(createRoute, /verifyTripOwnership\(tripId,\s*userId\)/);
    assert.match(createRoute, /getTripRole\(tripId,\s*userId\)/);
    assert.match(createRoute, /if \(!hasTripAccess\)/);
    assert.match(createRoute, /userId,\s*expertId,\s*tripId/);
    assert.match(createRoute, /const tripId = .* \? .* : null/);
  });

  it("keeps tripId nullable for requests created outside a trip", () => {
    const table = schemaSource.match(
      /export const affiliateBookingRequests = pgTable\("affiliate_booking_requests"([\s\S]*?)export const insertAffiliateBookingRequestSchema/,
    )?.[1];

    assert.ok(table, "affiliate booking request schema should exist");
    assert.match(table, /tripId:\s*varchar\("trip_id"\)\.references/);
    assert.doesNotMatch(table, /tripId:[^\n]*\.notNull\(\)/);
  });

  it("supports trip-filtered traveler and expert history without requiring a filter", () => {
    assert.match(
      storageSource,
      /getAffiliateBookingRequestsByUser\(userId:\s*string,\s*tripId\?:\s*string\)/,
    );
    assert.match(
      storageSource,
      /getAffiliateBookingRequestsByExpert\(expertId:\s*string,\s*tripId\?:\s*string\)/,
    );
    assert.match(contentRoutes, /getAffiliateBookingRequestsByUser\(userId,\s*tripId\)/);
    assert.match(contentRoutes, /getAffiliateBookingRequestsByExpert\(userId,\s*tripId\)/);
    assert.match(
      expertWorkspace,
      /affiliate-booking-requests\/expert\?tripId=\$\{encodeURIComponent\(tripId\)\}/,
    );
  });
});