/**
 * §19 class (ruling 46, MI-1 sibling sweep) — identity/business verification is not
 * client-settable on `insertLocalExpertFormSchema` / `insertServiceProviderFormSchema`.
 *
 * Phase 0 (already verified before this fix): both `createInsertSchema(...).omit(...)` calls
 * missed the verification family — `identityVerificationSessionId`, `identityVerificationStatus`,
 * `identityVerifiedAt` (both tables) and `businessVerificationStatus` (provider table). Routes
 * parse these schemas straight off `req.body` and storage spreads the result verbatim into
 * create/update, so a crafted `{ identityVerificationStatus: "verified" }` body could self-verify
 * and bypass `resolvePublishVerification`'s publish gate. This file pins the fix:
 *
 *   - Layer 1 (schema `.omit()`): a body carrying any verification-family field does not survive
 *     `insertLocalExpertFormSchema.parse` / `insertServiceProviderFormSchema.parse`.
 *   - Layer 2 (storage strip): `stripFormVerificationFields` (server/storage.ts) — the backstop
 *     for internal `as any` callers a type-level omit cannot reach (there is one:
 *     console-sigma-kyoto-bench.http.test.ts:112 casts its fixture `as any` into
 *     `storage.createLocalExpertForm`).
 *
 * Sanctioned writers this file does NOT touch (must keep working, proven only informally here by
 * inspection — no DB in this environment to exercise them live):
 *   - storage.updateFormIdentityVerification (server/storage.ts ~7171)
 *   - storage.updateProviderBusinessVerificationByInquiry (server/storage.ts ~7186)
 *   - the Stripe/Persona webhook (server/routes/webhooks.routes.ts ~258)
 *
 * Pure zod parse + a pure object-transform helper — no DB/network required. Run with:
 *   npx tsx --test server/__tests__/expert-form-verification-strip.test.ts
 *
 * A companion `.db.test.ts` covering the real create/update DB round-trip (the B-series negative-
 * fixture pattern from booking-birth-provenance.db.test.ts) is intentionally NOT added here: this
 * container has no reachable Postgres, and a DB test nobody can run before landing is worse than an
 * honest gap. Layer 1 is proven directly below; layer 2 is proven by unit-testing the exact helper
 * function `createLocalExpertForm`/`updateLocalExpertForm`/`createServiceProviderForm` call.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// storage.ts imports `./db`, which throws at import time without DATABASE_URL. No query in this
// file ever runs, so a syntactically-valid placeholder is enough — same technique
// refund-retry-convergence.test.ts uses to import storage/db without a live Postgres.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { insertLocalExpertFormSchema, insertServiceProviderFormSchema } = await import("@shared/schema");
const { stripFormVerificationFields } = await import("../storage");

const VERIFIED_PAYLOAD_FIELDS = {
  identityVerificationSessionId: "vs_attacker_supplied",
  identityVerificationStatus: "verified",
  identityVerifiedAt: new Date().toISOString(),
};

describe("insertLocalExpertFormSchema — verification family is stripped (§19a)", () => {
  // Reuses the CC-5 minimum-content shape from expert-application-content-gate.test.ts so the
  // parse doesn't fail the unrelated content gate.
  const minimalContent = {
    expertType: "travel_expert",
    destinations: ["Paris"],
    specialties: ["Food & Wine"],
    languages: ["English"],
    experienceTypes: ["exp-1"],
  };

  it("drops identityVerification*/identityVerifiedAt even when the body carries them", () => {
    const parsed = insertLocalExpertFormSchema.parse({
      ...minimalContent,
      ...VERIFIED_PAYLOAD_FIELDS,
    }) as Record<string, unknown>;
    assert.equal("identityVerificationSessionId" in parsed, false);
    assert.equal("identityVerificationStatus" in parsed, false);
    assert.equal("identityVerifiedAt" in parsed, false);
  });

  it("still accepts and preserves ordinary content alongside the stripped fields", () => {
    const parsed = insertLocalExpertFormSchema.parse({
      ...minimalContent,
      ...VERIFIED_PAYLOAD_FIELDS,
    }) as Record<string, unknown>;
    assert.deepEqual(parsed.destinations, ["Paris"]);
    assert.equal(parsed.expertType, "travel_expert");
  });
});

describe("insertServiceProviderFormSchema — verification family is stripped (§19a)", () => {
  const minimalContent = {
    businessName: "Kyoto Tea Tours",
    name: "Jamie Doe",
    email: "jamie@example.com",
    mobile: "+81 90 0000 0000",
    country: "Japan",
    address: "1 Somewhere St",
    businessType: "tour_operator",
  };

  it("drops identityVerification*/identityVerifiedAt AND businessVerificationStatus", () => {
    const parsed = insertServiceProviderFormSchema.parse({
      ...minimalContent,
      ...VERIFIED_PAYLOAD_FIELDS,
      businessVerificationStatus: "verified",
    }) as Record<string, unknown>;
    assert.equal("identityVerificationSessionId" in parsed, false);
    assert.equal("identityVerificationStatus" in parsed, false);
    assert.equal("identityVerifiedAt" in parsed, false);
    assert.equal("businessVerificationStatus" in parsed, false);
  });

  it("still accepts and preserves ordinary content alongside the stripped fields", () => {
    const parsed = insertServiceProviderFormSchema.parse({
      ...minimalContent,
      ...VERIFIED_PAYLOAD_FIELDS,
      businessVerificationStatus: "verified",
    }) as Record<string, unknown>;
    assert.equal(parsed.businessName, "Kyoto Tea Tours");
    assert.equal(parsed.country, "Japan");
  });
});

describe("stripFormVerificationFields — layer 2 storage backstop", () => {
  it("strips all four verification-family keys from an arbitrary object", () => {
    const dirty = {
      userId: "u1",
      city: "Kyoto",
      identityVerificationSessionId: "vs_x",
      identityVerificationStatus: "verified",
      identityVerifiedAt: new Date(),
      businessVerificationStatus: "verified",
    };
    const clean = stripFormVerificationFields(dirty);
    assert.deepEqual(clean, { userId: "u1", city: "Kyoto" });
  });

  it("is a no-op (drops nothing extra) on an object that never had the fields", () => {
    const input = { userId: "u1", city: "Kyoto" };
    const clean = stripFormVerificationFields(input);
    assert.deepEqual(clean, input);
  });

  it("covers the internal `as any` shape the type-level omit cannot reach", () => {
    // Mirrors console-sigma-kyoto-bench.http.test.ts:112's `storage.createLocalExpertForm({
    // ...(input as any), userId })` call — an object whose static type is `any`, so a
    // TypeScript-only `.omit()` on the zod schema gives no protection at all.
    const asAny: any = {
      userId: "u1",
      expertType: "travel_expert",
      identityVerificationStatus: "verified",
    };
    const clean = stripFormVerificationFields(asAny as Record<string, unknown>);
    assert.equal("identityVerificationStatus" in clean, false);
    assert.equal(clean.expertType, "travel_expert");
  });
});
