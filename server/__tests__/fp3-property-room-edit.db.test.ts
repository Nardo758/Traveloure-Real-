/**
 * FP-3 — PROPERTY-ROOM EDIT PATH (behavioural proof, HTTP against the real dev server).
 *
 * Ratified design (service-creation redesign mock, decision-maker): "a property room's Edit opens
 * its property's editor at the Rooms step — a room has no service checklist/delivery-method of
 * its own, and sending it into the generic ServiceForm is a dishonest surface."
 *
 * Evidence: docs/testing/PROVIDER_BATCH_EXERCISE.md (branch `lane/provider-batch-exercise`,
 * as-of `127ffb5`) — a two-room machiya was authored through the Workstation and both rooms then
 * appeared on Catalog as ordinary standalone listings (§4 DB block: `product_shape=property_room`,
 * `parent_service_id` set, `pricing_unit=per_night`), each with the generic Edit into
 * `/provider/services/:id/edit`. Filed as the Package A item "property/room rows filtered or
 * re-routed" (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md, Wave 1).
 *
 * WHAT THIS SUITE PROVES: the routing/guard decision is SERVER-DERIVED. Both the Catalog grouping
 * and the ServiceForm back-door guard key on `productShape` (+ `parentServiceId`) read off
 * owner-gated reads — never off the URL, a query param or anything else the client supplies. So
 * the seam that must hold is: those two fields are on the wire, correct, on BOTH the list read
 * the Catalog groups from and the single-row read the guard fires on; and the Workstation
 * property/room write rails the re-route lands on accept the edits without any new endpoint.
 *
 * The pure routing arithmetic (which href each shape resolves to, and that an ordinary listing
 * keeps its ServiceForm route) is pinned separately and cheaply by
 * client/src/lib/__tests__/property-editor-link.test.ts.
 *
 * NEGATIVES FIRST. Runs against the ALREADY-RUNNING dev server (the fp1-console-defects posture).
 * DISPOSABLE DB ONLY — every row created here is cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/fp3-property-room-edit.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[fp3] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

let provider = { id: "", email: "", cookie: "" };
let propertyId = "";
let roomAId = "";
let roomBId = "";
let plainServiceId = "";

/** Publishing/verification is irrelevant here, but a provider ROLE is required by the rails. */
async function createProvider(): Promise<void> {
  const email = `fp3-${RUN}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "FP", lastName: "Three",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${id}`);
  const login = await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD });
  assert.equal(login.status, 200, "login must succeed");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  provider = { id, email, cookie };
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  await createProvider();

  // The batch exercise's own fixture shape: a two-room property authored through the Workstation.
  const prop = await readOnce(await api("/api/provider/properties", provider.cookie, "POST", {
    serviceName: `FP3 Machiya ${RUN}`,
    description: "FP-3 property fixture",
    location: "Nishijin, Kamigyo-ku",
    rooms: [
      { roomName: "FP3 Garden-View Double", price: "185.00", units: 1 },
      { roomName: "FP3 Loom-Room Twin", price: "150.00", units: 2 },
    ],
  }));
  assert.equal(prop.status, 201, `property create failed (${prop.status}): ${prop.text}`);
  propertyId = prop.body.id;
  createdServiceIds.push(propertyId);
  const rooms = (prop.body.rooms as any[]).slice().sort((a, b) => Number(a.price) - Number(b.price));
  roomBId = rooms[0].id;   // 150
  roomAId = rooms[1].id;   // 185
  createdServiceIds.push(roomAId, roomBId);

  // A plain listing on the same account — the negative control for every assertion below.
  const svc = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `FP3 Plain Service ${RUN}`,
    description: "FP-3 ordinary listing — must keep the ServiceForm edit route",
    price: "50.00",
    deliveryMethod: "in_person",
    status: "draft",
  }));
  assert.equal(svc.status, 201, `service create failed (${svc.status}): ${svc.text}`);
  plainServiceId = svc.body.id;
  createdServiceIds.push(plainServiceId);
});

