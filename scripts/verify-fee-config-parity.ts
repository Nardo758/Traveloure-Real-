/**
 * Billing invariant: the fee DISPLAY (GET /api/booking-fee-config, consumed by the
 * itinerary Booking Summary) must equal the fee the CHARGE path resolves for the
 * SAME booking context — not merely read the same table.
 *
 * For each context it:
 *   - computes the charge's source of truth server-side: resolveCommissionRates(ctx),
 *   - hits the REAL endpoint over HTTP with the same inputs,
 *   - asserts the endpoint's percents equal the resolver's (via the shared mapper),
 *   - asserts the split sums to 100 and isn't the legacy 12% booking_fee_configs fallback.
 *
 * Because both correct paths flow through resolveCommissionRates + feeConfigFromRates,
 * a match is exact; a mismatch means the endpoint regressed to a different source or
 * dropped an input the charge honors. Exits non-zero on any mismatch. Runs in the e2e
 * gate after the server is up (fee_bands/platform_settings seeded by then).
 */
import { resolveCommissionRates, feeConfigFromRates } from "../server/services/commission";
import { pool } from "../server/db";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Mirrors the inputs the checkout loop builds (category slug / provider line),
// plus the per-expert-override id the charge forwards as expertId.
const CONTEXTS: Array<{ category: string; expertId?: string | null }> = [
  { category: "default" },
  { category: "activities" },
  { category: "dining" },
  { category: "provider_commission_percent" },
];

async function main() {
  let failures = 0;

  for (const ctx of CONTEXTS) {
    // Charge's source of truth for this context.
    const expected = feeConfigFromRates(await resolveCommissionRates(ctx));

    const qs = new URLSearchParams();
    qs.set("category", ctx.category);
    if (ctx.expertId) qs.set("expertId", ctx.expertId);

    let actual: any;
    try {
      const resp = await fetch(`${BASE_URL}/api/booking-fee-config?${qs.toString()}`);
      if (!resp.ok) { console.error(`[fee-parity] ${ctx.category}: HTTP ${resp.status}`); failures++; continue; }
      actual = await resp.json();
    } catch (e: any) {
      console.error(`[fee-parity] ${ctx.category}: request failed — ${e?.message ?? e}`); failures++; continue;
    }

    const platformMatch = actual.platform_fee_percent === expected.platform_fee_percent;
    const expertMatch = actual.expert_share_percent === expected.expert_share_percent;
    const sumsTo100 = Math.abs((actual.platform_fee_percent + actual.expert_share_percent) - 100) < 0.01;
    // Regression guard: the old path returned a 12% fallback for an absent table.
    const legacyFallback = ctx.category === "default" && actual.platform_fee_percent === 12 && expected.platform_fee_percent !== 12;

    if (platformMatch && expertMatch && sumsTo100 && !legacyFallback) {
      console.log(`[fee-parity] ${ctx.category}: OK — display ${actual.platform_fee_percent}/${actual.expert_share_percent} == charge`);
    } else {
      console.error(
        `[fee-parity] ${ctx.category}: MISMATCH — display(${actual.platform_fee_percent}/${actual.expert_share_percent}) ` +
        `vs charge(${expected.platform_fee_percent}/${expected.expert_share_percent})` +
        `${!sumsTo100 ? " [split≠100]" : ""}${legacyFallback ? " [legacy 12% fallback — endpoint reading booking_fee_configs?]" : ""}`,
      );
      failures++;
    }
  }

  if (failures > 0) throw new Error(`${failures} fee-config parity check(s) failed — display ≠ charge`);
  console.log(`[fee-parity] PASS — /api/booking-fee-config == charge resolver for all ${CONTEXTS.length} contexts.`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => {
    console.error("[fee-parity] FAIL:", err?.message ?? err);
    try { await pool.end(); } catch {}
    process.exit(1);
  });
