/**
 * resolve-earner-by-handle.db.test.ts
 *
 * `resolveEarnerByHandle` (server/services/contact-rails.service.ts) is the ONE statement of which
 * account a public handle names (§18 rule 1). It was extracted from `resolveContactTarget` so the
 * advisors rail (`POST /api/trips/:tripId/advisors`, `{ handle }`) could address an expert the
 * Locked Decision 40 way. `contact-rails.test.ts` is PURE — it never runs this SELECT — so this
 * file proves the query itself against a real database.
 *
 * What it proves:
 *   R1  a live expert's handle resolves to that account's id, handle normalized
 *   R2  padded / mixed-case input normalizes before the lookup
 *   R3  a live provider resolves too (earner = expert OR provider; approval is the CALLER's check)
 *   R4  a suspended earner resolves to null
 *   R5  a deleted earner resolves to null
 *   R6  a traveler who holds a handle resolves to null (not an earner)
 *   R7  an unknown handle and a blank one resolve to null
 *
 * Run with:
 *   npx tsx --test server/__tests__/resolve-earner-by-handle.db.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://claude:claude@localhost:5432/traveloure_test";

const { db, pool } = await import("../db");
const { inArray } = await import("drizzle-orm");
const { users } = await import("../../shared/schema");
const { resolveEarnerByHandle } = await import("../services/contact-rails.service");

// Handles are UNIQUE and capped at 30 chars: a short per-run suffix keeps reruns independent.
const RUN = crypto.randomBytes(3).toString("hex");
const created: string[] = [];

async function createUser(handle: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `reh-${id.slice(0, 8)}@test.invalid`,
    firstName: "Handle",
    lastName: "Fixture",
    role: "expert",
    handle,
    ...overrides,
  } as any);
  created.push(id);
  return id;
}

const H = {
  expert: `reh-exp-${RUN}`,
  provider: `reh-prov-${RUN}`,
  suspended: `reh-susp-${RUN}`,
  deleted: `reh-del-${RUN}`,
  traveler: `reh-trav-${RUN}`,
};
const ids: Record<keyof typeof H, string> = {} as any;

describe("resolveEarnerByHandle — the one handle→account statement, against a real database", () => {
  before(async () => {
    ids.expert = await createUser(H.expert);
    ids.provider = await createUser(H.provider, { role: "service_provider" });
    ids.suspended = await createUser(H.suspended, { isSuspended: true });
    ids.deleted = await createUser(H.deleted, { isDeleted: true });
    ids.traveler = await createUser(H.traveler, { role: "user" });
  });

  after(async () => {
    if (created.length) await db.delete(users).where(inArray(users.id, created));
    await pool.end();
  });

  it("R1: a live expert's handle resolves to that account", async () => {
    assert.deepEqual(await resolveEarnerByHandle(H.expert), { id: ids.expert, handle: H.expert });
  });

  it("R2: padded, mixed-case input is normalized before the lookup", async () => {
    assert.deepEqual(await resolveEarnerByHandle(`  ${H.expert.toUpperCase()} `), {
      id: ids.expert,
      handle: H.expert,
    });
  });

  it("R3: a live provider resolves — expert approval is the caller's check, not this one's", async () => {
    assert.deepEqual(await resolveEarnerByHandle(H.provider), { id: ids.provider, handle: H.provider });
  });

  it("R4: a suspended earner resolves to null", async () => {
    assert.equal(await resolveEarnerByHandle(H.suspended), null);
  });

  it("R5: a deleted earner resolves to null", async () => {
    assert.equal(await resolveEarnerByHandle(H.deleted), null);
  });

  it("R6: a traveler holding a handle is not an earner and resolves to null", async () => {
    assert.equal(await resolveEarnerByHandle(H.traveler), null);
  });

  it("R7: an unknown handle and a blank one resolve to null", async () => {
    assert.equal(await resolveEarnerByHandle(`reh-none-${RUN}`), null);
    assert.equal(await resolveEarnerByHandle("   "), null);
  });
});
