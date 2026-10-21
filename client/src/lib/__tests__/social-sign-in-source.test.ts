/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`): a supply door's `?source=` tag rides the social round trip.
 * Guest-map social return (ledger `2026-10-21-guest-map-social-return`): every role's `/api/login` carries a
 * same-site return path, and an off-site one is omitted.
 *
 *   SS3  A supply sign-in carries the raw tag; a traveler sign-in never does; no tag adds nothing.
 *   SS4  The tag is read from the door's own query string, trimmed and capped, and absent when blank.
 *   SS5  A traveler sign-in carries the guest map (or any same-site path) and no intent or source.
 *   SS6  An off-site returnTo is left off the href.
 *   SS7  The sign-in modal builds `/api/login` through socialSignInHref for every role.
 */
import { readFileSync } from "node:fs";
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

test("SS5 — a traveler sign-in carries the page to return to, and no intent or source", () => {
  const guest = new URL(socialSignInHref("/api/login", { returnTo: "/plans/new?view=map" }), "https://x.test");
  assert.equal(guest.pathname, "/api/login");
  assert.equal(guest.searchParams.get("returnTo"), "/plans/new?view=map");
  assert.equal(guest.searchParams.get("intent"), null);
  assert.equal(guest.searchParams.has("source"), false);

  const supply = new URL(
    socialSignInHref("/api/login", { intent: "supply", returnTo: "/become-expert?type=local_expert", source: "ig_dm" }),
    "https://x.test",
  );
  assert.equal(supply.searchParams.get("returnTo"), "/become-expert?type=local_expert");
  assert.equal(supply.searchParams.get("intent"), "supply");
  assert.equal(supply.searchParams.get("source"), "ig_dm");
});

test("SS6 — an off-site returnTo is left off the href", () => {
  for (const bad of ["//evil.example", "https://evil.example/x", "/\\evil.example", "evil", "", `/${"a".repeat(600)}`, "/x\u0000y"]) {
    assert.equal(socialSignInHref("/api/login", { intent: "traveler", returnTo: bad }), "/api/login", JSON.stringify(bad));
    assert.equal(
      socialSignInHref("/api/login", { intent: "supply", returnTo: bad, source: "ig_dm" }),
      "/api/login?intent=supply&source=ig_dm",
      JSON.stringify(bad),
    );
  }
});

test("SS7 — the sign-in modal builds /api/login through socialSignInHref for every role", () => {
  const src = readFileSync(new URL("../../components/SignInModal.tsx", import.meta.url), "utf8");
  const start = src.indexOf("const handleReplitSignIn");
  const end = src.indexOf("\n  return (", start);
  const fn = src.slice(start, end);
  assert.ok(start > 0 && end > start, "handleReplitSignIn is in the modal");
  assert.match(fn, /window\.location\.pathname/);
  assert.match(fn, /socialSignInHref\(\s*"\/api\/login"/);
  assert.doesNotMatch(fn, /\?\s*socialSignInHref/);
  assert.doesNotMatch(fn, /:\s*"\/api\/login"/);
});
