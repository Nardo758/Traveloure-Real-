#!/usr/bin/env node
/**
 * preflight-prod-unique-indexes.cjs — publish-safety check for UNIQUE indexes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Sibling of preflight-prod-constraints.cjs, for the OTHER half of the deploy-push trap.
 * That script covers CHECK constraints; this one covers UNIQUE indexes.
 *
 * Per CLAUDE.md, the publish-time drizzle-kit push is AUTHORITATIVE over objects absent
 * from shared/schema.ts and will DROP an index that exists only in migration SQL — after
 * which the stamped migration never recreates it. The fix is to DECLARE the index in
 * shared/schema.ts. But declaring a UNIQUE index is not free: if production already holds
 * duplicate rows for that key, the push FAILS mid-deploy and offers the DESTRUCTIVE
 * "copy dev database over production" option, which must never be accepted.
 *
 * So: run this against prod BEFORE publishing a newly-declared UNIQUE index. Any row it
 * reports must be de-duplicated on prod first.
 *
 * USAGE
 *   node scripts/preflight-prod-unique-indexes.cjs "<PROD_DATABASE_URL>"
 *   node scripts/preflight-prod-unique-indexes.cjs --self-test
 *
 * Exit 0 = safe to publish. Exit 1 = duplicates found (or connection failure).
 *
 * ── NEGATIVE SPACE (per CLAUDE.md §18d — a guard must state what it does NOT cover) ──
 *   • Covers ONLY the UNIQUE indexes listed in INDEX_MANIFEST below. It does not discover
 *     new ones; when you declare another UNIQUE index in schema.ts, add it here too.
 *   • Does NOT check non-unique indexes (they cannot fail a push), CHECK constraints
 *     (that is preflight-prod-constraints.cjs), NOT NULL, or foreign keys.
 *   • Does NOT check whether the index currently EXISTS on prod — absence is the expected
 *     state (that is the bug being fixed). It checks only that creating it would succeed.
 *   • A table missing from prod entirely is reported as SKIP, not as a pass.
 */

const { Client } = require("pg");

/**
 * Every UNIQUE index declared in shared/schema.ts that was previously created only by a
 * migration. `where` mirrors the partial-index predicate verbatim — it MUST match the
 * declaration, or this check validates a different index than the one being created.
 */
const INDEX_MANIFEST = [
  // ── Legacy `bookings` rail — still live per CLAUDE.md §15c ──
  { name: "bookings_idempotency_key_idx", table: "bookings",
    cols: ["idempotency_key"], where: "idempotency_key IS NOT NULL", migration: "096" },
  { name: "bookings_stripe_payment_intent_id_unique", table: "bookings",
    cols: ["stripe_payment_intent_id"], where: "stripe_payment_intent_id IS NOT NULL", migration: "053" },
  { name: "bookings_expert_slot_unique_idx", table: "bookings",
    cols: ["expert_id", "booking_date", "booking_time"],
    where: "expert_id IS NOT NULL AND booking_date IS NOT NULL AND booking_time IS NOT NULL",
    migration: "099" },

  { name: "affiliate_partners_external_campaign_id_idx", table: "affiliate_partners",
    cols: ["external_campaign_id"], where: "external_campaign_id IS NOT NULL", migration: "103" },
  { name: "idx_service_categories_category_key", table: "service_categories",
    cols: ["category_key"], where: "category_key IS NOT NULL", migration: "032" },
  { name: "idx_expert_neighborhoods_one_lead_per", table: "expert_neighborhoods",
    cols: ["neighborhood_id"], where: "is_lead = true", migration: "041" },
  { name: "idx_guest_travel_plans_invite_unique", table: "guest_travel_plans",
    cols: ["invite_id"], where: null, migration: "001" },
  { name: "idx_rmt_source_trip", table: "ready_made_trips",
    cols: ["source_trip_id"], where: null, migration: "133" },
  { name: "idx_rmp_buyer_trip_active", table: "ready_made_purchases",
    cols: ["buyer_id", "ready_made_trip_id"], where: "status IN ('paid','cloned')", migration: "133" },
];

/**
 * DELIBERATELY NOT DECLARED, and therefore deliberately absent from the manifest above.
 * Recorded here so a future reader does not "complete the set" and break a publish.
 *
 *  • uq_ci_session_content / content_impressions_session_dedup (content_impressions)
 *    Migration 116 creates its index INSIDE a guard that falls back to a NON-unique index
 *    when duplicate (session_id, content_type, content_id) rows already exist. So on such a
 *    database the live object is not unique at all, and declaring it UNIQUE in schema.ts
 *    would make the push try to create one — and fail on exactly the duplicates the
 *    migration was written to tolerate. A conditionally-created object cannot be declared
 *    unconditionally. content_impressions is analytics-only (no money semantics), so the
 *    dedup index is an optimization, not an invariant. Leave both undeclared.
 *
 *  • service_demand_requests_user_uniq — table RETIRED by migration 158.
 */

