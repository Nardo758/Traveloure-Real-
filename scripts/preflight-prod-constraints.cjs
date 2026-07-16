#!/usr/bin/env node
/**
 * preflight-prod-constraints.cjs — publish-safety check for enum/CHECK columns.
 *
 * WHY THIS EXISTS
 * ---------------
 * Replit's Autoscale deploy runs an automatic schema-push (drizzle-kit) at publish
 * that enforces the CHECK constraints declared in shared/schema.ts — but it does NOT
 * run our SQL migrations' value-remap steps first. So when a migration adds a CHECK
 * over a column that still holds legacy values on production, the push fails mid-deploy
 * with "check constraint ... is violated by some row" and offers the DESTRUCTIVE
 * "copy dev database over production" option.
 *
 * The app's own runMigrations() (server/index.ts) remaps correctly — but it runs at
 * server startup, AFTER the deploy push has already failed. This script closes that
 * gap: run it against production BEFORE you publish. It finds every row that will
 * violate a declared CHECK and prints the exact remap to apply first. No writes.
 *
 * USAGE
 * -----
 *   node scripts/preflight-prod-constraints.cjs "<PROD_DATABASE_URL>"
 *   # or: PREFLIGHT_DATABASE_URL=... node scripts/preflight-prod-constraints.cjs
 *   # falls back to $DATABASE_URL if neither is given (careful: that's usually dev).
 *
 * Exit 0 = clean, safe to publish. Exit 1 = violations found (report + remap printed).
 *
 * MAINTENANCE
 * -----------
 * When a NEW migration adds a CHECK over an enum-like column, add an entry to
 * CONSTRAINT_MANIFEST below: the allowed values, and a `remap` of known legacy→canonical
 * values. A violating value NOT in `remap` is reported as UNMAPPED — decide it by hand
 * (mirrors migration 109's "refuse to half-apply an unmapped value" discipline).
 */

const { Client } = require("pg");

// ── Constraint manifest — every enum/CHECK column the migrations enforce ────────
// allowed:    values the DB CHECK permits (NULL is allowed separately via nullable).
// nullable:   true → NULL passes the CHECK (do not flag NULL rows).
// remap:      known legacy value → canonical replacement (the migration's own mapping).
// fallback:   value to suggest for any violating value NOT in `remap` (money/safety-
//             conservative default). null = no auto-suggestion; force manual decision.
const CONSTRAINT_MANIFEST = [
  {
    table: "expert_earnings", column: "status", nullable: false,
    allowed: ["held", "releasable", "paid_out", "reversed"],
    remap: { pending: "held", available: "held", confirmed: "held", processing: "held" },
    fallback: "held", // escrow-safe: unknown status stays held, never auto-released
    note: "available+past available_at could be 'releasable' — verify by hand before mass-holding payable rows",
  },
  {
    table: "provider_earnings", column: "status", nullable: false,
    allowed: ["held", "releasable", "paid_out", "reversed"],
    remap: { pending: "held", available: "held", confirmed: "held", processing: "held" },
    fallback: "held",
    note: "same as expert_earnings",
  },
  {
    table: "service_templates", column: "delivery_method", nullable: true,
    allowed: ["pdf", "video", "call", "in_person", "voice_notes", "async_messaging", "hybrid"],
    remap: { document: "pdf", digital: "pdf", "video-call": "video", "in-person": "in_person" },
    fallback: null, // content field — never guess-map an unknown value
    note: "migration 109 canonical delivery set",
  },
  {
    table: "provider_services", column: "delivery_method", nullable: true,
    allowed: ["pdf", "video", "call", "in_person", "voice_notes", "async_messaging", "hybrid"],
    remap: { document: "pdf", digital: "pdf", "video-call": "video", "in-person": "in_person" },
    fallback: null,
    note: "migration 109 canonical delivery set",
  },
  {
    table: "expert_templates", column: "approval_status", nullable: true,
    allowed: ["draft", "submitted", "approved", "rejected"],
    remap: { pending: "submitted", published: "approved" },
    fallback: null,
    note: "migration 110 approval lifecycle",
  },
  {
    table: "template_purchases", column: "status", nullable: true,
    allowed: ["pending_payment", "completed", "refunded"],
    remap: { pending: "pending_payment", paid: "completed", complete: "completed" },
    fallback: null,
    note: "migration 110 purchase state machine",
  },
];

