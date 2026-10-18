/**
 * FD-2 — content tiers, pure rules (Phase 0 `docs/planning/briefs/fd-content-tiers-phase0.md` §B/§D).
 *
 *   CT1  admitTag refuses an unknown or missing value by name; a valid pair is admitted
 *   CT2  ruling 1's fixed mapping: restricted→display_in_plan, official→link_only,
 *        editorial→link_only, partner→internal; unknown/absent ⇒ null, never guessed
 *   CT3  precedence: hard facts official > local > aggregator; judgment local > official > aggregator
 *   CT4  untagged candidates never resolve (ruling 3), and ties keep input order
 *   CT5  ruling 8: an expired local row is not live; a public row is not subject; NULL expiry is live;
 *        a note quoting an expired official fact expires with it
 *   CT6  draft eligibility: untagged never; expired local never; the free draft takes public only
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admitTag,
  reuseClassForLicense,
  resolveFactPrecedence,
  isLiveLocal,
  isDraftEligible,
  isFreeDraftEligible,
} from "../content-tiers";

const NOW = new Date("2026-10-09T12:00:00Z");
const PAST = "2026-10-01T00:00:00Z";
const FUTURE = "2026-11-01T00:00:00Z";

test("CT1 — admitTag refuses unknown values by name", () => {
  assert.deepEqual(admitTag("local", "reusable"), { ok: true, sourceClass: "local", reuseClass: "reusable" });
  assert.deepEqual(admitTag("secret", "reusable"), { ok: false, refused: ["source_class:secret"] });
  assert.deepEqual(admitTag("public", undefined), { ok: false, refused: ["reuse_class:undefined"] });
  assert.equal(admitTag(null, null).ok, false);
});

test("CT2 — ruling 1's license → reuse mapping", () => {
  assert.equal(reuseClassForLicense("restricted"), "display_in_plan");
  assert.equal(reuseClassForLicense("official"), "link_only");
  assert.equal(reuseClassForLicense("editorial"), "link_only");
  assert.equal(reuseClassForLicense("partner"), "internal");
  assert.equal(reuseClassForLicense("unknown"), null);
  assert.equal(reuseClassForLicense(null), null);
  assert.equal(reuseClassForLicense("toString"), null);
});

test("CT3 — hard facts: official > local > aggregator; judgment: local first", () => {
  const official = { id: "o", sourceClass: "public", license: "official" };
  const local = { id: "l", sourceClass: "local" };
  const aggregator = { id: "a", sourceClass: "public", license: "restricted" };
  const order = (t: string) => resolveFactPrecedence([aggregator, local, official], t).map((c) => c.id);
  assert.deepEqual(order("hours"), ["o", "l", "a"]);
  assert.deepEqual(order("ticketing_rule"), ["o", "l", "a"]);
  assert.deepEqual(order("tip"), ["l", "o", "a"]);
  assert.deepEqual(order("description"), ["l", "o", "a"]);
});

test("CT4 — untagged candidates never resolve; ties keep input order", () => {
  const out = resolveFactPrecedence(
    [{ id: "x", sourceClass: null }, { id: "p1", sourceClass: "public" }, { id: "p2", sourceClass: "public" }, { id: "y", sourceClass: "bogus" }],
    "hours",
  );
  assert.deepEqual(out.map((c) => c.id), ["p1", "p2"]);
});

test("CT5 — expiry hides an expired local row at build time (ruling 8)", () => {
  assert.equal(isLiveLocal({ sourceClass: "local", expiresAt: PAST }, NOW), false);
  assert.equal(isLiveLocal({ sourceClass: "local", expiresAt: FUTURE }, NOW), true);
  assert.equal(isLiveLocal({ sourceClass: "local", expiresAt: null }, NOW), true);
  assert.equal(isLiveLocal({ sourceClass: "public", expiresAt: PAST }, NOW), true);
  assert.equal(isLiveLocal({ sourceClass: "local", expiresAt: FUTURE, quotedOfficialExpiresAt: PAST }, NOW), false);
});

test("CT6 — draft eligibility: untagged never, expired local never, free draft public only", () => {
  assert.equal(isDraftEligible({ sourceClass: null }, NOW), false);
  assert.equal(isDraftEligible({ sourceClass: "local", expiresAt: PAST }, NOW), false);
  assert.equal(isDraftEligible({ sourceClass: "local" }, NOW), true);
  assert.equal(isFreeDraftEligible({ sourceClass: "local" }, NOW), false);
  assert.equal(isFreeDraftEligible({ sourceClass: "public" }, NOW), true);
  assert.equal(isFreeDraftEligible({ sourceClass: undefined }, NOW), false);
});

import { itemSourceClass, placeFactTags } from "../content-tiers";

test("CT7 — ruling 9: an item's source class comes from the server's own facts", () => {
  assert.equal(itemSourceClass({ origin: "traveler" }), "public");
  assert.equal(itemSourceClass({ origin: "assistant" }), "public");
  assert.equal(itemSourceClass({ origin: "ai" }), "public");
  assert.equal(itemSourceClass({ origin: "ai", fromLocalInput: true }), "local");
  assert.equal(itemSourceClass({ origin: "expert" }), "local");
  assert.equal(itemSourceClass({ origin: "traveler", gemId: "g1" }), "local");
  assert.equal(itemSourceClass({ origin: null }), null);
  assert.equal(itemSourceClass({}), null);
});

test("CT8 — a place fact is born tagged from its origin and license", () => {
  assert.deepEqual(placeFactTags("places_api", "restricted"), { sourceClass: "public", reuseClass: "display_in_plan" });
  assert.deepEqual(placeFactTags("crawled", "official"), { sourceClass: "public", reuseClass: "link_only" });
  assert.deepEqual(placeFactTags("crawled", "editorial"), { sourceClass: "public", reuseClass: "link_only" });
  assert.deepEqual(placeFactTags("crawled", "partner"), { sourceClass: "public", reuseClass: "internal" });
  assert.deepEqual(placeFactTags("crawled", null), { sourceClass: "public", reuseClass: "link_only" });
  assert.deepEqual(placeFactTags("expert_nugget", null), { sourceClass: "local", reuseClass: "reusable" });
  assert.equal(placeFactTags("gem", null), null);
});

import { FACT_ORIGINS, PAGE_READ_ORIGINS } from "../content-facts";

// EV-P0 PR 3 (ledger `2026-10-18-fact-tags-exhaustive`): the pinned table. Every origin in FACT_ORIGINS has a
// row here, so a new origin fails this test until someone decides its tier and pins it (§13).
const PINNED_FACT_TAGS: Record<string, { sourceClass: string; reuseClass: string } | null> = {
  platform_listing: null,
  expert_nugget: { sourceClass: "local", reuseClass: "reusable" },
  gem: null,
  event: null,
  hotel_cache: null,
  places_api: { sourceClass: "public", reuseClass: "display_in_plan" },
  crawled: { sourceClass: "public", reuseClass: "link_only" },
  traveler_note: null,
  official_refresh: { sourceClass: "public", reuseClass: "link_only" },
  bot_proposal: { sourceClass: "public", reuseClass: "link_only" },
};

test("CT9 — placeFactTags is pinned for every origin, with an official licence", () => {
  assert.deepEqual([...FACT_ORIGINS].sort(), Object.keys(PINNED_FACT_TAGS).sort(), "every FACT_ORIGINS entry is pinned, and nothing else");
  for (const o of FACT_ORIGINS) {
    const lic = o === "places_api" ? "restricted" : "official";
    assert.deepEqual(placeFactTags(o, lic), PINNED_FACT_TAGS[o], o);
  }
  assert.equal(placeFactTags("not_an_origin", "official"), null, "an unknown origin has no tier");
  assert.equal(placeFactTags(null, "official"), null);
});

test("CT10 — every page-read origin follows the licence mapping, and an official feasibility fact is public whoever wrote it", () => {
  for (const o of PAGE_READ_ORIGINS) {
    assert.deepEqual(placeFactTags(o, "partner"), { sourceClass: "public", reuseClass: "internal" }, o);
    assert.deepEqual(placeFactTags(o, "restricted"), { sourceClass: "public", reuseClass: "display_in_plan" }, o);
  }
  for (const ft of ["last_admission", "last_service"]) {
    assert.deepEqual(placeFactTags("expert_nugget", "official", ft), { sourceClass: "public", reuseClass: "link_only" }, ft);
    assert.deepEqual(placeFactTags("expert_nugget", null, ft), { sourceClass: "local", reuseClass: "reusable" }, `${ft} without an official licence stays local`);
    assert.equal(placeFactTags("gem", "official", ft), null, "a gem never becomes a feasibility fact");
  }
});
