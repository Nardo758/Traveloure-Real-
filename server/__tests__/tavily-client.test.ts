/**
 * `server/services/tavily-client.ts` — the ONE Tavily client (§18 rule 1), behavioral proof.
 *
 * Ledger `2026-09-18-tavily-spend-logged`; FOLLOWUPS.md `tavily-spend-unlogged` / F4
 * (`web-gap-spend-logging`). Before this module, four call sites each built their own `tavily`
 * SDK client and none of them logged a call to `api_usage_logs`, so `TAVILY_MONTHLY_CAP_USD`
 * (`server/config/trailhead.config.ts`) was an unobservable hard cap.
 *
 * WHAT THESE HOLD (pure — injected SDK + logger, no DB, no network):
 *   T1  A successful `search` call logs ONE row: provider "tavily", endpoint "search",
 *       requestCount 1, cost = `TAVILY_PRICING_TENTHS.search` (both cost fields), success true.
 *   T2  A successful `extract` call logs ONE row the same way, endpoint "extract", cost =
 *       `TAVILY_PRICING_TENTHS.extract`.
 *   T3  A THROWING SDK call still logs (success:false) and then RETHROWS the original error
 *       unchanged — the credit was spent (or the attempt was made) either way (§15b).
 *   T4  A THROWING LOGGER never surfaces — the SDK's own successful result is still returned.
 *   T5  A THROWING LOGGER on a THROWING SDK call still rethrows the SDK's own error, not the
 *       logger's.
 *   T6  `getTavilyClient()` returns `null` when no key is configured (deps.apiKey explicitly
 *       falsy) — the "no key ⇒ skip" posture every gated call site already has, now in one place.
 *   T7  `getTavilyClient()` returns a client when a key IS configured.
 *   T8  `createTavilyClient()` ALWAYS constructs a client, even with an empty key — the
 *       `DMOCrawler` posture (warn-and-continue; a bad key fails at the real Tavily call).
 *   T9  The pricing table is DERIVED from the two USD config constants, never a restated literal.
 *
 * Run: npx tsx --test server/__tests__/tavily-client.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// tavily-client.ts imports api-usage.service.ts, which imports server/db.ts, which throws at
// import time if DATABASE_URL is unset (booking-verification.test.ts precedent). ESM hoists
// static imports before any top-level code runs, so the default must be set BEFORE the dynamic
// import below actually takes effect. No real DB connection is ever made by anything in this file
// — every call in every test injects its own logger.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";
}

const { getTavilyClient, createTavilyClient, TAVILY_PRICING_TENTHS } = await import(
  "../services/tavily-client"
);
const { TAVILY_PRICE_PER_SEARCH_USD, TAVILY_PRICE_PER_EXTRACT_USD } = await import(
  "../config/trailhead.config"
);
type ApiUsageLogParams = import("../services/api-usage.service").ApiUsageLogParams;

/** Records every logApiCall invocation for assertion. */
function recordingLogger() {
  const calls: ApiUsageLogParams[] = [];
  return {
    calls,
    logApiCall: async (params: ApiUsageLogParams) => {
      calls.push(params);
    },
  };
}

function throwingLogger(message = "logger exploded") {
  return {
    logApiCall: async () => {
      throw new Error(message);
    },
  };
}

describe("tavily-client — search logging (T1)", () => {
  it("logs one row with the right endpoint and tenths-of-cents on success", async () => {
    const logger = recordingLogger();
    const sdk = {
      search: async (_query: string, _opts?: any) => ({ results: [{ url: "https://a" }, { url: "https://b" }] }),
      extract: async () => {
        throw new Error("not used");
      },
    } as any;
    const client = getTavilyClient({ apiKey: "test-key", sdk, logger })!;
    assert.ok(client, "client should be constructed when a key is supplied");

    const result = await client.search("kyoto shrines", { maxResults: 3 });
    assert.equal(result.results.length, 2);

    assert.equal(logger.calls.length, 1);
    const row = logger.calls[0];
    assert.equal(row.provider, "tavily");
    assert.equal(row.endpoint, "search");
    assert.equal(row.requestCount, 1);
    assert.equal(row.costPerCallCents, TAVILY_PRICING_TENTHS.search);
    assert.equal(row.estimatedCostCents, TAVILY_PRICING_TENTHS.search);
    assert.equal(row.success, true);
    assert.equal(row.resultCount, 2);
  });
});