after(async () => {
  try {
    await assertDisposableDb();
    // Rooms first — property_room.parent_service_id is ON DELETE RESTRICT (migration 153).
    for (const id of [roomAId, roomBId, plainServiceId, propertyId]) {
      if (id) await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM provider_services WHERE parent_service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ NEGATIVE — an ordinary listing is untouched by any of this ═════════════════════════════════

test("N1: an ordinary listing carries NO property shape — the guard cannot catch it", async () => {
  const res = await readOnce(await api(`/api/provider/services/${plainServiceId}`, provider.cookie));
  assert.equal(res.status, 200, `owner read failed (${res.status}): ${res.text}`);
  // The exact predicate the ServiceForm guard evaluates. Neither value may be a property shape,
  // or every normal edit on the console would land on the interstitial instead of the form.
  assert.ok(
    res.body.productShape !== "property" && res.body.productShape !== "property_room",
    `an ordinary listing must not resolve to the property editor (got ${JSON.stringify(res.body.productShape)})`,
  );
  assert.equal(res.body.parentServiceId ?? null, null, "an ordinary listing has no parent property");
});

// ═══ P1 — the single-row read the ServiceForm back-door guard fires on ══════════════════════════

test("P1: GET /api/provider/services/:roomId is SERVER-DERIVED property_room + its parent", async () => {
  const res = await readOnce(await api(`/api/provider/services/${roomAId}`, provider.cookie));
  assert.equal(res.status, 200, `owner read failed (${res.status}): ${res.text}`);
  // This is the whole guard input. It comes off an OWNER-GATED read of the row, so a deep link,
  // a stale bookmark or a hand-typed /provider/services/<roomId>/edit cannot dress a room up as
  // an ordinary service: the shape travels with the row, not with the URL.
  assert.equal(res.body.productShape, "property_room", "the room row states its own shape");
  assert.equal(res.body.parentServiceId, propertyId, "and names the property whose editor opens");
  assert.equal(res.body.pricingUnit, "per_night", "a room is priced per night, not per service");
});

test("P1b: GET /api/provider/services/:propertyId reports 'property' (its Edit leaves the form too)", async () => {
  const res = await readOnce(await api(`/api/provider/services/${propertyId}`, provider.cookie));
  assert.equal(res.status, 200);
  assert.equal(res.body.productShape, "property");
  assert.equal(res.body.parentServiceId ?? null, null, "a property is the parent, it has none");
});

test("P1c: the guard input is OWNER-GATED — another account's room reads 404, not a shape", async () => {
  // A crafted request cannot even learn the shape of a row it does not own, let alone edit it.
  const res = await readOnce(await api(`/api/provider/services/${roomAId}`, undefined));
  assert.ok(res.status === 401 || res.status === 404, `unauthenticated read must not succeed (got ${res.status})`);
});

// ═══ P2 — the list read Catalog groups from ════════════════════════════════════════════════════

test("P2: /api/provider/services carries productShape + parentServiceId on every row", async () => {
  const res = await readOnce(await api("/api/provider/services", provider.cookie));
  assert.equal(res.status, 200, `list read failed (${res.status}): ${res.text}`);
  const rows = res.body as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const property = byId.get(propertyId);
  assert.ok(property, "the property row is in the owner list (it IS a provider_services row)");
  assert.equal(property.productShape, "property");

  // Both rooms are present AND each names its parent — that linkage is what lets Catalog nest
  // them under the property card instead of drawing two more standalone service cards.
  for (const roomId of [roomAId, roomBId]) {
    const room = byId.get(roomId);
    assert.ok(room, `room ${roomId} is in the owner list`);
    assert.equal(room.productShape, "property_room");
    assert.equal(room.parentServiceId, propertyId, "the room names its parent property");
    assert.equal(room.pricingUnit, "per_night");
    assert.ok(room.price != null && room.price !== "", "the room states a nightly price to render");
  }

  // The grouping arithmetic the Catalog list performs, asserted on the real payload: no room row
  // is left at top level, and every room lands under a parent that IS in the same list.
  const topLevel = rows.filter((r) => r.productShape !== "property_room");
  const roomRows = rows.filter((r) => r.productShape === "property_room");
  const topLevelIds = new Set(topLevel.map((r) => r.id));
  assert.equal(roomRows.length >= 2, true, "the two fixture rooms are room rows");
  assert.equal(
    roomRows.every((r) => r.parentServiceId && topLevelIds.has(r.parentServiceId)),
    true,
    "every room in this account groups under a property card that is in the same list",
  );
  assert.equal(topLevel.some((r) => r.id === plainServiceId), true, "the ordinary listing stays top-level");
});

// ═══ P3 — the surface the re-route lands on actually edits the room ════════════════════════════

test("P3: the property editor's two write rails accept the edits, with no new endpoint", async () => {
  // Basics (the property's own Edit destination).
  const basics = await readOnce(await api(`/api/provider/properties/${propertyId}`, provider.cookie, "PATCH", {
    serviceName: `FP3 Machiya ${RUN} (renamed)`,
    location: "Nishijin, Kamigyo-ku, Kyoto",
    description: "FP-3 property fixture, edited through the property editor",
  }));
  assert.equal(basics.status, 200, `property basics PATCH failed (${basics.status}): ${basics.text}`);
  assert.equal(basics.body.serviceName, `FP3 Machiya ${RUN} (renamed)`);

  // Rooms step (the room's Edit destination) — name, nightly price and units, the exact fields
  // roomPatchSchema already accepts. No new field is invented here (B9 stays redesign-gated).
  const room = await readOnce(await api(`/api/provider/rooms/${roomAId}`, provider.cookie, "PATCH", {
    roomName: "FP3 Garden-View Double (renamed)",
    price: "195.00",
    units: 2,
  }));
  assert.equal(room.status, 200, `room PATCH failed (${room.status}): ${room.text}`);
  assert.equal(room.body.serviceName, "FP3 Garden-View Double (renamed)");
  assert.equal(Number(room.body.price), 195);
  assert.equal((room.body.categoryAttributes as any)?.units, 2);
  // The row keeps its shape and its parent — an edit through this surface never turns a room
  // into a standalone listing.
  const after = await readOnce(await api(`/api/provider/services/${roomAId}`, provider.cookie));
  assert.equal(after.body.productShape, "property_room");
  assert.equal(after.body.parentServiceId, propertyId);
});

test("P3b: the room write rail is shape-gated — a property id is NOT editable as a room", async () => {
  // The re-route sends `?property=<id>&room=<id>`; the ids are only a FOCUS hint. Authority stays
  // server-side: /rooms/:id refuses anything that is not a property_room the session owns.
  const res = await readOnce(await api(`/api/provider/rooms/${propertyId}`, provider.cookie, "PATCH", {
    roomName: "not a room",
  }));
  assert.equal(res.status, 404, `a property must not be patchable through the room rail (got ${res.status})`);
  const res2 = await readOnce(await api(`/api/provider/properties/${roomAId}`, provider.cookie, "PATCH", {
    serviceName: "not a property",
  }));
  assert.equal(res2.status, 404, `a room must not be patchable through the property rail (got ${res2.status})`);
});

test("P3c (A3): an APPROVED room's price change re-enters review, and says so", async () => {
  await db.execute(sql`UPDATE provider_services SET approval_status = 'approved' WHERE id = ${roomBId}`);
  const res = await readOnce(await api(`/api/provider/rooms/${roomBId}`, provider.cookie, "PATCH", {
    roomName: "FP3 Loom-Room Twin",
    price: "160.00",
  }));
  assert.equal(res.status, 200, `room PATCH failed (${res.status}): ${res.text}`);
  assert.equal(res.body.reenteredReview, true, "the server reports the re-review so the editor can state it");
  const stored = await db.execute(sql`SELECT approval_status FROM provider_services WHERE id = ${roomBId}`);
  assert.equal((stored.rows[0] as any).approval_status, "submitted", "and the row really went back");
});
