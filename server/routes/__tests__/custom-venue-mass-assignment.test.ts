/**
 * custom-venue-mass-assignment.test.ts — a custom venue's OWNER is not a body field.
 *
 * FINDING (security audit, as-of 4644af6): `insertCustomVenueSchema` was
 * `createInsertSchema(customVenues).omit({ id, createdAt })` — a DENYLIST — so `userId` and
 * `tripId` stayed client-settable, and `POST /api/custom-venues` never stamped an owner. A caller
 * could birth a venue owned by someone ELSE (who then owns it for the PATCH/DELETE ownership
 * checks, locking the creator out and attributing the content to the victim), or attach one to any
 * trip id in the database — the FK only requires the trip to exist, not to be yours. `PATCH` used
 * `.partial()` on the same denylist, so an owner could hand a venue to another account outright.
 *
 * This is §19's standing class verbatim: "a privileged column is client-settable BY DEFAULT under a
 * denylist (.omit()) schema, and nobody edits an omit list for a column that did not exist when it
 * was written." §19's stated fix shape is a pick-based ALLOWLIST, and this is the first #PS18
 * conversion — which is why check-omit-schema-ratchet's baseline moves 190 -> 189 in the same PR,
 * exactly as that guard's FAIL message instructs.
 *
 * Invisible to check-privileged-field-completeness by design: its six named families are role,
 * status/approval, fee/payout/rate, verification, payment-identity and plan/entitlement. A plain
 * owner FK is none of them — a stated blind spot, not a guard failure.
 *
 *   C1 the schema REJECTS a body-supplied userId (it is not in the allowlist)
 *   C2 the schema rejects a body-supplied `source` (server-authored provenance)
 *   C3 legitimate fields still parse — the allowlist is not a blanket denial
 *   C4 the PATCH path inherits the allowlist through .partial()
 *   C5 the route stamps the owner from the session and verifies trip ownership (source contract)
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { insertCustomVenueSchema } from "@shared/schema";

const VICTIM = "victim-user-id";

test("C1: a body-supplied userId never survives parsing", () => {
  const parsed = insertCustomVenueSchema.parse({
    name: "Test venue",
    userId: VICTIM,
  } as Record<string, unknown>);
  assert.equal(
    (parsed as Record<string, unknown>).userId,
    undefined,
    "userId must not be reachable from the body — this is the whole finding",
  );
  assert.equal(JSON.stringify(parsed).includes(VICTIM), false);
});

test("C2: a body-supplied `source` never survives parsing", () => {
  const parsed = insertCustomVenueSchema.parse({
    name: "Test venue",
    source: "expert_curated",
  } as Record<string, unknown>);
  assert.equal(
    (parsed as Record<string, unknown>).source,
    undefined,
    "provenance is server-authored, not client-claimed",
  );
});

test("C3: the legitimate fields still parse (the allowlist is not a blanket denial)", () => {
  const parsed = insertCustomVenueSchema.parse({
    tripId: "trip-1",
    experienceType: "wedding",
    name: "Rooftop",
    address: "1 Main St",
    latitude: "35.0116000",
    longitude: "135.7681000",
    venueType: "custom",
    notes: "meet at the gate",
    estimatedCost: "120.00",
    imageUrl: "https://example.test/x.jpg",
  });
  assert.equal(parsed.name, "Rooftop");
  assert.equal(parsed.tripId, "trip-1");
  assert.equal(parsed.estimatedCost, "120.00");
});

test("C4: the PATCH path inherits the allowlist through .partial()", () => {
  const parsed = insertCustomVenueSchema.partial().parse({
    notes: "updated",
    userId: VICTIM,
  } as Record<string, unknown>);
  assert.equal(
    (parsed as Record<string, unknown>).userId,
    undefined,
    "an owner must not be able to hand a venue to another account through PATCH",
  );
  assert.equal(parsed.notes, "updated");
});

test("C5: the routes stamp the owner from the session and verify trip ownership", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  const post = src.slice(
    src.indexOf('router.post("/api/custom-venues"'),
    src.indexOf('router.patch("/api/custom-venues/:id"'),
  );
  assert.match(post, /const userId = getUserId\(req\)!/, "the create path must derive the owner from the session");
  assert.match(post, /createCustomVenue\(\{ \.\.\.input, userId \}\)/, "and stamp it on the write");
  assert.match(post, /verifyTripOwnership\(input\.tripId, userId\)/, "a supplied tripId must be checked — the FK is not an ownership check");

  const storage = fs.readFileSync("server/storage.ts", "utf8");
  assert.match(
    storage,
    /createCustomVenue\(venue: InsertCustomVenue & \{ userId: string \}\)/,
    "the storage writer must REQUIRE a server-stamped owner, so a caller cannot forget it",
  );
});
