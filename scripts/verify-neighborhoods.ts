// Phase 8.3 pure-logic gate — no DB required; all fixtures are inline.
// Proves the three guard rules that protect expert_neighborhoods writes:
//   [1] Market-mismatch detection (localExpertForms city/destinations vs neighborhood city)
//   [2] Adjacency self-loop rejection
//   [3] Adjacency cross-market slug validation
//
// Run: npx tsx scripts/verify-neighborhoods.ts

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else       { fail++; console.error(`  \u2717 ${name}${detail ? " \u2014 " + detail : ""}`); }
}

// ─── Market-check logic (mirrors admin.routes.ts PUT /lead) ─────────────────
type ExpertForm = { city: string | null; destinations: string[] | null };
type Neighborhood = { city: string };

function checkMarket(form: ExpertForm | undefined, nbh: Neighborhood): "match" | "missing" | "mismatch" {
  if (!form || (!form.city && !(Array.isArray(form.destinations) && form.destinations.length > 0))) {
    return "missing";
  }
  const nbhCity   = (nbh.city    || "").toLowerCase();
  const xCity     = (form.city   || "").toLowerCase();
  const dests     = Array.isArray(form.destinations) ? form.destinations.map(d => String(d).toLowerCase()) : [];
  return (xCity === nbhCity || dests.some(d => d.includes(nbhCity))) ? "match" : "mismatch";
}

// ─── Adjacency-guard logic ───────────────────────────────────────────────────
function isSelfLoop(slug: string, proposed: string[]): boolean {
  return proposed.includes(slug);
}

function crossMarketSlugs(proposed: string[], validInMarket: string[]): string[] {
  const valid = new Set(validInMarket);
  return proposed.filter(k => !valid.has(k));
}

// ─── Tests ───────────────────────────────────────────────────────────────────
console.log("\nPhase 8.3 \u2014 neighborhood-spine guard gate");
console.log("\u2500".repeat(54));

console.log("\n[1] Market mismatch rejection (expert_neighborhoods write guard)");
check("exact city match \u2192 match",
  checkMarket({ city: "Kyoto", destinations: null }, { city: "Kyoto" }) === "match");
check("city case-insensitive \u2192 match",
  checkMarket({ city: "kyoto", destinations: null }, { city: "Kyoto" }) === "match");
check("city in destinations array \u2192 match",
  checkMarket({ city: "Tokyo", destinations: ["Kyoto", "Osaka"] }, { city: "Kyoto" }) === "match");
check("destination substring match \u2192 match",
  checkMarket({ city: "Other", destinations: ["Greater Kyoto Region"] }, { city: "Kyoto" }) === "match");
check("wrong city + no matching destination \u2192 mismatch",
  checkMarket({ city: "Tokyo", destinations: ["Osaka"] }, { city: "Kyoto" }) === "mismatch");
check("wrong city + empty destinations \u2192 mismatch",
  checkMarket({ city: "Tokyo", destinations: [] }, { city: "Kyoto" }) === "mismatch");
check("no form \u2192 missing (soft-pass, not hard-reject)",
  checkMarket(undefined, { city: "Kyoto" }) === "missing");
check("null city + null destinations \u2192 missing",
  checkMarket({ city: null, destinations: null }, { city: "Kyoto" }) === "missing");
check("null city + empty destinations \u2192 missing",
  checkMarket({ city: null, destinations: [] }, { city: "Kyoto" }) === "missing");

console.log("\n[2] Adjacency self-loop rejection");
check("self-slug in proposed \u2192 rejects",
  isSelfLoop("shimokitazawa", ["shimokitazawa", "yanaka"]) === true);
check("self-slug absent \u2192 allows",
  isSelfLoop("shimokitazawa", ["yanaka", "nakameguro"]) === false);
check("empty proposed \u2192 allows",
  isSelfLoop("shimokitazawa", []) === false);

console.log("\n[3] Adjacency cross-market slug validation");
const validSlugs = ["shimokitazawa", "yanaka", "nakameguro", "asakusa"];
check("all valid market slugs \u2192 zero invalid",
  crossMarketSlugs(["shimokitazawa", "yanaka"], validSlugs).length === 0);
check("foreign-city slug flagged",
  crossMarketSlugs(["shimokitazawa", "gion-kyoto"], validSlugs).includes("gion-kyoto"));
check("empty proposed \u2192 zero invalid",
  crossMarketSlugs([], validSlugs).length === 0);
check("all invalid slugs counted",
  crossMarketSlugs(["gion-kyoto", "maruyama"], validSlugs).length === 2);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "\u2500".repeat(54));
console.log(`  ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("\nGATE FAILED \u2014 Phase 8.3 logic checks did not all pass.");
  process.exit(1);
}
console.log("\nGATE PASSED \u2705");
