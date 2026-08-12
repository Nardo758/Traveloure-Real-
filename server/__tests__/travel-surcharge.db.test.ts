/**
 * TRAVEL SURCHARGE — behavioural proof of lane B1 (DECISIONS.md ruling 81; CLAUDE.md §8/§13/§14/§15/§17).
 *
 * RATIFIED DESIGN: a PROVIDER-CHOSEN `surcharge_mode` per listing (none|flat|zones|per_km). Listing
 * config (the provider sets the amounts/rings/rate — no fee_bands, §8), but it CHANGES THE CHARGE, so
 * the amount is SERVER-DERIVED at checkout from the mode + config × the traveler's CONFIRMED pickup
 * (§14 — never off req.body), disclosed as its own line, and rides the §15 claim (folded into the
 * line total_amount so a retry/double-submit charges it exactly once and §17 reconciliation holds).
 *
 * THE HONEST RAILS, each proven:
 *   R1  resolveTravelSurcharge is PURE and SERVER-DERIVED — flip the listing config, the amount
 *       moves; there is NO amount parameter, so a client value can't reach it (§14). Each mode.
 *   R2  §13 no-pickup ⇒ 0. A surcharge is NEVER produced from an absent/invented location.
 *   R3  flat applies ONLY outside the coverage radius (honest containment); inside ⇒ 0.
 *   R4  zones maps the pickup to the SMALLEST ring that CONTAINS it (boundary cases); a pickup
 *       beyond the largest ring is INELIGIBLE (booking refused), never silently 0-charged.
 *   R5  per_km is STRAIGHT-LINE (haversine) × rate — and emits NO driving distance/time (§13).
 *   R6  the outer bound (surcharge_max_km) makes an out-of-range pickup INELIGIBLE.
 *   D1  the surcharge is DISCLOSED as its own `travelSurcharge` line on GET /api/cart/fee-preview,
 *       server-derived — flip the config, the disclosed line moves; clear the pickup, it goes 0.
 *   C1  POST /api/checkout REFUSES an out-of-range pickup with 400 pickup_out_of_range BEFORE any
 *       charge (no Stripe call, no booking, no slot claim).
 *   T1  the zone-tiers replace-list PUT is owner-gated (non-owner 404) and server-numbers positions.
 *   NC  NEVER-CLOBBER — switching the mode preserves the other modes' config (round-trip PATCH).
 *   I1  §15/§17 — a booking whose surcharge is folded into total_amount promotes exactly ONCE on a
 *       double signal (surcharge charged once), and SUM(total_amount+platform_fee) reconciles.
 *   G1  the money-endpoints guard stays green with the new fields (spawned; exit 0).
 *
 * Pure-resolver assertions need no infra; the HTTP assertions run against the ALREADY-RUNNING dev
 * server on http://127.0.0.1:5000 (the service-display-options posture); the §15 promotion assertions
 * drive the shared checkout-claim service against the DB directly. DISPOSABLE DB ONLY — every row is
 * deleted in after(). Serialize: npx tsx --test --test-concurrency=1 server/__tests__/travel-surcharge.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveTravelSurcharge, haversineKm } from "../services/travel-surcharge.service";
import { promotePaidCheckout } from "../services/checkout-claim.service";
import { storage } from "../storage";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

// Kyoto pin; a near pickup (~0.3 km) and a far pickup (Osaka, ~40 km straight-line).
const PIN = { lat: 35.0116, lng: 135.7681 };
const NEAR = { lat: 35.0135, lng: 135.7690 };  // ~0.25 km from the pin
const FAR = { lat: 34.6937, lng: 135.5023 };   // Osaka ~ 40+ km from the pin
const KM_FAR = haversineKm(PIN, FAR);
const KM_NEAR = haversineKm(PIN, NEAR);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[travel-surcharge] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerActor(label: string, role: string): Promise<Actor> {
  const email = `ts-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "TS", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  await db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${body.user.id}`);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

/** An APPROVED + ACTIVE, place-anchored, in-person listing with a confirmed pin + surcharge config. */
async function seedSurchargeService(
  ownerId: string,
  label: string,
  cfg: {
    surchargeMode: string;
    surchargeFlatAmount?: string | null;
    surchargePerKm?: string | null;
    surchargeMaxKm?: number | null;
    serviceRadius?: number | null;
  },
): Promise<string> {
  const id = `ts-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method,
       latitude, longitude, location_precision, pickup_available, transport_provision,
       service_radius, surcharge_mode, surcharge_flat_amount, surcharge_per_km, surcharge_max_km)
    VALUES
      (${id}, ${ownerId}, ${`TS ${label}`}, '100.00', 'active', 'approved', 'in_person',
       ${String(PIN.lat)}, ${String(PIN.lng)}, 'exact', true, 'pickup_available',
       ${cfg.serviceRadius ?? null}, ${cfg.surchargeMode},
       ${cfg.surchargeFlatAmount ?? null}, ${cfg.surchargePerKm ?? null}, ${cfg.surchargeMaxKm ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

async function addToCartAndPickup(traveler: Actor, serviceId: string, pickup: { lat: number; lng: number } | null): Promise<string> {
  const add = await readOnce(await api("/api/cart", traveler.cookie, "POST", { serviceId }));
  assert.ok(add.status === 200 || add.status === 201, `add-to-cart failed (${add.status}): ${add.text}`);
  const cart = await readOnce(await api("/api/cart", traveler.cookie));
  const itemId = (cart.body.items as any[]).find((i) => i.serviceId === serviceId)?.id;
  assert.ok(itemId, "cart item present after add");
  if (pickup) {
    const p = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { pickupLocation: { ...pickup, address: "test pickup" } });
    assert.equal(p.status, 200, `pickup PATCH failed: ${await p.text()}`);
  }
  return itemId;
}
async function clearCart(traveler: Actor) { await api("/api/cart", traveler.cookie, "DELETE"); }
async function feePreview(traveler: Actor) { return (await readOnce(await api("/api/cart/fee-preview", traveler.cookie))).body; }

let provider: Actor;
let traveler: Actor;
let stranger: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  provider = await registerActor("prov", "service_provider");
  traveler = await registerActor("trav", "user");
  stranger = await registerActor("str", "service_provider");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdBookingIds) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared db pool — leave open */ }
});

// ═══ R1/R2/R3/R4/R5/R6 — the PURE RESOLVER (server-derived; no infra) ═══════════════════════════
test("R1: resolveTravelSurcharge is server-derived — mode 'none' and a config flip; no amount param", () => {
  // none ⇒ 0 regardless of pickup.
  assert.equal(resolveTravelSurcharge({ surchargeMode: "none", latitude: PIN.lat, longitude: PIN.lng }, FAR).amount, 0);
  // flat: flip the config, the amount moves — proving derivation, not a passed value (§14).
  const cfg = { surchargeMode: "flat", serviceRadius: 5, latitude: PIN.lat, longitude: PIN.lng };
  assert.equal(resolveTravelSurcharge({ ...cfg, surchargeFlatAmount: "20.00" }, FAR).amount, 20);
  assert.equal(resolveTravelSurcharge({ ...cfg, surchargeFlatAmount: "35.00" }, FAR).amount, 35);
});

test("R2: §13 — NO pickup ⇒ 0 surcharge (never from an invented location)", () => {
  const cfg = { surchargeMode: "flat", serviceRadius: 1, surchargeFlatAmount: "20.00", latitude: PIN.lat, longitude: PIN.lng };
  const noPickup = resolveTravelSurcharge(cfg, null);
  assert.equal(noPickup.amount, 0);
  assert.equal(noPickup.hasPickup, false);
  assert.equal(noPickup.basis, "no_pickup");
  // A malformed pickup is not a real location either.
  assert.equal(resolveTravelSurcharge(cfg, { lat: NaN as any, lng: 1 }).amount, 0);
});

test("R3: flat applies ONLY outside the coverage radius; inside ⇒ 0 (honest containment, no distance)", () => {
  const cfg = { surchargeMode: "flat", serviceRadius: 5, surchargeFlatAmount: "20.00", latitude: PIN.lat, longitude: PIN.lng };
  const inside = resolveTravelSurcharge(cfg, NEAR);
  assert.equal(inside.amount, 0);
  assert.equal(inside.basis, "inside_radius");
  const outside = resolveTravelSurcharge(cfg, FAR);
  assert.equal(outside.amount, 20);
  assert.equal(outside.basis, "outside_radius");
});

test("R4: zones maps to the SMALLEST containing ring; beyond the largest ring ⇒ INELIGIBLE", () => {
  // rings: base 0 within 2km, 15 within 10km, 30 within 60km. Passed OUT OF ORDER to prove sorting.
  const tiers = [{ radiusKm: 60, fee: 30 }, { radiusKm: 2, fee: 0 }, { radiusKm: 10, fee: 15 }];
  const cfg = { surchargeMode: "zones", latitude: PIN.lat, longitude: PIN.lng };
  assert.equal(resolveTravelSurcharge(cfg, NEAR, tiers).amount, 0, "near ⇒ base ring, 0");
  assert.equal(resolveTravelSurcharge(cfg, NEAR, tiers).basis, "zone_tier:1");
  // ~40km ⇒ the 60km ring (fee 30).
  const far = resolveTravelSurcharge(cfg, FAR, tiers);
  assert.equal(far.amount, 30, `far (${KM_FAR.toFixed(1)}km) ⇒ 60km ring fee 30`);
  // beyond every ring ⇒ ineligible (not silently 0-charged).
  const beyond = resolveTravelSurcharge({ surchargeMode: "zones", latitude: PIN.lat, longitude: PIN.lng }, FAR, [{ radiusKm: 5, fee: 10 }]);
  assert.equal(beyond.eligible, false);
  assert.equal(beyond.basis, "beyond_zones");
  assert.equal(beyond.amount, 0);
  // boundary: a pickup EXACTLY at a ring radius is contained by it.
  const onEdge = resolveTravelSurcharge({ surchargeMode: "zones", latitude: PIN.lat, longitude: PIN.lng }, FAR, [{ radiusKm: KM_FAR, fee: 12 }]);
  assert.equal(onEdge.amount, 12, "exactly-on-radius is inside");
});

test("R5: per_km is STRAIGHT-LINE × rate, and emits NO driving distance/time (§13)", () => {
  const cfg = { surchargeMode: "per_km", surchargePerKm: "2.00", latitude: PIN.lat, longitude: PIN.lng };
  const r = resolveTravelSurcharge(cfg, FAR);
  const expected = Math.round(2 * KM_FAR * 100) / 100;
  assert.equal(r.amount, expected, `per_km = 2 × ${KM_FAR.toFixed(3)}km`);
  assert.equal(r.basis, "per_km");
  assert.ok(r.straightLineKm !== null && Math.abs(r.straightLineKm - KM_FAR) < 1e-6, "straight-line km reported");
  // The result carries no driving/duration field by construction — assert the shape has only the
  // documented keys (a driving distance would be a §13 violation).
  assert.deepEqual(
    Object.keys(r).sort(),
    ["amount", "basis", "eligible", "hasPickup", "mode", "straightLineKm"],
    "result exposes no driving/duration field",
  );
});

test("R6: the outer bound (surcharge_max_km) makes an out-of-range pickup INELIGIBLE", () => {
  const cfg = { surchargeMode: "per_km", surchargePerKm: "2.00", surchargeMaxKm: 10, latitude: PIN.lat, longitude: PIN.lng };
  const r = resolveTravelSurcharge(cfg, FAR); // ~40km > 10km
  assert.equal(r.eligible, false);
  assert.equal(r.basis, "beyond_max_km");
  // within the bound is fine.
  assert.equal(resolveTravelSurcharge(cfg, NEAR).eligible, true);
});

// ═══ D1 — the DISCLOSED line on fee-preview, server-derived ═════════════════════════════════════
test("D1: GET /api/cart/fee-preview discloses travelSurcharge, server-derived; flip config → it moves; clear pickup → 0", async () => {
  const svc = await seedSurchargeService(provider.id, "preview", { surchargeMode: "flat", serviceRadius: 5, surchargeFlatAmount: "20.00" });
  const itemId = await addToCartAndPickup(traveler, svc, FAR);
  let fp = await feePreview(traveler);
  assert.equal(fp.travelSurcharge, 20, `disclosed line = 20, got ${fp.travelSurcharge}`);
  assert.equal(Number(fp.total).toFixed(2), (Number(fp.subtotal) + Number(fp.platformFeeTotal) + Number(fp.conciergeFeeTotal) + 20).toFixed(2), "total includes the surcharge line");

  // Flip the config on the row → the disclosed line moves (server-derived, not client-held).
  await db.execute(sql`UPDATE provider_services SET surcharge_flat_amount = '45.00' WHERE id = ${svc}`);
  fp = await feePreview(traveler);
  assert.equal(fp.travelSurcharge, 45, "disclosed line moved with the config");

  // Clear the pickup → 0 (§13). PATCH pickupLocation = null.
  const p = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { pickupLocation: null });
  assert.equal(p.status, 200, await p.text());
  fp = await feePreview(traveler);
  assert.equal(fp.travelSurcharge, 0, "no pickup ⇒ no disclosed surcharge");
  await clearCart(traveler);
});

test("D1b: flat INSIDE the radius discloses 0; per_km discloses rate × straight-line", async () => {
  const flatSvc = await seedSurchargeService(provider.id, "flatin", { surchargeMode: "flat", serviceRadius: 5, surchargeFlatAmount: "20.00" });
  await addToCartAndPickup(traveler, flatSvc, NEAR);
  assert.equal((await feePreview(traveler)).travelSurcharge, 0, "inside radius ⇒ 0");
  await clearCart(traveler);

  const kmSvc = await seedSurchargeService(provider.id, "perkm", { surchargeMode: "per_km", surchargePerKm: "2.00" });
  await addToCartAndPickup(traveler, kmSvc, FAR);
  const expected = Math.round(2 * KM_FAR * 100) / 100;
  assert.equal((await feePreview(traveler)).travelSurcharge, expected, "per_km disclosed = rate × straight-line");
  await clearCart(traveler);
});

// ═══ C1 — checkout REFUSES an out-of-range pickup BEFORE any charge ═════════════════════════════
test("C1: POST /api/checkout with an out-of-range pickup ⇒ 400 pickup_out_of_range, before any charge", async () => {
  const svc = await seedSurchargeService(provider.id, "maxkm", { surchargeMode: "per_km", surchargePerKm: "2.00", surchargeMaxKm: 10 });
  await addToCartAndPickup(traveler, svc, FAR); // ~40km > 10km cap
  const res = await readOnce(await api("/api/checkout", traveler.cookie, "POST", { idempotencyKey: crypto.randomUUID() }));
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "pickup_out_of_range");
  // No booking was created for this traveler+service.
  const b = await db.execute(sql`SELECT count(*)::int AS n FROM service_bookings WHERE service_id = ${svc}`);
  assert.equal((b.rows[0] as any).n, 0, "no booking created on an out-of-range refusal");
  await clearCart(traveler);
});

// ═══ T1 — the zone-tiers replace-list PUT is owner-gated and server-numbers positions ═══════════
test("T1: PUT surcharge-tiers is owner-gated (non-owner 404); owner replace-list server-numbers positions", async () => {
  const svc = await seedSurchargeService(provider.id, "tiers", { surchargeMode: "zones" });
  // Non-owner refused.
  const bad = await api(`/api/provider/services/${svc}/surcharge-tiers`, stranger.cookie, "PUT", { tiers: [{ radiusKm: 5, fee: 10 }] });
  assert.equal(bad.status, 404, `non-owner must get 404, got ${bad.status}`);
  // Owner replace-list — sent OUT OF ORDER; positions are derived from array order.
  const ok = await readOnce(await api(`/api/provider/services/${svc}/surcharge-tiers`, provider.cookie, "PUT", {
    tiers: [{ radiusKm: 3, fee: 5 }, { radiusKm: 12, fee: 20 }],
  }));
  assert.equal(ok.status, 200, ok.text);
  const stored = await storage.getServiceSurchargeTiers(svc);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].position, 1);
  assert.equal(stored[1].position, 2);
  assert.equal(Number(stored[0].radiusKm), 3);
  assert.equal(Number(stored[1].fee), 20);
  // Replace again with a shorter list — the old rows are gone (replace, not append).
  await api(`/api/provider/services/${svc}/surcharge-tiers`, provider.cookie, "PUT", { tiers: [{ radiusKm: 8, fee: 9 }] });
  const after = await storage.getServiceSurchargeTiers(svc);
  assert.equal(after.length, 1, "replace-list, not append");
});

// ═══ NC — NEVER-CLOBBER across mode switches ═══════════════════════════════════════════════════
test("NC: switching the surcharge mode preserves the other modes' config (never-clobber)", async () => {
  const svc = await seedSurchargeService(provider.id, "nc", {
    surchargeMode: "flat", serviceRadius: 5, surchargeFlatAmount: "20.00", surchargePerKm: "2.00",
  });
  // Switch to per_km via the owner PATCH — the flat amount must survive.
  const r = await api(`/api/provider/services/${svc}`, provider.cookie, "PATCH", { surchargeMode: "per_km" });
  assert.equal(r.status, 200, await r.text());
  const rows = await db.execute(sql`SELECT surcharge_mode, surcharge_flat_amount, surcharge_per_km FROM provider_services WHERE id = ${svc}`);
  const row = rows.rows[0] as any;
  assert.equal(row.surcharge_mode, "per_km");
  assert.equal(Number(row.surcharge_flat_amount), 20, "flat amount preserved across the mode switch");
  assert.equal(Number(row.surcharge_per_km), 2, "per-km rate preserved");
});

// ═══ I1 — §15/§17: the folded surcharge is charged EXACTLY ONCE and reconciles ═════════════════
test("I1: §15 — a folded surcharge promotes exactly ONCE on a double signal; §17 SUM reconciles", async () => {
  // A booking exactly as checkout leaves it: total_amount already folds the 20 surcharge into the
  // 100 base (120), platform_fee 25, provider keeps the surcharge (earnings 95), PI stamped.
  const bookingId = `ts-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  const pi = `pi_ts_${RUN}`;
  const svc = await seedSurchargeService(provider.id, "i1", { surchargeMode: "flat", serviceRadius: 5, surchargeFlatAmount: "20.00" });
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
      total_amount, platform_fee, provider_earnings, insurance_fee, stripe_payment_intent_id,
      booking_details, idempotency_key, created_at)
    VALUES (${bookingId}, ${svc}, ${traveler.id}, ${provider.id}, 'payment_pending',
      '120.00', '25.00', '95.00', '0.00', ${pi},
      ${JSON.stringify({ travelSurcharge: "20.00", travelSurchargeMode: "flat", stripeAttemptAt: new Date().toISOString() })}::jsonb,
      ${`ts-${RUN}-key`}, NOW())
  `);
  createdBookingIds.push(bookingId);

  const first = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] });
  const second = await promotePaidCheckout({ paymentIntentId: pi, actor: "client", bookingIds: [bookingId] });
  const promotedTotal = first.promoted.length + second.promoted.length;
  assert.equal(promotedTotal, 1, "exactly ONE promotion across the double signal");

  const rows = await db.execute(sql`SELECT status, total_amount, platform_fee, provider_earnings FROM service_bookings WHERE id = ${bookingId}`);
  const row = rows.rows[0] as any;
  assert.equal(row.status, "confirmed", "promoted to confirmed once");
  assert.equal(Number(row.total_amount), 120, "total_amount unchanged — the surcharge is charged once, not re-added");
  assert.equal(Number(row.provider_earnings), 95, "provider keeps the full surcharge (no commission on it)");
  // §17 reconciliation: the expected charge = SUM(total_amount + platform_fee) over the PI's rows.
  const recon = await db.execute(sql`SELECT COALESCE(SUM(total_amount + platform_fee),0)::numeric AS charged FROM service_bookings WHERE stripe_payment_intent_id = ${pi}`);
  assert.equal(Number((recon.rows[0] as any).charged), 145, "SUM(total_amount+platform_fee) = base 100 + surcharge 20 + fee 25");
});

// ═══ G1 — the money-endpoints guard stays green with the new fields ════════════════════════════
test("G1: check-money-endpoints.cjs exits 0 with the surcharge fields present", () => {
  const script = path.resolve(process.cwd(), "scripts/check-money-endpoints.cjs");
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `money-endpoints guard must exit 0:\n${r.stdout}\n${r.stderr}`);
});
