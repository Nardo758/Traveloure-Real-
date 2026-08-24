/**
 * Phase 1.3 — Resolver neutrality check (live DB).
 *
 * For each row in booking_fee_configs, compute the OLD resolver value and the
 * NEW (fee_bands) resolver value, then print a diff table. All diffs MUST be
 * 0 — any non-zero cell means the flip changed pricing and we stop.
 *
 * USE: run against staging (or any DB) BEFORE marking Phase 1.3 done in prod.
 *
 *   npx tsx server/scripts/phase1-neutrality-check.ts
 *
 * Exit code: 0 if every diff is 0; 1 if any diff is non-zero.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { resolveCommissionRates } from "../services/commission";

interface OldRow {
  category: string;
  expert_share_pct: number;
  platform_fee_pct: number;
  is_active: boolean;
}

async function loadOldBookingFeeConfigs(): Promise<OldRow[]> {
  const result = await db.execute(sql`
    SELECT
      category,
      CAST(expert_share_percent AS FLOAT) AS expert_share_pct,
      CAST(platform_fee_percent AS FLOAT) AS platform_fee_pct,
      is_active
    FROM booking_fee_configs
    WHERE is_active = true
    ORDER BY category
  `);
  return (result.rows ?? []) as unknown as OldRow[];
}

function fmt(n: number): string {
  return n.toFixed(4);
}

async function main() {
  console.log("Phase 1.3 — Resolver neutrality check\n");
  console.log("For each booking_fee_configs row, compare old vs new resolver output.\n");

  const rows = await loadOldBookingFeeConfigs();
  if (rows.length === 0) {
    console.log("⚠ booking_fee_configs is empty — neutrality trivially holds, but verify seeds applied.");
    process.exit(0);
  }

  // Skip rows that aren't called through the commission resolver: deposit + transport-only.
  const skip = new Set([
    "platform_deposit_rate",          // FEE-3: pricing.service.ts reads it directly (now via fee_bands.platform_deposit)
    "platform_transport_commission",  // transport-booking-options.service.ts reads directly
    "affiliate_margin_12go",
    "affiliate_margin_omio",
    "affiliate_margin_discovercars",
    "affiliate_margin_kiwi",
  ]);

  const header = ["category", "old platform%", "new platform%", "diff", "verdict"];
  const widths = [40, 14, 14, 8, 8];
  const pad = (s: string, w: number) => s.padEnd(w);
  console.log(header.map((h, i) => pad(h, widths[i])).join(""));
  console.log(widths.map(w => "─".repeat(w - 1) + " ").join(""));

  let anyMismatch = false;
  for (const r of rows) {
    if (skip.has(r.category)) {
      console.log([
        pad(r.category, widths[0]),
        pad(fmt(r.platform_fee_pct / 100), widths[1]),
        pad("(skipped)", widths[2]),
        pad("—", widths[3]),
        pad("⊘ N/A", widths[4]),
      ].join(""));
      continue;
    }

    const oldPlatform = r.platform_fee_pct / 100;
    const newRates = await resolveCommissionRates(r.category);
    const newPlatform = newRates.platformFeeRate;
    const diff = Math.round((newPlatform - oldPlatform) * 1e6) / 1e6;
    const ok = diff === 0;
    if (!ok) anyMismatch = true;

    console.log([
      pad(r.category, widths[0]),
      pad(fmt(oldPlatform), widths[1]),
      pad(fmt(newPlatform), widths[2]),
      pad(fmt(diff), widths[3]),
      pad(ok ? "✓ zero" : "✗ DIFF", widths[4]),
    ].join(""));
  }

  console.log("");
  if (anyMismatch) {
    console.log("✗ NEUTRALITY VIOLATED. At least one category has a non-zero diff.");
    console.log("  Phase 1.3 cannot ship until the divergence is resolved.");
    process.exit(1);
  }
  console.log("✓ Neutrality holds. All diffs are zero. Phase 1.3 is behavior-neutral with policy=beta_flat.");
  process.exit(0);
}

main().catch(err => {
  console.error("[neutrality-check] fatal:", err);
  process.exit(2);
});
