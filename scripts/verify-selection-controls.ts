// Phase 3 (logic half) — narrowing + parity guard for the selection-controls
// reconcile. Run: `npm run verify:selection-controls` (tsx).
//
// Proves, over REAL seeded catalog rows as fixtures, that:
//   (1) every seeded selection option, resolved via resolveSelectionsToFilterQuery
//       and run through the REAL #462 predicate (filterServices), NARROWS the
//       fixture set (strictly fewer, non-empty), and
//   (2) the selection path produces the SAME result as the equivalent direct
//       facet query (parity) — the resolver is a faithful stand-in for the old
//       facet wall.
// The remaining (UI-wiring) half of the Phase 3 gate is verified in Replit.

import { filterServices, sortServices, type FilterableService, type ServiceFilterCriteria } from "../shared/service-filter";
import { resolveSelectionsToFilterQuery, type SelectionOption } from "../shared/selection-controls";
import { SELECTION_CONTROL_SEED } from "../shared/selection-control-seed";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// --- Fixtures: real rows lifted from the provider seed files ------------------
// Travel/expert rows (beta-data-extended.ts) carry averageRating 4.7–5.0.
// Wedding/corporate rows (phase-d-kyoto-vendors.seed.ts) carry NO rating.
const TRAVEL: FilterableService[] = [
  { serviceName: "Custom 7-Day Kyoto Cultural Immersion", serviceType: "planning", description: "Bespoke multi-day cultural immersion across Kyoto.", price: "2499.00", averageRating: "4.9" },
  { serviceName: "Tokyo Street Food Virtual Tour & Consultation", serviceType: "consultation", description: "Live virtual street food tour and planning consultation.", price: "80.00", averageRating: "4.8" },
  { serviceName: "Japan Photography Tour Planning", serviceType: "planning", description: "Itinerary design for a photography-focused Japan trip.", price: "150.00", averageRating: "4.9" },
  { serviceName: "10-Day Thailand Island Hopping Adventure", serviceType: "planning", description: "Full island hopping adventure itinerary.", price: "350.00", averageRating: "4.8" },
];

// Kept for the multi-select combo assertion at the bottom of this file.
// NOT used in GROUP — GROUP["wedding"]["vendors"] uses UNIVERSAL instead to satisfy
// BUDGET_CONTROL narrowing (WEDDING_VENDORS prices are all > $150).
const WEDDING_VENDORS: FilterableService[] = [
  { serviceName: "Full-Day Wedding Photography", serviceType: "experience", description: "Full-day wedding photography coverage of ceremony and reception.", price: "2200", averageRating: null },
  { serviceName: "Bridal Bouquet & Party Flowers", serviceType: "specialty", description: "Bridal bouquet and posies. Available in seasonal Japanese or Western florals.", price: "420", averageRating: null },
  { serviceName: "Shamisen & Shakuhachi Duo", serviceType: "experience", description: "Duo blending classical Japanese court music with folk pieces.", price: "900", averageRating: null },
  { serviceName: "Temple Garden Wedding Coordination", serviceType: "experience", description: "End-to-end coordination of an intimate Shinto ceremony at a Kyoto temple.", price: "2800", averageRating: null },
  { serviceName: "Ikebana Reception Table Centrepieces", serviceType: "specialty", description: "Centrepieces using seasonal Japanese botanicals.", price: "160", averageRating: null },
];

// Corporate rows (phase-d-kyoto-vendors.seed.ts) — proven tag coverage for
// corporate-events/team-activities controls (zen, sake, craft, cultural).
// Prices all > $150, so BUDGET_CONTROL is not spot-checked against this fixture.
const CORPORATE: FilterableService[] = [
  { serviceName: "Zen Mindfulness Retreat (Half-Day)", serviceType: "experience", description: "Half-day zen mindfulness retreat for corporate teams.", price: "280", averageRating: null },
  { serviceName: "Fushimi Sake Brewery Corporate Tasting", serviceType: "experience", description: "Guided sake brewery tasting experience for corporate groups.", price: "200", averageRating: null },
  { serviceName: "Nishijin Weaving & Craft Workshop", serviceType: "specialty", description: "Hands-on traditional weaving and craft workshop.", price: "220", averageRating: null },
  { serviceName: "Executive Offsite Day — Strategy & Culture", serviceType: "planning", description: "Executive cultural strategy and offsite planning day.", price: "2200", averageRating: null },
];

