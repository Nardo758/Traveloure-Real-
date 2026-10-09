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
