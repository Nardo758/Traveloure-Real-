/**
 * user-experience-mass-assignment.test.ts — a user experience's OWNER is not a body field.
 *
 * FINDING (security audit, as-of 4644af6): both write paths passed RAW `req.body` through.
 * `POST /api/user-experiences` spread it into `createUserExperience`, and
 * `PATCH /api/user-experiences/:id` did `const updates = req.body` into a `.set({...updates})`
 * (server/storage.ts updateUserExperience). Every column of `user_experiences` was therefore
 * writable by the caller, including:
 *
 *   - `userId` — the PATCH route checks the row's ownership and then lets the body REASSIGN it, so
 *     an owner could hand their experience (budget, location, preferences, stepData) to another
 *     account, or re-attribute it to a victim;
 *   - `tripId` — any trip id in the database; the FK requires the trip to EXIST, not to be yours;
 *   - `trackingNumber` — a UNIQUE column.
 *
 * The sharp part: `insertUserExperienceSchema` ALREADY omits `userId` (shared/schema.ts:2428). The
 * routes simply never used it. This is a stricter case than §19's denylist class — there was no
 * schema on the path at all — and it is invisible to every schema-shape guard for exactly that
 * reason: they analyse createInsertSchema call sites, and an unvalidated route has none.
 *
 * The fix is §19's shape: a pick-based allowlist derived from the existing insert schema, the same
 * form ruling 46 used for createBookingRequestSchema. Being derived from the schema VARIABLE (not a
 * createInsertSchema call site) it is deliberately outside check-omit-schema-ratchet's count — a
 * documented property of that guard, not an evasion.
 *
 *   D1 a body-supplied userId never survives parsing
 *   D2 a body-supplied trackingNumber never survives parsing
 *   D3 legitimate fields still parse — the allowlist is not a blanket denial
 *   D4 the PATCH path inherits the allowlist through .partial()
 *   D5 neither route reads raw req.body any more, and both ownership-check a supplied tripId
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { userExperienceBodySchema as allowlist } from "../content.routes";

// D1-D4 assert against the ROUTE'S OWN schema, imported — not a copy reconstructed here. A copy
// would keep passing while the routes bypassed it, which is exactly the defect: the correct
// `insertUserExperienceSchema` already existed and neither route used it.

const VICTIM = "victim-user-id";

test("D1: a body-supplied userId never survives parsing", () => {
  const parsed = allowlist.partial().parse({ title: "Trip", userId: VICTIM } as Record<string, unknown>);
  assert.equal((parsed as Record<string, unknown>).userId, undefined);
  assert.equal(JSON.stringify(parsed).includes(VICTIM), false);
});

test("D2: a body-supplied trackingNumber never survives parsing", () => {
  const parsed = allowlist.partial().parse({ title: "Trip", trackingNumber: "TRV-0001" } as Record<string, unknown>);
  assert.equal((parsed as Record<string, unknown>).trackingNumber, undefined, "a UNIQUE column is not client-settable");
});

test("D3: the legitimate fields still parse", () => {
  const parsed = allowlist.parse({
    experienceTypeId: "et-1",
    tripId: "trip-1",
    title: "Kyoto",
    status: "planning",
    location: "Kyoto",
    guestCount: 4,
    currentStep: 2,
    preferences: { pace: "slow" },
    stepData: { step1: true },
    mapData: {},
  });
  assert.equal(parsed.title, "Kyoto");
  assert.equal(parsed.guestCount, 4);
  assert.deepEqual(parsed.preferences, { pace: "slow" });
});

test("D4: the PATCH path inherits the allowlist through .partial()", () => {
  const parsed = allowlist.partial().parse({ location: "Osaka", userId: VICTIM } as Record<string, unknown>);
  assert.equal(parsed.location, "Osaka");
  assert.equal((parsed as Record<string, unknown>).userId, undefined);
});

test("D5: neither route reads raw req.body, and both ownership-check a supplied tripId", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  const block = src.slice(
    src.indexOf('router.post("/api/user-experiences"'),
    src.indexOf('router.delete("/api/user-experiences/:id"'),
  );
  assert.ok(block.length > 0, "the user-experience write block must be locatable");

  assert.doesNotMatch(block, /createUserExperience\(\{\s*\.\.\.req\.body/, "POST must not spread the raw body");
  assert.doesNotMatch(block, /const updates = req\.body;/, "PATCH must not assign the raw body");

  assert.match(block, /userExperienceBodySchema\.parse\(req\.body\)/, "POST must parse the allowlist");
  assert.match(block, /userExperienceBodySchema\.partial\(\)\.parse\(req\.body\)/, "PATCH must parse the allowlist");

  const tripChecks = block.match(/verifyTripOwnership\(/g) ?? [];
  assert.equal(tripChecks.length, 2, "both write paths must ownership-check a supplied tripId");
});
