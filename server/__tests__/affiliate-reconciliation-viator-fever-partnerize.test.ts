/**
 * Affiliate reconciliation — Viator, Fever (Impact), and Partnerize commission fetcher tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/affiliate-reconciliation-viator-fever-partnerize.test.ts
 *
 * Each fetcher is verified for:
 *  - correct endpoint URL and auth headers
 *  - row → ExternalCommission mapping (field selection, amount parsing, filtering)
 *  - error diagnostic on non-OK responses (never throws, never silent-zeroes)
 *  - skipped diagnostic + console.warn when credentials are absent
 *  - ok diagnostic with correct rowCount on success
 */
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";

// Set all credentials before the first import so the module picks them up
process.env.VIATOR_API_KEY = "viator-test-key";
process.env.IMPACT_ACCOUNT_SID = "impact-sid";
process.env.IMPACT_AUTH_TOKEN = "impact-token";
process.env.PARTNERIZE_APPLICATION_KEY = "pz-app-key";
process.env.PARTNERIZE_API_KEY = "pz-api-key";
process.env.PARTNERIZE_PUBLISHER_ID = "pub-123";

const {
  fetchViatorCommissions,
  fetchFeverCommissions,
  fetchPartnerizeCommissions,
} = await import("../services/affiliate-reconciliation.service");

const { pool } = await import("../db");

after(async () => {
  await pool.end().catch(() => {});
});

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body: any }
) {
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

const START = new Date("2026-07-01T00:00:00Z");
const END = new Date("2026-07-31T00:00:00Z");

// ===========================================================================
// Viator
// ===========================================================================

const viatorBooking = {
  bookingRef: "VIA-9001",
  netPrice: "12.50",
  currency: "USD",
  bookingDate: "2026-07-15",
};

const viatorBookingNoRef = { ...viatorBooking, bookingRef: "", itemId: "", bookingId: "" };

test("[Viator] maps booking rows to ExternalCommission with ok diagnostic", async () => {
  mockFetch(() => ({
    body: { bookings: [viatorBooking, viatorBookingNoRef] },
  }));

  const { commissions, diagnostic } = await fetchViatorCommissions(START, END);

  // Endpoint shape
  assert.equal(calls.length, 1);
  assert.ok(
    calls[0].url.includes("api.viator.com/partner/bookings"),
    `expected Viator bookings URL, got: ${calls[0].url}`
  );
  assert.ok(
    calls[0].url.includes("startDate=2026-07-01"),
    "startDate query param missing"
  );
  assert.ok(
    calls[0].url.includes("endDate=2026-07-31"),
    "endDate query param missing"
  );
  assert.equal(
    (calls[0].init?.headers as any)?.["exp-api-key"],
    "viator-test-key",
    "exp-api-key header must match VIATOR_API_KEY"
  );

  // Row without a reference id is dropped
  assert.equal(commissions.length, 1);
  const c = commissions[0];
  assert.equal(c.partner, "viator");
  assert.equal(c.partnerReferenceId, "VIA-9001");
  assert.equal(c.amount, 12.5);
  assert.equal(c.currency, "USD");
  assert.equal(c.reportedAt, "2026-07-15");
  assert.deepEqual(c.rawData, viatorBooking);

  // Diagnostic
  assert.equal(diagnostic.status, "ok");
  assert.equal(diagnostic.partner, "viator");
  assert.equal(diagnostic.rowCount, 1);
  assert.equal(diagnostic.reason, undefined);
});

test("[Viator] falls back to itemId and bookingId when bookingRef is absent", async () => {
  const row = { itemId: "ITEM-42", netPrice: "7.00", currency: "EUR", travelDate: "2026-07-20" };
  mockFetch(() => ({ body: { bookings: [row] } }));

  const { commissions } = await fetchViatorCommissions(START, END);
  assert.equal(commissions.length, 1);
  assert.equal(commissions[0].partnerReferenceId, "ITEM-42");
  assert.equal(commissions[0].currency, "EUR");
  assert.equal(commissions[0].reportedAt, "2026-07-20");
});

test("[Viator] returns error diagnostic and logs warning on non-OK response — never throws", async () => {
  mockFetch(() => ({ status: 503, body: { error: "service unavailable" } }));

  const logged: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchViatorCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(diagnostic.status, "error");
    assert.equal(diagnostic.partner, "viator");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("503"), "error reason must include the HTTP status");
  } finally {
    console.warn = realWarn;
  }
  assert.ok(
    logged.some((l) => l.includes("[Reconciliation] Viator")),
    `expected Viator warning log; got: ${JSON.stringify(logged)}`
  );
});

