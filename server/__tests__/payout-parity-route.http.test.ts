/**
 * PAYOUT PARITY — HTTP ROUTE LEG. Closes the negative space documented in
 * .github/workflows/payout-parity-gate.yml: payout-parity.db.test.ts stamps bookings via the
 * same resolver/insurance helpers the checkout route imports, but it does NOT drive the HTTP
 * route — so a route change that stamps a different figure (reordering the insurance deduction,
 * bypassing safeParseRate, recomputing the split) stayed invisible to the gate.
 *
 * This suite drives the REAL `POST /api/checkout` (cart populated via the real `POST /api/cart`,
 * session minted via the real `POST /api/auth/register`) and asserts the provider_earnings the
 * route stamps onto service_bookings equals the SHARED RECIPE expectation, derived in-process
 * through the SAME resolveCommissionRates + calcInsuranceFee the db suite uses — no fee
 * literals (§8), the expectation is resolved from live fee_bands config at stamp time.
 *
 *   R1 — default-band expert service: route-stamped provider_earnings === recipe
 *        (price × expertShareRate − insuranceFee), platform_fee/insurance_fee stamped
 *        consistently (total take = price − earnings).
 *   R2 — per-service revenueShareRate OVERRIDE: the route must honour safeParseRate's
 *        override path; the fixture rate is chosen so the override figure and the
 *        default-band figure are DISTINGUISHABLE (belt-and-braces discriminator).
 *   R3 — booking_concierge item: the facilitation fee (fee_bands.expert_concierge_booking)
 *        must land in platform_fee ONLY — provider_earnings stays the plain recipe figure.
 *   R4 — missing/inactive concierge band: requireConciergeBookingRate must 500 honestly
 *        (actionable message, no booking row stamped) instead of charging a silent $0 fee.
 *   R5 — provider-owned service (users.role = 'service_provider'): the route must take the
 *        isProviderRole → resolveCommissionRates({source:'provider', providerId}) branch;
 *        the stamp must equal the provider-source recipe, not the expert default band
 *        (the historical role-string misrouting bug).
 *   R6 — fee-preview for a booking_concierge item: GET /api/cart/fee-preview must return
 *        a total that equals subtotal + platformFeeTotal + conciergeFeeTotal, matching what
 *        POST /api/checkout would charge, so travelers are never surprised at payment.
 *
 * STRIPE CONTRACT (both legs accepted; the stamp happens BEFORE Stripe either way):
 *   • 503 payment_unavailable (CI stub key, ruling 38's declared-unavailable negative
 *     contract): the claim rows stay provisional (payment_pending) with the stamp intact.
 *   • 201 (a real test-mode key): the same rows, promoted; the stamp is identical.
 * Any OTHER status is a hard failure — a 400/500 means the route never stamped anything and
 * the parity claim would be vacuously green.
 *
 * Transport: real HTTP against the already-running server on :5000 (dev: 'Start application';
 * CI: the server booted by payout-parity-gate.yml). Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/payout-parity-route.http.test.ts
 *
 * DISPOSABLE DB ONLY — same guard posture as payout-parity.db.test.ts. Every row this file
 * writes (directly or via the routes) is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveCommissionRates, calcInsuranceFee } from "../services/commission";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `ppr-${RUN}-expert`,
  provider: `ppr-${RUN}-provider`,
  travelerEmail: `ppr-${RUN}-trav@t.test`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
let travelerId: string | null = null;
let travelerCookie = "";

// ── Disposable-DB guard (mirrors payout-parity.db.test.ts; never defaults open) ──────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[payout-parity-route] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, method: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(travelerCookie ? { cookie: travelerCookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Fixture service; no category ⇒ the route's "default" fee-category fallback. Owner defaults to the expert. */
async function makeService(
  price: string,
  revenueShareRate?: string,
  expertOfferingTypeId?: string,
  ownerId: string = ids.expert,
): Promise<string> {
  const id = `ppr-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, revenue_share_rate, expert_offering_type_id)
    VALUES (${id}, ${ownerId}, ${`Payout parity route service ${RUN}`}, 'fixture', ${price}, 'active', 'approved', ${revenueShareRate ?? null}, ${expertOfferingTypeId ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

/** Live expert_offering_types row for key booking_concierge (seeded by migrations; must exist). */
async function bookingConciergeOfferingTypeId(): Promise<string> {
  const r = await db.execute(sql`
    SELECT id FROM expert_offering_types WHERE offering_type_key = 'booking_concierge' LIMIT 1
  `);
  const id = (r.rows[0] as any)?.id as string | undefined;
  assert.ok(id, "expert_offering_types must contain the seeded booking_concierge row");
  return id!;
}

/** safeParseRate — verbatim behaviour of the checkout route's local helper (and the db suite's). */
function safeParseRate(value: any, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/**
 * THE SHARED RECIPE — identical derivation to payout-parity.db.test.ts bookLikeCheckout():
 * default fee category, expert-band resolution, per-service override via safeParseRate,
 * insurance deducted from the expert's gross share. No fee literals.
 */
async function recipeExpectation(
  price: number,
  revenueShareRate?: string,
  owner:
    | { source: "expert"; expertId?: string }
    | { source: "provider"; providerId: string } = { source: "expert" },
) {
  const feeCategory = "default";
  const rates =
    owner.source === "provider"
      ? await resolveCommissionRates({ source: "provider", providerId: owner.providerId })
      : await resolveCommissionRates({ category: feeCategory, expertId: owner.expertId ?? ids.expert });
  const expertShareRate = safeParseRate(revenueShareRate, rates.expertShareRate);
  const insuranceFeeAmt = calcInsuranceFee(price, rates, feeCategory);
  const netExpertEarningsAmt = price * expertShareRate - insuranceFeeAmt;
  return {
    defaultBandShare: rates.expertShareRate,
    stamped: netExpertEarningsAmt.toFixed(2),
    insurance: insuranceFeeAmt.toFixed(2),
    platformFee: (price - price * expertShareRate + insuranceFeeAmt).toFixed(2),
  };
}

/**
 * Drive the REAL route: cart the service, POST /api/checkout, accept the declared Stripe
 * contract (503 payment_unavailable with a stub key, 201 with a real one — anything else
 * fails loudly), then read back the row the route stamped.
 */
async function checkoutThroughRoute(serviceId: string): Promise<{
  status: number;
  row: { provider_earnings: string; platform_fee: string; insurance_fee: string; total_amount: string; status: string };
}> {
  // Start from an EMPTY cart. On the 503 payment_unavailable leg the route deliberately leaves
  // the cart intact ("Your cart is exactly as you left it"), so without this reset a prior
  // test's item would ride along and the bare idempotency key would land on the WRONG service.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);

  const addRes = await api("/api/cart", "POST", { serviceId });
  assert.equal(addRes.status, 201, `POST /api/cart must accept the fixture service: ${await addRes.clone().text()}`);

  const checkoutKey = `ppr-${RUN}-${crypto.randomUUID()}`;
  const res = await api("/api/checkout", "POST", { idempotencyKey: checkoutKey });
  const bodyText = await res.text();
  if (res.status === 503) {
    // Ruling 38 negative contract: payment provider unreachable ⇒ machine-readable code,
    // provisional rows intact. This is the CI-stub-key leg.
    const body = JSON.parse(bodyText);
    assert.equal(body.error, "payment_unavailable", `503 must be the declared contract, got: ${bodyText}`);
  } else {
    assert.equal(res.status, 201, `POST /api/checkout must be 201 or the declared 503, got ${res.status}: ${bodyText}`);
  }

  // LIKE prefix (bare key + any `#<n>` suffixed rows): a single-item cart must stamp exactly
  // ONE row — more than one means the cart was not isolated and the parity read is meaningless.
  const r = await db.execute(sql`
    SELECT id, service_id, provider_earnings, platform_fee, insurance_fee, total_amount, status
    FROM service_bookings WHERE idempotency_key LIKE ${checkoutKey + "%"}
  `);
  assert.equal(r.rows.length, 1, "checkout must have stamped exactly one booking row for this key");
  const row = r.rows[0] as any;
  createdBookingIds.push(row.id);
  assert.equal(row.service_id, serviceId, "the stamped row must be for the service under test");
  if (res.status === 503) {
    assert.equal(row.status, "payment_pending", "on payment_unavailable the claim row must stay provisional");
  }
  return { status: res.status, row };
}

