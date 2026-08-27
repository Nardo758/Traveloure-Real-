/**
 * Read-only deployment gate for resolver-owned fee configuration.
 *
 * Run this after the complete migration chain has been applied. It derives the
 * static contract from the resolver manifest, adds category bands referenced by
 * the target database, and verifies that every strict dependency exists, is
 * active, and has the type the resolver expects. It never writes to the DB.
 */
import assert from "node:assert/strict";
import pg from "pg";
import {
  COMMISSION_CATEGORY_BAND_KEYS,
  OPTIMIZATION_COMPLEXITY_TIERS,
  OPTIMIZATION_EVENT_TYPES,
  RESOLVER_FEE_BAND_REQUIREMENTS,
  type FeeBandRequirement,
} from "../server/services/fee-band-requirements";

const { Pool } = pg;

type FeeBandRow = {
  band_key: string;
  rate_type: string;
  is_active: boolean;
  max_amount: string | number | null;
};

type OptimizationFeeRow = {
  event_type: string | null;
  complexity_tier: string;
  is_active: boolean;
};

const SEMANTIC_LEGACY_CATEGORIES = new Set([
  "default",
  "provider_commission_percent",
  "platform_deposit_rate",
  "tip",
]);

function addRequirement(
  requirements: Map<string, FeeBandRequirement>,
  requirement: FeeBandRequirement,
): void {
  const existing = requirements.get(requirement.bandKey);
  if (!existing) {
    requirements.set(requirement.bandKey, requirement);
    return;
  }

  // A dynamic category reference is strict even if the same key was listed as
  // fallback-backed elsewhere. The database is actively asking the resolver to
  // use this key, so absence/inactivity must fail the gate.
  requirements.set(requirement.bandKey, {
    ...existing,
    required: existing.required || requirement.required,
    expectedType: existing.expectedType,
    owner: `${existing.owner}; ${requirement.owner}`,
    requiresMaxAmount: existing.requiresMaxAmount || requirement.requiresMaxAmount,
  });
}

function collectStaticRequirements(): Map<string, FeeBandRequirement> {
  const requirements = new Map<string, FeeBandRequirement>();
  for (const requirement of RESOLVER_FEE_BAND_REQUIREMENTS) {
    addRequirement(requirements, requirement);
  }
  for (const bandKey of COMMISSION_CATEGORY_BAND_KEYS) {
    addRequirement(requirements, {
      bandKey,
      expectedType: "percent",
      required: true,
      owner: "commission category resolver",
    });
  }
  return requirements;
}

function collectCategoryRequirements(
  requirements: Map<string, FeeBandRequirement>,
  categories: string[],
  owner: string,
): void {
  for (const category of categories) {
    if (SEMANTIC_LEGACY_CATEGORIES.has(category)) continue;
    addRequirement(requirements, {
      bandKey: category,
      expectedType: "percent",
      required: true,
      owner,
    });
  }
}

function validateFeeBands(
  requirements: Map<string, FeeBandRequirement>,
  rows: FeeBandRow[],
): string[] {
  const byKey = new Map(rows.map((row) => [row.band_key, row]));
  const failures: string[] = [];

  for (const requirement of requirements.values()) {
    const row = byKey.get(requirement.bandKey);
    if (!row) {
      if (requirement.required) {
        failures.push(
          `${requirement.bandKey}: missing required row (${requirement.owner})`,
        );
      }
      continue;
    }

    if (requirement.required && !row.is_active) {
      failures.push(`${requirement.bandKey}: required row is inactive (${requirement.owner})`);
    }

    // Optional fallback rows may be absent or inactive, but an active row with
    // the wrong type is still broken configuration: the resolver would skip it.
    if ((requirement.required || row.is_active) && row.rate_type !== requirement.expectedType) {
      failures.push(
        `${requirement.bandKey}: rate_type='${row.rate_type}', expected '${requirement.expectedType}' (${requirement.owner})`,
      );
    }

    if (requirement.requiresMaxAmount && row.max_amount === null) {
      failures.push(`${requirement.bandKey}: required max_amount cap is missing (${requirement.owner})`);
    }
  }

  return failures;
}

function validateOptimizationFees(rows: OptimizationFeeRow[]): string[] {
  const failures: string[] = [];
  const activeEventTypes = new Set(
    rows.filter((row) => row.is_active && row.event_type !== null).map((row) => row.event_type),
  );
  const activeTierDefaults = new Set(
    rows
      .filter((row) => row.is_active && row.event_type === null)
      .map((row) => row.complexity_tier),
  );

  for (const eventType of OPTIMIZATION_EVENT_TYPES) {
    if (!activeEventTypes.has(eventType)) {
      failures.push(`optimization_fees: missing active event_type='${eventType}' row`);
    }
  }
  for (const tier of OPTIMIZATION_COMPLEXITY_TIERS) {
    if (!activeTierDefaults.has(tier)) {
      failures.push(`optimization_fees: missing active tier default for complexity_tier='${tier}'`);
    }
  }
  return failures;
}

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const client = await pool.connect();
    try {
      const feeBandResult = await client.query<FeeBandRow>(`
        SELECT band_key, rate_type, is_active, max_amount
        FROM fee_bands
      `);
      const categoryResult = await client.query<{ commission_band_key: string | null }>(`
        SELECT DISTINCT commission_band_key
        FROM service_categories
        WHERE commission_band_key IS NOT NULL
      `);
      const legacyCategoryResult = await client.query<{ category: string | null }>(`
        SELECT DISTINCT category
        FROM booking_fee_configs
        WHERE is_active = true AND category IS NOT NULL
      `);
      const optimizationResult = await client.query<OptimizationFeeRow>(`
        SELECT event_type, complexity_tier, is_active
        FROM optimization_fees
      `);

      const requirements = collectStaticRequirements();
      collectCategoryRequirements(
        requirements,
        categoryResult.rows
          .map((row) => row.commission_band_key)
          .filter((key): key is string => Boolean(key)),
        "service_categories.commission_band_key",
      );
      collectCategoryRequirements(
        requirements,
        legacyCategoryResult.rows
          .map((row) => row.category)
          .filter((category): category is string => Boolean(category)),
        "active booking_fee_configs category",
      );

      const failures = [
        ...validateFeeBands(requirements, feeBandResult.rows),
        ...validateOptimizationFees(optimizationResult.rows),
      ];
      if (failures.length > 0) {
        throw new Error(
          `Resolver configuration incomplete (${failures.length} failure${failures.length === 1 ? "" : "s"}):\n` +
            failures.map((failure) => ` - ${failure}`).join("\n"),
        );
      }

      console.log(JSON.stringify({
        ok: true,
        feeBandsChecked: requirements.size,
        optimizationEventTypesChecked: OPTIMIZATION_EVENT_TYPES.length,
        optimizationTierDefaultsChecked: OPTIMIZATION_COMPLEXITY_TIERS.length,
      }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[fee-config-completeness] FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});