describe("tavily-client — extract logging (T2)", () => {
  it("logs one row with the right endpoint and tenths-of-cents on success", async () => {
    const logger = recordingLogger();
    const sdk = {
      search: async () => {
        throw new Error("not used");
      },
      extract: async (_urls: string[], _opts?: any) => ({ results: [{ url: "https://a", rawContent: "hi" }] }),
    } as any;
    const client = getTavilyClient({ apiKey: "test-key", sdk, logger })!;

    const result = await client.extract(["https://a"], { format: "markdown" });
    assert.equal(result.results[0].rawContent, "hi");

    assert.equal(logger.calls.length, 1);
    const row = logger.calls[0];
    assert.equal(row.provider, "tavily");
    assert.equal(row.endpoint, "extract");
    assert.equal(row.costPerCallCents, TAVILY_PRICING_TENTHS.extract);
    assert.equal(row.estimatedCostCents, TAVILY_PRICING_TENTHS.extract);
    assert.equal(row.success, true);
    assert.equal(row.resultCount, 1);
  });
});

describe("tavily-client — a throwing SDK call (T3)", () => {
  it("still logs (success:false) and rethrows the original error unchanged", async () => {
    const logger = recordingLogger();
    const boom = new Error("network blocked");
    const sdk = {
      search: async () => {
        throw boom;
      },
      extract: async () => ({ results: [] }),
    } as any;
    const client = getTavilyClient({ apiKey: "test-key", sdk, logger })!;

    await assert.rejects(() => client.search("q"), (err: unknown) => err === boom);

    assert.equal(logger.calls.length, 1);
    assert.equal(logger.calls[0].success, false);
    assert.equal(logger.calls[0].endpoint, "search");
    assert.equal(logger.calls[0].errorMessage, "network blocked");
    // The failed call still carries the credit's price — it was spent (or attempted) either way.
    assert.equal(logger.calls[0].costPerCallCents, TAVILY_PRICING_TENTHS.search);
  });
});

describe("tavily-client — a throwing LOGGER (T4/T5)", () => {
  it("never surfaces on a successful SDK call — the result is still returned", async () => {
    const sdk = {
      search: async () => ({ results: [{ url: "https://ok" }] }),
      extract: async () => ({ results: [] }),
    } as any;
    const client = getTavilyClient({ apiKey: "test-key", sdk, logger: throwingLogger() })!;

    const result = await client.search("q");
    assert.equal(result.results[0].url, "https://ok");
  });

  it("never masks a throwing SDK call — the SDK's own error still surfaces, not the logger's", async () => {
    const sdkError = new Error("sdk failed");
    const sdk = {
      search: async () => {
        throw sdkError;
      },
      extract: async () => ({ results: [] }),
    } as any;
    const client = getTavilyClient({
      apiKey: "test-key",
      sdk,
      logger: throwingLogger("logger also failed"),
    })!;

    await assert.rejects(() => client.search("q"), (err: unknown) => err === sdkError);
  });
});

describe("tavily-client — no-key posture (T6/T7)", () => {
  it("getTavilyClient() returns null when no key is configured", () => {
    const client = getTavilyClient({ apiKey: "", sdk: {} as any, logger: recordingLogger() });
    assert.equal(client, null);
  });

  it("getTavilyClient() returns a client when a key IS configured", () => {
    const client = getTavilyClient({ apiKey: "present", sdk: {} as any, logger: recordingLogger() });
    assert.notEqual(client, null);
  });
});

describe("tavily-client — createTavilyClient always constructs (T8)", () => {
  it("constructs a usable client even with an empty key, given an injected SDK", async () => {
    const logger = recordingLogger();
    const sdk = {
      search: async () => ({ results: [{ url: "https://x" }] }),
      extract: async () => ({ results: [] }),
    } as any;
    const client = createTavilyClient("", { sdk, logger });
    assert.ok(client);
    const result = await client.search("q");
    assert.equal(result.results.length, 1);
    assert.equal(logger.calls.length, 1);
  });
});

describe("tavily-client — pricing table is derived from config, not restated (T9)", () => {
  it("TAVILY_PRICING_TENTHS.search === round(TAVILY_PRICE_PER_SEARCH_USD * 1000)", () => {
    assert.equal(TAVILY_PRICING_TENTHS.search, Math.round(TAVILY_PRICE_PER_SEARCH_USD * 1000));
  });

  it("TAVILY_PRICING_TENTHS.extract === round(TAVILY_PRICE_PER_EXTRACT_USD * 1000)", () => {
    assert.equal(TAVILY_PRICING_TENTHS.extract, Math.round(TAVILY_PRICE_PER_EXTRACT_USD * 1000));
  });
});
