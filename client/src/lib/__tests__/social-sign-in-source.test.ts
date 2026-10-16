/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`): a supply door's `?source=` tag rides the social round trip.
 *
 *   SS3  A supply sign-in carries the raw tag; a traveler sign-in never does; no tag adds nothing.
 *   SS4  The tag is read from the door's own query string, trimmed and capped, and absent when blank.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { socialSignInHref, supplySourceTag } from "../social-sign-in";

test("SS3 — a supply sign-in carries the tag; a traveler sign-in never does", () => {
  const supply = new URL(socialSignInHref("/api/login", { intent: "supply", returnTo: "/become-expert", source: "ig_dm" }), "https://x.test");
  assert.equal(supply.searchParams.get("intent"), "supply");
  assert.equal(supply.searchParams.get("source"), "ig_dm");
  assert.equal(socialSignInHref("/api/login", { intent: "traveler", source: "ig_dm" }), "/api/login");
  assert.equal(socialSignInHref("/api/auth/facebook", { intent: "supply", source: null }), "/api/auth/facebook?intent=supply");
});

test("SS4 — the tag is the door's own ?source=, trimmed, capped, absent when blank", () => {
  assert.equal(supplySourceTag("?source=kyoto_waitlist_page&x=1"), "kyoto_waitlist_page");
  assert.equal(supplySourceTag("?source=%20%20"), null);
  assert.equal(supplySourceTag(""), null);
  assert.equal(supplySourceTag(`?source=${"a".repeat(300)}`)?.length, 200);
});
