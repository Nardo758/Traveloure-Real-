/**
 * RAILS ATTRIBUTION PINS — D6, docs/DECISIONS.md ruling 61 (fee-ledger lane).
 *
 * Ruling 61's attribution pin, verbatim: *"a valid frame link → rails resolution + waiver logged; a
 * fabricated/expired/wrong-provider ref → full rate."* Until this file is green the waiver marketing
 * caption ("book through my link — skip the service fee") stays OUT of the caption engine — the
 * marketing promise must not precede the money truth.
 *
 * WHAT EACH PIN IS FOR (the negative space matters as much as the positives):
 *   R1  a valid ref off a provider's own link SELECTS the rails lane; the rate is min(band, rails)
 *       and the traveler fee is waived — both decided INSIDE the single resolver, not here.
 *   R2  a fabricated ref buys nothing — full rate, refusal recorded with its reason.
 *   R3  an expired ref buys nothing (migration 198's `expires_at`).
 *   R4  another provider's ref buys nothing on this provider's listing.
 *   R5  §14/§18 — the ref cannot CARRY a rate. Flip the band, keep the same ref: the rate moves.
 *       A ref shaped like a number/rate is refused as a ref, never read as one.
 *   R6  ruling 48's direction clause — a premium band UNDER rails is never RAISED to rails.
 *   R7  the ledger row: stamped `rate_source`, `source_attribution='rails'`, waiver visible, and a
 *       replay writes NOTHING (one waiver, no double-stamp).
 *   R8  self-referral refused — a provider cannot discount their own take by clicking their link.
 *   R9  a non-provider (expert-lane) owner is refused rather than given an invented expert rails rate.
 *   R10 an entity override outranks rails and does NOT silently carry the waiver (ruling 47).
 *
 * NO LITERALS (ruling 32): every expectation is computed from a live `fee_bands` READ, so re-pricing
 * a band is not a test edit.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  validateRailsRef,
  resolveRailsForItem,
  railsSnapshot,
} from "../services/rails-attribution.service";
import { recordRailsFeeLedger, railsCommissionLedgerKey } from "../services/fee-ledger.service";
import { requireBand, round2, PROVIDER_RAILS_BAND, TRAVELER_SERVICE_FEE_BAND } from "../services/fee-resolution.service";

const SUFFIX = `railsattr-${process.pid}`;
const BAND_UNDER_TEST = "moderate";

let categoryId: string;
let providerId: string;
let expertId: string;
let otherProviderId: string;
let travelerId: string;
let providerCode: string;
let otherProviderCode: string;
let expiredCode: string;
let expertCode: string;
let originalRate: number;
let bookingId: string;

const SUBTOTAL = 400;

async function mkUser(tag: string, role: string): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${tag}-${SUFFIX}@traveloure.test`}, ${role})
    RETURNING id
  `);
  return String((res.rows[0] as any).id);
}

async function mkLink(code: string, ownerId: string, frame: string | null, expiresAt: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO short_links (id, code, owner_user_id, target_type, target_id, frame, expires_at)
    VALUES (gen_random_uuid()::text, ${code}, ${ownerId}, 'storefront', NULL, ${frame}, ${expiresAt}::timestamp)
  `);
}

/** The exact call shape the checkout makes for one cart line. */
function itemArgs(overrides: Record<string, unknown> = {}) {
  return {
    ref: providerCode,
    travelerUserId: travelerId,
    serviceOwnerUserId: providerId,
    ownerRole: "service_provider",
    categoryId,
    itemSubtotal: SUBTOTAL,
    ...overrides,
  } as any;
}

