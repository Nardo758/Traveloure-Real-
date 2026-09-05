/**
 * experts-public-projection.test.ts — ledger `2026-09-05-experts-public-projection`.
 *
 * CLAUDE.md §14's read clause and §19's allowlist posture applied to a RESPONSE. Third instance of
 * the read-projection class, after `2026-09-05-custom-venues-owner-scope` and
 * `2026-09-05-vendors-read-scope`, found by the sweep those two started.
 *
 * WHAT WAS WRONG. `storage.getExpertsWithProfiles` did `db.select().from(users)` and returned
 * `{ ...expert, ... }`, then deleted THREE names from it (`password`, `instagramAccessToken`,
 * `instagramUserId`). That is a denylist over a thirty-six-column table, and all three callers are
 * unauthenticated: `GET /api/experts`, `GET /api/experts/counts`, `GET /api/experts/:id`. So every
 * other `users` column went out for every expert-role account — `email`, `notificationEmail`,
 * `homeCity`, `stripeCustomerId`, `stripeAccountId`, `stripeAccountStatus`, `canReceivePayments`,
 * `commissionOverrideExpertSharePercent` (a §18 RATE), `suspensionReason`, `isDeleted`/`isSuspended`,
 * `preferences` — and the nested `expertForm` carried the whole `local_expert_forms` row with it,
 * `govId` and `travelLicence` (identity-document URLs) included.
 *
 * NEGATIVE SPACE. No DB and no HTTP here: the projection is a pure function (P*), and the rest is a
 * fact about the shipped artifacts (A*, S*). `server/routes.ts` imports the whole server, so an
 * HTTP test would need a database this lane cannot reach and would prove nothing these do not.
 * These assertions pin the PROJECTOR and its CALL SITES; they do not prove no OTHER route serves a
 * users row — that is what the sweep in the PR body covers, and no grep guard covers this class
 * yet (§18d).
 *
 * Run: npx tsx --test server/__tests__/experts-public-projection.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicExpert, toPublicExperts } from "../utils/expert-read-scope";
import { EXPERT_PUBLIC_FIELDS, EXPERT_FORM_PUBLIC_FIELDS } from "@shared/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(ROOT, "server", "routes.ts"), "utf-8");
const storageSrc = readFileSync(join(ROOT, "server", "storage.ts"), "utf-8");

/** Strip `//` comment lines: a prose mention of a column name is not a read of it. */
function uncommented(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
}

/**
 * A row shaped exactly like what `getExpertsWithProfiles` used to return: the full `users` row,
 * the full `local_expert_forms` row under `expertForm`, and the keys the method composes on top.
 */
