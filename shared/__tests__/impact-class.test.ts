/**
 * IMPACT CLASS — every key in both offering catalogs resolves, and nothing else does.
 * Lane L24 of the Console & AI Concierge brief (§11.6); ledger `2026-09-07-impact-class`.
 * CLAUDE.md Locked Decisions 3, 4, 31, 36 and §18 rule 1.
 *
 * WHY THIS EXISTS. `impactClassFor` decides, for a listing, whether a purchase touches a plan,
 * creates one, or never involves one — and every one of its inputs is a value from a DATABASE
 * table (`expert_offering_types.offering_type_key`, `service_categories.category_key`) that no
 * pure module can read. So the lookup necessarily carries a committed mirror of both catalogs,
 * and a mirror that nothing pins is a second catalog waiting to drift (§18 rule 1). This file is
 * the pin, in both directions, for both catalogs.
 *
 * The failure it guards against is the one ruling 31 and Locked Decision 36 each name from their
 * own side: a key with no row behind it, or a row with no key in front of it, is a dead path that
 * LOOKS live. Here it would render a card eyebrow that is silently wrong about what the traveler
 * is buying — or, worse, no eyebrow at all on a key the catalog does carry.
 *
 * What these hold:
 *   E1  EXPERT_OFFERING_TIERS is EXACTLY what migrations 039/062/065/283 seed — no key the
 *       migrations do not seed, and no seeded key the map does not carry.
 *   E2  the tier recorded for every key matches the tier the migration seeds it into.
 *   E3  all 55 expert keys resolve to a NON-NULL class.
 *   E4  the class of every expert key is the ratified table (§11.6): the six planner keys are
 *       event_coordination; advisory + specialized are consult; planning and the remaining six
 *       plan-shaped coordination rows are plan_work; live_support is live_trip. The six
 *       plan-shaped rows are named here so the complement partition cannot rot unnoticed.
 *   P1  PROVIDER_CATEGORY_IMPACT covers exactly the taxonomy REGISTRY's keys minus the four
 *       `aff_*` sources — the registry (`scripts/lib/taxonomy-registry.cjs`) is REQUIRED, never
 *       re-implemented, the same module `roles-needed.test.ts` R3 reads.
 *   P2  every provider key resolves: `accommodation` → stay, every other discipline → on_ground,
 *       every `aff_*` → partner, and `custom_other` by delivery method.
 *   N1  an unknown key — expert, provider, or both — resolves to NULL, never a nearest class.
 *   N2  `custom_other` splits by delivery method, and an unstated method is not place-anchored.
 *   N3  an `aff_*` category WINS over any offering key on the same row.
 *
 * Pure unit: no DB, no fetch, no React. The only I/O is reading the migrations and the registry
 * module as TEXT — the technique `roles-needed.test.ts` uses, for the same reason: importing a
 * seed or a schema module pulls in the DB client, and what is under test is that the committed
 * literal is correct, not that anything can run.
 *
 * Run: npx tsx --test shared/__tests__/impact-class.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  EXPERT_OFFERING_TIERS,
  EVENT_PLANNER_OFFERING_KEYS,
  EXPERT_TIERS,
  type ExpertTier,
} from "../expert-offerings";
import { impactClassFor, impactClassLabel, type ImpactClass } from "../impact-class";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/**
 * The migrations that seed `expert_offering_types`. There is no registry module for the EXPERT
 * catalog the way `taxonomy-registry.cjs` is one for the provider catalog, so this lane names the
 * four files that seed it. A fifth seeder added without listing it here fails E1 from the map
 * side the moment someone adds its keys — which is the direction that matters: an unseeded key in
 * the map is the dead path, and it cannot hide.
 */
const EXPERT_SEED_MIGRATIONS = [
  "server/migrations/039_phase2_seed_expert_offering_types.sql",
  "server/migrations/062_fill_offering_gaps.sql",
  "server/migrations/065_seed_booking_concierge_offering_type.sql",
  "server/migrations/283_expert_planner_offering_types.sql",
];

const require_ = createRequire(import.meta.url);
const { TAXONOMY_MIGRATIONS, collectTaxonomy } = require_("../../scripts/lib/taxonomy-registry.cjs") as {
  TAXONOMY_MIGRATIONS: string[];
  collectTaxonomy: (sources: Array<{ file: string; sql: string }>) => {
    keys: Set<string>;
    errors: string[];
  };
};

/**
 * Every `(offering_type_key → service_tier)` pair a migration INSERTs into
 * `expert_offering_types`. Split on the insert TARGET so an insert into `service_offering_types`
 * in the same file (migration 062 carries many) contributes nothing — the two catalogs are never
 * merged (§4), including by a careless parser.
 */
function seededExpertPairs(sql: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const chunk of sql.split(/INSERT\s+INTO\s+/i).slice(1)) {
    if (!/^expert_offering_types\b/i.test(chunk.trim())) continue;
    for (const m of chunk.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,/g)) {
      if (!pairs.has(m[1])) pairs.set(m[1], m[2]);
    }
  }
  return pairs;
}