before(async () => {
  originalRate = (await requireBand(BAND_UNDER_TEST)).rate;

  const cat = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"zz-" + SUFFIX}, ${"zz-" + SUFFIX}, ${BAND_UNDER_TEST})
    RETURNING id
  `);
  categoryId = String((cat.rows[0] as any).id);

  providerId = await mkUser("prov", "service_provider");
  otherProviderId = await mkUser("prov2", "service_provider");
  expertId = await mkUser("exp", "travel_expert");
  travelerId = await mkUser("trav", "user");

  // 8-char [a-z0-9] codes, the shape short-links.routes.ts mints.
  const stem = `${process.pid}`.padStart(5, "0").slice(-5);
  providerCode = `a${stem}aa`;
  otherProviderCode = `b${stem}bb`;
  expiredCode = `c${stem}cc`;
  expertCode = `d${stem}dd`;

  await mkLink(providerCode, providerId, "story", null);
  await mkLink(otherProviderCode, otherProviderId, "feed", null);
  await mkLink(expiredCode, providerId, "route", "2020-01-01T00:00:00Z");
  await mkLink(expertCode, expertId, "review", null);

  // A real booking row so the ledger pin writes against the real shape (§14: amounts derived from
  // the row, never from a test literal at write time).
  const b = await db.execute(sql`
    INSERT INTO service_bookings (id, traveler_id, provider_id, total_amount, platform_fee, status, booking_details)
    VALUES (gen_random_uuid()::text, ${travelerId}, ${providerId}, ${SUBTOTAL.toFixed(2)}, '0.00', 'payment_pending', '{}'::jsonb)
    RETURNING id
  `);
  bookingId = String((b.rows[0] as any).id);
});

after(async () => {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${originalRate} WHERE band_key = ${BAND_UNDER_TEST}`);
  await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${bookingId}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${bookingId}`);
  await db.execute(sql`DELETE FROM short_links WHERE code IN (${providerCode}, ${otherProviderCode}, ${expiredCode}, ${expertCode})`);
  await db.execute(sql`DELETE FROM service_categories WHERE id = ${categoryId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${providerId}, ${otherProviderId}, ${expertId}, ${travelerId})`);
});

/**
 * R1 — THE CHAIN. A valid ref off the provider's OWN link selects the rails lane: the rate is the
 * resolver's min(category band, rails) and the traveler fee is waived. Nothing here computes a rate;
 * the expectation is read from `fee_bands`.
 */
test("R1: a valid provider link resolves the rails lane — min(band, rails) + the traveler-fee waiver", async () => {
  // Put the category band ABOVE rails so the rails band is the one min() picks.
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 2)} WHERE band_key = ${BAND_UNDER_TEST}`);

  const r = await resolveRailsForItem(itemArgs());
  assert.equal(r.attributed, true, "a valid, unexpired, owner-matched ref must select the rails lane");
  assert.equal(r.reason, null);
  assert.equal(r.ref, providerCode);
  assert.equal(r.frame, "story", "the frame the link was minted with travels with the decision (D4)");
  assert.ok(r.rate, "an attributed line must carry a resolved rate");
  assert.equal(r.rate!.platformRate, rails.rate, "rails must win when the category band is dearer");
  assert.equal(r.rate!.rateSource, "rails");
  assert.equal(r.rate!.railsApplied, true);
  assert.equal(round2(r.rate!.providerShareRate + r.rate!.platformRate), 1);

  const feeBand = await requireBand(TRAVELER_SERVICE_FEE_BAND);
  assert.ok(r.travelerFeeWaiver, "a rails booking waives the traveler service fee (ruling 48)");
  assert.equal(r.travelerFeeWaiver!.waived, true);
  assert.equal(r.travelerFeeWaiver!.rate, feeBand.rate, "the waiver names the band that priced it");
  const expectedUncapped = round2(SUBTOTAL * feeBand.rate);
  const expectedCounterfactual =
    feeBand.maxAmount !== null && expectedUncapped > feeBand.maxAmount ? feeBand.maxAmount : expectedUncapped;
  assert.equal(
    r.travelerFeeWaiver!.wouldHaveBeenAmount,
    expectedCounterfactual,
    "the waiver records what the band would have charged, band-derived and cap-aware",
  );
  // §13: the D3 traveler fee is not billed on the direct path today — the record must say so.
  assert.equal(r.travelerFeeWaiver!.billedOnDirectPathToday, false);
});

/** R2 — a FABRICATED ref buys nothing. Full rate, and the refusal is recorded with its reason. */
test("R2: a fabricated ref is refused — no rails, no waiver, reason recorded", async () => {
  const r = await resolveRailsForItem(itemArgs({ ref: "zzzz9999" }));
  assert.equal(r.attributed, false);
  assert.equal(r.reason, "unknown_ref");
  assert.equal(r.rate, null, "a refused ref must leave the incumbent full rate in place");
  assert.equal(r.travelerFeeWaiver, null, "no waiver may ride a refused ref");
  const snap = railsSnapshot(r);
  assert.equal(snap.attributed, false);
  assert.equal(snap.reason, "unknown_ref", "the refusal is a DB fact on the booking row, not only a log line");
});

/** R3 — an EXPIRED ref buys nothing (migration 198). */
test("R3: an expired ref is refused — full rate", async () => {
  const r = await resolveRailsForItem(itemArgs({ ref: expiredCode }));
  assert.equal(r.attributed, false);
  assert.equal(r.reason, "expired_ref");
  assert.equal(r.rate, null);
  assert.equal(r.travelerFeeWaiver, null);
  // The link row still resolves — expiry refuses the FEE LANE, it does not erase the link.
  assert.equal(r.shortLinkId !== null, true);
});