function leakyExpertRow(): Record<string, any> {
  return {
    // ── users columns that MUST be published ─────────────────────────────────
    id: "expert-1",
    firstName: "Ada",
    lastName: "Lovelace",
    profileImageUrl: "https://cdn.example/ada.jpg",
    role: "local_expert",
    bio: "Kyoto, twenty years.",
    specialties: ["temples"],
    handle: "ada",
    createdAt: new Date("2024-03-01T00:00:00Z"),

    // ── users columns that MUST NOT be published ─────────────────────────────
    email: "ada@example.com",
    password: "$2b$10$hashhashhashhashhashhash",
    emailVerified: new Date("2024-03-02T00:00:00Z"),
    preferences: { storefront: { coverImageUrl: "https://cdn.example/cover.jpg" }, settings: { secret: 1 } },
    termsAcceptedAt: new Date("2024-03-01T00:00:00Z"),
    privacyAcceptedAt: new Date("2024-03-01T00:00:00Z"),
    termsVersion: "1.0",
    privacyVersion: "1.0",
    instagramUserId: "ig-1",
    instagramAccessToken: "IGQV-secret",
    authProvider: "email",
    commissionOverrideExpertSharePercent: "92.00",
    providerVerificationStatus: "verified",
    backgroundCheckConfirmed: true,
    preferredCurrency: "JPY",
    stripeCustomerId: "cus_123",
    stripeAccountId: "acct_123",
    stripeAccountStatus: "active",
    canReceivePayments: true,
    notificationEmail: "biz@example.com",
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    isDeleted: false,
    deletedAt: null,
    isSuspended: false,
    suspendedAt: null,
    suspensionReason: "n/a",
    vacationUntil: null,
    vacationMessage: null,
    emailBookingAlerts: true,
    homeCity: "Kyoto",

    // ── the whole local_expert_forms row ─────────────────────────────────────
    expertForm: {
      id: "form-1",
      userId: "expert-1",
      expertType: "local_expert",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+81 90 0000 0000",
      city: "Kyoto",
      country: "Japan",
      displayName: "Ada L.",
      headline: "Kyoto, on foot",
      destinations: ["Kyoto"],
      specialties: ["temples"],
      languages: ["English", "Japanese"],
      experienceTypes: [],
      specializations: [],
      selectedServices: [],
      neighborhoods: ["Gion"],
      localityProof: "utility_bill",
      knowledgeProofAnswers: [{ q: "…", a: "…" }],
      knowledgeScore: { overall: 91 },
      localSpecialties: ["kaiseki"],
      yearsOfExperience: "10+",
      bio: "Twenty years in Gion.",
      certifications: "JNTO guide",
      responseTime: "< 1 hour",
      hourlyRate: "$80-150/hour",
      govId: "https://files.example/govid-ada.pdf",
      travelLicence: "https://files.example/licence-ada.pdf",
      referralCode: "ADA10",
      bookingFeeType: "percentage",
      bookingFeePercentage: "12.5",
      bookingFeeFixed: "5.00",
      bookingFeeHourly: "20.00",
      minBookingFee: "10.00",
      stripeAccountId: "acct_123",
      stripeAccountStatus: "active",
      canReceivePayments: true,
      totalEarnings: "48210.00",
      pendingPayout: "1200.00",
      feeSettings: { split: 0.9 },
      payoutSchedule: "weekly",
      identityVerificationSessionId: "vs_123",
      identityVerificationStatus: "verified",
      stripeConnectStatus: "complete",
      status: "approved",
      rejectionMessage: null,
      paAccessGrantedBy: "admin-1",
      createdAt: new Date("2024-03-01T00:00:00Z"),
    },

    // ── composed by the storage method / list route (NOT users columns) ───────
    experienceTypes: [{ id: "et-1" }],
    selectedServices: [{ id: "svc-1" }],
    specializations: ["temples"],
    displayName: "Ada L.",
    headline: "Kyoto, on foot",
    city: "Kyoto",
    country: "Japan",
    languages: ["English", "Japanese"],
    averageRating: 4.87,
    reviewCount: 31,
    servicesCount: 3,
    serviceBookings: 44,
    expertRating: 4.9,
    expertReviewCount: 12,
  };
}

/** Every users-column key the old denylist let through and the allowlist must not. */
const MUST_NOT_APPEAR_TOP_LEVEL = [
  "email", "password", "emailVerified", "termsAcceptedAt", "privacyAcceptedAt",
  "termsVersion", "privacyVersion", "instagramUserId", "instagramAccessToken",
  "authProvider", "commissionOverrideExpertSharePercent", "providerVerificationStatus",
  "backgroundCheckConfirmed", "preferredCurrency", "stripeCustomerId", "stripeAccountId",
  "stripeAccountStatus", "canReceivePayments", "notificationEmail", "updatedAt",
  "isDeleted", "deletedAt", "isSuspended", "suspendedAt", "suspensionReason",
  "vacationUntil", "vacationMessage", "emailBookingAlerts", "homeCity",
] as const;

