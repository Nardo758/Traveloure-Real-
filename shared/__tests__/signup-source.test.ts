/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`): the supply sign-up source tag.
 *
 *   SS1  The allowed values are kept; the market-scoped ones follow the launch market setting.
 *   SS2  Anything else offered is `other`, never free text; no tag is null.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSignupSource } from "../signup-source";

test("SS1 — allowed values are kept", () => {
  for (const v of ["ig_dm", "contact_form", "email", "kyoto_waitlist_page", "kyoto_blog_cta:autumn-last-entry"]) {
    assert.equal(normalizeSignupSource(v, "kyoto"), v);
  }
  assert.equal(normalizeSignupSource(" IG_DM ", "kyoto"), "ig_dm");
  assert.equal(normalizeSignupSource("new_york_waitlist_page", "new-york"), "new_york_waitlist_page");
});

test("SS2 — anything else is other; no tag is null", () => {
  assert.equal(normalizeSignupSource("lisbon_waitlist_page", "kyoto"), "other");
  assert.equal(normalizeSignupSource("kyoto_waitlist_page", null), "other");
  assert.equal(normalizeSignupSource("kyoto_blog_cta:<script>", "kyoto"), "other");
  assert.equal(normalizeSignupSource("tiktok", "kyoto"), "other");
  assert.equal(normalizeSignupSource("", "kyoto"), null);
  assert.equal(normalizeSignupSource(undefined, "kyoto"), null);
  assert.equal(normalizeSignupSource(42, "kyoto"), null);
});
