/**
 * STEP 8b-2 — THE MAP LAYOUT OF THE PLAN (ledger `2026-10-06-step8b2-map-layout`; step 8 brief rev 3.1,
 * items 9–21 and the 8b-2 gates; rulings 1–12 of the Phase 0 go).
 *
 *   M1  an add from Browse goes to the SHOWN day through the one item rail's body
 *   M2  an unlocated item, and a blurred (approximate) listing, produce no map mark
 *   M3  Budget never matches a hidden, missing, quote-only, range or non-USD price, and counts them
 *   M4  the five tabs: Activities = activity_provider + tour_guide; Services excludes the aff_* keys;
 *       a partner place with no category text stays out
 *   M5  the "$N" defect: a hidden or quote-only listing reads "By quote"; a stated unit is shown
 *   M6  day chips come from the trip's own dates; no dates ⇒ a single Day 1; items keep their days
 *   M7  landing (D4): `ai` from any door, and `myself` from the experiences door, open the map
 *   M8  the free-draft button is absent on a plan that holds anything
 *   M9  the sign-in record: one hour, read ONCE and cleared BEFORE the plan is created, so a reload
 *       after sign-in replays nothing (exactly one plan)
 *   M10 the two binding mount counts are unchanged, and the band's pieces are the rail's own
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AFFILIATE_SOURCE_KEYS,
  BROWSE_TABS,
  applyBudget,
  browseAddBody,
  listingPlaces,
  partnerPlaces,
  placesInTab,
  searchPlaces,
} from "../browse-supply";
import { buildMapScene } from "../map-scene";
import { mapDayChips, tripWindowDayCount } from "../map-days";
import { opensOnMap, planLandingPath } from "../plan-landing";
import { slipBuildAiAction } from "../slip-rail";
import {
  PENDING_PLAN_RECORD_KEY,
  PENDING_PLAN_RECORD_TTL_MS,
  __resetPendingPlanRecordForTests,
  consumePendingPlanRecord,
  hasPendingPlanRecord,
  pendingPlanRecordTakenThisLoad,
  takePendingPlanRecord,
  writePendingPlanRecord,
} from "../pending-plan-record";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const KEYS = new Map([
  ["c-act", "activity_provider"],
  ["c-guide", "tour_guide"],
  ["c-hotel", "accommodation"],
  ["c-dine", "dining_venue"],
  ["c-car", "private_transportation"],
  ["c-photo", "photographer"],
  ["c-venue", "venue"],
  ["c-aff", "aff_activities"],
]);
const L = (id: string, categoryId: string, extra: Record<string, unknown> = {}) => ({
  id,
  serviceName: id,
  categoryId,
  price: "100",
  priceType: "fixed",
  showPrice: true,
  latitude: "35.0",
  longitude: "135.7",
  ...extra,
});

test("M1: an add from Browse goes to the shown day, through the one item rail's body", () => {
  const [place] = listingPlaces([L("tea", "c-act")], KEYS);
  const body = browseAddBody(place, 2) as Record<string, unknown>;
  assert.equal(body.dayNumber, 2);
  assert.equal(body.providerServiceId, "tea");
  assert.equal(body.latitude, "35");
});

test("M2: an unlocated item and a blurred listing produce no map mark", () => {
  const scene = buildMapScene({
    dayNumber: 1,
    planStops: [
      { id: "a", name: "Located", lat: 35, lng: 135.7 },
      { id: "b", name: "Somewhere", lat: null, lng: null },
    ],
    browse: listingPlaces([L("villa", "c-hotel", { locationApproximate: true }), L("tea", "c-act")], KEYS),
    layers: { plan: true, browse: true },
  });
  assert.deepEqual(scene.pins.map((p) => p.id), ["a"]);
  assert.deepEqual(scene.notOnMap.map((s) => s.id), ["b"]);
  assert.deepEqual(scene.browse.map((b) => b.id), ["tea"], "the blurred listing is not pinned");
  const [villa] = listingPlaces([L("villa", "c-hotel", { locationApproximate: true })], KEYS);
  const body = browseAddBody(villa, 1) as Record<string, unknown>;
  assert.ok(!("latitude" in body) && !("longitude" in body), "and it adds unlocated");
});

test("M3: Budget matches only one shown USD amount, and counts what it leaves out", () => {
  const places = [
    ...listingPlaces(
      [
        L("cheap", "c-act", { price: "40" }),
        L("dear", "c-act", { price: "400" }),
        L("hidden", "c-act", { showPrice: false, price: "10" }),
        L("missing", "c-act", { price: null }),
        L("quote", "c-act", { priceType: "custom_quote", price: "5" }),
        L("range", "c-act", { priceType: "range", price: "5" }),
      ],
      KEYS,
    ),
    ...partnerPlaces([
      { id: "usd", name: "USD tour", category: "tour", price: "30", currency: "USD" },
      { id: "jpy", name: "JPY tour", category: "tour", price: "3", currency: "JPY" },
    ]),
  ];
  const out = applyBudget(places, 50);
  assert.deepEqual(out.shown.map((p) => p.id).sort(), ["cheap", "usd"]);
  assert.equal(out.byQuote, 2, "quote-only and range are counted by quote");
  assert.equal(out.noUsdPrice, 3, "hidden, missing and another currency are counted");
  assert.deepEqual(applyBudget(places, null), { shown: places, byQuote: 0, noUsdPrice: 0 }, "no limit ⇒ no filter");
});

test("M4: the five tabs, in order; Services never shows an affiliate source; no category text stays out", () => {
  assert.deepEqual(BROWSE_TABS.map((t) => t.label), ["Activities", "Hotels", "Services", "Dining", "Transportation"]);
  const listings = listingPlaces(
    ["c-act", "c-guide", "c-hotel", "c-dine", "c-car", "c-photo", "c-venue", "c-aff", "c-unknown"].map((c) => L(c, c)),
    KEYS,
  );
  const partners = partnerPlaces([
    { id: "p-tour", name: "Tour", category: "tour" },
    { id: "p-blank", name: "Blank", category: "", subCategory: null },
  ]);
  const all = [...listings, ...partners];
  const ids = (tab: Parameters<typeof placesInTab>[1]) => placesInTab(all, tab).map((p) => p.id).sort();
  assert.deepEqual(ids("activities"), ["c-act", "c-guide", "p-tour"]);
  assert.deepEqual(ids("hotels"), ["c-hotel"]);
  assert.deepEqual(ids("dining"), ["c-dine"]);
  assert.deepEqual(ids("transportation"), ["c-car"]);
  assert.deepEqual(ids("services"), ["c-photo", "c-venue"]);
  for (const k of AFFILIATE_SOURCE_KEYS) assert.ok(!ids("services").includes(k));
  assert.ok(!placesInTab(all, "activities").some((p) => p.id === "p-blank"));
  assert.deepEqual(searchPlaces(placesInTab(all, "activities"), "GUI").map((p) => p.id), ["c-guide"]);
  // "Find a host" narrows within the tab to its one key.
  assert.deepEqual(placesInTab(all, "activities", "tour_guide").filter((p) => p.kind === "listing").map((p) => p.id), ["c-guide"]);
});

test("M5: a hidden or quote-only listing reads 'By quote', never '$N'; a stated unit is shown", () => {
  const [hidden, quote, night] = listingPlaces(
    [
      L("h", "c-hotel", { showPrice: false, price: "120" }),
      L("q", "c-act", { priceType: "custom_quote", price: "50" }),
      L("n", "c-hotel", { price: "180", pricingUnit: "per_night" }),
    ],
    KEYS,
  );
  assert.equal(hidden.priceLabel, "By quote");
  assert.equal(quote.priceLabel, "By quote");
  assert.equal(night.priceLabel, "$180 / night");
});

test("M6: day chips come from the trip's dates; no dates ⇒ one Day 1; items keep their days", () => {
  const empty = mapDayChips([], { startDate: "2027-04-02", endDate: "2027-04-06" });
  assert.deepEqual(empty.map((d) => d.dayNum), [1, 2, 3, 4, 5]);
  assert.equal(empty[1].dateIso, "2027-04-03");
  assert.ok(empty.every((d) => d.activities.length === 0));
  assert.deepEqual(mapDayChips([], { startDate: null, endDate: null }).map((d) => d.dayNum), [1]);
  assert.deepEqual(mapDayChips([], null).map((d) => d.dayNum), [1]);
  assert.equal(tripWindowDayCount("2027-04-06", "2027-04-02"), null, "an inverted window is no window");
  const day2 = { dayNum: 2, date: "x", label: "Day 2", activities: [{ id: "i" } as any], transports: [] };
  const withItem = mapDayChips([day2], { startDate: "2027-04-02", endDate: "2027-04-04" });
  assert.deepEqual(withItem.map((d) => d.dayNum), [1, 2, 3]);
  assert.equal(withItem[1], day2, "the plan's own day is kept as it is");
});

test("M7: the landing is keyed on the branch and the door", () => {
  assert.equal(planLandingPath("t1", "ai", "hero"), "/plans/t1?view=map");
  assert.equal(planLandingPath("t1", "ai", null), "/plans/t1?view=map");
  assert.equal(planLandingPath("t1", "myself", "experiences"), "/plans/t1?view=map");
  assert.equal(planLandingPath("t1", "myself", "hero"), "/plans/t1");
  assert.equal(opensOnMap("local", "experiences"), false);
});

test("M8: the free-draft button is absent on a plan that holds anything", () => {
  assert.equal(slipBuildAiAction(0), "draft");
  for (const n of [1, 2, 10]) assert.equal(slipBuildAiAction(n), "optimize");
  const view = read("client/src/components/plancard/SlipView.tsx");
  assert.match(view, /\{isOwner && aiAction === "draft" \? \(\s*<div[^>]*data-testid="map-band-ai">\s*<SlipDraftAiRow/);
});

test("M9: the sign-in record — an hour, read once, cleared BEFORE the plan is created", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  __resetPendingPlanRecordForTests();
  const answers = {
    title: "", stops: ["Kyoto"], startDate: "2027-04-02", endDate: "2027-04-06", adults: "2", kids: "",
    budgetApproverName: "", budgetApproverEmail: "", accessibilityNote: "", mainMomentTime: "", mainMomentDate: "",
    events: [], occasionSlug: "travel",
  };
  writePendingPlanRecord({ branch: "myself", door: "experiences", answers, source: { experienceSlug: "travel" } }, 1000);
  const saved = JSON.parse(store.get(PENDING_PLAN_RECORD_KEY)!);
  assert.equal(saved.expiresAt - saved.savedAt, PENDING_PLAN_RECORD_TTL_MS);
  assert.equal(PENDING_PLAN_RECORD_TTL_MS, 60 * 60 * 1000);
  assert.equal(hasPendingPlanRecord(1000), true);
  assert.equal(hasPendingPlanRecord(1000 + PENDING_PLAN_RECORD_TTL_MS), false, "expired after an hour");

  // The ORDER: the record is gone from storage by the time the plan is created.
  const created: string[] = [];
  const first = consumePendingPlanRecord({
    take: () => takePendingPlanRecord(2000),
    replay: (r) => {
      assert.equal(store.has(PENDING_PLAN_RECORD_KEY), false, "cleared before the mint");
      created.push(r.branch);
    },
  });
  assert.equal(first, "replayed");
  assert.equal(pendingPlanRecordTakenThisLoad(), true, "the pen hand-off stays skipped this load");
  // A reload after sign-in finds no record: exactly one plan.
  const second = consumePendingPlanRecord({ take: () => takePendingPlanRecord(3000), replay: () => created.push("again") });
  assert.equal(second, "none");
  assert.deepEqual(created, ["myself"]);
  // An expired record replays nothing and is removed.
  writePendingPlanRecord({ branch: "ai", door: null, answers, source: {} }, 0);
  assert.equal(takePendingPlanRecord(PENDING_PLAN_RECORD_TTL_MS + 1), null);
  assert.equal(store.has(PENDING_PLAN_RECORD_KEY), false);
  // The pen's guest hand-off is skipped while a record exists.
  assert.match(read("client/src/lib/trip-context.ts"), /if \(hasPendingPlanRecord\(\) \|\| pendingPlanRecordTakenThisLoad\(\)\) return;/);
  delete (globalThis as any).window;
});

test("M10: the two binding mount counts are unchanged; the band reuses the rail's own pieces", () => {
  const view = read("client/src/components/plancard/SlipView.tsx");
  const rail = read("client/src/components/plancard/SlipRail.tsx");
  assert.equal((view.match(/<SavePaymentMethodPrompt\b/g) ?? []).length, 1, "SlipView's one prompt (save-payment-prompt A6)");
  assert.equal((rail.match(/<TripPassCard\b/g) ?? []).length, 1, "the one Trip Pass card (slip-rail S8)");
  assert.ok(!/<TripPassCard\b/.test(view), "the map band mounts no Trip Pass");
  assert.match(view, /import \{ FinishCard, SlipDraftAiRow, SlipRail, useSlipAiAction \} from "\.\/SlipRail";/);
  assert.equal((view.match(/<FinishCard\b/g) ?? []).length, 1);
  assert.equal((view.match(/<SlipDraftAiRow\b/g) ?? []).length, 1);
  // In map view the rail gives way to the map's rail, so exactly one of each renders per view.
  assert.match(view, /\{data\.trip && slipView !== "map" && \(/);
});