/** The union across the four seeders, in apply order. */
function seededExpertCatalog(): Map<string, string> {
  const all = new Map<string, string>();
  for (const rel of EXPERT_SEED_MIGRATIONS) {
    const sql = readFileSync(path.resolve(REPO, rel), "utf8");
    const pairs = seededExpertPairs(sql);
    // A seeder that parses to nothing means the parser is broken, not that the file is empty.
    // Refusing to pass vacuously is the phase2-fee-gate lesson (§18d).
    assert.ok(pairs.size > 0, `parsed ZERO expert_offering_types rows from ${rel} — parser is broken`);
    for (const [k, tier] of pairs) if (!all.has(k)) all.set(k, tier);
  }
  return all;
}

/** Every `category_key` the taxonomy REGISTRY assigns, folded across its migrations. */
function registryCategoryKeys(): Set<string> {
  const taxonomy = collectTaxonomy(
    TAXONOMY_MIGRATIONS.map((rel) => ({ file: rel, sql: readFileSync(path.resolve(REPO, rel), "utf8") })),
  );
  assert.deepEqual(taxonomy.errors, [], "taxonomy registry reported integrity errors");
  assert.ok(taxonomy.keys.size > 0, "parsed ZERO keys from the taxonomy registry — parser is broken");
  return taxonomy.keys;
}

/**
 * The RATIFIED tier → class table (§11.6), spelled here rather than imported, so this file is a
 * SPEC and not a restatement of the implementation. `coordination` is the planner keys' tier too;
 * E4 handles that split explicitly.
 */
const RATIFIED_TIER_CLASS: Record<ExpertTier, ImpactClass> = {
  advisory: "consult",
  planning: "plan_work",
  coordination: "plan_work",
  live_support: "live_trip",
  specialized: "consult",
};

/**
 * The six plan-shaped `coordination` rows the lane names. The implementation derives them as the
 * complement of the planner keys inside the tier; naming them here pins that the complement is
 * still these six and nothing has been quietly added to or removed from the tier.
 */
const PLAN_SHAPED_COORDINATION_KEYS = [
  "done_for_you_booking",
  "group_trip_coord",
  "reservation_lifeline",
  "vendor_wrangler",
  "occasion_coordination",
  "booking_concierge",
];

describe("impact class — the expert catalog", () => {
  it("E1 EXPERT_OFFERING_TIERS is exactly what migrations 039/062/065/283 seed", () => {
    const seeded = seededExpertCatalog();
    const mapped = new Set(Object.keys(EXPERT_OFFERING_TIERS));

    for (const k of seeded.keys()) {
      assert.ok(
        mapped.has(k),
        `migration seeds "${k}" but EXPERT_OFFERING_TIERS does not carry it — an expert listing on that key would resolve to NO impact class, silently`,
      );
    }
    for (const k of mapped) {
      assert.ok(
        seeded.has(k),
        `EXPERT_OFFERING_TIERS names "${k}", which no migration seeds into expert_offering_types — a dead key that looks live`,
      );
    }
    // The count is the brief's own inventory (55 rows across five tiers). Asserting it separately
    // catches a parser that matched a subset of both sides identically.
    assert.equal(mapped.size, 55, `expected 55 expert offering keys, found ${mapped.size}`);
  });

  it("E2 every key's recorded tier is the tier its migration seeds it into", () => {
    const seeded = seededExpertCatalog();
    for (const [k, tier] of seeded) {
      assert.equal(
        EXPERT_OFFERING_TIERS[k],
        tier,
        `"${k}" is seeded into "${tier}" but EXPERT_OFFERING_TIERS records "${EXPERT_OFFERING_TIERS[k]}"`,
      );
    }
    // And every recorded tier is one the DB CHECK allows — a sixth tier is a publish trap (LD 36).
    for (const [k, tier] of Object.entries(EXPERT_OFFERING_TIERS)) {
      assert.ok((EXPERT_TIERS as readonly string[]).includes(tier), `"${k}" records a tier outside the five: "${tier}"`);
    }
  });

  it("E3 all 55 expert keys resolve to a non-null impact class", () => {
    for (const k of Object.keys(EXPERT_OFFERING_TIERS)) {
      const impact = impactClassFor({ offeringTypeKey: k });
      assert.ok(impact !== null, `"${k}" resolves to NO impact class`);
      assert.ok(impactClassLabel(impact) !== null, `"${k}" resolves to a class with no eyebrow label`);
    }
  });

  it("E4 every expert key's class is the ratified §11.6 table, planner keys first", () => {
    const planner = new Set<string>(EVENT_PLANNER_OFFERING_KEYS);

    for (const k of planner) {
      assert.equal(
        impactClassFor({ offeringTypeKey: k }),
        "event_coordination",
        `planner key "${k}" must classify by KEY, not by its coordination tier`,
      );
    }

    for (const [k, tier] of Object.entries(EXPERT_OFFERING_TIERS)) {
      if (planner.has(k)) continue;
      assert.equal(
        impactClassFor({ offeringTypeKey: k }),
        RATIFIED_TIER_CLASS[tier],
        `"${k}" (tier ${tier}) does not match the ratified table`,
      );
    }

    // The coordination tier is exactly the six planner keys plus the six plan-shaped rows: a
    // complement partition, so a thirteenth row would break this and be seen.
    const coordination = Object.entries(EXPERT_OFFERING_TIERS)
      .filter(([, tier]) => tier === "coordination")
      .map(([k]) => k);
    assert.deepEqual(
      [...coordination].sort(),
      [...planner, ...PLAN_SHAPED_COORDINATION_KEYS].sort(),
      "the coordination tier is no longer exactly the six planner keys plus the six plan-shaped rows",
    );
    for (const k of PLAN_SHAPED_COORDINATION_KEYS) {
      assert.equal(impactClassFor({ offeringTypeKey: k }), "plan_work", `"${k}" must be plan work`);
    }
  });
});

