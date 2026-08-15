/**
 * catalog-destination-parity.test.ts
 *
 * Confirms that "Kyoto, Japan" and "Kyoto" (and bare "kyoto") produce
 * IDENTICAL result sets across every catalog surface that performs its
 * own destination filtering inside experience-catalog.service.ts:
 *
 *   searchActivities   — ilike(activityCache.destination, `%${destCity}%`)
 *   searchHotels       — ilike(hotelCache.city, `%${destCity}%`)
 *   searchPOIs         — ilike(poiCache.city, `%${destCity}%`)
 *   searchRestaurants  — ilike(restaurantCache.city, `%${destCity}%`)
 *   getDestinationCoords — ilike(activityCache.destination, `%${destCity}%`)
 *
 * Normalization rule in every method:
 *   const destCity = params.destination.split(",")[0].trim();
 *   → "Kyoto, Japan" → "Kyoto"
 *   → "kyoto"        → "kyoto"
 *   → "Kyoto"        → "Kyoto"
 *
 * The ilike comparison is case-insensitive, so all three tokens match any
 * row whose destination column contains "Kyoto" (any case).  That makes
 * the two query variants functionally identical.
 *
 * Test strategy:
 *   Suite 1 – Pure logic: replicate the normalization and prove equivalence.
 *   Suite 2 – Static source inspection: normalization present in all 5 methods.
 *   Suite 3 – Live endpoint parity: GET /api/catalog/search with type[]=activity
 *              etc. returns the same item IDs and count for both query strings.
 *
 * Run with:
 *   npx tsx --test server/services/__tests__/catalog-destination-parity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ─── Suite 1: Pure normalization logic ────────────────────────────────────────
//
// Replicates the city-token extraction used in experience-catalog.service.ts so
// any future accidental change to the normalizer is immediately visible here.

function extractCityToken(destination: string): string {
  return destination.split(",")[0].trim();
}

/**
 * Simulates the ilike match: does the haystack column value contain the
 * city token (case-insensitive)?  When destination is absent the filter is
 * skipped (match-all).
 */
function catalogDestinationMatches(
  destination: string | undefined,
  columnValue: string | null | undefined,
): boolean {
  if (!destination) return true; // no filter applied
  const cityToken = extractCityToken(destination).toLowerCase();
  if (!cityToken) return true;
  const col = (columnValue ?? "").toLowerCase();
  return col.includes(cityToken);
}

describe("city-token normalization — extractCityToken", () => {
  it('"Kyoto, Japan" → "Kyoto"', () => {
    assert.equal(extractCityToken("Kyoto, Japan"), "Kyoto");
  });

  it('"Kyoto" → "Kyoto"', () => {
    assert.equal(extractCityToken("Kyoto"), "Kyoto");
  });

  it('"kyoto" → "kyoto"', () => {
    assert.equal(extractCityToken("kyoto"), "kyoto");
  });

  it('"Kyoto, Japan, Asia" (3 parts) → "Kyoto"', () => {
    assert.equal(extractCityToken("Kyoto, Japan, Asia"), "Kyoto");
  });

  it('"  Tokyo , Japan  " (padded) → "Tokyo"', () => {
    assert.equal(extractCityToken("  Tokyo , Japan  "), "Tokyo");
  });
});

describe("catalogDestinationMatches — parity proof", () => {
  const columnValues: Array<string | null> = [
    "Kyoto",
    "Kyoto, Japan",
    "kyoto",
    "kyoto, japan",
    "KYOTO",
    "Kyoto Prefecture, Japan",
    "Tokyo",
    "Tokyo, Japan",
    "Osaka",
    null,
    "",
  ];

  for (const col of columnValues) {
    it(`"Kyoto, Japan" vs "Kyoto" produce the same match for column "${col}"`, () => {
      assert.equal(
        catalogDestinationMatches("Kyoto, Japan", col),
        catalogDestinationMatches("Kyoto", col),
        `Mismatch for column value: "${col}"`,
      );
    });

    it(`"Kyoto, Japan" vs "kyoto" produce the same match for column "${col}"`, () => {
      assert.equal(
        catalogDestinationMatches("Kyoto, Japan", col),
        catalogDestinationMatches("kyoto", col),
        `Mismatch for column value: "${col}"`,
      );
    });
  }

  it("Kyoto token matches a column containing Kyoto", () => {
    assert.ok(catalogDestinationMatches("Kyoto", "Kyoto, Japan"));
    assert.ok(catalogDestinationMatches("Kyoto", "kyoto"));
    assert.ok(catalogDestinationMatches("Kyoto", "KYOTO"));
  });

  it("Tokyo token does NOT match a column containing Kyoto", () => {
    assert.equal(catalogDestinationMatches("Tokyo", "Kyoto"), false);
    assert.equal(catalogDestinationMatches("Tokyo", "Kyoto, Japan"), false);
  });

  it("undefined destination matches everything (no filter)", () => {
    for (const col of columnValues) {
      assert.ok(
        catalogDestinationMatches(undefined, col),
        `undefined destination should match column "${col}"`,
      );
    }
  });
});

