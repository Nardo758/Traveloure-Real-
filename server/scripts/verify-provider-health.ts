/**
 * verify-provider-health.ts — behavioral smoke test for provider-health.service.ts.
 *
 * Exercises the registry the way real catalog services do: report a mix of ok/empty/error/quota/auth
 * outcomes, then read back getProviderHealth() and assert it reflects them — including that retired
 * providers (kiwi, hotellook) can never be reported into a false 'ok', and that reporting never throws
 * even with a garbage provider key.
 *
 * Run with: npx tsx server/scripts/verify-provider-health.ts
 */
import {
  reportProviderResult,
  getProviderHealth,
  outcomeFromHttpStatus,
} from "../services/provider-health.service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok — ${message}`);
  }
}

console.log("=== provider-health registry smoke test ===\n");

// 1. Before any report, every known provider reads 'not_called' — never a fabricated 'ok'.
const beforeAny = getProviderHealth();
const viatorBefore = beforeAny.find((e) => e.provider === "viator");
assert(!!viatorBefore, "viator is a known provider");
assert(viatorBefore?.status === "not_called", "viator starts 'not_called', never a fabricated 'ok'");

// 2. Simulate a real success.
reportProviderResult("viator", "ok");
const viatorAfterOk = getProviderHealth().find((e) => e.provider === "viator")!;
assert(viatorAfterOk.status === "ok", "viator reflects 'ok' after a real success report");
assert(!!viatorAfterOk.lastSuccessAt, "viator has a lastSuccessAt timestamp");

// 3. Simulate an honest empty (not an error).
reportProviderResult("stasher", "empty");
const stasherAfterEmpty = getProviderHealth().find((e) => e.provider === "stasher")!;
assert(stasherAfterEmpty.status === "empty", "stasher reflects 'empty' — zero results is not an error");

// 4. Simulate 429 quota exhaustion (SerpAPI live-probe evidence).
reportProviderResult("serpapi", outcomeFromHttpStatus(429), "429 rate limited");
const serpAfterQuota = getProviderHealth().find((e) => e.provider === "serpapi")!;
assert(serpAfterQuota.status === "quota", "serpapi reflects 'quota' after a 429");
assert(serpAfterQuota.lastDetail === "429 rate limited", "serpapi carries the detail string");

// 5. Simulate 401 auth failure (Google Places REQUEST_DENIED live-probe evidence).
reportProviderResult("google_places", "auth", "REQUEST_DENIED (billing)");
const gpAfterAuth = getProviderHealth().find((e) => e.provider === "google_places")!;
assert(gpAfterAuth.status === "auth", "google_places reflects 'auth' after REQUEST_DENIED");

// 6. Simulate a generic network error (GetTransfer DNS-failure live-probe evidence).
reportProviderResult("gettransfer", "error", "ENOTFOUND api.gettransfer.com");
const gettransferAfterError = getProviderHealth().find((e) => e.provider === "gettransfer")!;
assert(gettransferAfterError.status === "error", "gettransfer reflects 'error' after a DNS failure");

// 7. Retired providers can never be reported into a false 'ok'.
reportProviderResult("kiwi", "ok");
reportProviderResult("hotellook", "ok");
const kiwiEntry = getProviderHealth().find((e) => e.provider === "kiwi")!;
const hotellookEntry = getProviderHealth().find((e) => e.provider === "hotellook")!;
assert(kiwiEntry.status === "retired", "kiwi stays 'retired' even if something reports 'ok' against it");
assert(hotellookEntry.status === "retired", "hotellook stays 'retired' even if something reports 'ok' against it");
assert(!!kiwiEntry.retiredReason?.includes("Tequila"), "kiwi's retiredReason cites the Tequila evidence");

// 8. Reporting never throws — garbage input, huge strings, unknown providers.
let threw = false;
try {
  reportProviderResult("", "ok");
  reportProviderResult("unknown-provider-xyz", "error", "x".repeat(50_000));
  reportProviderResult("kiwi", "not-a-real-outcome" as any);
} catch {
  threw = true;
}
assert(!threw, "reportProviderResult never throws, even with garbage input");

// 9. configured() reflects the real env var.
const kiwiConfigured = getProviderHealth().find((e) => e.provider === "kiwi")!.configured;
assert(
  kiwiConfigured === !!process.env.KIWI_TEQUILA_API_KEY,
  "kiwi.configured matches process.env.KIWI_TEQUILA_API_KEY presence",
);

console.log("\n=== Full registry snapshot ===");
for (const entry of getProviderHealth()) {
  console.log(
    `${entry.provider.padEnd(16)} status=${entry.status.padEnd(10)} configured=${String(entry.configured).padEnd(5)} retired=${entry.retired}`,
  );
}

if (process.exitCode === 1) {
  console.error("\nSome assertions FAILED.");
} else {
  console.log("\nAll assertions passed.");
}