/** R4 — ANOTHER PROVIDER's ref buys nothing on this provider's listing. */
test("R4: a wrong-provider ref is refused — full rate", async () => {
  const r = await resolveRailsForItem(itemArgs({ ref: otherProviderCode }));
  assert.equal(r.attributed, false);
  assert.equal(r.reason, "owner_mismatch");
  assert.equal(r.rate, null);
  assert.equal(r.travelerFeeWaiver, null);
});

/**
 * R5 — §14/§18: THE REF SELECTS A LANE, IT NEVER CARRIES A RATE.
 * Two halves: (a) a ref crafted to look like a rate/amount is refused AS A REF, never read as one;
 * (b) with the SAME valid ref unchanged, re-pricing `fee_bands` moves the resolved rate — proof the
 * number came from the band and not from anything the client sent.
 */
test("R5: the ref cannot carry a rate — the rate provably comes from fee_bands", async () => {
  for (const hostile of ["0.00", "1.00", "rate=0", "0", "99"]) {
    const r = await resolveRailsForItem(itemArgs({ ref: hostile }));
    assert.equal(r.attributed, false, `a crafted ref (${hostile}) must never select the rails lane`);
    assert.ok(
      r.reason === "unknown_ref" || r.reason === "malformed_ref",
      `a crafted ref (${hostile}) is refused as a REF, never interpreted as a number — got ${r.reason}`,
    );
  }

  // Same ref, same everything — only the RAILS BAND moves.
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 3)} WHERE band_key = ${BAND_UNDER_TEST}`);
  const before = await resolveRailsForItem(itemArgs());
  assert.equal(before.rate!.platformRate, rails.rate);

  const edited = round2(rails.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${edited} WHERE band_key = ${PROVIDER_RAILS_BAND}`);
  try {
    const after = await resolveRailsForItem(itemArgs());
    assert.equal(after.rate!.platformRate, edited, "an admin band edit must reach the next rails resolution");
    assert.notEqual(after.rate!.platformRate, before.rate!.platformRate, "the rate must actually have moved");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${rails.rate} WHERE band_key = ${PROVIDER_RAILS_BAND}`);
  }
});

/** R6 — ruling 48's DIRECTION clause: rails never RAISES a premium provider's rate. */
test("R6: a premium band under rails wins — rails never raises the rate", async () => {
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  const cheaper = round2(rails.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${cheaper} WHERE band_key = ${BAND_UNDER_TEST}`);

  const r = await resolveRailsForItem(itemArgs());
  assert.equal(r.attributed, true, "a premium provider still books on the rails lane");
  assert.equal(r.rate!.platformRate, cheaper, "the cheaper category band survives");
  assert.ok(r.rate!.platformRate <= rails.rate);
  assert.equal(r.rate!.rateSource, "band", "the band that decided the rate is the one stamped");
  assert.equal(r.rate!.railsApplied, true);
  assert.equal(r.travelerFeeWaiver!.waived, true, "the waiver is the LANE's, not the band's — it still applies");
});

/**
 * R7 — THE LEDGER. The rails event is recorded with its provenance, the waiver is visible on it, and
 * a replay writes NOTHING (one waiver, no double-stamp) — idempotency by UNIQUE key, not by luck.
 */
