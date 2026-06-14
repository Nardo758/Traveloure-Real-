import { describe, it, expect } from "vitest";
import { db } from "../db";
import { optimizationFees } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getBand } from "../services/commission";

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
    const requiredEventTypes = [
      "vacation", "adventure", "honeymoon", "anniversary", // Trip @ $5.99
      "proposal", "birthday",                              // Experience @ $5.99
      "wedding", "corporate",                              // Event @ $19.99
    ];

    for (const eventType of requiredEventTypes) {
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
    const requiredTiers = ["simple", "standard", "complex"];

    for (const tier of requiredTiers) {
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
    const requiredBands = [
      "expert_standard",
      "expert_new",
      "beta_flat",
      "expert_concierge_booking",
    ];

    for (const bandKey of requiredBands) {
      const band = await getBand(bandKey);
      expect(band, `bandKey=${bandKey} must be seeded and active`).toBeDefined();
      expect(band!.rate, `bandKey=${bandKey} must have a positive rate`).toBeGreaterThan(0);
    }
  });
});
