/**
 * Affiliate reconciliation — Travelpayouts commission fetcher tests.
 *
 * Run with: npx tsx --test server/__tests__/affiliate-reconciliation-travelpayouts.test.ts
 *
 * Verifies (against mocked fetch) that fetchTravelpayoutsCommissions:
 *  - queries the real POST /statistics/v1/execute_query endpoint with X-Access-Token
 *    (never the dead /v1/statistics/* endpoints that 404'd and silently zeroed stats)
 *  - maps action rows to ExternalCommission with paid+processing amounts
 *  - drops rows without an action_id
 *  - returns a FetcherDiagnostic reflecting ok / skipped / error status
 */
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";

process.env.TRAVELPAYOUTS_TOKEN = "test-token";

const { fetchTravelpayoutsCommissions } = await import("../services/affiliate-reconciliation.service");
const { pool } = await import("../db");

after(async () => {
  await pool.end().catch(() => {});
});

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: any }) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

const wegotripRow = {
  campaign_id: 150,
  campaign_name_en: "WeGoTrip",
  action_id: "150:9001",
  created_at_day: "2026-07-15",
  sub_id: "405110",
  state: "processing",
  type: "action",
  paid_profit_usd: "1.30",
  processing_profit_usd: "4.20",
  price_usd: "42.00",
};

const noIdRow = { ...wegotripRow, action_id: "" };

test("maps Travelpayouts action rows to ExternalCommission", async () => {
  mockFetch(() => ({ body: { results: [wegotripRow, noIdRow], total_rows: 2 } }));

  const start = new Date("2026-07-01T00:00:00Z");
  const end = new Date("2026-07-31T00:00:00Z");
  const { commissions, diagnostic } = await fetchTravelpayoutsCommissions(start, end);

  // Endpoint + auth shape
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/statistics/v1/execute_query"));
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as any)["X-Access-Token"], "test-token");
  assert.ok(!calls[0].url.includes("/v1/statistics/"), "legacy /v1/statistics/* must not be used");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(
    body.filters.filter((f: any) => f.field === "date"),
    [
      { field: "date", op: "ge", value: "2026-07-01" },
      { field: "date", op: "le", value: "2026-07-31" },
    ]
  );

  // Row with empty action_id is dropped
  assert.equal(commissions.length, 1);
  const c = commissions[0];
  assert.equal(c.partner, "travelpayouts");
  assert.equal(c.partnerReferenceId, "150:9001");
  // amount = paid + processing profit
  assert.equal(c.amount, 5.5);
  assert.equal(c.currency, "USD");
  assert.equal(c.reportedAt, "2026-07-15");
  assert.deepEqual(c.rawData, wegotripRow);

  // Diagnostic: ok with correct row count
  assert.equal(diagnostic.status, "ok");
  assert.equal(diagnostic.partner, "travelpayouts");
  assert.equal(diagnostic.rowCount, 1);
  assert.equal(diagnostic.reason, undefined);
});

test("returns error diagnostic and logs when the API fails — never throws", async () => {
  mockFetch(() => ({ status: 500, body: { error: "boom" } }));
  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    const { commissions, diagnostic } = await fetchTravelpayoutsCommissions(
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    );
    assert.deepEqual(commissions, []);
    assert.equal(diagnostic.status, "error");
    assert.equal(diagnostic.partner, "travelpayouts");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason, "error diagnostic must include a reason");
  } finally {
    console.error = realError;
  }
  assert.ok(
    logged.some((l) => l.includes("[Reconciliation] Travelpayouts fetch error")),
    `API failure must be logged, not silent; got: ${JSON.stringify(logged)}`
  );
});

test("returns skipped diagnostic with a warning when TRAVELPAYOUTS_TOKEN is not configured", async () => {
  const saved = process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_TOKEN;
  mockFetch(() => ({ body: { results: [wegotripRow], total_rows: 1 } }));
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const { commissions, diagnostic } = await fetchTravelpayoutsCommissions(
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-31T00:00:00Z")
    );
    assert.deepEqual(commissions, []);
    assert.equal(calls.length, 0, "no API call without a token");
    assert.equal(diagnostic.status, "skipped");
    assert.equal(diagnostic.partner, "travelpayouts");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("TRAVELPAYOUTS_TOKEN"), "skipped reason must name the missing credential");
  } finally {
    console.warn = realWarn;
    process.env.TRAVELPAYOUTS_TOKEN = saved;
  }
  assert.ok(warnings.some((w) => w.includes("TRAVELPAYOUTS_TOKEN not set")));
});
