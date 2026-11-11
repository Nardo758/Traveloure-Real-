#!/usr/bin/env tsx
/**
 * STAGING QA SEED — launch checklist item 12 (open-mode staging; decision-maker §9 rulings, Nov 8, 2026; ledger
 * `2026-11-09-staging-item12-seeds`). The accounts the bots walk Versions / WithExpert / Finalize / Trip Card with on
 * the ONE staging box (docs/STAGING.md):
 *
 *   · the QA expert `qa-expert-kyoto@traveloure.test` — an approved application, Identity verified, Stripe Connect
 *     complete (a real TEST-mode Connect account created through the Stripe API), an approved advisory listing
 *     (`itinerary_2nd_opinion`) and a VERIFIED Kyoto neighbourhood born through the claim services (LD 27 — the
 *     database refuses any other writer of `expert_neighborhoods`);
 *   · TB1 / TB2 / TB4 travelers and the TB3 provider, named for the existing QA accounts (QA Smoke 12, QA Smoke9,
 *     TEST Supply Scout, Wedding Walk), terms / privacy / email-verified stamped;
 *   · a wedding plan for TB4, minted the way the `hosted_events` door mints it (`storage.createTrip`, which writes the
 *     owner `trip_collaborators` row — LD 42 — then the occasion fields the door's PATCH stamps). NOT "Plan around it".
 *   · NO final version: bots create one through Finalize (a seeded snapshot bypasses the path under test).
 *
 * GATES, every one fail-closed:
 *   · refuses `ENVIRONMENT=PROD` (any case), whatever else is set;
 *   · runs only where test accounts may exist (non-production, or `ALLOW_TEST_ACCOUNTS=1`) — the boot gate's own rule;
 *   · needs `STAGING_QA_PASSWORD` (12+ characters). No password is committed; without it nothing is written.
 * Connect: created through the Stripe API ONLY with a TEST-mode key (`sk_test_`/`rk_test_`); a live key is refused. With no
 * usable key, or when the call fails, the Connect leg is reported and left unset — the expert is then NOT routable, and
 * the seed says so rather than stamp a status no Stripe account backs.
 *
 * Routability: `@traveloure.test` is a seed domain (`server/services/expert-routability.ts`), so the expert is routable
 * only where `SHOW_DEMO_EXPERTS=1` — staging sets it (docs/STAGING.md §item 12).
 *
 * IDEMPOTENT: an existing account keeps its id; a missing fact is filled; nothing an admin changed is reverted
 * (a rejected application stays rejected).
 *
 * Usage (boot runs it automatically under the gates): npx tsx server/seeds/staging-qa.seed.ts
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { getStripeSecretKey, isTestModeStripeKey } from "../utils/stripe-key";
import { eventTypeForSlug } from "@shared/occasions";
import { createClaim, markClaimScored, ratifyClaim, submitClaim } from "../services/neighborhood-claims.service";

export const QA_EXPERT_EMAIL = "qa-expert-kyoto@traveloure.test";

/** The bot accounts, named for the existing QA accounts (doc §5). TB3 is the provider. */
export const STAGING_QA_ACCOUNTS = [
  { key: "TB1", email: "tb1-qa-smoke12@traveloure.test", firstName: "QA", lastName: "Smoke 12", role: "user" },
  { key: "TB2", email: "tb2-qa-smoke9@traveloure.test", firstName: "QA", lastName: "Smoke9", role: "user" },
  { key: "TB3", email: "tb3-supply-scout@traveloure.test", firstName: "TEST", lastName: "Supply Scout", role: "service_provider" },
  { key: "TB4", email: "tb4-wedding-walk@traveloure.test", firstName: "Wedding", lastName: "Walk", role: "user" },
  { key: "EXPERT", email: QA_EXPERT_EMAIL, firstName: "Aiko", lastName: "QA Expert", role: "travel_expert" },
] as const;

export const QA_EXPERT_HANDLE = "qa-expert-kyoto";
export const QA_PROVIDER_HANDLE = "tb3-supply-scout";
export const WEDDING_PLAN_TITLE = "Wedding in Kyoto";

export { stagingQaSeedGate, type StagingQaGate } from "./staging-qa.gate";
import { stagingQaSeedGate } from "./staging-qa.gate";

/** Creates one TEST-mode Stripe Connect account and returns its id, or null with a reason. Injectable for tests. */
export type ConnectAccountCreator = (input: { email: string; kind: "expert" | "provider" }) => Promise<{ id: string } | { error: string }>;

