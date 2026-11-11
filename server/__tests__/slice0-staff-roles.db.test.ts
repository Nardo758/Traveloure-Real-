/**
 * Slice 0 (Addendum A v2) — staff roles and bot actors against a disposable database (migration 444).
 *
 *   SR1 the two seeded settings read as seeded: provider sign-off `all_staff`, bot audit retention 90 days
 *   SR2 who waits for the owner, under each sign-off value (pure); the owner never waits on itself
 *   SR3 the market predicate (pure + live): "all" for owner/platform_admin, the live grants for a scoped role,
 *       nothing for anyone else; a revoked grant is gone; an unresolved market is in no scope
 *   SR4 a listing's market: its location, else its owner's provider-form city, else nothing (never guessed)
 *   SR5 the staff stamp is ONE atomic conditional: a second stamp, and a stamp on a decided row, do nothing; an
 *       identity edit before the owner's sign-off clears it, a safe edit keeps it; the stamp is never body-settable
 *   SR6 the owner sign-off queue lists stamped rows that still wait, and nothing the owner already decided
 *   SR7 bot audit: one row per call with its scope and status, filterable by bot; prune removes only rows older than
 *       the retention, and only bot rows
 *   SR8 bot keys: an unknown scope is refused, `queue:read` is a scope; the Ops Bot projection drops the detail
 *   SR9 the issue queue reads nothing for an empty scope
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { users } from "@shared/models/auth";
import { botAccounts, botAuditLogs, platformSettingsTable, providerServices, serviceProviderForms, staffMarketAssignments } from "@shared/schema";
import { BOT_SCOPES } from "@shared/bot-proposals";
import { storage } from "../storage";
import { actorMarketScope, marketForListing, scopeCovers, staffMayActOn } from "../services/staff-scope";
import {
  approvalWaitsForOwner,
  clearListingStaffApproval,
  listOwnerSignoffQueue,
  readProviderSignoffSetting,
  stampListingStaffApproval,
  stampProviderFormStaffApproval,
} from "../services/staff-signoff.service";
import { botAuditActionFor, listBotAudit, pruneBotAudit, readBotAuditRetentionDays, recordBotAudit } from "../services/bot-audit.service";
import { createBotAccount, setBotScopes } from "../services/bot-proposals.service";
import { botQueueProjection, listIssueQueue } from "../services/issue-queue.service";

const userIds: string[] = [];
const botIds: string[] = [];
const id = () => crypto.randomUUID();

async function makeUser(role: string): Promise<string> {
  const uid = id();
  await db.insert(users).values({ id: uid, email: `sr-${uid}@example.invalid`, firstName: "SR", lastName: role, role } as any);
  userIds.push(uid);
  return uid;
}

async function makeListing(ownerId: string, location: string | null, approvalStatus = "submitted"): Promise<string> {
  const sid = id();
  await db.insert(providerServices).values({ id: sid, userId: ownerId, serviceName: `SR ${sid.slice(0, 6)}`, location, approvalStatus, price: "40.00" } as any);
  return sid;
}

async function makeProviderForm(ownerId: string, city: string | null): Promise<string> {
  const fid = id();
  await db.insert(serviceProviderForms).values({
    id: fid, userId: ownerId, businessName: "SR Co", name: "SR", email: `sr-form-${fid}@example.invalid`, mobile: "0",
    country: "Japan", address: "1 Street", businessType: "tour", city, status: "pending",
  } as any);
  return fid;
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
});

after(async () => {
  try {
    if (botIds.length) await db.delete(botAccounts).where(inArray(botAccounts.id, botIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  } finally {
    await pool.end();
  }
});

test("SR1 the seeded settings read as seeded", async () => {
  const rows = await db.select().from(platformSettingsTable).where(inArray(platformSettingsTable.settingKey, ["provider_signoff_required_for", "bot_audit_retention_days"]));
  const byKey = Object.fromEntries(rows.map((r) => [r.settingKey, r.settingValue]));
  assert.equal(byKey.provider_signoff_required_for, "all_staff");
  assert.equal(byKey.bot_audit_retention_days, "90");
  assert.equal(await readProviderSignoffSetting(), "all_staff");
  assert.equal(await readBotAuditRetentionDays(), 90);
});

test("SR2 who waits for the owner", () => {
  for (const setting of ["all_staff", "regional_only", "none"] as const) assert.equal(approvalWaitsForOwner("owner", setting), false, setting);
  for (const role of ["platform_admin", "admin", "regional_manager"]) assert.equal(approvalWaitsForOwner(role, "all_staff"), true, role);
  assert.equal(approvalWaitsForOwner("regional_manager", "regional_only"), true);
  assert.equal(approvalWaitsForOwner("platform_admin", "regional_only"), false);
  for (const role of ["platform_admin", "regional_manager"]) assert.equal(approvalWaitsForOwner(role, "none"), false, role);
});

test("SR3 the market predicate", async () => {
  assert.equal(scopeCovers("all", null), true);
  assert.equal(scopeCovers([], "kyoto"), false);
  assert.equal(scopeCovers(["kyoto"], "kyoto"), true);
  assert.equal(scopeCovers(["kyoto"], "goa"), false);
  assert.equal(scopeCovers(["kyoto"], null), false, "an unresolved market is in no scope");

  const owner = await makeUser("owner");
  const pa = await makeUser("platform_admin");
  const rm = await makeUser("regional_manager");
  const support = await makeUser("support");
  assert.equal(await actorMarketScope({ id: owner, role: "owner" }), "all");
  assert.equal(await actorMarketScope({ id: pa, role: "platform_admin" }), "all");
  assert.deepEqual(await actorMarketScope({ id: rm, role: "regional_manager" }), []);
  assert.deepEqual(await actorMarketScope({ id: support, role: "support" }), []);

  await db.insert(staffMarketAssignments).values({ id: id(), userId: rm, marketSlug: "kyoto", grantedBy: owner } as any);
  assert.deepEqual(await actorMarketScope({ id: rm, role: "regional_manager" }), ["kyoto"]);
  assert.equal(await staffMayActOn({ id: rm, role: "regional_manager" }, "kyoto"), true);
  assert.equal(await staffMayActOn({ id: rm, role: "regional_manager" }, "goa"), false);

  // The partial UNIQUE refuses a second live grant of the same market; a revoked one can be granted again.
  await assert.rejects(db.insert(staffMarketAssignments).values({ id: id(), userId: rm, marketSlug: "kyoto", grantedBy: owner } as any));
  await db.update(staffMarketAssignments).set({ revokedAt: new Date(), revokedBy: owner } as any).where(eq(staffMarketAssignments.userId, rm));
  assert.deepEqual(await actorMarketScope({ id: rm, role: "regional_manager" }), []);
  await db.insert(staffMarketAssignments).values({ id: id(), userId: rm, marketSlug: "kyoto", grantedBy: owner } as any);
  assert.deepEqual(await actorMarketScope({ id: rm, role: "regional_manager" }), ["kyoto"]);
});

test("SR4 a listing's market", async () => {
  const provider = await makeUser("service_provider");
  assert.equal(await marketForListing(await makeListing(provider, "Kyoto, Japan")), "kyoto");
  const noLocation = await makeListing(provider, null);
  assert.equal(await marketForListing(noLocation), null, "no location and no form ⇒ no market");
  await makeProviderForm(provider, "Goa");
  assert.equal(await marketForListing(noLocation), "goa", "falls back to the owner's provider-form city");
  assert.equal(await marketForListing(await makeListing(provider, "Atlantis")), "goa");
  assert.equal(await marketForListing(id()), null);
});

test("SR5 the staff stamp is atomic, cleared by an identity edit, kept by a safe edit, never body-settable", async () => {
  const provider = await makeUser("service_provider");
  const staff = await makeUser("regional_manager");
  const listing = await makeListing(provider, "Kyoto, Japan");
  assert.deepEqual(await stampListingStaffApproval(listing, staff), { stamped: true });
  assert.deepEqual(await stampListingStaffApproval(listing, staff), { stamped: false, reason: "not_waiting" });

  await storage.updateProviderService(listing, { description: "new wording" } as any);
  let [row] = await db.select().from(providerServices).where(eq(providerServices.id, listing));
  assert.equal(row.staffApprovedBy, staff, "a safe edit keeps the stamp");

  await storage.updateProviderService(listing, { serviceName: "A renamed listing" } as any);
  [row] = await db.select().from(providerServices).where(eq(providerServices.id, listing));
  assert.equal(row.staffApprovedAt, null, "an identity edit clears the stamp");
  assert.equal(row.staffApprovedBy, null);

  await storage.updateProviderService(listing, { staffApprovedAt: new Date(), staffApprovedBy: provider } as any);
  [row] = await db.select().from(providerServices).where(eq(providerServices.id, listing));
  assert.equal(row.staffApprovedBy, null, "the stamp is stripped from the update path");

  assert.deepEqual(await stampListingStaffApproval(listing, staff), { stamped: true });
  assert.equal(await clearListingStaffApproval(listing), true);

  const decided = await makeListing(provider, "Kyoto, Japan", "approved");
  assert.deepEqual(await stampListingStaffApproval(decided, staff), { stamped: false, reason: "not_waiting" });

  const form = await makeProviderForm(provider, "Kyoto");
  assert.deepEqual(await stampProviderFormStaffApproval(form, staff), { stamped: true });
  assert.deepEqual(await stampProviderFormStaffApproval(form, staff), { stamped: false, reason: "not_waiting" });
});

test("SR6 the owner sign-off queue", async () => {
  const provider = await makeUser("service_provider");
  const staff = await makeUser("platform_admin");
  const waiting = await makeListing(provider, "Kyoto, Japan");
  const unstamped = await makeListing(provider, "Kyoto, Japan");
  await stampListingStaffApproval(waiting, staff);
  const decided = await makeListing(provider, "Kyoto, Japan");
  await stampListingStaffApproval(decided, staff);
  await db.update(providerServices).set({ approvalStatus: "approved" } as any).where(eq(providerServices.id, decided));
  const form = await makeProviderForm(provider, "Kyoto");
  await stampProviderFormStaffApproval(form, staff);

  const q = await listOwnerSignoffQueue();
  const idsIn = new Set(q.map((r) => r.id));
  assert.ok(idsIn.has(waiting));
  assert.ok(idsIn.has(form));
  assert.ok(!idsIn.has(unstamped));
  assert.ok(!idsIn.has(decided));
  const row = q.find((r) => r.id === waiting)!;
  assert.equal(row.kind, "listing");
  assert.equal(row.market, "kyoto");
  assert.equal(row.staffApprovedBy, staff);
});

test("SR7 bot audit rows, the by-bot filter and the retention prune", async () => {
  assert.equal(botAuditActionFor("POST", "/api/bot/proposals"), "bot.propose");
  assert.equal(botAuditActionFor("GET", "/api/bot/proposals/x"), "bot.read");
  assert.equal(botAuditActionFor("GET", "/api/bot/queue"), "bot.read");

  const owner = await makeUser("owner");
  const a = await createBotAccount({ name: `sr-a-${id().slice(0, 6)}`, scopes: ["queue:read"], createdBy: owner });
  const b = await createBotAccount({ name: `sr-b-${id().slice(0, 6)}`, scopes: ["queue:read"], createdBy: owner });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  botIds.push(a.bot.id, b.bot.id);

  await recordBotAudit({ botId: a.bot.id, action: "bot.read", method: "get", path: "/api/bot/queue", scope: "queue:read", statusCode: 200 });
  await recordBotAudit({ botId: b.bot.id, action: "bot.propose", method: "POST", path: "/api/bot/proposals", scope: "proposals:write", statusCode: 403 });
  // A failed write never throws: an unknown bot id violates the FK and is swallowed.
  await recordBotAudit({ botId: id(), action: "bot.read", method: "GET", path: "/api/bot/queue", scope: null });

  const onlyA = await listBotAudit({ botId: a.bot.id });
  assert.equal(onlyA.length, 1);
  assert.equal(onlyA[0].method, "GET");
  assert.equal(onlyA[0].scope, "queue:read");
  assert.equal(onlyA[0].statusCode, 200);
  assert.equal(onlyA[0].botName, a.bot.name);

  // One old row for A; prune at "now" removes it and keeps the fresh ones.
  await db.insert(botAuditLogs).values({ id: id(), botId: a.bot.id, action: "bot.read", method: "GET", path: "/old", createdAt: new Date(Date.now() - 91 * 86400_000) } as any);
  assert.equal((await listBotAudit({ botId: a.bot.id })).length, 2);
  const removed = await pruneBotAudit();
  assert.ok(removed >= 1);
  const left = await listBotAudit({ botId: a.bot.id });
  assert.deepEqual(left.map((r) => r.path), ["/api/bot/queue"]);
  assert.equal((await listBotAudit({ botId: b.bot.id })).length, 1);
});

test("SR8 bot keys: scopes are a closed set and the Ops Bot projection drops the detail", async () => {
  assert.ok((BOT_SCOPES as readonly string[]).includes("queue:read"));
  const owner = await makeUser("owner");
  const r = await createBotAccount({ name: `sr-c-${id().slice(0, 6)}`, scopes: ["queue:read"], createdBy: owner });
  assert.ok(r.ok);
  if (!r.ok) return;
  botIds.push(r.bot.id);
  assert.deepEqual(await setBotScopes(r.bot.id, ["platform_settings:write"]), { ok: false, reason: "bad_scopes" });
  assert.deepEqual(await setBotScopes(r.bot.id, []), { ok: false, reason: "bad_scopes" });
  assert.deepEqual(await setBotScopes(id(), ["queue:read"]), { ok: false, reason: "not_found" });
  const ok = await setBotScopes(r.bot.id, ["queue:read", "proposals:write"]);
  assert.ok(ok.ok);
  const [row] = await db.select().from(botAccounts).where(eq(botAccounts.id, r.bot.id));
  assert.deepEqual([...row.scopes].sort(), ["proposals:write", "queue:read"]);

  const projected = botQueueProjection([{ kind: "bot_proposal", id: "p1", market: "kyoto", since: null, detail: { proposedBy: "Ops", assignedTo: "u1" } }]);
  assert.deepEqual(projected, [{ kind: "bot_proposal", id: "p1", market: "kyoto", since: null }]);
});

test("SR9 the issue queue reads nothing for an empty scope", async () => {
  assert.deepEqual(await listIssueQueue([]), []);
  assert.ok(Array.isArray(await listIssueQueue("all")));
  const scoped = await listIssueQueue(["kyoto"]);
  for (const item of scoped) assert.equal(item.market, "kyoto");
  await db.execute(sql`SELECT 1`);
});
