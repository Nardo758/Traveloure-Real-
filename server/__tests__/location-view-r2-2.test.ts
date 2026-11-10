/**
 * R2-2 — the location view's two defects: a cached failure, and a country that was never derived.
 *
 * Phase 0 findings this pins:
 *   · `SECTION_TIMEOUT_MS = 12_000` (`withTimeout`) rejected the EVENTS section, whose promise
 *     awaited a live partner (Fever) search at the end — so a slow partner deleted the city's OWN
 *     events, which were already in hand;
 *   · the payload was cached unconditionally at the end of `getLocationView`, so the timed-out empty
 *     list was re-served from cache for the rest of the window (~0.2s repeats on the probe);
 *   · recommendations threw `country unknown — pass ?country=` even though an operating market
 *     knows its own country.
 *
 *   M1 the country is derived from the market, and only for a market we actually operate
 *   M2 a payload carrying ANY section error is not cacheable; a clean one is
 *   M3 the partner read is bounded BELOW the section budget, and the cache write asks M2's question
 *
 * Run: npx tsx --test server/__tests__/location-view-r2-2.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { locationViewCacheable, marketCountryFor } from "../services/location-view.service";

const SRC = fs.readFileSync("server/services/location-view.service.ts", "utf8");

const cleanSection = { error: null as string | null };
const cleanPayload = () => ({
  hero: { ...cleanSection },
  recommendations: { ...cleanSection },
  events: { ...cleanSection },
  neighborhoods: { ...cleanSection },
  gems: { ...cleanSection },
  services: { ...cleanSection },
  externalStubs: { ...cleanSection },
});

describe("R2-2 — country derived from the market", () => {
  it("M1 Kyoto is Japan, any casing; a city we do not operate is honestly null", () => {
    assert.equal(marketCountryFor("Kyoto"), "Japan");
    assert.equal(marketCountryFor("kyoto"), "Japan", "the market lookup is case-insensitive");
    assert.equal(marketCountryFor("  Kyoto  "), "Japan");
    assert.equal(marketCountryFor("Atlantis"), null, "not one of the eight ⇒ not captured, never a guess");
    assert.equal(marketCountryFor(""), null);
    assert.equal(marketCountryFor(null), null);
  });
});

describe("R2-2 — a failed read is never cached", () => {
  it("M2 one section error makes the payload uncacheable; a clean payload caches", () => {
    assert.equal(locationViewCacheable(cleanPayload()), true, "a fully-answered read caches");
    for (const section of Object.keys(cleanPayload()) as Array<keyof ReturnType<typeof cleanPayload>>) {
      const payload = cleanPayload();
      (payload[section] as { error: string | null }).error = "[location-view] events timed out after 12000ms";
      assert.equal(locationViewCacheable(payload), false, `${section} carrying an error must not be cached`);
    }
  });
});

describe("R2-2 — the wiring that makes the two fixes real", () => {
  it("M3 the partner read is bounded below the section budget, and the cache write asks M2", () => {
    assert.match(SRC, /const SECTION_TIMEOUT_MS = 12_000;/, "the section budget the probe saw");
    assert.match(SRC, /const PARTNER_EVENTS_TIMEOUT_MS = 3_000;/, "the partner gets its own, shorter budget");
    assert.match(
      SRC,
      /withTimeout\(\s*\n?\s*feverService\.searchEvents\(/,
      "the partner search is the call the budget wraps",
    );
    assert.match(SRC, /PARTNER_EVENTS_TIMEOUT_MS,\s*\n\s*"fever events"/, "…with the partner label");
    assert.match(SRC, /if \(locationViewCacheable\(payload\)\) \{/, "the write is guarded");
    assert.match(SRC, /countryForCall = marketCountryFor\(cityName\);/, "the country asks the market before giving up");
    // The old unconditional write must be gone, not merely shadowed.
    assert.doesNotMatch(
      SRC,
      /\n\s*locationViewCache\.set\(cacheKey, \{ payload, expiresAt: Date\.now\(\) \+ 5 \* 60 \* 1000 \}\);\n\n\s*return payload;/,
      "no unconditional cache write remains",
    );
  });
});
