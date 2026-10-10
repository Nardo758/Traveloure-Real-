/**
 * SS-1b — the market-level official refresh, pure (ledger `2026-10-10-ss1b-official-refresh`).
 *
 *   OR1  eligibility: active, official, terms-checked, an interval, a ceiling and a buildable adapter — each refused by name
 *   OR2  due: never read ⇒ due; read less than one interval ago ⇒ not due; exactly one interval ⇒ due
 *   OR3  expiry: expires_at = verified_at + interval days, exactly
 *   OR4  ceiling: what is left of it; an unreadable meter and a missing ceiling are both ZERO
 *   OR5  the writer's refusal: unsourced, non-https, non-official, quote-less and off-target facts never pass
 *   OR6  anchors: a stop is a place_id; a station is its slug, placed ONLY by its own OSM node's point, with attribution
 *   OR7  a refresh fact is read as an official page read everywhere: tier, tags, publishability, feasibility admission
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitRefreshFact, refreshBudgetCents, refreshDue, refreshEligibleSource, refreshExpiresAt, refreshPlaceRef, stationPointValue } from "../official-refresh";
import { isConfirmableFact, isOfficialPublicFact, isPageReadOrigin, isPublishable, originTier } from "../content-facts";
import { placeFactTags } from "../content-tiers";
import { admitFeasibilityFact } from "../feasibility-facts";

const row = (over: Record<string, unknown> = {}) => ({
  id: "keihan", active: true, licenseClass: "official", termsCheckedAt: "2026-10-10T00:00:00Z",
  refreshIntervalDays: 30, costCeilingCentsPerDay: 25, adapter: "tavily_extract", ...over,
});

test("OR1 — eligibility, each refusal by name", () => {
  assert.deepEqual(refreshEligibleSource(row()), { ok: true });
  assert.deepEqual(refreshEligibleSource(row({ active: false })), { ok: false, reason: "inactive" });
  assert.deepEqual(refreshEligibleSource(row({ licenseClass: "editorial" })), { ok: false, reason: "not_official" });
  assert.deepEqual(refreshEligibleSource(row({ termsCheckedAt: null })), { ok: false, reason: "terms_unchecked" });
  assert.deepEqual(refreshEligibleSource(row({ refreshIntervalDays: null })), { ok: false, reason: "no_interval" });
  assert.deepEqual(refreshEligibleSource(row({ costCeilingCentsPerDay: null })), { ok: false, reason: "no_ceiling" });
  assert.deepEqual(refreshEligibleSource(row({ costCeilingCentsPerDay: 0 })), { ok: false, reason: "no_ceiling" });
  assert.deepEqual(refreshEligibleSource(row({ adapter: "api" })), { ok: false, reason: "adapter_not_built" });
});

test("OR2 — due", () => {
  const now = new Date("2026-11-10T03:00:00Z");
  assert.equal(refreshDue(null, 30, now), true);
  assert.equal(refreshDue("2026-10-20T03:00:00Z", 30, now), false);
  assert.equal(refreshDue("2026-10-11T03:00:00Z", 30, now), true);
});

test("OR3 — expiry is verified_at plus the interval", () => {
  const at = new Date("2026-10-10T12:00:00Z");
  assert.equal(refreshExpiresAt(at, 30).toISOString(), "2026-11-09T12:00:00.000Z");
});

test("OR4 — the ceiling", () => {
  assert.equal(refreshBudgetCents(25, 10), 15);
  assert.equal(refreshBudgetCents(25, 30), 0);
  assert.equal(refreshBudgetCents(25, null), 0, "unreadable meter = spent");
  assert.equal(refreshBudgetCents(null, 0), 0, "no ceiling = no spend");
});

test("OR5 — the writer's refusal", () => {
  const d = (over: Record<string, unknown> = {}) => ({
    origin: "official_refresh", sourceId: "keihan", sourceUrl: "https://www.keihan.co.jp/traffic/", license: "official",
    value: { text: "x", quote: "最終 0時20分" }, ...over,
  });
  assert.deepEqual(admitRefreshFact(d()), { ok: true });
  assert.deepEqual(admitRefreshFact(d({ sourceId: null })), { ok: false, reason: "no_source" });
  assert.deepEqual(admitRefreshFact(d({ sourceUrl: null })), { ok: false, reason: "no_official_url" });
  assert.deepEqual(admitRefreshFact(d({ sourceUrl: "http://www.keihan.co.jp/" })), { ok: false, reason: "no_official_url" });
  assert.deepEqual(admitRefreshFact(d({ license: "editorial" })), { ok: false, reason: "not_official" });
  assert.deepEqual(admitRefreshFact(d({ value: { text: "x" } })), { ok: false, reason: "no_quote" });
  assert.deepEqual(admitRefreshFact(d(), { sourceId: "keihan", url: "https://www.keihan.co.jp/other/" }), { ok: false, reason: "off_target" });
  assert.deepEqual(admitRefreshFact(d({ origin: "crawled" })), { ok: false, reason: "not_refresh_origin" });
  // A coordinate is only ever an attributed OSM node's.
  assert.deepEqual(admitRefreshFact(d({ placeLat: 35, placeLng: 135 })), { ok: false, reason: "unattributed_point" });
  assert.deepEqual(admitRefreshFact(d({ placeLat: 35, placeLng: 135, value: { text: "x", quote: "q", point: { provider: "google", osmNodeId: 1, attribution: "x" } } })), { ok: false, reason: "unattributed_point" });
  assert.deepEqual(
    admitRefreshFact(d({ placeLat: 35, placeLng: 135, value: { text: "x", quote: "q", ...stationPointValue({ lat: 35, lng: 135, osmNodeId: 42, matchedName: "Gion-Shijo", attribution: "© OpenStreetMap contributors" }) } })),
    { ok: true },
  );
});

test("OR6 — anchors", () => {
  assert.deepEqual(refreshPlaceRef({ kind: "place", placeId: "ChIJabc1234567" }), { placeRefKind: "place_id", placeRef: "ChIJabc1234567", placeLat: null, placeLng: null });
  const st = { kind: "station" as const, stationSlug: "gion-shijo", osmNodeId: 42 };
  assert.deepEqual(refreshPlaceRef(st), { placeRefKind: "free_text", placeRef: "station:gion-shijo", placeLat: null, placeLng: null }, "unresolved ⇒ no coordinate");
  const pt = { lat: 35.0037, lng: 135.7722, osmNodeId: 42, matchedName: "Gion-Shijo", attribution: "© OpenStreetMap contributors" };
  assert.deepEqual(refreshPlaceRef(st, pt), { placeRefKind: "free_text", placeRef: "station:gion-shijo", placeLat: 35.0037, placeLng: 135.7722 });
  assert.equal(refreshPlaceRef(st, { ...pt, osmNodeId: 43 }).placeLat, null, "another node's point is never used");
  assert.equal(refreshPlaceRef({ kind: "place", placeId: "ChIJabc1234567" }, pt).placeLat, null, "a stop carries no coordinate");
  assert.deepEqual(stationPointValue(pt), { point: { provider: "openstreetmap", osmNodeId: 42, matchedName: "Gion-Shijo", attribution: "© OpenStreetMap contributors" } });
});

test("OR7 — a refresh fact is an official page read everywhere", () => {
  assert.equal(isPageReadOrigin("official_refresh"), true);
  assert.equal(originTier("official_refresh"), originTier("crawled"));
  assert.deepEqual(placeFactTags("official_refresh", "official", "hours"), placeFactTags("crawled", "official", "hours"));
  assert.deepEqual(placeFactTags("official_refresh", "official", "last_service"), { sourceClass: "public", reuseClass: "link_only" });
  const pub = { origin: "official_refresh", license: "official", factType: "hours", sourceLicenseClass: "official", sourcePublicOk: true };
  assert.equal(isOfficialPublicFact(pub), true);
  assert.equal(isPublishable(pub), true);
  assert.equal(isPublishable({ ...pub, sourcePublicOk: null }), false, "public only when the source is public_ok");
  assert.equal(isConfirmableFact({ origin: "official_refresh", license: "official", verifiedAt: "2026-10-10" }), false, "kept current by its interval, never frozen into a nugget");
  assert.deepEqual(
    admitFeasibilityFact({ factType: "last_admission", value: { byWeekday: { "1": "16:30" }, quote: "Last admission 16:30" }, origin: "official_refresh", license: "official", sourceUrl: "https://kyoto.travel/x" }),
    { ok: true },
  );
});