before(async () => {
  await assertDisposableDb();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL} ('npm run dev' / CI boot step)`);

  // Traveler through the real registration route (email-auth session, user.claims.sub shape).
  const reg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ids.travelerEmail, password: PASSWORD, firstName: "PPR", lastName: "Traveler" }),
  });
  assert.equal(reg.status, 201, `register failed (${reg.status}): ${await reg.clone().text()}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  travelerCookie = setCookie!.split(";")[0];
  travelerId = ((await reg.json()) as any).user.id;

  // Service owners — direct fixture inserts, same posture as the db suite. The provider row
  // carries the canonical stored role string 'service_provider' (shared/roles.ts) so the route's
  // isProviderRole branch fires for R5, PLUS a per-expert EXP-OVR override: the correct
  // provider-source resolution ({source:'provider', providerId}) never passes expertId so the
  // override is IGNORED, while the historical misroute ({category, expertId}) would apply it —
  // that asymmetry is R5's discriminator (live bands are otherwise all 0.25, indistinguishable).
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, commission_override_expert_share_percent)
    VALUES (${ids.expert}, ${`ppr-${RUN}-expert@t.test`}, 'PPR', 'Expert', 'expert', NULL),
           (${ids.provider}, ${`ppr-${RUN}-provider@t.test`}, 'PPR', 'Provider', 'service_provider', 90)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM payment_intents WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  if (travelerId) {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`).catch(() => {});
    await db.execute(sql`DELETE FROM contracts WHERE traveler_id = ${travelerId}`).catch(() => {});
  }
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.expert}, ${ids.provider})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email = ${ids.travelerEmail}`).catch(() => {});
});

