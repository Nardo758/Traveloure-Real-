/**
 * TC-2 Phase 1 (decision-maker, Oct 12, 2026; ledger `2026-10-12-tc2-affiliate-legs`) — the route map, pure.
 * City points here are TEST FIXTURES (the production config waits for the OSM node reads).
 *
 *   TA1 inside one city ⇒ nothing (Kyoto → Arashiyama is served by 12Go and must not show)
 *   TA2 Kyoto → Osaka ⇒ 12Go, the clean path with the plan's date; reversed direction is not a listed pair
 *   TA3 KIX → Kyoto ⇒ Kiwitaxi first, then 12Go; the class from the party size
 *   TA4 ITM → Kyoto ⇒ Kiwitaxi only (no 12Go pair leaves ITM); the Itami path
 *   TA5 a city whose OSM node is not read is left out — no option, never a guessed centre
 *   TA6 the redirect wraps the clean target with our marker; no https template or no {url} ⇒ nothing
 *   TA7 ACCEPTANCE: the ordering function takes no fee, margin or commission input (signature and inputs)
 *   TA8 the production config: classes, the two Kiwitaxi paths (clean), both airports' 12Go slugs, the sanctioned radii
 *
 * Run: npx tsx --test shared/__tests__/tc2-transport-affiliate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  distanceKm,
  kiwitaxiClassFor,
  kiwitaxiClassLine,
  legEndOf,
  orderAffiliateLegOptions,
  plannedAffiliateOptions,
  wrapAffiliateRedirect,
  type TransportAffiliateConfig,
} from "../transport-affiliate";
import { TRANSPORT_AFFILIATE_CONFIG as PROD } from "../../server/config/transport-affiliate.config";

const KYOTO = { lat: 35.0116, lng: 135.7681 };
const OSAKA = { lat: 34.6937, lng: 135.5023 };
const NARA = { lat: 34.6851, lng: 135.8048 };
const ARASHIYAMA = { lat: 35.0094, lng: 135.6668 };
const KYOTO_STATION = { lat: 34.9858, lng: 135.7588 };
const KIX = { lat: 34.4273, lng: 135.244 };
const ITM = { lat: 34.7809, lng: 135.4408 };

const cfg: TransportAffiliateConfig = {
  ...PROD,
  cities: [
    { key: "kyoto", name: "Kyoto", twelveGoSlug: "kyoto", osmNodeId: 1, point: KYOTO, radiusKm: 15 },
    { key: "osaka", name: "Osaka", twelveGoSlug: "osaka", osmNodeId: 2, point: OSAKA, radiusKm: 15 },
    { key: "nara", name: "Nara", twelveGoSlug: "nara", osmNodeId: 3, point: NARA, radiusKm: 8 },
  ],
  airports: [
    { iata: "KIX", point: KIX, radiusKm: 3, twelveGoSlug: "kansai-fixture" },
    { iata: "ITM", point: ITM, radiusKm: 3, twelveGoSlug: "osaka-airport" },
  ],
};

test("TA1 inside one city offers nothing, even a served pair", () => {
  assert.deepEqual(legEndOf(ARASHIYAMA, cfg), { kind: "city", key: "kyoto" }, "Kyoto's 15 km contains Arashiyama");
  assert.deepEqual(legEndOf(NARA, cfg), { kind: "city", key: "nara" }, "and not Nara");
  assert.ok(distanceKm(KYOTO, NARA) > 15);
  assert.deepEqual(plannedAffiliateOptions({ from: KYOTO_STATION, to: ARASHIYAMA, party: 2, dateIso: "2026-11-12" }, cfg), []);
});

test("TA2 Kyoto → Osaka offers 12Go on the clean path with the plan's date", () => {
  const [o, ...rest] = plannedAffiliateOptions({ from: KYOTO_STATION, to: OSAKA, party: 2, dateIso: "2026-11-12" }, cfg);
  assert.equal(rest.length, 0);
  assert.equal(o.partnerKey, "12go");
  assert.equal(o.targetUrl, "https://12go.asia/en/travel/kyoto/osaka?date=2026-11-12");
  assert.equal(plannedAffiliateOptions({ from: KYOTO_STATION, to: OSAKA, party: 2, dateIso: null }, cfg)[0].targetUrl, "https://12go.asia/en/travel/kyoto/osaka", "no chosen dates ⇒ no date sent");
  assert.deepEqual(plannedAffiliateOptions({ from: OSAKA, to: KYOTO_STATION, party: 2, dateIso: null }, cfg), [], "only listed directions");
});

test("TA3 KIX → Kyoto: Kiwitaxi first, then 12Go; the class from the party size", () => {
  const planned = plannedAffiliateOptions({ from: KIX, to: KYOTO_STATION, party: 2, dateIso: null }, cfg);
  const ordered = orderAffiliateLegOptions(planned);
  assert.deepEqual(ordered.map((o) => o.partnerKey), ["kiwitaxi", "12go"]);
  assert.equal(ordered[0].targetUrl, "https://kiwitaxi.com/en/japan/kansai-airport-kyoto-train-station");
  assert.deepEqual(kiwitaxiClassFor(2, cfg.kiwitaxiClasses), { kind: "class", cls: { name: "Comfort", passengers: 4, bags: 3 } });
  assert.equal((kiwitaxiClassFor(5, cfg.kiwitaxiClasses) as any).cls.name, "Minibus 7PAX");
  assert.equal((kiwitaxiClassFor(7, cfg.kiwitaxiClasses) as any).cls.name, "Minibus 7PAX");
  assert.deepEqual(kiwitaxiClassFor(8, cfg.kiwitaxiClasses), { kind: "over_largest" });
  assert.deepEqual(kiwitaxiClassFor(undefined, cfg.kiwitaxiClasses), { kind: "party_unknown" });
  assert.equal(kiwitaxiClassLine({ kind: "party_unknown" }, cfg.kiwitaxiBagNote), "Set your party size to see which car fits");
  assert.equal(kiwitaxiClassLine({ kind: "over_largest" }, cfg.kiwitaxiBagNote), null, "over the largest ⇒ the link, no class");
  assert.equal(kiwitaxiClassLine(kiwitaxiClassFor(2, cfg.kiwitaxiClasses), cfg.kiwitaxiBagNote), "Comfort fits your party · up to 4 passengers, 3 bags (a bag is a standard piece up to 158 cm)");
});

test("TA4 ITM → Kyoto offers Kiwitaxi only, on the Itami path", () => {
  const planned = plannedAffiliateOptions({ from: ITM, to: KYOTO_STATION, party: 3, dateIso: null }, cfg);
  assert.deepEqual(planned.map((o) => o.partnerKey), ["kiwitaxi"]);
  assert.equal(planned[0].targetUrl, "https://kiwitaxi.com/en/japan/itami-airport-kyoto-train-station");
  assert.deepEqual(legEndOf(ITM, cfg), { kind: "airport", key: "ITM" }, "an airport inside Osaka's radius is still the airport");
});

test("TA5 a city whose OSM node is not read is left out", () => {
  const unread: TransportAffiliateConfig = { ...cfg, cities: cfg.cities.map((c) => (c.key === "osaka" ? { ...c, osmNodeId: null } : c)) };
  assert.equal(legEndOf(OSAKA, unread), null);
  assert.deepEqual(plannedAffiliateOptions({ from: KYOTO_STATION, to: OSAKA, party: 2, dateIso: null }, unread), []);
  assert.deepEqual(plannedAffiliateOptions({ from: KYOTO_STATION, to: OSAKA, party: 2, dateIso: null }, PROD), [], "production waits for the node reads");
});

test("TA6 the redirect wraps the clean target with our marker", () => {
  const url = wrapAffiliateRedirect("https://tp.media/r?marker={marker}&p=1&u={url}", "405110", "https://kiwitaxi.com/en/japan/kansai-airport-kyoto-train-station");
  assert.equal(url, "https://tp.media/r?marker=405110&p=1&u=https%3A%2F%2Fkiwitaxi.com%2Fen%2Fjapan%2Fkansai-airport-kyoto-train-station");
  assert.doesNotMatch(url!, /ref=sf/);
  assert.equal(wrapAffiliateRedirect("http://tp.media/r?u={url}", "405110", "https://x.test/"), null, "https only");
  assert.equal(wrapAffiliateRedirect("https://tp.media/r?marker={marker}", "405110", "https://x.test/"), null, "{url} required");
  assert.equal(wrapAffiliateRedirect(null, "405110", "https://x.test/"), null);
});

test("TA7 ACCEPTANCE: the ordering function takes no fee, margin or commission input", () => {
  // Signature: one argument, a list of AffiliateOrderInput.
  assert.equal(orderAffiliateLegOptions.length, 1);
  const src = readFileSync(new URL("../transport-affiliate.ts", import.meta.url), "utf8");
  const iface = src.slice(src.indexOf("export interface AffiliateOrderInput"), src.indexOf("}", src.indexOf("export interface AffiliateOrderInput")) + 1);
  const keys = Array.from(iface.matchAll(/^\s+(\w+)\??:/gm)).map((m) => m[1]);
  assert.deepEqual(keys.sort(), ["airportLeg", "partnerKey"], "the order reads only these inputs");
  const fn = src.slice(src.indexOf("export function orderAffiliateLegOptions"), src.indexOf("\n}\n", src.indexOf("export function orderAffiliateLegOptions")));
  assert.doesNotMatch(iface + fn, /fee|margin|commission|rate|price|revenue/i, "no money input reaches the order");
  assert.match(fn, /<T extends AffiliateOrderInput>\(options: readonly T\[\]\)/);
});

test("TA8 the production config as read", () => {
  assert.deepEqual(PROD.kiwitaxiClasses, [
    { name: "Comfort", passengers: 4, bags: 3 },
    { name: "Minivan 4PAX", passengers: 4, bags: 4 },
    { name: "Minibus 7PAX", passengers: 7, bags: 7 },
  ]);
  assert.deepEqual(PROD.kiwitaxiRoutes.map((r) => r.path), ["/en/japan/kansai-airport-kyoto-train-station", "/en/japan/itami-airport-kyoto-train-station"]);
  for (const r of PROD.kiwitaxiRoutes) assert.doesNotMatch(r.path, /[?#]/, "the clean path, never ?ref=sf");
  assert.equal(PROD.airports.find((a) => a.iata === "ITM")?.twelveGoSlug, "osaka-airport");
  assert.equal(PROD.airports.find((a) => a.iata === "KIX")?.twelveGoSlug, "kansai-airport", "Chrome's coverage read");
  assert.deepEqual(Object.fromEntries(PROD.cities.map((c) => [c.key, c.radiusKm])),
    { kyoto: 15, osaka: 15, nara: 8, tokyo: 25, kanazawa: 10, hiroshima: 12 }, "the sanctioned radii");
  for (const a of PROD.airports) assert.equal(a.radiusKm, 3);
  assert.ok(!PROD.twelveGoPairs.some((p) => p.from === "ITM"), "ITM's 12Go row is a taxi only");
  assert.ok(!PROD.cities.some((c) => c.key === "kinosaki"));
});
