#!/usr/bin/env node
// scripts/journeys/store-lifecycle.mjs (J4)
//
// STORE-LIFECYCLE JOURNEY — permanent, self-contained repo harness per docs/EXECUTION_MAP.md
// §4b. Read scripts/journeys/README.md + expert-loop.mjs's header first — same house pattern via
// scripts/journeys/lib/journey-lib.mjs (idempotent `jrny4-` fixtures, verdict-table output).
//
// WHAT THIS PROVES: the Ready Made Trips "build-first / distribute-later" store lane
// (§17, CLAUDE.md §10) end to end — an authored build ships to the store (POST
// .../from-trip/:tripId), the author edits price/plan (PATCH), submits for admin review (the
// D1a queue — an author can never self-approve), an admin approves it (with the insideCounts
// snapshot), the approved listing surfaces on all three public read surfaces (the store feed,
// the detail page, the author's /p/:handle storefront), the author withdraws it (hides it from
// every public surface immediately, per-status-agnostic), resubmits (re-enters the SAME queue,
// never straight back to 'approved'), and the delete matrix: a live (non-withdrawn) listing
// blocks trip deletion (409), a withdrawn+never-sold build deletes cleanly (204, listing+trip
// both gone), and a withdrawn build that WAS sold (a real `ready_made_purchases` row) refuses
// deletion permanently (409 sold-history) even after withdrawal.
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (see its header, or README.md).
//      node scripts/journeys/store-lifecycle.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// No literal `{external:true}` steps. The "seeded completed purchase row" for the sold-history
// delete-refusal step is a DIRECT DB fixture insert (a real Stripe checkout needs a live test
// key + the Stripe Elements UI) — `ready_made_purchases` has no pre-payment state by design
// (migration 133: a row exists only after Stripe verifies `succeeded`), so a row's mere
// EXISTENCE is the "was this ever sold?" signal the delete-refusal code checks; seeding it
// directly is the correct way to prove that check without a real payment rail.
//
// ── FIXTURES (idempotent, `jrny4-` prefixed) ────────────────────────────────────────
// Two authored-build trips are minted fresh every run via the REAL creation endpoint (title
// markers "Journey: Store Lifecycle" and "Journey: Store Lifecycle Sold") — reset-and-seed here
// means "delete both from prior runs (author+title marker, cascading their listings/purchases),
// then create fresh." `users.handle` for the expert account is a fixed idempotent upsert (the
// storefront read target).

import {
  resolveConfig, preflight, connectDb, dbOne, resolveUserIdByEmail,
  launchBrowser, login, createStepRunner,
} from "./lib/journey-lib.mjs";

const JOURNEY_FILE = "scripts/journeys/store-lifecycle.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "test-admin@traveloure.test";
const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";

const BUILD_TITLE = "Journey: Store Lifecycle";
const SOLD_BUILD_TITLE = "Journey: Store Lifecycle Sold";
const HANDLE = "jrny4-storefront";

const HERO_URL = "https://images.unsplash.com/photo-jrny4-kyoto-hero";
const HERO_META = {
  unsplashId: "jrny4-photo-id",
  photographer: "Journey Test Photographer",
  profileUrl: "https://unsplash.com/@journeytestphotographer",
};

async function deleteBuildByTitle(pg, expertId, title) {
  await pg.query(
    `DELETE FROM ready_made_purchases WHERE ready_made_trip_id IN
       (SELECT id FROM ready_made_trips WHERE source_trip_id IN
          (SELECT id FROM trips WHERE author_id = $1 AND title = $2))`,
    [expertId, title],
  );
  await pg.query(
    `DELETE FROM ready_made_trips WHERE source_trip_id IN
       (SELECT id FROM trips WHERE author_id = $1 AND title = $2)`,
    [expertId, title],
  );
  await pg.query("DELETE FROM trips WHERE author_id = $1 AND title = $2", [expertId, title]);
}

async function resetAndSeedFixtures(pg, expertId) {
  await deleteBuildByTitle(pg, expertId, BUILD_TITLE);
  await deleteBuildByTitle(pg, expertId, SOLD_BUILD_TITLE);
  await pg.query(
    `UPDATE users SET handle = $1 WHERE id = $2`,
    [HANDLE, expertId],
  );
  // Idempotent claim: if another fixture/user already holds this handle from a stale run,
  // reclaim it (the unique index means at most one row can carry it — safe to force here since
  // it's a `jrny4-` namespaced value nothing else should ever legitimately hold).
  await pg.query(`UPDATE users SET handle = NULL WHERE handle = $1 AND id <> $2`, [HANDLE, expertId]);
  await pg.query(`UPDATE users SET handle = $1 WHERE id = $2 AND handle IS DISTINCT FROM $1`, [HANDLE, expertId]);
}

