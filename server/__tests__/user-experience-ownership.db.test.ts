/**
 * user-experience-ownership.db.test.ts — the user-experience block is owner-scoped on READ and on
 * ITEM WRITES.
 *
 * FINDINGS (security audit, as-of 4644af6; docs/findings/SECURITY_AUDIT_2026-09-01.md §4, §6):
 *
 *   §6 READ IDOR — `GET /api/user-experiences/:id` had no ownership check at all. It returned the
 *      row (budget, location, preferences, stepData) PLUS every child item to any authenticated
 *      caller who knew an id, while the list sibling one route above correctly scoped by userId.
 *
 *   §4 WRITE IDOR — `PATCH` and `DELETE /api/user-experience-items/:id` were `isAuthenticated`
 *      only and passed the path id straight to a storage writer keyed on `id` ALONE. Every other
 *      handler in the same block checked `experience.userId !== userId`; these two were the
 *      outliers. Listed in `DEFERRED_IDOR.md`, whose two other rows had since been fixed.
 *
 * WHY THE CHECK LIVES IN THE `WHERE`, AND WHY THAT IS WHAT THIS FILE ASSERTS.
 * `user_experience_items` has no `user_id` column — an item is owned through its parent
 * `user_experiences.user_id`. A route-level read-then-write pre-check would be a TOCTOU AND would
 * leave `updateUserExperienceItem`/`removeUserExperienceItem` reachable unowned by the next caller
 * (the shape that produced this finding in the first place). So the predicate is a subselect on
 * the parent applied INSIDE the write's own WHERE — the `markAsRead`/`deleteNotification` shape,
 * one derivative up — and U2/U3 therefore drive the STORAGE WRITERS directly, not just the routes:
 * a fix that only guarded the routes would still pass an HTTP-only test while the hole stayed open
 * for the next caller.
 *
 *   U1 a non-owner's GET is 404 and leaks no field of the row or its items
 *   U2 a non-owner's item PATCH matches nothing — 404, row byte-for-byte unchanged
 *   U3 a non-owner's item DELETE matches nothing — 404, row still present
 *   U4 the OWNER's PATCH and DELETE still work (the guard is not a blanket denial)
 *   U5 a non-owner cannot create an item against someone else's experience, and the item body is
 *      an allowlist (`userExperienceId`/`id` are not re-parentable from the body)
 *
 * 403-vs-404: every negative here asserts 404, matching the PATCH/DELETE siblings that already
 * existed in this block ("Experience not found"). A non-owner cannot distinguish someone else's id
 * from a nonexistent one on any verb.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test --test-force-exit server/__tests__/user-experience-ownership.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import contentRoutes, { userExperienceItemBodySchema } from "../routes/content.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const OWNER = `uxo-${RUN}-owner`;
const STRANGER = `uxo-${RUN}-stranger`;
const EXP_TYPE = `uxo-${RUN}-type`;

// Values that must never appear in a stranger's response body.
const SECRET_LOCATION = `secret-location-${RUN}`;
const SECRET_BUDGET = "12345.67";
const SECRET_ITEM_NAME = `secret-item-${RUN}`;

let experienceId = "";
let ownerItemId = "";

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ─────
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
      `[user-experience-ownership] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/**
 * Mounts the REAL content router with a chosen session identity. `isAuthenticated` does a live
 * `users` lookup and fails closed, which is why both accounts are seeded as real rows — a test
 * that stubbed the guard could pass against an unfixed handler for the wrong reason.
 */
async function withRouterAs<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(contentRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function readItem(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT id, name, notes, sort_order FROM user_experience_items WHERE id = ${id}`);
  return r.rows[0] ?? null;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${OWNER}, ${`${OWNER}@example.test`}, 'user'),
      (${STRANGER}, ${`${STRANGER}@example.test`}, 'user')
  `);
  await db.execute(sql`
    INSERT INTO experience_types (id, name, slug) VALUES (${EXP_TYPE}, 'UXO fixture', ${EXP_TYPE})
  `);
  const exp = await storage.createUserExperience({
    userId: OWNER,
    experienceTypeId: EXP_TYPE,
    title: `uxo-${RUN}`,
    location: SECRET_LOCATION,
    budget: SECRET_BUDGET,
  } as any);
  experienceId = exp.id;
  const item = await storage.addUserExperienceItem({
    userExperienceId: experienceId,
    name: SECRET_ITEM_NAME,
    notes: "original notes",
  } as any);
  ownerItemId = item.id;
});