test("R1: route-stamped provider_earnings equals the shared recipe (default band)", async () => {
  const price = 180;
  const serviceId = await makeService(price.toFixed(2));
  const expected = await recipeExpectation(price);
  assert.ok(Number(expected.stamped) > 0, "recipe expectation must be a positive payout");

  const { row } = await checkoutThroughRoute(serviceId);
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "the route's stamped 'You earn $X' figure has DRIFTED from the shared resolver/insurance recipe",
  );
  assert.equal(Number(row.insurance_fee).toFixed(2), expected.insurance, "insurance_fee stamp must match the recipe");
  assert.equal(Number(row.platform_fee).toFixed(2), expected.platformFee, "platform_fee stamp must match the recipe");
  // Conservation: what the expert is promised plus the platform take is exactly the price.
  assert.equal(
    (Number(row.provider_earnings) + Number(row.platform_fee)).toFixed(2),
    Number(row.total_amount).toFixed(2),
    "earnings + platform take must reconstruct the charged amount",
  );
});

test("R2: per-service revenueShareRate override flows through the route's safeParseRate path", async () => {
  const price = 200;
  const overrideRate = "0.55"; // valid [0,1] override; discriminator asserted below, no fee literal in the EXPECTATION
  const serviceId = await makeService(price.toFixed(2), overrideRate);
  const expected = await recipeExpectation(price, overrideRate);
  const defaultBand = await recipeExpectation(price);
  // Belt-and-braces: the override figure must DIFFER from the default-band figure, otherwise
  // this test could not distinguish "route honoured the override" from "route ignored it".
  assert.notEqual(expected.stamped, defaultBand.stamped, "fixture override must be distinguishable from the default band");
  assert.notEqual(parseFloat(overrideRate), expected.defaultBandShare, "override rate must differ from the live band rate");

  const { row } = await checkoutThroughRoute(serviceId);
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "the route must stamp the per-service override figure (safeParseRate path), not the band figure",
  );
});