async function createAuthoredBuildWithItems(expertPage, pg, title) {
  const resp = await expertPage.request.post("/api/expert/ready-made", {
    data: { title, destination: "Kyoto, Japan", durationDays: 3 },
  });
  if (resp.status() !== 201) throw new Error(`build create failed: ${resp.status()} ${await resp.text()}`);
  const tripId = (await resp.json()).tripId;
  for (const dayNumber of [1, 2, 3]) {
    const r = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
      data: { title: `Journey Day ${dayNumber} Item`, itemType: "activity", dayNumber },
    });
    if (r.status() !== 201) throw new Error(`day-${dayNumber} item create failed: ${r.status()} ${await r.text()}`);
  }
  return tripId;
}

async function patchListingForSubmit(expertPage, listingId, titleOverride) {
  const resp = await expertPage.request.patch(`/api/expert/ready-made/${listingId}`, {
    data: {
      title: titleOverride,
      market: "Kyoto",
      durationDays: 3,
      planType: "city_itinerary",
      bestSeason: "Spring",
      pricingMode: "fixed",
      priceCents: 9900,
      heroImageUrl: HERO_URL,
      heroImageMeta: HERO_META,
    },
  });
  if (!resp.ok()) throw new Error(`listing patch failed: ${resp.status()} ${await resp.text()}`);
  return resp.json();
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);
  const travelerId = await resolveUserIdByEmail(pg, TRAVELER_EMAIL);
  console.log("[seed] resetting & seeding jrny4- fixtures (idempotent)...");
  await resetAndSeedFixtures(pg, expertId);

  const browser = await launchBrowser({ headed: HEADED });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL });
  const adminCtx = await browser.newContext({ baseURL: BASE_URL });
  let expertPage, adminPage;
  let tripId, listingId;
  let soldTripId, soldListingId;

  try {
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    adminPage = await login(adminCtx, ADMIN_EMAIL, PASSWORD);
    console.log("[auth] expert + admin both authenticated.");

    // ═══ Step 1 — build a full authored trip, then ship it to store ═══
    await runStep("Expert: create build + ship to store (POST /from-trip)", async () => {
      tripId = await createAuthoredBuildWithItems(expertPage, pg, BUILD_TITLE);
      const resp = await expertPage.request.post(`/api/expert/ready-made/from-trip/${tripId}`, {
        data: { market: "Kyoto" },
      });
      if (resp.status() !== 201) throw new Error(`ship-to-store failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      listingId = body.listingId;
      const row = await dbOne(pg, "SELECT status, market FROM ready_made_trips WHERE id = $1", [listingId]);
      if (row?.status !== "draft" || row?.market !== "Kyoto") throw new Error(`unexpected listing row: ${JSON.stringify(row)}`);
      return {
        ui: "N/A (API-driven)",
        db: `ready_made_trips row ${listingId} born status='draft', market='Kyoto' (source_trip_id=${tripId})`,
      };
    });

    // ═══ Step 2 — PATCH price/plan ═══
    await runStep("Expert: PATCH price/plan", async () => {
      const body = await patchListingForSubmit(expertPage, listingId, BUILD_TITLE);
      const l = body.listing;
      if (l.priceCents !== 9900 || l.planType !== "city_itinerary" || l.heroImageUrl !== HERO_URL) {
        throw new Error(`unexpected patched listing: ${JSON.stringify(l)}`);
      }
      if (body.reReviewRequired !== false) throw new Error(`expected reReviewRequired=false pre-approval, got ${body.reReviewRequired}`);
      return { ui: "N/A (API-driven)", db: `ready_made_trips row ${listingId}: priceCents=9900, planType='city_itinerary', heroImageUrl set` };
    });

    // ═══ Step 3 — submit -> in the admin pending queue ═══
    await runStep("Expert: submit -> assert submitted + present in admin pending queue", async () => {
      const resp = await expertPage.request.post(`/api/expert/ready-made/${listingId}/submit`);
      if (!resp.ok()) throw new Error(`submit failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      if (body.listing.status !== "submitted") throw new Error(`expected status='submitted', got '${body.listing.status}'`);

      const pendingResp = await adminPage.request.get("/api/admin/ready-made/pending");
      if (!pendingResp.ok()) throw new Error(`admin pending read failed: ${pendingResp.status()}`);
      const pendingBody = await pendingResp.json();
      const inQueue = (pendingBody.pending ?? []).find((p) => p.id === listingId);
      if (!inQueue) throw new Error(`listing ${listingId} not found in the admin pending queue`);
      return { ui: "N/A (API-driven)", db: `ready_made_trips.status='submitted'; present in GET /api/admin/ready-made/pending (${pendingBody.pending.length} rows)` };
    });

    // ═══ Step 4 — admin approves ═══
    await runStep("Admin: approve the listing", async () => {
      const resp = await adminPage.request.post(`/api/admin/ready-made/${listingId}/approve`);
      if (!resp.ok()) throw new Error(`approve failed: ${resp.status()} ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT status, reviewed_at FROM ready_made_trips WHERE id = $1", [listingId]);
      if (row?.status !== "approved" || !row?.reviewed_at) throw new Error(`unexpected row after approve: ${JSON.stringify(row)}`);
      return { ui: "N/A (API-driven)", db: `ready_made_trips.status='approved', reviewed_at set` };
    });

    // ═══ Step 5 — public feed/detail/storefront all return it ═══
    await runStep("Public reads: feed + detail + storefront all return the approved listing", async () => {
      // Plain global fetch() (unauthenticated, no cookie jar — proving these are genuinely
      // PUBLIC reads) — note fetch()'s Response uses `.ok`/`.status` as PROPERTIES, not
      // methods, unlike Playwright's APIResponse used everywhere else in this suite.
      const feedResp = await fetch(`${BASE_URL}/api/ready-made`);
      if (!feedResp.ok) throw new Error(`public feed failed: ${feedResp.status}`);
      const feedBody = await feedResp.json();
      const inFeed = (feedBody.listings ?? []).find((l) => l.id === listingId);
      if (!inFeed) throw new Error(`listing ${listingId} not present in the public feed`);

      const detailResp = await fetch(`${BASE_URL}/api/ready-made/${listingId}`);
      if (!detailResp.ok) throw new Error(`public detail failed: ${detailResp.status}`);
      const detailBody = await detailResp.json();
      if (detailBody.listing?.id !== listingId || detailBody.preview !== false) {
        throw new Error(`unexpected public detail: ${JSON.stringify(detailBody)}`);
      }

      const storeResp = await fetch(`${BASE_URL}/api/storefront/${HANDLE}`);
      if (!storeResp.ok) throw new Error(`storefront read failed: ${storeResp.status}`);
      const storeBody = await storeResp.json();
      const onStorefront = (storeBody.readyMade ?? []).find((r) => r.id === listingId);
      if (!onStorefront) throw new Error(`listing ${listingId} not present on /api/storefront/${HANDLE}`);

      return {
        ui: "N/A (unauthenticated public reads)",
        db: `feed (${feedBody.listings.length} rows), detail, and storefront (${storeBody.readyMade.length} readyMade rows) all include listing ${listingId}`,
      };
    });

    // ═══ Step 6 — withdraw -> hidden from every public read ═══
    await runStep("Expert: withdraw -> assert ALL public reads hide it", async () => {
      const resp = await expertPage.request.post(`/api/expert/ready-made/${listingId}/withdraw`);
      if (!resp.ok()) throw new Error(`withdraw failed: ${resp.status()} ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT status FROM ready_made_trips WHERE id = $1", [listingId]);
      if (row?.status !== "withdrawn") throw new Error(`expected status='withdrawn', got '${row?.status}'`);

      const feedBody = await (await fetch(`${BASE_URL}/api/ready-made`)).json();
      if ((feedBody.listings ?? []).some((l) => l.id === listingId)) throw new Error("withdrawn listing still present in the public feed");

      const detailResp = await fetch(`${BASE_URL}/api/ready-made/${listingId}`);
      if (detailResp.status !== 404) throw new Error(`expected 404 for a withdrawn listing (no session), got ${detailResp.status}`);

      const storeBody = await (await fetch(`${BASE_URL}/api/storefront/${HANDLE}`)).json();
      if ((storeBody.readyMade ?? []).some((r) => r.id === listingId)) throw new Error("withdrawn listing still present on the storefront");

      return {
        ui: "N/A (unauthenticated public reads)",
        db: `ready_made_trips.status='withdrawn'; absent from feed, detail (404), and storefront`,
      };
    });

    // ═══ Step 7 — resubmit -> submitted again ═══
    await runStep("Expert: resubmit -> assert submitted again", async () => {
      const resp = await expertPage.request.post(`/api/expert/ready-made/${listingId}/submit`);
      if (!resp.ok()) throw new Error(`resubmit failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      if (body.listing.status !== "submitted") throw new Error(`expected status='submitted', got '${body.listing.status}'`);
      return { ui: "N/A (API-driven)", db: `ready_made_trips.status='submitted' (withdrawn -> submitted, D1a: never straight back to 'approved')` };
    });

    // ═══ Step 8 — delete matrix (a): delete while submitted -> 409 ═══
    await runStep("Delete matrix (a): delete while submitted -> 409", async () => {
      const resp = await expertPage.request.delete(`/api/expert/ready-made/build/${tripId}`);
      if (resp.status() !== 409) throw new Error(`expected 409, got ${resp.status()}: ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT id FROM trips WHERE id = $1", [tripId]);
      if (!row) throw new Error("trip was deleted despite the 409 refusal");
      return { ui: "N/A (API-driven)", db: `trips row ${tripId} still present — the 409 refused deletion of a live (non-withdrawn) listing` };
    });

    // ═══ Step 9 — delete matrix (b): withdraw then delete with zero purchases -> 204 ═══
    await runStep("Delete matrix (b): withdraw then delete (zero purchases) -> 204, listing+trip gone", async () => {
      const wResp = await expertPage.request.post(`/api/expert/ready-made/${listingId}/withdraw`);
      if (!wResp.ok()) throw new Error(`withdraw failed: ${wResp.status()} ${await wResp.text()}`);
      const dResp = await expertPage.request.delete(`/api/expert/ready-made/build/${tripId}`);
      if (dResp.status() !== 204) throw new Error(`expected 204, got ${dResp.status()}: ${await dResp.text()}`);
      const tripRow = await dbOne(pg, "SELECT id FROM trips WHERE id = $1", [tripId]);
      const listingRow = await dbOne(pg, "SELECT id FROM ready_made_trips WHERE id = $1", [listingId]);
      if (tripRow || listingRow) throw new Error(`expected both gone, got trip=${JSON.stringify(tripRow)} listing=${JSON.stringify(listingRow)}`);
      return { ui: "N/A (API-driven)", db: `trips row ${tripId} AND ready_made_trips row ${listingId} both deleted` };
    });

    // ═══ Step 10 — delete matrix (c): a withdrawn build WITH sold history -> 409 sold-history ═══
    await runStep("Delete matrix (c): withdrawn + a real purchase row -> 409 sold-history (permanent)", async () => {
      soldTripId = await createAuthoredBuildWithItems(expertPage, pg, SOLD_BUILD_TITLE);
      const shipResp = await expertPage.request.post(`/api/expert/ready-made/from-trip/${soldTripId}`, { data: { market: "Kyoto" } });
      if (shipResp.status() !== 201) throw new Error(`ship-to-store failed: ${shipResp.status()} ${await shipResp.text()}`);
      soldListingId = (await shipResp.json()).listingId;
      await patchListingForSubmit(expertPage, soldListingId, SOLD_BUILD_TITLE);
      const subResp = await expertPage.request.post(`/api/expert/ready-made/${soldListingId}/submit`);
      if (!subResp.ok()) throw new Error(`submit failed: ${subResp.status()} ${await subResp.text()}`);
      const apResp = await adminPage.request.post(`/api/admin/ready-made/${soldListingId}/approve`);
      if (!apResp.ok()) throw new Error(`approve failed: ${apResp.status()} ${await apResp.text()}`);
      const wResp = await expertPage.request.post(`/api/expert/ready-made/${soldListingId}/withdraw`);
      if (!wResp.ok()) throw new Error(`withdraw failed: ${wResp.status()} ${await wResp.text()}`);

      // Seed a real completed purchase row directly (see header note: ready_made_purchases has
      // NO pre-payment state by design — a real Stripe checkout can't be exercised locally).
      await pg.query(
        `INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, currency, stripe_payment_intent_id, status)
         VALUES ('jrny4-purchase-1', $1, $2, 9900, 'USD', 'jrny4-fake-pi-1', 'paid')
         ON CONFLICT (id) DO UPDATE SET ready_made_trip_id = EXCLUDED.ready_made_trip_id, status = 'paid'`,
        [travelerId, soldListingId],
      );

      const dResp = await expertPage.request.delete(`/api/expert/ready-made/build/${soldTripId}`);
      if (dResp.status() !== 409) throw new Error(`expected 409 sold-history, got ${dResp.status()}: ${await dResp.text()}`);
      const body = await dResp.json();
      if (!/sold/i.test(body.message ?? "")) throw new Error(`expected a 'sold' message, got ${JSON.stringify(body)}`);

      const tripRow = await dbOne(pg, "SELECT id FROM trips WHERE id = $1", [soldTripId]);
      if (!tripRow) throw new Error("trip was deleted despite the sold-history refusal");
      return {
        ui: "N/A (API-driven)",
        db: `ready_made_trips row ${soldListingId} withdrawn but carries a real ready_made_purchases row -> DELETE refused permanently (409): '${body.message}'`,
      };
    });
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("store-lifecycle");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