const url = process.argv[2] || process.env.PREFLIGHT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ No database URL. Pass it as arg 1, or set PREFLIGHT_DATABASE_URL / DATABASE_URL.");
  process.exit(2);
}

// SQL-literal escape for building the readable remap suggestions.
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function tableExists(client, table) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
    [table],
  );
  return rows.length > 0;
}
async function columnExists(client, table, column) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
    [table, column],
  );
  return rows.length > 0;
}

(async () => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();

  // Identity banner — so you never run this against the wrong DB by accident.
  const who = await client.query("SELECT current_database() AS db, inet_server_addr() AS host");
  console.log(`\n── preflight: constraint violations before publish ──`);
  console.log(`   database: ${who.rows[0].db}  host: ${who.rows[0].host ?? "(local)"}\n`);

  let violationTotal = 0;
  const remapPlan = [];
  const manualReview = [];

  for (const c of CONSTRAINT_MANIFEST) {
    if (!(await tableExists(client, c.table)) || !(await columnExists(client, c.table, c.column))) {
      console.log(`   ⊘ ${c.table}.${c.column} — table/column absent, skipped`);
      continue;
    }
    // Values present that the CHECK would reject (NULL handled per `nullable`).
    const nullClause = c.nullable ? `${c.column} IS NOT NULL AND` : "";
    const allowedList = c.allowed.map(lit).join(",");
    const { rows } = await client.query(
      `SELECT ${c.column} AS val, count(*)::int AS n
         FROM ${c.table}
        WHERE ${nullClause} (${c.column} IS NULL OR ${c.column} NOT IN (${allowedList}))
        GROUP BY ${c.column} ORDER BY ${c.column}`,
    );
    // A NULL row only violates a NOT NULL (non-nullable) constraint column.
    const violators = rows.filter((r) => r.val !== null || !c.nullable);
    if (violators.length === 0) {
      console.log(`   ✅ ${c.table}.${c.column}`);
      continue;
    }
    console.log(`   ❌ ${c.table}.${c.column} — ${violators.reduce((s, r) => s + r.n, 0)} row(s):`);
    for (const r of violators) {
      const shown = r.val === null ? "NULL" : `'${r.val}'`;
      violationTotal += r.n;
      const target = r.val === null ? c.fallback : (c.remap[r.val] ?? c.fallback);
      if (target) {
        console.log(`        ${shown} × ${r.n}  →  ${target}`);
        remapPlan.push(
          `UPDATE ${c.table} SET ${c.column}=${lit(target)} WHERE ${r.val === null ? `${c.column} IS NULL` : `${c.column}=${lit(r.val)}`};  -- ${c.table}: ${r.n} row(s)`,
        );
      } else {
        console.log(`        ${shown} × ${r.n}  →  ⚠ UNMAPPED — decide by hand (${c.note})`);
        manualReview.push(`   ${c.table}.${c.column} = ${shown} (${r.n}) — allowed: ${c.allowed.join(", ")}`);
      }
    }
  }

  await client.end();

  console.log("");
  if (violationTotal === 0) {
    console.log("✅ CLEAN — no constraint violations. Safe to publish.\n");
    process.exit(0);
  }

  console.log(`⚠ ${violationTotal} violating row(s) will fail the deploy schema-push.\n`);
  if (remapPlan.length) {
    console.log("── Suggested remap (review, then run against production BEFORE publishing) ──");
    console.log(remapPlan.join("\n"));
    console.log("");
  }
  if (manualReview.length) {
    console.log("── UNMAPPED values — no safe auto-remap; decide each by hand ──");
    console.log(manualReview.join("\n"));
    console.log("");
  }
  process.exit(1);
})().catch((err) => {
  console.error("✗ preflight failed:", err.message);
  process.exit(2);
});