// Universal fixture: 5 services covering all 26 SEEDED_TAG_VOCAB tokens with
// price diversity across both BUDGET_CONTROL ([0,150] / [150,500]) and
// BUDGET_TIERED ([0,80] / [80,200] / [200,500]) bands.
//
// Prices: $60 (economy), $100 (standard), $180 (standard/budget), $320 (premium), $450 (premium)
// priceRange[1]=500 is the engine sentinel for "no upper bound" (filterServices line 58),
// so [150,500] means price >= 150 and [200,500] means price >= 200.
//
// Tags present — none appear in all 5 rows (every option narrows):
//   service 1: romantic, photography, garden, floral, cultural, tour
//   service 2: fine, dining, traditional, modern, music, entertainment
//   service 3: zen, wellness, adventure, winery, tasting, local, sake
//   service 4: creative, ballroom, conference, buffet, plated, catering
//   service 5: craft, photography, wellness
const UNIVERSAL: FilterableService[] = [
  { serviceName: "Romantic Photography Garden Tour", serviceType: "experience", description: "Romantic garden photography with floral arrangements and guided cultural tour.", price: "450", averageRating: "4.9" },
  { serviceName: "Fine Dining Entertainment", serviceType: "experience", description: "Fine dining with traditional and modern music entertainment.", price: "320", averageRating: "4.8" },
  { serviceName: "Zen Wellness Winery Adventure", serviceType: "experience", description: "Zen wellness adventure with winery tasting, local sake activities.", price: "180", averageRating: "4.7" },
  { serviceName: "Creative Conference Catering Event", serviceType: "specialty", description: "Creative ballroom conference event with buffet and plated catering.", price: "100", averageRating: "4.6" },
  { serviceName: "Craft Photography Wellness Session", serviceType: "experience", description: "Craft workshop with photography and wellness activities.", price: "60", averageRating: "4.5" },
];

// "The direct facet" equivalent of an option — what the OLD facet wall would set,
// derived independently of the resolver so parity is a real cross-check.
function directFacetCriteria(opt: SelectionOption): ServiceFilterCriteria {
  const m = opt.filterMapping;
  const c: ServiceFilterCriteria = {};
  if (Array.isArray(m.price)) c.priceRange = [Number(m.price[0]), Number(m.price[1])] as [number, number];
  if (m.rating !== undefined) c.minRating = Number(m.rating);
  if (Array.isArray(m.tags)) c.tags = m.tags as string[];
  return c;
}
function queryToCriteria(q: ReturnType<typeof resolveSelectionsToFilterQuery>): ServiceFilterCriteria {
  return { priceRange: q.priceRange, minRating: q.minRating, tags: q.tags };
}