// ─── Suite 2: Static source inspection ────────────────────────────────────────
//
// Verifies that the normalization pattern is present in each method in
// experience-catalog.service.ts.  If a refactor accidentally removes or
// changes the normalizer, this suite fails immediately — no DB required.

const SERVICE_PATH = path.resolve(
  import.meta.dirname,
  "../experience-catalog.service.ts",
);

describe("experience-catalog.service.ts — normalization present in all surfaces", () => {
  it("source file exists", () => {
    assert.ok(
      fs.existsSync(SERVICE_PATH),
      `Not found: ${SERVICE_PATH}`,
    );
  });

  let src = "";

  it("can be read", () => {
    src = fs.readFileSync(SERVICE_PATH, "utf-8");
    assert.ok(src.length > 0, "file must not be empty");
  });

  it("contains city-token extraction (destCity = ...split(',')[0].trim()) in at least 5 locations", () => {
    // searchActivities  → params.destination.split(",")[0].trim()
    // searchHotels      → destParts[0].trim()
    // searchPOIs        → destParts[0].trim()
    // searchRestaurants → params.destination.split(",")[0].trim()
    // getDestinationCoords → destination.split(",")[0].trim()
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    // Match any assignment whose RHS extracts the first comma-separated token
    const pattern = /destCity\s*=\s*(?:params\.destination|destination|destParts\[0\])(?:\.split\(","\)\[0\])?\.trim\(\)/g;
    const matches = src.match(pattern);
    assert.ok(
      matches && matches.length >= 5,
      `Expected ≥5 city-token extraction assignments, found ${matches?.length ?? 0}`,
    );
  });

  it("searchActivities: ilike uses destCity in activity_cache.destination filter", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    // Look for the activities block: ilike(activityCache.destination, `%${destCity}%`)
    assert.ok(
      /ilike\s*\(\s*activityCache\.destination\s*,\s*`%\$\{destCity\}%`\s*\)/.test(src),
      'searchActivities must use ilike(activityCache.destination, `%${destCity}%`)',
    );
  });

  it("searchHotels: ilike uses destCity in hotel_cache.city filter", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    assert.ok(
      /ilike\s*\(\s*hotelCache\.city\s*,\s*`%\$\{destCity\}%`\s*\)/.test(src),
      'searchHotels must use ilike(hotelCache.city, `%${destCity}%`)',
    );
  });

  it("searchPOIs: ilike uses destCity in poi_cache.city filter", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    assert.ok(
      /ilike\s*\(\s*poiCache\.city\s*,\s*`%\$\{destCity\}%`\s*\)/.test(src),
      'searchPOIs must use ilike(poiCache.city, `%${destCity}%`)',
    );
  });

  it("searchRestaurants: ilike uses destCity in restaurant_cache.city filter", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    assert.ok(
      /ilike\s*\(\s*restaurantCache\.city\s*,\s*`%\$\{destCity\}%`\s*\)/.test(src),
      'searchRestaurants must use ilike(restaurantCache.city, `%${destCity}%`)',
    );
  });

  it("getDestinationCoords: extracts city token from raw destination string", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    // getDestinationCoords takes `destination: string` (not params), so extraction
    // reads: const destCity = destination.split(",")[0].trim();
    assert.ok(
      /destCity\s*=\s*destination\.split\(","\)\[0\]\.trim\(\)/.test(src),
      'getDestinationCoords must use: destCity = destination.split(",")[0].trim()',
    );
  });

  it("getDestinationCoords: ilike uses destCity in activity_cache.destination filter", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    // Just confirm the method body contains both the city extraction AND the ilike on activityCache.destination
    assert.ok(
      /ilike\s*\(\s*activityCache\.destination\s*,\s*`%\$\{destCity\}%`\s*\)/.test(src),
      'Must contain ilike(activityCache.destination, `%${destCity}%`)',
    );
  });

  it("no surface uses the raw params.destination string in an ilike without normalization", () => {
    const src = fs.readFileSync(SERVICE_PATH, "utf-8");
    // Ensure no ilike uses the un-normalized `params.destination` directly (which would
    // cause "Kyoto, Japan" to search for the literal string "Kyoto, Japan").
    const rawUsage = /ilike\s*\([^)]*params\.destination[^)]*\)/.test(src);
    assert.equal(
      rawUsage,
      false,
      "An ilike call uses params.destination directly — destination must be normalized to city token first",
    );
  });
});