test("R3: booking_concierge facilitation fee lands in platform_fee, NEVER in provider_earnings", async () => {
  const price = 160;
  const offeringTypeId = await bookingConciergeOfferingTypeId();
  const serviceId = await makeService(price.toFixed(2), undefined, offeringTypeId);

  // The recipe expectation is IDENTICAL to a plain default-band item: the concierge fee is
  // charged ON TOP (rider on the platform take), so the expert's promised figure must not move.
  const expected = await recipeExpectation(price);

  // Live concierge rate from fee_bands (no fee literal); must be positive on a configured DB,
  // otherwise this test could not distinguish "fee excluded from earnings" from "fee was $0".
  const bandRow = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands
    WHERE band_key = 'expert_concierge_booking' AND rate_type = 'percent' AND is_active = true
    LIMIT 1
  `);
  const conciergeRate = Number((bandRow.rows[0] as any)?.rate ?? 0);
  assert.ok(conciergeRate > 0, "expert_concierge_booking band must be active with a positive rate (migrations 064–066)");
  const conciergeFeeAmt = price * conciergeRate;

  const { row } = await checkoutThroughRoute(serviceId);

  // THE CLAIM: provider_earnings EXCLUDES the concierge fee — same figure as a non-concierge item.
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "provider_earnings must equal the plain recipe figure — the concierge facilitation fee LEAKED into the expert's promised earnings",
  );
  // platform_fee INCLUDES it: base platform take + insurance + concierge fee.
  assert.equal(
    Number(row.platform_fee).toFixed(2),
    (Number(expected.platformFee) + conciergeFeeAmt).toFixed(2),
    "platform_fee must include the concierge facilitation fee on top of the base take",
  );
  assert.equal(Number(row.insurance_fee).toFixed(2), expected.insurance, "insurance_fee stamp must match the recipe");
  // Conservation with the rider: earnings + platform take = price + concierge fee (fee is ON TOP
  // of the list price, not carved out of it) — and total_amount stays the bare price.
  assert.equal(Number(row.total_amount).toFixed(2), price.toFixed(2), "total_amount must remain the bare item price");
  assert.equal(
    (Number(row.provider_earnings) + Number(row.platform_fee)).toFixed(2),
    (price + conciergeFeeAmt).toFixed(2),
    "earnings + platform take must equal price + concierge fee (fee charged on top)",
  );
});

test("R4: missing concierge band ⇒ requireConciergeBookingRate 500s honestly, no row stamped", async () => {
  const price = 90;
  const offeringTypeId = await bookingConciergeOfferingTypeId();
  const serviceId = await makeService(price.toFixed(2), undefined, offeringTypeId);

  // Simulate the misconfigured-DB posture the strict loader guards against by deactivating the
  // band for the duration of this single checkout. Restored in finally — verify below.
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = 'expert_concierge_booking'`);
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
    const addRes = await api("/api/cart", "POST", { serviceId });
    assert.equal(addRes.status, 201, `POST /api/cart must accept the fixture service: ${await addRes.clone().text()}`);

    const checkoutKey = `ppr-${RUN}-${crypto.randomUUID()}`;
    const res = await api("/api/checkout", "POST", { idempotencyKey: checkoutKey });
    const bodyText = await res.text();
    assert.equal(res.status, 500, `checkout with a concierge item and a missing band must 500 honestly, got ${res.status}: ${bodyText}`);
    const body = JSON.parse(bodyText);
    assert.match(
      String(body.message ?? ""),
      /Booking Concierge fee band not configured/,
      "the 500 must surface the strict loader's actionable message, not the generic 'Checkout failed'",
    );

    // The strict gate fires BEFORE any booking insert — no row may exist for this key.
    const r = await db.execute(sql`
      SELECT id FROM service_bookings WHERE idempotency_key LIKE ${checkoutKey + "%"}
    `);
    assert.equal(r.rows.length, 0, "a failed concierge-band gate must not stamp any booking row");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = 'expert_concierge_booking'`);
  }
  const restored = await db.execute(sql`
    SELECT is_active FROM fee_bands WHERE band_key = 'expert_concierge_booking'
  `);
  assert.equal((restored.rows[0] as any)?.is_active, true, "band must be reactivated after the gate test");
});

test("R5: provider-owned service routes through the provider-source branch (isProviderRole)", async () => {
  const price = 240;
  const serviceId = await makeService(price.toFixed(2), undefined, undefined, ids.provider);
  const expected = await recipeExpectation(price, undefined, { source: "provider", providerId: ids.provider });
  assert.ok(Number(expected.stamped) > 0, "provider-source recipe expectation must be a positive payout");

  // Belt-and-braces discriminator: the provider user carries a per-expert EXP-OVR override
  // (90%). The correct provider-source branch omits expertId so the override is IGNORED; the
  // historical misroute ({category, expertId: ownerId}) would APPLY it. If the two figures were
  // equal, this test could not distinguish the branches and the parity claim would be vacuous.
  const misrouted = await recipeExpectation(price, undefined, { source: "expert", expertId: ids.provider });
  assert.notEqual(
    expected.stamped,
    misrouted.stamped,
    "discriminator collapsed: provider-source figure equals the misrouted expert-branch figure — fix the fixture override",
  );

  const { row } = await checkoutThroughRoute(serviceId);
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "the route's stamped figure for a service_provider-owned item has DRIFTED from the provider-source recipe (isProviderRole branch misrouting?)",
  );
  assert.equal(Number(row.insurance_fee).toFixed(2), expected.insurance, "insurance_fee stamp must match the provider-source recipe");
  assert.equal(Number(row.platform_fee).toFixed(2), expected.platformFee, "platform_fee stamp must match the provider-source recipe");
  assert.equal(
    (Number(row.provider_earnings) + Number(row.platform_fee)).toFixed(2),
    Number(row.total_amount).toFixed(2),
    "earnings + platform take must reconstruct the charged amount",
  );
});

test("R6: fee-preview total equals subtotal + platform fee + concierge fee for a booking_concierge item", async () => {
  const price = 140;
  const offeringTypeId = await bookingConciergeOfferingTypeId();
  // Service owned by the expert (no concierge offering type on provider path — tests the expert
  // booking_concierge path, which is the route's primary concierge scenario).
  const serviceId = await makeService(price.toFixed(2), undefined, offeringTypeId);

  // Live concierge rate from fee_bands (no fee literal); must be positive so the preview figure
  // is distinguishable from a $0 concierge fee (misconfigured-band silent failure).
  const bandRow = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands
    WHERE band_key = 'expert_concierge_booking' AND rate_type = 'percent' AND is_active = true
    LIMIT 1
  `);
  const conciergeRate = Number((bandRow.rows[0] as any)?.rate ?? 0);
  assert.ok(conciergeRate > 0, "expert_concierge_booking band must be active with a positive rate so the preview fee is discriminable");
  const expectedConciergeFee = price * conciergeRate;

  // The shared recipe gives the base platform-fee component (excludes concierge, same as R3).
  const expected = await recipeExpectation(price);
  const expectedTotal = price + Number(expected.platformFee) + expectedConciergeFee;

  // Cart the service, then call the preview endpoint.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
  const addRes = await api("/api/cart", "POST", { serviceId });
  assert.equal(addRes.status, 201, `POST /api/cart must accept the fixture service: ${await addRes.clone().text()}`);

  const previewRes = await api("/api/cart/fee-preview", "GET");
  assert.equal(previewRes.status, 200, `GET /api/cart/fee-preview must return 200, got ${previewRes.status}: ${await previewRes.clone().text()}`);
  const preview = await previewRes.json() as {
    subtotal: number;
    platformFeeTotal: number;
    conciergeFeeTotal: number;
    total: number;
    itemCount: number;
  };

  assert.equal(preview.subtotal.toFixed(2), price.toFixed(2), "fee-preview subtotal must equal the item price");
  assert.equal(
    preview.platformFeeTotal.toFixed(2),
    Number(expected.platformFee).toFixed(2),
    "fee-preview platformFeeTotal must match the shared recipe (base platform take + insurance, concierge excluded)",
  );
  assert.equal(
    preview.conciergeFeeTotal.toFixed(2),
    expectedConciergeFee.toFixed(2),
    "fee-preview must expose the concierge facilitation fee separately so travelers are never surprised",
  );
  assert.equal(
    preview.total.toFixed(2),
    expectedTotal.toFixed(2),
    "fee-preview total must equal subtotal + platformFeeTotal + conciergeFeeTotal — matching what checkout would charge",
  );

  // Clean up the cart so subsequent tests start clean.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
});