/** The `local_expert_forms` columns that must never reach an anonymous caller. */
const FORM_MUST_NOT_APPEAR = [
  "email", "phone", "govId", "travelLicence", "referralCode", "knowledgeScore",
  "knowledgeProofAnswers", "rejectionMessage", "identityVerificationSessionId",
  "stripeAccountId", "stripeAccountStatus", "canReceivePayments", "stripeConnectStatus",
  "totalEarnings", "pendingPayout", "feeSettings", "payoutSchedule", "hourlyRate",
  "bookingFeeType", "bookingFeePercentage", "bookingFeeFixed", "bookingFeeHourly",
  "minBookingFee", "paAccessGrantedBy", "status", "userId", "id",
] as const;

// ── P: the pure projector ────────────────────────────────────────────────────

test("P1 — no credential, contact or payment-identity column survives to the public shape", () => {
  const out = toPublicExpert(leakyExpertRow());
  for (const key of MUST_NOT_APPEAR_TOP_LEVEL) {
    assert.equal(key in out, false, `${key} must not be published on a public expert`);
  }
  // The four the brief names explicitly, asserted by value as well as by key so a future
  // "empty it out instead of dropping it" refactor still fails.
  assert.equal(JSON.stringify(out).includes("$2b$10$"), false, "no password hash anywhere in the payload");
  assert.equal(JSON.stringify(out).includes("ada@example.com"), false, "no account email anywhere in the payload");
  assert.equal(JSON.stringify(out).includes("IGQV-secret"), false, "no Instagram token anywhere in the payload");
  assert.equal(JSON.stringify(out).includes("acct_123"), false, "no Stripe Connect account id anywhere in the payload");
});

test("P2 — every allowlisted display field is still published, with its value intact", () => {
  const row = leakyExpertRow();
  const out = toPublicExpert(row);
  for (const key of EXPERT_PUBLIC_FIELDS) {
    assert.equal(key in out, true, `${key} is allowlisted and must be published`);
    assert.deepEqual(out[key], row[key], `${key} must be published verbatim`);
  }
});

test("P3 — composed (non-users) keys pass through untouched", () => {
  const row = leakyExpertRow();
  const out = toPublicExpert(row);
  for (const key of [
    "experienceTypes", "selectedServices", "specializations", "displayName", "headline",
    "city", "country", "languages", "averageRating", "reviewCount",
    "servicesCount", "serviceBookings", "expertRating", "expertReviewCount",
  ]) {
    assert.deepEqual(out[key], row[key], `${key} is composed by the caller, not a users column`);
  }
});

test("P4 — the nested expertForm is projected to its own allowlist", () => {
  const out = toPublicExpert(leakyExpertRow());
  const form = out.expertForm as Record<string, unknown>;
  assert.notEqual(form, null);
  for (const key of FORM_MUST_NOT_APPEAR) {
    assert.equal(key in form, false, `expertForm.${key} must not be published`);
  }
  assert.deepEqual(Object.keys(form).sort(), [...EXPERT_FORM_PUBLIC_FIELDS].sort());
  // The badge signal survives; the session id that produced it does not.
  assert.equal(form.identityVerificationStatus, "verified");
});

test("P5 — a null expertForm stays null, never {} (§13: 'no form' and 'an empty form' differ)", () => {
  const row = { ...leakyExpertRow(), expertForm: null };
  assert.equal(toPublicExpert(row).expertForm, null);
});

test("P6 — preferences is narrowed to the one storefront key, never published as a blob", () => {
  const out = toPublicExpert(leakyExpertRow());
  assert.deepEqual(out.preferences, { storefront: { coverImageUrl: "https://cdn.example/cover.jpg" } });
  assert.equal(JSON.stringify(out).includes("secret"), false, "the rest of the preferences blob must not ride along");
});

test("P7 — an absent cover image OMITS preferences entirely rather than sending null (§13)", () => {
  for (const prefs of [undefined, null, {}, { storefront: {} }, { storefront: { coverImageUrl: "   " } }]) {
    const out = toPublicExpert({ ...leakyExpertRow(), preferences: prefs });
    assert.equal("preferences" in out, false, `preferences must be omitted for ${JSON.stringify(prefs)}`);
  }
});