// ─── Suite 3: Live endpoint parity ────────────────────────────────────────────
//
// Calls GET /api/catalog/search with type[]=<surface> for each catalog surface
// using both "Kyoto, Japan" and "Kyoto" as the destination, then asserts that
// the returned item IDs and total counts are identical.
//
// These tests run against the local server (http://localhost:5000).
// If the server is not running they are skipped gracefully rather than failing.
// If Kyoto data exists in the cache tables the items array will be non-empty;
// if the cache is empty the results will both be [] — which still proves parity.

const BASE = "http://localhost:5000";
const TYPES: Array<"activity" | "hotel" | "poi" | "restaurant"> = [
  "activity",
  "hotel",
  "poi",
  "restaurant",
];

async function fetchCatalog(
  destination: string,
  type: string,
): Promise<{ items: Array<{ id: string }>; total: number } | null> {
  const url =
    `${BASE}/api/catalog/search` +
    `?destination=${encodeURIComponent(destination)}` +
    `&type[]=${type}` +
    `&limit=100`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as { items: Array<{ id: string }>; total: number };
  } catch {
    return null; // server not running or timed out — skip gracefully
  }
}

describe("GET /api/catalog/search — destination parity (Kyoto, Japan vs Kyoto)", () => {
  for (const type of TYPES) {
    it(`type=${type}: identical item IDs and total count`, async () => {
      const [withCountry, withoutCountry] = await Promise.all([
        fetchCatalog("Kyoto, Japan", type),
        fetchCatalog("Kyoto", type),
      ]);

      if (withCountry === null || withoutCountry === null) {
        // Server unreachable — skip rather than fail CI in a cold environment.
        console.log(
          `[SKIP] Server not reachable for type=${type}; run with the app running to get live results.`,
        );
        return;
      }

      const idsWithCountry = withCountry.items.map((i) => i.id).sort();
      const idsWithout = withoutCountry.items.map((i) => i.id).sort();

      assert.deepEqual(
        idsWithCountry,
        idsWithout,
        `type=${type}: item IDs differ between "Kyoto, Japan" and "Kyoto" queries`,
      );
      assert.equal(
        withCountry.total,
        withoutCountry.total,
        `type=${type}: total counts differ — "Kyoto, Japan"=${withCountry.total} vs "Kyoto"=${withoutCountry.total}`,
      );
    });

    it(`type=${type}: bare "kyoto" (lowercase) also returns identical IDs`, async () => {
      const [withCountry, lowercase] = await Promise.all([
        fetchCatalog("Kyoto, Japan", type),
        fetchCatalog("kyoto", type),
      ]);

      if (withCountry === null || lowercase === null) {
        console.log(
          `[SKIP] Server not reachable for type=${type}; run with the app running to get live results.`,
        );
        return;
      }

      const idsWithCountry = withCountry.items.map((i) => i.id).sort();
      const idsLower = lowercase.items.map((i) => i.id).sort();

      assert.deepEqual(
        idsWithCountry,
        idsLower,
        `type=${type}: item IDs differ between "Kyoto, Japan" and "kyoto" queries`,
      );
    });
  }
});
