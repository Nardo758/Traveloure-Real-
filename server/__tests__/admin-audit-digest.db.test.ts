/**
 * Row 140 — the scheduled admin digest counts audited admin actions.
 *
 *   AD1  a row 1 hour old, a row 23 hours old, and a row with the column default are inside
 *        `NOW() - INTERVAL '24 hours'`; a row 25 hours old is not. The loader's total moves by the same count.
 *   AD2  actions order by count desc, then action name asc. The total equals the sum.
 *   AD3  one row per actor-role pair, count desc then actor id. Label is "First Last", else email, else id.
 *   AD4  17 actions and 12 actors cap at 15 and 10, and the remainder counts are exact.
 *   AD5  no rows in the window is total 0, and the section is empty (also for undefined).
 *   AD6  the rendered section has no marker, ip address, resource id, or target-user email.
 *   AD7  an action name and an actor first name are escaped.
 *   AD8  loadAdminAuditDigest does not write an audit row.
 *   AD9  the scheduler passes adminActions, skips on a zero total, and loads in its own try/catch.
 *   AD10 admin-audit-digest.ts has no sendEmail( call.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/admin-audit-digest.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, pool, backgroundPool } from "../db";
import {
  ADMIN_AUDIT_DIGEST_ACTION_CAP,
  ADMIN_AUDIT_DIGEST_ACTOR_CAP,
  ADMIN_AUDIT_DIGEST_WINDOW_HOURS,
  loadAdminAuditDigest,
  shapeAdminAuditDigest,
} from "../services/admin-audit-digest";
import { buildAdminAuditDigestSection } from "../services/email.service";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = (s: string) => `ad-${RUN}-${s}`;
const actionName = (s: string) => `ad_${RUN}_${s}`;

async function insertUser(
  id: string,
  fields: { email?: string | null; first?: string | null; last?: string | null } = {},
): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${id}, ${fields.email ?? null}, ${fields.first ?? null}, ${fields.last ?? null}, 'admin')
  `);
}

async function insertLog(opts: {
  id: string;
  actorId: string;
  action: string;
  role?: string;
  /** Omit for the column default (now()). */
  ageHours?: number;
  resourceId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, string>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const role = opts.role ?? "admin";
  const resourceId = opts.resourceId ?? null;
  const target = opts.targetUserId ?? null;
  const metadata = JSON.stringify(opts.metadata ?? {});
  const ip = opts.ip ?? null;
  const userAgent = opts.userAgent ?? null;
  if (opts.ageHours == null) {
    await db.execute(sql`
      INSERT INTO access_audit_logs
        (id, actor_id, actor_role, action, resource_type, resource_id, target_user_id, metadata, ip_address, user_agent)
      VALUES
        (${opts.id}, ${opts.actorId}, ${role}, ${opts.action}, 'admin', ${resourceId}, ${target}, ${metadata}::jsonb, ${ip}, ${userAgent})
    `);
    return;
  }
  await db.execute(sql`
    INSERT INTO access_audit_logs
      (id, actor_id, actor_role, action, resource_type, resource_id, target_user_id, metadata, ip_address, user_agent, created_at)
    VALUES
      (${opts.id}, ${opts.actorId}, ${role}, ${opts.action}, 'admin', ${resourceId}, ${target}, ${metadata}::jsonb, ${ip}, ${userAgent},
       NOW() - make_interval(hours => ${opts.ageHours}))
  `);
}

async function cleanup(): Promise<void> {
  await db.execute(sql`
    DELETE FROM access_audit_logs
    WHERE id LIKE ${`ad-${RUN}-%`}
       OR actor_id LIKE ${`ad-${RUN}-%`}
       OR target_user_id LIKE ${`ad-${RUN}-%`}
  `);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`ad-${RUN}-%`}`);
}

async function windowCount(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n
      FROM access_audit_logs
     WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  return Number((result.rows[0] as { n: number }).n ?? 0);
}

async function prefixCount(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n FROM access_audit_logs WHERE id LIKE ${`ad-${RUN}-%`}
  `);
  return Number((result.rows[0] as { n: number }).n ?? 0);
}