test("R8: mixed cart (expert item + provider item) stamps each row with its OWN owner's payout", async () => {
  // Two items in the SAME checkout — different price so earnings amounts are distinguishable even
  // if both bands happen to resolve the same rate.
  const expertPrice = 150;
  const providerPrice = 200;

  const expertServiceId = await makeService(expertPrice.toFixed(2), undefined, undefined, ids.expert);
  const providerServiceId = await makeService(providerPrice.toFixed(2), undefined, undefined, ids.provider);

  // Compute what EACH row should look like from the shared recipe.
  const expertExpected = await recipeExpectation(expertPrice, undefined, {
    source: "expert",
    expertId: ids.expert,
  });
  const providerExpected = await recipeExpectation(providerPrice, undefined, {
    source: "provider",
    providerId: ids.provider,
  });
  // The misrouted figure for the provider item (applying the 90 % EXP-OVR override as if
  // it were an expert-owned item). Must DIFFER from the correct provider figure — this is
  // R5's discriminator re-used here so a cross-item rate bleed is detectable.
  const providerMisrouted = await recipeExpectation(providerPrice, undefined, {
    source: "expert",
    expertId: ids.provider,
  });
  assert.notEqual(
    providerExpected.stamped,
    providerMisrouted.stamped,
    "discriminator collapsed: provider-source figure equals the misrouted expert-branch figure — fix the fixture override",
  );

  // Start from an empty cart, add BOTH items, then checkout in a single POST.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);

  const addExpert = await api("/api/cart", "POST", { serviceId: expertServiceId });
  assert.equal(addExpert.status, 201, `POST /api/cart (expert item) failed: ${await addExpert.clone().text()}`);

  const addProvider = await api("/api/cart", "POST", { serviceId: providerServiceId });
  assert.equal(addProvider.status, 201, `POST /api/cart (provider item) failed: ${await addProvider.clone().text()}`);

  const checkoutKey = `ppr-${RUN}-${crypto.randomUUID()}`;
  const res = await api("/api/checkout", "POST", { idempotencyKey: checkoutKey });
  const bodyText = await res.text();
  if (res.status === 503) {
    const body = JSON.parse(bodyText);
    assert.equal(body.error, "payment_unavailable", `503 must be the declared contract, got: ${bodyText}`);
  } else {
    assert.equal(res.status, 201, `POST /api/checkout must be 201 or the declared 503, got ${res.status}: ${bodyText}`);
  }

  // Fetch BOTH stamped rows (bare key + suffixed key) and sort by service_id.
  const r = await db.execute(sql`
    SELECT id, service_id, provider_earnings, platform_fee, insurance_fee, total_amount, status
    FROM service_bookings WHERE idempotency_key LIKE ${checkoutKey + "%"}
    ORDER BY idempotency_key
  `);
  assert.equal(r.rows.length, 2, "mixed checkout must stamp exactly two booking rows (one per cart item)");

  // Track for cleanup.
  for (const row of r.rows as any[]) {
    createdBookingIds.push(row.id);
  }

  // Match each stamped row to its service — the order is deterministic (cart insertion order =
  // idempotency key order: bare key → #1), but we identify by service_id for robustness.
  const rowByServiceId = new Map<string, any>();
  for (const row of r.rows as any[]) {
    rowByServiceId.set(row.service_id, row);
  }

  const expertRow = rowByServiceId.get(expertServiceId);
  const providerRow = rowByServiceId.get(providerServiceId);

  assert.ok(expertRow, "a stamped row must exist for the expert-owned service");
  assert.ok(providerRow, "a stamped row must exist for the provider-owned service");

  // ── Expert row must match the expert-source recipe ──────────────────────────
  assert.equal(
    Number(expertRow.provider_earnings).toFixed(2),
    expertExpected.stamped,
    "expert-owned item: route-stamped provider_earnings has DRIFTED from the expert-source recipe",
  );
  assert.equal(
    Number(expertRow.insurance_fee).toFixed(2),
    expertExpected.insurance,
    "expert-owned item: insurance_fee stamp must match the expert-source recipe",
  );
  assert.equal(
    Number(expertRow.platform_fee).toFixed(2),
    expertExpected.platformFee,
    "expert-owned item: platform_fee stamp must match the expert-source recipe",
  );
  assert.equal(
    (Number(expertRow.provider_earnings) + Number(expertRow.platform_fee)).toFixed(2),
    Number(expertRow.total_amount).toFixed(2),
    "expert-owned item: earnings + platform take must reconstruct the charged amount",
  );

  // ── Provider row must match the provider-source recipe (NOT the misrouted expert figure) ──
  assert.equal(
    Number(providerRow.provider_earnings).toFixed(2),
    providerExpected.stamped,
    "provider-owned item: route-stamped provider_earnings has DRIFTED from the provider-source recipe (cross-item rate bleed or isProviderRole misrouting?)",
  );
  assert.notEqual(
    Number(providerRow.provider_earnings).toFixed(2),
    providerMisrouted.stamped,
    "provider-owned item: stamped figure must NOT equal the misrouted expert-branch figure — the route is taking the wrong branch for the provider item",
  );
  assert.equal(
    Number(providerRow.insurance_fee).toFixed(2),
    providerExpected.insurance,
    "provider-owned item: insurance_fee stamp must match the provider-source recipe",
  );
  assert.equal(
    Number(providerRow.platform_fee).toFixed(2),
    providerExpected.platformFee,
    "provider-owned item: platform_fee stamp must match the provider-source recipe",
  );
  assert.equal(
    (Number(providerRow.provider_earnings) + Number(providerRow.platform_fee)).toFixed(2),
    Number(providerRow.total_amount).toFixed(2),
    "provider-owned item: earnings + platform take must reconstruct the charged amount",
  );
});

