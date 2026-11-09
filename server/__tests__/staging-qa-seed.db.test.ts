/**
 * Launch item 12 (ledger `2026-11-09-staging-item12-seeds`): the staging QA seed on a real database. The Stripe
 * Connect leg is INJECTED here (no network in CI); the production path calls the Stripe test API
 * (`stripeTestConnectCreator`), which this suite does not exercise — staging proves it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { seedStagingQa, QA_EXPERT_EMAIL, STAGING_QA_ACCOUNTS, WEDDING_PLAN_TITLE, type ConnectAccountCreator } from "../seeds/staging-qa.seed";
import { routableUserIds } from "../services/expert-routability";

const ENV = { STAGING_QA_PASSWORD: "staging-qa-test-password", ALLOW_TEST_ACCOUNTS: "1", NODE_ENV: "test" } as NodeJS.ProcessEnv;
let calls = 0;
const fakeConnect: ConnectAccountCreator = async ({ kind }) => ({ id: `acct_test_${kind}_${++calls}` });
const rows = async <T = any>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

after(async () => { await pool.end(); });

test("SQ2 the seed writes the five accounts, a routable expert, the provider and the wedding plan — idempotently", async () => {
  const prior = process.env.SHOW_DEMO_EXPERTS;
  process.env.SHOW_DEMO_EXPERTS = "1"; // staging sets it: @traveloure.test is a seed domain
  try {
    const first = await seedStagingQa({ env: ENV, createConnectAccount: fakeConnect });
    assert.equal(first.ran, true);
    assert.equal(first.complete, true);
    for (const a of STAGING_QA_ACCOUNTS) {
      const [u] = await rows<{ terms: boolean; privacy: boolean; verified: boolean; pw: boolean; role: string }>(sql`
        SELECT terms_accepted_at IS NOT NULL AS terms, privacy_accepted_at IS NOT NULL AS privacy, email_verified IS NOT NULL AS verified,
               password IS NOT NULL AS pw, role FROM users WHERE email = ${a.email}`);
      assert.ok(u, a.email);
      assert.deepEqual([u.terms, u.privacy, u.verified, u.pw, u.role], [true, true, true, true, a.role], a.email);
    }
    const expertId = first.accounts.EXPERT;
    const [form] = await rows(sql`SELECT status, identity_verification_status, stripe_connect_status, stripe_account_id FROM local_expert_forms WHERE user_id = ${expertId}`);
    assert.deepEqual([form.status, form.identity_verification_status, form.stripe_connect_status], ["approved", "verified", "complete"]);
    assert.match(form.stripe_account_id, /^acct_test_expert_/);
    const [listing] = await rows(sql`SELECT approval_status, status, expert_offering_type_key FROM provider_services WHERE user_id = ${expertId}`);
    assert.deepEqual([listing.approval_status, listing.status, listing.expert_offering_type_key], ["approved", "active", "itinerary_2nd_opinion"]);
    const hoods = await rows(sql`SELECT 1 FROM expert_neighborhoods WHERE expert_id = ${expertId} AND verified_at IS NOT NULL`);
    assert.equal(hoods.length, 1, "a verified Kyoto neighbourhood, through the claim services");
    assert.equal((await routableUserIds([expertId])).has(expertId), true, "the QA expert is routable");

    const [prov] = await rows(sql`SELECT stripe_account_id, handle FROM users WHERE id = ${first.accounts.TB3}`);
    assert.match(prov.stripe_account_id, /^acct_test_provider_/);
    assert.equal(prov.handle, "tb3-supply-scout");

    const [trip] = await rows(sql`SELECT id, user_id, occasion_slug, event_type, dates_confirmed_at, title FROM trips WHERE id = ${first.weddingTripId}`);
    assert.deepEqual([trip.user_id, trip.occasion_slug, trip.title, trip.dates_confirmed_at], [first.accounts.TB4, "wedding", WEDDING_PLAN_TITLE, null]);
    const owner = await rows(sql`SELECT 1 FROM trip_collaborators WHERE trip_id = ${trip.id} AND user_id = ${trip.user_id} AND role = 'owner'`);
    assert.equal(owner.length, 1, "LD 42: the owner trip_collaborators row");
    const finals = await rows(sql`SELECT 1 FROM trips WHERE id = ${trip.id} AND finalized_at IS NOT NULL`);
    assert.equal(finals.length, 0, "no seeded final version");

    // A second run changes nothing and creates no second Connect account, listing or plan.
    const callsBefore = calls;
    const second = await seedStagingQa({ env: ENV, createConnectAccount: fakeConnect });
    assert.deepEqual(second.accounts, first.accounts);
    assert.equal(second.weddingTripId, first.weddingTripId);
    assert.equal(calls, callsBefore, "no second Connect account");
    assert.equal((await rows(sql`SELECT 1 FROM provider_services WHERE user_id = ${expertId}`)).length, 1);
    assert.equal((await rows(sql`SELECT 1 FROM trips WHERE user_id = ${first.accounts.TB4} AND occasion_slug = 'wedding'`)).length, 1);
  } finally {
    if (prior === undefined) delete process.env.SHOW_DEMO_EXPERTS; else process.env.SHOW_DEMO_EXPERTS = prior;
  }
});

test("SQ3 without a usable Stripe test key the Connect leg is reported, not faked", async () => {
  await db.execute(sql`UPDATE local_expert_forms SET stripe_account_id = NULL, stripe_connect_status = 'not_started'
                         WHERE user_id = (SELECT id FROM users WHERE email = ${QA_EXPERT_EMAIL})`);
  const r = await seedStagingQa({ env: ENV, createConnectAccount: async () => ({ error: "no Stripe key configured" }) });
  assert.match(r.expert!.connect, /^NOT created — no Stripe key configured/);
  assert.equal(r.complete, false, "boot retries an incomplete run");
  const [form] = await rows(sql`SELECT stripe_connect_status FROM local_expert_forms WHERE user_id = ${r.accounts.EXPERT}`);
  assert.equal(form.stripe_connect_status, "not_started", "no status stamped without an account");
});

test("SQ4 ENVIRONMENT=PROD writes nothing", async () => {
  const r = await seedStagingQa({ env: { ...ENV, ENVIRONMENT: "PROD" }, createConnectAccount: fakeConnect });
  assert.deepEqual(r, { ran: false, reason: "ENVIRONMENT=PROD", accounts: {} });
});
