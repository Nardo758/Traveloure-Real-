/**
 * Affiliate reconciliation — MONEY_MAP F-5 exact-token adoption tests.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/affiliate-reconciliation-token-adoption.test.ts
 *
 * Verifies:
 *  - buildAttributionSubId / parseAttributionSubId round-trip (incl. no-dot → token null)
 *  - an external row whose sub_id echoes our attribution token is matched EXACTLY against the
 *    internal zero-amount row carrying that booking-request id, adopting the REAL partner
 *    amount (never estimating) — and the linked expert_earnings row is adopted too
 *  - a second run is a no-op (idempotent — already-matched rows are never re-adopted)
 *  - a zero-amount internal row with NO token match never matches (not exact, not fuzzy)
 *  - normal nonzero fuzzy (date+amount) matching is unaffected by the token-adoption pass
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.TRAVELPAYOUTS_TOKEN = "test-token";
process.env.TRAVELPAYOUTS_MARKER = "405110";

const { buildAttributionSubId, parseAttributionSubId, applyAttributionSubId } = await import(
  "../services/travelpayouts/travelpayouts-client"
);
const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");

after(async () => {
  await pool.end().catch(() => {});
});

// ---------------------------------------------------------------------------
// fetch mock (mirrors affiliate-reconciliation-travelpayouts.test.ts)
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockActionRows(rows: any[]) {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    // Only the execute_query statistics call is exercised by these tests.
    if (url.includes("/statistics/v1/execute_query")) {
      return new Response(JSON.stringify({ results: rows, total_rows: rows.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ results: [], total_rows: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DB fixtures
// ---------------------------------------------------------------------------

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (${id}, ${id + "@test.dev"}, 'expert')
  `);
  return id;
}

async function createTestPartner(name: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category)
    VALUES (${id}, ${name}, 'https://example.test', 'transport')
  `);
  return id;
}

async function createAffiliateEarning(opts: {
  expertId?: string | null;
  partnerId?: string | null;
  totalCommission?: string;
  externalReportData?: Record<string, unknown> | null;
  createdAt?: Date;
}): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = opts.createdAt ?? new Date();
  await db.execute(sql`
    INSERT INTO affiliate_earnings (
      id, partner_id, expert_id, booking_amount, commission_rate, total_commission,
      platform_share, expert_share, provider_share, currency, status,
      reconciliation_status, external_report_data, created_at
    ) VALUES (
      ${id}, ${opts.partnerId ?? null}, ${opts.expertId ?? null}, '100.00', '0.00',
      ${opts.totalCommission ?? "0.00"}, '0.00', '0.00', '0.00', 'USD', 'pending',
      'unmatched', ${opts.externalReportData ? JSON.stringify(opts.externalReportData) : null}::jsonb,
      ${createdAt.toISOString()}
    )
  `);
  return id;
}

async function createLinkedExpertEarning(expertId: string, affiliateEarningId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, reference_id, reference_type, status)
    VALUES (${id}, ${expertId}, 'affiliate_commission', '0.00', ${affiliateEarningId}, 'affiliate_earning', 'held')
  `);
  return id;
}

async function getAffiliateEarning(id: string): Promise<any> {
  const res = await db.execute(sql`SELECT * FROM affiliate_earnings WHERE id = ${id}`);
  return res.rows[0];
}

async function getExpertEarning(id: string): Promise<any> {
  const res = await db.execute(sql`SELECT * FROM expert_earnings WHERE id = ${id}`);
  return res.rows[0];
}

async function cleanup(ids: {
  affiliateEarnings?: string[];
  expertEarnings?: string[];
  users?: string[];
  partners?: string[];
}): Promise<void> {
  for (const id of ids.expertEarnings ?? []) {
    await db.execute(sql`DELETE FROM expert_earnings WHERE id = ${id}`);
  }
  for (const id of ids.affiliateEarnings ?? []) {
    await db.execute(sql`DELETE FROM affiliate_earnings WHERE id = ${id}`);
  }
  for (const id of ids.partners ?? []) {
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${id}`);
  }
  for (const id of ids.users ?? []) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Token helper round-trip
// ---------------------------------------------------------------------------

test("buildAttributionSubId / parseAttributionSubId round-trip", () => {
  const token = crypto.randomUUID();
  const subId = buildAttributionSubId(token);
  assert.equal(subId, `405110.${token}`);

  const parsed = parseAttributionSubId(subId);
  assert.equal(parsed.marker, "405110");
  assert.equal(parsed.token, token);
});

test("parseAttributionSubId: no dot present → token is null", () => {
  const parsed = parseAttributionSubId("405110");
  assert.equal(parsed.marker, "405110");
  assert.equal(parsed.token, null);
});

test("parseAttributionSubId: trailing dot with empty token → token is null", () => {
  const parsed = parseAttributionSubId("405110.");
  assert.equal(parsed.marker, "405110");
  assert.equal(parsed.token, null);
});

// ---------------------------------------------------------------------------
// applyAttributionSubId — flag-off byte-identical proof (item 2 verification)
// ---------------------------------------------------------------------------

test("applyAttributionSubId: flag OFF returns the URL byte-identical, even with a sub_id param", () => {
  const url = "https://wegotrip.com/book?tour=123&sub_id=405110&other=x";
  assert.equal(applyAttributionSubId(url, "some-booking-id", false), url);
});

test("applyAttributionSubId: flag ON rewrites sub_id to the attribution token when present", () => {
  const url = "https://wegotrip.com/book?tour=123&sub_id=405110";
  const rewritten = applyAttributionSubId(url, "booking-abc", true);
  const parsed = new URL(rewritten);
  assert.equal(parsed.searchParams.get("sub_id"), "405110.booking-abc");
  assert.equal(parsed.searchParams.get("tour"), "123");
});

test("applyAttributionSubId: flag ON but no sub_id param present → URL unchanged", () => {
  const url = "https://wegotrip.com/book?tour=123";
  assert.equal(applyAttributionSubId(url, "booking-abc", true), url);
});

test("applyAttributionSubId: malformed URL never throws — returned unchanged", () => {
  const notAUrl = "not-a-url";
  assert.equal(applyAttributionSubId(notAUrl, "booking-abc", true), notAUrl);
  assert.equal(applyAttributionSubId(notAUrl, "booking-abc", false), notAUrl);
});

// ---------------------------------------------------------------------------
// 2/3. Exact-token adoption + idempotency
// ---------------------------------------------------------------------------

test("exact-token match adopts the real amount and marks matched (incl. linked expert earning)", async () => {
  const expertId = await createTestUser();
  const bookingRequestId = crypto.randomUUID();
  const affiliateEarningId = await createAffiliateEarning({
    expertId,
    totalCommission: "0.00",
    externalReportData: { affiliateBookingRequestId: bookingRequestId },
  });
  const expertEarningId = await createLinkedExpertEarning(expertId, affiliateEarningId);

  try {
    mockActionRows([
      {
        campaign_id: 150,
        campaign_name_en: "WeGoTrip",
        action_id: "150:9999",
        created_at_day: todayIso(),
        sub_id: buildAttributionSubId(bookingRequestId),
        state: "processing",
        type: "action",
        paid_profit_usd: "8.00",
        processing_profit_usd: "4.34",
        price_usd: "100.00",
      },
    ]);

    await affiliateReconciliationService.matchRecords("this_month", "travelpayouts");

    const row = await getAffiliateEarning(affiliateEarningId);
    assert.equal(row.reconciliation_status, "matched");
    assert.equal(row.partner_reference_id, "150:9999");
    assert.equal(parseFloat(row.total_commission), 12.34);
    // Fallback split (no fee_bands row seeded in the test DB): 70/30 platform/expert.
    assert.equal(parseFloat(row.platform_share), 8.64); // round(12.34 * 0.70, 2)
    assert.equal(parseFloat(row.expert_share), 3.70); // round(12.34 * 0.30, 2)

    const expertRow = await getExpertEarning(expertEarningId);
    assert.equal(parseFloat(expertRow.amount), 3.70);
  } finally {
    await cleanup({
      expertEarnings: [expertEarningId],
      affiliateEarnings: [affiliateEarningId],
      users: [expertId],
    });
  }
});

test("second run is a no-op — an already-matched row is never re-adopted", async () => {
  const expertId = await createTestUser();
  const bookingRequestId = crypto.randomUUID();
  const affiliateEarningId = await createAffiliateEarning({
    expertId,
    totalCommission: "0.00",
    externalReportData: { affiliateBookingRequestId: bookingRequestId },
  });
  const expertEarningId = await createLinkedExpertEarning(expertId, affiliateEarningId);

  try {
    const rows = [
      {
        campaign_id: 150,
        campaign_name_en: "WeGoTrip",
        action_id: "150:8888",
        created_at_day: todayIso(),
        sub_id: buildAttributionSubId(bookingRequestId),
        state: "processing",
        type: "action",
        paid_profit_usd: "5.00",
        processing_profit_usd: "0.00",
        price_usd: "50.00",
      },
    ];

    mockActionRows(rows);
    await affiliateReconciliationService.matchRecords("this_month", "travelpayouts");
    const firstPass = await getAffiliateEarning(affiliateEarningId);
    assert.equal(firstPass.reconciliation_status, "matched");
    assert.equal(parseFloat(firstPass.total_commission), 5.0);

    // Second pass: same external report, same DB state — must not re-adopt or change anything.
    mockActionRows(rows);
    await affiliateReconciliationService.matchRecords("this_month", "travelpayouts");
    const secondPass = await getAffiliateEarning(affiliateEarningId);
    assert.equal(secondPass.reconciliation_status, "matched");
    assert.equal(parseFloat(secondPass.total_commission), 5.0);
    assert.equal(secondPass.reconciled_at?.getTime?.(), firstPass.reconciled_at?.getTime?.());

    const expertRow = await getExpertEarning(expertEarningId);
    assert.equal(parseFloat(expertRow.amount), 1.5); // round(5.00 * 0.30, 2)
  } finally {
    await cleanup({
      expertEarnings: [expertEarningId],
      affiliateEarnings: [affiliateEarningId],
      users: [expertId],
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Tokenless zero-amount row never matches
// ---------------------------------------------------------------------------

test("a zero-amount internal row with no token match is never matched (not exact, not fuzzy)", async () => {
  const affiliateEarningId = await createAffiliateEarning({
    totalCommission: "0.00",
    externalReportData: { affiliateBookingRequestId: "some-other-booking-request-id" },
  });

  try {
    mockActionRows([
      {
        campaign_id: 150,
        campaign_name_en: "WeGoTrip",
        action_id: "150:7777",
        created_at_day: todayIso(),
        sub_id: "405110", // no token suffix at all
        state: "processing",
        type: "action",
        paid_profit_usd: "3.00",
        processing_profit_usd: "0.00",
        price_usd: "30.00",
      },
    ]);

    await affiliateReconciliationService.matchRecords("this_month", "travelpayouts");

    const row = await getAffiliateEarning(affiliateEarningId);
    assert.equal(row.reconciliation_status, "unmatched");
    assert.equal(parseFloat(row.total_commission), 0);
  } finally {
    await cleanup({ affiliateEarnings: [affiliateEarningId] });
  }
});

// ---------------------------------------------------------------------------
// 5. Regression: normal nonzero fuzzy matching still works unaffected
// ---------------------------------------------------------------------------

test("normal nonzero fuzzy (date+amount) matching is unaffected by the token-adoption pass", async () => {
  const partnerId = await createTestPartner("Travelpayouts");
  const affiliateEarningId = await createAffiliateEarning({
    partnerId,
    totalCommission: "5.50",
    externalReportData: null, // no token — must fall through to the fuzzy pass
  });

  try {
    mockActionRows([
      {
        campaign_id: 150,
        campaign_name_en: "WeGoTrip",
        action_id: "150:6666",
        created_at_day: todayIso(),
        sub_id: "405110", // present but tokenless — irrelevant to fuzzy matching
        state: "processing",
        type: "action",
        paid_profit_usd: "3.00",
        processing_profit_usd: "2.50",
        price_usd: "55.00",
      },
    ]);

    await affiliateReconciliationService.matchRecords("this_month", "travelpayouts");

    const row = await getAffiliateEarning(affiliateEarningId);
    assert.equal(row.reconciliation_status, "matched");
    assert.equal(row.partner_reference_id, "150:6666");
    // Fuzzy match adopts nothing — the internal commission amount is untouched.
    assert.equal(parseFloat(row.total_commission), 5.5);
  } finally {
    await cleanup({ affiliateEarnings: [affiliateEarningId], partners: [partnerId] });
  }
});
