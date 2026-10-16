/**
 * LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the waitlist page's and the blog CTA's pure rules.
 *
 *   V1  The blog CTA shows only in waitlist mode, only on a post about the launch market, and names the post.
 *   V2  The page's source: `?blocked=1` is `signin`; `?source=` is allowlisted (else `other`); no source is `direct`.
 *   V3  The server's body schema is a strict allowlist and its normalisers drop what they cannot vouch for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blogWaitlistHref, waitlistSourceFromSearch } from "../launch-waitlist-view";
import { normalizeSourceRef, normalizeWaitlistEmail, normalizeWaitlistSource, waitlistJoinBodySchema } from "@shared/launch-waitlist";

test("V1 — the blog CTA", () => {
  const waitlist = { mode: "waitlist" as const, launchMarketSlug: "kyoto" };
  assert.equal(blogWaitlistHref({ slug: "kyoto-autumn", marketSlug: "kyoto" }, waitlist), "/kyoto?source=blog&ref=kyoto-autumn");
  assert.equal(blogWaitlistHref({ slug: "lisbon-food", marketSlug: "lisbon" }, waitlist), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: null }, waitlist), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, { mode: "open", launchMarketSlug: "kyoto" }), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, null), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, { mode: "waitlist", launchMarketSlug: null }), null);
});

test("V2 — the page's source", () => {
  assert.deepEqual(waitlistSourceFromSearch("?blocked=1"), { source: "signin", sourceRef: null, blocked: true });
  assert.deepEqual(waitlistSourceFromSearch("?source=blog&ref=kyoto-autumn"), { source: "blog", sourceRef: "kyoto-autumn", blocked: false });
  assert.equal(waitlistSourceFromSearch("?source=billboard").source, "other");
  assert.equal(waitlistSourceFromSearch("").source, "direct");
  assert.equal(waitlistSourceFromSearch("?ref=<script>").sourceRef, null);
});

test("V3 — the body allowlist and the normalisers", () => {
  assert.equal(waitlistJoinBodySchema.safeParse({ email: "a@b.co" }).success, true);
  assert.equal(waitlistJoinBodySchema.safeParse({ email: "a@b.co", marketSlug: "lisbon" }).success, false);
  assert.equal(waitlistJoinBodySchema.safeParse({ email: "nope" }).success, false);
  assert.equal(normalizeWaitlistSource("signin"), "signin");
  assert.equal(normalizeWaitlistSource(undefined), "direct");
  assert.equal(normalizeWaitlistSource("x"), "other");
  assert.equal(normalizeSourceRef("Kyoto-Autumn "), "kyoto-autumn");
  assert.equal(normalizeSourceRef("../x"), null);
  assert.equal(normalizeWaitlistEmail("  A@B.Co "), "a@b.co");
});
