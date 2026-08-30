/**
 * FEE RESOLVER AUTHORITY + STRUCTURE-C RESOLUTION PINS (fee-ledger lane, 1A4/1G).
 *
 * The load-bearing pin is A1: **edit a band rate → the next resolution reflects it, with no service
 * row touched.** That is ruling 32's proof ("an admin band edit changes the resolved value"), which
 * audit C2/Q9 proved was DEFEATED — a per-service `revenue_share_rate` snapshot was the first
 * operand at payments.routes.ts:826/877/1090, so band edits could not reach the charge. This pin
 * fails on the day anyone reintroduces a rate that outranks `fee_bands`.
 *
 * NO LITERALS (ruling 32): every expectation is computed from a `fee_bands` READ. The tests assert
 * relationships and provenance, never hardcoded rates — so re-pricing a band is not a test edit.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  resolveProviderRate,
  resolveTravelerServiceFee,
  requireBand,
  readBand,
  BandResolutionError,
  PROVIDER_RAILS_BAND,
  TRAVELER_SERVICE_FEE_BAND,
  round2,
} from "../services/fee-resolution.service";
// 1C (ruling 69 disposition 6) — the direct charge lane's entry points. They delegate to the same
// `resolveProviderRate` above; these pins prove the delegation, the precedence and the refusals.
import {
  resolveDirectProviderRate,
  pickOwnerShareRate,
} from "../services/direct-charge-rate.service";

const SUFFIX = `feeres-${process.pid}`;
let categoryId: string;
let providerId: string;
let originalRate: number;
let bandKeyUnderTest: string;

before(async () => {
  // A category on a real band — the D1 path. `moderate` is used only as a STARTING POINT; every
  // expectation below re-reads whatever rate the band actually holds.
  bandKeyUnderTest = "moderate";
  const band = await requireBand(bandKeyUnderTest);
  originalRate = band.rate;

  const cat = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"zz-" + SUFFIX}, ${"zz-" + SUFFIX}, ${bandKeyUnderTest})
    RETURNING id
  `);
  categoryId = String((cat.rows[0] as any).id);

  const usr = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "@traveloure.test"}, 'service_provider')
    RETURNING id
  `);
  providerId = String((usr.rows[0] as any).id);
});

after(async () => {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${originalRate} WHERE band_key = ${bandKeyUnderTest}`);
  await db.execute(sql`DELETE FROM service_categories WHERE id = ${categoryId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${providerId}`);
});

/**
 * A1 — RESOLVER AUTHORITY. Ruling 32's proof, restored and pinned.
 * Edit the band rate; the next resolution must reflect it WITHOUT any service/category row change.
 */
