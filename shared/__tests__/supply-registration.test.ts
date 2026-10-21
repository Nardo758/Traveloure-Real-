/**
 * Supply registration (S-08, S-18, S-19, S-21).
 * Ledger `2026-10-21-supply-registration-fixes`.
 *
 * Phone is optional on step 1 and still checked when someone types one.
 * Insurance and licences store Not applicable as false, distinct from an
 * unanswered null. Dinner host is a registry category. The provider review
 * line is built from the live keep-rate helper and carries no typed percent.
 *
 * Fixture contacts are invented. No real phone, email or street address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { insertLocalExpertFormSchema, insertServiceProviderFormSchema, OCCASION_ROLE_KEYS } from "../schema";
import {
  ATTESTATION_NOT_APPLICABLE,
  ATTESTATION_YES,
  OPTIONAL_PHONE_ERROR,
  PROVIDER_BUSINESS_TYPES,
  attestationLabel,
  optionalPhoneError,
  restoreAttestationAnswers,
} from "../supply-registration";

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("S-08: a blank phone is allowed and a typed one is checked", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.equal(optionalPhoneError(blank), null);
  }
  assert.equal(optionalPhoneError("5550100199"), null);
  assert.equal(optionalPhoneError("+1 (555) 010-0199"), null);
  assert.equal(optionalPhoneError("abc"), OPTIONAL_PHONE_ERROR);
  assert.equal(optionalPhoneError("12345"), OPTIONAL_PHONE_ERROR);
  assert.equal(optionalPhoneError("55501001995550199"), OPTIONAL_PHONE_ERROR);

  const located = { expertType: "travel_expert" as const, city: "Kyoto", country: "Japan" };
  assert.equal(insertLocalExpertFormSchema.safeParse(located).success, true);
  assert.equal(insertLocalExpertFormSchema.safeParse({ ...located, phone: null }).success, true);
  assert.equal(insertLocalExpertFormSchema.safeParse({ ...located, phone: "" }).success, true);
  const typed = insertLocalExpertFormSchema.safeParse({ ...located, phone: "5550100199" });
  assert.equal(typed.success, true);
  const bad = insertLocalExpertFormSchema.safeParse({ ...located, phone: "abc" });
  assert.equal(bad.success, false);
  if (!bad.success) {
    assert.equal(bad.error.issues.some((issue) => issue.message === OPTIONAL_PHONE_ERROR), true);
  }
});

test("S-18: Individual is a business type and dinner host is a reachable category", () => {
  assert.equal(PROVIDER_BUSINESS_TYPES[0], "Individual");
  assert.equal(new Set(PROVIDER_BUSINESS_TYPES).size, PROVIDER_BUSINESS_TYPES.length);
  assert.equal(OCCASION_ROLE_KEYS.includes("dinner_host"), true);

  const sql = read("server/migrations/402_supply_registration.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS has_license BOOLEAN/);
  assert.match(sql, /'Dinner host'/);
  assert.match(sql, /'dinner-host'/);
  assert.match(sql, /'dinner_host'/);
  assert.match(sql, /Someone who hosts dinners for a small group at their own table\./);
  assert.match(sql, /Host a dinner for a small group\./);
  assert.match(sql, /'moderate'/);
  assert.doesNotMatch(sql, /0\.\d+/);
  assert.doesNotMatch(sql, /\d+%/);
});

test("S-19: Not applicable is stored as false and a blank stays unanswered", () => {
  assert.equal(attestationLabel(true), ATTESTATION_YES);
  assert.equal(attestationLabel(false), ATTESTATION_NOT_APPLICABLE);
  assert.equal(attestationLabel(null), null);
  assert.equal(attestationLabel(undefined), null);

  assert.deepEqual(restoreAttestationAnswers(undefined), {
    hasInsurance: null,
    hasLicense: null,
    attestationAnswers: true,
  });
  assert.deepEqual(restoreAttestationAnswers({ hasInsurance: false, hasLicense: false }), {
    hasInsurance: null,
    hasLicense: null,
    attestationAnswers: true,
  });
  assert.deepEqual(restoreAttestationAnswers({ hasInsurance: true }), {
    hasInsurance: true,
    hasLicense: null,
    attestationAnswers: true,
  });
  assert.deepEqual(
    restoreAttestationAnswers({ hasInsurance: false, hasLicense: true, attestationAnswers: true }),
    { hasInsurance: false, hasLicense: true, attestationAnswers: true },
  );

  const base = {
    businessName: "Fixture Host",
    name: "Fixture Host",
    email: "fixture-host@example.test",
    country: "Japan",
    address: "1 Fixture Street",
    businessType: "Individual",
  };
  const blank = insertServiceProviderFormSchema.safeParse({ ...base, mobile: "" });
  assert.equal(blank.success, true);
  if (blank.success) {
    assert.equal(blank.data.mobile, "");
    assert.equal(blank.data.hasInsurance, undefined);
    assert.equal(blank.data.hasLicense, undefined);
  }
  const na = insertServiceProviderFormSchema.safeParse({
    ...base,
    mobile: "5550100199",
    hasInsurance: false,
    hasLicense: false,
  });
  assert.equal(na.success, true);
  if (na.success) {
    assert.equal(na.data.hasInsurance, false);
    assert.equal(na.data.hasLicense, false);
  }
  const unanswered = insertServiceProviderFormSchema.safeParse({
    ...base,
    mobile: "   ",
    hasInsurance: null,
    hasLicense: null,
  });
  assert.equal(unanswered.success, true);
  if (unanswered.success) {
    assert.equal(unanswered.data.mobile, "");
    assert.equal(unanswered.data.hasInsurance, null);
    assert.equal(unanswered.data.hasLicense, null);
  }
  const badMobile = insertServiceProviderFormSchema.safeParse({ ...base, mobile: "abc" });
  assert.equal(badMobile.success, false);
  if (!badMobile.success) {
    assert.equal(badMobile.error.issues.some((issue) => issue.message === OPTIONAL_PHONE_ERROR), true);
  }
});

test("S-21: the provider review page asks the keep-line helper and types no percent", () => {
  const page = read("client/src/pages/services-provider.tsx");
  const expert = read("client/src/pages/travel-experts.tsx");
  const admin = read("client/src/pages/admin/providers.tsx");
  assert.match(page, /providerReviewKeepLine\(keepRates\)/);
  assert.doesNotMatch(page, /Providers keep/);
  assert.doesNotMatch(page, /You keep \d+/);
  assert.match(page, /Phone \(optional\)/);
  assert.match(page, /optionalPhoneError\(formData\.phone\) === null/);
  assert.doesNotMatch(page, /formData\.phone &&/);
  assert.match(expert, /Phone \(optional\)/);
  assert.match(expert, /optionalPhoneError\(formData\.phone\) === null/);
  assert.doesNotMatch(expert, /formData\.phone &&/);
  assert.match(admin, /attestationLabel\(/);
  assert.match(page, /Not applicable/);
});