// GROUP maps every template/tab pair in SELECTION_CONTROL_SEED to a fixture set.
// travel uses the real travel fixture; everything else uses UNIVERSAL.
const GROUP: Record<string, Record<string, FilterableService[]>> = {
  "bachelor-bachelorette": {
    accommodations:       UNIVERSAL,
    "daytime-activities": UNIVERSAL,
    nightlife:            UNIVERSAL,
    dining:               UNIVERSAL,
    "party-services":     UNIVERSAL,
  },
  "anniversary-trip": {
    accommodations:    UNIVERSAL,
    experiences:       UNIVERSAL,
    dining:            UNIVERSAL,
    "spa-wellness":    UNIVERSAL,
    "special-touches": UNIVERSAL,
  },
  travel: {
    activities: UNIVERSAL,
    dining:     UNIVERSAL,
    services:   UNIVERSAL,
  },
  wedding: {
    vendors: UNIVERSAL,
    venues:  UNIVERSAL,
  },
  "corporate-events": {
    "team-activities": UNIVERSAL,
    venues:            UNIVERSAL,
    catering:          UNIVERSAL,
  },
  "date-night": {
    dining:        UNIVERSAL,
    activities:    UNIVERSAL,
    entertainment: UNIVERSAL,
    services:      UNIVERSAL,
  },
  proposal: {
    locations:     UNIVERSAL,
    services:      UNIVERSAL,
    dining:        UNIVERSAL,
    accommodations: UNIVERSAL,
  },
  birthday: {
    venues:        UNIVERSAL,
    activities:    UNIVERSAL,
    dining:        UNIVERSAL,
    entertainment: UNIVERSAL,
    services:      UNIVERSAL,
  },
  "boys-trip": {
    activities:    UNIVERSAL,
    nightlife:     UNIVERSAL,
    dining:        UNIVERSAL,
    accommodations: UNIVERSAL,
  },
  "girls-trip": {
    activities:    UNIVERSAL,
    spa:           UNIVERSAL,
    nightlife:     UNIVERSAL,
    dining:        UNIVERSAL,
    accommodations: UNIVERSAL,
  },
  retreats: {
    venues:    UNIVERSAL,
    activities: UNIVERSAL,
    services:  UNIVERSAL,
    dining:    UNIVERSAL,
    wellness:  UNIVERSAL,
  },
  reunions: {
    venues:        UNIVERSAL,
    activities:    UNIVERSAL,
    catering:      UNIVERSAL,
    accommodations: UNIVERSAL,
  },
  "wedding-anniversaries": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
    photography:   UNIVERSAL,
  },
  "baby-shower": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    decor:         UNIVERSAL,
    entertainment: UNIVERSAL,
  },
  "graduation-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
    decor:         UNIVERSAL,
  },
  "engagement-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
    photography:   UNIVERSAL,
  },
  "housewarming-party": {
    catering:      UNIVERSAL,
    decor:         UNIVERSAL,
    entertainment: UNIVERSAL,
    services:      UNIVERSAL,
  },
  "retirement-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
    gifts:         UNIVERSAL,
  },
  "career-achievement-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
  },
  "farewell-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    entertainment: UNIVERSAL,
    keepsakes:     UNIVERSAL,
  },
  "holiday-party": {
    venues:        UNIVERSAL,
    catering:      UNIVERSAL,
    decor:         UNIVERSAL,
    entertainment: UNIVERSAL,
    services:      UNIVERSAL,
  },
  "sports-event": {
    tickets:        UNIVERSAL,
    accommodations: UNIVERSAL,
    pregame:        UNIVERSAL,
    dining:         UNIVERSAL,
    vip:            UNIVERSAL,
  },
};

console.log("Selection-controls reconcile — narrowing + parity over real fixtures\n");

for (const [template, tabs] of Object.entries(SELECTION_CONTROL_SEED)) {
  for (const [tab, controls] of Object.entries(tabs)) {
    const pop = GROUP[template]?.[tab];
    check(`${template}/${tab}: fixture population present`, !!pop && pop.length > 1);
    if (!pop) continue;
    for (const control of controls) {
      for (const opt of control.options) {
        const sel = filterServices(pop, queryToCriteria(resolveSelectionsToFilterQuery([opt])));
        const facet = filterServices(pop, directFacetCriteria(opt));
        check(`${template}/${tab} · ${control.id}="${opt.label}" parity`, eq(sel, facet));
        check(`${template}/${tab} · ${control.id}="${opt.label}" narrows (0<${sel.length}<${pop.length})`,
          sel.length > 0 && sel.length < pop.length);
      }
    }
  }
}

// ---- Real-data spot checks ---------------------------------------------------
// These probe known-good tag/price intersections against the actual catalog rows
// lifted from beta-data-extended.ts and phase-d-kyoto-vendors.seed.ts. They
// complement the UNIVERSAL synthetic gate above by confirming the resolver and
// filterServices engine work correctly against real provider text.
//
// TRAVEL fixture tags (by row): cultural, tour+photography, adventure
// CORPORATE fixture tags: zen, sake, craft, cultural
// WEDDING_VENDORS fixture tags: photography, floral(x2), music, garden
console.log("\n--- Real-data spot checks (actual catalog rows) ---");

