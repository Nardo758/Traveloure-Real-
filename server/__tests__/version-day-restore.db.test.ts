/**
 * D3 server — apply-days leaves the replaced day restorable (ledger
 * `2026-10-25-d3-restore-day`; migration 411, HELD). Section 5 checks 1–10, plus the
 * finalized-apply refusal. The table is created here from the migration file and is NOT
 * stamped into schema_migrations. DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql, getTableName } from "drizzle-orm";
import { db } from "../db";
import { planDayRestoreSnapshots } from "@shared/schema";
import { DAY_RESTORE_RETENTION_MS, dayAfterSignature } from "@shared/version-board";
import { MIGRATION_FILES } from "../migrations/migration-files";
import { VersionBoardError, applyDays } from "../services/version-board.service";
import { applyDaysUnchangedSinceRun } from "../services/fixed-plan.service";
import { DayRestoreError, listRestorableDays, readDaySignatureRows, restoreDay } from "../services/version-day-restore.service";
import versionsRoutes from "../routes/versions.routes";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = readFileSync(path.join(repo, "server/migrations/411_plan_day_restore_snapshots.sql"), "utf8");
const RUN = crypto.randomUUID().slice(0, 8);
const P = `d3${RUN}`;

type Fx = {
  owner: string;
  trip: string;
  variant: string;
  keep: string;
  dropA: string;
  dropB: string;
  locked: string;
  booked: string;
  booking: string;
  purchased: string;
  expert: string;
  held: string;
  day1: string;
  day3: string;
  cA: string;
  cB: string;
  cK: string;
};

function kid(tag: string, name: string) {
  return `${P}-${tag}-${name}`;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql.raw(MIGRATION));
});

after(async () => {
  const like = `${P}%`;
  await db.execute(sql`DELETE FROM plan_day_restore_snapshots WHERE trip_id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_item_comments WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_option_sets WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variants WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${like}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${like}`).catch(() => {});
});

async function user(id: string, role = "traveler") {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${id}, ${`${id}@t.test`}, ${role})`);
}

async function trip(id: string, owner: string, finalized = false) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type, finalized_at)
    VALUES (${id}, ${owner}, 'Restore', 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft', 'vacation', ${finalized ? new Date() : null})`);
}

async function item(id: string, tripId: string, day: number, sort: number, title: string, start: string, description: string) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, description, item_type, origin, start_time, routing_status)
    VALUES (${id}, ${tripId}, ${day}, ${sort}, ${title}, ${description}, 'activity', 'ai', ${start}, 'in_planning')`);
}

async function seedRich(tag: string): Promise<Fx> {
  const fx: Fx = {
    owner: kid(tag, "owner"),
    trip: kid(tag, "trip"),
    variant: kid(tag, "var"),
    keep: kid(tag, "keep"),
    dropA: kid(tag, "dropA"),
    dropB: kid(tag, "dropB"),
    locked: kid(tag, "locked"),
    booked: kid(tag, "booked"),
    booking: kid(tag, "bkg"),
    purchased: kid(tag, "purch"),
    expert: kid(tag, "expert"),
    held: kid(tag, "held"),
    day1: kid(tag, "d1"),
    day3: kid(tag, "d3"),
    cA: kid(tag, "cA"),
    cB: kid(tag, "cB"),
    cK: kid(tag, "cK"),
  };
  const cmp = kid(tag, "cmp");
  const run = kid(tag, "run");
  await user(fx.owner);
  await trip(fx.trip, fx.owner);
  await item(fx.day1, fx.trip, 1, 0, "Kiyomizu-dera", "09:00", "day-one");
  await item(fx.keep, fx.trip, 2, 1, "Ryoan-ji", "11:00", "the kept stop");
  await item(fx.dropA, fx.trip, 2, 0, "Kinkaku-ji", "09:00", "dropped gold");
  await item(fx.dropB, fx.trip, 2, 2, "Philosopher's Path", "13:00", "dropped path");
  await item(fx.locked, fx.trip, 2, 3, "Tea ceremony", "15:00", "locked");
  await item(fx.booked, fx.trip, 2, 4, "Booked walk", "16:00", "booked");
  await item(fx.purchased, fx.trip, 2, 5, "Purchased ticket", "17:00", "purchased");
  await item(fx.expert, fx.trip, 2, 6, "Expert garden", "18:00", "expert");
  await item(fx.held, fx.trip, 2, 7, "Held lunch", "19:00", "held");
  await item(fx.day3, fx.trip, 3, 0, "Fushimi Inari", "09:00", "day-three");
  await db.execute(sql`UPDATE itinerary_items SET locked_at = now() WHERE id = ${fx.locked}`);
  await db.execute(sql`INSERT INTO service_bookings (id, total_amount) VALUES (${fx.booking}, 0)`);
  await db.execute(sql`UPDATE itinerary_items SET booking_id = ${fx.booking} WHERE id = ${fx.booked}`);
  await db.execute(sql`UPDATE itinerary_items SET routing_status = 'purchased' WHERE id = ${fx.purchased}`);
  await db.execute(sql`UPDATE itinerary_items SET origin = 'expert' WHERE id = ${fx.expert}`);
  await db.execute(sql`INSERT INTO plan_option_sets (id, trip_id, itinerary_item_id, status) VALUES (${kid(tag, "set")}, ${fx.trip}, ${fx.held}, 'open')`);
  await db.execute(sql`INSERT INTO trip_item_comments (id, trip_id, item_id, author_id, body) VALUES
    (${fx.cA}, ${fx.trip}, ${fx.dropA}, ${fx.owner}, 'bring cash'),
    (${fx.cB}, ${fx.trip}, ${fx.dropB}, ${fx.owner}, 'wear shoes'),
    (${fx.cK}, ${fx.trip}, ${fx.keep}, ${fx.owner}, 'keep this note')`);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${cmp}, ${fx.owner}, ${fx.trip}, 'Restore', 'Kyoto, Japan', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order, run_id)
    VALUES (${fx.variant}, ${cmp}, 'Relaxed', 'ai_optimized', 'generated', 1, ${run})`);
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, end_time, source_item_id, latitude, longitude)
    VALUES (${kid(tag, "vk")}, ${fx.variant}, 2, 0, 'Ryoan-ji', 'activity', '09:00', '10:00', ${fx.keep}, '35.03', '135.7')`);
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, end_time, source_item_id, latitude, longitude)
    VALUES (${kid(tag, "vn")}, ${fx.variant}, 2, 1, 'Nishiki Market', 'activity', '10:30', '12:00', NULL, '35.00', '135.7')`);
  return fx;
}

async function rows(tripId: string) {
  return (await db.execute(sql`SELECT * FROM itinerary_items WHERE trip_id = ${tripId} ORDER BY id`)).rows as Array<Record<string, unknown>>;
}

async function comments(tripId: string) {
  return (await db.execute(sql`SELECT * FROM trip_item_comments WHERE trip_id = ${tripId} ORDER BY id`)).rows as Array<Record<string, unknown>>;
}

async function snapCount(tripId: string) {
  return Number(((await db.execute(sql`SELECT count(*)::int AS n FROM plan_day_restore_snapshots WHERE trip_id = ${tripId}`)).rows[0] as { n: number }).n);
}

async function snapOf(id: string) {
  return (await db.execute(sql`SELECT * FROM plan_day_restore_snapshots WHERE id = ${id}`)).rows[0] as Record<string, unknown>;
}

function exceptUpdated(list: Array<Record<string, unknown>>) {
  return list.map((r) => {
    const copy = { ...r };
    delete copy.updated_at;
    return copy;
  });
}

function byId(list: Array<Record<string, unknown>>, id: string) {
  const row = list.find((r) => r.id === id);
  assert.ok(row, id);
  return row;
}

function asArr(value: unknown): unknown[] {
  if (typeof value === "string") return JSON.parse(value) as unknown[];
  return (value ?? []) as unknown[];
}

function norm(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = norm((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

async function jsonRows(ids: string[]) {
  const res = await db.execute(sql`SELECT to_jsonb(i) AS row FROM itinerary_items i WHERE i.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return (res.rows as Array<{ row: unknown }>).map((r) => norm(r.row)).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

function handlerFor(method: string, routePath: string) {
  const layer = (versionsRoutes as any).stack.find((l: any) => l.route?.path === routePath && l.route.methods?.[method]);
  if (!layer) throw new Error(`missing ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle as (req: any, res: any) => Promise<void>;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function call(method: string, routePath: string, userId: string, body: unknown, params: Record<string, string>) {
  const res = capture();
  await handlerFor(method, routePath)({
    user: { claims: { sub: userId } },
    body: body ?? {},
    params,
    method: method.toUpperCase(),
    path: routePath,
    get: () => null,
    ip: "127.0.0.1",
  }, res);
  return res;
}

async function adopt(tag: string) {
  const fx = await seedRich(tag);
  const out = await applyDays({ tripId: fx.trip, userId: fx.owner, days: [{ day: 2, variantId: fx.variant }] });
  assert.equal(out.days.length, 1);
  assert.equal(typeof out.days[0].snapshotId, "string");
  return { fx, out, snap: out.days[0].snapshotId as string };
}

test("migration 411 is registered, declared, and additive", () => {
  assert.equal(getTableName(planDayRestoreSnapshots), "plan_day_restore_snapshots");
  assert.ok(MIGRATION_FILES.includes("411_plan_day_restore_snapshots.sql" as any));
  assert.ok(MIGRATION_FILES.indexOf("410_discovery_status_emerging.sql" as any) < MIGRATION_FILES.indexOf("411_plan_day_restore_snapshots.sql" as any));
  assert.equal(MIGRATION_FILES.some((f) => f.startsWith("412_")), false);
  const schema = readFileSync(path.join(repo, "shared/schema.ts"), "utf8");
  assert.match(schema, /plan_day_restore_snapshots_trip_day_idx/);
  assert.match(schema, /appliedAt\.desc\(\)\.nullsFirst\(\)/);
  const body = MIGRATION.replace(/--.*$/gm, "");
  assert.match(body, /CREATE TABLE IF NOT EXISTS plan_day_restore_snapshots/);
  assert.match(body, /plan_day_restore_snapshots_trip_day_idx/);
  assert.match(body, /DESC NULLS FIRST/);
  assert.doesNotMatch(body, /\bALTER\b/);
  assert.doesNotMatch(body, /\bCHECK\b/);
  const empty = dayAfterSignature([]);
  assert.equal(empty, crypto.createHash("sha256").update("").digest("hex"));
  const titled = dayAfterSignature([{ id: "a|b", dayNumber: 2, startTime: null, endTime: "", sortOrder: 0, title: "西 • pipe", updatedAt: new Date("2026-10-25T12:00:00.000Z") }]);
  const line = ["a|b", "2", "", "", "0", "西 • pipe", "2026-10-25T12:00:00.000Z"].join("|");
  assert.equal(titled, crypto.createHash("sha256").update(line).digest("hex"));
  const board = readFileSync(path.join(repo, "server/services/version-board.service.ts"), "utf8");
  const tx = board.slice(board.indexOf("return db.transaction(async (tx) => {"), board.indexOf("// ── re-time"));
  assert.match(tx, /SELECT finalized_at FROM trips/);
  assert.ok(tx.indexOf("Where you stay") < tx.indexOf("writeAppliedDaySnapshot"));
  assert.ok(tx.indexOf("writeAppliedDaySnapshot") < tx.indexOf("if (input.dryRun) throw new ApplyDaysDryRun"));
  assert.match(tx, /if \(!input\.dryRun\) \{\s*for \(const p of pending\) p\.result\.snapshotId = await writeAppliedDaySnapshot/);
  const restoreSrc = readFileSync(path.join(repo, "server/services/version-day-restore.service.ts"), "utf8");
  assert.doesNotMatch(restoreSrc, /coversAction|fee_ledger|feeLedger|plan_day_retimes|planDayRetimes|payment_intent|PaymentIntent/);
  assert.match(restoreSrc, /item-removed:replace/);
});

test("1–3 and 6: one snapshot, restore puts the day back, a second restore writes nothing, protected rows stay out", async () => {
  const fx = await seedRich("main");
  const beforeItems = await rows(fx.trip);
  const beforeComments = await comments(fx.trip);
  const beforeJson = await jsonRows([fx.keep, fx.dropA, fx.dropB]);
  const protectedIds = [fx.locked, fx.booked, fx.purchased, fx.expert, fx.held];
  const untouchedIds = [fx.day1, fx.day3, ...protectedIds];

  const out = await applyDays({ tripId: fx.trip, userId: fx.owner, days: [{ day: 2, variantId: fx.variant }] });
  assert.deepEqual(Object.keys(out.days[0]).sort(), ["added", "day", "kept", "moved", "removed", "snapshotId", "variantId"]);
  assert.equal(out.days[0].moved, 1);
  assert.equal(out.days[0].added, 1);
  assert.equal(out.days[0].removed, 2);
  assert.equal(out.days[0].kept, 0);
  const snapId = out.days[0].snapshotId!;
  assert.equal(await snapCount(fx.trip), 1);
  const snap = await snapOf(snapId);
  assert.equal(snap.trip_id, fx.trip);
  assert.equal(Number(snap.day_number), 2);
  const stored = asArr(snap.before_items).map(norm).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  assert.deepEqual(stored.map((r: any) => r.id), [fx.dropA, fx.dropB, fx.keep].sort());
  assert.deepEqual(stored, beforeJson);
  for (const id of protectedIds) assert.equal(stored.some((r: any) => r.id === id), false);
  const inserted = asArr(snap.inserted_item_ids);
  const applied = await rows(fx.trip);
  const nishiki = applied.find((r) => r.title === "Nishiki Market");
  assert.ok(nishiki);
  assert.deepEqual(inserted, [nishiki.id]);
  const storedComments = asArr(snap.before_comments).map(norm);
  assert.deepEqual(storedComments.map((c: any) => c.id).sort(), [fx.cA, fx.cB].sort());
  const secs = Number(((await db.execute(sql`SELECT EXTRACT(EPOCH FROM (expires_at - applied_at))::int AS n FROM plan_day_restore_snapshots WHERE id = ${snapId}`)).rows[0] as { n: number }).n);
  assert.equal(secs, DAY_RESTORE_RETENTION_MS / 1000);
  const signature = dayAfterSignature(await readDaySignatureRows(db, fx.trip, 2));
  assert.equal(snap.after_signature, signature);
  const listed = await listRestorableDays(fx.trip);
  assert.deepEqual(listed.days.map((d) => d.snapshotId), [snapId]);
  assert.equal(listed.days[0].state, "restorable");

  for (const id of untouchedIds) assert.deepEqual(byId(applied, id), byId(beforeItems, id));
  assert.equal(applied.some((r) => r.id === fx.dropA || r.id === fx.dropB), false);
  assert.deepEqual(byId(await comments(fx.trip), fx.cK), byId(beforeComments, fx.cK));

  const restored = await restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: snapId });
  assert.deepEqual(restored, { restored: true, alreadyRestored: false, day: 2, snapshotId: snapId });
  const back = await rows(fx.trip);
  assert.equal(back.some((r) => r.id === nishiki.id), false);
  for (const id of [fx.keep, fx.dropA, fx.dropB]) {
    assert.deepEqual(exceptUpdated([byId(back, id)]), exceptUpdated([byId(beforeItems, id)]));
    assert.equal(byId(back, id).id, id);
  }
  for (const id of untouchedIds) assert.deepEqual(byId(back, id), byId(beforeItems, id));
  const backComments = await comments(fx.trip);
  for (const id of [fx.cA, fx.cB, fx.cK]) {
    assert.equal(byId(backComments, id).body, byId(beforeComments, id).body);
    assert.equal(byId(backComments, id).item_id, byId(beforeComments, id).item_id);
  }
  assert.equal((await snapOf(snapId)).restored_by, fx.owner);

  const again = await restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: snapId });
  assert.deepEqual(again, { restored: false, alreadyRestored: true });
  assert.deepEqual(await rows(fx.trip), back);
  assert.deepEqual(await comments(fx.trip), backComments);
  const afterList = await listRestorableDays(fx.trip);
  assert.deepEqual(afterList.days, []);
});

test("4: a day edited after apply is refused and nothing is written", async () => {
  for (const kind of ["title", "time", "add", "remove"] as const) {
    const { fx, snap } = await adopt(`edit-${kind}`);
    if (kind === "title") await db.execute(sql`UPDATE itinerary_items SET title = 'Renamed garden' WHERE id = ${fx.keep}`);
    if (kind === "time") await db.execute(sql`UPDATE itinerary_items SET start_time = '08:15' WHERE id = ${fx.keep}`);
    if (kind === "add") await item(kid(`edit-${kind}`, "extra"), fx.trip, 2, 9, "Extra stop", "20:00", "added after");
    if (kind === "remove") await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${fx.keep}`);
    const items = await rows(fx.trip);
    const saved = await snapOf(snap);
    const n = await snapCount(fx.trip);
    await assert.rejects(
      restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: snap }),
      (e: unknown) => e instanceof DayRestoreError && e.status === 409 && e.code === "day_changed_since_apply",
    );
    assert.deepEqual(await rows(fx.trip), items);
    assert.deepEqual(await snapOf(snap), saved);
    assert.equal(await snapCount(fx.trip), n);
    if (kind === "title") {
      const view = await listRestorableDays(fx.trip);
      assert.equal(view.days[0].state, "changed_since");
    }
  }
});

test("5: a dry run and a preview write no snapshot; only the newer apply restores", async () => {
  const dry = await seedRich("dry");
  const dryItems = await rows(dry.trip);
  const dryOut = await applyDays({ tripId: dry.trip, userId: dry.owner, days: [{ day: 2, variantId: dry.variant }], dryRun: true });
  assert.equal(dryOut.days[0].snapshotId, null);
  assert.equal(dryOut.days[0].removed, 2);
  assert.equal(await snapCount(dry.trip), 0);
  assert.deepEqual(await rows(dry.trip), dryItems);

  const tag = "preview";
  const owner = kid(tag, "owner");
  const tripId = kid(tag, "trip");
  const cmp = kid(tag, "cmp");
  const run = kid(tag, "run");
  const base = kid(tag, "base");
  const variant = kid(tag, "var");
  const keep = kid(tag, "keep");
  const drop = kid(tag, "drop");
  await user(owner);
  await trip(tripId, owner);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, created_at, updated_at)
    VALUES (${keep}, ${tripId}, 2, 0, 'Ryoan-ji', 'activity', 'ai', '11:00', 'in_planning', '2020-01-01', '2020-01-01')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, created_at, updated_at)
    VALUES (${drop}, ${tripId}, 2, 1, 'Kinkaku-ji', 'activity', 'ai', '09:00', 'in_planning', '2020-01-01', '2020-01-01')`);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${cmp}, ${owner}, ${tripId}, 'Preview', 'Kyoto, Japan', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order, run_id, created_at)
    VALUES (${base}, ${cmp}, 'Your Plan', 'user', 'generated', 0, ${run}, '2020-06-01')`);
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, source_item_id)
    VALUES (${kid(tag, "bk")}, ${base}, 2, 0, 'Ryoan-ji', 'activity', '11:00', ${keep})`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order, run_id, created_at)
    VALUES (${variant}, ${cmp}, 'Relaxed', 'ai_optimized', 'generated', 1, ${run}, '2020-06-02')`);
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, end_time, source_item_id)
    VALUES (${kid(tag, "vk")}, ${variant}, 2, 0, 'Ryoan-ji', 'activity', '09:00', '10:00', ${keep})`);
  const previewItems = await rows(tripId);
  const preview = await applyDaysUnchangedSinceRun({ tripId, userId: owner, days: [{ day: 2, variantId: variant }], preview: true });
  assert.equal(preview.days[0].snapshotId, null);
  assert.equal(await snapCount(tripId), 0);
  assert.deepEqual(await rows(tripId), previewItems);
  const viaRoute = await call("post", "/api/trips/:tripId/versions/apply-days", owner, {
    days: [{ day: 2, variantId: variant }],
    unchangedSinceRun: true,
    preview: true,
  }, { tripId });
  assert.equal(viaRoute.statusCode, 200);
  assert.equal(viaRoute.body.days[0].snapshotId, null);
  assert.equal(await snapCount(tripId), 0);
  assert.deepEqual(await rows(tripId), previewItems);

  const { fx, snap: older } = await adopt("twice");
  const newerOut = await applyDays({ tripId: fx.trip, userId: fx.owner, days: [{ day: 2, variantId: fx.variant }] });
  const newer = newerOut.days[0].snapshotId!;
  assert.notEqual(newer, older);
  assert.ok((await snapOf(older)).superseded_at);
  assert.equal((await snapOf(newer)).superseded_at, null);
  await assert.rejects(
    restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: older }),
    (e: unknown) => e instanceof DayRestoreError && e.status === 409 && e.code === "restore_expired",
  );
  assert.equal((await snapOf(older)).restored_at, null);
  const put = await restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: newer });
  assert.equal(put.restored, true);
});

test("7: a finalized plan refuses apply and restore; an expired snapshot refuses, then the next apply purges it", async () => {
  const bareOwner = kid("bare", "owner");
  const bareTrip = kid("bare", "trip");
  await user(bareOwner);
  await trip(bareTrip, bareOwner, true);
  await assert.rejects(
    applyDays({ tripId: bareTrip, userId: bareOwner, days: [{ day: 1, variantId: "missing" }] }),
    (e: unknown) => e instanceof VersionBoardError && e.status === 409 && e.code === "plan_finalized" && e.message === "Reopen the plan first",
  );
  assert.equal(await snapCount(bareTrip), 0);
  assert.deepEqual((await listRestorableDays(bareTrip)).days, []);

  const fin = await seedRich("fin");
  const finItems = await rows(fin.trip);
  await db.execute(sql`UPDATE trips SET finalized_at = now() WHERE id = ${fin.trip}`);
  await assert.rejects(
    applyDays({ tripId: fin.trip, userId: fin.owner, days: [{ day: 2, variantId: fin.variant }] }),
    (e: unknown) => e instanceof VersionBoardError && e.status === 409 && e.code === "plan_finalized",
  );
  assert.deepEqual(await rows(fin.trip), finItems);
  assert.equal(await snapCount(fin.trip), 0);

  const { fx, snap } = await adopt("fin-restore");
  const applied = await rows(fx.trip);
  await db.execute(sql`UPDATE trips SET finalized_at = now() WHERE id = ${fx.trip}`);
  await db.execute(sql`UPDATE plan_day_restore_snapshots SET expires_at = now() - interval '1 day' WHERE id = ${snap}`);
  assert.equal((await listRestorableDays(fx.trip)).days[0].state, "finalized");
  await assert.rejects(
    restoreDay({ tripId: fx.trip, userId: fx.owner, day: 2, snapshotId: snap }),
    (e: unknown) => e instanceof DayRestoreError && e.status === 409 && e.code === "plan_finalized" && e.message === "Reopen the plan first",
  );
  assert.deepEqual(await rows(fx.trip), applied);
  assert.equal((await snapOf(snap)).restored_at, null);

  const exp = await adopt("expire");
  await db.execute(sql`UPDATE trips SET finalized_at = NULL WHERE id = ${exp.fx.trip}`);
  await db.execute(sql`UPDATE plan_day_restore_snapshots SET expires_at = now() - interval '1 day' WHERE id = ${exp.snap}`);
  assert.equal((await listRestorableDays(exp.fx.trip)).days[0].state, "expired");
  const expiredItems = await rows(exp.fx.trip);
  await assert.rejects(
    restoreDay({ tripId: exp.fx.trip, userId: exp.fx.owner, day: 2, snapshotId: exp.snap }),
    (e: unknown) => e instanceof DayRestoreError && e.status === 409 && e.code === "restore_expired",
  );
  assert.deepEqual(await rows(exp.fx.trip), expiredItems);
  assert.ok(await snapOf(exp.snap));
  await applyDays({ tripId: exp.fx.trip, userId: exp.fx.owner, days: [{ day: 2, variantId: exp.fx.variant }] });
  const left = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM plan_day_restore_snapshots WHERE id = ${exp.snap}`)).rows[0] as { n: number }).n);
  assert.equal(left, 0);
  await assert.rejects(
    restoreDay({ tripId: exp.fx.trip, userId: exp.fx.owner, day: 2, snapshotId: exp.snap }),
    (e: unknown) => e instanceof DayRestoreError && e.status === 404 && e.code === "not_found",
  );
});

test("8: the write gate and a foreign snapshot are one 404; the owner and an accepted advisor restore", async () => {
  const { fx, snap } = await adopt("auth");
  const stranger = kid("auth", "stranger");
  const pending = kid("auth", "pending");
  const accepted = kid("auth", "accepted");
  await user(stranger);
  await user(pending, "travel_expert");
  await user(accepted, "travel_expert");
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status) VALUES
    (${kid("auth", "pend-row")}, ${fx.trip}, ${pending}, 'pending'),
    (${kid("auth", "acc-row")}, ${fx.trip}, ${accepted}, 'accepted')`);

  const strangerRes = await call("post", "/api/trips/:tripId/versions/days/:day/restore", stranger, { snapshotId: snap }, { tripId: fx.trip, day: "2" });
  assert.equal(strangerRes.statusCode, 404);
  assert.deepEqual(strangerRes.body, { message: "No such plan" });
  const pendingRes = await call("post", "/api/trips/:tripId/versions/days/:day/restore", pending, { snapshotId: snap }, { tripId: fx.trip, day: "2" });
  assert.equal(pendingRes.statusCode, 404);
  assert.deepEqual(pendingRes.body, { message: "No such plan" });
  const pendingRead = await call("get", "/api/trips/:tripId/versions/restorable", pending, {}, { tripId: fx.trip });
  assert.equal(pendingRead.statusCode, 200);
  assert.equal(pendingRead.body.days[0].state, "restorable");

  const otherOwner = kid("auth", "other-owner");
  const otherTrip = kid("auth", "other-trip");
  await user(otherOwner);
  await trip(otherTrip, otherOwner);
  const wrongTrip = await call("post", "/api/trips/:tripId/versions/days/:day/restore", otherOwner, { snapshotId: snap }, { tripId: otherTrip, day: "2" });
  assert.equal(wrongTrip.statusCode, 404);
  assert.equal(wrongTrip.body.code, "not_found");
  const wrongDay = await call("post", "/api/trips/:tripId/versions/days/:day/restore", fx.owner, { snapshotId: snap }, { tripId: fx.trip, day: "1" });
  assert.equal(wrongDay.statusCode, 404);
  assert.equal(wrongDay.body.code, "not_found");
  const extra = await call("post", "/api/trips/:tripId/versions/days/:day/restore", fx.owner, { snapshotId: snap, extra: true }, { tripId: fx.trip, day: "2" });
  assert.equal(extra.statusCode, 400);
  assert.equal((await snapOf(snap)).restored_at, null);

  const ownerRes = await call("post", "/api/trips/:tripId/versions/days/:day/restore", fx.owner, { snapshotId: snap }, { tripId: fx.trip, day: "2" });
  assert.equal(ownerRes.statusCode, 200);
  assert.deepEqual(ownerRes.body, { restored: true, alreadyRestored: false, day: 2, snapshotId: snap });

  const { fx: adv, snap: advSnap } = await adopt("advisor");
  await user(kid("advisor", "expert"), "travel_expert");
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${kid("advisor", "row")}, ${adv.trip}, ${kid("advisor", "expert")}, 'accepted')`);
  const advRes = await call("post", "/api/trips/:tripId/versions/days/:day/restore", kid("advisor", "expert"), { snapshotId: advSnap }, { tripId: adv.trip, day: "2" });
  assert.equal(advRes.statusCode, 200);
  assert.equal(advRes.body.restored, true);
  assert.equal((await snapOf(advSnap)).restored_by, kid("advisor", "expert"));
});

test("9: restore writes no toll, retime, or payment row, with or without a Trip Pass, and a mid-restore failure rolls back", async () => {
  async function tolls(tripId: string, userId: string) {
    const fee = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM fee_ledger`)).rows[0] as { n: number }).n);
    const retime = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM plan_day_retimes WHERE trip_id = ${tripId}`)).rows[0] as { n: number }).n);
    const pi = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM payment_intents WHERE user_id = ${userId}`)).rows[0] as { n: number }).n);
    const ent = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM trip_entitlements WHERE trip_id = ${tripId}`)).rows[0] as { n: number }).n);
    return { fee, retime, pi, ent };
  }

  const plain = await adopt("toll");
  const plainBefore = await tolls(plain.fx.trip, plain.fx.owner);
  await restoreDay({ tripId: plain.fx.trip, userId: plain.fx.owner, day: 2, snapshotId: plain.snap });
  assert.deepEqual(await tolls(plain.fx.trip, plain.fx.owner), plainBefore);

  const passed = await adopt("pass");
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${kid("pass", "ent")}, ${passed.fx.trip}, 'trip_pass', 'active', 'manual')`);
  const passBefore = await tolls(passed.fx.trip, passed.fx.owner);
  assert.equal(passBefore.ent, 1);
  await restoreDay({ tripId: passed.fx.trip, userId: passed.fx.owner, day: 2, snapshotId: passed.snap });
  assert.deepEqual(await tolls(passed.fx.trip, passed.fx.owner), passBefore);

  const poisoned = await adopt("poison");
  const poisonId = kid("poison", "ghost");
  await db.execute(sql`
    UPDATE plan_day_restore_snapshots
    SET before_items = before_items || CAST(${JSON.stringify([{ id: poisonId, trip_id: poisoned.fx.trip, day_number: 2, title: null }])} AS jsonb)
    WHERE id = ${poisoned.snap}
  `);
  const items = await rows(poisoned.fx.trip);
  const saved = await snapOf(poisoned.snap);
  await assert.rejects(restoreDay({ tripId: poisoned.fx.trip, userId: poisoned.fx.owner, day: 2, snapshotId: poisoned.snap }));
  assert.deepEqual(await rows(poisoned.fx.trip), items);
  assert.equal((await snapOf(poisoned.snap)).restored_at, null);
  assert.equal((await snapOf(poisoned.snap)).restored_by, saved.restored_by ?? null);
});
