/**
 * Boot reference seeding (ledger `2026-10-18-boot-reference-seeding`):
 *   BS1  no registered migration creates any seeder-only key (the keys the boot gates read), and each
 *        seeder's key list is a subset of what it writes
 *   BS2  a seeder whose seeder-only key is present seeds nothing — a row an admin deleted never comes back
 *   BS3  the template-tabs updaters touch only rows created in this boot: a pre-existing occasion's
 *        name and switches are left as they were
 *   BS4  the advisory lock runs one holder at a time
 *   BS5  the DMO registry seeder never rewrites an existing row and counts real inserts
 *
 * DISPOSABLE DB ONLY. No network.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { MIGRATION_FILES } from "../migrations/migration-files";
import { CATEGORY_SEED_SLUGS, CATEGORY_SEEDER_ONLY_SLUGS, seedCategories } from "../seed-categories";
import { EXPERT_SERVICE_SEEDER_ONLY_NAMES } from "../seed-expert-services";
import { ROLE_TEMPLATE_SEEDER_ONLY_NAMES } from "../seeds/role-scoped-templates.seed";
import { CANONICAL_OFFERINGS, CANONICAL_TEMPLATES } from "../seeds/canonical-service-templates.seed";
import { seedExperienceTemplateTabs } from "../seeds/experience-template-tabs.seed";
import { seedDmoSources } from "../seeds/dmo-sources.seed";
import { withAdvisoryXactLock } from "../utils/advisory-lock";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUN = crypto.randomUUID().slice(0, 8);

before(() => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
});
after(async () => {
  await pool.end();
});

test("BS1: no migration creates a seeder-only key; each key list belongs to its seeder", () => {
  const sqlText = MIGRATION_FILES.map((f) => fs.readFileSync(path.join(here, "../migrations", f), "utf8")).join("\n");
  const quoted = (k: string) => `'${k.replace(/'/g, "''")}'`;
  const lists: Record<string, readonly string[]> = {
    categories: CATEGORY_SEEDER_ONLY_SLUGS,
    expertServices: EXPERT_SERVICE_SEEDER_ONLY_NAMES,
    roleTemplates: ROLE_TEMPLATE_SEEDER_ONLY_NAMES,
    serviceTemplates: CANONICAL_TEMPLATES.map((t) => t.title),
    canonicalOfferings: CANONICAL_OFFERINGS.map((o) => o.name),
  };
  for (const [name, keys] of Object.entries(lists)) {
    assert.ok(keys.length > 0, `${name} has keys`);
    for (const k of keys) assert.ok(!sqlText.includes(quoted(k)), `${name}: migration creates seeder-only key ${k}`);
  }
  for (const s of CATEGORY_SEEDER_ONLY_SLUGS) assert.ok(CATEGORY_SEED_SLUGS.includes(s), `category seeder writes ${s}`);
  // The three expert_service_offerings seeders gate on disjoint names, so one seeding never stops another.
  const offeringLists = [EXPERT_SERVICE_SEEDER_ONLY_NAMES, ROLE_TEMPLATE_SEEDER_ONLY_NAMES, CANONICAL_OFFERINGS.map((o) => o.name)];
  const seen = new Set<string>();
  for (const l of offeringLists) for (const k of l) {
    assert.ok(!seen.has(k), `offering name ${k} is claimed by two seeders`);
    seen.add(k);
  }
});

test("BS2: a seeded table never gets an admin-deleted category back", async () => {
  const victim = CATEGORY_SEED_SLUGS.find((s) => !CATEGORY_SEEDER_ONLY_SLUGS.includes(s))!;
  const before = await db.execute(sql`SELECT * FROM service_categories WHERE slug = ${victim}`);
  assert.ok(before.rows.length > 0, "fixture: the category is present after boot seeding");
  const row = before.rows[0] as any;
  await db.execute(sql`DELETE FROM service_categories WHERE slug = ${victim}`);
  try {
    const result = await seedCategories();
    assert.equal(result.created, 0);
    const afterRows = await db.execute(sql`SELECT 1 FROM service_categories WHERE slug = ${victim}`);
    assert.equal(afterRows.rows.length, 0, "the deleted category is not re-created");
  } finally {
    const cols = Object.keys(row);
    await db.execute(sql.raw(
      `INSERT INTO service_categories (${cols.map((c) => `"${c}"`).join(",")}) SELECT * FROM json_populate_record(NULL::service_categories, '${JSON.stringify(row).replace(/'/g, "''")}') ON CONFLICT DO NOTHING`,
    ));
  }
});

test("BS3: a pre-existing occasion is never rewritten by the template-tabs seeder", async () => {
  const [t] = (await db.execute(sql`SELECT id, slug, name, vocabulary FROM experience_types WHERE slug = 'wedding'`)).rows as any[];
  assert.ok(t, "fixture: the wedding occasion exists");
  const edited = `Wedding edited ${RUN}`;
  await db.execute(sql`UPDATE experience_types SET name = ${edited}, vocabulary = 'attendees' WHERE id = ${t.id}`);
  try {
    await seedExperienceTemplateTabs();
    const [now] = (await db.execute(sql`SELECT name, vocabulary FROM experience_types WHERE id = ${t.id}`)).rows as any[];
    assert.equal(now.name, edited);
    assert.equal(now.vocabulary, "attendees");
  } finally {
    await db.execute(sql`UPDATE experience_types SET name = ${t.name}, vocabulary = ${t.vocabulary} WHERE id = ${t.id}`);
  }
});

test("BS4: the advisory lock admits one holder at a time", async () => {
  const name = `boot-seed-test-${RUN}`;
  const order: string[] = [];
  let releaseFirst!: () => void;
  const gate = new Promise<void>((r) => (releaseFirst = r));
  const first = withAdvisoryXactLock(name, async () => {
    order.push("first:start");
    await gate;
    order.push("first:end");
  });
  await new Promise((r) => setTimeout(r, 100));
  const second = withAdvisoryXactLock(name, async () => {
    order.push("second");
  });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(order, ["first:start"], "the second waits while the first holds the lock");
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first:start", "first:end", "second"]);
});

test("BS5: the DMO registry seeder never rewrites an existing row", async () => {
  const [r] = (await db.execute(sql`SELECT id, notes, is_active, updated_at FROM dmo_sources ORDER BY id LIMIT 1`)).rows as any[];
  assert.ok(r, "fixture: dmo_sources is seeded");
  const note = `admin note ${RUN}`;
  await db.execute(sql`UPDATE dmo_sources SET notes = ${note}, is_active = false WHERE id = ${r.id}`);
  try {
    const { upserted } = await seedDmoSources();
    assert.equal(upserted, 0, "nothing new to insert");
    const [now] = (await db.execute(sql`SELECT notes, is_active FROM dmo_sources WHERE id = ${r.id}`)).rows as any[];
    assert.equal(now.notes, note);
    assert.equal(now.is_active, false);
  } finally {
    await db.execute(sql`UPDATE dmo_sources SET notes = ${r.notes}, is_active = ${r.is_active} WHERE id = ${r.id}`);
  }
});
