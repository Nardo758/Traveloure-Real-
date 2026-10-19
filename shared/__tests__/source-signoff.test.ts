/**
 * CS-1 item 1 — the source sign-off rules, pure (ledger `2026-10-18-cs1-source-signoff`).
 *
 *   SS1  NULL sign-off reads as pending; only approved/rejected are recorded states
 *   SS2  ruling 1: link_out and link_out_no_link force the adapter to `manual`; reading classes keep theirs
 *   SS3  activation needs an approved sign-off AND a terms class
 *   SS4  a machine fetches only an approved, reading-class source that allows automated access
 *   SS5  the manual recheck list: reading class, automated access not "yes"
 *   SS6  the terms class and the automated-access answer are sign-off-bound
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNOFF_BOUND_FIELDS,
  TERMS_CLASSES,
  adapterForTermsClass,
  autoFetchAllowed,
  needsManualRecheck,
  signoffAllowsActivation,
  signoffStatusOf,
} from "../source-signoff";

test("SS1 — NULL reads as pending", () => {
  assert.equal(signoffStatusOf({ signoffStatus: null }), "pending");
  assert.equal(signoffStatusOf({}), "pending");
  assert.equal(signoffStatusOf({ signoffStatus: "approved" }), "approved");
  assert.equal(signoffStatusOf({ signoffStatus: "rejected" }), "rejected");
  assert.equal(signoffStatusOf({ signoffStatus: "made_up" }), "pending");
  assert.deepEqual([...TERMS_CLASSES], ["store", "extract", "link_out", "link_out_no_link"]);
});

test("SS2 — a link-out class forces adapter manual", () => {
  assert.equal(adapterForTermsClass("link_out", "tavily_extract"), "manual");
  assert.equal(adapterForTermsClass("link_out_no_link", "api"), "manual");
  assert.equal(adapterForTermsClass("extract", "tavily_extract"), "tavily_extract");
  assert.equal(adapterForTermsClass(null, "tavily_extract"), "tavily_extract");
});

test("SS3 — activation needs approved + a terms class", () => {
  assert.equal(signoffAllowsActivation({ signoffStatus: "approved", termsClass: "extract" }), true);
  assert.equal(signoffAllowsActivation({ signoffStatus: "approved", termsClass: null }), false);
  assert.equal(signoffAllowsActivation({ signoffStatus: null, termsClass: "extract" }), false);
  assert.equal(signoffAllowsActivation({ signoffStatus: "rejected", termsClass: "link_out" }), false);
});

test("SS4 — automated fetch: approved, reading class, access allowed", () => {
  assert.equal(autoFetchAllowed({ signoffStatus: "approved", termsClass: "extract", automatedAccessAllowed: true }), true);
  assert.equal(autoFetchAllowed({ signoffStatus: "approved", termsClass: "store", automatedAccessAllowed: true }), true);
  assert.equal(autoFetchAllowed({ signoffStatus: "approved", termsClass: "extract", automatedAccessAllowed: false }), false);
  assert.equal(autoFetchAllowed({ signoffStatus: "approved", termsClass: "extract", automatedAccessAllowed: null }), false, "not answered is not yes");
  assert.equal(autoFetchAllowed({ signoffStatus: "approved", termsClass: "link_out", automatedAccessAllowed: true }), false);
  assert.equal(autoFetchAllowed({ signoffStatus: null, termsClass: "extract", automatedAccessAllowed: true }), false);
});

test("SS5 — the manual recheck list", () => {
  assert.equal(needsManualRecheck({ termsClass: "extract", automatedAccessAllowed: false }), true);
  assert.equal(needsManualRecheck({ termsClass: "store", automatedAccessAllowed: null }), true);
  assert.equal(needsManualRecheck({ termsClass: "extract", automatedAccessAllowed: true }), false);
  assert.equal(needsManualRecheck({ termsClass: "link_out", automatedAccessAllowed: false }), false, "a link-out source is never read");
  assert.equal(needsManualRecheck({ termsClass: null, automatedAccessAllowed: false }), false);
});

test("SS6 — sign-off-bound fields", () => {
  for (const f of ["homepage", "termsUrl", "licenseClass", "adapter", "termsClass", "automatedAccessAllowed"]) {
    assert.ok((SIGNOFF_BOUND_FIELDS as readonly string[]).includes(f), f);
  }
  assert.equal((SIGNOFF_BOUND_FIELDS as readonly string[]).includes("creditText"), false, "the credit line is not a terms change");
});