test("A1: an admin band edit changes the resolved rate, with no service-row touch", async () => {
  const before = await resolveProviderRate({ categoryId });
  const bandBefore = await requireBand(bandKeyUnderTest);
  assert.equal(before.platformRate, bandBefore.rate, "resolution must equal the band's current rate");
  assert.equal(before.rateSource, "band");
  assert.equal(before.bandId, bandBefore.id, "a band-sourced rate must name its band");

  // The only mutation: the band row. Nothing on the category, nothing on any service.
  const edited = round2(bandBefore.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${edited} WHERE band_key = ${bandKeyUnderTest}`);

  const after = await resolveProviderRate({ categoryId });
  assert.equal(after.platformRate, edited, "the band edit must reach the next resolution");
  assert.notEqual(after.platformRate, before.platformRate, "the rate must actually have moved");
});

/** A2 — the provider share is the complement of the platform take, from the band. */
test("A2: providerShareRate is 1 - platformRate, band-derived", async () => {
  const r = await resolveProviderRate({ categoryId });
  const band = await requireBand(bandKeyUnderTest);
  assert.equal(r.platformRate, band.rate);
  assert.equal(round2(r.providerShareRate + r.platformRate), 1);
});

/**
 * A3 — RAILS IS min(category band, rails). The direction matters: rails must never RAISE a premium
 * provider's rate. Asserted against live band reads, both directions.
 */
test("A3: rails resolves as min(category band, provider_rails) and never raises the rate", async () => {
  const rails = await requireBand(PROVIDER_RAILS_BAND);

  // Case 1: category band ABOVE rails → rails wins.
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 2)} WHERE band_key = ${bandKeyUnderTest}`);
  const dear = await resolveProviderRate({ categoryId, isRails: true });
  assert.equal(dear.platformRate, rails.rate, "rails must win when the category band is higher");
  assert.equal(dear.rateSource, "rails");

  // Case 2: category band BELOW rails (the premium case) → the category band survives.
  const cheaper = round2(rails.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${cheaper} WHERE band_key = ${bandKeyUnderTest}`);
  const premium = await resolveProviderRate({ categoryId, isRails: true });
  assert.equal(premium.platformRate, cheaper, "rails must NOT raise a cheaper (premium) provider's rate");
  assert.ok(premium.platformRate <= rails.rate);
  assert.equal(premium.rateSource, "band");
});

/** A4 — rails waives the traveler service fee (D1); a platform-sourced booking does not. */
test("A4: rails waives the traveler service fee, platform-sourced does not", async () => {
  const railsRate = await resolveProviderRate({ categoryId, isRails: true });
  assert.equal(railsRate.travelerFeeWaived, true);
  const waived = await resolveTravelerServiceFee(100, { waived: railsRate.travelerFeeWaived });
  assert.equal(waived.amount, 0);
  assert.equal(waived.waived, true);

  const direct = await resolveProviderRate({ categoryId, isRails: false });
  assert.equal(direct.travelerFeeWaived, false);
  const charged = await resolveTravelerServiceFee(100, { waived: direct.travelerFeeWaived });
  assert.ok(charged.amount > 0, "a platform-sourced booking must carry the service fee");
});

/**
 * A5 — the traveler-fee CAP comes from the band row, not from code. Asserted by reading
 * `max_amount` and probing either side of it.
 */
test("A5: the traveler service fee is capped by fee_bands.max_amount, not by a constant", async () => {
  const band = await requireBand(TRAVELER_SERVICE_FEE_BAND);
  assert.ok(band.maxAmount !== null, "the traveler fee band must carry its cap as data (D1)");
  const cap = band.maxAmount as number;

  // Just under the cap: uncapped, proportional to the band rate.
  const underSubtotal = round2((cap / band.rate) * 0.5);
  const under = await resolveTravelerServiceFee(underSubtotal);
  assert.equal(under.capApplied, false);
  assert.equal(under.amount, round2(underSubtotal * band.rate));

  // Far above the cap: clamped exactly to the band's max_amount.
  const overSubtotal = round2((cap / band.rate) * 4);
  const over = await resolveTravelerServiceFee(overSubtotal);
  assert.equal(over.capApplied, true);
  assert.equal(over.amount, cap, "the amount must clamp to the band's max_amount");
});

/**
 * A6 — C2 REGRESSION PIN. A provider-service booking resolves its CATEGORY band — not
 * `expert_standard`, and not any per-service snapshot. This is the audit finding, pinned.
 */
test("A6 (C2 regression): a provider service resolves its category band, not expert_standard", async () => {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${originalRate} WHERE band_key = ${bandKeyUnderTest}`);
  const resolved = await resolveProviderRate({ categoryId, providerId });
  const categoryBand = await requireBand(bandKeyUnderTest);
  const expertStandard = await readBand("expert_standard");

  assert.equal(resolved.bandKey, bandKeyUnderTest, "must resolve the category's own band");
  assert.equal(resolved.platformRate, categoryBand.rate);
  if (expertStandard && expertStandard.rate !== categoryBand.rate) {
    assert.notEqual(resolved.platformRate, expertStandard.rate, "must NOT fall through to expert_standard");
  }
});

/** A7 — an entity override wins, but is stamped as provenance with NO band attributed (D0). */
test("A7: a per-entity override is honored and stamped entity_override with a null band", async () => {
  const band = await requireBand(bandKeyUnderTest);
  const overridePct = round2((1 - band.rate) * 100) - 5; // a share distinctly different from the band's
  await db.execute(sql`UPDATE users SET commission_override_expert_share_percent = ${overridePct} WHERE id = ${providerId}`);
  try {
    const r = await resolveProviderRate({ categoryId, providerId });
    assert.equal(r.rateSource, "entity_override");
    assert.equal(r.bandId, null, "an overridden rate must not be attributed to a band that did not produce it");
    assert.equal(r.providerShareRate, overridePct / 100);
  } finally {
    await db.execute(sql`UPDATE users SET commission_override_expert_share_percent = NULL WHERE id = ${providerId}`);
  }
});