function buildQuery(idx) {
  const cols = idx.cols.map((c) => `"${c}"`).join(", ");
  const whereClause = idx.where ? `WHERE ${idx.where}` : "";
  return `
    SELECT ${cols}, count(*) AS n
    FROM "${idx.table}"
    ${whereClause}
    GROUP BY ${cols}
    HAVING count(*) > 1
    LIMIT 20;`;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${table}`]);
  return rows[0]?.present === true;
}

async function main() {
  const arg = process.argv[2];

  if (arg === "--self-test") return selfTest();

  if (!arg) {
    console.error("usage: preflight-prod-unique-indexes.cjs \"<PROD_DATABASE_URL>\" | --self-test");
    process.exit(1);
  }

  const client = new Client({ connectionString: arg });
  try {
    await client.connect();
  } catch (err) {
    console.error(`FAIL: could not connect — ${err.message}`);
    process.exit(1);
  }

  let violations = 0, skipped = 0;
  console.log(`Checking ${INDEX_MANIFEST.length} UNIQUE indexes for pre-existing duplicates…\n`);

  for (const idx of INDEX_MANIFEST) {
    if (!(await tableExists(client, idx.table))) {
      console.log(`  SKIP  ${idx.name}\n        table "${idx.table}" not present on this database`);
      skipped++;
      continue;
    }
    let rows;
    try {
      ({ rows } = await client.query(buildQuery(idx)));
    } catch (err) {
      // A missing column is itself a publish risk — surface it rather than passing silently.
      console.log(`  ERROR ${idx.name}\n        ${err.message}`);
      violations++;
      continue;
    }
    if (rows.length === 0) {
      console.log(`  ok    ${idx.name}`);
    } else {
      violations++;
      console.log(`\n  DUPLICATES  ${idx.name}  (migration ${idx.migration}, table ${idx.table})`);
      console.log(`        declaring this index will FAIL the publish until these are resolved:`);
      for (const r of rows) {
        const key = idx.cols.map((c) => `${c}=${JSON.stringify(r[c])}`).join(", ");
        console.log(`          ${key}  ×${r.n}`);
      }
      console.log(`        de-duplicate on prod first, then re-run this check.\n`);
    }
  }

  await client.end();

  console.log("");
  if (violations > 0) {
    console.error(`FAIL: ${violations} index(es) would fail the publish.`);
    console.error("NEVER accept the deploy's \"copy dev database over production\" option.");
    process.exit(1);
  }
  console.log(`PASS: no duplicates${skipped ? ` (${skipped} skipped — table absent)` : ""}. Safe to publish.`);
}

/**
 * --self-test (§18d): proves the query BUILDER is correct without a database. A guard whose
 * predicate is wrong reports PASS forever, so the predicate itself is what gets tested.
 */
function selfTest() {
  const cases = [
    { idx: INDEX_MANIFEST[0],
      must: ['FROM "bookings"', 'WHERE idempotency_key IS NOT NULL', 'GROUP BY "idempotency_key"', "count(*) > 1"],
      mustNot: [] },
    { idx: INDEX_MANIFEST[2],
      must: ['"expert_id", "booking_date", "booking_time"', "booking_time IS NOT NULL"],
      mustNot: [] },
    // A manifest entry with where:null must emit NO WHERE clause — otherwise it would
    // silently check a subset and pass while real duplicates existed.
    { idx: INDEX_MANIFEST.find((i) => i.name === "idx_rmt_source_trip"),
      must: ['FROM "ready_made_trips"'],
      mustNot: ["WHERE"] },
    { idx: INDEX_MANIFEST.find((i) => i.name === "idx_rmp_buyer_trip_active"),
      must: ["WHERE status IN ('paid','cloned')"],
      mustNot: [] },
  ];

  let failed = 0;
  for (const { idx, must, mustNot } of cases) {
    const q = buildQuery(idx);
    for (const m of must) {
      if (!q.includes(m)) { console.error(`SELF-TEST FAIL ${idx.name}: missing ${JSON.stringify(m)}`); failed++; }
    }
    for (const m of mustNot) {
      if (q.includes(m)) { console.error(`SELF-TEST FAIL ${idx.name}: must not contain ${JSON.stringify(m)}`); failed++; }
    }
  }

  // Every manifest entry must name at least one column, or the GROUP BY is malformed.
  for (const idx of INDEX_MANIFEST) {
    if (!Array.isArray(idx.cols) || idx.cols.length === 0) {
      console.error(`SELF-TEST FAIL ${idx.name}: no columns`); failed++;
    }
  }

  if (failed) { console.error(`\n--self-test: ${failed} failure(s).`); process.exit(1); }
  console.log(`--self-test: PASS (${cases.length} query-shape cases, ${INDEX_MANIFEST.length} manifest entries).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
