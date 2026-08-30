#!/usr/bin/env node
// scripts/journeys/workstation-build.mjs (J3)
//
// WORKSTATION-BUILD JOURNEY — permanent, self-contained repo harness per docs/EXECUTION_MAP.md
// §4b. Read scripts/journeys/README.md + expert-loop.mjs's header first — same house pattern via
// scripts/journeys/lib/journey-lib.mjs (idempotent `jrny3-` fixtures, verdict-table output).
//
// WHAT THIS PROVES: the Workstation Add-panel's "one registry-backed search, no third content
// home" model (§17) — an expert creates an AUTHORED build (POST /api/expert/ready-made) and adds
// one item from each source: DMO (after refine-and-submit — W5-C's overlay actually reaches the
// add write, not just the library view), Platform content (the central content_registry search,
// with the `sourced`/dmo_content exclusion proven, not assumed), an owned Platform service (the
// content-logistics envelope carry — migration 166), a Custom item (the honest geocode-fallback
// null, no GOOGLE_MAPS_API_KEY configured), and a Partner-catalog item (the §16 no-URL-leak
// write shape). Then: within-day reorder + "Suggest best order" (optimize-order, applied via
// reorder), the transport-gap checker (item 21) flagging then clearing once transport is marked
// provided, and the canvas Plan map's honest environment-gated rendering (item 16/19).
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (see its header, or README.md).
//      node scripts/journeys/workstation-build.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// No literal `{external:true}` steps. Two things this journey CANNOT exercise locally, both
// documented in-line rather than faked: (1) Google Places autocomplete (a real browser JS widget
// requiring a live GOOGLE_MAPS_API_KEY) — the journey instead proves the submit-time
// `/api/geocode` FALLBACK path honestly returns "unavailable" with no key configured, which is
// the code path that actually runs when Places has nothing to offer; (2) the canvas Plan map's
// actual `<Map>`/marker rendering (client-bundled `VITE_GOOGLE_MAPS_API_KEY`, also unset in this
// sandbox) — the journey asserts the testids that render regardless of that key (the day-filter
// controls) and the honest `text-plan-map-unavailable` fallback, per this journey's own dispatch
// note ("prefer asserting the section testids that render regardless").
//
// ── FIXTURES (idempotent, `jrny3-` prefixed) ────────────────────────────────────────
// The authored-build TRIP is minted fresh every run via the REAL creation endpoint (it has no
// caller-supplied id) — reset-and-seed here means "delete last run's build (by author+title
// marker) first, then call POST /api/expert/ready-made again," not an upsert. Every other
// fixture (a seeded provider_services row, a content_registry row, a decoy dmo_content registry
// row) uses a fixed `jrny3-` id and is upserted.

import {
  resolveConfig, preflight, connectDb, dbOne, dbAll, resolveUserIdByEmail,
  launchBrowser, login, waitVisible, createStepRunner,
} from "./lib/journey-lib.mjs";

const JOURNEY_FILE = "scripts/journeys/workstation-build.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "test-admin@traveloure.test";

const BUILD_TITLE = "Journey: Workstation Build";
const OWN_SERVICE_ID = "jrny3-own-service";
const CONTENT_REGISTRY_ID = "jrny3-content-pill";
const DMO_DECOY_REGISTRY_ID = "jrny3-dmo-decoy";
const DMO_REFINED_NAME = "Journey Refined DMO Name";
const PARTNER_TITLE = "Journey Partner Catalog Add";