/**
 * A9 — D6 (ruling 61): `isRails` SELECTS A LANE, IT DOES NOT CARRY A RATE.
 *
 * The attribution chain now has a caller (`rails-attribution.service.ts`), which makes the direction
 * of authority load-bearing: the ONLY thing an attributed booking contributes is the boolean, and
 * the number behind it must still come from `fee_bands`. Same shape as A1, one lane over — edit the
 * `provider_rails` band and the next rails resolution must reflect it, with nothing else touched.
 * This fails the day anyone lets an attribution input supply, cache or snapshot a rails rate.
 */
test("A9: the rails rate is band-resolved — an admin edit to provider_rails reaches the next rails resolution", async () => {
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  // Category band well ABOVE rails, so min() selects rails in both resolutions below.
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 3)} WHERE band_key = ${bandKeyUnderTest}`);

  const before = await resolveProviderRate({ categoryId, isRails: true });
  assert.equal(before.platformRate, rails.rate, "the rails lane must resolve the rails band, not a constant");
  assert.equal(before.rateSource, "rails");
  assert.equal(before.bandId, rails.id, "a rails-sourced rate must name the band that produced it");

  const edited = round2(rails.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${edited} WHERE band_key = ${PROVIDER_RAILS_BAND}`);
  try {
    const after = await resolveProviderRate({ categoryId, isRails: true });
    assert.equal(after.platformRate, edited, "the band edit must reach the next rails resolution");
    assert.notEqual(after.platformRate, before.platformRate, "the rails rate must actually have moved");
    assert.equal(after.travelerFeeWaived, true, "the waiver belongs to the LANE and survives a re-priced band");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${rails.rate} WHERE band_key = ${PROVIDER_RAILS_BAND}`);
  }
});

/** A8 — FAIL-LOUD (R2/D0). No silent fallback rate, ever. */
test("A8: a category with no band throws rather than falling back to a default rate", async () => {
  const orphan = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"zz-orphan-" + SUFFIX}, ${"zz-orphan-" + SUFFIX}, ${bandKeyUnderTest})
    RETURNING id
  `);
  const orphanId = String((orphan.rows[0] as any).id);
  // Bypass the R2 NOT NULL the same way a breached guard would: drop it for this row only, then
  // restore. This proves the resolver's behaviour if the guard is ever defeated.
  await db.execute(sql`ALTER TABLE service_categories ALTER COLUMN commission_band_key DROP NOT NULL`);
  try {
    await db.execute(sql`UPDATE service_categories SET commission_band_key = NULL WHERE id = ${orphanId}`);
    await assert.rejects(
      () => resolveProviderRate({ categoryId: orphanId }),
      (e: unknown) => e instanceof BandResolutionError,
      "a bandless category must throw, never resolve to a fallback",
    );
  } finally {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${orphanId}`);
    await db.execute(sql`ALTER TABLE service_categories ALTER COLUMN commission_band_key SET NOT NULL`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1C — THE DIRECT CHARGE PATH (docs/DECISIONS.md ruling 69 disposition 6).
//
// Ruling 68 §5 recorded the gap in its own words: a rails booking was the FIRST charge path to
// price through this resolver, while a DIRECT provider booking still resolved the legacy
// `expert_standard` lane — "cheaper for TWO reasons at once". These pins are the proof the second
// reason is gone: the direct lane now reaches the SAME resolver, so `fee_bands` is the authority on
// every provider charge path and A1's band-edit proof holds for a direct booking too.
//
// NEGATIVE SPACE (ruling 43): these pin RESOLUTION on the direct lane, not the charge. They say
// nothing about whether `/api/checkout` writes what it resolved (that is the checkout's own
// suites), and nothing about the D3 traveler fee, which disposition 6 deliberately does NOT start
// billing on the direct path.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A10 — A1's proof, on the DIRECT lane. Edit the band; the next DIRECT resolution reflects it,
 * with no service row and no category row touched. This is the assertion that fails on the day
 * anyone repoints the direct path back onto a legacy band or a per-service snapshot.
 */
test("A10 (1C): a direct provider line's rate provably comes from fee_bands — a band edit moves it", async () => {
  const bandBefore = await requireBand(bandKeyUnderTest);
  const before = await resolveDirectProviderRate({
    serviceOwnerUserId: providerId,
    ownerRole: "service_provider",
    categoryId,
  });
  assert.equal(before.resolved, true, "a provider-owned, categorised line must resolve on the direct lane");
  assert.equal(before.rate!.platformRate, bandBefore.rate, "the direct rate must equal the band's current rate");
  assert.equal(before.rate!.rateSource, "band");
  assert.equal(before.rate!.bandId, bandBefore.id, "a band-sourced direct rate must name its band");

  // The ONLY mutation: the band row.
  const edited = round2(bandBefore.rate / 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${edited} WHERE band_key = ${bandKeyUnderTest}`);
  try {
    const after = await resolveDirectProviderRate({
      serviceOwnerUserId: providerId,
      ownerRole: "service_provider",
      categoryId,
    });
    assert.equal(after.rate!.platformRate, edited, "the band edit must reach the next DIRECT resolution");
    assert.notEqual(after.rate!.platformRate, before.rate!.platformRate, "the direct rate must actually have moved");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${bandBefore.rate} WHERE band_key = ${bandKeyUnderTest}`);
  }
});

/**
 * A11 — THE CONSEQUENCE RULING 68 §5 NAMED, CLOSED. On the SAME service, a rails booking and a
 * direct booking may now differ ONLY by ruling 48's two rails concessions — the min() and the
 * traveler-fee waiver. Both directions are asserted, because the premium case is where "only the
 * waiver differs" becomes literally true.
 */
test("A11 (1C): rails and direct on the same service differ ONLY by the rails min() and the waiver", async () => {
  const rails = await requireBand(PROVIDER_RAILS_BAND);
  const original = (await requireBand(bandKeyUnderTest)).rate;
  try {
    // Case 1 — category band ABOVE rails: rails wins by min(), and it waives. The direct lane is
    // the category band. The gap is exactly the min(), never a legacy band.
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${round2(rails.rate * 2)} WHERE band_key = ${bandKeyUnderTest}`);
    const dearBand = await requireBand(bandKeyUnderTest);
    const directDear = await resolveDirectProviderRate({
      serviceOwnerUserId: providerId, ownerRole: "service_provider", categoryId,
    });
    const railsDear = await resolveProviderRate({ categoryId, providerId, isRails: true });
    assert.equal(directDear.rate!.platformRate, dearBand.rate, "direct must charge the CATEGORY band");
    assert.equal(railsDear.platformRate, rails.rate, "rails must charge the rails band when it is lower");
    assert.ok(railsDear.platformRate < directDear.rate!.platformRate, "the only gap is the min()");
    assert.equal(railsDear.travelerFeeWaived, true);

    // Case 2 — PREMIUM: category band BELOW rails. min() keeps the category band, so the two lanes
    // resolve the IDENTICAL rate from the IDENTICAL band and the waiver is the whole difference.
    const cheaper = round2(rails.rate / 2);
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${cheaper} WHERE band_key = ${bandKeyUnderTest}`);
    const directPremium = await resolveDirectProviderRate({
      serviceOwnerUserId: providerId, ownerRole: "service_provider", categoryId,
    });
    const railsPremium = await resolveProviderRate({ categoryId, providerId, isRails: true });
    assert.equal(directPremium.rate!.platformRate, cheaper);
    assert.equal(railsPremium.platformRate, directPremium.rate!.platformRate, "premium: the rates must be identical");
    assert.equal(railsPremium.bandId, directPremium.rate!.bandId, "premium: the SAME band produced both");
    const directWaiver = await resolveTravelerServiceFee(100, { waived: false });
    const railsWaiver = await resolveTravelerServiceFee(100, { waived: railsPremium.travelerFeeWaived });
    assert.equal(railsWaiver.amount, 0, "rails waives");
    assert.ok(directWaiver.amount > 0, "direct does not");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${original} WHERE band_key = ${bandKeyUnderTest}`);
  }
});

