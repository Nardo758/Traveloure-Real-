/**
 * Travelpayouts statistics service — mocked API tests.
 *
 * Run with: npx tsx --test server/__tests__/travelpayouts-statistics.test.ts
 *
 * Verifies (against mocked fetch):
 *  - execute_query is called with X-Access-Token auth and paginates past total_rows
 *  - profits aggregate paid + processing amounts
 *  - WeGoTrip actions (campaign 150) show up in the per-partner breakdown with the right label
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.TRAVELPAYOUTS_TOKEN = "test-token";

const { getTravelpayoutsStatistics, fetchTravelpayoutsActions } = await import(
  "../services/travelpayouts/statistics.service"
);

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[] = [];
const realFetch = globalThis.fetch;

function jsonResponse(body: any): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const wegotripRow = {
  campaign_id: 150,
  campaign_name_en: "WeGoTrip",
  action_id: "150:9001",
  created_at_day: "2026-07-15",
  sub_id: "405110",
  state: "processing",
  type: "action",
  paid_profit_usd: "0.00",
  processing_profit_usd: "4.20",
  price_usd: "42.00",
};

const aviasalesRow = {
  campaign_id: 100,
  campaign_name_en: "Aviasales",
  action_id: "100:1234",
  created_at_day: "2026-07-10",
  sub_id: null,
  state: "paid",
  type: "action",
  paid_profit_usd: "10.50",
  processing_profit_usd: "0.00",
  price_usd: "300.00",
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => any) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return jsonResponse(handler(url, init));
  }) as typeof fetch;
}

test("fetchTravelpayoutsActions paginates and authenticates with X-Access-Token", async () => {
  // 2 pages: total_rows 301, first page 300 rows, second page 1 row
  const page1 = Array.from({ length: 300 }, (_, i) => ({ ...aviasalesRow, action_id: `100:${i}` }));
  mockFetch((url, init) => {
    assert.ok(url.includes("/statistics/v1/execute_query"));
    const body = JSON.parse(String(init?.body));
    return body.offset === 0
      ? { results: page1, total_rows: 301 }
      : { results: [wegotripRow], total_rows: 301 };
  });

  const rows = await fetchTravelpayoutsActions("2026-07-01", "2026-07-31");
  assert.equal(rows.length, 301);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal((c.init?.headers as any)["X-Access-Token"], "test-token");
    const body = JSON.parse(String(c.init?.body));
    assert.deepEqual(
      body.filters.find((f: any) => f.field === "type"),
      { field: "type", op: "in", value: ["action", "referral"] }
    );
  }
  assert.equal(JSON.parse(String(calls[1].init?.body)).offset, 300);
});

test("WeGoTrip (campaign 150) actions appear in the per-partner breakdown with paid+processing profit", async () => {
  mockFetch((url) => {
    if (url.includes("get_user_balance")) return { balance: { usd: "12.34" } };
    return { results: [wegotripRow, aviasalesRow], total_rows: 2 };
  });

  const stats = await getTravelpayoutsStatistics("this_month");
  assert.equal(stats.configured, true);
  assert.equal(stats.balance, 12.34);

  const wegotrip = stats.byPartner.find((p) => p.partnerLabel === "WeGoTrip");
  assert.ok(wegotrip, "WeGoTrip partner row must be present");
  // processing profit counts toward commission totals
  assert.equal(wegotrip!.thisMonth, 4.2);

  const aviasales = stats.byPartner.find((p) => p.partnerLabel === "Aviasales");
  assert.equal(aviasales!.thisMonth, 10.5);

  // overall total = paid + processing across campaigns
  assert.equal(stats.thisMonth, 14.7);
});

test("API failure degrades to zeros without throwing", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const stats = await getTravelpayoutsStatistics("this_month");
  assert.equal(stats.configured, true);
  assert.equal(stats.thisMonth, 0);
  assert.deepEqual(stats.byPartner, []);
});