test("P8 — a users column added LATER is excluded by default (the §19 property)", () => {
  // The projector derives the users-column set from the drizzle table, so it does not need to be
  // taught about a new column: `homeCity` is the most recently added one (migration 260) and is
  // dropped without appearing in any hand-written list in `expert-read-scope.ts`.
  const out = toPublicExpert(leakyExpertRow());
  assert.equal("homeCity" in out, false);
  // And a key that is NOT a users column is not silently dropped either — that is the other half
  // of the property, and the reason this is not a blanket pick over the whole object.
  assert.equal((toPublicExpert({ ...leakyExpertRow(), someFutureComputedKey: 7 }) as any).someFutureComputedKey, 7);
});

test("P9 — the projector is idempotent, which is what lets the routes re-apply it as layer 2", () => {
  const once = toPublicExpert(leakyExpertRow());
  assert.deepEqual(toPublicExpert(once), once);
});

test("P10 — toPublicExperts is the array form of the same single decision", () => {
  const rows = [leakyExpertRow(), { ...leakyExpertRow(), id: "expert-2" }];
  assert.deepEqual(toPublicExperts(rows), rows.map(toPublicExpert));
});

// ── A: the shipped call sites ────────────────────────────────────────────────

test("A1 — storage.getExpertsWithProfiles returns through the projector, not a denylist scrub", () => {
  const method = storageSrc.slice(storageSrc.indexOf("async getExpertsWithProfiles("));
  const body = uncommented(method.slice(0, method.indexOf("\n  async ", 10)));
  assert.equal(/return\s+toPublicExperts\(/.test(body), true, "the method must return projected rows");
  assert.equal(body.includes("SENSITIVE_EXPERT_FIELDS"), false, "the three-name denylist must be gone");
});

test("A2 — both row-serving public routes apply the projector as the second layer", () => {
  const src = uncommented(routesSrc);
  assert.equal(src.includes("res.json(toPublicExperts(filtered as any[]));"), true, "GET /api/experts");
  assert.equal(src.includes("res.json(toPublicExpert(expert));"), true, "GET /api/experts/:id");
  // …and neither still serves the raw object.
  assert.equal(/\n\s*res\.json\(expert\);/.test(src), false, "no route may res.json the raw expert row");
  assert.equal(/\n\s*res\.json\(filtered\);/.test(src), false, "no route may res.json the unprojected list");
});

test("A3 — the embedded approved-services list no longer publishes the §18 commission split", () => {
  const method = storageSrc.slice(storageSrc.indexOf("async getApprovedServicesForExpert("));
  const body = uncommented(method.slice(0, 1200));
  assert.equal(body.includes('"revenueShareRate"'), true, "revenueShareRate must be stripped from the public embed");
});

// ── S: the allowlists themselves ─────────────────────────────────────────────

test("S1 — the allowlists name nothing credential-, contact-, payout- or rate-bearing", () => {
  const banned = /password|token|secret|stripe|email|phone|payout|earnings|commission|feeSettings|govId|licence|license/i;
  for (const f of EXPERT_PUBLIC_FIELDS) {
    assert.equal(banned.test(f), false, `EXPERT_PUBLIC_FIELDS must not name ${f}`);
  }
  for (const f of EXPERT_FORM_PUBLIC_FIELDS) {
    // identityVerificationStatus is the badge signal, not an identity document or a session id.
    if (f === "identityVerificationStatus") continue;
    assert.equal(banned.test(f), false, `EXPERT_FORM_PUBLIC_FIELDS must not name ${f}`);
  }
  assert.equal(EXPERT_FORM_PUBLIC_FIELDS.includes("identityVerificationSessionId" as never), false);
});

test("S2 — the two server-side browse filters can still read what they filter on", () => {
  // GET /api/experts and GET /api/experts/counts filter on these AFTER layer 1 has projected.
  for (const f of ["destinations", "city", "country", "neighborhoods"]) {
    assert.equal(EXPERT_FORM_PUBLIC_FIELDS.includes(f as never), true, `route filters read expertForm.${f}`);
  }
});
