/**
 * gem-promotion.db.test.ts — the nugget → gem candidate path
 * (2026-08-29-replit-gem-audit ruling 4; ledger row of the same slug).
 *
 * Proves against a real database that:
 *   G1. propose moves NULL → 'submitted' (owner only) and the candidate lists
 *   G2. a second propose loses (atomic conditional — 'submitted' is not re-enterable)
 *   G3. a non-owner's propose matches 0 rows (no cross-tenant submit)
 *   G4. approve births the gem with PROVENANCE — curated_by_expert_id = the
 *       nugget's author, the admin-assigned gemScore, and the nugget linkage
 *       (promoted_gem_id) — and the insight travels as the description
 *   G5. a double approve loses (one gem, not two) — the claim is the guard
 *   G6. an out-of-range score and a POI-less candidate are refused (§13 — no
 *       nameless gem, no unvalidated score)
 *   G7. reject stamps the reason; re-propose after rejection re-enters review
 *       and clears the old verdict
 *   G8. §19: createLocalKnowledgeNugget strips a client-planted promotion
 *       cluster — a birthed nugget can never arrive pre-approved
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/gem-promotion.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, localKnowledgeNuggets, travelPulseHiddenGems } = await import("../../shared/schema");
const { proposeNuggetAsGem, listGemCandidates, approveGemCandidate, rejectGemCandidate } =
  await import("../services/gem-promotion.service");
const { createLocalKnowledgeNugget } = await import("../services/experts-query.service");

// ── Disposable-DB guard (mirrors checkout-claim-sweep's; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[gem-promotion] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `GemPromoTest-${RUN}`;
const expertId = crypto.randomUUID();
const otherExpertId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const createdUserIds = [expertId, otherExpertId, adminId];

async function makeNugget(overrides: Record<string, unknown> = {}): Promise<any> {
  const [row] = await db
    .insert(localKnowledgeNuggets)
    .values({
      expertUserId: expertId,
      nuggetType: "tip",
      city: CITY,
      linkedPoi: "Tatsumi Bridge",
      linkedNeighbourhood: "gion",
      insight: "Cross at dawn — the canal light is unreal and nobody is there.",
      ...overrides,
    } as any)
    .returning();
  return row;
}

describe("nugget → gem promotion rail (ruling 4)", () => {
  before(async () => {
    await assertDisposableDb();
    for (const [id, role] of [
      [expertId, "local_expert"],
      [otherExpertId, "local_expert"],
      [adminId, "admin"],
    ] as const) {
      await db.insert(users).values({
        id,
        email: `gem-promo-${id.slice(0, 8)}@test.invalid`,
        firstName: id === expertId ? "Yuki" : "Other",
        lastName: "Tester",
        role,
      } as any);
    }
  });

  after(async () => {
    await db.delete(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.city, CITY));
    await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.city, CITY));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await pool.end();
  });

  it("G1: propose moves NULL → submitted and the candidate lists with its author", async () => {
    const nugget = await makeNugget();
    const proposed = await proposeNuggetAsGem(nugget.id, expertId);
    assert.ok(proposed, "owner's propose must win");
    assert.equal(proposed.promotionStatus, "submitted");
    assert.ok(proposed.promotionSubmittedAt);

    const candidates = await listGemCandidates();
    const mine = candidates.find((c) => c.id === nugget.id);
    assert.ok(mine, "submitted nugget must appear in the admin queue");
    assert.equal(mine.expertUserId, expertId);
    assert.equal(mine.authorFirstName, "Yuki");
  });

  it("G2: a second propose loses — submitted is not re-enterable", async () => {
    const nugget = await makeNugget();
    assert.ok(await proposeNuggetAsGem(nugget.id, expertId));
    assert.equal(await proposeNuggetAsGem(nugget.id, expertId), null);
  });

  it("G3: a non-owner's propose matches 0 rows", async () => {
    const nugget = await makeNugget();
    assert.equal(await proposeNuggetAsGem(nugget.id, otherExpertId), null);
    const [row] = await db
      .select()
      .from(localKnowledgeNuggets)
      .where(eq(localKnowledgeNuggets.id, nugget.id));
    assert.equal(row.promotionStatus, null, "status untouched by the losing propose");
  });

  it("G4: approve births the gem with provenance, score, and linkage", async () => {
    const nugget = await makeNugget();
    await proposeNuggetAsGem(nugget.id, expertId);
    const result = await approveGemCandidate({ id: nugget.id, adminId, gemScore: 88 });
    assert.ok(result.ok, "approve must succeed");
    const gem = (result as any).gem;
    // PROVENANCE: the born gem is attributed to the nugget's author — from the
    // rail, not a body field (rulings 1+4).
    assert.equal(gem.curatedByExpertId, expertId);
    assert.equal(gem.gemScore, 88);
    assert.equal(gem.placeName, "Tatsumi Bridge");
    assert.equal(gem.city, CITY);
    assert.equal(gem.description, nugget.insight);
    assert.equal(gem.aiGenerated, false);

    const [after1] = await db
      .select()
      .from(localKnowledgeNuggets)
      .where(eq(localKnowledgeNuggets.id, nugget.id));
    assert.equal(after1.promotionStatus, "approved");
    assert.equal(after1.promotedGemId, gem.id);
    assert.equal(after1.promotionReviewedBy, adminId);
  });

  it("G5: a double approve loses — one gem, never two", async () => {
    const nugget = await makeNugget({ linkedPoi: `DoubleApprove-${RUN}` });
    await proposeNuggetAsGem(nugget.id, expertId);
    const first = await approveGemCandidate({ id: nugget.id, adminId, gemScore: 70 });
    assert.ok(first.ok);
    const second = await approveGemCandidate({ id: nugget.id, adminId, gemScore: 99 });
    assert.equal(second.ok, false);
    assert.equal((second as any).status, 409);
    const gems = await db
      .select()
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.placeName, `DoubleApprove-${RUN}`));
    assert.equal(gems.length, 1, "exactly one gem row");
  });

  it("G6: an out-of-range score and a POI-less candidate are refused", async () => {
    const nugget = await makeNugget({ linkedPoi: null });
    await proposeNuggetAsGem(nugget.id, expertId);
    for (const bad of [0, 101, 8.5, NaN]) {
      const r = await approveGemCandidate({ id: nugget.id, adminId, gemScore: bad });
      assert.equal(r.ok, false);
      assert.equal((r as any).status, 400);
    }
    const noName = await approveGemCandidate({ id: nugget.id, adminId, gemScore: 80 });
    assert.equal(noName.ok, false, "no linked POI and no placeName ⇒ refuse, never guess (§13)");
    assert.equal((noName as any).status, 400);
    // Refusals never consumed the candidate.
    const [row] = await db
      .select()
      .from(localKnowledgeNuggets)
      .where(eq(localKnowledgeNuggets.id, nugget.id));
    assert.equal(row.promotionStatus, "submitted");
    // With an explicit placeName the same candidate approves.
    const withName = await approveGemCandidate({
      id: nugget.id,
      adminId,
      gemScore: 80,
      placeName: `NamedByAdmin-${RUN}`,
    });
    assert.ok(withName.ok);
    assert.equal((withName as any).gem.curatedByExpertId, expertId);
  });

  it("G7: reject stamps the reason; re-propose re-enters review and clears the verdict", async () => {
    const nugget = await makeNugget();
    await proposeNuggetAsGem(nugget.id, expertId);
    const rejected = await rejectGemCandidate({ id: nugget.id, adminId, reason: "Too generic" });
    assert.ok(rejected.ok);
    assert.equal((rejected as any).candidate.promotionStatus, "rejected");
    assert.equal((rejected as any).candidate.promotionReviewNote, "Too generic");

    const reproposed = await proposeNuggetAsGem(nugget.id, expertId);
    assert.ok(reproposed, "a rejected nugget can be re-proposed");
    assert.equal(reproposed.promotionStatus, "submitted");
    assert.equal(reproposed.promotionReviewNote, null, "old verdict cleared");
    assert.equal(reproposed.promotionReviewedBy, null);

    const empty = await rejectGemCandidate({ id: nugget.id, adminId, reason: "   " });
    assert.equal(empty.ok, false, "a blank reason is refused");
  });

  it("G8: §19 — a client-planted promotion cluster is stripped at nugget birth", async () => {
    const born = await createLocalKnowledgeNugget({
      expertUserId: expertId,
      nuggetType: "tip",
      city: CITY,
      insight: "Planted approval attempt — must arrive unpromoted.",
      promotionStatus: "approved",
      promotedGemId: "planted-gem-id",
      promotionReviewedBy: expertId,
    });
    assert.equal(born.promotionStatus, null, "planted status stripped");
    assert.equal(born.promotedGemId, null, "planted gem linkage stripped");
    assert.equal(born.promotionReviewedBy, null, "planted reviewer stripped");
  });
});