describe("admin audit digest", { concurrency: 1 }, () => {
  before(async () => {
    assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
    const n = await windowCount();
    assert.equal(n, 0, `AD tests expect an empty 24h window so caps are exact; found ${n}`);
  });

  after(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
      await backgroundPool.end();
    }
  });

  test("AD5 empty: no rows in the window, and undefined renders nothing", async () => {
    assert.equal(buildAdminAuditDigestSection(undefined), "");
    const empty = shapeAdminAuditDigest({ total: 0, actorCount: 0, actions: [], actors: [] });
    assert.equal(empty.total, 0);
    assert.equal(empty.actorCount, 0);
    assert.deepEqual(empty.byAction, []);
    assert.deepEqual(empty.byActor, []);
    assert.deepEqual(empty.otherActions, { kinds: 0, count: 0 });
    assert.deepEqual(empty.otherActors, { people: 0, count: 0 });
    assert.equal(buildAdminAuditDigestSection(empty), "");

    const loaded = await loadAdminAuditDigest();
    assert.equal(loaded.total, 0);
    assert.equal(loaded.actorCount, 0);
    assert.equal(buildAdminAuditDigestSection(loaded), "");
  });

  test("AD1 window: 1h, 23h and the column default count; 25h does not", async () => {
    assert.equal(ADMIN_AUDIT_DIGEST_WINDOW_HOURS, 24);
    try {
      const tz = await db.execute(sql`SHOW timezone`);
      const tzRow = (tz.rows[0] ?? {}) as Record<string, unknown>;
      const zone = String(tzRow.TimeZone ?? tzRow.timezone ?? JSON.stringify(tzRow));
      const actor = uid("w");
      await insertUser(actor, { email: `${actor}@traveloure.test`, first: "Win", last: "Dow" });
      const before = await loadAdminAuditDigest();
      await insertLog({ id: uid("h1"), actorId: actor, action: actionName("h1"), ageHours: 1 });
      await insertLog({ id: uid("h23"), actorId: actor, action: actionName("h23"), ageHours: 23 });
      await insertLog({ id: uid("h25"), actorId: actor, action: actionName("h25"), ageHours: 25 });
      await insertLog({ id: uid("now"), actorId: actor, action: actionName("now") });

      const literal = await db.execute(sql`
        SELECT id FROM access_audit_logs
         WHERE id LIKE ${`ad-${RUN}-%`}
           AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      const ids = (literal.rows as { id: string }[]).map((row) => row.id).sort();
      assert.deepEqual(ids, [uid("h1"), uid("h23"), uid("now")].sort(), `session timezone ${zone}`);

      const after = await loadAdminAuditDigest();
      assert.equal(
        after.total - before.total,
        3,
        `session timezone ${zone}: loader delta ${after.total - before.total} disagreed with INTERVAL '24 hours'`,
      );
      const counts = new Map(after.byAction.map((row) => [row.action, row.count]));
      assert.equal(counts.get(actionName("h1")), 1);
      assert.equal(counts.get(actionName("h23")), 1);
      assert.equal(counts.get(actionName("now")), 1);
      assert.equal(counts.has(actionName("h25")), false);
    } finally {
      await cleanup();
    }
  });

  test("AD2 by action: count desc, action name asc, total equals the sum", async () => {
    const pure = shapeAdminAuditDigest({
      total: 12,
      actorCount: 1,
      actions: [
        { action: "beta", count: 5 },
        { action: "alpha", count: 5 },
        { action: "gamma", count: 2 },
      ],
      actors: [],
    });
    assert.deepEqual(pure.byAction, [
      { action: "alpha", count: 5 },
      { action: "beta", count: 5 },
      { action: "gamma", count: 2 },
    ]);
    assert.equal(pure.total, pure.byAction.reduce((sum, row) => sum + row.count, 0) + pure.otherActions.count);

    try {
      const actor = uid("act");
      await insertUser(actor, { email: `${actor}@traveloure.test`, first: "Ann", last: "Act" });
      const before = await loadAdminAuditDigest();
      for (const [name, n] of [["m", 5], ["a", 5], ["z", 2]] as const) {
        for (let i = 0; i < n; i++) {
          await insertLog({ id: uid(`a2-${name}-${i}`), actorId: actor, action: actionName(name) });
        }
      }
      const after = await loadAdminAuditDigest();
      assert.equal(after.total, before.total + 12);
      const ours = after.byAction.filter((row) => row.action.startsWith(`ad_${RUN}_`));
      assert.deepEqual(ours, [
        { action: actionName("a"), count: 5 },
        { action: actionName("m"), count: 5 },
        { action: actionName("z"), count: 2 },
      ]);
      assert.equal(ours.reduce((sum, row) => sum + row.count, 0), after.total - before.total);
    } finally {
      await cleanup();
    }
  });

  test("AD3 by actor: one row per role, count desc then actor id, three labels", async () => {
    const named = uid("b");
    const mailed = uid("a");
    const bare = uid("z");
    const pure = shapeAdminAuditDigest({
      total: 11,
      actorCount: 3,
      actions: [],
      actors: [
        { actorId: named, firstName: "Grace", lastName: "Hopper", email: "grace@traveloure.test", role: "editor", count: 1 },
        { actorId: named, firstName: "Grace", lastName: "Hopper", email: "grace@traveloure.test", role: "admin", count: 4 },
        { actorId: mailed, firstName: null, lastName: null, email: "ada@traveloure.test", role: "admin", count: 4 },
        { actorId: bare, firstName: "  ", lastName: null, email: "  ", role: "viewer", count: 2 },
      ],
    });
    assert.deepEqual(
      pure.byActor.map((row) => ({ id: row.actorId, label: row.label, role: row.role, count: row.count })),
      [
        { id: mailed, label: "ada@traveloure.test", role: "admin", count: 4 },
        { id: named, label: "Grace Hopper", role: "admin", count: 4 },
        { id: bare, label: bare, role: "viewer", count: 2 },
        { id: named, label: "Grace Hopper", role: "editor", count: 1 },
      ],
    );

    try {
      await insertUser(named, { email: `grace-${RUN}@traveloure.test`, first: "Grace", last: "Hopper" });
      await insertUser(mailed, { email: `ada-${RUN}@traveloure.test` });
      await insertUser(bare);
      const rows: Array<[string, string, string, number]> = [
        ["mail", mailed, "admin", 4],
        ["adm", named, "admin", 4],
        ["bare", bare, "viewer", 2],
        ["ed", named, "editor", 1],
      ];
      for (const [key, actorId, role, n] of rows) {
        for (let i = 0; i < n; i++) {
          await insertLog({ id: uid(`a3-${key}-${i}`), actorId, action: actionName(`r-${key}`), role });
        }
      }
      const loaded = await loadAdminAuditDigest();
      assert.equal(loaded.actorCount, 3);
      assert.deepEqual(
        loaded.byActor.map((row) => ({ id: row.actorId, label: row.label, role: row.role, count: row.count })),
        [
          { id: mailed, label: `ada-${RUN}@traveloure.test`, role: "admin", count: 4 },
          { id: named, label: "Grace Hopper", role: "admin", count: 4 },
          { id: bare, label: bare, role: "viewer", count: 2 },
          { id: named, label: "Grace Hopper", role: "editor", count: 1 },
        ],
      );
    } finally {
      await cleanup();
    }
  });

  test("AD4 caps: 17 actions and 12 actors, remainder counts are exact", async () => {
    assert.equal(ADMIN_AUDIT_DIGEST_ACTION_CAP, 15);
    assert.equal(ADMIN_AUDIT_DIGEST_ACTOR_CAP, 10);
    const actions = Array.from({ length: 17 }, (_, i) => ({
      action: `act-${String(i + 1).padStart(2, "0")}`,
      count: 17 - i,
    }));
    const actors = Array.from({ length: 12 }, (_, i) => ({
      actorId: `id-${String(i + 1).padStart(2, "0")}`,
      firstName: "Pat",
      lastName: String(i + 1),
      email: null,
      role: "admin",
      count: 12 - i,
    }));
    const shaped = shapeAdminAuditDigest({
      total: actions.reduce((sum, row) => sum + row.count, 0),
      actorCount: 12,
      actions,
      actors,
    });
    assert.equal(shaped.byAction.length, 15);
    assert.deepEqual(shaped.otherActions, { kinds: 2, count: 3 });
    assert.deepEqual(shaped.byAction[0], { action: "act-01", count: 17 });
    assert.deepEqual(shaped.byAction[14], { action: "act-15", count: 3 });
    assert.equal(shaped.byActor.length, 10);
    assert.deepEqual(shaped.otherActors, { people: 2, count: 3 });
    assert.equal(
      shaped.byAction.reduce((sum, row) => sum + row.count, 0) + shaped.otherActions.count,
      shaped.total,
    );
    assert.equal(
      shaped.byActor.reduce((sum, row) => sum + row.count, 0) + shaped.otherActors.count,
      actors.reduce((sum, row) => sum + row.count, 0),
    );

    try {
      for (let i = 1; i <= 12; i++) {
        const id = uid(`p${String(i).padStart(2, "0")}`);
        await insertUser(id, { email: `${id}@traveloure.test`, first: "P", last: String(i) });
      }
      // 17 actions, 12 actors: p01 holds 6 rows, p02..p12 hold one each.
      for (let i = 1; i <= 17; i++) {
        const actorIndex = i <= 6 ? 1 : i - 5;
        const actorId = uid(`p${String(actorIndex).padStart(2, "0")}`);
        await insertLog({
          id: uid(`a4-${String(i).padStart(2, "0")}`),
          actorId,
          action: actionName(`a${String(i).padStart(2, "0")}`),
        });
      }
      const loaded = await loadAdminAuditDigest();
      assert.equal(loaded.total, 17);
      assert.equal(loaded.actorCount, 12);
      assert.equal(loaded.byAction.length, 15);
      assert.deepEqual(loaded.otherActions, { kinds: 2, count: 2 });
      assert.deepEqual(loaded.byAction[0], { action: actionName("a01"), count: 1 });
      assert.deepEqual(loaded.byAction[14], { action: actionName("a15"), count: 1 });
      assert.equal(loaded.byActor.length, 10);
      assert.deepEqual(loaded.otherActors, { people: 2, count: 2 });
      assert.equal(loaded.byActor[0].actorId, uid("p01"));
      assert.equal(loaded.byActor[0].count, 6);
      assert.equal(
        loaded.byAction.reduce((sum, row) => sum + row.count, 0) + loaded.otherActions.count,
        loaded.total,
      );
      assert.equal(
        loaded.byActor.reduce((sum, row) => sum + row.count, 0) + loaded.otherActors.count,
        loaded.total,
      );
    } finally {
      await cleanup();
    }
  });

  test("AD6 no leakage: marker, ip, resource id and target email stay out of the section", async () => {
    const marker = `SECRET_MARKER_${RUN}`;
    const resourceId = `res-${RUN}`;
    const targetEmail = `tgt-${RUN}@traveloure.test`;
    const ip = "203.0.113.9";
    try {
      const actor = uid("own");
      const target = uid("tgt");
      await insertUser(actor, { email: `own-${RUN}@traveloure.test`, first: "Owen", last: "Owner" });
      await insertUser(target, { email: targetEmail, first: "Tara", last: "Target" });
      await insertLog({
        id: uid("sec"),
        actorId: actor,
        action: actionName("sec"),
        resourceId,
        targetUserId: target,
        metadata: { note: marker },
        ip,
        userAgent: `UA-${RUN}`,
      });
      const loaded = await loadAdminAuditDigest();
      const html = buildAdminAuditDigestSection(loaded);
      assert.match(html, /Audited admin actions \(1 in the last 24 hours, by 1 people\)/);
      assert.equal(html.includes(marker), false);
      assert.equal(html.includes(ip), false);
      assert.equal(html.includes(resourceId), false);
      assert.equal(html.includes(targetEmail), false);
      assert.equal(html.includes(`UA-${RUN}`), false);
      const dumped = JSON.stringify(loaded);
      assert.equal(dumped.includes(marker), false);
      assert.equal(dumped.includes(ip), false);
      assert.equal(dumped.includes(resourceId), false);
      assert.equal(dumped.includes(targetEmail), false);
    } finally {
      await cleanup();
    }
  });

  test("AD7 escaping: action name and actor first name", async () => {
    try {
      const actor = uid("esc");
      await insertUser(actor, { email: `esc-${RUN}@traveloure.test`, first: "<script>", last: "Alert" });
      await insertLog({ id: uid("esc1"), actorId: actor, action: `a<b>&"c` });
      const html = buildAdminAuditDigestSection(await loadAdminAuditDigest());
      assert.ok(html.includes("a&lt;b&gt;&amp;&quot;c"), html);
      assert.ok(html.includes("&lt;script&gt;"), html);
      assert.equal(html.includes("<script>"), false);
      assert.equal(html.includes(`a<b>&"c`), false);
    } finally {
      await cleanup();
    }
  });

  test("AD8 the section is read-only", async () => {
    try {
      const actor = uid("ro");
      await insertUser(actor, { email: `${actor}@traveloure.test`, first: "Re", last: "Only" });
      await insertLog({ id: uid("ro1"), actorId: actor, action: actionName("ro") });
      const before = await prefixCount();
      assert.equal(before, 1);
      await loadAdminAuditDigest();
      assert.equal(await prefixCount(), before);
    } finally {
      await cleanup();
    }
  });

  test("AD9 wiring: scheduler passes adminActions and loads in its own try/catch", () => {
    const scheduler = readFileSync("server/services/admin-digest-scheduler.service.ts", "utf8");
    const email = readFileSync("server/services/email.service.ts", "utf8");
    assert.match(scheduler, /sendAdminDigestEmail\(\{[^}]*\badminActions,/);
    assert.match(scheduler, /\(adminActions\?\.total \?\? 0\) === 0/);
    assert.match(
      scheduler,
      /let adminActions: AdminAuditDigest \| undefined;\s*try \{\s*adminActions = await loadAdminAuditDigest\(\);\s*\} catch \(err\) \{\s*console\.error\("\[AdminDigest\] Failed to load audited admin actions:", err\);/,
    );
    assert.match(email, /emailType: "admin_digest_24h"/);
    const heldClause = "${heldCount > 0 ? `, ${heldCount} held` : \"\"}";
    const adminClause = "${adminActionTotal > 0 ? `, ${adminActionTotal} admin actions` : \"\"}";
    assert.ok(email.includes(heldClause));
    assert.ok(email.indexOf(adminClause) > email.indexOf(heldClause));
    assert.equal(scheduler.includes("sendEmail("), false);
    assert.equal(readFileSync("server/services/admin-audit-digest.ts", "utf8").includes("sendEmail("), false);
  });

  test("AD10 no new send path", () => {
    const src = readFileSync("server/services/admin-audit-digest.ts", "utf8");
    assert.equal(src.includes("sendEmail("), false);
  });
});