export function stripeTestConnectCreator(env: NodeJS.ProcessEnv = process.env): ConnectAccountCreator {
  return async ({ email, kind }) => {
    const key = getStripeSecretKey(env);
    if (!isTestModeStripeKey(key)) return { error: key ? "the Stripe key is not a test-mode key" : "no Stripe key configured" };
    try {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
      const acct = await stripe.accounts.create({
        type: "express",
        country: "JP",
        email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { traveloure_staging_qa: kind },
      });
      return { id: acct.id };
    } catch (err: any) {
      return { error: `Stripe accounts.create failed: ${err?.type ?? err?.code ?? err?.message ?? "unknown"}` };
    }
  };
}

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}

async function one<T = any>(q: ReturnType<typeof sql>): Promise<T | undefined> {
  return ((await db.execute(q)).rows as T[])[0];
}

/** Insert-if-missing; stamps the three gates an account needs to pass ProtectedRoute. Returns the user id. */
async function ensureAccount(a: (typeof STAGING_QA_ACCOUNTS)[number], passwordHash: string): Promise<string> {
  const existing = await one<{ id: string }>(sql`SELECT id FROM users WHERE lower(email) = ${a.email}`);
  if (existing) {
    await db.execute(sql`
      UPDATE users SET password = COALESCE(password, ${passwordHash}),
                       terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
                       privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
                       email_verified = COALESCE(email_verified, NOW())
       WHERE id = ${existing.id}`);
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO users (id, email, password, first_name, last_name, role, terms_accepted_at, privacy_accepted_at, email_verified)
    VALUES (${id}, ${a.email}, ${passwordHash}, ${a.firstName}, ${a.lastName}, ${a.role}, NOW(), NOW(), NOW())`);
  return id;
}

export interface StagingQaResult {
  ran: boolean;
  /** True when every leg holds — in particular both Connect accounts exist. Boot retries an incomplete run. */
  complete?: boolean;
  reason?: string;
  accounts: Record<string, string>;
  expert?: { connect: string; listingId: string | null; neighbourhood: string | null };
  provider?: { connect: string; listingId: string | null };
  weddingTripId?: string | null;
}

export async function seedStagingQa(opts: { env?: NodeJS.ProcessEnv; createConnectAccount?: ConnectAccountCreator } = {}): Promise<StagingQaResult> {
  const env = opts.env ?? process.env;
  const gate = stagingQaSeedGate(env);
  if (!gate.run) return { ran: false, reason: gate.reason, accounts: {} };
  const createConnect = opts.createConnectAccount ?? stripeTestConnectCreator(env);
  const passwordHash = await hashPassword(env.STAGING_QA_PASSWORD!);

  const accounts: Record<string, string> = {};
  for (const a of STAGING_QA_ACCOUNTS) accounts[a.key] = await ensureAccount(a, passwordHash);
  const expertId = accounts.EXPERT;
  const providerId = accounts.TB3;

  // ── The QA expert: application, Connect, listing, verified neighbourhood ──────────────────────────────
  await db.execute(sql`UPDATE users SET handle = ${QA_EXPERT_HANDLE} WHERE id = ${expertId} AND handle IS NULL
                         AND NOT EXISTS (SELECT 1 FROM users WHERE handle = ${QA_EXPERT_HANDLE})`);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, city, country, status, destinations,
                                    identity_verification_status, identity_verified_at)
    SELECT ${crypto.randomUUID()}, ${expertId}, 'Aiko', 'QA Expert', ${QA_EXPERT_EMAIL}, 'Kyoto', 'Japan', 'approved',
           '["Kyoto","Japan"]'::jsonb, 'verified', NOW()
     WHERE NOT EXISTS (SELECT 1 FROM local_expert_forms WHERE user_id = ${expertId})`);
  // Identity: the smallest write the e2e fixtures make (no Identity webhook reaches a fresh database).
  await db.execute(sql`UPDATE local_expert_forms SET identity_verification_status = 'verified',
                         identity_verified_at = COALESCE(identity_verified_at, NOW()) WHERE user_id = ${expertId}`);

  let expertConnect = "already complete";
  const expertForm = await one<{ stripe_account_id: string | null; stripe_connect_status: string | null }>(
    sql`SELECT stripe_account_id, stripe_connect_status FROM local_expert_forms WHERE user_id = ${expertId}`);
  if (!expertForm?.stripe_account_id) {
    const made = await createConnect({ email: QA_EXPERT_EMAIL, kind: "expert" });
    if ("id" in made) {
      await db.execute(sql`UPDATE local_expert_forms SET stripe_account_id = ${made.id}, stripe_connect_status = 'complete'
                             WHERE user_id = ${expertId} AND stripe_account_id IS NULL`);
      expertConnect = `created ${made.id}`;
    } else {
      expertConnect = `NOT created — ${made.error}; the expert is not routable until it is`;
    }
  } else if (expertForm.stripe_connect_status !== "complete") {
    await db.execute(sql`UPDATE local_expert_forms SET stripe_connect_status = 'complete' WHERE user_id = ${expertId}`);
    expertConnect = `marked complete on ${expertForm.stripe_account_id}`;
  }

  let expertListingId = (await one<{ id: string }>(sql`
    SELECT id FROM provider_services WHERE user_id = ${expertId} AND expert_offering_type_key = 'itinerary_2nd_opinion' LIMIT 1`))?.id ?? null;
  if (!expertListingId) {
    expertListingId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, short_description, price, city, expert_offering_type_key,
                                     approval_status, status, delivery_method)
      VALUES (${expertListingId}, ${expertId}, 'A local checks your Kyoto plan', 'I read your days and tell you what to change.',
              60.00, 'Kyoto', 'itinerary_2nd_opinion', 'approved', 'active', 'async_messaging')`);
  }

  let neighbourhood: string | null = (await one<{ name: string }>(sql`
    SELECT cn.name FROM expert_neighborhoods en JOIN city_neighborhoods cn ON cn.id = en.neighborhood_id
     WHERE en.expert_id = ${expertId} AND en.verified_at IS NOT NULL LIMIT 1`))?.name ?? null;
  if (!neighbourhood) neighbourhood = await ratifyKyotoNeighbourhood(expertId);

  // ── TB3 provider: handle, Connect, one approved listing ────────────────────────────────────────────────
  await db.execute(sql`UPDATE users SET handle = ${QA_PROVIDER_HANDLE} WHERE id = ${providerId} AND handle IS NULL
                         AND NOT EXISTS (SELECT 1 FROM users WHERE handle = ${QA_PROVIDER_HANDLE})`);
  let providerConnect = "already connected";
  const prov = await one<{ stripe_account_id: string | null }>(sql`SELECT stripe_account_id FROM users WHERE id = ${providerId}`);
  if (!prov?.stripe_account_id) {
    const made = await createConnect({ email: "tb3-supply-scout@traveloure.test", kind: "provider" });
    if ("id" in made) {
      await db.execute(sql`UPDATE users SET stripe_account_id = ${made.id}, stripe_account_status = 'active'
                             WHERE id = ${providerId} AND stripe_account_id IS NULL`);
      providerConnect = `created ${made.id}`;
    } else {
      providerConnect = `NOT created — ${made.error}`;
    }
  }
  let providerListingId = (await one<{ id: string }>(sql`
    SELECT id FROM provider_services WHERE user_id = ${providerId} AND approval_status = 'approved' LIMIT 1`))?.id ?? null;
  if (!providerListingId) {
    providerListingId = crypto.randomUUID();
    const cat = await one<{ id: string }>(sql`SELECT id FROM service_categories WHERE category_key = 'photographer' LIMIT 1`);
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, short_description, price, price_type, city, category_id,
                                     approval_status, status, delivery_method, latitude, longitude)
      VALUES (${providerListingId}, ${providerId}, 'Kyoto portrait walk (QA)', 'Two hours of photos on the Philosopher''s Path.',
              150.00, 'fixed', 'Kyoto', ${cat?.id ?? null}, 'approved', 'active', 'in_person', '35.0270', '135.7942')`);
  }

  // ── TB4 wedding plan, minted as the hosted_events door mints it ────────────────────────────────────────
  const tb4 = accounts.TB4;
  let weddingTripId = (await one<{ id: string }>(sql`
    SELECT id FROM trips WHERE user_id = ${tb4} AND occasion_slug = 'wedding' AND title = ${WEDDING_PLAN_TITLE} LIMIT 1`))?.id ?? null;
  if (!weddingTripId) {
    const today = new Date().toISOString().slice(0, 10);
    // The door's mint: the city only, a one-day placeholder window, dates NOT confirmed (LD 42 D12); createTrip writes
    // the owner trip_collaborators row in the same operation (LD 42).
    const trip = await storage.createTrip(
      { userId: tb4, title: WEDDING_PLAN_TITLE, destination: "Kyoto, Japan", startDate: today, endDate: today, status: "draft" } as any,
      { datesChosenByTraveler: false },
    );
    // The door's occasion PATCH (PATCH /api/trips/:tripId/occasion): the coarse type follows the slug through the one map.
    await storage.updateTrip(trip.id, { eventType: eventTypeForSlug("wedding"), occasionSlug: "wedding" } as any);
    weddingTripId = trip.id;
  }
  // Belt and braces for a row minted elsewhere: the owner row must exist (LD 42; server/seeds/README.md).
  await db.execute(sql`
    INSERT INTO trip_collaborators (id, trip_id, user_id, role)
    SELECT ${crypto.randomUUID()}, ${weddingTripId}, ${tb4}, 'owner'
     WHERE NOT EXISTS (SELECT 1 FROM trip_collaborators WHERE trip_id = ${weddingTripId} AND user_id = ${tb4})`);

  const connected = !!(await one(sql`SELECT 1 FROM local_expert_forms WHERE user_id = ${expertId} AND stripe_account_id IS NOT NULL AND stripe_connect_status = 'complete'`))
    && !!(await one(sql`SELECT 1 FROM users WHERE id = ${providerId} AND stripe_account_id IS NOT NULL`));
  return {
    ran: true,
    complete: connected && !!neighbourhood,
    accounts,
    expert: { connect: expertConnect, listingId: expertListingId, neighbourhood },
    provider: { connect: providerConnect, listingId: providerListingId },
    weddingTripId,
  };
}