test("[Viator] returns skipped diagnostic with a warning when VIATOR_API_KEY is absent", async () => {
  const saved = process.env.VIATOR_API_KEY;
  delete process.env.VIATOR_API_KEY;
  mockFetch(() => ({ body: { bookings: [viatorBooking] } }));

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchViatorCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(calls.length, 0, "no HTTP call should be made without a key");
    assert.equal(diagnostic.status, "skipped");
    assert.equal(diagnostic.partner, "viator");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("VIATOR_API_KEY"), "skipped reason must name the missing credential");
  } finally {
    console.warn = realWarn;
    process.env.VIATOR_API_KEY = saved;
  }
  assert.ok(
    warnings.some((w) => w.includes("VIATOR_API_KEY not set")),
    `expected VIATOR_API_KEY warning; got: ${JSON.stringify(warnings)}`
  );
});

// ===========================================================================
// Fever (Impact)
// ===========================================================================

const impactConversion = {
  Id: "IMP-7001",
  PubCommission: "8.75",
  Currency: "USD",
  EventDate: "2026-07-10",
};

const impactConversionNoId = { ...impactConversion, Id: "", OrderId: "" };

function expectedImpactBasicAuth() {
  return "Basic " + Buffer.from("impact-sid:impact-token").toString("base64");
}

test("[Fever/Impact] maps Conversion rows to ExternalCommission with ok diagnostic", async () => {
  mockFetch(() => ({
    body: { Conversions: [impactConversion, impactConversionNoId] },
  }));

  const { commissions, diagnostic } = await fetchFeverCommissions(START, END);

  // Endpoint shape
  assert.equal(calls.length, 1);
  assert.ok(
    calls[0].url.includes("api.impact.com/Mediapartners/impact-sid/Conversions"),
    `unexpected URL: ${calls[0].url}`
  );
  assert.ok(calls[0].url.includes("StartDate=2026-07-01"), "StartDate param missing");
  assert.ok(calls[0].url.includes("EndDate=2026-07-31"), "EndDate param missing");
  assert.equal(
    (calls[0].init?.headers as any)?.Authorization,
    expectedImpactBasicAuth(),
    "Authorization header must use Basic(accountSid:authToken)"
  );

  // Row without an Id is dropped
  assert.equal(commissions.length, 1);
  const c = commissions[0];
  assert.equal(c.partner, "fever");
  assert.equal(c.partnerReferenceId, "IMP-7001");
  assert.equal(c.amount, 8.75);
  assert.equal(c.currency, "USD");
  assert.equal(c.reportedAt, "2026-07-10");
  assert.deepEqual(c.rawData, impactConversion);

  // Diagnostic
  assert.equal(diagnostic.status, "ok");
  assert.equal(diagnostic.partner, "fever");
  assert.equal(diagnostic.rowCount, 1);
  assert.equal(diagnostic.reason, undefined);
});

test("[Fever/Impact] falls back to OrderId and SaleAmount when primary fields are absent", async () => {
  const row = { OrderId: "ORD-99", SaleAmount: "3.20", Currency: "EUR", CreatedDate: "2026-07-05" };
  mockFetch(() => ({ body: { Conversions: [row] } }));

  const { commissions } = await fetchFeverCommissions(START, END);
  assert.equal(commissions.length, 1);
  assert.equal(commissions[0].partnerReferenceId, "ORD-99");
  assert.equal(commissions[0].amount, 3.2);
  assert.equal(commissions[0].currency, "EUR");
  assert.equal(commissions[0].reportedAt, "2026-07-05");
});

test("[Fever/Impact] returns error diagnostic and logs warning on non-OK response — never throws", async () => {
  mockFetch(() => ({ status: 401, body: { error: "unauthorized" } }));

  const logged: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchFeverCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(diagnostic.status, "error");
    assert.equal(diagnostic.partner, "fever");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("401"), "error reason must include the HTTP status");
  } finally {
    console.warn = realWarn;
  }
  assert.ok(
    logged.some((l) => l.includes("[Reconciliation] Impact/Fever")),
    `expected Impact/Fever warning log; got: ${JSON.stringify(logged)}`
  );
});

test("[Fever/Impact] returns skipped diagnostic with a warning when Impact credentials are absent", async () => {
  const savedSid = process.env.IMPACT_ACCOUNT_SID;
  const savedToken = process.env.IMPACT_AUTH_TOKEN;
  delete process.env.IMPACT_ACCOUNT_SID;
  delete process.env.IMPACT_AUTH_TOKEN;
  mockFetch(() => ({ body: { Conversions: [impactConversion] } }));

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchFeverCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(calls.length, 0, "no HTTP call should be made without credentials");
    assert.equal(diagnostic.status, "skipped");
    assert.equal(diagnostic.partner, "fever");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("IMPACT"), "skipped reason must name the missing credentials");
  } finally {
    console.warn = realWarn;
    process.env.IMPACT_ACCOUNT_SID = savedSid;
    process.env.IMPACT_AUTH_TOKEN = savedToken;
  }
  assert.ok(
    warnings.some((w) => w.includes("IMPACT credentials not set")),
    `expected IMPACT credentials warning; got: ${JSON.stringify(warnings)}`
  );
});