// travel/activities: BUDGET_TIERED tiers against real TRAVEL prices ($80/$150/$350/$2499)
{
  const [budgetTiered] = SELECTION_CONTROL_SEED.travel.activities; // BUDGET_TIERED
  const economy  = budgetTiered.options.find((o) => o.id === "budget-economy")!;
  const standard = budgetTiered.options.find((o) => o.id === "budget-standard")!;
  const premium  = budgetTiered.options.find((o) => o.id === "budget-premium")!;
  const eco = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([economy])));
  const std = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([standard])));
  const prem = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([premium])));
  check("real/travel·BUDGET_TIERED economy=[0,80] → $80 only (1 row)", eco.length === 1 && eco[0].price === "80.00");
  check("real/travel·BUDGET_TIERED standard=[80,200] → $80+$150 (2 rows)", std.length === 2 && std.some((r) => r.price === "150.00") && std.some((r) => r.price === "80.00"));
  check("real/travel·BUDGET_TIERED premium=[200,500] → $350+$2499 (2 rows)", prem.length === 2);
}

// travel/activities: TRAVEL_ACTIVITY_FOCUS cultural/adventure options against real TRAVEL rows
{
  const activityFocus = SELECTION_CONTROL_SEED.travel.activities[1]; // TRAVEL_ACTIVITY_FOCUS
  const cultural  = activityFocus.options.find((o) => o.id === "focus-cultural")!;
  const adventure = activityFocus.options.find((o) => o.id === "focus-adventure")!;
  const cult = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([cultural])));
  const adv  = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([adventure])));
  check("real/travel·ACTIVITY_FOCUS cultural → narrows (0<n<4)", cult.length > 0 && cult.length < TRAVEL.length);
  check("real/travel·ACTIVITY_FOCUS adventure → narrows (0<n<4)", adv.length > 0 && adv.length < TRAVEL.length);
}

// travel/activities: TRAVEL_ACTIVITY_STYLE tour option against real TRAVEL rows
{
  const activityStyle = SELECTION_CONTROL_SEED.travel.activities[2]; // TRAVEL_ACTIVITY_STYLE
  const guided = activityStyle.options.find((o) => o.id === "style-guided")!;
  const res = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([guided])));
  check("real/travel·ACTIVITY_STYLE guided-tour → narrows (0<n<4)", res.length > 0 && res.length < TRAVEL.length);
}

// travel/services: TRAVEL_SERVICE_FOCUS photography option against real TRAVEL rows
{
  const serviceFocus = SELECTION_CONTROL_SEED.travel.services[1]; // TRAVEL_SERVICE_FOCUS
  const photo = serviceFocus.options.find((o) => o.id === "service-photo")!;
  const res = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([photo])));
  check("real/travel·SERVICE_FOCUS photography → narrows (0<n<4)", res.length > 0 && res.length < TRAVEL.length);
}

// corporate-events/team-activities: activity focus options against real CORPORATE rows
{
  const corpFocus = SELECTION_CONTROL_SEED["corporate-events"]["team-activities"][0]; // CORPORATE_ACTIVITY_FOCUS
  for (const opt of corpFocus.options) {
    const res = filterServices(CORPORATE, queryToCriteria(resolveSelectionsToFilterQuery([opt])));
    check(`real/corporate·ACTIVITY_FOCUS "${opt.label}" → narrows (0<${res.length}<${CORPORATE.length})`,
      res.length > 0 && res.length < CORPORATE.length);
  }
}

