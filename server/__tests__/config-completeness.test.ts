import { describe, it, expect } from "vitest";
import { db } from "../db";
import { optimizationFees } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getBand } from "../services/commission";
import {
  OPTIMIZATION_COMPLEXITY_TIERS,
  OPTIMIZATION_EVENT_TYPES,
  RESOLVER_FEE_BAND_REQUIREMENTS,
} from "../services/fee-band-requirements";

/**
 * 3.0.1b — Config-completeness test.
 *
 * Enumerates every required optimize-fee and commission row and asserts each
 * is present in seed/DB. Guarantees the resolvers never throw in prod AND
 * catches a missing row in CI before deploy.
 *
 * If this test fails, run `npm run migrate:bootstrap` to apply missing migrations.
 */

describe("config completeness", () => {
  it("all required optimization_fees rows are present", async () => {
    for (const eventType of OPTIMIZATION_EVENT_TYPES) {
      const [row] = await db
        .select({ priceCents: optimizationFees.priceCents, isActive: optimizationFees.isActive })
        .from(optimizationFees)
        .where(eq(optimizationFees.eventType, eventType))
        .limit(1);

      expect(row, `eventType=${eventType} must be seeded`).toBeDefined();
      expect(row!.isActive, `eventType=${eventType} must be active`).toBe(true);
    }
  });

  it("all required tier-level defaults are present", async () => {
    for (const tier of OPTIMIZATION_COMPLEXITY_TIERS) {
      const [row] = await db
        .select({ priceCents: optimizationFees.priceCents, isActive: optimizationFees.isActive })
        .from(optimizationFees)
        .where(eq(optimizationFees.complexityTier, tier))
        .limit(1);

      expect(row, `tier=${tier} default must be seeded`).toBeDefined();
      expect(row!.isActive, `tier=${tier} default must be active`).toBe(true);
    }
  });

  it("all required fee_bands are present and active", async () => {
    for (const requirement of RESOLVER_FEE_BAND_REQUIREMENTS.filter((item) => item.required)) {
      const band = await getBand(requirement.bandKey);
      expect(band, `bandKey=${requirement.bandKey} must be seeded and active`).toBeDefined();
      expect(
        band!.rateType,
        `bandKey=${requirement.bandKey} must use rate_type=${requirement.expectedType}`,
      ).toBe(requirement.expectedType);
    }
  });

  it("beta_flat stays deactivated (migration 178, ruling D2)", async () => {
    // getBand only returns active bands; a non-null result means someone
    // reactivated the superseded beta band, which charge paths must not see.
    const band = await getBand("beta_flat");
    expect(band, "beta_flat must remain inactive").toBeNull();
  });
});