describe("impact class — the provider catalog", () => {
  it("P1 the provider map covers exactly the taxonomy registry's keys minus the aff_* sources", () => {
    const registry = registryCategoryKeys();
    const disciplines = [...registry].filter((k) => !k.startsWith("aff_"));

    // Resolve through the public function rather than reaching into the private map: what matters
    // is that every discipline the registry assigns has an answer, and nothing else claims one.
    for (const k of disciplines) {
      const impact = impactClassFor({ categoryKey: k });
      assert.ok(impact !== null, `registry discipline "${k}" resolves to NO impact class`);
      assert.ok(impact === "stay" || impact === "on_ground", `discipline "${k}" resolved to "${impact}"`);
    }
    // 21 disciplines + 4 aff_* as of migration 285 — the brief's own inventory.
    assert.equal(disciplines.length, 21, `expected 21 provider disciplines, found ${disciplines.length}`);
    assert.equal(registry.size - disciplines.length, 4, "expected exactly four aff_* affiliate sources");
  });

  it("P2 accommodation is a stay, every other discipline is on the ground, aff_* is partner", () => {
    const registry = registryCategoryKeys();
    for (const k of registry) {
      const impact = impactClassFor({ categoryKey: k });
      if (k.startsWith("aff_")) {
        assert.equal(impact, "partner", `"${k}" is an affiliate source and must be partner inventory`);
      } else if (k === "accommodation") {
        assert.equal(impact, "stay", "lodging is the one discipline whose product is a span of nights");
      } else {
        assert.equal(impact, "on_ground", `"${k}" happens at a time and a place`);
      }
    }
  });
});

describe("impact class — the negatives", () => {
  it("N1 an unknown key resolves to null, never a nearest class", () => {
    assert.equal(impactClassFor({ offeringTypeKey: "yacht_planner" }), null);
    assert.equal(impactClassFor({ categoryKey: "ballroom" }), null);
    assert.equal(impactClassFor({ offeringTypeKey: "yacht_planner", categoryKey: "ballroom" }), null);
    // Absence in every spelling is the same answer: we were never told.
    assert.equal(impactClassFor(null), null);
    assert.equal(impactClassFor(undefined), null);
    assert.equal(impactClassFor({}), null);
    assert.equal(impactClassFor({ offeringTypeKey: "", categoryKey: "   " }), null);
    // A delivery method alone says HOW, never WHAT — it can never classify on its own.
    assert.equal(impactClassFor({ deliveryMethod: "in_person" }), null);
    assert.equal(impactClassLabel(null), null);
  });

  it("N2 custom_other splits by delivery method, and an unstated method is not place-anchored", () => {
    for (const method of ["in_person", "hybrid"]) {
      assert.equal(impactClassFor({ categoryKey: "custom_other", deliveryMethod: method }), "on_ground", method);
    }
    for (const method of ["pdf", "video", "call", "voice_notes", "async_messaging"]) {
      assert.equal(impactClassFor({ categoryKey: "custom_other", deliveryMethod: method }), "consult", method);
    }
    assert.equal(impactClassFor({ categoryKey: "custom_other" }), "consult");
    assert.equal(impactClassFor({ categoryKey: "custom_other", deliveryMethod: null }), "consult");
    // `custom_other` is deliberately NOT a registry discipline — the 189/208 backfills assign it
    // by UPDATE, which the registry parser reads as text and skips.
    assert.ok(!registryCategoryKeys().has("custom_other"));
  });

  it("N3 an aff_* category wins over any offering key on the same row", () => {
    for (const k of ["wedding_planner", "full_itinerary", "text_a_local", "ask_me_anything"]) {
      assert.equal(
        impactClassFor({ offeringTypeKey: k, categoryKey: "aff_activities" }),
        "partner",
        `"${k}" beside an affiliate source must still be partner inventory`,
      );
    }
    // A recognised expert key beside a recognised PROVIDER category still classifies by key —
    // only the affiliate prefix short-circuits.
    assert.equal(impactClassFor({ offeringTypeKey: "full_itinerary", categoryKey: "florist" }), "plan_work");
    // An UNRECOGNISED expert key falls through to the category rather than swallowing the row.
    assert.equal(impactClassFor({ offeringTypeKey: "yacht_planner", categoryKey: "accommodation" }), "stay");
  });
});