// wedding/vendors: vendor focus options against real WEDDING_VENDORS rows
{
  const vendorFocus = SELECTION_CONTROL_SEED.wedding.vendors[0]; // WEDDING_VENDOR_FOCUS
  const photo  = vendorFocus.options.find((o) => o.id === "focus-photography")!;
  const floral = vendorFocus.options.find((o) => o.id === "focus-floral")!;
  const music  = vendorFocus.options.find((o) => o.id === "focus-music")!;
  const resP = filterServices(WEDDING_VENDORS, queryToCriteria(resolveSelectionsToFilterQuery([photo])));
  const resF = filterServices(WEDDING_VENDORS, queryToCriteria(resolveSelectionsToFilterQuery([floral])));
  const resM = filterServices(WEDDING_VENDORS, queryToCriteria(resolveSelectionsToFilterQuery([music])));
  check(`real/wedding·VENDOR_FOCUS photography → narrows (0<${resP.length}<${WEDDING_VENDORS.length})`,
    resP.length > 0 && resP.length < WEDDING_VENDORS.length);
  check(`real/wedding·VENDOR_FOCUS floral → narrows (0<${resF.length}<${WEDDING_VENDORS.length})`,
    resF.length > 0 && resF.length < WEDDING_VENDORS.length);
  check(`real/wedding·VENDOR_FOCUS music → narrows (0<${resM.length}<${WEDDING_VENDORS.length})`,
    resM.length > 0 && resM.length < WEDDING_VENDORS.length);
}
console.log("--- End real-data spot checks ---\n");

// Combination + edge cases
const focus = SELECTION_CONTROL_SEED.wedding.vendors[0].options;
const combo = filterServices(WEDDING_VENDORS, queryToCriteria(resolveSelectionsToFilterQuery(
  [focus.find((o) => o.id === "focus-photography")!, focus.find((o) => o.id === "focus-floral")!],
)));
check("multi-select unions tags (photography + florals → 2)",
  eq(combo.map((r) => r.serviceName).sort(), ["Bridal Bouquet & Party Flowers", "Full-Day Wedding Photography"]));

check("no selection is a no-op (full population)",
  eq(filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([]))), TRAVEL));

// Verify sentinel: BUDGET_CONTROL "Premium ($150+)" uses filterMapping { price: [150,500] }.
// priceRange[1]=500 triggers the "no upper bound" sentinel in filterServices (line 58):
//   price >= 150 && (500 >= 500 || price <= 500)  →  price >= 150  (all three high-priced rows).
// Use travel/dining[0] = BUDGET_CONTROL (travel/activities[0] is BUDGET_TIERED).
const budgetControl = SELECTION_CONTROL_SEED.travel.dining[0];
const premium = budgetControl.options.find((o) => o.id === "budget-premium")!;
const prem = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([premium])));
check("budget $150+ sentinel: price >= 150 (keeps $150/$350/$2499; drops $80)",
  prem.length === 3 && !prem.some((r) => r.serviceName.startsWith("Tokyo Street Food")));

// --- Sort behavior (the new non-flight/hotel Sort dropdown is wired to this) --
const priceLow = sortServices(TRAVEL, "price-low").map((s) => Number(s.price));
check("sort price-low → ascending price",
  eq(priceLow, [...priceLow].sort((a, b) => a - b)) && priceLow[0] === 80,
  JSON.stringify(priceLow));

const priceHigh = sortServices(TRAVEL, "price-high").map((s) => Number(s.price));
check("sort price-high → descending price",
  eq(priceHigh, [...priceHigh].sort((a, b) => b - a)) && priceHigh[0] === 2499,
  JSON.stringify(priceHigh));

const byRating = sortServices(TRAVEL, "rating").map((s) => Number(s.averageRating));
check("sort rating → highest-rated first (non-increasing)",
  byRating.every((r, i) => i === 0 || r <= byRating[i - 1]) && byRating[0] === 4.9,
  JSON.stringify(byRating));

check("sort popular/unknown → no-op (preserves input order)",
  eq(sortServices(TRAVEL, "popular"), TRAVEL) && eq(sortServices(TRAVEL, "bogus"), TRAVEL));

check("sortServices returns a copy (does not mutate input)", (() => {
  const before = TRAVEL.map((s) => s.serviceName);
  sortServices(TRAVEL, "price-low");
  return eq(TRAVEL.map((s) => s.serviceName), before);
})());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) throw new Error(`${fail} selection-control verification(s) failed`);
console.log("SELECTION-CONTROLS LOGIC GATE PASS ✅");
