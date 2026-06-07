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
const WEDDING_VENDORS: FilterableService[] = [
  { serviceName: "Full-Day Wedding Photography", serviceType: "experience", description: "Full-day wedding photography coverage of ceremony and reception.", price: "2200", averageRating: null },
  { serviceName: "Bridal Bouquet & Party Flowers", serviceType: "specialty", description: "Bridal bouquet and posies. Available in seasonal Japanese or Western florals.", price: "420", averageRating: null },
  { serviceName: "Shamisen & Shakuhachi Duo", serviceType: "experience", description: "Duo blending classical Japanese court music with folk pieces.", price: "900", averageRating: null },
  { serviceName: "Temple Garden Wedding Coordination", serviceType: "experience", description: "End-to-end coordination of an intimate Shinto ceremony at a Kyoto temple.", price: "2800", averageRating: null },
  { serviceName: "Ikebana Reception Table Centrepieces", serviceType: "specialty", description: "Centrepieces using seasonal Japanese botanicals.", price: "160", averageRating: null },
];
const CORPORATE: FilterableService[] = [
  { serviceName: "Zen Mindfulness Retreat (Half-Day)", serviceType: "experience", description: "Half-day zen mindfulness retreat for teams.", price: "280", averageRating: null },
  { serviceName: "Fushimi Sake Brewery Corporate Tasting", serviceType: "experience", description: "Guided sake brewery tasting for corporate groups.", price: "200", averageRating: null },
  { serviceName: "Nishijin Weaving & Craft Workshop", serviceType: "experience", description: "Hands-on weaving and craft workshop.", price: "220", averageRating: null },
  { serviceName: "Executive Offsite Day — Strategy & Culture", serviceType: "experience", description: "Executive strategy and culture offsite.", price: "2200", averageRating: null },
];

const GROUP: Record<string, Record<string, FilterableService[]>> = {
  travel: { activities: TRAVEL, dining: TRAVEL, services: TRAVEL },
  wedding: { vendors: WEDDING_VENDORS },
  "corporate-events": { "team-activities": CORPORATE },
};

// The "direct facet" equivalent of an option — what the OLD facet wall would set,
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

// Combination + edge cases
const focus = SELECTION_CONTROL_SEED.wedding.vendors[0].options;
const combo = filterServices(WEDDING_VENDORS, queryToCriteria(resolveSelectionsToFilterQuery(
  [focus.find((o) => o.id === "focus-photography")!, focus.find((o) => o.id === "focus-floral")!],
)));
check("multi-select unions tags (photography + florals → 2)",
  eq(combo.map((r) => r.serviceName).sort(), ["Bridal Bouquet & Party Flowers", "Full-Day Wedding Photography"]));

check("no selection is a no-op (full population)",
  eq(filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([]))), TRAVEL));

const premium = SELECTION_CONTROL_SEED.travel.activities[0].options.find((o) => o.id === "budget-premium")!;
const prem = filterServices(TRAVEL, queryToCriteria(resolveSelectionsToFilterQuery([premium])));
check("budget $150+ honors 0–500 sentinel (keeps high-priced; drops $80)",
  prem.length === 3 && !prem.some((r) => r.serviceName.startsWith("Tokyo Street Food")));

// --- Sort behavior (the new non-flight/hotel Sort dropdown is wired to this) --
// The dropdown emits "price-low"/"price-high"/"rating"/"popular"; sortServices
// must actually reorder for the first three and no-op on the default. Without
// this, a value-string drift (e.g. price-asc vs price-low) silently dead-wires
// the control — the wired-but-dead pattern the reconcile just removed.
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
