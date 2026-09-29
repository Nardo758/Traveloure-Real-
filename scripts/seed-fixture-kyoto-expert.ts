/**
 * TEST FIXTURE ONLY — one Kyoto local expert who passes the byline gate (ledger
 * `2026-09-29-expert-door`; dispatch: "the §7 Kyoto spec step for 'a local expert checks the plan'
 * comes alive against a fixture expert").
 *
 * Refuses to run unless `ALLOW_TEST_ACCOUNTS=1` (the CI/local switch every journey already sets) —
 * it writes an earner account, an approved application, an approved listing and a VERIFIED
 * neighbourhood, and none of that may ever reach production.
 *
 * The gate's four facts, each written the way the platform writes it:
 *   1. an approved `local_expert_forms` row (plus identity verified — the same smallest write
 *      `e2e/supply-demand/lib/db.ts seedExpertIdentityVerification` makes, since no Stripe Identity
 *      webhook reaches a test database);
 *   2. a claimed handle;
 *   3. a live storefront: one approved, active listing that names an ADVISORY expert offering
 *      (`itinerary_2nd_opinion`, "Check my plan") with a published price;
 *   4. a verified Kyoto neighbourhood — born ONLY through the claim services (create → submit →
 *      scored → ratify), because the database refuses any other writer of `expert_neighborhoods`
 *      (Locked Decision 27). The scorer's model is not called: the claim is marked scored directly,
 *      exactly as the claims DB suite does.
 *
 * `--ungated` stops one fact short: the claim is scored and NOT ratified, so the expert has no
 * verified neighbourhood and must never appear in a picker (the negative the tests need).
 *
 * Prints one JSON line: { expertId, handle, serviceId, neighborhood, gated }.
 * Usage: ALLOW_TEST_ACCOUNTS=1 npx tsx scripts/seed-fixture-kyoto-expert.ts <label> [--ungated]
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { createClaim, markClaimScored, ratifyClaim, submitClaim } from "../server/services/neighborhood-claims.service";

async function main() {
  if (process.env.ALLOW_TEST_ACCOUNTS !== "1") {
    console.error("refused: seed-fixture-kyoto-expert writes test supply and runs only with ALLOW_TEST_ACCOUNTS=1");
    process.exit(2);
  }
  const label = (process.argv[2] || "fixture").replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase() || "fixture";
  const run = crypto.randomUUID().slice(0, 6);
  const expertId = `fx-expert-${label}-${run}`;
  const adminId = `fx-admin-${label}-${run}`;
  const handle = `kyoto${label}${run}`.slice(0, 30);

  const [hood] = (await db.execute(sql`
    SELECT id, name FROM city_neighborhoods WHERE lower(city) = 'kyoto' ORDER BY slug LIMIT 1
  `)).rows as Array<{ id: string; name: string }>;
  if (!hood) throw new Error("no Kyoto neighbourhood in this database — the gate cannot be met");

  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, handle)
    VALUES (${expertId}, ${`${expertId}@traveloure.test`}, 'Aiko', 'Fixture', 'local_expert', ${handle}),
           (${adminId}, ${`${adminId}@traveloure.test`}, 'Fixture', 'Admin', 'admin', NULL)
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, city, country, status,
                                    identity_verification_status, identity_verified_at)
    VALUES (${crypto.randomUUID()}, ${expertId}, 'Aiko', 'Fixture', ${`${expertId}@traveloure.test`}, 'Kyoto', 'Japan', 'approved', 'verified', now())
  `);
  const serviceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, short_description, price, city,
                                   expert_offering_type_key, approval_status, status, delivery_method)
    VALUES (${serviceId}, ${expertId}, 'A local checks your Kyoto plan',
            'I read your days and tell you what to change.', 60.00, 'Kyoto',
            'itinerary_2nd_opinion', 'approved', 'active', 'async_messaging')
  `);

  const created = await createClaim({ expertId, neighborhoodId: hood.id, actorType: "ops", actorId: adminId });
  if (!created.ok) throw new Error(`createClaim: ${created.code}`);
  const claimId = created.value.claim.id;
  const submitted = await submitClaim({
    claimId,
    expertId: null,
    actorType: "ops",
    actorId: adminId,
    consent: true,
    consentVersion: "fixture",
    capture: fixtureCapture(run),
  });
  if (!submitted.ok) throw new Error(`submitClaim: ${submitted.code} ${submitted.message ?? ""}`);
  const scored = await markClaimScored({ claimId, version: submitted.value.version, scorerJson: { note: "fixture" } });
  if (!scored.ok) throw new Error(`markClaimScored: ${(scored as any).code}`);
  const gated = !process.argv.includes("--ungated");
  if (gated) {
    const ratified = await ratifyClaim({ claimId, adminId });
    if (!ratified.ok) throw new Error(`ratifyClaim: ${ratified.code}`);
  }

  console.log(JSON.stringify({ expertId, handle, serviceId, neighborhood: hood.name, gated }));
}

function fixtureCapture(tag: string) {
  return {
    p1: [
      {
        name: `Yasaka Shrine ${tag}`,
        category: "shrine",
        doThis: "Go in from the south gate off Higashiōji, not the main gate everyone photographs.",
        when: { hours: "from 18:00", days: "", season: "not 1–3 Jan" },
        watchOut: "The main gate is a queue; the south approach is empty.",
        priceBand: null,
        expertConfidence: "certain",
      },
      {
        name: `Kagizen ${tag}`,
        category: "tea house",
        doThis: "Order the kuzukiri, sit in the back room.",
        when: { hours: "before 16:00", days: "closed Monday", season: "" },
        watchOut: "Last orders are earlier than the posted close.",
        priceBand: "$$",
        expertConfidence: "usually_right",
      },
    ],
    p2: {
      items: [
        { name: `Yasaka Shrine ${tag}`, durationMin: 40, transition: null },
        { name: `Kagizen ${tag}`, durationMin: 50, transition: { mode: "walk", minutes: 8 } },
        { name: `Shirakawa canal ${tag}`, durationMin: 60, transition: { mode: "walk", minutes: 10 } },
      ],
      orderReason: "Lanterns first, tea before it closes, the canal after dark.",
      hardConstraints: [{ kind: "closure_day", detail: "Kagizen closes Monday." }],
    },
    p3: {
      trigger: "rain",
      replacesPosition: 3,
      alternate: { name: `Nishiki arcade ${tag}`, durationMin: 60, transition: { mode: "bus", minutes: 15 } },
      reason: "The canal walk dies in rain; the arcade is covered.",
    },
    p4: [],
  };
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  // `submitClaim` enqueues scoring fire-and-forget; let it read before the pool closes (the claim is
  // already scored and ratified here, so the enqueue finds nothing to do — this only keeps the log clean).
  .finally(() => new Promise((r) => setTimeout(r, 750)).then(() => pool.end()));
