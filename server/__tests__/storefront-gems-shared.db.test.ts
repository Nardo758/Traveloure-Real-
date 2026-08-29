/**
 * storefront-gems-shared.db.test.ts — the "{N} gems shared" conversion stat
 * (2026-08-29-replit-gem-audit ruling 7).
 *
 * Proves against a real database that the storefront payload's
 * earner.gemsSharedCount:
 *   S1. counts EXACTLY the gems attributed to the earner via
 *       curated_by_expert_id — another expert's gems and unattributed gems
 *       never inflate it
 *   S2. is 0 (client renders NO tile) for an earner with no attributed gems —
 *       never a fabricated number (§13)
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/storefront-gems-shared.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, providerServices, travelPulseHiddenGems } = await import("../../shared/schema");
const { loadStorefront } = await import("../routes/storefront.routes");

// ── Disposable-DB guard (house pattern; never defaults open) ──────────────────
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
      `[storefront-gems-shared] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `GemsSharedTest-${RUN}`;
const earnerId = crypto.randomUUID();
const otherId = crypto.randomUUID();
const earnerHandle = `gems-earner-${RUN}`;
const otherHandle = `gems-other-${RUN}`;

async function seedEarner(id: string, handle: string): Promise<void> {
  await db.insert(users).values({
    id,
    email: `gems-shared-${id.slice(0, 8)}@test.invalid`,
    firstName: "Gem",
    lastName: `Earner${RUN}`,
    role: "local_expert",
    handle,
  } as any);
  // The storefront 404s with no approved inventory — give each earner one
  // approved active listing so the page is publishable at all.
  await db.insert(providerServices).values({
    userId: id,
    serviceName: `Walking tour ${RUN}`,
    approvalStatus: "approved",
    status: "active",
  } as any);
}

describe('storefront "{N} gems shared" (ruling 7)', () => {
  before(async () => {
    await assertDisposableDb();
    await seedEarner(earnerId, earnerHandle);
    await seedEarner(otherId, otherHandle);
    // Two gems attributed to the earner, one to the other expert, one unattributed.
    for (const curatedByExpertId of [earnerId, earnerId, otherId, null]) {
      await db.insert(travelPulseHiddenGems).values({
        city: CITY,
        placeName: `Gem-${crypto.randomUUID().slice(0, 8)}`,
        gemScore: 80,
        curatedByExpertId,
      } as any);
    }
  });

  after(async () => {
    await db.delete(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.city, CITY));
    await db.delete(providerServices).where(inArray(providerServices.userId, [earnerId, otherId]));
    await db.delete(users).where(inArray(users.id, [earnerId, otherId]));
    await pool.end();
  });

  it("S1: counts exactly the earner's attributed gems", async () => {
    const payload = await loadStorefront(earnerHandle);
    assert.ok(payload, "storefront must resolve");
    assert.equal(payload!.earner.gemsSharedCount, 2, "two attributed gems, not three, not four");
  });

  it("S2: an earner with only someone else's / unattributed gems counts 0", async () => {
    const payload = await loadStorefront(otherHandle);
    assert.ok(payload, "storefront must resolve");
    assert.equal(payload!.earner.gemsSharedCount, 1, "only their own attributed gem");

    // And a truly gem-less earner: strip the other expert's attribution.
    await db
      .update(travelPulseHiddenGems)
      .set({ curatedByExpertId: null })
      .where(eq(travelPulseHiddenGems.curatedByExpertId, otherId));
    const bare = await loadStorefront(otherHandle);
    assert.equal(bare!.earner.gemsSharedCount, 0, "zero, honestly — the client renders no tile");
  });
});
