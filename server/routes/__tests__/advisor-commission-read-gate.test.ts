/**
 * advisor-commission-read-gate.test.ts
 *
 * CLAUDE.md §12 same-class fix, commission rail only. `GET /trips/:tripId/commission`
 * (server/routes/booking-actions.ts) gated its advisor branch on assignment-row EXISTENCE
 * (`storage.getTripExpertAdvisoryAssignment` has no status filter), so a REJECTED advisor
 * could still read the trip's commission breakdown. The fix applies the canonical READ
 * predicate `tripAdvisorStatusGrantsAccess` (pending/accepted/assigned; rejected/unknown
 * denies) — deliberately NOT the write predicate: this is a read surface, and §12 keeps
 * `pending` on read surfaces (an invited expert previewing the gig before accepting).
 *
 * The private expert-notes GET/PATCH rail is owned by the fix on
 * claude/replit-audit-verify-implement-3v7q77 (write-set on both, route-level DB proofs
 * D5/D6 in expert-note-separation.db.test.ts) and is intentionally NOT touched or tested
 * here — one owner per rail.
 *
 * Approach — pulls the real handler off the router's own middleware stack (no HTTP server)
 * and calls it with a fake req/res, monkey-patching the `storage`/`db` singletons the router
 * imports (Node module cache), per the trip-anchor-candidates.test.ts spirit.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/advisor-commission-read-gate.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ||= "test-session-secret";

const { storage } = await import("../../storage.js");
const { db } = await import("../../db.js");
const bookingActionsModule = await import("../booking-actions.js");
const router: any = (bookingActionsModule as any).default ?? bookingActionsModule;

// Pull the real handler off the router's own stack (skip the isAuthenticated middleware —
// this suite exercises the advisor-status gate inside the handler, not session auth).
function getHandler(method: "get" | "patch", path: string): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method],
  );
  assert.ok(layer, `No route registered for ${method.toUpperCase()} ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

const getCommission = getHandler("get", "/trips/:tripId/commission");

function makeRes() {
  const captured = { status: 200, body: null as any };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: any) {
      captured.body = body;
      return res;
    },
  };
  return { captured, res };
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: { tripId: "trip-1" },
    user: { claims: { sub: "advisor-1" } },
    body: {},
    ...overrides,
  };
}

// db.select(...).from(...).where(...).limit(1) chain — the commission handler's secondary
// lookups. Empty rows fail safe without a real DB connection.
function makeMockSelect(rows: object[] = []) {
  return () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  };
}

beforeEach(() => {
  (db as any).select = makeMockSelect([]);
  // getExpertSplitRates() → getBand() reads via db.execute, wrapped in try/catch there and
  // falling back to the documented default split on any non-row result — no real DB needed
  // for the commission tests to reach a deterministic 200.
  (db as any).execute = async () => ({ rows: [] });
  storage.getItineraryItems = (async () => []) as any;
  storage.getProviderServicesByStatus = (async () => []) as any;
});

describe("GET /api/trips/:tripId/commission — §12 same-class read gate", () => {
  it("pending advisor → 200 (read access preserved — §12 restricts writes, not reads)", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => ({ status: "pending" })) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.tripId, "trip-1");
  });

  it("accepted advisor → 200", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => ({ status: "accepted" })) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 200);
  });

  it("assigned advisor → 200", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => ({ status: "assigned" })) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 200);
  });

  it("rejected advisor → 403", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => ({ status: "rejected" })) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 403);
  });

  it("unknown status → 403 (fail closed)", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => ({ status: "weird" })) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 403);
  });

  it("no assignment row → 403", async () => {
    storage.getTripExpertAdvisoryAssignment = (async () => null) as any;

    const { captured, res } = makeRes();
    await getCommission(makeReq(), res);

    assert.equal(captured.status, 403);
  });
});
