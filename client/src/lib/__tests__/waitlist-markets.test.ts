/**
 * LW-2 (ledger `2026-10-16-lw2-all-markets-waitlist`): the waitlist's city list and its words for a city other
 * than Kyoto. DB-free.
 *
 *   M1  The picker list IS `OPERATING_MARKETS` — same keys, same city names, same order; no second list.
 *   M2  A market resolves: absent ⇒ the launch market, an operating key ⇒ itself, anything else ⇒ UNKNOWN_MARKET.
 *   M3  Consent is per city: Kyoto keeps F1's line word for word; every other city reads "Email me when Traveloure
 *       opens in <city>."; each market's version is `f1-2026-10-15:<market>`.
 *   M4  No city but Kyoto is promised "be first to book", a date, experts or providers — in the shared copy and in
 *       the page's non-Kyoto branches, which read that shared copy rather than restating it.
 *   M5  The picker is a single select: the page posts ONE `market` and has no multi-city consent box.
 *
 * Run: npx tsx --test client/src/lib/__tests__/waitlist-markets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  WAITLIST_CONSENT_LINE,
  WAITLIST_MARKET_OPTIONS,
  WAITLIST_OTHER_CITY_PROMPT,
  resolveWaitlistMarket,
  waitlistConsentLine,
  waitlistConsentVersion,
  waitlistOtherCityDone,
  waitlistOtherCityJoinButton,
  waitlistOtherCityProviderDone,
  waitlistOtherCityProviderLine,
} from "@shared/launch-waitlist";

const PAGE = fs.readFileSync(path.join(process.cwd(), "client/src/pages/launch-waitlist.tsx"), "utf8");

describe("M1 — the picker list is OPERATING_MARKETS", () => {
  it("matches key for key, name for name, in order", () => {
    assert.deepEqual(
      WAITLIST_MARKET_OPTIONS.map((m) => [m.key, m.city]),
      OPERATING_MARKETS.map((m) => [m.marketKey, m.cityName]),
    );
    assert.deepEqual(
      WAITLIST_MARKET_OPTIONS.map((m) => m.key),
      ["kyoto", "goa", "mumbai", "jaipur", "edinburgh", "porto", "bogota", "cartagena"],
    );
  });
});

describe("M2 — resolving the market", () => {
  it("defaults to the launch market and refuses anything off the list", () => {
    assert.deepEqual(resolveWaitlistMarket(undefined, "kyoto"), { ok: true, market: "kyoto" });
    assert.deepEqual(resolveWaitlistMarket("", "kyoto"), { ok: true, market: "kyoto" });
    assert.deepEqual(resolveWaitlistMarket("goa", "kyoto"), { ok: true, market: "goa" });
    assert.deepEqual(resolveWaitlistMarket("lisbon", "kyoto"), { ok: false, code: "UNKNOWN_MARKET" });
  });
});

describe("M3 — consent is per city", () => {
  it("keeps Kyoto's F1 line and names every other city", () => {
    assert.equal(waitlistConsentLine("kyoto"), WAITLIST_CONSENT_LINE);
    assert.equal(waitlistConsentLine("goa"), "Email me when Traveloure opens in Goa.");
    assert.equal(waitlistConsentLine("cartagena"), "Email me when Traveloure opens in Cartagena.");
    for (const m of WAITLIST_MARKET_OPTIONS) assert.equal(waitlistConsentVersion(m.key), `f1-2026-10-15:${m.key}`);
  });
});

describe("M4 — no promise for another city beyond an email when it opens", () => {
  const banned = /first to book|book first|\b(19|20)\d{2}\b|january|february|march|april|may|june|july|august|september|october|november|december|expert|provider|guide/i;
  it("in the shared copy", () => {
    assert.equal(WAITLIST_OTHER_CITY_PROMPT, "Planning somewhere else? Tell us where.");
    for (const m of WAITLIST_MARKET_OPTIONS.filter((x) => x.key !== "kyoto")) {
      const lines = [
        waitlistConsentLine(m.key),
        waitlistOtherCityJoinButton(m.city),
        waitlistOtherCityDone(m.city, true),
        waitlistOtherCityDone(m.city, false),
        waitlistOtherCityProviderLine(m.city),
        waitlistOtherCityProviderDone(m.city),
      ];
      for (const line of lines) assert.doesNotMatch(line, banned, line);
    }
    assert.equal(waitlistOtherCityDone("Goa", true), "We'll email you when Traveloure opens in Goa.");
    assert.equal(waitlistOtherCityProviderLine("Goa"), "Know Goa? Send us your details and we'll be in touch when we open there.");
  });
  it("in the page: every non-Kyoto branch reads the shared copy", () => {
    assert.ok(PAGE.includes(": waitlistOtherCityDone(city, consent)}"));
    assert.ok(PAGE.includes(": waitlistOtherCityJoinButton(city)}"));
    assert.ok(PAGE.includes(": waitlistOtherCityProviderDone(city)}"));
    assert.ok(PAGE.includes("{waitlistOtherCityProviderLine(city)}"));
    assert.ok(PAGE.includes("{waitlistConsentLine(market)}"));
  });
});

describe("M5 — one city per submission", () => {
  it("posts one market from a single select, with one consent box", () => {
    assert.equal((PAGE.match(/<select id=\{id\}/g) ?? []).length, 1, "one picker component");
    assert.doesNotMatch(PAGE, /<select[^>]*multiple/);
    assert.equal((PAGE.match(/\n      market,\n/g) ?? []).length, 2, "each form posts one market");
    assert.equal((PAGE.match(/<ConsentTick /g) ?? []).length, 2, "one consent box per form");
  });
});
