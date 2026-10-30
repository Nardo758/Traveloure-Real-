/**
 * Row 210 — guest RSVP details are erased N days after the event ends.
 *
 *   D1  N unset (no row) or unreadable: the job erases nothing, including on an unscoped pass,
 *       and reports the log sentence.
 *   D2  With N set, only invites whose event day plus N is on or before today are erased.
 *       A later event, an undated event, and a due event outside the pass stay. The outbox copy,
 *       the send log and the travel plan go with the invite. One audit row stores the count and
 *       not the address. A second pass writes nothing more.
 *   D3  The event day is read in the plan's zone. UTC is used only when the plan has no zone.
 *   D4  The host deleting the event erases its guest data even when the event has not ended and
 *       N is unset, and the audit count matches. An event with no guests is deleted with no audit.
 *   D5  A guest request erases that invite only, even when N is unset and the event is in the
 *       future. The sibling invite and the event stay. The audit count is 1 and carries no address.
 *   D6  Due rows and no recorded admin behind N: nothing is erased, and the job reports an error.
 *
 * Disposable database only. Every row this file writes is prefixed and removed in after().
 * The daily route calls the job with no experience scope; these proofs pass a scope so a shared
 * local database's other invites are not erased. D1's unscoped call runs only while N is unset.
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/guest-data-retention.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  GUEST_DATA_ERASED_ACTION,
  GUEST_ERASE_AUDIT_MISSING,
  GUEST_RETENTION_UNREADABLE_LOG,
  GUEST_RETENTION_UNSET_LOG,
  eraseGuestDataOnHostDelete,
  eraseGuestInviteOnRequest,
  readGuestDataRetentionDays,
  runGuestDataRetention,
} from "../jobs/guestDataRetention";
import { GUEST_DATA_RETENTION_DAYS_SETTING } from "@shared/guest-data-retention";

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
    serverAddr = ((r.rows[0] as { addr?: string } | undefined)?.addr) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(`guest-data-retention.db.test refuses a non-local database (${host ?? "unknown host"})`);
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const KEY = GUEST_DATA_RETENTION_DAYS_SETTING;
const hostId = `gdr-${RUN}-host`;
const adminId = `gdr-${RUN}-admin`;
const typeId = `gdr-${RUN}-type`;
let saved: { value: string; updatedBy: string | null } | null | undefined;

async function inviteCount(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM event_invites`);
  return Number((r.rows[0] as { n: number }).n);
}
async function inviteExists(id: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM event_invites WHERE id = ${id}`);
  return r.rows.length === 1;
}
async function experienceExists(id: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM user_experiences WHERE id = ${id}`);
  return r.rows.length === 1;
}
async function putSetting(value: string | null, updatedBy: string | null) {
  if (value === null) {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`);
    return;
  }
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES (${KEY}, ${value}, ${updatedBy}, NOW())
    ON CONFLICT (setting_key) DO UPDATE
      SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `);
}
async function clearAudits() {
  await db.execute(sql`
    DELETE FROM access_audit_logs
    WHERE actor_id IN (${hostId}, ${adminId}) OR resource_id LIKE ${`gdr-${RUN}-%`}
  `);
}
let seq = 0;
async function makeExperience(opts: { eventDate: string | null; tripId?: string }): Promise<string> {
  const id = `gdr-${RUN}-exp-${++seq}`;
  await db.execute(sql`
    INSERT INTO user_experiences (id, user_id, experience_type_id, title, event_date, trip_id)
    VALUES (${id}, ${hostId}, ${typeId}, 'QA event', ${opts.eventDate}, ${opts.tripId ?? null})
  `);
  return id;
}
async function makeTrip(timezone: string): Promise<string> {
  const id = `gdr-${RUN}-trip-${++seq}`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, destination, start_date, end_date, timezone)
    VALUES (${id}, ${hostId}, 'Kyoto', '2026-01-01', '2026-01-02', ${timezone})
  `);
  return id;
}
async function makeInvite(experienceId: string, email = `gdr-${RUN}-${++seq}@traveloure-qa.test`): Promise<{ id: string; token: string; email: string }> {
  const id = `gdr-${RUN}-inv-${seq}`;
  const token = `gdr-${RUN}-tok-${seq}`;
  await db.execute(sql`
    INSERT INTO event_invites (id, experience_id, organizer_id, guest_email, guest_name, unique_token, dietary_restrictions)
    VALUES (${id}, ${experienceId}, ${hostId}, ${email}, 'QA Guest', ${token}, '["nuts"]'::jsonb)
  `);
  return { id, token, email };
}
async function attachCopies(inviteId: string, email: string) {
  await db.execute(sql`
    INSERT INTO guest_travel_plans (id, invite_id) VALUES (${`gdr-${RUN}-plan-${inviteId}`}, ${inviteId})
  `);
  await db.execute(sql`
    INSERT INTO invite_send_log (id, invite_id, method, recipient_address, status)
    VALUES (${`gdr-${RUN}-log-${inviteId}`}, ${inviteId}, 'email', ${email}, 'sent')
  `);
  await db.execute(sql`
    INSERT INTO email_outbox (email_type, to_email, subject, html, status, metadata)
    VALUES ('guest_invite', ${email}, 'Invite', '<p>invite</p>', 'sent', jsonb_build_object('inviteId', ${inviteId}::text))
  `);
}
async function copiesGone(inviteId: string, email: string): Promise<boolean> {
  const plans = await db.execute(sql`SELECT 1 FROM guest_travel_plans WHERE invite_id = ${inviteId}`);
  const logs = await db.execute(sql`SELECT 1 FROM invite_send_log WHERE invite_id = ${inviteId}`);
  const mail = await db.execute(sql`
    SELECT 1 FROM email_outbox
    WHERE email_type = 'guest_invite' AND (metadata->>'inviteId' = ${inviteId} OR to_email = ${email})
  `);
  return plans.rows.length === 0 && logs.rows.length === 0 && mail.rows.length === 0;
}
async function audits(actorId: string, cause: string) {
  const r = await db.execute(sql`
    SELECT actor_role, resource_type, resource_id, metadata, metadata::text AS meta
    FROM access_audit_logs
    WHERE actor_id = ${actorId} AND action = ${GUEST_DATA_ERASED_ACTION} AND metadata->>'cause' = ${cause}
    ORDER BY created_at, id
  `);
  return r.rows as { actor_role: string; resource_type: string; resource_id: string; metadata: { count?: number }; meta: string }[];
}

describe("row 210 guest data retention", { concurrency: 1 }, () => {
  before(async () => {
    await assertDisposableDb();
    const prior = await db.execute(sql`
      SELECT setting_value, updated_by FROM platform_settings WHERE setting_key = ${KEY} LIMIT 1
    `);
    const row = prior.rows[0] as { setting_value: string; updated_by: string | null } | undefined;
    saved = row ? { value: row.setting_value, updatedBy: row.updated_by } : null;
    await db.execute(sql`
      INSERT INTO users (id, email, role) VALUES
        (${hostId}, ${`${hostId}@traveloure-qa.test`}, 'user'),
        (${adminId}, ${`${adminId}@traveloure-qa.test`}, 'admin')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO experience_types (id, name, slug)
      VALUES (${typeId}, ${`GDR ${RUN}`}, ${`gdr-${RUN}`})
      ON CONFLICT (id) DO NOTHING
    `);
  });

  after(async () => {
    await db.execute(sql`
      DELETE FROM email_outbox
      WHERE email_type = 'guest_invite' AND (metadata->>'inviteId' LIKE ${`gdr-${RUN}-%`} OR to_email LIKE ${`gdr-${RUN}-%@traveloure-qa.test`})
    `).catch(() => {});
    await db.execute(sql`DELETE FROM event_invites WHERE id LIKE ${`gdr-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM user_experiences WHERE id LIKE ${`gdr-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`gdr-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM experience_types WHERE id = ${typeId}`).catch(() => {});
    await clearAudits().catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id IN (${hostId}, ${adminId})`).catch(() => {});
    if (saved === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`).catch(() => {});
    else if (saved) {
      await db.execute(sql`
        UPDATE platform_settings SET setting_value = ${saved.value}, updated_by = ${saved.updatedBy}
        WHERE setting_key = ${KEY}
      `).catch(() => {});
    }
  });

  it("D1 unset and unreadable N erase nothing, and the unscoped pass says so", async () => {
    const exp = await makeExperience({ eventDate: "2020-01-01" });
    const invite = await makeInvite(exp, `gdr-${RUN}-old@traveloure-qa.test`);
    await putSetting(null, null);
    const before = await inviteCount();
    const absent = await runGuestDataRetention({ now: new Date("2030-01-01T00:00:00Z") });
    assert.deepEqual(absent, { status: "unset", erased: 0, reason: "absent", log: GUEST_RETENTION_UNSET_LOG });
    assert.equal(await inviteCount(), before, "an unscoped pass with N unset deletes no invite");
    assert.equal(await readGuestDataRetentionDays(), null);
    assert.equal(await inviteExists(invite.id), true);

    await putSetting("soon", adminId);
    const bad = await runGuestDataRetention({ now: new Date("2030-01-01T00:00:00Z"), experienceIds: [exp] });
    assert.deepEqual(bad, { status: "unset", erased: 0, reason: "unreadable", log: GUEST_RETENTION_UNREADABLE_LOG });
    assert.equal(await inviteExists(invite.id), true);
    assert.equal(await readGuestDataRetentionDays(), null);
  });

  it("D2 erases only past-N invites, writes one audit count, and a second pass is idle", async () => {
    await clearAudits();
    await putSetting("10", adminId);
    assert.equal(await readGuestDataRetentionDays(), 10);
    const dueExp = await makeExperience({ eventDate: "2026-01-01" });
    const keepExp = await makeExperience({ eventDate: "2026-01-02" });
    const undated = await makeExperience({ eventDate: null });
    const outside = await makeExperience({ eventDate: "2026-01-01" });
    const email = `gdrsecret${RUN}@traveloure-qa.test`;
    const due = await makeInvite(dueExp, email);
    const dueToo = await makeInvite(dueExp);
    await attachCopies(due.id, email);
    const keep = await makeInvite(keepExp);
    const noDate = await makeInvite(undated);
    const other = await makeInvite(outside);
    const now = new Date("2026-01-11T12:00:00Z");
    const scope = [dueExp, keepExp, undated];

    const res = await runGuestDataRetention({ now, experienceIds: scope });
    assert.equal(res.status, "erased");
    assert.equal(res.erased, 2);
    if (res.status === "erased") assert.equal(res.more, false);
    assert.equal(await inviteExists(due.id), false);
    assert.equal(await inviteExists(dueToo.id), false);
    assert.equal(await copiesGone(due.id, email), true);
    assert.equal(await inviteExists(keep.id), true, "ended one day too recently");
    assert.equal(await inviteExists(noDate.id), true, "an event with no day has not ended");
    assert.equal(await inviteExists(other.id), true, "a due invite outside this pass stays");
    assert.equal(await experienceExists(dueExp), true, "the event stays; only the guest rows go");

    const rows = await audits(adminId, "retention");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metadata.count, 2);
    assert.equal(rows[0].actor_role, "system");
    assert.equal(rows[0].resource_type, "guest_data_retention");
    assert.equal(rows[0].meta.includes("gdrsecret"), false, "the address is not in the audit row");
    assert.equal(rows[0].meta.includes("QA Guest"), false);
    assert.equal(rows[0].meta.includes("nuts"), false);

    const again = await runGuestDataRetention({ now, experienceIds: scope });
    assert.equal(again.status, "idle");
    assert.equal(again.erased, 0);
    assert.equal((await audits(adminId, "retention")).length, 1, "a second pass writes no second audit row");

    // The daily route passes no experience scope. A now before every event date runs that SQL and matches nothing.
    const before = await inviteCount();
    const ancient = await runGuestDataRetention({ now: new Date("1800-01-01T00:00:00Z") });
    assert.equal(ancient.status, "idle");
    assert.equal(ancient.erased, 0);
    assert.equal(await inviteCount(), before, "an unscoped pass before every event date deletes nothing");
  });

  it("D3 the event day is the plan zone's calendar day", async () => {
    await clearAudits();
    await putSetting("10", adminId);
    const trip = await makeTrip("America/Los_Angeles");
    const exp = await makeExperience({ eventDate: "2026-01-01", tripId: trip });
    const invite = await makeInvite(exp);
    const early = await runGuestDataRetention({
      now: new Date("2026-01-11T07:00:00Z"),
      experienceIds: [exp],
    });
    assert.equal(early.status, "idle");
    assert.equal(await inviteExists(invite.id), true, "07:00Z is still January 10 in Los Angeles");

    const due = await runGuestDataRetention({
      now: new Date("2026-01-11T09:00:00Z"),
      experienceIds: [exp],
    });
    assert.equal(due.status, "erased");
    assert.equal(due.erased, 1);
    assert.equal(await inviteExists(invite.id), false, "09:00Z is January 11 in Los Angeles");
  });

  it("D4 host delete erases guest data before N, and an event with no guests writes no audit", async () => {
    await clearAudits();
    await putSetting(null, null);
    const exp = await makeExperience({ eventDate: "2099-01-01" });
    const email = `gdrhost${RUN}@traveloure-qa.test`;
    const invite = await makeInvite(exp, email);
    await attachCopies(invite.id, email);
    const keptExp = await makeExperience({ eventDate: "2099-01-01" });
    const kept = await makeInvite(keptExp);

    const erased = await eraseGuestDataOnHostDelete({ experienceId: exp, actorId: hostId });
    assert.equal(erased.erased, 1);
    assert.equal(await experienceExists(exp), false);
    assert.equal(await inviteExists(invite.id), false);
    assert.equal(await copiesGone(invite.id, email), true);
    assert.equal(await inviteExists(kept.id), true);
    const rows = await audits(hostId, "host_delete");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metadata.count, 1);
    assert.equal(rows[0].resource_id, exp);
    assert.equal(rows[0].meta.includes("gdrhost"), false);

    const empty = await makeExperience({ eventDate: "2099-02-01" });
    const none = await eraseGuestDataOnHostDelete({ experienceId: empty, actorId: hostId });
    assert.equal(none.erased, 0);
    assert.equal(await experienceExists(empty), false);
    assert.equal((await audits(hostId, "host_delete")).length, 1, "no guest rows, no audit row");
  });

  it("D5 a guest request erases that invite only, with N unset", async () => {
    await clearAudits();
    await putSetting(null, null);
    const exp = await makeExperience({ eventDate: "2099-06-01" });
    const email = `gdrguest${RUN}@traveloure-qa.test`;
    const asked = await makeInvite(exp, email);
    await attachCopies(asked.id, email);
    const sibling = await makeInvite(exp);

    const result = await eraseGuestInviteOnRequest(asked.token);
    assert.deepEqual(result, { erased: true });
    assert.equal(await inviteExists(asked.id), false);
    assert.equal(await copiesGone(asked.id, email), true);
    assert.equal(await inviteExists(sibling.id), true);
    assert.equal(await experienceExists(exp), true);
    const missing = await eraseGuestInviteOnRequest(asked.token);
    assert.deepEqual(missing, { erased: false });

    const rows = await audits(hostId, "guest_request");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metadata.count, 1);
    assert.equal(rows[0].resource_id, asked.id);
    assert.equal(rows[0].actor_role, "system");
    assert.equal(rows[0].meta.includes(asked.token), false, "the token is not in the audit row");
    assert.equal(rows[0].meta.includes("gdrguest"), false);
  });

  it("D6 due rows and no audit actor erase nothing", async () => {
    await clearAudits();
    await putSetting("10", null);
    const exp = await makeExperience({ eventDate: "2026-01-01" });
    const invite = await makeInvite(exp);
    const res = await runGuestDataRetention({
      now: new Date("2026-01-11T12:00:00Z"),
      experienceIds: [exp],
    });
    assert.equal(res.status, "error");
    assert.equal(res.erased, 0);
    if (res.status === "error") assert.equal(res.error, GUEST_ERASE_AUDIT_MISSING);
    assert.equal(await inviteExists(invite.id), true);
    assert.equal((await audits(adminId, "retention")).length, 0);
  });
});