// ===========================================================================
// Partnerize
// ===========================================================================

const pzConversionRow = {
  conversion_id: "PZ-5001",
  campaign_id: "camp-1",
  commission_amount: "6.00",
  sale_amount: "60.00",
  currency: "USD",
  conversion_date: "2026-07-12",
};

const pzConversionNoId = { ...pzConversionRow, conversion_id: "", id: "" };

function expectedPartnerizeAuth() {
  return "Basic " + Buffer.from("pz-app-key:pz-api-key").toString("base64");
}

test("[Partnerize] maps conversion rows to ExternalCommission with ok diagnostic", async () => {
  mockFetch(() => ({
    body: { conversions: [pzConversionRow, pzConversionNoId] },
  }));

  const { commissions, diagnostic } = await fetchPartnerizeCommissions(START, END);

  // Endpoint shape — Partnerize conversions report
  assert.equal(calls.length, 1);
  assert.ok(
    calls[0].url.includes("/publishers/pub-123/reports/conversions.json"),
    `unexpected Partnerize URL: ${calls[0].url}`
  );
  assert.ok(calls[0].url.includes("start_date=2026-07-01"), "start_date param missing");
  assert.ok(calls[0].url.includes("end_date=2026-07-31"), "end_date param missing");
  assert.equal(
    (calls[0].init?.headers as any)?.Authorization,
    expectedPartnerizeAuth(),
    "Authorization header must use Basic(applicationKey:apiKey)"
  );

  // Row without a conversion_id is dropped
  assert.equal(commissions.length, 1);
  const c = commissions[0];
  assert.equal(c.partner, "partnerize");
  assert.equal(c.partnerReferenceId, "PZ-5001");
  // commission_amount takes precedence
  assert.equal(c.amount, 6.0);
  assert.equal(c.currency, "USD");
  assert.equal(c.reportedAt, "2026-07-12");

  // Diagnostic
  assert.equal(diagnostic.status, "ok");
  assert.equal(diagnostic.partner, "partnerize");
  assert.equal(diagnostic.rowCount, 1);
  assert.equal(diagnostic.reason, undefined);
});

test("[Partnerize] returns error diagnostic on non-OK response — never throws", async () => {
  // pzFetch throws on non-2xx; fetchPartnerizeCommissions catches it and emits status:"error"
  // (unlike getConversionReport which swallowed the error, making it indistinguishable from 0 rows)
  mockFetch(() => ({ status: 500, body: { error: "internal server error" } }));

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchPartnerizeCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(diagnostic.status, "error", "non-2xx must produce status:error, not ok with 0 rows");
    assert.equal(diagnostic.partner, "partnerize");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason, "error diagnostic must include a reason");
  } finally {
    console.error = realError;
  }
  assert.ok(
    logged.some((l) => l.includes("[Reconciliation] Partnerize fetch error")),
    `expected Partnerize error log; got: ${JSON.stringify(logged)}`
  );
});

test("[Partnerize] returns skipped diagnostic with a warning when Partnerize credentials are absent", async () => {
  const savedAppKey = process.env.PARTNERIZE_APPLICATION_KEY;
  const savedApiKey = process.env.PARTNERIZE_API_KEY;
  const savedPubId = process.env.PARTNERIZE_PUBLISHER_ID;
  delete process.env.PARTNERIZE_APPLICATION_KEY;
  delete process.env.PARTNERIZE_API_KEY;
  delete process.env.PARTNERIZE_PUBLISHER_ID;
  mockFetch(() => ({ body: { conversions: [pzConversionRow] } }));

  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const { commissions, diagnostic } = await fetchPartnerizeCommissions(START, END);
    assert.deepEqual(commissions, []);
    assert.equal(calls.length, 0, "no HTTP call should be made without credentials");
    assert.equal(diagnostic.status, "skipped");
    assert.equal(diagnostic.partner, "partnerize");
    assert.equal(diagnostic.rowCount, 0);
    assert.ok(diagnostic.reason?.includes("PARTNERIZE"), "skipped reason must name the missing credentials");
  } finally {
    console.warn = realWarn;
    process.env.PARTNERIZE_APPLICATION_KEY = savedAppKey;
    process.env.PARTNERIZE_API_KEY = savedApiKey;
    process.env.PARTNERIZE_PUBLISHER_ID = savedPubId;
  }
  assert.ok(
    warnings.some((w) => w.includes("Partnerize")),
    `expected Partnerize credentials warning; got: ${JSON.stringify(warnings)}`
  );
});
