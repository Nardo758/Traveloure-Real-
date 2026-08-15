/**
 * destination-matching.test.ts
 *
 * Confirms that the platform-catalog destination filter in
 * GET /api/search/experiences (content.routes.ts ~line 5855) correctly
 * normalises both the query and the service's stored location to their
 * city token (first comma-separated segment, lower-cased) before comparing.
 *
 * This means "Kyoto, Japan", "Kyoto", and "kyoto" all match a service
 * whose location column stores any of those variants, while a service
 * with no location or a completely different city is excluded.
 *
 * All tests are pure-logic (no DB, no network).
 *
 * Run with: npx tsx --test server/routes/__tests__/destination-matching.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── Replicate the predicate exactly as it appears in content.routes.ts ────────
//
// Source (lines ~5827–5862):
//   const dest = (destination || "").toLowerCase();
//   const destCity = dest.split(",")[0].trim();
//   const locCity  = (p.location || "").toLowerCase().split(",")[0].trim();
//   const destMatch = !dest || !destCity
//     || (!!locCity && (locCity.includes(destCity) || destCity.includes(locCity)));

function destMatch(destination: string | undefined, serviceLocation: string | undefined): boolean {
  const dest = (destination || "").toLowerCase();
  const destCity = dest.split(",")[0].trim();
  const locCity  = (serviceLocation || "").toLowerCase().split(",")[0].trim();
  return !dest || !destCity || (!!locCity && (locCity.includes(destCity) || destCity.includes(locCity)));
}

// ── Suite 1: "Kyoto, Japan" query (URL-decoded form of ?destination=Kyoto,+Japan) ──

describe('destination matching — "Kyoto, Japan" query', () => {
  it('matches a service stored as "Kyoto, Japan"', () => {
    assert.ok(destMatch("Kyoto, Japan", "Kyoto, Japan"));
  });

  it('matches a service stored as "Kyoto"', () => {
    assert.ok(destMatch("Kyoto, Japan", "Kyoto"));
  });

  it('matches a service stored as "kyoto" (lowercase)', () => {
    assert.ok(destMatch("Kyoto, Japan", "kyoto"));
  });

  it('matches a service stored as "Kyoto-shi, Kyoto Prefecture, Japan"', () => {
    // destCity = "kyoto", locCity = "kyoto-shi"
    // locCity.includes(destCity) → "kyoto-shi".includes("kyoto") → true
    // So the predicate correctly matches sub-city variants that contain the city token.
    assert.ok(destMatch("Kyoto, Japan", "Kyoto-shi, Kyoto Prefecture, Japan"));
  });

  it('does NOT match a service stored as "Tokyo, Japan"', () => {
    assert.equal(destMatch("Kyoto, Japan", "Tokyo, Japan"), false);
  });

  it('does NOT match a service stored as "Osaka"', () => {
    assert.equal(destMatch("Kyoto, Japan", "Osaka"), false);
  });

  it('does NOT match a service with no location', () => {
    assert.equal(destMatch("Kyoto, Japan", ""), false);
    assert.equal(destMatch("Kyoto, Japan", undefined), false);
  });
});

// ── Suite 2: bare "kyoto" query (lowercase, no country) ──────────────────────

describe('destination matching — "kyoto" query (lowercase, no country)', () => {
  it('matches a service stored as "Kyoto, Japan"', () => {
    assert.ok(destMatch("kyoto", "Kyoto, Japan"));
  });

  it('matches a service stored as "Kyoto"', () => {
    assert.ok(destMatch("kyoto", "Kyoto"));
  });

  it('matches a service stored as "kyoto"', () => {
    assert.ok(destMatch("kyoto", "kyoto"));
  });

  it('does NOT match Tokyo', () => {
    assert.equal(destMatch("kyoto", "Tokyo, Japan"), false);
  });

  it('does NOT match a service with no location', () => {
    assert.equal(destMatch("kyoto", ""), false);
    assert.equal(destMatch("kyoto", undefined), false);
  });
});

// ── Suite 3: "Kyoto" query (mixed-case, no country) ─────────────────────────

describe('destination matching — "Kyoto" query (mixed-case, no country)', () => {
  it('matches a service stored as "Kyoto, Japan"', () => {
    assert.ok(destMatch("Kyoto", "Kyoto, Japan"));
  });

  it('matches a service stored as "kyoto"', () => {
    assert.ok(destMatch("Kyoto", "kyoto"));
  });

  it('does NOT match Paris', () => {
    assert.equal(destMatch("Kyoto", "Paris, France"), false);
  });
});

// ── Suite 4: empty / absent destination (no-filter mode) ─────────────────────

describe('destination matching — empty destination (no filter)', () => {
  it('returns true for any service when destination is empty string', () => {
    assert.ok(destMatch("", "Tokyo, Japan"));
    assert.ok(destMatch("", "kyoto"));
    assert.ok(destMatch("", ""));
  });

  it('returns true for any service when destination is undefined', () => {
    assert.ok(destMatch(undefined, "Kyoto"));
    assert.ok(destMatch(undefined, undefined));
  });
});

// ── Suite 5: both "Kyoto, Japan" and "kyoto" return the same match set ───────
//
// This is the core claim: normalised city-token matching means
// the two query variants are semantically identical for platform-catalog filtering.

describe('destination matching — "Kyoto, Japan" and "kyoto" are equivalent', () => {
  const serviceLocations = [
    "Kyoto, Japan",
    "Kyoto",
    "kyoto",
    "Tokyo, Japan",
    "Tokyo",
    "Osaka",
    "",
    "Paris, France",
  ];

  for (const loc of serviceLocations) {
    it(`same result for location "${loc}"`, () => {
      assert.equal(
        destMatch("Kyoto, Japan", loc),
        destMatch("kyoto", loc),
        `destMatch("Kyoto, Japan", "${loc}") !== destMatch("kyoto", "${loc}")`
      );
    });
  }
});

// ── Suite 6: static source-code inspection ────────────────────────────────────
//
// Confirms the city-token normalisation is present in content.routes.ts and
// was not accidentally reverted.

describe("content.routes.ts — city-token normalisation present", () => {
  const routesPath = path.resolve(
    import.meta.dirname,
    "../content.routes.ts"
  );

  it("source file exists", () => {
    assert.ok(fs.existsSync(routesPath), `Not found: ${routesPath}`);
  });

  it('contains destCity = dest.split(",")[0].trim() normalisation', () => {
    const src = fs.readFileSync(routesPath, "utf-8");
    assert.ok(
      /destCity\s*=\s*dest\.split\(","\)\[0\]\.trim\(\)/.test(src),
      'Expected city-token extraction: destCity = dest.split(",")[0].trim()'
    );
  });

  it('contains locCity normalisation on the service location field', () => {
    const src = fs.readFileSync(routesPath, "utf-8");
    assert.ok(
      /locCity\s*=\s*\(p\.location.*\)\.toLowerCase\(\)\.split\(","\)\[0\]\.trim\(\)/.test(src),
      'Expected city-token extraction on service location: locCity = (p.location...).toLowerCase().split(",")[0].trim()'
    );
  });

  it("guards against empty locCity so a locationless service never matches", () => {
    const src = fs.readFileSync(routesPath, "utf-8");
    // The guard pattern is: !!locCity && (...)
    assert.ok(
      /!!locCity\s*&&\s*\(/.test(src),
      "Expected empty-locCity guard: !!locCity && (...)"
    );
  });

  it('route GET /api/search/experiences is declared', () => {
    const src = fs.readFileSync(routesPath, "utf-8");
    assert.ok(
      src.includes('"/api/search/experiences"'),
      'Expected router.get("/api/search/experiences", ...) to be present'
    );
  });
});