test("R7: the rails fee event is recorded once, stamped, with the waiver visible", async () => {
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 2)} WHERE band_key = ${BAND_UNDER_TEST}`);
  const resolution = await resolveRailsForItem(itemArgs());
  assert.equal(resolution.attributed, true);

  await db.execute(sql`
    UPDATE service_bookings
       SET booking_details = jsonb_set(coalesce(booking_details, '{}'::jsonb), '{railsAttribution}', ${JSON.stringify(railsSnapshot(resolution))}::jsonb)
     WHERE id = ${bookingId}
  `);

  const first = await recordRailsFeeLedger({ bookingIds: [bookingId], stripePaymentRef: "pi_rails_pin", actor: "checkout" });
  assert.equal(first.considered, 1);
  assert.equal(first.inserted, 1, "the rails commission event must land");

  const rows = await db.execute(sql`SELECT * FROM fee_ledger WHERE booking_id = ${bookingId}`);
  assert.equal(rows.rows.length, 1);
  const row = rows.rows[0] as any;
  assert.equal(row.fee_type, "provider_commission_rails", "the fee TYPE names the lane the booking arrived on");
  assert.equal(row.rate_source, "rails", "ruling 61: rails-attributed ledger rows stamp rate_source='rails'");
  assert.equal(row.source_attribution, "rails");
  assert.equal(row.acquisition_ref, providerCode);
  assert.equal(row.stripe_payment_ref, "pi_rails_pin");
  assert.equal(row.borne_by, "provider");
  assert.equal(Number(row.rate_as_resolved), resolution.rate!.platformRate);
  assert.equal(Number(row.amount), round2(SUBTOTAL * resolution.rate!.platformRate), "the amount is derived from the ROW, server-side");
  assert.equal(row.band_id, resolution.rate!.bandId, "a band-sourced rate names the band that produced it");
  assert.equal(row.idempotency_key, railsCommissionLedgerKey(bookingId));

  // THE WAIVER, VISIBLE. Migration 179 CHECKs `amount <> 0`, so the waiver is not a zero ROW — it is
  // a first-class fact-set on the rails event, with the band that priced it and the §13 flag.
  const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
  assert.equal(meta.travelerFeeWaived, true, "a waived traveler fee must be visible in the ledger with its reason");
  assert.equal(meta.travelerFeeWaiverBasis, "rails");
  assert.equal(Number(meta.travelerFeeWouldHaveBeen), resolution.travelerFeeWaiver!.wouldHaveBeenAmount);
  assert.equal(meta.travelerFeeBandKey, resolution.travelerFeeWaiver!.bandKey);
  assert.equal(meta.travelerFeeBilledOnDirectPathToday, false, "§13: the record must not claim money stopped moving");
  assert.equal(meta.frame, "story");

  // REPLAY — the webhook rescue, a re-drive, a double signal. Exactly one row, and the FIRST one.
  const replay = await recordRailsFeeLedger({ bookingIds: [bookingId], stripePaymentRef: "pi_rails_pin", actor: "promotion:webhook" });
  assert.equal(replay.inserted, 0, "a replayed fee event must land nothing");
  const after = await db.execute(sql`SELECT id, metadata->>'actor' AS actor FROM fee_ledger WHERE booking_id = ${bookingId}`);
  assert.equal(after.rows.length, 1, "one waiver, one commission event, no double-stamp");
  assert.equal((after.rows[0] as any).actor, "checkout", "the replay must not rewrite the first recorded fact (append-only)");
});

/** R8 — a provider may not discount their own take by booking through their own link. */
test("R8: self-referral is refused", async () => {
  const r = await resolveRailsForItem(itemArgs({ travelerUserId: providerId }));
  assert.equal(r.attributed, false);
  assert.equal(r.reason, "self_referral");
  assert.equal(r.rate, null);
});

/** R9 — the expert lane has no ruled rails variant, so it is refused rather than invented (§13). */
test("R9: a non-provider owner is refused, never given an invented expert rails rate", async () => {
  const r = await resolveRailsForItem(
    itemArgs({ ref: expertCode, serviceOwnerUserId: expertId, ownerRole: "travel_expert" }),
  );
  assert.equal(r.attributed, false);
  assert.equal(r.reason, "owner_not_provider_lane");
  assert.equal(r.rate, null);
  assert.equal(r.travelerFeeWaiver, null);
});

/** R10 — ruling 47: a negotiated entity rate outranks the band, and the waiver does NOT ride along. */
test("R10: an entity override outranks rails and carries no waiver", async () => {
  const band = await requireBand(BAND_UNDER_TEST);
  const overridePct = round2((1 - band.rate) * 100) - 5;
  await db.execute(sql`UPDATE users SET commission_override_expert_share_percent = ${overridePct} WHERE id = ${providerId}`);
  try {
    const r = await resolveRailsForItem(itemArgs());
    assert.equal(r.attributed, false, "an overridden provider is not on the rails lane");
    assert.equal(r.reason, "entity_override_outranks_rails");
    assert.equal(r.travelerFeeWaiver, null, "the waiver is a band-model concession and never rides an override");
  } finally {
    await db.execute(sql`UPDATE users SET commission_override_expert_share_percent = NULL WHERE id = ${providerId}`);
  }
});

/** R11 — the validator itself: a well-formed unknown code and a malformed token are distinguishable. */
test("R11: validateRailsRef is default-deny with an enumerated reason for every refusal", async () => {
  assert.equal((await validateRailsRef({ ref: null, travelerUserId: travelerId })).reason, "no_ref");
  assert.equal((await validateRailsRef({ ref: "   ", travelerUserId: travelerId })).reason, "no_ref");
  assert.equal((await validateRailsRef({ ref: "NOT A CODE!", travelerUserId: travelerId })).reason, "malformed_ref");
  assert.equal((await validateRailsRef({ ref: "aaaaaaaaaaaaaaaaaaaa", travelerUserId: travelerId })).reason, "malformed_ref");
  const ok = await validateRailsRef({ ref: providerCode.toUpperCase(), travelerUserId: travelerId });
  assert.equal(ok.valid, true, "the ref normalizes exactly as the mint/capture path does (lowercased, trimmed)");
});
