/**
 * S-17: a pending account's listing stays off every public reader, even when the row
 * itself is forced approved and active. An earner with no form, an account with no
 * application, and an account with an approved application stay public. A rejected
 * application with no approval stays off. The write gate allows a draft and refuses publish.
 * An admin session uses that same gate. Staff role is not an earner, so an admin
 * cannot create or publish for an unapproved supply account.
 *
 * DISPOSABLE DB ONLY.
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
  throw new Error(`[pending-supply-public] REFUSING to write fixtures to '${host}'.`);
}

const RUN = crypto.randomUUID().slice(0, 8);
const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { storage } = await import("../storage");
const { locationViewService } = await import("../services/location-view.service");
const { listingOwnerIsPublic, withoutUnapprovedOwnerListings } = await import("../services/public-listing-owner");
const { readSupplyAccount, refuseUnapprovedListingWrite } = await import("../services/pending-supply-account");

const id = (k: string) => `psup-${RUN}-${k}`;
const CITY = `Psup${RUN}`;
const handle = (k: string) => `ps${RUN}${k}`.slice(0, 30);

before(async () => {
  const users = [
    ["pexpert", "user"],
    ["pprovider", "user"],
    ["approved", "user"],
    ["legacy", "service_provider"],
    ["earner", "local_expert"],
    ["both", "user"],
    ["plain", "user"],
    ["rejected", "user"],
    ["admpend", "admin"],
    ["admappr", "admin"],
    ["admnone", "admin"],
  ] as const;
  for (const [k, role] of users) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role, handle, is_test)
      VALUES (${id(k)}, ${`${id(k)}@normal.invalid`}, 'PS', ${k}, ${role}, ${handle(k)}, FALSE)
    `);
  }
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, identity_verification_status)
    VALUES (${id("pexpert-form")}, ${id("pexpert")}, 'PS', 'Pending', ${`${id("pexpert")}@form.invalid`}, 'pending', '[]'::jsonb, 'pending')
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, identity_verification_status)
    VALUES (${id("admpend-form")}, ${id("admpend")}, 'PS', 'AdminPending', ${`${id("admpend")}@form.invalid`}, 'pending', '[]'::jsonb, 'pending')
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, bio, identity_verification_status)
    VALUES (${id("admappr-form")}, ${id("admappr")}, 'PS', 'AdminApproved', ${`${id("admappr")}@form.invalid`}, 'approved', ${JSON.stringify([CITY])}::jsonb, 'A bio', 'verified')
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, bio, identity_verification_status)
    VALUES (${id("approved-form")}, ${id("approved")}, 'PS', 'Approved', ${`${id("approved")}@form.invalid`}, 'approved', ${JSON.stringify([CITY])}::jsonb, 'A bio', 'verified')
  `);
  await db.execute(sql`
    INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, description, status)
    VALUES (${id("pprovider-form")}, ${id("pprovider")}, 'Pending Co', 'PS Pending', ${`${id("pprovider")}@form.invalid`}, '555', 'Japan', '1 Road', 'tour', 'Walks', 'pending')
  `);
  await db.execute(sql`
    INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
    VALUES (${id("both-old")}, ${id("both")}, 'Old Co', 'PS Old', ${`${id("both")}@old.invalid`}, '555', 'Japan', '1 Road', 'tour', 'rejected')
  `);
  await db.execute(sql`
    INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
    VALUES (${id("both-new")}, ${id("both")}, 'New Co', 'PS New', ${`${id("both")}@new.invalid`}, '555', 'Japan', '1 Road', 'tour', 'approved')
  `);
  await db.execute(sql`
    INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
    VALUES (${id("rejected-form")}, ${id("rejected")}, 'No Co', 'PS No', ${`${id("rejected")}@form.invalid`}, '555', 'Japan', '1 Road', 'tour', 'rejected')
  `);
  for (const k of ["pexpert", "pprovider", "approved", "legacy", "earner", "both", "plain", "rejected"]) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city)
      VALUES (${id(`${k}-svc`)}, ${id(k)}, ${`Fixture ${k} ${RUN}`}, 'fixture', '40.00', 'active', 'approved', 'in_person', ${CITY})
    `);
  }
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`psup-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id LIKE ${`psup-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`psup-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`psup-${RUN}-%`}`);
  } finally {
    await pool.end();
  }
});

const PUBLIC = [id("approved-svc"), id("legacy-svc"), id("earner-svc"), id("both-svc"), id("plain-svc")].sort();
const HIDDEN = [id("pexpert-svc"), id("pprovider-svc"), id("rejected-svc")];

test("public readers leave out pending owners even when the listing is approved and active", async () => {
  const search = await storage.unifiedSearch({ location: CITY, limit: 50 });
  assert.deepEqual(search.services.map((s) => s.id).sort(), PUBLIC, "search");

  assert.deepEqual((await storage.getAllActiveServices(undefined, CITY)).map((s) => s.id).sort(), PUBLIC, "browse");

  for (const hidden of HIDDEN) {
    assert.deepEqual(await storage.getApprovedServicesForExpert(hidden.replace(/-svc$/, "")), [], hidden);
  }
  const approvedRows = await storage.getApprovedServicesForExpert(id("approved"));
  assert.deepEqual(approvedRows.map((s: { id: string }) => s.id), [id("approved-svc")]);

  const view = await locationViewService.getLocationView(CITY, null);
  assert.equal(view.services.error, null);
  const got = (view.services.data ?? []).map((s: { id: string }) => s.id);
  for (const hidden of HIDDEN) assert.equal(got.includes(hidden), false, hidden);
  for (const ok of PUBLIC) assert.ok(got.includes(ok), ok);

  assert.equal(await listingOwnerIsPublic(id("pexpert")), false);
  assert.equal(await listingOwnerIsPublic(id("pprovider")), false);
  assert.equal(await listingOwnerIsPublic(id("approved")), true);
  assert.equal(await listingOwnerIsPublic(id("legacy")), true);
  assert.equal(await listingOwnerIsPublic(id("both")), true);
  assert.equal(await listingOwnerIsPublic(id("plain")), true);
  assert.equal(await listingOwnerIsPublic(id("rejected")), false);

  const rows = [...HIDDEN, ...PUBLIC].map((svc) => ({ id: svc, userId: svc.replace(/-svc$/, "") }));
  assert.deepEqual(
    (await withoutUnapprovedOwnerListings(rows, (r) => r.userId)).map((r) => r.id).sort(),
    PUBLIC,
  );
});

test("a pending account can save a draft and cannot submit or publish", async () => {
  assert.equal(
    await refuseUnapprovedListingWrite(id("pexpert"), { draft: true, enteringReview: false, statusActive: false }),
    null,
  );
  const submit = await refuseUnapprovedListingWrite(id("pexpert"), { draft: false, enteringReview: true, statusActive: false });
  assert.equal(submit?.status, 403);
  assert.equal(submit?.body.code, "APPLICATION_UNDER_REVIEW");
  const active = await refuseUnapprovedListingWrite(id("pprovider"), { draft: false, enteringReview: false, statusActive: true });
  assert.equal(active?.status, 403);

  const approvedNotEarner = await refuseUnapprovedListingWrite(id("both"), { draft: false, enteringReview: true, statusActive: false });
  assert.equal(approvedNotEarner?.status, 403);
  assert.match(approvedNotEarner?.body.message ?? "", /activated/);
  const draftOk = await refuseUnapprovedListingWrite(id("both"), { draft: true, enteringReview: false, statusActive: false });
  assert.equal(draftOk, null);

  assert.equal(
    await refuseUnapprovedListingWrite(id("earner"), { draft: false, enteringReview: true, statusActive: true }),
    null,
  );
  assert.equal(
    await refuseUnapprovedListingWrite(id("legacy"), { draft: false, enteringReview: false, statusActive: true }),
    null,
  );
});

test("an admin session cannot create or publish for an unapproved supply account", async () => {
  const pending = await readSupplyAccount(id("admpend"));
  assert.equal(pending.publishesFreely, false);
  assert.equal(pending.canSaveDraftListing, true);
  assert.equal(
    await refuseUnapprovedListingWrite(id("admpend"), { draft: true, enteringReview: false, statusActive: false }),
    null,
  );
  const pendingSubmit = await refuseUnapprovedListingWrite(id("admpend"), { draft: false, enteringReview: true, statusActive: false });
  assert.equal(pendingSubmit?.status, 403);
  assert.equal(pendingSubmit?.body.code, "APPLICATION_UNDER_REVIEW");
  const pendingActive = await refuseUnapprovedListingWrite(id("admpend"), { draft: false, enteringReview: false, statusActive: true });
  assert.equal(pendingActive?.status, 403);
  assert.equal(pendingActive?.body.code, "APPLICATION_UNDER_REVIEW");

  const approved = await readSupplyAccount(id("admappr"));
  assert.equal(approved.publishesFreely, false);
  assert.equal(approved.phase, "approved");
  assert.equal(approved.canSaveDraftListing, true);
  assert.equal(
    await refuseUnapprovedListingWrite(id("admappr"), { draft: true, enteringReview: false, statusActive: false }),
    null,
  );
  const approvedPublish = await refuseUnapprovedListingWrite(id("admappr"), { draft: false, enteringReview: true, statusActive: true });
  assert.equal(approvedPublish?.status, 403);
  assert.match(approvedPublish?.body.message ?? "", /activated/);

  const none = await readSupplyAccount(id("admnone"));
  assert.equal(none.publishesFreely, false);
  assert.equal(none.canSaveDraftListing, false);
  const noneDraft = await refuseUnapprovedListingWrite(id("admnone"), { draft: true, enteringReview: false, statusActive: false });
  assert.equal(noneDraft?.status, 403);
  assert.equal(noneDraft?.body.code, "APPLICATION_REQUIRED");
  const noneActive = await refuseUnapprovedListingWrite(id("admnone"), { draft: false, enteringReview: false, statusActive: true });
  assert.equal(noneActive?.status, 403);
  assert.equal(noneActive?.body.code, "APPLICATION_REQUIRED");

  // The public read still keeps an admin owner. The write gate does not.
  assert.equal(await listingOwnerIsPublic(id("admpend")), true);
  assert.equal(await listingOwnerIsPublic(id("admappr")), true);
  assert.equal(await listingOwnerIsPublic(id("admnone")), true);
});

test("public readers and the write rails call the one owner predicate", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const routes = read("server/routes.ts");
  const writeCalls = routes.split("refuseUnapprovedListingWrite(").length - 1;
  assert.equal(writeCalls, 4, "create, patch, provider submit, expert submit");
  assert.ok(routes.includes("refuseUnapprovedListingWrite"));
  const gate = read("server/services/pending-supply-account.ts");
  assert.match(gate, /const publishesFreely = isEarnerRole\(role\)/);
  assert.equal(gate.includes('role === "admin" || isEarnerRole'), false);
  const draftPage = read("client/src/pages/dashboard-listing.tsx");
  assert.equal(/isEarnerRole\(role\) \|\| role === "admin"/.test(draftPage), false);
  assert.ok(routes.includes("withoutUnapprovedOwnerListings"));
  assert.ok(routes.includes("buildExpertApplicationTimeline"));
  assert.ok(routes.includes("buildProviderApplicationTimeline"));
  const storageSrc = read("server/storage.ts");
  const storageHits = storageSrc.split("publicListingOwnerSql").length - 1;
  assert.ok(storageHits >= 3, `storage uses the owner predicate ${storageHits} times`);
  assert.ok(read("server/routes/content.routes.ts").includes("listingOwnerIsPublic"));
  assert.ok(read("server/services/location-view.service.ts").includes("publicListingOwnerSql"));
  assert.ok(read("server/routes/storefront.routes.ts").includes("publicListingOwnerSql"));
  assert.ok(read("server/middleware/role-rbac.ts").includes("readSupplyAccount"));
});