test("R7: fee-preview with a concierge item and a missing band ⇒ machine-readable 503, never a $0 fee", async () => {
  const price = 110;
  const offeringTypeId = await bookingConciergeOfferingTypeId();
  const serviceId = await makeService(price.toFixed(2), undefined, offeringTypeId);

  // Same misconfigured-DB posture as R4, but on the PREVIEW surface: the broken config must
  // surface BEFORE the traveler hits "Pay", not as a silent $0 concierge fee.
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = 'expert_concierge_booking'`);
  try {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
    const addRes = await api("/api/cart", "POST", { serviceId });
    assert.equal(addRes.status, 201, `POST /api/cart must accept the fixture service: ${await addRes.clone().text()}`);

    const previewRes = await api("/api/cart/fee-preview", "GET");
    const bodyText = await previewRes.text();
    assert.equal(
      previewRes.status,
      503,
      `fee-preview with a concierge item and a missing band must 503 (parallel to R4's checkout posture), got ${previewRes.status}: ${bodyText}`,
    );
    const body = JSON.parse(bodyText);
    assert.equal(
      body.error,
      "concierge_fee_unconfigured",
      "the 503 must carry the machine-readable code the cart UI keys off",
    );
    assert.ok(String(body.message ?? "").length > 0, "the 503 must carry an actionable human-readable message");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = 'expert_concierge_booking'`);
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`).catch(() => {});
  }

  // Sanity: with the band restored, the SAME cart previews cleanly with a positive concierge fee
  // — proving the 503 above was the band posture, not some unrelated breakage.
  const addRes2 = await api("/api/cart", "POST", { serviceId });
  assert.equal(addRes2.status, 201, `POST /api/cart must accept the fixture service after restore: ${await addRes2.clone().text()}`);
  const okRes = await api("/api/cart/fee-preview", "GET");
  assert.equal(okRes.status, 200, `fee-preview must recover once the band is restored, got ${okRes.status}: ${await okRes.clone().text()}`);
  const ok = await okRes.json() as { conciergeFeeTotal: number };
  assert.ok(ok.conciergeFeeTotal > 0, "restored band must yield a positive concierge fee in the preview");
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
});