/**
 * A12 — THE SNAPSHOT IS OUTRANKED ON THE DIRECT PATH TOO. Ruling 47 dethroned
 * `provider_services.revenue_share_rate` as a first operand; until 1C that only held on the rails
 * lane. `pickOwnerShareRate` is the ONE precedence every quote and charge surface reads, so this
 * pin covers all four of them at once.
 */
test("A12 (1C): the per-service revenueShareRate snapshot never outranks a resolved direct band", async () => {
  const direct = await resolveDirectProviderRate({
    serviceOwnerUserId: providerId, ownerRole: "service_provider", categoryId,
  });
  assert.equal(direct.resolved, true);
  // A deliberately absurd snapshot — the shape audit C2/Q9 described (a stale row winning).
  const STALE_SNAPSHOT_SHARE = 0.999;
  const picked = pickOwnerShareRate({ railsShareRate: null, direct, legacyShareRate: STALE_SNAPSHOT_SHARE });
  assert.equal(picked.lane, "direct_band", "a resolved direct band must win the precedence");
  assert.equal(picked.shareRate, direct.rate!.providerShareRate, "the band's share, not the snapshot's");
  assert.notEqual(picked.shareRate, STALE_SNAPSHOT_SHARE);

  // …and rails still outranks the direct band (ruling 61 unchanged by 1C).
  const railsPicked = pickOwnerShareRate({ railsShareRate: 0.5, direct, legacyShareRate: STALE_SNAPSHOT_SHARE });
  assert.equal(railsPicked.lane, "rails");
  assert.equal(railsPicked.shareRate, 0.5);
});

