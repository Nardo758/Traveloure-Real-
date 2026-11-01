/**
 * CN-1a / CN-1b server: concierge listing type, per-trip price, task kinds, reply hours.
 * CN-1h: duplicate and from-template run that same admission before the row exists.
 *
 * Run: npx tsx --test server/__tests__/cn1-concierge-listing.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CN1_COPY, conciergePerTripPrice, conciergeResponseHoursLine } from "@shared/cn1-copy";
import { isConciergeLinkOnly } from "@shared/concierge-tasks";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";
import type { RegisteredActor } from "./fixtures/registered-actor";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BASE = "http://127.0.0.1:5000";
const MIGRATION = path.join(ROOT, "server/migrations/426_cn1_concierge_task_kinds.sql");

const BANNED = [
  /paypal/i,
  /traveler fee/i,
  /\bcrowd\b/i,
  /trending/i,
  /\bfounding\b/i,
  /\bbest\b/i,
  /\btop\b/i,
  /ultimate/i,
  /premier/i,
  /world-class/i,
  /#1/,
  /most popular/i,
  /approved by/i,
  /\b48\b/,
];

test("CN-1 listing copy matches the brief sentences, with no fee or crowd claim", () => {
  assert.equal(CN1_COPY.filter, "Local concierge");
  assert.equal(CN1_COPY.profileSection, "Local concierge for your trip");
  assert.equal(CN1_COPY.listingTypeConcierge, "Concierge: I help during the trip");
  assert.equal(CN1_COPY.listingTypePlanning, "Trip planning: I build the plan");
  assert.equal(CN1_COPY.hireAuthNote, "Your card is authorized now, but you're only charged once {name} accepts.");
  assert.equal(CN1_COPY.hireReleased, "{name} couldn't take this trip, so the hold on your card has been released.");
  assert.equal(
    CN1_COPY.hireCancelRule,
    "You can cancel for a full release until {name} completes a task. After that, we review cancellations case by case.",
  );
  assert.equal(conciergePerTripPrice("180.00"), "180.00 per trip");
  assert.equal(conciergeResponseHoursLine(8), "Aims to reply within 8 hours.");
  for (const value of Object.values(CN1_COPY)) {
    for (const banned of BANNED) assert.doesNotMatch(value, banned, value);
  }
});

test("stays and transport are link-only; meals and the two former offering kinds are not", () => {
  assert.equal(isConciergeLinkOnly({ id: "stays", domain: "stays" }), true);
  assert.equal(isConciergeLinkOnly({ id: "transport", domain: "transport" }), true);
  assert.equal(isConciergeLinkOnly({ id: "stays", domain: "meals" }), true);
  assert.equal(isConciergeLinkOnly({ id: "hotel_night", domain: "stays" }), true);
  assert.equal(isConciergeLinkOnly({ id: "meals", domain: "meals" }), false);
  assert.equal(isConciergeLinkOnly({ id: "reservation_lifeline", domain: "meals" }), false);
  assert.equal(isConciergeLinkOnly({ id: "done_for_you_booking", domain: "experiences" }), false);
});

test("migration 426 does not rewrite listings or offering types", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  assert.doesNotMatch(sql, /UPDATE\s+provider_services/i);
  assert.doesNotMatch(sql, /UPDATE\s+expert_offering_types/i);
  assert.doesNotMatch(sql, /approved by/i);
  assert.match(sql, /reservation_lifeline/);
  assert.match(sql, /done_for_you_booking/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
});

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = `cn1-${Date.now().toString(36)}`;
const actors: RegisteredActor[] = [];
const serviceIds: string[] = [];
const templateIds: string[] = [];
let extraKind: string | null = null;

async function actor(role: string, label: string): Promise<RegisteredActor> {
  const signed = await registerAndSignIn({
    baseUrl: BASE,
    email: `${tag}-${label}@t.test`,
    password: "TestPass123!",
    firstName: label,
    lastName: "Cn1",
    extra: { ...SUPPLY_PROVIDER_SIGNUP_EXTRA },
  });
  let visible = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = await pool.query(`SELECT id FROM users WHERE id = $1`, [signed.id]);
    if (found.rows.length > 0) {
      visible = true;
      break;
    }
  }
  assert.equal(visible, true, `user ${signed.id} was not visible`);
  const updated = await pool.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, signed.id]);
  assert.equal(updated.rowCount, 1);
  return { id: signed.id, email: signed.email, cookie: signed.cookie };
}

async function api(cookie: string | undefined, method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

before(async () => {
  const health = await fetch(`${BASE}/api/health`);
  assert.equal(health.status, 200, "dev server must be running on :5000");
  const sqlText = fs.readFileSync(MIGRATION, "utf8");
  await pool.query(sqlText);
});

after(async () => {
  if (serviceIds.length) {
    await pool.query(`DELETE FROM content_registry WHERE content_id = ANY($1::varchar[])`, [serviceIds]);
    await pool.query(`DELETE FROM provider_services WHERE id = ANY($1::varchar[])`, [serviceIds]);
  }
  if (templateIds.length) {
    await pool.query(`DELETE FROM service_templates WHERE id = ANY($1::varchar[])`, [templateIds]);
  }
  if (extraKind) await pool.query(`DELETE FROM concierge_task_kinds WHERE id = $1`, [extraKind]);
  const userIds = actors.map((actor) => actor.id);
  if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [userIds]);
  await pool.end();
});

test("public task list shows Local concierge and the seeded kinds", async () => {
  const res = await api(undefined, "GET", "/api/concierge-task-kinds");
  assert.equal(res.status, 200);
  assert.equal(res.json.filterLabel, "Local concierge");
  assert.equal(res.json.sectionLabel, "Local concierge for your trip");
  assert.equal(res.json.pricePerTrip, "{price} per trip");
  assert.equal(res.json.linkOnly, CN1_COPY.taskLinkOnly);
  const byId = new Map((res.json.kinds as Array<{ id: string; linkOnly: boolean; domain: string }>).map((kind) => [kind.id, kind]));
  assert.equal(byId.get("reservation_lifeline")?.linkOnly, false);
  assert.equal(byId.get("reservation_lifeline")?.domain, "meals");
  assert.equal(byId.get("done_for_you_booking")?.linkOnly, false);
  assert.equal(byId.get("stays")?.linkOnly, true);
  assert.equal(byId.get("transport")?.linkOnly, true);
  for (const banned of BANNED) {
    assert.doesNotMatch(JSON.stringify(res.json), banned);
  }
});

test("local expert saves a concierge listing; a provider cannot; planning stays planning", async () => {
  const expert = await actor("local_expert", "expert");
  const provider = await actor("service_provider", "provider");
  actors.push(expert, provider);

  const offering = await pool.query(
    `SELECT service_tier FROM expert_offering_types WHERE offering_type_key = 'reservation_lifeline'`,
  );
  assert.equal(offering.rows[0]?.service_tier, "coordination");
  const live = await pool.query(
    `SELECT service_tier FROM expert_offering_types WHERE offering_type_key = 'text_a_local'`,
  );
  assert.equal(live.rows[0]?.service_tier, "live_support");

  const refused = await api(provider.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} concierge refused`,
    serviceType: "concierge",
    saveIntent: "draft",
    pricingUnit: "per_trip",
    price: "90.00",
  });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.code, "CONCIERGE_EXPERT_REQUIRED");

  const planning = await api(expert.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} planning`,
    saveIntent: "draft",
    price: "40.00",
  });
  assert.equal(planning.status, 201, JSON.stringify(planning.json));
  serviceIds.push(planning.json.id);
  const planningRow = await pool.query(`SELECT service_type FROM provider_services WHERE id = $1`, [planning.json.id]);
  assert.equal(planningRow.rows[0].service_type, "planning");
  assert.equal(planning.json.conciergeTasks, undefined);

  const perTripOnPlanning = await api(expert.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} per trip on planning`,
    saveIntent: "draft",
    pricingUnit: "per_trip",
    price: "50.00",
  });
  assert.equal(perTripOnPlanning.status, 400);
  assert.equal(perTripOnPlanning.json.code, "PRICE_UNIT_PER_TRIP");

  const created = await api(expert.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} concierge`,
    serviceType: "concierge",
    saveIntent: "draft",
    price: "180.00",
    pricingUnit: "per_trip",
    responseWindowHours: 8,
    deliveryLanguages: ["English", "Japanese"],
    expertOfferingTypeKey: "text_a_local",
    conciergeTasks: [
      { taskKindKey: "meals", cap: 2 },
      { taskKindKey: "reservation_lifeline" },
      { taskKindKey: "stays" },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  serviceIds.push(created.json.id);
  assert.equal(created.json.serviceType, "concierge");
  assert.equal(created.json.pricingUnit, "per_trip");
  assert.equal(created.json.conciergePriceLabel, "180.00 per trip");
  assert.equal(created.json.conciergeResponseHoursLabel, "Aims to reply within 8 hours.");
  assert.equal(created.json.expertOfferingTypeKey, "text_a_local");
  assert.deepEqual(created.json.deliveryLanguages, ["English", "Japanese"]);
  const stays = (created.json.conciergeTasks as Array<{ taskKindKey: string; linkOnly: boolean; cap: number | null }>)
    .find((task) => task.taskKindKey === "stays");
  const meals = (created.json.conciergeTasks as Array<{ taskKindKey: string; cap: number | null; linkOnly: boolean }>)
    .find((task) => task.taskKindKey === "meals");
  assert.equal(stays?.linkOnly, true);
  assert.equal(stays?.cap, null);
  assert.equal(meals?.cap, 2);
  assert.equal(meals?.linkOnly, false);

  const row = await pool.query(
    `SELECT service_type, pricing_unit, response_window_hours, expert_offering_type_key, delivery_languages
       FROM provider_services WHERE id = $1`,
    [created.json.id],
  );
  assert.equal(row.rows[0].service_type, "concierge");
  assert.equal(row.rows[0].pricing_unit, "per_trip");
  assert.equal(row.rows[0].response_window_hours, 8);
  assert.equal(row.rows[0].expert_offering_type_key, "text_a_local");

  const shown = await api(expert.cookie, "GET", `/api/provider/services/${created.json.id}`);
  assert.equal(shown.status, 200);
  assert.equal(shown.json.pricingUnit, "per_trip");
  assert.equal(shown.json.conciergePriceLabel, "180.00 per trip");
  assert.equal(shown.json.responseWindowHours, 8);
  assert.equal(shown.json.conciergeTasks.length, 3);

  const untouched = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    shortDescription: "Hours unchanged",
  });
  assert.equal(untouched.status, 200, JSON.stringify(untouched.json));
  const afterOmit = await pool.query(`SELECT service_type, pricing_unit FROM provider_services WHERE id = $1`, [created.json.id]);
  assert.equal(afterOmit.rows[0].service_type, "concierge");
  assert.equal(afterOmit.rows[0].pricing_unit, "per_trip");

  const sameType = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    serviceType: "concierge",
  });
  assert.equal(sameType.status, 200, JSON.stringify(sameType.json));
  const afterSame = await pool.query(`SELECT service_type FROM provider_services WHERE id = $1`, [created.json.id]);
  assert.equal(afterSame.rows[0].service_type, "concierge");

  const unknown = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    conciergeTasks: [{ taskKindKey: "yacht" }],
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.code, "TASK_NOT_ON_LIST");
  const stillThree = await pool.query(
    `SELECT count(*)::int AS n FROM provider_service_concierge_tasks WHERE service_id = $1`,
    [created.json.id],
  );
  assert.equal(stillThree.rows[0].n, 3);

  const badCap = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    conciergeTasks: [{ taskKindKey: "meals", cap: 0 }],
  });
  assert.equal(badCap.status, 400);
  assert.equal(badCap.json.code, "TASK_CAP");

  const bookableStay = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    conciergeTasks: [{ taskKindKey: "stays", bookable: true }],
  });
  assert.equal(bookableStay.status, 400);
  assert.equal(bookableStay.json.code, "LINK_ONLY_TASK");

  const bookableTransport = await api(expert.cookie, "PATCH", `/api/provider/services/${created.json.id}`, {
    conciergeTasks: [{ taskKindKey: "transport", bookable: true, cap: 1 }],
  });
  assert.equal(bookableTransport.status, 400);
  assert.equal(bookableTransport.json.code, "LINK_ONLY_TASK");

  const legacy = await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, service_type, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, 'planning', '10.00', 'draft', 'draft', 'pdf') RETURNING service_type`,
    [`${tag}-legacy`, expert.id, `${tag} legacy`],
  );
  serviceIds.push(`${tag}-legacy`);
  assert.equal(legacy.rows[0].service_type, "planning");
  await pool.query(fs.readFileSync(MIGRATION, "utf8"));
  const legacyAfter = await pool.query(`SELECT service_type FROM provider_services WHERE id = $1`, [`${tag}-legacy`]);
  assert.equal(legacyAfter.rows[0].service_type, "planning");
});

test("admin manages the task list; a stay cannot be bookable; an inactive kind is refused", async () => {
  const admin = await actor("admin", "admin");
  const expert = await actor("local_expert", "expert2");
  actors.push(admin, expert);

  const denied = await api(expert.cookie, "POST", "/api/admin/concierge-task-kinds", {
    taskKey: `${tag.replace(/[^a-z0-9]/g, "")}_nope`,
    label: "Nope",
    domain: "errands",
  });
  assert.equal(denied.status, 403);

  const bookableStayKind = await api(admin.cookie, "POST", "/api/admin/concierge-task-kinds", {
    taskKey: "hotel_night_cn1",
    label: "Hotel night",
    domain: "stays",
    bookable: true,
  });
  assert.equal(bookableStayKind.status, 400);
  assert.equal(bookableStayKind.json.code, "LINK_ONLY_TASK");

  extraKind = "cn1_extra_errand";
  const createdKind = await api(admin.cookie, "POST", "/api/admin/concierge-task-kinds", {
    taskKey: extraKind,
    label: "Extra errand",
    domain: "errands",
  });
  assert.equal(createdKind.status, 201, JSON.stringify(createdKind.json));
  assert.equal(createdKind.json.kind.linkOnly, false);

  const listing = await api(expert.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} extra errand`,
    serviceType: "concierge",
    saveIntent: "draft",
    price: "70.00",
    pricingUnit: "per_trip",
    conciergeTasks: [{ taskKindKey: extraKind, cap: 1 }],
  });
  assert.equal(listing.status, 201, JSON.stringify(listing.json));
  serviceIds.push(listing.json.id);

  const hidden = await api(admin.cookie, "PATCH", `/api/admin/concierge-task-kinds/${extraKind}`, { active: false });
  assert.equal(hidden.status, 200);
  const again = await api(expert.cookie, "PATCH", `/api/provider/services/${listing.json.id}`, {
    conciergeTasks: [{ taskKindKey: extraKind, cap: 1 }],
  });
  assert.equal(again.status, 400);
  assert.equal(again.json.code, "TASK_NOT_ON_LIST");

  const tasksOnPlanning = await api(expert.cookie, "POST", "/api/provider/services", {
    serviceName: `${tag} tasks on planning`,
    saveIntent: "draft",
    conciergeTasks: [{ taskKindKey: "meals" }],
  });
  assert.equal(tasksOnPlanning.status, 400);
  assert.equal(tasksOnPlanning.json.code, "TASKS_NEED_CONCIERGE");
});

const DUPLICATE_PATHS = [
  (id: string) => `/api/provider/services/${id}/duplicate`,
  (id: string) => `/api/expert/services/${id}/duplicate`,
];

async function serviceCount(userId: string): Promise<number> {
  const found = await pool.query(`SELECT count(*)::int AS n FROM provider_services WHERE user_id = $1`, [userId]);
  return found.rows[0].n;
}

async function insertListing(opts: {
  userId: string;
  label: string;
  serviceType: string;
  pricingUnit?: string | null;
  cap?: number | null;
  taskKind?: string | null;
}): Promise<string> {
  const id = `${tag}-${opts.label}`;
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, service_type, price, pricing_unit, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, $4, '90.00', $5, 'draft', 'submitted', 'pdf')`,
    [id, opts.userId, `${tag} ${opts.label}`, opts.serviceType, opts.pricingUnit ?? null],
  );
  serviceIds.push(id);
  if (opts.taskKind) {
    await pool.query(
      `INSERT INTO provider_service_concierge_tasks (id, service_id, task_kind_id, cap) VALUES ($1, $2, $3, $4)`,
      [`${id}-task`, id, opts.taskKind, opts.cap ?? null],
    );
  }
  return id;
}

async function insertTemplate(serviceType: string): Promise<string> {
  const id = `${tag}-tpl-${serviceType}`;
  await pool.query(
    `INSERT INTO service_templates (id, title, service_type, suggested_price, delivery_method, is_active)
     VALUES ($1, $2, $3, '80.00', 'pdf', true)`,
    [id, `${tag} ${serviceType} template`, serviceType],
  );
  templateIds.push(id);
  return id;
}

test("CN-1h: concierge duplicate is admitted before the copy; a planning duplicate is unchanged", async () => {
  const expert = await actor("local_expert", "dup-expert");
  const provider = await actor("service_provider", "dup-provider");
  const admin = await actor("admin", "dup-admin");
  actors.push(expert, provider, admin);

  const providerListing = await insertListing({
    userId: provider.id,
    label: "dup-provider-concierge",
    serviceType: "concierge",
    pricingUnit: "per_trip",
    taskKind: "meals",
    cap: 2,
  });
  const beforeProvider = await serviceCount(provider.id);
  const providerRefused = await api(provider.cookie, "POST", `/api/provider/services/${providerListing}/duplicate`);
  assert.equal(providerRefused.status, 403, JSON.stringify(providerRefused.json));
  assert.equal(providerRefused.json.code, "CONCIERGE_EXPERT_REQUIRED");
  assert.equal(providerRefused.json.message, "A concierge listing is saved by an expert account.");
  assert.equal(await serviceCount(provider.id), beforeProvider);

  // /api/expert/services is expert-or-admin. Admin is not an expert account, so the admission still refuses.
  const adminListing = await insertListing({
    userId: admin.id,
    label: "dup-admin-concierge",
    serviceType: "concierge",
    pricingUnit: "per_trip",
    taskKind: "meals",
    cap: 2,
  });
  const beforeAdmin = await serviceCount(admin.id);
  const adminRefused = await api(admin.cookie, "POST", `/api/expert/services/${adminListing}/duplicate`);
  assert.equal(adminRefused.status, 403, JSON.stringify(adminRefused.json));
  assert.equal(adminRefused.json.code, "CONCIERGE_EXPERT_REQUIRED");
  assert.equal(adminRefused.json.message, "A concierge listing is saved by an expert account.");
  assert.equal(await serviceCount(admin.id), beforeAdmin);

  const invalid = await insertListing({
    userId: expert.id,
    label: "dup-invalid",
    serviceType: "concierge",
    pricingUnit: "per_trip",
    taskKind: "meals",
    cap: 0,
  });
  const beforeInvalid = await serviceCount(expert.id);
  for (const pathOf of DUPLICATE_PATHS) {
    const refused = await api(expert.cookie, "POST", pathOf(invalid));
    assert.equal(refused.status, 400, JSON.stringify(refused.json));
    assert.equal(refused.json.code, "TASK_CAP");
    assert.equal(refused.json.message, "A task cap is a positive whole number, or empty.");
  }
  assert.equal(await serviceCount(expert.id), beforeInvalid);

  const valid = await insertListing({
    userId: expert.id,
    label: "dup-valid",
    serviceType: "concierge",
    pricingUnit: "per_trip",
    taskKind: "meals",
    cap: 2,
  });
  for (const pathOf of DUPLICATE_PATHS) {
    const created = await api(expert.cookie, "POST", pathOf(valid));
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.notEqual(created.json.id, valid);
    serviceIds.push(created.json.id);
    assert.equal(created.json.serviceType, "concierge");
    assert.equal(created.json.pricingUnit, "per_trip");
    assert.equal(created.json.status, "draft");
    assert.equal(created.json.approvalStatus, "submitted");
    assert.match(created.json.serviceName, /\(Copy\)$/);
    const tasks = await pool.query(
      `SELECT task_kind_id, cap FROM provider_service_concierge_tasks WHERE service_id = $1`,
      [created.json.id],
    );
    assert.equal(tasks.rows.length, 1);
    assert.equal(tasks.rows[0].task_kind_id, "meals");
    assert.equal(tasks.rows[0].cap, 2);
  }

  const planning = await insertListing({
    userId: expert.id,
    label: "dup-planning",
    serviceType: "planning",
  });
  for (const pathOf of DUPLICATE_PATHS) {
    const created = await api(expert.cookie, "POST", pathOf(planning));
    assert.equal(created.status, 201, JSON.stringify(created.json));
    serviceIds.push(created.json.id);
    assert.equal(created.json.serviceType, "planning");
    assert.equal(created.json.status, "draft");
    assert.equal(created.json.approvalStatus, "submitted");
    assert.equal(created.json.pricingUnit, null);
    const tasks = await pool.query(
      `SELECT count(*)::int AS n FROM provider_service_concierge_tasks WHERE service_id = $1`,
      [created.json.id],
    );
    assert.equal(tasks.rows[0].n, 0);
  }
});

test("CN-1h: from-template is admitted before insert; a planning template is unchanged", async () => {
  const expert = await actor("local_expert", "tpl-expert");
  const admin = await actor("admin", "tpl-admin");
  actors.push(expert, admin);
  const conciergeTemplate = await insertTemplate("concierge");
  const planningTemplate = await insertTemplate("planning");
  const validBody = { pricingUnit: "per_trip", conciergeTasks: [{ taskKindKey: "meals", cap: 2 }] };

  // The template route sits on /api/expert, so a provider never reaches it. Admin does, and is not an expert account.
  const beforeAdmin = await serviceCount(admin.id);
  const refused = await api(admin.cookie, "POST", `/api/expert/services/from-template/${conciergeTemplate}`, validBody);
  assert.equal(refused.status, 403, JSON.stringify(refused.json));
  assert.equal(refused.json.code, "CONCIERGE_EXPERT_REQUIRED");
  assert.equal(refused.json.message, "A concierge listing is saved by an expert account.");
  assert.equal(await serviceCount(admin.id), beforeAdmin);

  const beforeInvalid = await serviceCount(expert.id);
  const invalid = await api(expert.cookie, "POST", `/api/expert/services/from-template/${conciergeTemplate}`, {
    pricingUnit: "per_trip",
    conciergeTasks: [{ taskKindKey: "meals", cap: 0 }],
  });
  assert.equal(invalid.status, 400, JSON.stringify(invalid.json));
  assert.equal(invalid.json.code, "TASK_CAP");
  assert.equal(invalid.json.message, "A task cap is a positive whole number, or empty.");
  assert.equal(await serviceCount(expert.id), beforeInvalid);

  const created = await api(expert.cookie, "POST", `/api/expert/services/from-template/${conciergeTemplate}`, validBody);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  serviceIds.push(created.json.id);
  assert.equal(created.json.serviceType, "concierge");
  assert.equal(created.json.status, "draft");
  assert.equal(created.json.createdVia, "template");
  // The template insert still does not take a price unit from the body. The admission only lets a per-trip unit through.
  assert.equal(created.json.pricingUnit, null);
  const tasks = await pool.query(
    `SELECT task_kind_id, cap FROM provider_service_concierge_tasks WHERE service_id = $1`,
    [created.json.id],
  );
  assert.equal(tasks.rows.length, 1);
  assert.equal(tasks.rows[0].task_kind_id, "meals");
  assert.equal(tasks.rows[0].cap, 2);

  const planning = await api(expert.cookie, "POST", `/api/expert/services/from-template/${planningTemplate}`, {
    pricingUnit: "per_trip",
    conciergeTasks: [{ taskKindKey: "yacht" }],
  });
  assert.equal(planning.status, 201, JSON.stringify(planning.json));
  serviceIds.push(planning.json.id);
  assert.equal(planning.json.serviceType, "planning");
  assert.equal(planning.json.pricingUnit, null);
  assert.equal(planning.json.createdVia, "template");
  const planningTasks = await pool.query(
    `SELECT count(*)::int AS n FROM provider_service_concierge_tasks WHERE service_id = $1`,
    [planning.json.id],
  );
  assert.equal(planningTasks.rows[0].n, 0);
});
