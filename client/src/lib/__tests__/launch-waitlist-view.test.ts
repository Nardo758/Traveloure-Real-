/**
 * LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the waitlist page's and the blog CTA's pure rules.
 *
 *   V1  The blog CTA shows only in waitlist mode, only on a post about the launch market, names the post as
 *       `<market>_blog_cta:<slug>` and lands on the main form.
 *   V2  The page's source is checked against the allowlist pattern (else the page's own value); `?blocked=1` is
 *       reported; an unknown market sends no source.
 *   V3  The server's body schema is a strict allowlist: role-scoped fields, required provider fields, the month
 *       shape and the worry cap; the normalisers drop what they cannot vouch for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blogWaitlistHref, waitlistSourceFromSearch } from "../launch-waitlist-view";
import {
  WAITLIST_WORRY_MAX,
  blogCtaSource,
  normalizeWaitlistEmail,
  normalizeWaitlistSource,
  waitlistJoinBodySchema,
  waitlistPageSource,
} from "@shared/launch-waitlist";

test("V1 — the blog CTA", () => {
  const waitlist = { mode: "waitlist" as const, launchMarketSlug: "kyoto" };
  assert.equal(
    blogWaitlistHref({ slug: "kyoto-autumn", marketSlug: "kyoto" }, waitlist),
    "/kyoto?source=kyoto_blog_cta%3Akyoto-autumn#join",
  );
  assert.equal(blogWaitlistHref({ slug: "lisbon-food", marketSlug: "lisbon" }, waitlist), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: null }, waitlist), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, { mode: "open", launchMarketSlug: "kyoto" }), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, null), null);
  assert.equal(blogWaitlistHref({ slug: "x", marketSlug: "kyoto" }, { mode: "waitlist", launchMarketSlug: null }), null);
  assert.equal(blogWaitlistHref({ slug: "../x", marketSlug: "kyoto" }, waitlist), "/kyoto#join");
});

test("V2 — the page's source", () => {
  assert.deepEqual(waitlistSourceFromSearch("?blocked=1", "kyoto"), { source: "kyoto_waitlist_page", blocked: true });
  assert.deepEqual(waitlistSourceFromSearch("?source=kyoto_blog_cta:kyoto-autumn", "kyoto"), {
    source: "kyoto_blog_cta:kyoto-autumn",
    blocked: false,
  });
  assert.equal(waitlistSourceFromSearch("?source=billboard", "kyoto").source, "kyoto_waitlist_page");
  assert.equal(waitlistSourceFromSearch("?source=lisbon_blog_cta:x", "kyoto").source, "kyoto_waitlist_page");
  assert.equal(waitlistSourceFromSearch("", "kyoto").source, "kyoto_waitlist_page");
  assert.deepEqual(waitlistSourceFromSearch("?blocked=1", null), { source: null, blocked: true });
});

test("V3 — the body allowlist and the normalisers", () => {
  const ok = (b: unknown) => waitlistJoinBodySchema.safeParse(b).success;
  assert.equal(ok({ email: "a@b.co" }), true);
  assert.equal(ok({ email: "a@b.co", role: "traveler", tripType: "foliage", roughMonth: "2027-11", worry: "crowds" }), true);
  assert.equal(ok({ email: "a@b.co", marketSlug: "lisbon" }), false, "an unknown key is refused");
  assert.equal(ok({ email: "nope" }), false);
  assert.equal(ok({ email: "a@b.co", roughMonth: "2027-13" }), false);
  assert.equal(ok({ email: "a@b.co", worry: "x".repeat(WAITLIST_WORRY_MAX + 1) }), false);
  assert.equal(ok({ email: "a@b.co", tripType: "honeymoon" }), false);
  assert.equal(ok({ email: "a@b.co", contactName: "Aki" }), false, "a traveler may not send provider fields");
  assert.equal(ok({ email: "a@b.co", role: "provider", contactName: "Aki", serviceType: "guide_planner" }), true);
  assert.equal(ok({ email: "a@b.co", role: "provider", serviceType: "guide_planner" }), false, "provider name is required");
  assert.equal(ok({ email: "a@b.co", role: "provider", contactName: "Aki" }), false, "provider service type is required");
  assert.equal(ok({ email: "a@b.co", role: "provider", contactName: "Aki", serviceType: "guide_planner", tripType: "proposal" }), false);
  assert.equal(ok({ email: "a@b.co", referrerUserId: "u1" }), false);
  assert.equal(waitlistPageSource("kyoto"), "kyoto_waitlist_page");
  assert.equal(waitlistPageSource("new-york"), "new_york_waitlist_page");
  assert.equal(blogCtaSource("kyoto", "Kyoto-Autumn "), "kyoto_blog_cta:kyoto-autumn");
  assert.equal(blogCtaSource("kyoto", "../x"), null);
  assert.equal(normalizeWaitlistSource(undefined, "kyoto"), "kyoto_waitlist_page");
  assert.equal(normalizeWaitlistSource("KYOTO_BLOG_CTA:a-b", "kyoto"), "kyoto_blog_cta:a-b");
  assert.equal(normalizeWaitlistSource("kyoto_blog_cta:<x>", "kyoto"), "kyoto_waitlist_page");
  assert.equal(normalizeWaitlistEmail("  A@B.Co "), "a@b.co");
});
