/**
 * Row 292a — provider Accept payout block (server).
 *
 *   P1  block shape from the active beta_flat band; currency from the stored charge;
 *       an override is source provider_override with a null settingId; rails uses the
 *       rails fact already on the row
 *   P2  keep = gross − fee to the cent, and the processing rate is not deducted
 *   P3  an admin edit of beta_flat shows on the next GET; a stored split does not move
 *   P4  no active band → GET omits payoutBlock; accept is 409 fee_setting_unresolved;
 *       status and snapshot unchanged
 *   P5  accept snapshots the computed block in the status update; a lost race keeps
 *       only the winner's snapshot; a stored split accept writes no snapshot
 *   P6  a mismatched feeSettingId/rate in the body is not a refusal; the expert route
 *       still accepts when the band does not resolve
 *   P7  the service file has no rate literal and does not import the fallback rates
 *   P8  another provider is 404; decline does not consult the block
 *
 * Migration 416 is applied here (additive, re-runnable) and is HELD.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row292a-provider-payout-block.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { BETA_FLAT_BAND, readBand, resolveProviderRate, round2 } from "../services/fee-resolution.service";
import { PROCESSING_FEE_RATE } from "../services/commission";
import { resolveCommissionOverride } from "../services/commission-override";
import {
  FEE_SETTING_UNRESOLVED,
  isProviderBookingStatusRequest,
  resolvePayoutBlock,
} from "../services/provider-payout-block.service";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `p292a-${RUN}`;
const POLICY_KEY = "active_provider_commission_policy";

const BLOCK_KEYS = ["currency", "fee", "gross", "keep", "rate", "settingId", "source"];

let categoryId = "";
let providerId = "";
let otherId = "";
let expertId = "";
let travelerId = "";
let serviceId = "";
let expertServiceId = "";
let providerCookie = "";
let otherCookie = "";
let expertCookie = "";
let savedPolicy: { exists: boolean; value: string | null } = { exists: false, value: null };
let savedBandRate: string | null = null;
let savedBandActive: boolean | null = null;
let priorCurrency: string | undefined;

function email(role: string): string {
  return `${PREFIX}-${role}@traveloure.test`;
}

async function applyMigration(): Promise<void> {
  const file = readFileSync("server/migrations/416_provider_payout_snapshot.sql", "utf8");
  const stripped = file.replace(/--.*$/gm, "");
  assert.match(stripped, /ADD COLUMN IF NOT EXISTS payout_snapshot jsonb/i);
  assert.doesNotMatch(stripped, /\bDEFAULT\b/i);
  assert.doesNotMatch(stripped, /\bCHECK\b/i);
  assert.doesNotMatch(stripped, /\bNOT NULL\b/i);
  assert.doesNotMatch(stripped, /\bUPDATE\b/i);
  assert.doesNotMatch(stripped, /\bINSERT\b/i);
  assert.match(
    readFileSync("server/migrations/migration-files.ts", "utf8"),
    /"416_provider_payout_snapshot\.sql"/,
  );
  assert.match(
    readFileSync("shared/schema.ts", "utf8"),
    /payoutSnapshot:\s*jsonb\("payout_snapshot"\)/,
  );
  assert.match(readFileSync("shared/schema.ts", "utf8"), /payoutSnapshot:\s*true/);
  await pool.query(file);
  await pool.query(file);
  const cols = await pool.query(
    `SELECT is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name = 'service_bookings' AND column_name = 'payout_snapshot'`,
  );
  assert.equal(cols.rows.length, 1);
  assert.equal(cols.rows[0].is_nullable, "YES");
  assert.equal(cols.rows[0].column_default, null);
}

async function setPolicy(value: string): Promise<void> {
  const updated = await db.execute(sql`
    UPDATE platform_settings SET setting_value = ${value}
     WHERE setting_key = ${POLICY_KEY}
    RETURNING setting_key
  `);
  if ((updated.rows ?? []).length === 0) {
    await db.execute(sql`
      INSERT INTO platform_settings (setting_key, setting_value) VALUES (${POLICY_KEY}, ${value})
    `);
  }
}

async function insertCharge(pi: string, currency: string, amount: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, user_id, amount, currency, status)
    VALUES (${pi}, ${travelerId}, ${amount}, ${currency}, 'succeeded')
  `);
}

async function insertBooking(opts: {
  suffix: string;
  ownerId: string;
  service: string;
  status?: string;
  total?: string;
  platformFee?: string | null;
  earnings?: string | null;
  currency?: string | null;
  details?: Record<string, unknown>;
}): Promise<string> {
  const id = `${PREFIX}-${opts.suffix}`;
  const pi = `pi_${PREFIX}_${opts.suffix}`;
  const total = opts.total ?? "80.00";
  const details = opts.details ?? {
    paidCharge: { status: "confirmed", amount: Number(total), at: "2026-01-01T00:00:00.000Z" },
  };
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, status, total_amount,
      platform_fee, provider_earnings, stripe_payment_intent_id, booking_details
    ) VALUES (
      ${id}, ${opts.service}, ${travelerId}, ${opts.ownerId}, ${opts.status ?? "pending"},
      ${total}, ${opts.platformFee ?? null}, ${opts.earnings ?? null}, ${pi},
      ${JSON.stringify(details)}::jsonb
    )
  `);
  if (opts.currency) await insertCharge(pi, opts.currency, total);
  return id;
}

async function bookingRow(id: string): Promise<{ status: string | null; snapshot: any }> {
  const res = await db.execute(sql`
    SELECT status, payout_snapshot AS snapshot FROM service_bookings WHERE id = ${id}
  `);
  const row = res.rows[0] as { status: string | null; snapshot: any };
  return { status: row?.status ?? null, snapshot: row?.snapshot ?? null };
}

async function providerBooking(id: string, cookie = providerCookie): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/provider/bookings`, { headers: { cookie } });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const rows = JSON.parse(text) as any[];
  const row = rows.find((r) => r.id === id);
  assert.ok(row, `booking ${id} missing from provider list`);
  return row;
}

async function patchStatus(
  path: "provider" | "expert",
  cookie: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}/api/${path}/bookings/${id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assertBlockShape(block: any, currency: string): void {
  assert.deepEqual(Object.keys(block).sort(), [...BLOCK_KEYS].sort());
  assert.equal(block.platformFee, undefined);
  assert.equal(block.providerEarnings, undefined);
  assert.equal(block.feeSettingId, undefined);
  assert.equal(typeof block.gross, "number");
  assert.equal(typeof block.fee, "number");
  assert.equal(typeof block.keep, "number");
  assert.equal(typeof block.rate, "number");
  assert.equal(block.currency, currency);
}

async function restoreBand(): Promise<void> {
  if (savedBandRate == null) return;
  await db.execute(sql`
    UPDATE fee_bands
       SET default_rate = ${savedBandRate}::numeric,
           is_active = ${savedBandActive}
     WHERE band_key = ${BETA_FLAT_BAND}
  `);
}

before(async () => {
  priorCurrency = process.env.PLATFORM_CURRENCY;
  await applyMigration();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL}`);

  const policy = await db.execute(sql`
    SELECT setting_value FROM platform_settings WHERE setting_key = ${POLICY_KEY} LIMIT 1
  `);
  if (policy.rows?.length) {
    savedPolicy = { exists: true, value: String((policy.rows[0] as { setting_value: unknown }).setting_value) };
  }
  await setPolicy("beta_flat");

  const bandRow = await db.execute(sql`
    SELECT default_rate::text AS rate, is_active FROM fee_bands WHERE band_key = ${BETA_FLAT_BAND} LIMIT 1
  `);
  const band = bandRow.rows[0] as { rate: string; is_active: boolean } | undefined;
  assert.ok(band, "beta_flat band must exist");
  savedBandRate = band.rate;
  savedBandActive = band.is_active;
  await restoreBand();

  const cat = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (${`${PREFIX}-cat`}, ${PREFIX}, ${PREFIX}, 'moderate')
    RETURNING id
  `);
  categoryId = String((cat.rows[0] as { id: string }).id);

  // Traveler sign-up is in waitlist mode. The traveler never signs in; the row is only an FK.
  travelerId = `${PREFIX}-trav`;
  await db.execute(sql`
    INSERT INTO users (id, email, role, first_name) VALUES (${travelerId}, ${email("trav")}, 'user', 'Trav')
  `);
  const supply = { intent: "supply" };
  const provider = await registerAndSignIn({
    baseUrl: BASE_URL, email: email("prov"), password: PASSWORD, firstName: "Prov", extra: supply,
  });
  providerId = provider.id;
  providerCookie = provider.cookie;
  const other = await registerAndSignIn({
    baseUrl: BASE_URL, email: email("other"), password: PASSWORD, firstName: "Other", extra: supply,
  });
  otherId = other.id;
  otherCookie = other.cookie;
  const expert = await registerAndSignIn({
    baseUrl: BASE_URL, email: email("expert"), password: PASSWORD, firstName: "Expert", extra: supply,
  });
  expertId = expert.id;
  expertCookie = expert.cookie;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id IN (${providerId}, ${otherId})`);
  await db.execute(sql`UPDATE users SET role = 'expert' WHERE id = ${expertId}`);

  serviceId = `${PREFIX}-svc`;
  expertServiceId = `${PREFIX}-esvc`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, category_id)
    VALUES
      (${serviceId}, ${providerId}, ${`Payout ${RUN}`}, 'fixture', '80.00', 'active', 'approved', ${categoryId}),
      (${expertServiceId}, ${expertId}, ${`Expert ${RUN}`}, 'fixture', '80.00', 'active', 'approved', ${categoryId})
  `);
});

after(async () => {
  if (priorCurrency === undefined) delete process.env.PLATFORM_CURRENCY;
  else process.env.PLATFORM_CURRENCY = priorCurrency;
  await db.execute(sql`UPDATE users SET commission_override_platform_fee_percent = NULL WHERE id = ${providerId}`).catch(() => {});
  await restoreBand().catch(() => {});
  if (savedPolicy.exists) {
    await db.execute(sql`
      UPDATE platform_settings SET setting_value = ${savedPolicy.value} WHERE setting_key = ${POLICY_KEY}
    `).catch(() => {});
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${POLICY_KEY}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM service_bookings WHERE id LIKE ${`${PREFIX}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_registry WHERE content_id LIKE ${`${PREFIX}%`} OR owner_id IN (${providerId}, ${expertId}, ${travelerId})`).catch(() => {});
  await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id LIKE ${`pi_${PREFIX}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${serviceId}, ${expertServiceId})`).catch(() => {});
  await db.execute(sql`DELETE FROM service_categories WHERE id = ${categoryId}`).catch(() => {});
  await db.execute(sql`
    DELETE FROM users WHERE email IN (${email("trav")}, ${email("prov")}, ${email("other")}, ${email("expert")})
  `).catch(() => {});
});

test("P1: block shape is the beta_flat band, the charge currency, and an override or rails fact", async () => {
  const band = await readBand(BETA_FLAT_BAND);
  assert.ok(band);
  const id = await insertBooking({ suffix: "p1", ownerId: providerId, service: serviceId, currency: "eur" });
  const row = await providerBooking(id);
  assertBlockShape(row.payoutBlock, "eur");
  assert.equal(row.payoutBlock.rate, band.rate);
  assert.equal(row.payoutBlock.settingId, band.id);
  assert.equal(row.payoutBlock.source, "fee_band");
  assert.equal(row.payoutBlock.gross, 80);

  const railsId = await insertBooking({
    suffix: "p1rails",
    ownerId: providerId,
    service: serviceId,
    currency: "eur",
    details: {
      paidCharge: { status: "confirmed", amount: 80, at: "2026-01-01T00:00:00.000Z" },
      railsAttribution: { attributed: true },
    },
  });
  const railsRow = await providerBooking(railsId);
  const rails = await resolveProviderRate({ categoryId, providerId, isRails: true });
  const plain = await resolveProviderRate({ categoryId, providerId, isRails: false });
  assert.equal(railsRow.payoutBlock.rate, rails.platformRate);
  assert.equal(railsRow.payoutBlock.settingId, rails.bandId);
  assert.equal(railsRow.payoutBlock.source, "fee_band");
  if (rails.platformRate !== plain.platformRate || rails.bandId !== plain.bandId) {
    assert.notEqual(railsRow.payoutBlock.settingId, plain.bandId);
  }

  const pct = Math.round(band.rate * 100) === 17 ? 19 : 17;
  await db.execute(sql`
    UPDATE users SET commission_override_platform_fee_percent = ${pct} WHERE id = ${providerId}
  `);
  try {
    const overrideId = await insertBooking({
      suffix: "p1over", ownerId: providerId, service: serviceId, currency: "eur",
    });
    const over = await providerBooking(overrideId);
    const expected = resolveCommissionOverride({ platformFeePercent: pct });
    assert.ok(expected);
    assert.equal(over.payoutBlock.source, "provider_override");
    assert.equal(over.payoutBlock.settingId, null);
    assert.equal(over.payoutBlock.rate, expected.platformRate);
    assert.notEqual(over.payoutBlock.rate, band.rate);
  } finally {
    await db.execute(sql`
      UPDATE users SET commission_override_platform_fee_percent = NULL WHERE id = ${providerId}
    `);
  }

  const envBooking = await insertBooking({
    suffix: "p1env", ownerId: providerId, service: serviceId, currency: null,
  });
  process.env.PLATFORM_CURRENCY = "jpy";
  try {
    const loaded = await storage.getServiceBooking(envBooking);
    assert.ok(loaded);
    const decision = await resolvePayoutBlock(loaded);
    assert.equal(decision.kind, "block");
    if (decision.kind === "block") assert.equal(decision.block.currency, "jpy");
  } finally {
    if (priorCurrency === undefined) delete process.env.PLATFORM_CURRENCY;
    else process.env.PLATFORM_CURRENCY = priorCurrency;
  }
});

test("P2: keep equals gross minus the fee, with no processing deduction", async () => {
  const id = await insertBooking({ suffix: "p2", ownerId: providerId, service: serviceId, currency: "eur" });
  const block = (await providerBooking(id)).payoutBlock;
  assert.equal(block.fee, round2(block.gross * block.rate));
  assert.equal(block.keep, round2(block.gross - block.fee));
  const processing = round2(block.gross * PROCESSING_FEE_RATE);
  assert.notEqual(processing, 0);
  assert.notEqual(block.keep, round2(block.gross - block.fee - processing));
});

test("P3: a beta_flat edit shows on the next GET; a stored split stays put", async () => {
  const beforeBand = await readBand(BETA_FLAT_BAND);
  assert.ok(beforeBand);
  const liveId = await insertBooking({ suffix: "p3", ownerId: providerId, service: serviceId, currency: "eur" });
  assert.equal((await providerBooking(liveId)).payoutBlock.rate, beforeBand.rate);

  const storedRate = beforeBand.rate === 0.2 ? 0.4 : 0.2;
  const storedId = await insertBooking({
    suffix: "p3stored",
    ownerId: providerId,
    service: serviceId,
    currency: "eur",
    total: "100.00",
    platformFee: "25.00",
    earnings: "75.00",
    details: {
      paidCharge: { status: "confirmed", amount: 100, at: "2026-01-01T00:00:00.000Z" },
      directRateResolution: {
        lane: "direct_band",
        resolved: true,
        rate: { platformRate: storedRate, bandId: "stored-band", rateSource: "band" },
      },
    },
  });
  const storedBefore = (await providerBooking(storedId)).payoutBlock;
  assert.equal(storedBefore.gross, 100);
  assert.equal(storedBefore.fee, 25);
  assert.equal(storedBefore.keep, 75);
  assert.equal(storedBefore.rate, storedRate);
  assert.equal(storedBefore.settingId, "stored-band");
  assert.equal(storedBefore.source, "fee_band");

  const next = beforeBand.rate >= 0.5 ? beforeBand.rate / 2 : beforeBand.rate * 2;
  assert.notEqual(next, beforeBand.rate);
  try {
    await db.execute(sql`
      UPDATE fee_bands SET default_rate = ${String(next)}::numeric WHERE band_key = ${BETA_FLAT_BAND}
    `);
    const edited = await readBand(BETA_FLAT_BAND);
    assert.ok(edited);
    const live = (await providerBooking(liveId)).payoutBlock;
    assert.equal(live.rate, edited.rate);
    assert.equal(live.settingId, edited.id);
    assert.equal(live.fee, round2(live.gross * edited.rate));
    assert.notEqual(live.rate, beforeBand.rate);
    const storedAfter = (await providerBooking(storedId)).payoutBlock;
    assert.equal(storedAfter.rate, storedRate);
    assert.equal(storedAfter.fee, 25);
    assert.equal(storedAfter.keep, 75);
    assert.equal(storedAfter.settingId, "stored-band");
  } finally {
    await restoreBand();
  }
});

test("P4: no active band omits the block and refuses accept without writing", async () => {
  const id = await insertBooking({ suffix: "p4", ownerId: providerId, service: serviceId, currency: "eur" });
  try {
    await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${BETA_FLAT_BAND}`);
    const row = await providerBooking(id);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "payoutBlock"), false);
    const refused = await patchStatus("provider", providerCookie, id, { status: "confirmed" });
    assert.equal(refused.status, 409);
    assert.equal(refused.json.reason, FEE_SETTING_UNRESOLVED);
    assert.equal(refused.json.currentStatus, "pending");
    assert.equal(refused.json.payoutBlock, undefined);
    const afterRow = await bookingRow(id);
    assert.equal(afterRow.status, "pending");
    assert.equal(afterRow.snapshot, null);
  } finally {
    await restoreBand();
  }
});

test("P5: accept snapshots the computed block; a lost race and a stored split do not", async () => {
  const band = await readBand(BETA_FLAT_BAND);
  assert.ok(band);
  const id = await insertBooking({ suffix: "p5", ownerId: providerId, service: serviceId, currency: "eur" });
  const shown = (await providerBooking(id)).payoutBlock;
  const accepted = await patchStatus("provider", providerCookie, id, { status: "confirmed" });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  assert.equal(accepted.json.status, "confirmed");
  const row = await bookingRow(id);
  assert.equal(row.status, "confirmed");
  assert.equal(row.snapshot.gross, shown.gross);
  assert.equal(row.snapshot.fee, shown.fee);
  assert.equal(row.snapshot.keep, shown.keep);
  assert.equal(row.snapshot.rate, shown.rate);
  assert.equal(row.snapshot.currency, shown.currency);
  assert.equal(row.snapshot.source, "fee_band");
  assert.equal(row.snapshot.settingId, band.id);
  assert.match(row.snapshot.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);

  const next = band.rate >= 0.5 ? band.rate / 2 : band.rate * 2;
  try {
    await db.execute(sql`
      UPDATE fee_bands SET default_rate = ${String(next)}::numeric WHERE band_key = ${BETA_FLAT_BAND}
    `);
    const again = (await providerBooking(id)).payoutBlock;
    assert.equal(again.rate, shown.rate);
    assert.equal(again.fee, shown.fee);
    assert.equal(again.keep, shown.keep);
  } finally {
    await restoreBand();
  }

  const storedId = await insertBooking({
    suffix: "p5stored",
    ownerId: providerId,
    service: serviceId,
    currency: "eur",
    total: "100.00",
    platformFee: "25.00",
    earnings: "75.00",
    details: {
      paidCharge: { status: "confirmed", amount: 100, at: "2026-01-01T00:00:00.000Z" },
      directRateResolution: {
        rate: { platformRate: 0.2, bandId: "stored-band", rateSource: "band" },
      },
    },
  });
  const storedAccept = await patchStatus("provider", providerCookie, storedId, { status: "confirmed" });
  assert.equal(storedAccept.status, 200, JSON.stringify(storedAccept.json));
  const storedRow = await bookingRow(storedId);
  assert.equal(storedRow.status, "confirmed");
  assert.equal(storedRow.snapshot, null);

  const raceId = `${PREFIX}-race`;
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, status, total_amount, stripe_payment_intent_id
    ) VALUES (
      ${raceId}, ${serviceId}, ${travelerId}, ${providerId}, 'pending', '10.00', ${`pi_${PREFIX}_race`}
    )
  `);
  const snap = (settingId: string) => ({
    gross: 10, fee: 1, keep: 9, rate: 0.1, currency: "eur", source: "fee_band" as const, settingId,
  });
  const [a, b] = await Promise.all([
    storage.updateServiceBookingStatus(raceId, "confirmed", undefined, ["pending"], undefined, snap("winner-a")),
    storage.updateServiceBookingStatus(raceId, "confirmed", undefined, ["pending"], undefined, snap("winner-b")),
  ]);
  const winners = [a, b].filter(Boolean);
  assert.equal(winners.length, 1);
  const race = await bookingRow(raceId);
  assert.equal(race.status, "confirmed");
  const winnerId = (winners[0] as { payoutSnapshot?: { settingId?: string } }).payoutSnapshot?.settingId;
  assert.ok(winnerId === "winner-a" || winnerId === "winner-b");
  assert.equal(race.snapshot.settingId, winnerId);
  assert.notEqual(race.snapshot.settingId, winnerId === "winner-a" ? "winner-b" : "winner-a");
});

test("P6: accept ignores a client fee id and rate; the expert route does not refuse", async () => {
  const id = await insertBooking({ suffix: "p6", ownerId: providerId, service: serviceId, currency: "eur" });
  const accepted = await patchStatus("provider", providerCookie, id, {
    status: "confirmed",
    feeSettingId: "not-the-band",
    rate: 9,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  const row = await bookingRow(id);
  assert.equal(row.status, "confirmed");
  assert.notEqual(row.snapshot.settingId, "not-the-band");
  assert.notEqual(row.snapshot.rate, 9);

  const expertBooking = await insertBooking({
    suffix: "p6expert", ownerId: expertId, service: expertServiceId, currency: "eur",
  });
  const providerBookingId = await insertBooking({
    suffix: "p6prov", ownerId: providerId, service: serviceId, currency: "eur",
  });
  try {
    await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${BETA_FLAT_BAND}`);
    const expertAccept = await patchStatus("expert", expertCookie, expertBooking, { status: "confirmed" });
    assert.equal(expertAccept.status, 200, JSON.stringify(expertAccept.json));
    const expertRow = await bookingRow(expertBooking);
    assert.equal(expertRow.status, "confirmed");
    assert.equal(expertRow.snapshot, null);
    const providerRefused = await patchStatus("provider", providerCookie, providerBookingId, { status: "confirmed" });
    assert.equal(providerRefused.status, 409);
    assert.equal(providerRefused.json.reason, FEE_SETTING_UNRESOLVED);
  } finally {
    await restoreBand();
  }
});

test("P7: the payout service has no rate literal and no fallback-rate import", async () => {
  const src = readFileSync("server/services/provider-payout-block.service.ts", "utf8");
  assert.doesNotMatch(src, /0\.10|0\.1\b|0\.9\b|0\.25|0\.75|0\.03|10%|90%/);
  assert.doesNotMatch(src, /PROCESSING_FEE_RATE|EXPERT_SHARE_RATE|PLATFORM_FEE_RATE|safeParseRate/);
  assert.doesNotMatch(src, /["']usd["']/i);
});

test("P8: another provider is 404 and decline does not consult the block", async () => {
  assert.equal(isProviderBookingStatusRequest({ originalUrl: "/api/provider/bookings/abc/status" }), true);
  assert.equal(isProviderBookingStatusRequest({ originalUrl: "/api/expert/bookings/abc/status" }), false);
  assert.equal(isProviderBookingStatusRequest({ url: "/api/provider/bookings/abc/status?x=1" }), true);

  const id = await insertBooking({ suffix: "p8", ownerId: providerId, service: serviceId, currency: "eur" });
  const stranger = await patchStatus("provider", otherCookie, id, { status: "confirmed" });
  assert.equal(stranger.status, 404);
  assert.equal((await bookingRow(id)).status, "pending");

  const declineId = await insertBooking({
    suffix: "p8dec", ownerId: providerId, service: serviceId, currency: "eur",
  });
  try {
    await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${BETA_FLAT_BAND}`);
    const declined = await patchStatus("provider", providerCookie, declineId, { status: "cancelled" });
    assert.equal(declined.status, 200, JSON.stringify(declined.json));
    const row = await bookingRow(declineId);
    assert.equal(row.status, "cancelled");
    assert.equal(row.snapshot, null);
  } finally {
    await restoreBand();
  }

  const born = await storage.createServiceBooking({
    serviceId,
    travelerId,
    providerId,
    totalAmount: "15.00",
    status: "pending",
    payoutSnapshot: { gross: 1, fee: 1, keep: 0, rate: 1, currency: "eur", source: "fee_band", settingId: "forged" },
  } as any);
  const forged = await bookingRow(born.id);
  assert.equal(forged.snapshot, null);
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${born.id}`);
});
