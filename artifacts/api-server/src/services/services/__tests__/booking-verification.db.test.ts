/**
 * booking-verification.service.ts — DB-backed proof (real Postgres, mocked Tavily/LLM).
 *
 * Covers what the mocked unit test (booking-verification.test.ts) can't: that the verification
 * snapshot actually round-trips through the real `affiliate_booking_requests.verification` jsonb
 * column (migration 170), and that the route's authorization gate — reused verbatim from the
 * existing PATCH handler (role-based: expert-family or admin, DB role lookup, never the session's
 * possibly-stale role string) — correctly passes expert/admin real DB rows and denies a plain
 * traveler role, using storage.getUser against real rows (not a mock).
 *
 * Requires a local Postgres reachable at DATABASE_URL (defaults to the project's local test DB —
 * see CLAUDE.md "local DB postgresql://claude:claude@localhost:5432/traveloure_test"). If the
 * cluster isn't running: `sudo pg_ctlcluster 16 main start`.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *     npx tsx --test server/services/__tests__/booking-verification.db.test.ts
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";
}
// The service's own key-gate (§13) requires both keys to be present to do any work at all —
// self-contained defaults so this file doesn't depend on the caller's shell env. Tavily/LLM
// clients are always injected as mocks below, so these values are never used to make a real
// network call; they only need to be non-empty to pass isBookingVerificationReady().
if (!process.env.TAVILY_API_KEY) process.env.TAVILY_API_KEY = "tvly-test-db";
if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = "sk-test-db";

// server/db.ts throws at import time if DATABASE_URL is unset, and ESM hoists static imports
// before the env defaults above would run — so these are deferred dynamic imports (top-level
// await) to make the defaults actually take effect for a caller who sets nothing.
const { pool } = await import("../../db");
const { storage } = await import("../../storage");
const { isExpertRole } = await import("@shared/roles");
const { verifyBookingRequest, __resetVerificationThrottleForTests } = await import(
  "../booking-verification.service"
);

const SECRET_PARTNER_URL = "https://secret-partner.example.com/book?ref=db-test-token";

function mockTavily(rawContent: string) {
  return {
    extract: async (_urls: string[], _opts: any) => ({
      results: [{ rawContent, title: "Product page" }],
    }),
  } as any;
}

function mockAnthropic(responseText: string) {
  return {
    messages: {
      create: async (_opts: any) => ({
        model: "claude-sonnet-5",
        usage: { input_tokens: 5, output_tokens: 5 },
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as any;
}

// Test fixtures created in `before`, cleaned up in `after` — never touches any other row.
let travelerId: string;
let expertId: string;
let adminId: string;
let plainUserId: string;
let requestId: string;

describe("booking-verification.service — DB-backed (real Postgres)", () => {
  before(async () => {
    // Ensure migration 170's column exists (idempotent — mirrors the migration's own ADD COLUMN
    // IF NOT EXISTS, so this is safe to run against an already-migrated DB too).
    await pool.query(`ALTER TABLE affiliate_booking_requests ADD COLUMN IF NOT EXISTS verification jsonb`);

    travelerId = crypto.randomUUID();
    expertId = crypto.randomUUID();
    adminId = crypto.randomUUID();
    plainUserId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO users (id, email, role) VALUES ($1, $2, 'user'), ($3, $4, 'expert'), ($5, $6, 'admin'), ($7, $8, 'user')`,
      [
        travelerId, `traveler-${travelerId}@test.dev`,
        expertId, `expert-${expertId}@test.dev`,
        adminId, `admin-${adminId}@test.dev`,
        plainUserId, `plain-${plainUserId}@test.dev`,
      ],
    );

    const created = await storage.createAffiliateBookingRequest({
      userId: travelerId,
      expertId,
      itemName: "Fushimi Inari Night Tour",
      itemDescription: null,
      partnerName: "Klook",
      partnerCategory: "tours",
      affiliateUrl: SECRET_PARTNER_URL,
      travelDate: "2026-09-01",
      travelers: 2,
      userNotes: null,
      expertNotes: null,
      confirmationRef: null,
      price: "100.00",
      status: "assigned",
    } as any);
    requestId = created.id;
  });

  after(async () => {
    await pool.query(`DELETE FROM affiliate_booking_requests WHERE id = $1`, [requestId]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [
      [travelerId, expertId, adminId, plainUserId],
    ]);
    await pool.end();
  });

  beforeEach(() => {
    __resetVerificationThrottleForTests();
  });

  it("persists the verification snapshot onto the REAL row, and it round-trips on a fresh read", async () => {
    const tavilyClient = mockTavily("Price: $135. Currently bookable. Free cancellation up to 24h before.");
    const anthropicClient = mockAnthropic(
      JSON.stringify({
        price: 135,
        currency: "USD",
        availability: "bookable",
        dateAvailable: true,
        cancellationTerms: "Free cancellation up to 24h before",
        operatingHours: null,
      }),
    );

    const result = await verifyBookingRequest(requestId, { tavilyClient, anthropicClient });
    assert.equal(result.available, true);
    assert.ok(result.snapshot);
    assert.equal(result.snapshot!.price, 135);
    assert.deepEqual(result.snapshot!.flags, [{ type: "price_drift", seen: 100, current: 135 }]);

    // Fresh read straight from Postgres — not the value the service handed back in-process.
    const { rows } = await pool.query(
      `SELECT verification FROM affiliate_booking_requests WHERE id = $1`,
      [requestId],
    );
    assert.equal(rows.length, 1);
    const persisted = rows[0].verification;
    assert.equal(persisted.price, 135);
    assert.equal(persisted.verdict, "flagged");
    assert.equal(persisted.source, "tavily+llm");

    // §16, DB-level: the affiliateUrl must never have landed in the verification jsonb.
    const serialized = JSON.stringify(persisted);
    assert.ok(!serialized.includes(SECRET_PARTNER_URL));
    assert.ok(!serialized.includes("secret-partner.example.com"));

    // And the row's OWN affiliateUrl column is completely untouched by the verify call.
    const { rows: urlRows } = await pool.query(
      `SELECT affiliate_url FROM affiliate_booking_requests WHERE id = $1`,
      [requestId],
    );
    assert.equal(urlRows[0].affiliate_url, SECRET_PARTNER_URL);
  });

  it("storage.getAffiliateBookingRequestsByExpert returns the row WITH its verification snapshot (the expert read path)", async () => {
    const rows = await storage.getAffiliateBookingRequestsByExpert(expertId);
    const row = rows.find((r) => r.id === requestId);
    assert.ok(row, "the assigned expert must see this request");
    assert.ok((row as any).verification, "the stored verification snapshot must be present on the expert read");
    assert.equal((row as any).verification.price, 135);
  });

  it("the assigned-expert gate (reused from the PATCH handler): expert role passes, admin passes, plain 'user' role is denied — using REAL DB role lookups", async () => {
    const expertUser = await storage.getUser(expertId);
    const adminUser = await storage.getUser(adminId);
    const plainUser = await storage.getUser(plainUserId);

    assert.ok(expertUser);
    assert.ok(adminUser);
    assert.ok(plainUser);

    // Exact predicate the route uses: `!isExpertRole(role) && role !== "admin"` ⇒ 403.
    const isForbidden = (u: { role: string | null }) => !isExpertRole(u.role ?? "") && u.role !== "admin";

    assert.equal(isForbidden(expertUser!), false, "expert-family role must be allowed to verify");
    assert.equal(isForbidden(adminUser!), false, "admin must be allowed to verify");
    assert.equal(isForbidden(plainUser!), true, "a plain traveler role must be denied");
  });

  it("re-verifying immediately after a successful verify is throttled (real end-to-end, not just the mocked unit test)", async () => {
    const tavilyClient = mockTavily("Price $100, bookable.");
    const anthropicClient = mockAnthropic(
      JSON.stringify({ price: 100, currency: "USD", availability: "bookable", dateAvailable: null, cancellationTerms: null, operatingHours: null }),
    );
    await verifyBookingRequest(requestId, { tavilyClient, anthropicClient });
    await assert.rejects(() => verifyBookingRequest(requestId, { tavilyClient, anthropicClient }));
  });
});
