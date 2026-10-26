/**
 * SH-1 item 12 (ledger `2026-10-19-sh1-test-flag`): a test account (`users.is_test` OR an email on the
 * QA_ACCOUNT_EMAIL_DOMAIN setting) is left out of every public reader and never routed. One unique city,
 * three listing owners: a flagged account on a normal email, an unflagged account on the QA domain, and an
 * ordinary provider.
 *
 *   TA1  search, /api/services, /api/provider-services and the destination page leave out both test owners'
 *        approved, active listings; the ordinary listing stays
 *   TA2  the owner still reads their own listing (owner console, by id)
 *   TA3  flag off + QA-domain email ⇒ test account (pure and SQL)
 *   TA4  flag on + normal email ⇒ test account; flag NULL + normal email ⇒ not
 *   TA5  routableUserIds (hence loadCandidates), the /experts directory, the expert profile by id, the expert
 *        and provider storefronts, the provider directory and the plan's advisor list all drop test accounts
 *   TA6  SHOW_DEMO_EXPERTS=1 never lets a test account through
 *   TA7  only an admin flips the flag; the body is strict; the change is audit-logged
 *   TA8  the generic user writers (and so PATCH /api/profile) never set the flag
 *   TA9  migration 397 applied twice is a no-op
 *   TA10 a sign-up on the QA domain is born flagged; any other is born NULL
 *   QV1  qa-verify T1–T4: role + active over the test accounts, no fixed addresses
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix, deleted afterwards; env restored.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[test-account-exclusion] REFUSING to write fixtures to '${host}'.`);
}

const RUN = crypto.randomUUID().slice(0, 8);
const QA_DOMAIN = `qa-${RUN}.test`;
const priorDomain = process.env.QA_ACCOUNT_EMAIL_DOMAIN;
const priorDemo = process.env.SHOW_DEMO_EXPERTS;
process.env.QA_ACCOUNT_EMAIL_DOMAIN = QA_DOMAIN;
delete process.env.SHOW_DEMO_EXPERTS;

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { storage } = await import("../storage");
const { locationViewService } = await import("../services/location-view.service");
const { isTestAccount, testAccountSql, withoutTestOwnerListings } = await import("../services/test-account");
const { routableUserIds, directoryExperts, isPublicExpertProfileId, isRoutableExpert } = await import("../services/expert-routability");
const { listTripExpertAdvisors } = await import("../services/booking-actions.service");
const { authStorage } = await import("../replit_integrations/auth/storage");
const { qaTestAccountReport } = await import("../services/qa-verify.service");
const storefrontModule = await import("../routes/storefront.routes");
const adminRouter = (await import("../routes/admin.routes")).default;

const id = (k: string) => `tacct-${RUN}-${k}`;
const CITY = `Testtown${RUN}`;
const handle = (k: string) => `ta${RUN}${k}`.slice(0, 30);

// flagged: is_test = true, normal email · qa: QA-domain email, flag NULL · ok: ordinary provider · exp: ordinary expert
const OWNERS = [
  { k: "flagged", role: "service_provider", email: `${id("flagged")}@normal.invalid`, isTest: true },
  { k: "qa", role: "service_provider", email: `${id("qa")}@${QA_DOMAIN}`, isTest: null },
  { k: "ok", role: "service_provider", email: `${id("ok")}@normal.invalid`, isTest: null },
  { k: "xflag", role: "local_expert", email: `${id("xflag")}@normal.invalid`, isTest: true },
  { k: "xqa", role: "local_expert", email: `${id("xqa")}@${QA_DOMAIN}`, isTest: null },
  { k: "xok", role: "local_expert", email: `${id("xok")}@normal.invalid`, isTest: null },
  { k: "admin", role: "admin", email: `${id("admin")}@normal.invalid`, isTest: null },
  { k: "traveler", role: "user", email: `${id("traveler")}@normal.invalid`, isTest: null },
] as const;

before(async () => {
  for (const o of OWNERS) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, handle, is_test)
      VALUES (${id(o.k)}, ${o.email}, 'TA', ${o.k}, ${o.role}, ${handle(o.k)}, ${o.isTest})
    `);
  }
  for (const k of ["xflag", "xqa", "xok"]) {
    await db.execute(sql`
      INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, specialties,
                                      identity_verification_status, stripe_connect_status)
      VALUES (${id(`${k}-form`)}, ${id(k)}, 'TA', 'Fixture', ${`${id(k)}@form.invalid`}, 'approved', ${JSON.stringify([CITY])}::jsonb, '[]'::jsonb, 'verified', 'complete')
    `);
  }
  for (const k of ["flagged", "qa", "ok", "xflag", "xqa", "xok"]) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city)
      VALUES (${id(`${k}-svc`)}, ${id(k)}, ${`Fixture ${k} ${RUN}`}, 'fixture', '35.00', 'active', 'approved', 'in_person', ${CITY})
    `);
  }
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${id("trip")}, ${id("traveler")}, 'TA trip', ${CITY}, '2027-05-01', '2027-05-03')
  `);
  for (const k of ["xflag", "xqa", "xok"]) {
    await db.execute(sql`
      INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
      VALUES (${id(`${k}-adv`)}, ${id("trip")}, ${id(k)}, 'accepted')
    `);
  }
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM access_audit_logs WHERE target_user_id LIKE ${`tacct-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${id("trip")}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${id("trip")}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`tacct-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`tacct-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`tacct-${RUN}-%`}`).catch(() => {});
  } finally {
    if (priorDomain === undefined) delete process.env.QA_ACCOUNT_EMAIL_DOMAIN;
    else process.env.QA_ACCOUNT_EMAIL_DOMAIN = priorDomain;
    if (priorDemo === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = priorDemo;
    await pool.end();
  }
});

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);
const PUBLIC_OK = [id("ok-svc"), id("xok-svc")].sort();
const TEST_SVCS = [id("flagged-svc"), id("qa-svc"), id("xflag-svc"), id("xqa-svc")];

function handlerFor(router: any, method: "get" | "patch", routePath: string) {
  const layer = router.stack.find((l: any) => l.route?.path === routePath && l.route?.methods?.[method]);
  assert.ok(layer, `${method.toUpperCase()} ${routePath} is registered`);
  return layer.route.stack.at(-1).handle;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test("TA1 public listing readers leave out test owners' listings", async () => {
  const search = await storage.unifiedSearch({ location: CITY, limit: 50 });
  assert.deepEqual(ids(search.services).sort(), PUBLIC_OK, "search");
  assert.equal(search.total, 2);

  assert.deepEqual(ids(await storage.getAllActiveServices(undefined, CITY)).sort(), PUBLIC_OK, "/api/services");

  const view = await locationViewService.getLocationView(CITY, null);
  assert.equal(view.services.error, null);
  const got = ids(view.services.data ?? []);
  for (const t of TEST_SVCS) assert.equal(got.includes(t), false, `destination page leaves out ${t}`);
  for (const ok of PUBLIC_OK) assert.ok(got.includes(ok), `destination page keeps ${ok}`);

  const rows = [...TEST_SVCS, ...PUBLIC_OK].map((svc) => ({ id: svc, userId: svc.replace(/-svc$/, "") }));
  assert.deepEqual(ids(await withoutTestOwnerListings(rows, (r) => r.userId)).sort(), PUBLIC_OK, "/api/provider-services filter");
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
  const start = src.indexOf('app.get("/api/provider-services"');
  assert.match(src.slice(start, start + 3500), /withoutTestOwnerListings\(/, "the public browse route applies the exclusion");
});

test("TA2 the owner still reads their own listing", async () => {
  const mine = await storage.getProviderServicesByStatus(id("flagged"));
  assert.ok(ids(mine as any).includes(id("flagged-svc")), "owner console");
  const byId = await storage.getProviderServiceById(id("qa-svc"));
  assert.equal(byId?.id, id("qa-svc"), "by id");
});

test("TA3 flag off + QA-domain email is a test account", async () => {
  assert.equal(isTestAccount({ isTest: null, email: `a@${QA_DOMAIN}` }), true);
  assert.equal(isTestAccount({ isTest: false, email: `A@${QA_DOMAIN.toUpperCase()}` }), true);
  assert.equal(isTestAccount({ isTest: null, email: `a@sub.${QA_DOMAIN}` }), false, "exact domain only");
  const r = await db.execute(sql`SELECT ${testAccountSql(sql`is_test`, sql`email`)} AS t FROM users WHERE id = ${id("qa")}`);
  assert.equal((r.rows[0] as any).t, true);
});

test("TA4 flag on + normal email is a test account; NULL flag + normal email is not", async () => {
  assert.equal(isTestAccount({ isTest: true, email: "a@normal.invalid" }), true);
  assert.equal(isTestAccount({ isTest: null, email: "a@normal.invalid" }), false);
  const r = await db.execute(sql`
    SELECT id, ${testAccountSql(sql`is_test`, sql`email`)} AS t FROM users WHERE id IN (${id("flagged")}, ${id("ok")})
  `);
  const t = Object.fromEntries((r.rows as any[]).map((row) => [row.id, row.t]));
  assert.equal(t[id("flagged")], true);
  assert.equal(t[id("ok")], false);
  // No second domain: with the setting unset, only the flag counts.
  assert.equal(isTestAccount({ isTest: null, email: `a@${QA_DOMAIN}` }, null), false);
});

test("TA5 expert selectors, storefronts, the provider directory and the advisor list drop test accounts", async () => {
  const routable = await routableUserIds([id("xflag"), id("xqa"), id("xok")]);
  assert.deepEqual([...routable], [id("xok")], "routableUserIds (loadCandidates reads it)");

  const listed = await directoryExperts([{ id: id("xflag") }, { id: id("xqa") }, { id: id("xok") }]);
  assert.deepEqual(listed.map((e) => e.id), [id("xok")], "/experts directory");

  assert.equal(await isPublicExpertProfileId(id("xflag")), false, "expert profile by id");
  assert.equal(await isPublicExpertProfileId(id("xqa")), false);
  assert.equal(await isPublicExpertProfileId(id("xok")), true);

  assert.equal(await storefrontModule.loadStorefront(handle("flagged")), null, "provider storefront");
  assert.equal(await storefrontModule.loadStorefront(handle("xqa")), null, "expert storefront");
  assert.notEqual(await storefrontModule.loadStorefront(handle("ok")), null, "an ordinary storefront stays");

  const dir = capture();
  await handlerFor(storefrontModule.default, "get", "/api/provider-storefronts")({} as any, dir as any);
  const handles = JSON.stringify(dir.body);
  assert.equal(handles.includes(handle("flagged")), false, "provider directory");
  assert.equal(handles.includes(handle("qa")), false);
  assert.ok(handles.includes(handle("ok")), "an ordinary provider stays in the directory");

  const advisors = await listTripExpertAdvisors(id("trip"));
  const advisorIds = advisors.map((a: any) => String(a.local_expert_id ?? a.localExpertId ?? a.user_id ?? ""));
  assert.equal(advisors.length, 1, `the plan shows only the ordinary advisor: ${JSON.stringify(advisorIds)}`);
});

test("TA6 SHOW_DEMO_EXPERTS=1 never lets a test account through", async () => {
  process.env.SHOW_DEMO_EXPERTS = "1";
  try {
    const routable = await routableUserIds([id("xflag"), id("xqa"), id("xok")]);
    assert.deepEqual([...routable], [id("xok")]);
    const base = { applicationStatus: "approved", identityVerificationStatus: "verified", stripeConnectStatus: "complete" };
    assert.equal(isRoutableExpert({ ...base, email: "a@normal.invalid", isTest: true }), false);
    assert.equal(isRoutableExpert({ ...base, email: `a@${QA_DOMAIN}` }), false);
    assert.equal(isRoutableExpert({ ...base, email: "a@normal.invalid" }), true);
  } finally {
    delete process.env.SHOW_DEMO_EXPERTS;
  }
});

test("TA7 only an admin flips the flag, the body is strict, and the change is audit-logged", async () => {
  const handler = handlerFor(adminRouter, "patch", "/api/admin/users/:id/test-flag");
  const call = async (sub: string, body: unknown) => {
    const res = capture();
    await handler({ params: { id: id("ok") }, body, user: { claims: { sub } } } as any, res as any);
    return res;
  };
  assert.equal((await call(id("traveler"), { isTest: true })).statusCode, 403, "a non-admin is refused");
  assert.equal((await call(id("admin"), { isTest: true, role: "admin" })).statusCode, 400, "an unknown key is refused");
  assert.equal((await call(id("admin"), { isTest: "yes" })).statusCode, 400, "a non-boolean is refused");
  const unchanged = await db.execute(sql`SELECT is_test FROM users WHERE id = ${id("ok")}`);
  assert.equal((unchanged.rows[0] as any).is_test, null);

  const on = await call(id("admin"), { isTest: true });
  assert.equal(on.statusCode, 200);
  assert.deepEqual(on.body, { id: id("ok"), isTest: true });
  const flagged = await db.execute(sql`SELECT is_test FROM users WHERE id = ${id("ok")}`);
  assert.equal((flagged.rows[0] as any).is_test, true);
  assert.deepEqual(ids(await storage.getAllActiveServices(undefined, CITY)), [id("xok-svc")], "the listing leaves the public reader");

  const audit = await db.execute(sql`
    SELECT action, metadata FROM access_audit_logs WHERE target_user_id = ${id("ok")} AND action = 'update_test_flag'
  `);
  assert.equal(audit.rows.length, 1);
  assert.deepEqual((audit.rows[0] as any).metadata, { field: "is_test", previous: null, next: true });

  assert.equal((await call(id("admin"), { isTest: false })).statusCode, 200);
  const unknown = capture();
  await handler({ params: { id: id("nobody") }, body: { isTest: true }, user: { claims: { sub: id("admin") } } } as any, unknown as any);
  assert.equal(unknown.statusCode, 404);
});

test("TA8 the generic user writers never set the flag", async () => {
  await authStorage.updateUser(id("traveler"), { firstName: "Renamed", isTest: true } as any);
  const r = await db.execute(sql`SELECT first_name, is_test FROM users WHERE id = ${id("traveler")}`);
  assert.equal((r.rows[0] as any).first_name, "Renamed", "the rest of the update applies");
  assert.equal((r.rows[0] as any).is_test, null, "the flag is stripped");
  const routesSrc = fs.readFileSync(path.join(process.cwd(), "server/replit_integrations/auth/routes.ts"), "utf8");
  const schema = routesSrc.slice(routesSrc.indexOf("const updateProfileSchema"), routesSrc.indexOf("});", routesSrc.indexOf("const updateProfileSchema")));
  assert.equal(/isTest|is_test/.test(schema), false, "PATCH /api/profile's allowlist never names the flag");
});

test("TA9 migration 397 applied twice is a no-op", async () => {
  const file = fs.readFileSync(path.join(process.cwd(), "server/migrations/397_users_is_test.sql"), "utf8");
  await db.execute(sql.raw(file));
  await db.execute(sql.raw(file));
  const col = await db.execute(sql`
    SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_test'
  `);
  assert.equal(col.rows.length, 1);
  assert.deepEqual(col.rows[0], { data_type: "boolean", is_nullable: "YES", column_default: null });
  const registry = fs.readFileSync(path.join(process.cwd(), "server/migrations/migration-files.ts"), "utf8");
  assert.ok(registry.includes('"397_users_is_test.sql"'), "registered");
});

test("TA10 a QA-domain sign-up is born flagged; any other is born NULL", async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/replit_integrations/auth/emailAuth.ts"), "utf8");
  assert.match(src, /isTest: isTestAccount\(\{ email \}\) \? true : null/);
  assert.equal(isTestAccount({ email: `new@${QA_DOMAIN}` }) ? true : null, true);
  assert.equal(isTestAccount({ email: "new@normal.invalid" }) ? true : null, null);
});

test("QV1 qa-verify T1–T4 read role + active over the test accounts, with no fixed addresses", () => {
  const all = [
    { role: "user" }, { role: "local_expert" }, { role: "service_provider" }, { role: "admin" }, { role: "executive_assistant" },
  ];
  const full = qaTestAccountReport(all);
  for (const t of ["T1", "T2", "T3", "T4"] as const) assert.equal(full[t].pass, true, `${t}: ${full[t].detail}`);

  const noExpert = qaTestAccountReport(all.map((r) => (r.role === "local_expert" ? { ...r, is_suspended: true } : r)));
  assert.equal(noExpert.T1.pass, false);
  assert.match(noExpert.T1.detail, /expert/);
  assert.equal(noExpert.T2.pass, false, "a suspended expert is not active");

  const deletedTraveler = qaTestAccountReport(all.map((r) => (r.role === "user" ? { ...r, is_deleted: true } : r)));
  assert.equal(deletedTraveler.T4.pass, false, "a deleted traveler is not active");

  for (const f of ["server/services/qa-verify.service.ts", "client/src/pages/admin/qa-checklist.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.equal(src.includes("traveloure-test.com"), false, `${f} names no second domain`);
  }
});
