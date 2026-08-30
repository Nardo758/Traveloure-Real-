#!/usr/bin/env node
// scripts/journeys/adversarial-money-access.mjs (J7)
//
// ADVERSARIAL MONEY/ACCESS JOURNEY — permanent, self-contained repo harness per
// docs/EXECUTION_MAP.md §4b and CLAUDE.md §13/§14/§15/§16 + docs/MONEY_MAP.md. Read
// scripts/journeys/README.md + expert-loop.mjs's header first — same house pattern via
// scripts/journeys/lib/journey-lib.mjs (idempotent `advx-` fixtures, verdict-table output).
//
// WHAT THIS PROVES (and does NOT presuppose): every case here is an ATTACK — a request an
// authenticated-but-unauthorized principal should never be able to complete. The expected
// verdict is PASS ("the system refused correctly"). A FAIL means the attack SUCCEEDED — a real
// vulnerability, not a harness bug — and per the governing brief this journey never patches
// product code to make a FAIL disappear; it reports the exact repro, response, and DB delta.
// Some cases are re-proofs of P0s CLAUDE.md §13 already tracks as fixed (the destructive
// cross-trip IDOR cluster, the D1a born-approved lifecycle) — where the code has moved on since
// that doc was last updated, this journey's own PASS is the up-to-date evidence, not a rewrite
// of the doc. One case in this suite (C16b) found a genuinely NEW, previously-undocumented
// mass-assignment hole — see the step's own comment for the exact mechanism.
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (see its header, or README.md).
//      node scripts/journeys/adversarial-money-access.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// Two steps are marked `{ external: true }`: B12b (template_purchases completed → confirm-again
// replay) and B12c (ready-made refunded → confirm-again replay). Both routes retrieve the
// PaymentIntent from Stripe UNCONDITIONALLY, before any status check on the local row — there is
// no early-return the sandbox's dummy `STRIPE_SECRET_KEY=sk_test_x` can reach (unlike the
// coordination-fee confirm route in B12a, which early-returns on a `refunded` row BEFORE ever
// calling Stripe). Empirically, in this sandbox the agent proxy intercepts the outbound call and
// Stripe's SDK throws `StripeAPIError: Invalid JSON received from the Stripe API` — a real
// network failure, not a 401 from a rejected key — so there is no way to reach the actual
// idempotency-guard code path without a live Stripe test-mode key. Structural proof that these
// two routes gate on the LOCAL row's terminal status is left to the Replit dev tester (the
// "Two tracks" convention, scripts/journeys/README.md).
//
// ── FIXTURES (idempotent, `advx-` prefixed) ────────────────────────────────────────
// Three principals: TRAVELER_A (the existing seeded traveler, the legitimate owner in every
// case), USER_B (a fresh fixture account with ZERO relationship to anything TRAVELER_A owns —
// the pure outsider attacker), EARNER (a fresh fixture travel_expert account playing every
// "assigned/rejected expert" and "provider" role this suite needs, and the payout/mass-
// assignment attacker in sections B/C). USER_B and EARNER are minted directly via SQL (reusing
// TRAVELER_A's existing password hash so `login()` works unchanged) since the E2E seed only
// ships 5 fixed accounts and this suite needs a genuine unrelated-third-party attacker.
// Two trips (TRIP_A for the IDOR/logistics/escrow cases, TRIP_PARTNER for the §16 sweep, kept
// separate so EARNER's advisor STATUS can differ per trip — 'rejected' on one, 'accepted' on the
// other — without a stateful flip mid-run), three service_bookings (one per B7/B8/B9 case, so a
// refund/dispute in one step never contaminates another's fixture), one provider_service, one
// coordination_state, one ready-made build (submitted, never approved), one expert_template
// (approved+published, for the content-gate case).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveConfig, preflight, connectDb, dbOne, dbAll, resolveUserIdByEmail,
  upsertTrip, upsertCollaboratorOwner, upsertAdvisor, upsertItem,
  launchBrowser, login, createStepRunner, isoDate,
} from "./lib/journey-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const JOURNEY_FILE = "scripts/journeys/adversarial-money-access.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const TRAVELER_A_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const USER_B_EMAIL = "advx-user-b@traveloure.test";
const EARNER_EMAIL = "advx-earner@traveloure.test";

const TRIP_A_ID = "advx-trip-a";
const TRIP_A_COLLAB_ID = "advx-collab-a";
const TRIP_A_ADVISOR_ID = "advx-advisor-a"; // EARNER, status='rejected' on TRIP_A
const ITEM_A1_ID = "advx-item-a1";

const TRIP_PARTNER_ID = "advx-trip-partner";
const TRIP_PARTNER_COLLAB_ID = "advx-collab-partner";
const TRIP_PARTNER_ADVISOR_ID = "advx-advisor-partner"; // EARNER, status='accepted'

const MAL_COMPARISON_ID = "advx-mal-comp"; // owned by USER_B, points at TRIP_A — seeded directly,
// simulating "a comparison somehow already points at someone else's trip" so the APPLY-TO-TRIP
// endpoint's OWN authorization is what's under test, independent of whether the create endpoint
// can be tricked into producing one today.

const FEE_COMPARISON_ID = "advx-fee-comp"; // owned by TRAVELER_A, untied to any trip
const FEE_VARIANT_ID = "advx-fee-var";
const FEE_VARIANT_TOTAL_COST = "500.00";

const PROVIDER_SERVICE_ID = "advx-svc-1"; // owned by EARNER, approved+active — the booking target
const BOOKING_REFUND_ID = "advx-booking-refund";
const BOOKING_ESCROW_ID = "advx-booking-escrow";
const BOOKING_WINDOW_ID = "advx-booking-window";
const EARNING_REFUND_ID = "advx-earning-refund";

const COORD_STATE_ID = "advx-coord-1";

const UNAPPROVED_SVC_ID = "advx-svc-unapproved";

const READYMADE_TITLE = "Journey: Adversarial Unapproved Build";
const EARNER_HANDLE = "advx-earner-storefront";

const TEMPLATE_ID = "advx-template-1";
const TEMPLATE_SECRET_MARKER = "ADVX-SECRET-DAY-2-CONTENT-MUST-NEVER-LEAK";