/**
 * A13 — THE DIRECT LANE REFUSES, IT NEVER THROWS. A8 pins that the resolver is fail-loud; on the
 * DIRECT lane there is no optional discount to decline — a throw would be the CHARGE failing. So a
 * breached band guard degrades to the incumbent legacy share with an enumerated reason, and an
 * expert-owned line is refused rather than silently re-banded onto the provider model.
 */
test("A13 (1C): an expert-lane owner and a breached band guard both REFUSE, leaving the legacy share", async () => {
  const LEGACY = 0.75;

  const expertLine = await resolveDirectProviderRate({
    serviceOwnerUserId: providerId, ownerRole: "expert", categoryId,
  });
  assert.equal(expertLine.resolved, false);
  assert.equal(expertLine.reason, "not_provider_lane", "no ruling gives the expert model a category-band variant");
  assert.equal(pickOwnerShareRate({ direct: expertLine, legacyShareRate: LEGACY }).lane, "legacy");

  const noCategory = await resolveDirectProviderRate({
    serviceOwnerUserId: providerId, ownerRole: "service_provider", categoryId: null,
  });
  assert.equal(noCategory.reason, "no_category");

  const noOwner = await resolveDirectProviderRate({
    serviceOwnerUserId: null, ownerRole: "service_provider", categoryId,
  });
  assert.equal(noOwner.reason, "no_service_owner");

  // A breached R1/R2 guard: the same defeated-NOT-NULL construction A8 uses. The resolver throws;
  // the direct lane must catch it and leave the incumbent rate standing.
  const orphan = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"zz-1c-" + SUFFIX}, ${"zz-1c-" + SUFFIX}, ${bandKeyUnderTest})
    RETURNING id
  `);
  const orphanId = String((orphan.rows[0] as any).id);
  await db.execute(sql`ALTER TABLE service_categories ALTER COLUMN commission_band_key DROP NOT NULL`);
  try {
    await db.execute(sql`UPDATE service_categories SET commission_band_key = NULL WHERE id = ${orphanId}`);
    const breached = await resolveDirectProviderRate({
      serviceOwnerUserId: providerId, ownerRole: "service_provider", categoryId: orphanId,
    });
    assert.equal(breached.resolved, false, "a breached guard must not price the line");
    assert.equal(breached.reason, "band_unresolvable");
    const picked = pickOwnerShareRate({ direct: breached, legacyShareRate: LEGACY });
    assert.equal(picked.lane, "legacy", "the incumbent rate stands — a purchase is never the casualty");
    assert.equal(picked.shareRate, LEGACY);
  } finally {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${orphanId}`);
    await db.execute(sql`ALTER TABLE service_categories ALTER COLUMN commission_band_key SET NOT NULL`);
  }
});