/** A verified Kyoto neighbourhood through the claim services only (LD 27): create → submit → scored → ratify. */
async function ratifyKyotoNeighbourhood(expertId: string): Promise<string | null> {
  const hood = await one<{ id: string; name: string }>(sql`
    SELECT id, name FROM city_neighborhoods WHERE lower(city) = 'kyoto' ORDER BY slug LIMIT 1`);
  if (!hood) return null;
  const adminId = (await one<{ id: string }>(sql`SELECT id FROM users WHERE role IN ('owner', 'platform_admin', 'admin') ORDER BY created_at LIMIT 1`))?.id;
  if (!adminId) return null;
  const created = await createClaim({ expertId, neighborhoodId: hood.id, actorType: "ops", actorId: adminId });
  if (!created.ok) return null;
  const claimId = created.value.claim.id;
  const tag = "qa";
  const submitted = await submitClaim({
    claimId, expertId: null, actorType: "ops", actorId: adminId, consent: true, consentVersion: "staging-qa",
    capture: {
      p1: [
        { name: `Yasaka Shrine (${tag})`, category: "shrine", doThis: "Go in from the south gate off Higashiōji.", when: { hours: "from 18:00", days: "", season: "" }, watchOut: "The main gate is a queue.", priceBand: null, expertConfidence: "certain" },
        { name: `Kagizen (${tag})`, category: "tea house", doThis: "Order the kuzukiri, sit in the back room.", when: { hours: "before 16:00", days: "closed Monday", season: "" }, watchOut: "Last orders are early.", priceBand: "$$", expertConfidence: "usually_right" },
      ],
      p2: {
        items: [
          { name: `Yasaka Shrine (${tag})`, durationMin: 40, transition: null },
          { name: `Kagizen (${tag})`, durationMin: 50, transition: { mode: "walk", minutes: 8 } },
          { name: `Shirakawa canal (${tag})`, durationMin: 60, transition: { mode: "walk", minutes: 10 } },
        ],
        orderReason: "Lanterns first, tea before it closes, the canal after dark.",
        hardConstraints: [{ kind: "closure_day", detail: "Kagizen closes Monday." }],
      },
      p3: { trigger: "rain", replacesPosition: 3, alternate: { name: `Nishiki arcade (${tag})`, durationMin: 60, transition: { mode: "bus", minutes: 15 } }, reason: "The arcade is covered." },
      p4: [],
    } as any,
  });
  if (!submitted.ok) return null;
  const scored = await markClaimScored({ claimId, version: submitted.value.version, scorerJson: { note: "staging-qa" } });
  if (!scored.ok) return null;
  const ratified = await ratifyClaim({ claimId, adminId });
  return ratified.ok ? hood.name : null;
}

if (process.argv[1]?.endsWith("staging-qa.seed.ts")) {
  seedStagingQa()
    .then((r) => {
      console.log(JSON.stringify(r, null, 1));
      process.exit(r.ran ? 0 : 2);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