async function resetAndSeedFixtures(pg) {
  const travelerAId = await resolveUserIdByEmail(pg, TRAVELER_A_EMAIL);
  const [travelerARow] = await pg.query("SELECT password FROM users WHERE id = $1", [travelerAId]).then(r => r.rows);
  const passwordHash = travelerARow.password;

  // ── Two fresh fixture principals — pure outsiders, unrelated to anything TRAVELER_A owns. ──
  await pg.query(
    `INSERT INTO users (id, email, first_name, last_name, role, password)
     VALUES ('advx-user-b', $1, 'ADVX', 'AttackerB', 'user', $2)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password`,
    [USER_B_EMAIL, passwordHash],
  );
  await pg.query(
    `INSERT INTO users (id, email, first_name, last_name, role, password, handle,
                         stripe_account_id, stripe_account_status, can_receive_payments)
     VALUES ('advx-earner', $1, 'ADVX', 'Earner', 'travel_expert', $2, $3,
             'acct_advx_fixture', 'active', true)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password,
       handle = EXCLUDED.handle, stripe_account_id = EXCLUDED.stripe_account_id,
       stripe_account_status = EXCLUDED.stripe_account_status,
       can_receive_payments = EXCLUDED.can_receive_payments`,
    [EARNER_EMAIL, passwordHash, EARNER_HANDLE],
  );
  const userBId = "advx-user-b";
  const earnerId = "advx-earner";

  // ── Wipe every advx- fixture row so a re-run starts clean (reset-and-seed, not insert-if-absent). ──
  await pg.query("DELETE FROM trip_item_comments WHERE trip_id IN ($1, $2)", [TRIP_A_ID, TRIP_PARTNER_ID]);
  await pg.query("DELETE FROM trip_suggestions WHERE trip_id = $1", [TRIP_PARTNER_ID]);
  await pg.query("DELETE FROM itinerary_items WHERE trip_id IN ($1, $2)", [TRIP_A_ID, TRIP_PARTNER_ID]);
  await pg.query("DELETE FROM itinerary_variants WHERE id = $1", [FEE_VARIANT_ID]);
  await pg.query("DELETE FROM itinerary_comparisons WHERE id IN ($1, $2)", [MAL_COMPARISON_ID, FEE_COMPARISON_ID]);
  await pg.query("DELETE FROM refunds WHERE booking_id IN ($1, $2, $3)", [BOOKING_REFUND_ID, BOOKING_ESCROW_ID, BOOKING_WINDOW_ID]);
  await pg.query("DELETE FROM service_reviews WHERE booking_id IN ($1, $2, $3)", [BOOKING_REFUND_ID, BOOKING_ESCROW_ID, BOOKING_WINDOW_ID]);
  await pg.query("DELETE FROM provider_earnings WHERE id = $1 OR source_id IN ($2, $3, $4)", [EARNING_REFUND_ID, BOOKING_REFUND_ID, BOOKING_ESCROW_ID, BOOKING_WINDOW_ID]);
  await pg.query("DELETE FROM platform_revenue WHERE source_id IN ($1, $2, $3)", [BOOKING_REFUND_ID, BOOKING_ESCROW_ID, BOOKING_WINDOW_ID]);
  await pg.query("DELETE FROM service_bookings WHERE id IN ($1, $2, $3)", [BOOKING_REFUND_ID, BOOKING_ESCROW_ID, BOOKING_WINDOW_ID]);
  await pg.query("DELETE FROM provider_services WHERE id IN ($1, $2)", [PROVIDER_SERVICE_ID, UNAPPROVED_SVC_ID]);
  await pg.query("DELETE FROM coordination_states WHERE id = $1", [COORD_STATE_ID]);
  await pg.query("DELETE FROM expert_payouts WHERE expert_id = $1", [earnerId]);
  await pg.query("DELETE FROM expert_earnings WHERE expert_id = $1", [earnerId]);
  await pg.query("DELETE FROM template_purchases WHERE template_id = $1", [TEMPLATE_ID]);
  await pg.query("DELETE FROM expert_templates WHERE id = $1", [TEMPLATE_ID]);
  // Ready-made fixture: delete by author+title marker (the create endpoint mints its own trip id).
  await pg.query(
    `DELETE FROM ready_made_trips WHERE source_trip_id IN
       (SELECT id FROM trips WHERE author_id = $1 AND title = $2)`,
    [earnerId, READYMADE_TITLE],
  );
  await pg.query("DELETE FROM trips WHERE author_id = $1 AND title = $2", [earnerId, READYMADE_TITLE]);
  await pg.query("DELETE FROM trip_expert_advisors WHERE trip_id IN ($1, $2)", [TRIP_A_ID, TRIP_PARTNER_ID]);
  await pg.query("DELETE FROM trip_collaborators WHERE trip_id IN ($1, $2)", [TRIP_A_ID, TRIP_PARTNER_ID]);
  await pg.query("DELETE FROM trips WHERE id IN ($1, $2)", [TRIP_A_ID, TRIP_PARTNER_ID]);

  // ── TRIP_A: owned by TRAVELER_A, EARNER is a REJECTED advisor. ──
  await upsertTrip(pg, {
    id: TRIP_A_ID, userId: travelerAId, title: "Journey: Adversarial Trip A", destination: "Kyoto, Japan",
    startDate: isoDate(60), endDate: isoDate(65), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: TRIP_A_COLLAB_ID, tripId: TRIP_A_ID, userId: travelerAId });
  await upsertAdvisor(pg, { id: TRIP_A_ADVISOR_ID, tripId: TRIP_A_ID, expertId: earnerId, status: "rejected", workspaceStatus: "draft" });
  await upsertItem(pg, { id: ITEM_A1_ID, tripId: TRIP_A_ID, title: "Journey A Item 1", dayNumber: 1 });

  // ── TRIP_PARTNER: owned by TRAVELER_A, EARNER is an ACCEPTED advisor (the §16 sweep trip). ──
  await upsertTrip(pg, {
    id: TRIP_PARTNER_ID, userId: travelerAId, title: "Journey: Adversarial Partner Sweep", destination: "Kyoto, Japan",
    startDate: isoDate(60), endDate: isoDate(65), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: TRIP_PARTNER_COLLAB_ID, tripId: TRIP_PARTNER_ID, userId: travelerAId });
  await upsertAdvisor(pg, { id: TRIP_PARTNER_ADVISOR_ID, tripId: TRIP_PARTNER_ID, expertId: earnerId, status: "accepted", workspaceStatus: "draft" });

  // ── Malicious comparison: owned by USER_B, tripId points at TRIP_A (seeded directly — see
  // header note). ──
  await pg.query(
    `INSERT INTO itinerary_comparisons (id, user_id, trip_id, destination, status)
     VALUES ($1, $2, $3, 'Kyoto, Japan', 'pending')`,
    [MAL_COMPARISON_ID, userBId, TRIP_A_ID],
  );

  // ── Fee comparison+variant: owned by TRAVELER_A, untied to a trip (for B6). ──
  await pg.query(
    `INSERT INTO itinerary_comparisons (id, user_id, destination, status)
     VALUES ($1, $2, 'Kyoto, Japan', 'pending')`,
    [FEE_COMPARISON_ID, travelerAId],
  );
  await pg.query(
    `INSERT INTO itinerary_variants (id, comparison_id, name, total_cost, status)
     VALUES ($1, $2, 'Journey Variant', $3, 'pending')`,
    [FEE_VARIANT_ID, FEE_COMPARISON_ID, FEE_VARIANT_TOTAL_COST],
  );

  // ── Fixture provider_service (approved+active), owned by EARNER — the booking target. ──
  await pg.query(
    `INSERT INTO provider_services (id, user_id, service_name, short_description, description,
                                     price, delivery_method, status, approval_status)
     VALUES ($1, $2, 'Journey Adversarial Service', 'probe', 'probe desc', '100.00', 'pdf',
             'active', 'approved')`,
    [PROVIDER_SERVICE_ID, earnerId],
  );

  // ── Three service_bookings, one per B7/B8/B9 case — TRAVELER_A is the traveler, EARNER the provider. ──
  // stripe_payment_intent_id is a REALISTIC (fake, sandbox-only) placeholder, not a live PI —
  // these are fixtures for testing the refund/dispute REFUSAL paths, which never reach Stripe.
  // A real completed booking always carries a PI id (see scripts/invariants.mjs
  // "paid-service-bookings-have-payment-intent"); shaping the fixture the same way keeps that
  // invariant runner honest instead of producing a false positive from test-only data.
  await pg.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, completed_at, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4, 'completed', '100.00', now(), 'advx-fake-pi-refund')`,
    [BOOKING_REFUND_ID, PROVIDER_SERVICE_ID, travelerAId, earnerId],
  );
  await pg.query(
    `INSERT INTO provider_earnings (id, provider_id, type, amount, currency, source_type, source_id, status)
     VALUES ($1, $2, 'booking_commission', '80.00', 'USD', 'service_booking', $3, 'releasable')`,
    [EARNING_REFUND_ID, earnerId, BOOKING_REFUND_ID],
  );
  await pg.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, completed_at, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4, 'completed', '100.00', now(), 'advx-fake-pi-escrow')`,
    [BOOKING_ESCROW_ID, PROVIDER_SERVICE_ID, travelerAId, earnerId],
  );
  // Completed 10 days ago — past the default 7-day hold/dispute window (B9).
  await pg.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, completed_at, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4, 'completed', '100.00', now() - interval '10 days', 'advx-fake-pi-window')`,
    [BOOKING_WINDOW_ID, PROVIDER_SERVICE_ID, travelerAId, earnerId],
  );

  // ── Coordination state owned by TRAVELER_A, born 'refunded' (B12a — the #874-class replay). ──
  await pg.query(
    `INSERT INTO coordination_states (id, user_id, experience_type, status, fee_payment_status,
                                       fee_payment_intent_id, fee_amount_cents)
     VALUES ($1, $2, 'wedding', 'intake', 'refunded', 'advx-fake-pi-refunded', 49900)`,
    [COORD_STATE_ID, travelerAId],
  );

  // ── Unapproved provider_service (C13a) — born submitted, never approved. ──
  await pg.query(
    `INSERT INTO provider_services (id, user_id, service_name, short_description, description,
                                     price, delivery_method, status, approval_status)
     VALUES ($1, $2, 'Journey Unapproved Service', 'probe', 'probe desc', '50.00', 'pdf',
             'active', 'submitted')`,
    [UNAPPROVED_SVC_ID, earnerId],
  );

  // ── Approved+published expert_template with real content (C14 content-gate). ──
  await pg.query(
    `INSERT INTO expert_templates (id, expert_id, title, description, destination, duration,
                                    price, is_published, approval_status, itinerary_data)
     VALUES ($1, $2, 'Journey Adversarial Template', 'A template for the content-gate probe',
             'Kyoto, Japan', 3, '199.00', true, 'approved', $3::jsonb)`,
    [TEMPLATE_ID, earnerId, JSON.stringify({
      days: [
        { day: 1, title: "Arrival day", activities: [{ name: TEMPLATE_SECRET_MARKER, notes: TEMPLATE_SECRET_MARKER }] },
        { day: 2, title: "Temple day", activities: [{ name: TEMPLATE_SECRET_MARKER }] },
      ],
    })],
  );

  return { travelerAId, userBId, earnerId };
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  console.log("[seed] resetting & seeding advx- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] travelerA=${seeded.travelerAId} userB=${seeded.userBId} earner=${seeded.earnerId}`);

  const browser = await launchBrowser({ headed: HEADED });
  const aCtx = await browser.newContext({ baseURL: BASE_URL });
  const bCtx = await browser.newContext({ baseURL: BASE_URL });
  const eCtx = await browser.newContext({ baseURL: BASE_URL });
  let aPage, bPage, ePage;

  try {
    aPage = await login(aCtx, TRAVELER_A_EMAIL, PASSWORD);
    bPage = await login(bCtx, USER_B_EMAIL, PASSWORD);
    ePage = await login(eCtx, EARNER_EMAIL, PASSWORD);
    console.log("[auth] traveler A, user B, and earner all authenticated.");

    // ═══════════════════════════ SECTION A — Ownership / IDOR ═══════════════════════════

    // ── A1: B POSTs /api/itinerary-comparisons with A's tripId ──
    await runStep(
      "A1: User B creates a comparison against A's tripId -> refused, A's items untouched",
      async () => {
        const before = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        const resp = await bPage.request.post("/api/itinerary-comparisons", {
          data: { tripId: TRIP_A_ID, destination: "Kyoto, Japan" },
        });
        const body = await resp.json().catch(() => ({}));
        const after = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        if (resp.status() !== 403) {
          const e = new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
          e.uiProof = "N/A (API-driven)";
          e.dbProof = `items before=${before.length} after=${after.length}`;
          throw e;
        }
        if (after.length !== before.length) {
          throw new Error(`A's itinerary_items count changed: ${before.length} -> ${after.length}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `POST refused 403 (${JSON.stringify(body)}); itinerary_items for TRIP_A unchanged at ${after.length} rows`,
        };
      },
    );

    // ── A2: B applies a comparison (owned by B, pointing at A's trip) to A's trip — destructive delete ──
    await runStep(
      "A2: User B applies a comparison pointing at A's trip -> refused BEFORE the destructive delete",
      async () => {
        const before = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        const resp = await bPage.request.post(`/api/itinerary-comparisons/${MAL_COMPARISON_ID}/apply-to-trip`);
        const body = await resp.json().catch(() => ({}));
        const after = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        if (resp.status() !== 403) {
          const e = new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
          e.uiProof = "N/A (API-driven)";
          e.dbProof = `items before=${before.length} after=${after.length}`;
          throw e;
        }
        if (after.length !== before.length) {
          throw new Error(
            `DESTRUCTIVE BREACH: A's itinerary_items count changed ${before.length} -> ${after.length} ` +
              `despite a 403 response`,
          );
        }
        return {
          ui: "N/A (API-driven)",
          db: `apply-to-trip refused 403 (${JSON.stringify(body)}) BEFORE any delete; ` +
            `itinerary_items for TRIP_A unchanged at ${after.length} rows (before=${before.length})`,
        };
      },
    );

    // ── A3a/A3b: reorder + optimize-order on A's trip by B ──
    await runStep("A3a: User B POSTs /itinerary/reorder on A's trip -> refused", async () => {
      const resp = await bPage.request.post(`/api/trips/${TRIP_A_ID}/itinerary/reorder`, {
        data: { dayNumber: 1, itemIds: [ITEM_A1_ID] },
      });
      const body = await resp.json().catch(() => ({}));
      if (![401, 403].includes(resp.status())) {
        throw new Error(`ATTACK SUCCEEDED: expected 401/403, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      return { ui: "N/A (API-driven)", db: `reorder refused ${resp.status()} (${JSON.stringify(body)})` };
    });

    await runStep("A3b: User B POSTs /itinerary/optimize-order on A's trip -> refused", async () => {
      const resp = await bPage.request.post(`/api/trips/${TRIP_A_ID}/itinerary/optimize-order`, {
        data: { dayNumber: 1 },
      });
      const body = await resp.json().catch(() => ({}));
      if (![401, 403].includes(resp.status())) {
        throw new Error(`ATTACK SUCCEEDED: expected 401/403, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      return { ui: "N/A (API-driven)", db: `optimize-order refused ${resp.status()} (${JSON.stringify(body)})` };
    });

    // ── A4a/A4b: REJECTED advisor (EARNER on TRIP_A) attempts item write + plan comment ──
    await runStep(
      "A4a: REJECTED advisor (EARNER) POSTs a new itinerary item on TRIP_A -> refused (canonical isTripAdvisor allow-list)",
      async () => {
        const before = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        const resp = await ePage.request.post(`/api/trips/${TRIP_A_ID}/itinerary-items`, {
          data: { title: "Attacker item", itemType: "activity", dayNumber: 1 },
        });
        const body = await resp.json().catch(() => ({}));
        const after = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_A_ID]);
        if (resp.status() !== 403) {
          throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (after.length !== before.length) {
          throw new Error(`item count changed despite 403: ${before.length} -> ${after.length}`);
        }
        return { ui: "N/A (API-driven)", db: `item write refused 403 (${JSON.stringify(body)}); item count unchanged at ${after.length}` };
      },
    );

    await runStep(
      "A4b: REJECTED advisor (EARNER) posts a plan comment on a TRIP_A item -> refused",
      async () => {
        const resp = await ePage.request.post(`/api/trips/${TRIP_A_ID}/items/${ITEM_A1_ID}/comments`, {
          data: { body: "Attacker comment" },
        });
        const body = await resp.json().catch(() => ({}));
        const commentRows = await dbAll(pg, "SELECT id FROM trip_item_comments WHERE item_id = $1", [ITEM_A1_ID]);
        if (resp.status() !== 403) {
          throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (commentRows.length !== 0) {
          throw new Error(`a comment row was written despite the 403: ${JSON.stringify(commentRows)}`);
        }
        return { ui: "N/A (API-driven)", db: `comment refused 403 (${JSON.stringify(body)}); trip_item_comments for this item = 0 rows` };
      },
    );

    // ── A5a/A5b/A5c: B GETs A's plancard / transport-legs / budget ──
    await runStep("A5a: User B GETs A's trip plancard -> refused", async () => {
      const resp = await bPage.request.get(`/api/trips/${TRIP_A_ID}/plancard`);
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 403) {
        throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body).slice(0, 200)}`);
      }
      return { ui: "N/A (API-driven)", db: `plancard read refused 403 (${JSON.stringify(body)})` };
    });

    await runStep("A5b: User B GETs A's transport-legs -> refused", async () => {
      const resp = await bPage.request.get(`/api/trips/${TRIP_A_ID}/transport-legs`);
      const body = await resp.json().catch(() => ({}));
      // This route deliberately returns 404 (not 403) for a caller with no access — "no draft-
      // listing-style oracle" posture; still a refusal (no data returned to an outsider).
      if (![403, 404].includes(resp.status())) {
        throw new Error(`ATTACK SUCCEEDED: expected 403/404, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      if (body.legs) throw new Error(`legs data leaked despite refusal: ${JSON.stringify(body)}`);
      return { ui: "N/A (API-driven)", db: `transport-legs read refused ${resp.status()} (${JSON.stringify(body)})` };
    });

    await runStep("A5c: User B GETs A's budget/summary (L20 owner-only tier) -> refused", async () => {
      const resp = await bPage.request.get(`/api/trips/${TRIP_A_ID}/budget/summary`);
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 403) {
        throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      return { ui: "N/A (API-driven)", db: `budget/summary read refused 403 (${JSON.stringify(body)})` };
    });

    // ═══════════════════════════════ SECTION B — Money ═══════════════════════════════

    // ── B6: client-supplied amount on the expert-review payment-intent is ignored ──
    await runStep(
      "B6: POST /api/expert-requests/payment-intent with body amount:1 vs amount:999999 -> byte-identical, amount never read from body",
      async () => {
        const routeSrc = fs.readFileSync(path.join(REPO_ROOT, "server/routes/booking-actions.ts"), "utf8");
        const handlerStart = routeSrc.indexOf("router.post('/expert-requests/payment-intent'");
        const handlerSlice = routeSrc.slice(handlerStart, handlerStart + 1200);
        const destructureLine = handlerSlice.match(/const\s*\{[^}]*\}\s*=\s*req\.body;/)?.[0] ?? "";
        if (/\bamount\b/.test(destructureLine)) {
          throw new Error(
            `SOURCE-LEVEL BREACH: the payment-intent handler's req.body destructure includes ` +
              `'amount': ${destructureLine}`,
          );
        }

        const mk = (amount) =>
          aPage.request.post("/api/expert-requests/payment-intent", {
            data: {
              amount, variantId: FEE_VARIANT_ID, comparisonId: FEE_COMPARISON_ID,
              destination: "Kyoto, Japan", serviceType: "review",
            },
          });
        const respLow = await mk(1);
        const bodyLow = await respLow.json().catch(() => ({}));
        const respHigh = await mk(999999);
        const bodyHigh = await respHigh.json().catch(() => ({}));

        // Two possible honest outcomes in THIS sandbox (no live Stripe key):
        //  (a) both calls fail identically deep inside the Stripe SDK call (proxy/dummy-key
        //      failure) — proves the client amount never even reached a branch point; OR
        //  (b) both calls return a real PaymentIntent whose amount is IDENTICAL regardless of
        //      the client-sent value (would only happen with a real Stripe key configured).
        // Either way, the two responses must be byte-identical — any DIVERGENCE between the
        // amount:1 and amount:999999 runs is direct evidence the server read the client amount.
        if (respLow.status() !== respHigh.status() || JSON.stringify(bodyLow) !== JSON.stringify(bodyHigh)) {
          throw new Error(
            `ATTACK SUCCEEDED (or at least: server behavior VARIED with the client amount): ` +
              `amount:1 -> ${respLow.status()} ${JSON.stringify(bodyLow)}; ` +
              `amount:999999 -> ${respHigh.status()} ${JSON.stringify(bodyHigh)}`,
          );
        }
        return {
          ui: "N/A (API-driven)",
          db: `source-level: handler's req.body destructure omits 'amount' (${JSON.stringify(destructureLine)}); ` +
            `dynamic: amount:1 and amount:999999 produced byte-identical responses ` +
            `(${respLow.status()} ${JSON.stringify(bodyLow).slice(0, 150)}) — the client amount had zero effect`,
        };
      },
    );

    // ── B7: non-owner refund ──
    await runStep(
      "B7: User B POSTs /api/bookings/refund for A's booking -> refused, no earnings reversed",
      async () => {
        const before = await dbOne(pg, "SELECT status FROM provider_earnings WHERE id = $1", [EARNING_REFUND_ID]);
        const resp = await bPage.request.post("/api/bookings/refund", {
          data: { bookingId: BOOKING_REFUND_ID, amount: 100, reason: "attack" },
        });
        const body = await resp.json().catch(() => ({}));
        const after = await dbOne(pg, "SELECT status FROM provider_earnings WHERE id = $1", [EARNING_REFUND_ID]);
        const bookingRow = await dbOne(pg, "SELECT status FROM service_bookings WHERE id = $1", [BOOKING_REFUND_ID]);
        if (resp.status() !== 403) {
          throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (after.status !== "releasable" || after.status !== before.status) {
          throw new Error(`earning status changed despite 403: before=${before.status} after=${after.status}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `refund refused 403 (${JSON.stringify(body)}); provider_earnings status still '${after.status}'; ` +
            `service_bookings.status still '${bookingRow.status}'`,
        };
      },
    );

    // ── B8a/B8b: non-owner confirm-completion + dispute ──
    await runStep("B8a: User B POSTs /:id/confirm-completion for A's booking -> refused", async () => {
      const resp = await bPage.request.post(`/api/bookings/${BOOKING_ESCROW_ID}/confirm-completion`);
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 403) {
        throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      return { ui: "N/A (API-driven)", db: `confirm-completion refused 403 (${JSON.stringify(body)})` };
    });

    await runStep("B8b: User B POSTs /:id/dispute for A's booking -> refused", async () => {
      const resp = await bPage.request.post(`/api/bookings/${BOOKING_ESCROW_ID}/dispute`, { data: { reason: "attack" } });
      const body = await resp.json().catch(() => ({}));
      const row = await dbOne(pg, "SELECT status FROM service_bookings WHERE id = $1", [BOOKING_ESCROW_ID]);
      if (resp.status() !== 403) {
        throw new Error(`ATTACK SUCCEEDED: expected 403, got ${resp.status()}: ${JSON.stringify(body)}`);
      }
      if (row.status === "disputed") throw new Error(`booking flipped to disputed despite the 403`);
      return { ui: "N/A (API-driven)", db: `dispute refused 403 (${JSON.stringify(body)}); booking status still '${row.status}'` };
    });

    // ── B9: dispute after the clearance window has closed ──
    await runStep(
      "B9: A (real owner) disputes a booking completed 10 days ago -> 409 dispute_window_closed",
      async () => {
        const resp = await aPage.request.post(`/api/bookings/${BOOKING_WINDOW_ID}/dispute`, { data: { reason: "too late" } });
        const body = await resp.json().catch(() => ({}));
        const row = await dbOne(pg, "SELECT status FROM service_bookings WHERE id = $1", [BOOKING_WINDOW_ID]);
        if (resp.status() !== 409 || body.error !== "dispute_window_closed") {
          throw new Error(`expected 409 dispute_window_closed, got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (row.status === "disputed") throw new Error(`booking flipped to disputed despite the window-closed refusal`);
        return { ui: "N/A (API-driven)", db: `dispute refused 409 dispute_window_closed (${JSON.stringify(body)}); booking status still '${row.status}'` };
      },
    );

    // ── B10: payout self-service — server-derived amount, client body ignored ──
    let earnerPayoutId;
    await runStep(
      "B10: EARNER requests a payout with a huge client-sent amount -> server derives from releasable balance, body ignored",
      async () => {
        await pg.query(
          `INSERT INTO expert_earnings (id, expert_id, type, amount, currency, status)
           VALUES ('advx-earning-payout-1', 'advx-earner', 'template_sale', '250.00', 'USD', 'releasable')`,
        );
        const resp = await ePage.request.post("/api/payouts/request", {
          data: { amount: 999999999, userId: "advx-user-b" }, // both intentionally ignored per §14
        });
        if (resp.status() !== 201) {
          throw new Error(`payout request failed: ${resp.status()} ${await resp.text()}`);
        }
        const body = await resp.json();
        earnerPayoutId = body.id;
        if (Number(body.amount) !== 250) {
          throw new Error(`ATTACK SUCCEEDED (or a real bug): expected server-derived amount 250.00, got ${body.amount}`);
        }
        const row = await dbOne(pg, "SELECT amount, expert_id FROM expert_payouts WHERE id = $1", [earnerPayoutId]);
        if (row.expert_id !== "advx-earner") {
          throw new Error(`ATTACK SUCCEEDED: payout was created for '${row.expert_id}', not the requesting earner`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `expert_payouts row ${earnerPayoutId}: amount='${row.amount}' (== the earner's own $250 releasable ` +
            `balance, NOT the client-sent 999999999), expert_id='${row.expert_id}' (== the session user, NOT the body's userId)`,
        };
      },
    );

    // ── B11: duplicate payout request while one is pending ──
    await runStep(
      "B11: EARNER requests a second payout while the first is still pending -> 409 payout_request_pending",
      async () => {
        const resp = await ePage.request.post("/api/payouts/request", { data: {} });
        const body = await resp.json().catch(() => ({}));
        const payoutRows = await dbAll(pg, "SELECT id FROM expert_payouts WHERE expert_id = 'advx-earner'");
        if (resp.status() !== 409 || body.error !== "payout_request_pending") {
          throw new Error(`ATTACK SUCCEEDED (or a real bug): expected 409 payout_request_pending, got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (payoutRows.length !== 1) {
          throw new Error(`expected exactly 1 expert_payouts row (no duplicate created), found ${payoutRows.length}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `duplicate refused 409 payout_request_pending (${JSON.stringify(body)}); expert_payouts for EARNER still = 1 row`,
        };
      },
    );

    // ── B12a: terminal-state replay — coordination fee refunded -> confirm stays refunded ──
    await runStep(
      "B12a: replay /pay/confirm on a REFUNDED coordination state -> stays refunded, no duplicate revenue",
      async () => {
        const revBefore = await dbAll(pg, "SELECT id FROM platform_revenue WHERE source_id = 'advx-fake-pi-refunded'");
        const resp = await aPage.request.post(`/api/coordination-states/${COORD_STATE_ID}/pay/confirm`);
        const body = await resp.json().catch(() => ({}));
        const row = await dbOne(pg, "SELECT fee_payment_status FROM coordination_states WHERE id = $1", [COORD_STATE_ID]);
        const revAfter = await dbAll(pg, "SELECT id FROM platform_revenue WHERE source_id = 'advx-fake-pi-refunded'");
        if (!body.alreadyRefunded || row.fee_payment_status !== "refunded") {
          throw new Error(
            `ATTACK SUCCEEDED (the #874 class): expected {alreadyRefunded:true}/status stays 'refunded', ` +
              `got ${resp.status()} ${JSON.stringify(body)}, DB status='${row.fee_payment_status}'`,
          );
        }
        if (revAfter.length !== revBefore.length) {
          throw new Error(`platform_revenue rows changed on a replayed confirm: ${revBefore.length} -> ${revAfter.length}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `/pay/confirm replay -> {alreadyRefunded:true} (${JSON.stringify(body)}); ` +
            `fee_payment_status stays 'refunded' (never re-enters 'paid'); platform_revenue rows unchanged at ${revAfter.length}`,
        };
      },
    );

    // ── B12b/B12c: template_purchases + ready-made confirm-again — needs a live Stripe PI retrieve.
    // Both routes call `stripe.paymentIntents.retrieve(...)` UNCONDITIONALLY before any local-row
    // status check (unlike B12a's coordination-fee confirm, which early-returns on a 'refunded'
    // row BEFORE ever calling Stripe) — so there is no code path this sandbox's dummy
    // STRIPE_SECRET_KEY=sk_test_x can reach; the agent proxy mangles the response
    // (`StripeAPIError: Invalid JSON received from the Stripe API`) before any application logic
    // runs. Written to run for REAL against a live Stripe test-mode key (the Replit dev tester),
    // using the `stripe` package directly (test card `pm_card_visa`, confirmed server-side —
    // the same technique server/__tests__/refund-retry-convergence.test.ts uses) rather than a
    // browser Stripe.js flow, since this suite is API-driven.
    await runStep(
      "B12b: template_purchases completed -> replay /purchase/confirm -> no duplicate earning",
      async () => {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        const purchaseResp = await aPage.request.post(`/api/expert-templates/${TEMPLATE_ID}/purchase`);
        if (purchaseResp.status() !== 202) throw new Error(`purchase init failed: ${purchaseResp.status()} ${await purchaseResp.text()}`);
        const { paymentIntentId, purchaseId } = await purchaseResp.json();

        await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: "pm_card_visa" });

        const confirm1 = await aPage.request.post(`/api/expert-templates/${TEMPLATE_ID}/purchase/confirm`, {
          data: { paymentIntentId, purchaseId },
        });
        if (!confirm1.ok()) throw new Error(`first confirm failed: ${confirm1.status()} ${await confirm1.text()}`);

        const earningsBefore = await dbAll(
          pg, "SELECT id FROM expert_earnings WHERE reference_id = $1 AND reference_type = 'template_purchase'", [purchaseId],
        );

        // Replay — same paymentIntentId + purchaseId, purchase already 'completed'.
        const confirm2 = await aPage.request.post(`/api/expert-templates/${TEMPLATE_ID}/purchase/confirm`, {
          data: { paymentIntentId, purchaseId },
        });
        const body2 = await confirm2.json().catch(() => ({}));
        const earningsAfter = await dbAll(
          pg, "SELECT id FROM expert_earnings WHERE reference_id = $1 AND reference_type = 'template_purchase'", [purchaseId],
        );
        const purchaseRow = await dbOne(pg, "SELECT status FROM template_purchases WHERE id = $1", [purchaseId]);

        if (!confirm2.ok() || purchaseRow.status !== "completed") {
          throw new Error(`replay confirm misbehaved: ${confirm2.status()} ${JSON.stringify(body2)}, status='${purchaseRow.status}'`);
        }
        if (earningsAfter.length !== earningsBefore.length) {
          throw new Error(
            `ATTACK SUCCEEDED: replayed confirm created a DUPLICATE earning — ` +
              `before=${earningsBefore.length} after=${earningsAfter.length}`,
          );
        }
        return {
          ui: "N/A (API-driven, live Stripe test-mode confirm)",
          db: `template_purchases.status stays 'completed'; expert_earnings for purchase ${purchaseId} ` +
            `unchanged at ${earningsAfter.length} row(s) after the replayed confirm`,
        };
      },
      { external: true, page: aPage },
    );
    await runStep(
      "B12c: ready-made purchase refunded -> replay /purchase/confirm -> stays refunded, no re-fulfillment",
      async () => {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

        const purchaseResp = await aPage.request.post(`/api/ready-made/${unapprovedListingId}/purchase`);
        // The fixture listing is deliberately never admin-approved (C13b) — a real live-Stripe run
        // of this step needs an APPROVED listing; the Replit dev tester should point this at an
        // approved fixture (e.g. run store-lifecycle.mjs first, then substitute its listingId) —
        // documented here rather than silently asserting against the wrong precondition.
        if (purchaseResp.status() !== 202) {
          throw new Error(
            `purchase init failed (expected — this fixture listing is unapproved by design; substitute ` +
              `an APPROVED listing id for a real live-Stripe run): ${purchaseResp.status()} ${await purchaseResp.text()}`,
          );
        }
        const { paymentIntentId, purchaseId } = await purchaseResp.json();
        await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: "pm_card_visa" });
        const confirm1 = await aPage.request.post(`/api/ready-made/${unapprovedListingId}/purchase/confirm`, { data: { paymentIntentId } });
        if (!confirm1.ok()) throw new Error(`first confirm failed: ${confirm1.status()} ${await confirm1.text()}`);

        const refundResp = await aPage.request.post(`/api/ready-made/purchases/${purchaseId}/refund`);
        if (!refundResp.ok()) throw new Error(`refund failed: ${refundResp.status()} ${await refundResp.text()}`);

        const confirm2 = await aPage.request.post(`/api/ready-made/${unapprovedListingId}/purchase/confirm`, { data: { paymentIntentId } });
        const body2 = await confirm2.json().catch(() => ({}));
        const row = await dbOne(pg, "SELECT status FROM ready_made_purchases WHERE id = $1", [purchaseId]);
        if (row.status !== "refunded") {
          throw new Error(`ATTACK SUCCEEDED: replayed confirm moved a refunded purchase out of 'refunded': ${JSON.stringify(body2)}, status='${row.status}'`);
        }
        return {
          ui: "N/A (API-driven, live Stripe test-mode confirm)",
          db: `ready_made_purchases.status stays 'refunded' after the replayed confirm (${JSON.stringify(body2).slice(0, 150)})`,
        };
      },
      { external: true, page: aPage },
    );

    // ═══════════════════════════ SECTION C — Approval / content gates ═══════════════════════════

    // ── C13a: anonymous read of an UNAPPROVED provider_service ──
    await runStep(
      "C13a: unapproved provider_service absent from feed, detail (404), search, and storefront",
      async () => {
        const feed = await (await fetch(`${BASE_URL}/api/services`)).json();
        const inFeed = (Array.isArray(feed) ? feed : []).some((s) => s.id === UNAPPROVED_SVC_ID);
        const detailResp = await fetch(`${BASE_URL}/api/services/${UNAPPROVED_SVC_ID}`);
        const discover = await (await fetch(`${BASE_URL}/api/discover?q=Journey+Unapproved+Service`)).json();
        const inSearch = (discover.services ?? []).some((s) => s.id === UNAPPROVED_SVC_ID);
        const storefront = await (await fetch(`${BASE_URL}/api/storefront/${EARNER_HANDLE}`)).json().catch(() => ({}));
        const inStorefront = (storefront.services ?? []).some((s) => s.id === UNAPPROVED_SVC_ID);

        const leaks = [];
        if (inFeed) leaks.push("public feed");
        if (detailResp.status !== 404) leaks.push(`detail (status ${detailResp.status}, expected 404)`);
        if (inSearch) leaks.push("search");
        if (inStorefront) leaks.push("storefront");
        if (leaks.length > 0) {
          throw new Error(`LEAK: unapproved service surfaced on: ${leaks.join(", ")}`);
        }
        return {
          ui: "N/A (unauthenticated public reads)",
          db: `submitted-not-approved provider_services row ${UNAPPROVED_SVC_ID}: absent from feed/search/storefront, detail returns 404`,
        };
      },
    );

    // ── C13b: unapproved (submitted, never admin-approved) ready-made listing ──
    let unapprovedListingId, unapprovedBuildTripId;
    await runStep(
      "C13b: submitted-but-unapproved ready-made listing absent from feed, detail (404), and storefront",
      async () => {
        const buildResp = await ePage.request.post("/api/expert/ready-made", {
          data: { title: READYMADE_TITLE, destination: "Kyoto, Japan", durationDays: 2 },
        });
        if (buildResp.status() !== 201) throw new Error(`build create failed: ${buildResp.status()} ${await buildResp.text()}`);
        unapprovedBuildTripId = (await buildResp.json()).tripId;
        for (const dayNumber of [1, 2]) {
          const r = await ePage.request.post(`/api/trips/${unapprovedBuildTripId}/itinerary-items`, {
            data: { title: `Day ${dayNumber} item`, itemType: "activity", dayNumber },
          });
          if (r.status() !== 201) throw new Error(`item create failed: ${r.status()} ${await r.text()}`);
        }
        const shipResp = await ePage.request.post(`/api/expert/ready-made/from-trip/${unapprovedBuildTripId}`, {
          data: { market: "Kyoto" },
        });
        if (shipResp.status() !== 201) throw new Error(`ship-to-store failed: ${shipResp.status()} ${await shipResp.text()}`);
        unapprovedListingId = (await shipResp.json()).listingId;
        const patchResp = await ePage.request.patch(`/api/expert/ready-made/${unapprovedListingId}`, {
          data: {
            title: READYMADE_TITLE, market: "Kyoto", durationDays: 2, planType: "city_itinerary",
            bestSeason: "Spring", pricingMode: "fixed", priceCents: 4900,
            heroImageUrl: "https://images.unsplash.com/photo-advx-fixture",
            heroImageMeta: { unsplashId: "advx-fixture", photographer: "Journey", profileUrl: "https://unsplash.com/@journey" },
          },
        });
        if (!patchResp.ok()) throw new Error(`listing patch failed: ${patchResp.status()} ${await patchResp.text()}`);
        const submitResp = await ePage.request.post(`/api/expert/ready-made/${unapprovedListingId}/submit`);
        if (!submitResp.ok()) throw new Error(`submit failed: ${submitResp.status()} ${await submitResp.text()}`);
        const submitBody = await submitResp.json();
        if (submitBody.listing.status !== "submitted") {
          throw new Error(`expected status='submitted' (never approved), got '${submitBody.listing.status}'`);
        }

        // Never admin-approved — check every public read now.
        const feed = await (await fetch(`${BASE_URL}/api/ready-made`)).json();
        const inFeed = (feed.listings ?? []).some((l) => l.id === unapprovedListingId);
        const detailResp = await fetch(`${BASE_URL}/api/ready-made/${unapprovedListingId}`);
        const storefront = await (await fetch(`${BASE_URL}/api/storefront/${EARNER_HANDLE}`)).json().catch(() => ({}));
        const inStorefront = (storefront.readyMade ?? []).some((r) => r.id === unapprovedListingId);

        const leaks = [];
        if (inFeed) leaks.push("public feed");
        if (detailResp.status !== 404) leaks.push(`detail (status ${detailResp.status}, expected 404)`);
        if (inStorefront) leaks.push("storefront");
        if (leaks.length > 0) throw new Error(`LEAK: unapproved ready-made listing surfaced on: ${leaks.join(", ")}`);

        return {
          ui: "N/A (mixed authenticated-create then unauthenticated-read)",
          db: `ready_made_trips row ${unapprovedListingId} status='submitted' (never approved): absent from feed/storefront, detail returns 404`,
        };
      },
    );

    // ── C14: non-purchaser GET of a paid expert-template detail — content-gated to a teaser ──
    await runStep(
      "C14: non-purchaser (authenticated, not the buyer) GETs the template detail -> full itineraryData withheld, teaser only",
      async () => {
        const resp = await aPage.request.get(`/api/expert-templates/${TEMPLATE_ID}`);
        if (!resp.ok()) throw new Error(`template detail read failed: ${resp.status()} ${await resp.text()}`);
        const body = await resp.json();
        const raw = JSON.stringify(body);
        if (body.itineraryData !== undefined) {
          throw new Error(`LEAK: full itineraryData key present in a non-purchaser's response: ${raw.slice(0, 300)}`);
        }
        if (raw.includes(TEMPLATE_SECRET_MARKER)) {
          throw new Error(`LEAK: the secret content marker leaked into a non-purchaser's response: ${raw.slice(0, 300)}`);
        }
        if (!Array.isArray(body.itineraryPreview) || body.itineraryPreview.length !== 2 || body.itineraryPreview[0]?.title !== "Arrival day") {
          throw new Error(`unexpected teaser shape: ${JSON.stringify(body.itineraryPreview)}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `GET /api/expert-templates/${TEMPLATE_ID} as a non-purchaser: itineraryData key absent, secret marker absent, ` +
            `itineraryPreview carries only {day,title} for both days`,
        };
      },
    );

    // ── C15: §16 sweep — extends partner-gate.mjs's pattern on TRIP_PARTNER ──
    let sweepSuggestionId, sweepItemId;
    const PARTNER_TITLE = "Journey Adversarial Partner Item";
    const PARTNER_DESCRIPTION = "Partner: Klook — Adversarial-sweep fixture, no URL should ever land here.";
    await runStep(
      "C15a: EARNER (accepted advisor) adds a partner-catalog item on TRIP_PARTNER -> files a SUGGESTION, zero items created",
      async () => {
        const resp = await ePage.request.post(`/api/trips/${TRIP_PARTNER_ID}/suggestions`, {
          data: { type: "activity", dayNumber: 1, title: PARTNER_TITLE, description: PARTNER_DESCRIPTION, estimatedCost: "42.00" },
        });
        if (resp.status() !== 200) throw new Error(`expected 200, got ${resp.status()}: ${await resp.text()}`);
        const body = await resp.json();
        sweepSuggestionId = body.suggestionId;
        const itemRows = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_PARTNER_ID]);
        if (itemRows.length !== 0) throw new Error(`expected ZERO itinerary_items pre-approval, found ${itemRows.length}`);
        return { ui: "N/A (API-driven)", db: `trip_suggestions row ${sweepSuggestionId} created; itinerary_items for TRIP_PARTNER = 0` };
      },
    );
    await runStep(
      "C15b: A approves the suggestion -> item materializes with the 'Partner:' marker",
      async () => {
        const resp = await aPage.request.patch(`/api/trips/${TRIP_PARTNER_ID}/suggestions/${sweepSuggestionId}`, {
          data: { status: "approved" },
        });
        if (!resp.ok()) throw new Error(`approve failed: ${resp.status()} ${await resp.text()}`);
        sweepItemId = (await resp.json()).itemId;
        const row = await dbOne(pg, "SELECT description FROM itinerary_items WHERE id = $1", [sweepItemId]);
        if (!(row?.description ?? "").startsWith("Partner: Klook")) throw new Error(`missing marker: '${row?.description}'`);
        return { ui: "N/A (API-driven)", db: `itinerary_items row ${sweepItemId} materialized with the "Partner: Klook" marker` };
      },
    );
    await runStep(
      "C15c: §16 sweep — no https?:// substring anywhere in the written rows",
      async () => {
        const urlPattern = /https?:\/\//i;
        const suggRow = await dbOne(pg, "SELECT title, description FROM trip_suggestions WHERE id = $1", [sweepSuggestionId]);
        const itemRow = await dbOne(
          pg, "SELECT title, description, notes, private_notes, expert_note FROM itinerary_items WHERE id = $1", [sweepItemId],
        );
        const checked = {
          "trip_suggestions.title": suggRow.title, "trip_suggestions.description": suggRow.description,
          "itinerary_items.title": itemRow.title, "itinerary_items.description": itemRow.description,
          "itinerary_items.notes": itemRow.notes, "itinerary_items.private_notes": itemRow.private_notes,
          "itinerary_items.expert_note": itemRow.expert_note,
        };
        const violations = Object.entries(checked).filter(([, v]) => v != null && urlPattern.test(v));
        if (violations.length > 0) throw new Error(`§16 violation: ${JSON.stringify(violations)}`);
        return { ui: "N/A (API-driven)", db: `${Object.keys(checked).length} columns scanned, zero contain an https?:// substring` };
      },
    );

    // ═══ C16: mass-assignment on the create/update endpoints ═══

    // ── C16a: provider_services CREATE — the F2 clamp holds ──
    let createdSvcId;
    await runStep(
      "C16a: EARNER POSTs /api/provider/services with approvalStatus:'approved' + a spoofed userId -> both ignored (F2 clamp)",
      async () => {
        const resp = await ePage.request.post("/api/provider/services", {
          data: {
            serviceName: "Journey Mass-Assign Create Probe", shortDescription: "probe", description: "probe desc",
            price: "10.00", deliveryMethod: "pdf", status: "draft",
            approvalStatus: "approved", userId: "advx-user-b",
          },
        });
        if (resp.status() !== 201) throw new Error(`create failed: ${resp.status()} ${await resp.text()}`);
        const body = await resp.json();
        createdSvcId = body.id;
        if (body.approvalStatus === "approved") {
          throw new Error(`ATTACK SUCCEEDED: born approvalStatus='approved' despite the client-sent value`);
        }
        if (body.userId !== "advx-earner") {
          throw new Error(`ATTACK SUCCEEDED: userId='${body.userId}', expected the session user 'advx-earner'`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `provider_services row ${createdSvcId}: approvalStatus='${body.approvalStatus}' (clamped, never 'approved'), ` +
            `userId='${body.userId}' (session user, spoofed 'advx-user-b' ignored)`,
        };
      },
    );

    // ── C16b: provider_services PATCH — NEW FINDING, self-approval via mass-assignment ──
    await runStep(
      "C16b: EARNER PATCHes their own submitted service with {approvalStatus:'approved'} — expected to be refused/ignored",
      async () => {
        const before = await dbOne(pg, "SELECT approval_status FROM provider_services WHERE id = $1", [createdSvcId]);
        const resp = await ePage.request.patch(`/api/provider/services/${createdSvcId}`, {
          data: { approvalStatus: "approved" },
        });
        const body = await resp.json().catch(() => ({}));
        const after = await dbOne(pg, "SELECT approval_status FROM provider_services WHERE id = $1", [createdSvcId]);
        if (resp.ok() && after.approval_status === "approved") {
          const e = new Error(
            `ATTACK SUCCEEDED (NEW FINDING, not previously documented in CLAUDE.md §13): ` +
              `PATCH /api/provider/services/:id applies req.body.approvalStatus with NO clamp — the F2 fix ` +
              `(D1a born-submitted lifecycle) covers ONLY POST /api/provider/services (createProviderService), ` +
              `not PATCH (updateProviderService, server/storage.ts ~1216-1233, which does ` +
              `'db.update(providerServices).set(patch)' with patch built from ` +
              `'insertProviderServiceSchema.partial().parse(body)' minus only 'userId' — approvalStatus is NOT ` +
              `stripped). A provider/expert can self-approve their OWN submitted listing in one PATCH call, ` +
              `completely bypassing the admin queue: before='${before.approval_status}', after='${after.approval_status}'.`,
          );
          e.uiProof = "N/A (API-driven)";
          e.dbProof = `provider_services.approval_status: before='${before.approval_status}', after='${after.approval_status}' (PATCH response ${resp.status()}: ${JSON.stringify(body).slice(0, 200)})`;
          throw e;
        }
        return {
          ui: "N/A (API-driven)",
          db: `PATCH did not flip approval_status to 'approved': before='${before.approval_status}', after='${after.approval_status}'`,
        };
      },
    );

    // ── C16c: ready-made PATCH — .strict() schema rejects an unknown/malicious field wholesale ──
    await runStep(
      "C16c: EARNER PATCHes their ready-made listing with an approvalStatus field slipped in -> whole request rejected (400, .strict())",
      async () => {
        const before = await dbOne(pg, "SELECT status, title FROM ready_made_trips WHERE id = $1", [unapprovedListingId]);
        const resp = await ePage.request.patch(`/api/expert/ready-made/${unapprovedListingId}`, {
          data: { title: "Attacker-renamed title", approvalStatus: "approved" },
        });
        const body = await resp.json().catch(() => ({}));
        const after = await dbOne(pg, "SELECT status, title FROM ready_made_trips WHERE id = $1", [unapprovedListingId]);
        if (resp.status() !== 400) {
          throw new Error(`ATTACK SUCCEEDED (or a real bug): expected 400 (.strict() schema rejection), got ${resp.status()}: ${JSON.stringify(body)}`);
        }
        if (after.status === "approved" || after.title !== before.title) {
          throw new Error(`row was mutated despite the 400: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `PATCH refused 400 (${JSON.stringify(body).slice(0, 150)}); ready_made_trips row unchanged: status='${after.status}', title='${after.title}'`,
        };
      },
    );
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("adversarial-money-access");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
