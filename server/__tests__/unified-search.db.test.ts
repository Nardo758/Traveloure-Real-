/**
 * Task 1167 — unifiedSearch integration tests (real Postgres).
 *
 * Guards the three-tier search strategy in storage.unifiedSearch against silent
 * regression:
 *   Tier 1 – full-text search (tsvector/tsquery, migration 219 GIN index)
 *   Tier 2 – pg_trgm trigram fallback  (word_similarity > 0.35 OR similarity > 0.3)
 *   Tier 3 – "Did you mean?" suggestion (similarity > 0.2, no-location filter)
 *
 * Isolation strategy: every fixture service is inserted with a unique `location`
 * value (`loc-tag`) so the location filter in all searches returns ONLY our rows,
 * even on a shared dev DB.  The suggestion test uses a *different* location tag for
 * the suggested service so that the trigram path (location-filtered) finds nothing
 * while the suggestion query (no location filter) still finds it — exactly mirroring
 * the real-world case "no results in City A, but did you mean this service in City B?".
 *
 * Run: npx tsx --test server/__tests__/unified-search.db.test.ts
 * Or:  JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/unified-search.db.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const tag = `srch-${crypto.randomUUID().slice(0, 8)}`;
const mainLoc = `TestLoc-${tag}`;        // location shared by main fixture services
const suggLoc = `SuggLoc-${tag}`;       // location used ONLY by the suggestion fixture
const pkgDest = `TestDest-${tag}`;      // destination for expert_templates packages

const { pool } = await import("../db");
const { storage } = await import("../storage");

// ── Fixture IDs (populated in before()) ─────────────────────────────────────
let userId: string;
// main fixture services
let svcBambooName: string;   // A – name contains "Bamboo Forest Walk"
let svcBambooDesc: string;   // B – name is unrelated, description mentions "bamboo forest"
let svcSnorkel: string;      // C – "Snorkeling Adventure"
let svcYacht: string;        // D – "Luxury Yacht Charter"
// price / rating fixtures
let svcCheap: string;        // price 30, rating 3.8
let svcMid: string;          // price 80, rating 4.2
let svcPricey: string;       // price 500, rating 5.0
// suggestion fixture (different location — not returned by location-filtered searches)
let svcSuggestion: string;   // "Zephyr Lagoon Voyage"
// packages
const pkgIds: string[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertService(
  id: string,
  name: string,
  description: string,
  location: string,
  price: number,
  rating: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, description, location, price, average_rating,
        status, approval_status, delivery_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active','approved','pdf')`,
    [id, userId, name, description, location, price, rating],
  );
}

async function insertPackage(id: string, title: string, destination: string): Promise<void> {
  await pool.query(
    `INSERT INTO expert_templates
       (id, expert_id, title, description, destination, duration, price,
        is_published, approval_status)
     VALUES ($1,$2,$3,$4,$5,3,'99.00',true,'approved')`,
    [id, userId, title, `Description for ${title}`, destination],
  );
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, role) VALUES ($1,$2,'provider')`,
    [userId, `search-test-${userId}@test.dev`],
  );

  // ── Service A: "Bamboo Forest Walk" – primary FTS + trigram fixture
  svcBambooName = crypto.randomUUID();
  await insertService(
    svcBambooName,
    "Bamboo Forest Walk",
    "A serene nature hike through ancient woodlands.",
    mainLoc,
    50,
    4.5,
  );

  // ── Service B: different name, "bamboo forest" only in description
  svcBambooDesc = crypto.randomUUID();
  await insertService(
    svcBambooDesc,
    "Morning Trail Run",
    "Enjoy bamboo forest views along the riverside route.",
    mainLoc,
    30,
    3.8,
  );

  // ── Service C: Snorkeling (used for trigram typo test + price/rating filter)
  svcSnorkel = crypto.randomUUID();
  await insertService(
    svcSnorkel,
    "Snorkeling Adventure",
    "Explore vibrant ocean reefs with guided snorkeling.",
    mainLoc,
    80,
    4.2,
  );

  // ── Service D: Luxury Yacht Charter (price/rating filter)
  svcYacht = crypto.randomUUID();
  await insertService(
    svcYacht,
    "Luxury Yacht Charter",
    "Private sailing experience on a luxury yacht.",
    mainLoc,
    500,
    5.0,
  );

  // Aliases for price/rating filter clarity
  svcCheap  = svcBambooDesc;   // $30, 3.8
  svcMid    = svcSnorkel;      // $80, 4.2
  svcPricey = svcYacht;        // $500, 5.0

  // ── Suggestion fixture: "Zephyr Lagoon Voyage" at a DIFFERENT location
  // The query "zephir lagone" is intentionally garbled (i→y, missing chars) so
  // that FTS fails (non-English stems) and trigram fails in the location-scoped
  // search (no service at mainLoc has those trigrams).  The suggestion query
  // (no location filter) finds "Zephyr Lagoon Voyage" via full-string similarity.
  // Computed similarity("Zephyr Lagoon Voyage", "zephir lagone") ≈ 0.23 > 0.2 ✓
  svcSuggestion = crypto.randomUUID();
  await insertService(
    svcSuggestion,
    "Zephyr Lagoon Voyage",
    "A mythical lagoon voyage experience.",
    suggLoc,
    120,
    4.0,
  );

  // ── 7 packages (limit in runPkgSearch is 6 — packagesTotal must report 7)
  for (let i = 1; i <= 7; i++) {
    const id = crypto.randomUUID();
    pkgIds.push(id);
    await insertPackage(id, `Bali Adventure Package ${i}`, pkgDest);
  }
});

after(async () => {
  // Delete in reverse FK order
  if (pkgIds.length) {
    await pool.query(
      `DELETE FROM expert_templates WHERE id = ANY($1::varchar[])`,
      [pkgIds],
    );
  }
  await pool.query(
    `DELETE FROM provider_services WHERE user_id = $1`,
    [userId],
  );
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await pool.end();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("unifiedSearch – Tier 1: full-text search", () => {
  it("returns all active/approved services at the location when no query given", async () => {
    const result = await storage.unifiedSearch({ location: mainLoc });
    const ids = result.services.map((s) => s.id);

    assert.ok(result.total >= 4, `expected ≥ 4 results, got ${result.total}`);
    assert.ok(ids.includes(svcBambooName), "Bamboo Forest Walk must be in results");
    assert.ok(ids.includes(svcBambooDesc), "Morning Trail Run must be in results");
    assert.ok(ids.includes(svcSnorkel),    "Snorkeling Adventure must be in results");
    assert.ok(ids.includes(svcYacht),      "Luxury Yacht Charter must be in results");
    assert.strictEqual(result.suggestion, null);
  });

  it("finds the correct service via exact FTS match on name", async () => {
    const result = await storage.unifiedSearch({
      query: "bamboo forest walk",
      location: mainLoc,
    });

    assert.ok(result.total > 0, "FTS should match at least one service");
    const ids = result.services.map((s) => s.id);
    assert.ok(ids.includes(svcBambooName), "Bamboo Forest Walk must appear in FTS results");
    assert.strictEqual(result.suggestion, null, "suggestion must be null when FTS finds results");
  });

  it("ranks the name-match (weight A) above the description-match (weight B) for the same query", async () => {
    // "bamboo forest" appears in: A's NAME and B's DESCRIPTION.
    // ts_rank with setweight A > B must place A before B.
    const result = await storage.unifiedSearch({
      query: "bamboo forest",
      location: mainLoc,
    });

    assert.ok(result.total >= 2, "both bamboo services must match");
    const ids = result.services.map((s) => s.id);
    const posA = ids.indexOf(svcBambooName);
    const posB = ids.indexOf(svcBambooDesc);
    assert.ok(posA !== -1, "name-match service must be in results");
    assert.ok(posB !== -1, "description-match service must be in results");
    assert.ok(
      posA < posB,
      `name-match (idx ${posA}) must rank before description-match (idx ${posB}) — ` +
      `setweight('A') must outrank setweight('B')`,
    );
  });
});

describe("unifiedSearch – Tier 2: trigram fallback (typo tolerance)", () => {
  it("finds 'Bamboo Forest Walk' when the query has a doubled letter (bambooo)", async () => {
    // 'bambooo' fails FTS (not an English lexeme), but
    // word_similarity('bambooo', 'Bamboo Forest Walk') ≈ 0.71 > threshold 0.35 → trigram fires.
    const result = await storage.unifiedSearch({
      query: "bambooo",
      location: mainLoc,
    });

    assert.ok(result.total > 0, "trigram fallback must find 'Bamboo Forest Walk' for 'bambooo'");
    const ids = result.services.map((s) => s.id);
    assert.ok(ids.includes(svcBambooName), "'Bamboo Forest Walk' must be in trigram results");
    assert.strictEqual(result.suggestion, null, "suggestion must be null when trigram finds results");
  });

  it("finds 'Snorkeling Adventure' for the common misspelling 'snorkling'", async () => {
    // 'snorkling' (missing 'e') fails FTS; word_similarity ≈ 0.50 > 0.35 → trigram fires.
    const result = await storage.unifiedSearch({
      query: "snorkling",
      location: mainLoc,
    });

    assert.ok(result.total > 0, "trigram fallback must find 'Snorkeling Adventure' for 'snorkling'");
    const ids = result.services.map((s) => s.id);
    assert.ok(ids.includes(svcSnorkel), "'Snorkeling Adventure' must appear for 'snorkling'");
  });
});

describe("unifiedSearch – Tier 3: 'Did you mean?' suggestion", () => {
  it("returns suggestion=null for a completely garbled query with no similar service names", async () => {
    // 'xzqxzq999' shares no trigrams with any fixture service name →
    // FTS total=0, trigram total=0, suggestion=null (similarity threshold > 0.2 filters it out).
    const result = await storage.unifiedSearch({
      query: "xzqxzq999",
      location: mainLoc,
    });

    assert.strictEqual(result.total, 0, "garbled query must return 0 services");
    assert.strictEqual(result.suggestion, null, "no suggestion must fire for completely unrelated string");
  });

  it("returns a suggestion when both FTS and trigram miss but a service name is close", async () => {
    // 'zephir lagone' is a garbled version of 'Zephyr Lagoon Voyage' (at suggLoc, NOT mainLoc).
    // Searching at mainLoc means:
    //   – Tier 1 (FTS, location-filtered) → 0 results (no service at mainLoc has those stems)
    //   – Tier 2 (trigram, location-filtered) → 0 results (no service at mainLoc has trigram match)
    //   – Tier 3 (suggestion, NO location filter) → finds 'Zephyr Lagoon Voyage'
    //     because similarity('Zephyr Lagoon Voyage', 'zephir lagone') > 0.2
    //
    // This mirrors the real UX: "no results in City A, but did you mean a service in City B?"
    const result = await storage.unifiedSearch({
      query: "zephir lagone",
      location: mainLoc,   // mainLoc has no service matching this query
    });

    assert.strictEqual(result.total, 0, "tier 1+2 must find nothing at mainLoc for this query");
    assert.ok(
      result.suggestion !== null,
      "tier 3 suggestion must fire — 'Zephyr Lagoon Voyage' has similarity > 0.2 to 'zephir lagone'",
    );
    assert.strictEqual(
      result.suggestion,
      "Zephyr Lagoon Voyage",
      `suggestion must point to 'Zephyr Lagoon Voyage', got '${result.suggestion}'`,
    );
  });
});

describe("unifiedSearch – SQL-side price & rating filters", () => {
  it("minPrice and maxPrice filter numerically in SQL (not post-limit Node.js)", async () => {
    // $80 service (svcMid) must be returned; $30 (svcCheap) and $500 (svcPricey) must not.
    const result = await storage.unifiedSearch({
      location: mainLoc,
      minPrice: 60,
      maxPrice: 200,
    });

    const ids = result.services.map((s) => s.id);
    assert.ok(ids.includes(svcMid),    "$80 service must be within [60, 200]");
    assert.ok(!ids.includes(svcCheap), "$30 service must be excluded by minPrice=60");
    assert.ok(!ids.includes(svcPricey),"$500 service must be excluded by maxPrice=200");
  });

  it("minRating filter excludes services whose averageRating is below the threshold", async () => {
    // rating 3.8 (svcCheap/B) must be excluded; 4.2 and 5.0 must be included.
    const result = await storage.unifiedSearch({
      location: mainLoc,
      minRating: 4.0,
    });

    const ids = result.services.map((s) => s.id);
    assert.ok(!ids.includes(svcCheap), "rating 3.8 must be excluded by minRating=4.0");
    assert.ok(ids.includes(svcMid),    "rating 4.2 must pass minRating=4.0");
    assert.ok(ids.includes(svcPricey), "rating 5.0 must pass minRating=4.0");
  });
});

describe("unifiedSearch – packagesTotal is the pre-LIMIT count", () => {
  it("packagesTotal reflects all matching packages, not the 6-package page cap", async () => {
    // 7 packages were inserted for pkgDest.  runPkgSearch caps the page at LIMIT 6,
    // but packagesTotal must be the COUNT(*) before the cap (7), not packages.length (6).
    const result = await storage.unifiedSearch({ location: pkgDest });

    assert.ok(
      result.packagesTotal >= 7,
      `packagesTotal must be ≥ 7 (all inserted packages), got ${result.packagesTotal}`,
    );
    assert.ok(
      result.packages.length <= 6,
      `packages page must be capped at 6, got ${result.packages.length}`,
    );
    assert.ok(
      result.packagesTotal > result.packages.length,
      "packagesTotal must exceed the page length, proving it is the pre-LIMIT count",
    );
  });
});