after(async () => {
  // user_experiences → user_experience_items cascades; content_registry rows are keyed on the
  // experience id and go with it.
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${experienceId}`).catch(() => {});
  await db.execute(sql`DELETE FROM user_experiences WHERE user_id IN (${OWNER}, ${STRANGER})`);
  await db.execute(sql`DELETE FROM experience_types WHERE id = ${EXP_TYPE}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${STRANGER})`);
});

test("U1: a non-owner's GET is 404 and leaks no field of the experience or its items", async () => {
  await withRouterAs(STRANGER, async (base) => {
    const res = await fetch(`${base}/api/user-experiences/${experienceId}`);
    assert.equal(res.status, 404, "a stranger must not distinguish someone else's id from a missing one");
    const body = await res.text();
    assert.equal(body.includes(SECRET_LOCATION), false, "location must not leak");
    assert.equal(body.includes(SECRET_BUDGET), false, "budget must not leak");
    assert.equal(body.includes(SECRET_ITEM_NAME), false, "child items must not leak either");
  });

  // The discriminating half: the owner still gets the row AND its items.
  await withRouterAs(OWNER, async (base) => {
    const res = await fetch(`${base}/api/user-experiences/${experienceId}`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.equal(json.location, SECRET_LOCATION);
    assert.equal(json.items.length, 1);
  });
});

test("U2: a non-owner's item PATCH matches nothing — 404, and the row is unchanged", async () => {
  const before_ = await readItem(ownerItemId);
  await withRouterAs(STRANGER, async (base) => {
    const res = await fetch(`${base}/api/user-experience-items/${ownerItemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "hijacked", notes: "hijacked" }),
    });
    assert.equal(res.status, 404);
  });
  assert.deepEqual(await readItem(ownerItemId), before_, "the row must be byte-for-byte unchanged");

  // Storage layer directly — the writer itself must refuse, not merely the route in front of it.
  const viaStorage = await storage.updateUserExperienceItem(ownerItemId, STRANGER, { name: "hijacked" } as any);
  assert.equal(viaStorage, undefined, "the writer's WHERE must match zero rows for a non-owner");
  assert.deepEqual(await readItem(ownerItemId), before_);
});

test("U3: a non-owner's item DELETE matches nothing — 404, and the row is still present", async () => {
  await withRouterAs(STRANGER, async (base) => {
    const res = await fetch(`${base}/api/user-experience-items/${ownerItemId}`, { method: "DELETE" });
    assert.equal(res.status, 404, "a silent 204 would tell the caller nothing and look like success");
  });
  assert.notEqual(await readItem(ownerItemId), null, "the row must survive");

  const viaStorage = await storage.removeUserExperienceItem(ownerItemId, STRANGER);
  assert.equal(viaStorage, false, "the writer reports that nothing matched");
  assert.notEqual(await readItem(ownerItemId), null);
});

test("U4: the OWNER's PATCH and DELETE still succeed", async () => {
  await withRouterAs(OWNER, async (base) => {
    const patched = await fetch(`${base}/api/user-experience-items/${ownerItemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "owner edit" }),
    });
    assert.equal(patched.status, 200);
    assert.equal(((await patched.json()) as any).notes, "owner edit");

    const removed = await fetch(`${base}/api/user-experience-items/${ownerItemId}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
  });
  assert.equal(await readItem(ownerItemId), null, "the owner's delete actually deletes");
});

test("U5: a non-owner cannot create an item on someone else's experience, and the body is an allowlist", async () => {
  const countItems = async () => {
    const r = await db.execute(
      sql`SELECT count(*)::int AS n FROM user_experience_items WHERE user_experience_id = ${experienceId}`,
    );
    return (r.rows[0] as any).n as number;
  };
  const before_ = await countItems();

  await withRouterAs(STRANGER, async (base) => {
    const res = await fetch(`${base}/api/user-experiences/${experienceId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "planted" }),
    });
    assert.equal(res.status, 404, "the parent ownership check refuses the write");
  });
  assert.equal(await countItems(), before_, "nothing was written");

  // The allowlist half (§19): the parent link and the primary key are not body fields, so an item
  // can never be re-parented onto — or born inside — another account's experience through the body.
  const parsed = userExperienceItemBodySchema.partial().parse({
    name: "ok",
    userExperienceId: "someone-elses-experience",
    id: "attacker-chosen-id",
  } as Record<string, unknown>);
  assert.equal((parsed as Record<string, unknown>).userExperienceId, undefined);
  assert.equal((parsed as Record<string, unknown>).id, undefined);
  assert.equal(parsed.name, "ok", "the allowlist is not a blanket denial");
});