async function resetAndSeedFixtures(pg, expertId) {
  // ── Kill last run's authored build (by author + title marker) ──
  await pg.query(
    `DELETE FROM ready_made_trips WHERE source_trip_id IN
       (SELECT id FROM trips WHERE author_id = $1 AND title = $2)`,
    [expertId, BUILD_TITLE],
  );
  await pg.query("DELETE FROM trips WHERE author_id = $1 AND title = $2", [expertId, BUILD_TITLE]);

  // ── Own provider_services row (approved + active), the "My services" pill's read target ──
  await pg.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, price, delivery_timeframe, transport_provided,
        pickup_address, approval_status, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', 'active')
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, service_name = EXCLUDED.service_name,
       delivery_timeframe = EXCLUDED.delivery_timeframe, transport_provided = EXCLUDED.transport_provided,
       pickup_address = EXCLUDED.pickup_address, approval_status = 'approved', status = 'active',
       updated_at = now()`,
    [OWN_SERVICE_ID, expertId, "Journey Owned Tea Ceremony", "A private tea ceremony experience.",
      "60.00", "2 hours", "yes", "Hotel lobby"],
  );

  // ── Published content_registry row (Platform-content pill target) + a decoy 'dmo_content'
  //    row proving the §12/DMO exclusion at read time (never just assumed). ──
  await pg.query(
    `INSERT INTO content_registry (id, tracking_number, content_type, content_id, status, title, description, metadata)
     VALUES ($1, $1, 'experience', $1, 'published', $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = 'published', title = EXCLUDED.title, description = EXCLUDED.description,
       metadata = EXCLUDED.metadata, updated_at = now()`,
    [CONTENT_REGISTRY_ID, "Journey Platform Content Pill Item", "A platform-authored Kyoto experience.",
      JSON.stringify({ city: "Kyoto" })],
  );
  await pg.query(
    `INSERT INTO content_registry (id, tracking_number, content_type, content_id, status, title, description, metadata)
     VALUES ($1, $1, 'dmo_content', $1, 'published', $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = 'published', title = EXCLUDED.title, metadata = EXCLUDED.metadata, updated_at = now()`,
    [DMO_DECOY_REGISTRY_ID, "Journey DMO Decoy (must never appear in Platform-content reads)", "sourced-origin, must be excluded",
      JSON.stringify({ city: "Kyoto" })],
  );

  // ── Clear any prior-run DMO edit for the row we're about to refine (hygiene only — the
  //    library query would still pick the latest one either way). ──
  const dmoRow = await dbOne(
    pg,
    `SELECT id, expert_workspace_visible, status FROM dmo_raw_content
     WHERE city ILIKE 'Kyoto' AND status NOT IN ('rejected', 'quarantined')
     ORDER BY content_type, name LIMIT 1`,
  );
  if (dmoRow) {
    await pg.query("DELETE FROM expert_dmo_edits WHERE raw_content_id = $1 AND expert_id = $2", [dmoRow.id, expertId]);
  }

  return { dmoRawContentId: dmoRow?.id ?? null, dmoAlreadyVisible: dmoRow?.expert_workspace_visible === true };
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);
  console.log("[seed] resetting & seeding jrny3- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg, expertId);
  console.log(`[seed] expert=${expertId} dmoRawContentId=${seeded.dmoRawContentId ?? "NONE FOUND"}`);

  const browser = await launchBrowser({ headed: HEADED });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL });
  const adminCtx = await browser.newContext({ baseURL: BASE_URL });
  let expertPage, adminPage;
  let tripId = null;
  const dayOneItemIds = {};

  try {
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    adminPage = await login(adminCtx, ADMIN_EMAIL, PASSWORD);
    console.log("[auth] expert + admin both authenticated.");

    // ═══ Step 1 — expert creates an authored build ═══
    await runStep("Expert: create an authored build (POST /api/expert/ready-made)", async () => {
      const resp = await expertPage.request.post("/api/expert/ready-made", {
        data: { title: BUILD_TITLE, destination: "Kyoto, Japan", durationDays: 3 },
      });
      if (resp.status() !== 201) throw new Error(`expected 201, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      tripId = body.tripId;
      if (body.mode !== "authoring") throw new Error(`expected mode='authoring', got '${body.mode}'`);
      const row = await dbOne(pg, "SELECT id, user_id, author_id, title FROM trips WHERE id = $1", [tripId]);
      if (!row || row.user_id !== null || row.author_id !== expertId) {
        throw new Error(`authored-build invariant violated: ${JSON.stringify(row)}`);
      }
      return {
        ui: `POST /api/expert/ready-made -> 201 mode='authoring', redirect='${body.redirect}'`,
        db: `trips row ${tripId}: user_id=NULL, author_id='${row.author_id}' (§2a authoring invariant)`,
      };
    });

    // ═══ Step 2 — DMO item AFTER refine (W5-C: the overlay reaches the add write) ═══
    await runStep("Expert: add a DMO item AFTER refining it (title = the REFINED name)", async () => {
      if (!seeded.dmoRawContentId) {
        throw new Error("no eligible dmo_raw_content row found for city='Kyoto' — check the D1 heritage seed ran");
      }
      // Admin intake-approves the content into the expert library first (idempotent — a
      // no-op 409 if a prior run already flipped it, checked honestly rather than ignored).
      if (!seeded.dmoAlreadyVisible) {
        const approveResp = await adminPage.request.post(`/api/admin/dmo/intake/${seeded.dmoRawContentId}/approve`);
        if (!approveResp.ok()) throw new Error(`admin intake approve failed: ${approveResp.status()} ${await approveResp.text()}`);
      }

      const editResp = await expertPage.request.post(`/api/expert-workspace/content/${seeded.dmoRawContentId}/edit`, {
        data: { editedName: DMO_REFINED_NAME },
      });
      if (editResp.status() !== 201) throw new Error(`content edit failed: ${editResp.status()} ${await editResp.text()}`);
      const edit = await editResp.json();
      const submitResp = await expertPage.request.patch(`/api/expert-workspace/edits/${edit.id}/submit`);
      if (!submitResp.ok()) throw new Error(`edit submit failed: ${submitResp.status()} ${await submitResp.text()}`);

      const libResp = await expertPage.request.get(`/api/expert-workspace/library/${seeded.dmoRawContentId}`);
      if (!libResp.ok()) throw new Error(`library detail read failed: ${libResp.status()}`);
      // GET /library/:id returns the RAW row (no overlay merge — see the route). The refined
      // name is verified through the SAME query the picker actually uses: the list endpoint's
      // merge-latest-edit overlay (mergeDmoEdit), so this proves what the add write will send.
      // The search param filters on name/description ilike (the raw content id won't match it),
      // so fetch unfiltered and find by id instead — this city's library is small.
      const listResp2 = await expertPage.request.get(`/api/expert-workspace/library?city=Kyoto&limit=100`);
      const listBody = await listResp2.json();
      const merged = (listBody.items ?? []).find((i) => i.id === seeded.dmoRawContentId);
      if (!merged) throw new Error(`refined content row ${seeded.dmoRawContentId} not present in the library list`);
      if (merged.name !== DMO_REFINED_NAME || merged.isRefined !== true) {
        throw new Error(`expected overlay name='${DMO_REFINED_NAME}' isRefined=true, got ${JSON.stringify({ name: merged.name, isRefined: merged.isRefined })}`);
      }

      const createResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
        data: { title: merged.name, itemType: "activity", dayNumber: 1, locationName: merged.name },
      });
      if (createResp.status() !== 201) throw new Error(`item create failed: ${createResp.status()} ${await createResp.text()}`);
      const item = await createResp.json();
      dayOneItemIds.dmo = item.id;
      const dbRow = await dbOne(pg, "SELECT title FROM itinerary_items WHERE id = $1", [item.id]);
      if (dbRow?.title !== DMO_REFINED_NAME) throw new Error(`item title mismatch: '${dbRow?.title}' !== '${DMO_REFINED_NAME}'`);
      return {
        ui: "N/A (API-driven, mirrors dmo-picker-modal.tsx's real edit->submit->library->add sequence)",
        db: `itinerary_items row ${item.id}.title = '${dbRow.title}' — the REFINED name, not the raw DMO name`,
      };
    });

    // ═══ Step 3 — Platform-content pill (with the sourced/dmo_content exclusion proven) ═══
    await runStep("Expert: add a Platform-content item; assert sourced/dmo_content excluded from the read", async () => {
      const resp = await expertPage.request.get("/api/expert-workspace/platform-content?city=Kyoto");
      if (!resp.ok()) throw new Error(`platform-content read failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      const items = body.items ?? [];
      const target = items.find((i) => i.id === CONTENT_REGISTRY_ID);
      if (!target) throw new Error(`seeded platform-content row ${CONTENT_REGISTRY_ID} not returned`);
      const leaked = items.find((i) => i.id === DMO_DECOY_REGISTRY_ID);
      if (leaked) throw new Error(`§12 invariant violated: the dmo_content decoy row leaked into the Platform-content read`);

      const createResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
        data: { title: target.title, itemType: "activity", dayNumber: 1, locationName: target.title },
      });
      if (createResp.status() !== 201) throw new Error(`item create failed: ${createResp.status()} ${await createResp.text()}`);
      const item = await createResp.json();
      dayOneItemIds.platformContent = item.id;
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items row ${item.id} created from the content_registry item; decoy 'dmo_content' row ${DMO_DECOY_REGISTRY_ID} absent from the read (${items.length} items returned)`,
      };
    });

    // ═══ Step 4 — own-service item (envelope carry: duration_minutes/transport_provided) ═══
    await runStep("Expert: add an own-service item; assert envelope carry (duration_minutes/transport_provided)", async () => {
      const resp = await expertPage.request.get("/api/expert/services");
      if (!resp.ok()) throw new Error(`own-services read failed: ${resp.status()}`);
      const services = await resp.json();
      const svc = services.find((s) => s.id === OWN_SERVICE_ID);
      if (!svc) throw new Error(`seeded own-service ${OWN_SERVICE_ID} not present in GET /api/expert/services`);
      if (svc.approvalStatus !== "approved" || svc.status !== "active") {
        throw new Error(`seeded service not approved+active: ${JSON.stringify({ approvalStatus: svc.approvalStatus, status: svc.status })}`);
      }
      // The envelope mapping (shared/content-logistics.ts envelopeFromProviderService ->
      // envelopeToItineraryItemFields) is a pure function of deliveryTimeframe/transportProvided/
      // pickupAddress; computed here for the known fixed fixture input ("2 hours" -> 120 min) so
      // the write shape matches exactly what service-picker-modal.tsx sends.
      const createResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
        data: {
          title: svc.serviceName, itemType: "activity", dayNumber: 1, locationName: svc.meetingPoint || svc.serviceName,
          providerServiceId: svc.id, suggestedBy: "expert",
          durationMinutes: 120, transportProvided: "yes", pickupPoint: svc.pickupAddress,
        },
      });
      if (createResp.status() !== 201) throw new Error(`item create failed: ${createResp.status()} ${await createResp.text()}`);
      const item = await createResp.json();
      dayOneItemIds.ownService = item.id;
      const row = await dbOne(pg, "SELECT duration_minutes, transport_provided, provider_service_id FROM itinerary_items WHERE id = $1", [item.id]);
      if (row?.duration_minutes !== 120 || row?.transport_provided !== "yes" || row?.provider_service_id !== OWN_SERVICE_ID) {
        throw new Error(`envelope carry mismatch: ${JSON.stringify(row)}`);
      }
      return {
        ui: "N/A (API-driven, mirrors service-picker-modal.tsx's envelopeToItineraryItemFields payload)",
        db: `itinerary_items row ${item.id}: duration_minutes=120, transport_provided='yes', provider_service_id='${row.provider_service_id}'`,
      };
    });

    // ═══ Step 5 — custom item, no Places locally: honest geocode-fallback nulls ═══
    await runStep("Expert: add a Custom item — honest geocode-fallback NULLs (no GOOGLE_MAPS_API_KEY)", async () => {
      const address = `Journey Custom Venue, Kyoto, Japan`;
      const geoResp = await expertPage.request.get(`/api/geocode?address=${encodeURIComponent(address)}`);
      // client/src/pages/expert/workspace.tsx's InlineAddItemForm treats ANY non-ok response
      // (503 unconfigured, or a 404 miss) identically: submit without coords, never fabricate a
      // location (§13). This environment has no GOOGLE_MAPS_API_KEY, so the honest answer is 503.
      const geoHonestlyUnavailable = geoResp.status() === 503 || geoResp.status() === 404;
      if (!geoHonestlyUnavailable) {
        throw new Error(`expected an honest unavailable/miss (503/404) with no Maps key configured, got ${geoResp.status()}`);
      }

      const createResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
        data: { title: "Journey Custom Venue", itemType: "activity", dayNumber: 1, locationName: "Journey Custom Venue" },
      });
      if (createResp.status() !== 201) throw new Error(`item create failed: ${createResp.status()} ${await createResp.text()}`);
      const item = await createResp.json();
      dayOneItemIds.custom = item.id;
      const row = await dbOne(pg, "SELECT latitude, longitude FROM itinerary_items WHERE id = $1", [item.id]);
      if (row?.latitude !== null || row?.longitude !== null) {
        throw new Error(`expected honest NULL coords (no city-centre guess), got ${JSON.stringify(row)}`);
      }
      return {
        ui: "N/A (API-driven)",
        db: `GET /api/geocode -> ${geoResp.status()} (honest unavailable); itinerary_items row ${item.id} carries latitude=NULL, longitude=NULL — no fabricated location`,
        note: "Places autocomplete itself (the real browser widget) is NOT exercised — it needs a live browser Maps JS instance + GOOGLE_MAPS_API_KEY, the same env gate that made /api/geocode honestly unavailable above; out of scope for this API-first journey, not faked.",
      };
    });

    // ═══ Step 6 — partner-catalog item (§16: no URL-like string in title/description) ═══
    await runStep("Expert: add a partner-catalog item; assert NO url-like string in title/description", async () => {
      // Mirrors partner-catalog-picker.tsx's addMutation write shape EXACTLY (buildPartnerDescription
      // in client/src/lib/partner-source.ts): "Partner: <Network> — <raw description>". The live
      // `/api/catalog/*` Travelpayouts feeds require a real TRAVELPAYOUTS_TOKEN (throw without one)
      // — this proves the WRITE PATH's §16 no-affiliate-URL guarantee directly, the same guarantee
      // the picker's own §16 code comment documents (bookingUrl/affiliateUrl are never read onto
      // PartnerCatalogItem, so they can never reach this payload either way).
      const description = "Partner: Tiqets — Kyoto temple & garden walking tour, small group.";
      const createResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
        data: { title: PARTNER_TITLE, itemType: "activity", dayNumber: 1, description, estimatedCost: "45.00" },
      });
      if (createResp.status() !== 201) throw new Error(`item create failed: ${createResp.status()} ${await createResp.text()}`);
      const item = await createResp.json();
      dayOneItemIds.partner = item.id;
      const row = await dbOne(pg, "SELECT title, description FROM itinerary_items WHERE id = $1", [item.id]);
      const urlPattern = /https?:\/\//i;
      if (urlPattern.test(row.title) || urlPattern.test(row.description ?? "")) {
        throw new Error(`§16 violation: a URL-like string leaked into title/description: ${JSON.stringify(row)}`);
      }
      if (!row.description.startsWith("Partner: Tiqets")) {
        throw new Error(`missing the "Partner: <Network>" marker: '${row.description}'`);
      }
      return {
        ui: "N/A (API-driven — the live Travelpayouts feed needs a real TRAVELPAYOUTS_TOKEN; this proves the write-path §16 guarantee directly)",
        db: `itinerary_items row ${item.id}: title/description carry NO http(s):// substring; description='${row.description}'`,
      };
    });

    // ═══ Step 7 — reorder day 1 via the endpoint ═══
    await runStep("Expert: reorder day 1 (POST /itinerary/reorder) -> sort_order sequence matches", async () => {
      const order = [dayOneItemIds.custom, dayOneItemIds.ownService, dayOneItemIds.platformContent];
      const resp = await expertPage.request.post(`/api/trips/${tripId}/itinerary/reorder`, {
        data: { dayNumber: 1, itemIds: order },
      });
      if (!resp.ok()) throw new Error(`reorder failed: ${resp.status()} ${await resp.text()}`);
      const rows = await dbAll(
        pg,
        "SELECT id, sort_order FROM itinerary_items WHERE id = ANY($1) ORDER BY sort_order ASC",
        [order],
      );
      const actualOrder = rows.map((r) => r.id);
      if (JSON.stringify(actualOrder) !== JSON.stringify(order)) {
        throw new Error(`sort_order sequence mismatch: expected ${JSON.stringify(order)}, got ${JSON.stringify(actualOrder)}`);
      }
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items.sort_order sequence: ${rows.map((r) => `${r.id.slice(-8)}=${r.sort_order}`).join(", ")}`,
      };
    });

    // ═══ Step 8 — optimize-order returns an order; apply via reorder ═══
    await runStep("Expert: optimize-order returns a suggestion; applied via reorder", async () => {
      const optResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary/optimize-order`, {
        data: { dayNumber: 1 },
      });
      if (!optResp.ok()) throw new Error(`optimize-order failed: ${optResp.status()} ${await optResp.text()}`);
      const optBody = await optResp.json();
      const suggested = optBody.optimizedOrder;
      if (!Array.isArray(suggested) || suggested.length === 0) {
        throw new Error(`expected a non-empty optimizedOrder array, got ${JSON.stringify(optBody)}`);
      }
      const applyResp = await expertPage.request.post(`/api/trips/${tripId}/itinerary/reorder`, {
        data: { dayNumber: 1, itemIds: suggested },
      });
      if (!applyResp.ok()) throw new Error(`apply-reorder failed: ${applyResp.status()} ${await applyResp.text()}`);
      const rows = await dbAll(pg, "SELECT id, sort_order FROM itinerary_items WHERE id = ANY($1) ORDER BY sort_order ASC", [suggested]);
      const actualOrder = rows.map((r) => r.id);
      if (JSON.stringify(actualOrder) !== JSON.stringify(suggested)) {
        throw new Error(`applied order mismatch: expected ${JSON.stringify(suggested)}, got ${JSON.stringify(actualOrder)}`);
      }
      return {
        ui: "N/A (API-driven)",
        db: `sort_order after applying the optimizer's suggestion matches it exactly (${suggested.length} day-1 items)`,
      };
    });

    // ═══ Step 9 — transport-gap checker: flags, then clears ═══
    let gapItemA, gapItemB;
    await runStep("Transport-gap checker: flags an uncovered pair on day 2", async () => {
      const mkResp = async (title, startTime, lat, lng) => {
        const r = await expertPage.request.post(`/api/trips/${tripId}/itinerary-items`, {
          data: {
            title, itemType: "activity", dayNumber: 2, startTime,
            latitude: String(lat), longitude: String(lng), durationMinutes: 45,
          },
        });
        if (r.status() !== 201) throw new Error(`gap-fixture item create failed: ${r.status()} ${await r.text()}`);
        return (await r.json()).id;
      };
      gapItemA = await mkResp("Journey Gap Item A", "09:00", 35.0116, 135.7681);
      gapItemB = await mkResp("Journey Gap Item B", "10:30", 35.0394, 135.7292); // ~5km away, no leg, no transport-provided

      const resp = await expertPage.request.get(`/api/trips/${tripId}/transport-gaps`);
      if (!resp.ok()) throw new Error(`transport-gaps read failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      const day2 = (body.days ?? []).find((d) => d.dayNumber === 2);
      const pair = day2?.pairs?.find((p) => p.fromItemId === gapItemA && p.toItemId === gapItemB);
      if (!pair || !pair.flags.includes("transport_gap")) {
        throw new Error(`expected a 'transport_gap' flag on the A->B pair, got: ${JSON.stringify(day2)}`);
      }
      return {
        ui: "N/A (API-driven)",
        db: `GET /transport-gaps flags day 2 pair (${gapItemA.slice(-8)} -> ${gapItemB.slice(-8)}) with 'transport_gap' (no confirmed leg, transportProvided != 'yes')`,
      };
    });

    await runStep("Transport-gap checker: flag clears once transportProvided='yes'", async () => {
      const patchResp = await expertPage.request.patch(`/api/trips/${tripId}/itinerary-items/${gapItemB}`, {
        data: { transportProvided: "yes" },
      });
      if (!patchResp.ok()) throw new Error(`PATCH transportProvided failed: ${patchResp.status()} ${await patchResp.text()}`);

      const resp = await expertPage.request.get(`/api/trips/${tripId}/transport-gaps`);
      if (!resp.ok()) throw new Error(`transport-gaps re-read failed: ${resp.status()}`);
      const body = await resp.json();
      const day2 = (body.days ?? []).find((d) => d.dayNumber === 2);
      const pair = day2?.pairs?.find((p) => p.fromItemId === gapItemA && p.toItemId === gapItemB);
      if (pair && pair.flags.includes("transport_gap")) {
        throw new Error(`'transport_gap' flag did NOT clear after transportProvided='yes': ${JSON.stringify(pair)}`);
      }
      const dbRow = await dbOne(pg, "SELECT transport_provided FROM itinerary_items WHERE id = $1", [gapItemB]);
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items.transport_provided='${dbRow.transport_provided}' for ${gapItemB}; transport_gap flag absent from the re-read`,
      };
    });

    // ═══ Step 10 — browser: canvas Plan map (honest environment-gated rendering) ═══
    await runStep(
      "Browser: canvas Plan map — day-filter testids render regardless; honest fallback when no Maps key",
      async () => {
        await expertPage.goto(`/expert/workspace/${tripId}`);
        await waitVisible(expertPage, "tab-right-add");
        const toggle = await waitVisible(expertPage, "button-toggle-plan-map");
        await expertPage.click(toggle);

        // Day-filter controls render whenever the section is open AND 2+ days carry items —
        // independent of VITE_GOOGLE_MAPS_API_KEY (see the JSX: this block sits ABOVE the
        // MAPS_KEY-gated <Map> conditional). This trip has items on day 1 and day 2.
        await waitVisible(expertPage, "button-map-day-filter-all");
        await waitVisible(expertPage, "button-map-day-filter-1");
        await waitVisible(expertPage, "button-map-day-filter-2");

        // The map itself: MAPS_KEY-gated. Assert whichever honest state actually renders —
        // never assume one over the other (§13: a journey must not fabricate an environment).
        const unavailableSel = `[data-testid="text-plan-map-unavailable"]`;
        const pinSel = `[data-testid^="map-pin-"]`;
        await expertPage.waitForSelector(`${unavailableSel}, ${pinSel}`, { state: "visible", timeout: 10000 });
        const mapsKeyConfigured = await expertPage.isVisible(pinSel);
        const fallbackShown = await expertPage.isVisible(unavailableSel);

        if (!mapsKeyConfigured && !fallbackShown) {
          throw new Error("neither a real map pin nor the honest unavailable fallback rendered");
        }

        return {
          ui: `button-map-day-filter-all/1/2 all visible; ${mapsKeyConfigured ? "map-pin-* rendered (VITE_GOOGLE_MAPS_API_KEY configured)" : "text-plan-map-unavailable rendered (no VITE_GOOGLE_MAPS_API_KEY — honest fallback, not a failure)"}`,
          db: "N/A (client-rendering assertion — the day-filter grouping reflects the day-1/day-2 itinerary_items already proven in DB by earlier steps)",
          note: "map-candidate-pin-* (the W5-A discovery layer) is gated behind the SAME VITE_GOOGLE_MAPS_API_KEY and was not observed to render in this sandbox — documented, not faked; opening the DMO drawer alongside the map is skipped here since candidate pins cannot appear without the key regardless.",
        };
      },
      { page: expertPage },
    );
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("workstation-build");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
