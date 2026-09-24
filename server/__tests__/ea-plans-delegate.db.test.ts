/**
 * Executive-assistant plans (Locked Decision 52 (C), ledger `2026-09-24-ea-plans-for-executive`)
 * and the trip-body allowlist (ledger `2026-09-24-trip-body-allowlist`). DB-backed.
 *   E1 a pending or someone else's relationship mints nothing (409 / 404).
 *   E2 an accepted relationship mints a plan OWNED by the executive, records the assistant, and
 *      tells the executive.
 *   E3 the assistant reads and writes through the one logistics predicate, never the owner tier.
 *   E4 the grant is the LINK, not the column: a hand-set column grants nothing, and revoking the
 *      link removes access and drops the plan from the assistant's list.
 *   E5 the client trip rails admit planning answers only — no author, EA, share-token or
 *      finalize column rides the body.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/ea-plans-delegate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isManagingEaForTrip, listEaManagedPlans, mintPlanForEaClient } from "../services/ea-plan-delegate.service";
import { authorizeTripLogistics, authorizeTripOwnerTier } from "../utils/trip-logistics-auth";
import { tripClientBodySchema } from "@shared/schema";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  ea: `eap-ea-${RUN}`,
  otherEa: `eap-ea2-${RUN}`,
  exec: `eap-exec-${RUN}`,
  stranger: `eap-str-${RUN}`,
  accepted: `eap-rel-a-${RUN}`,
  pending: `eap-rel-p-${RUN}`,
};
const tripIds: string[] = [];
const basics = { title: "Board offsite", destination: "Kyoto, Japan", startDate: "2027-05-01", endDate: "2027-05-04" } as any;

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.ea}, ${`${ids.ea}@t.test`}, 'Ada', 'Assistant', 'executive_assistant'),
           (${ids.otherEa}, ${`${ids.otherEa}@t.test`}, 'Otto', 'Other', 'executive_assistant'),
           (${ids.exec}, ${`${ids.exec}@t.test`}, 'Eve', 'Exec', 'user'),
           (${ids.stranger}, ${`${ids.stranger}@t.test`}, 'Sam', 'Stranger', 'user')
  `);
  await db.execute(sql`
    INSERT INTO ea_client_relationships (id, ea_user_id, client_user_id, client_email)
    VALUES (${ids.accepted}, ${ids.ea}, ${ids.exec}, ${`${ids.exec}@t.test`}),
           (${ids.pending}, ${ids.ea}, NULL, ${`nobody-${RUN}@t.test`})
  `);
});

after(async () => {
  for (const t of tripIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.exec}`).catch(() => {});
  await db.execute(sql`DELETE FROM ea_client_relationships WHERE ea_user_id IN (${ids.ea}, ${ids.otherEa})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.ea}, ${ids.otherEa}, ${ids.exec}, ${ids.stranger})`).catch(() => {});
});

test("E1: pending or foreign relationships mint nothing", async () => {
  const pending = await mintPlanForEaClient(ids.ea, ids.pending, basics);
  assert.deepEqual(pending, { ok: false, status: 409, reason: "not_accepted" });
  const foreign = await mintPlanForEaClient(ids.otherEa, ids.accepted, basics);
  assert.deepEqual(foreign, { ok: false, status: 404, reason: "not_found" });
});

test("E2 + E3: the executive owns it; the assistant edits, never the owner tier", async () => {
  const r = await mintPlanForEaClient(ids.ea, ids.accepted, basics);
  assert.ok(r.ok);
  if (!r.ok) return;
  tripIds.push(r.trip.id);
  assert.equal(r.trip.userId, ids.exec, "owned by the executive");
  assert.equal((r.trip as any).managedByEaId, ids.ea);
  assert.equal((r.trip as any).eaClientRelationshipId, ids.accepted);
  const notes: any = await db.execute(sql`SELECT type FROM notifications WHERE user_id = ${ids.exec} AND related_id = ${r.trip.id}`);
  assert.equal((notes.rows ?? notes)[0]?.type, "assistant_plan_created");

  assert.equal(await isManagingEaForTrip(r.trip.id, ids.ea), true);
  assert.equal(await authorizeTripLogistics(r.trip.id, ids.ea, "test"), null, "read");
  assert.equal(await authorizeTripLogistics(r.trip.id, ids.ea, "test", { requireWriteAccess: true }), null, "write");
  assert.equal((await authorizeTripOwnerTier(r.trip.id, ids.ea, "test"))?.status, 403, "never the owner tier");
  assert.equal((await authorizeTripLogistics(r.trip.id, ids.otherEa, "test"))?.status, 403);
  assert.equal((await listEaManagedPlans(ids.ea)).some((p) => p.id === r.trip.id), true);
  assert.equal((await listEaManagedPlans(ids.otherEa)).length, 0);
});

test("E4: the grant is the link — a hand-set column grants nothing; revoking removes access", async () => {
  const forged: any = await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, managed_by_ea_id, ea_client_relationship_id)
    VALUES (${`eap-forged-${RUN}`}, ${ids.stranger}, 'Not yours', 'Paris', '2027-06-01', '2027-06-02', ${ids.ea}, ${ids.accepted})
    RETURNING id
  `);
  const forgedId = (forged.rows ?? forged)[0].id;
  tripIds.push(forgedId);
  assert.equal(await isManagingEaForTrip(forgedId, ids.ea), false, "the link's client is not this trip's owner");
  assert.equal((await authorizeTripLogistics(forgedId, ids.ea, "test"))?.status, 403);

  const mine = tripIds[0];
  await db.execute(sql`DELETE FROM ea_client_relationships WHERE id = ${ids.accepted}`);
  assert.equal(await isManagingEaForTrip(mine, ids.ea), false, "revoked");
  assert.equal((await authorizeTripLogistics(mine, ids.ea, "test"))?.status, 403);
  assert.equal((await listEaManagedPlans(ids.ea)).length, 0, "the plan leaves the list");
});

test("E5: the client trip body admits planning answers only", () => {
  const parsed = tripClientBodySchema.partial().parse({
    title: "Kept",
    authorId: ids.stranger,
    managedByEaId: ids.stranger,
    eaClientRelationshipId: "x",
    shareToken: "t",
    finalizedAt: new Date().toISOString(),
    status: "final",
    isPublic: true,
    expertNotes: "private",
    trackingNumber: "TRV-FAKE",
  } as any);
  assert.deepEqual(Object.keys(parsed), ["title"]);
  const full = tripClientBodySchema.parse({ ...basics, authorId: ids.stranger } as any);
  assert.equal((full as any).authorId, undefined);
  assert.equal(full.destination, "Kyoto, Japan");
});