test("R9: GET /api/cart, GET /api/cart/fee-preview, and POST /api/checkout all agree on the fee breakdown for a mixed cart", async () => {
  // Seed a cart with TWO items: one plain service + one booking_concierge service.
  // This is the primary regression surface: three independent loops all call the same
  // shared helpers (resolveItemBaseAmount, resolveCommissionRates, getConciergeBookingRate)
  // but any per-loop edit could silently diverge.  The test drives all three surfaces and
  // asserts every fee component is byte-identical across them.

  const priceNormal = 120;
  const priceConcierge = 80;
  const offeringTypeId = await bookingConciergeOfferingTypeId();

  const normalServiceId = await makeService(priceNormal.toFixed(2));
  const conciergeServiceId = await makeService(priceConcierge.toFixed(2), undefined, offeringTypeId);

  // Concierge band must be positive (otherwise the conciergeFee components are all zero and
  // the cross-surface comparison is vacuous — a $0 discrepancy is invisible at $0).
  const bandRow = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands
    WHERE band_key = 'expert_concierge_booking' AND rate_type = 'percent' AND is_active = true
    LIMIT 1
  `);
  const conciergeRate = Number((bandRow.rows[0] as any)?.rate ?? 0);
  assert.ok(conciergeRate > 0, "expert_concierge_booking band must be active with a positive rate for R9 to be discriminable");

  // ── Build the mixed cart ───────────────────────────────────────────────────────────────────
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
  for (const id of [normalServiceId, conciergeServiceId]) {
    const r = await api("/api/cart", "POST", { serviceId: id });
    assert.equal(r.status, 201, `POST /api/cart for ${id} must be 201: ${await r.clone().text()}`);
  }

  // ── Surface 1: GET /api/cart ───────────────────────────────────────────────────────────────
  const cartRes = await api("/api/cart", "GET");
  assert.equal(cartRes.status, 200, `GET /api/cart must return 200: ${await cartRes.clone().text()}`);
  const cart = await cartRes.json() as {
    subtotal: string;
    platformFee: string;
    conciergeFee: string;
    total: string;
    itemCount: number;
  };
  assert.equal(cart.itemCount, 2, "cart must contain exactly the two seeded items");
  assert.ok(Number(cart.conciergeFee) > 0, "GET /api/cart must report a positive conciergeFee for the booking_concierge item");

  // ── Surface 2: GET /api/cart/fee-preview ──────────────────────────────────────────────────
  const previewRes = await api("/api/cart/fee-preview", "GET");
  assert.equal(previewRes.status, 200, `GET /api/cart/fee-preview must return 200: ${await previewRes.clone().text()}`);
  const preview = await previewRes.json() as {
    subtotal: number;
    platformFeeTotal: number;
    conciergeFeeTotal: number;
    total: number;
    itemCount: number;
  };
  assert.ok(preview.conciergeFeeTotal > 0, "GET /api/cart/fee-preview must report a positive conciergeFeeTotal for the booking_concierge item");

  // CLAIM A — the two preview surfaces must agree field-for-field.
  // Field names differ (platformFee vs platformFeeTotal) but semantics are identical.
  assert.equal(
    Number(cart.subtotal).toFixed(2),
    preview.subtotal.toFixed(2),
    "subtotal diverged between GET /api/cart and GET /api/cart/fee-preview",
  );
  assert.equal(
    Number(cart.platformFee).toFixed(2),
    preview.platformFeeTotal.toFixed(2),
    "platform fee diverged between GET /api/cart (platformFee) and GET /api/cart/fee-preview (platformFeeTotal)",
  );
  assert.equal(
    Number(cart.conciergeFee).toFixed(2),
    preview.conciergeFeeTotal.toFixed(2),
    "concierge fee diverged between GET /api/cart (conciergeFee) and GET /api/cart/fee-preview (conciergeFeeTotal)",
  );
  assert.equal(
    Number(cart.total).toFixed(2),
    preview.total.toFixed(2),
    "total diverged between GET /api/cart and GET /api/cart/fee-preview",
  );

  // ── Surface 3: POST /api/checkout ─────────────────────────────────────────────────────────
  // Two accepted contracts (Stripe ruling 38):
  //   201 — real test-mode key: the response body carries subtotal/platformFee/conciergeFee/total
  //          as server-derived strings.  Compare directly against GET /api/cart (same field names)
  //          and GET /api/cart/fee-preview (different names, same semantics).
  //   503 payment_unavailable — CI stub key: no fee fields in the body.  Use the DB rows:
  //          The route's own invariant (lineFullCharge = price + surcharge + totalPlatformFee,
  //          total_amount = price + surcharge, platform_fee = totalPlatformFee) means
  //          sum(total_amount + platform_fee) === cart total.  Additionally, the DB merges base
  //          platform and concierge into a single platform_fee column, so
  //          sum(platform_fee) === cart platformFee + cart conciergeFee (the two separately-
  //          reported components the traveler sees).
  const checkoutKey = `ppr-${RUN}-r9-${crypto.randomUUID()}`;
  const checkoutRes = await api("/api/checkout", "POST", { idempotencyKey: checkoutKey });
  const checkoutBodyText = await checkoutRes.text();
  const checkoutBody = JSON.parse(checkoutBodyText);

  if (checkoutRes.status === 503) {
    assert.equal(
      checkoutBody.error,
      "payment_unavailable",
      `503 must be the declared Stripe-stub contract, got: ${checkoutBodyText}`,
    );
  } else {
    assert.equal(
      checkoutRes.status,
      201,
      `POST /api/checkout must be 201 or the declared 503, got ${checkoutRes.status}: ${checkoutBodyText}`,
    );
  }

  // Read stamped rows regardless of Stripe leg (the stamp happens BEFORE Stripe either way).
  const rows = await db.execute(sql`
    SELECT id, service_id, total_amount, platform_fee, status
    FROM service_bookings
    WHERE idempotency_key LIKE ${checkoutKey + "%"}
    ORDER BY created_at
  `);
  assert.equal(rows.rows.length, 2, "checkout must have stamped exactly two booking rows for the two-item cart");
  for (const row of rows.rows as any[]) {
    createdBookingIds.push((row as any).id);
  }

  if (checkoutRes.status === 201) {
    // CLAIM B (201 leg) — compare the checkout response body fee fields field-for-field
    // against both GET surfaces.  The checkout body uses the SAME field names as GET /api/cart
    // (subtotal, platformFee, conciergeFee, total), so a loop divergence that touches any
    // individual component (not just the combined total) will fail here.
    assert.equal(
      String(checkoutBody.subtotal),
      Number(cart.subtotal).toFixed(2),
      `checkout subtotal (${checkoutBody.subtotal}) diverged from GET /api/cart subtotal (${cart.subtotal})`,
    );
    assert.equal(
      String(checkoutBody.platformFee),
      Number(cart.platformFee).toFixed(2),
      `checkout platformFee (${checkoutBody.platformFee}) diverged from GET /api/cart platformFee (${cart.platformFee}) — ` +
        "base platform-fee computation diverged across the three surfaces",
    );
    assert.equal(
      String(checkoutBody.conciergeFee),
      Number(cart.conciergeFee).toFixed(2),
      `checkout conciergeFee (${checkoutBody.conciergeFee}) diverged from GET /api/cart conciergeFee (${cart.conciergeFee}) — ` +
        "concierge fee computation diverged across the three surfaces",
    );
    assert.equal(
      String(checkoutBody.total),
      Number(cart.total).toFixed(2),
      `checkout total (${checkoutBody.total}) diverged from GET /api/cart total (${cart.total})`,
    );
    // Cross-check against fee-preview too (different field names, same semantics).
    assert.equal(
      String(checkoutBody.platformFee),
      preview.platformFeeTotal.toFixed(2),
      `checkout platformFee (${checkoutBody.platformFee}) diverged from GET /api/cart/fee-preview platformFeeTotal (${preview.platformFeeTotal})`,
    );
    assert.equal(
      String(checkoutBody.conciergeFee),
      preview.conciergeFeeTotal.toFixed(2),
      `checkout conciergeFee (${checkoutBody.conciergeFee}) diverged from GET /api/cart/fee-preview conciergeFeeTotal (${preview.conciergeFeeTotal})`,
    );
    assert.equal(
      String(checkoutBody.total),
      preview.total.toFixed(2),
      `checkout total (${checkoutBody.total}) diverged from GET /api/cart/fee-preview total (${preview.total})`,
    );
  } else {
    // CLAIM B (503 leg) — no fee fields in body; use DB rows.
    // sum(total_amount + platform_fee) === cart total (lineFullCharge invariant).
    const checkoutChargedTotal = (rows.rows as any[]).reduce(
      (acc, row) => acc + Number(row.total_amount) + Number(row.platform_fee),
      0,
    );
    assert.equal(
      checkoutChargedTotal.toFixed(2),
      Number(cart.total).toFixed(2),
      `DB-stamped total (sum total_amount + platform_fee = ${checkoutChargedTotal.toFixed(2)}) ` +
        `diverged from GET /api/cart total (${cart.total})`,
    );
    assert.equal(
      checkoutChargedTotal.toFixed(2),
      preview.total.toFixed(2),
      `DB-stamped total (${checkoutChargedTotal.toFixed(2)}) diverged from ` +
        `GET /api/cart/fee-preview total (${preview.total})`,
    );

    // CLAIM C (503 leg) — the DB merges base platform + concierge into a single platform_fee
    // column per row; their combined sum must equal the two separately-reported cart components.
    // This catches a misclassification that preserves the combined total but moves amounts
    // between the base-platform and concierge buckets.
    const sumPlatformFee = (rows.rows as any[]).reduce(
      (acc, row) => acc + Number(row.platform_fee),
      0,
    );
    const expectedCombinedFee = Number(cart.platformFee) + Number(cart.conciergeFee);
    assert.equal(
      sumPlatformFee.toFixed(2),
      expectedCombinedFee.toFixed(2),
      `DB sum(platform_fee) (${sumPlatformFee.toFixed(2)}) must equal cart platformFee + conciergeFee ` +
        `(${Number(cart.platformFee).toFixed(2)} + ${Number(cart.conciergeFee).toFixed(2)} = ${expectedCombinedFee.toFixed(2)}) — ` +
        "base platform and concierge fees are misclassified in the stamped rows",
    );
  }

  // CLAIM D — subtotal matches on both legs (base-amount computation consistent across surfaces).
  const checkoutSubtotal = (rows.rows as any[]).reduce(
    (acc, row) => acc + Number(row.total_amount),
    0,
  );
  assert.equal(
    checkoutSubtotal.toFixed(2),
    Number(cart.subtotal).toFixed(2),
    `DB sum(total_amount) (${checkoutSubtotal.toFixed(2)}) diverged from GET /api/cart subtotal (${cart.subtotal})`,
  );

  // Cart cleanup — done here so subsequent tests start clean.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);
});
