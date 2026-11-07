/**
 * Development-only measurement. No app/service imports, database URLs, sends, or external DBs.
 * Run: npx tsx scripts/benchmarks/outbox-once-only.ts
 * Requires initdb + pg_ctl on PATH. Owns and destroys a private Unix-socket PostgreSQL cluster.
 * Bulk output: generated-artifacts/outbox-once-only/<unique-run>/measurements.json
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { emailOutbox } from "../../shared/schema";

const sizes = [10_000, 100_000, 1_000_000];
const samples = 100;
const warmups = 5;
const concurrency = 16;
const rounds = 5;
const root = process.cwd();
const source = await readFile("server/services/email-outbox.service.ts", "utf8");
// Fail explicitly if the mirrored transaction has drifted. Never import the sending service.
for (const fragment of [
  'pg_advisory_xact_lock(hashtextextended(${`email-outbox:${dedupeKey}`}, 0))',
  ".select({ id: emailOutbox.id })",
  ".where(sql`${emailOutbox.metadata}->>'dedupeKey' = ${dedupeKey}`)",
  ".limit(1)",
  "if (existing) return { id: existing.id, deliver: false }",
  "tx.insert(emailOutbox).values(values).returning({ id: emailOutbox.id })",
]) assert.ok(source.includes(fragment), `Runtime transaction drift: ${fragment}`);

await mkdir("generated-artifacts/outbox-once-only", { recursive: true });
const runDir = await mkdtemp(path.join(root, "generated-artifacts/outbox-once-only/run-"));
// Unix sockets have a short path limit, so put only the owned socket directory in /tmp.
const socketDir = await mkdtemp("/tmp/outbox-bench-");
const dataDir = path.join(runDir, "pgdata");
const command = (bin: string, args: string[]) =>
  execFileSync(bin, args, { encoding: "utf8", stdio: "pipe" }).trim();
const quantiles = (values: number[]) => {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * .50) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
};
type Timing = { lockMs: number; lookupMs: number; transactionMs: number; id: number; inserted: boolean };
const summary = (rows: Timing[]) => ({
  lock: quantiles(rows.map(r => r.lockMs)),
  lookup: quantiles(rows.map(r => r.lookupMs)),
  transaction: quantiles(rows.map(r => r.transactionMs)),
});
let pool: pg.Pool | undefined;
let started = false;
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  await pool?.end();
  if (started) command("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
  await rm(dataDir, { recursive: true, force: true });
  await rm(socketDir, { recursive: true, force: true });
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
}

try {
  command("initdb", ["-D", dataDir, "-U", "outbox_benchmark", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  command("pg_ctl", [
    "-D", dataDir, "-l", path.join(runDir, "postgres.log"),
    "-o", `-k ${socketDir} -p 55493 -c listen_addresses='' -c max_connections=24`,
    "-w", "start",
  ]);
  started = true;
  // Every connection field is explicit. No environment-derived connection settings are used.
  pool = new pg.Pool({
    host: socketDir, port: 55493, user: "outbox_benchmark", password: "",
    database: "postgres", max: concurrency, application_name: "disposable-outbox-benchmark",
    connectionTimeoutMillis: 10_000, statement_timeout: 120_000,
  });
  pool.on("error", err => { console.error("Owned benchmark database error:", err.message); });
  const db = drizzle(pool);
  const identity = (await pool.query("SELECT current_user, current_database(), inet_server_addr() AS address")).rows[0];
  assert.equal(identity.current_user, "outbox_benchmark");
  assert.equal(identity.current_database, "postgres");
  assert.equal(identity.address, null); // Unix socket, not any remote/project database.
  // Only these unchanged definitions are loaded into this EMPTY, OWNED cluster.
  const ddlFiles = ["server/migrations/240_email_outbox.sql", "server/migrations/411_email_outbox_expires_at.sql"];
  const ddlHashes: Record<string, string> = {};
  for (const file of ddlFiles) {
    const ddl = await readFile(file, "utf8");
    ddlHashes[file] = createHash("sha256").update(ddl).digest("hex");
    await pool.query(ddl);
  }
  const settings = (await pool.query(`
    SELECT name, setting, unit FROM pg_settings WHERE name IN
    ('server_version','shared_buffers','work_mem','effective_cache_size','random_page_cost',
     'seq_page_cost','max_parallel_workers_per_gather','fsync','synchronous_commit',
     'full_page_writes','jit','default_transaction_isolation')
    ORDER BY name
  `)).rows;
  const indexes = (await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='email_outbox' ORDER BY indexname")).rows;
  const report: any = {
    startedAt: new Date().toISOString(), sourceSha256: createHash("sha256").update(source).digest("hex"),
    ddlHashes, identity, postgres: command("postgres", ["--version"]),
    host: { platform: os.platform(), architecture: os.arch(), cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model, memoryBytes: os.totalmem(), node: process.version },
    settings, indexes, configuration: { sizes, samples, warmups, concurrency, rounds },
    percentileMethod: "Nearest rank, ceil(n*p)-1, milliseconds; client performance.now() wall time.",
    scales: [],
  };
  // This is the existing persistence transaction, without gate checks, delivery, or timers.
  async function enqueue(key: string): Promise<Timing> {
    const before = performance.now();
    const result = await db.transaction(async tx => {
      const lockStart = performance.now();
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`email-outbox:${key}`}, 0))`);
      const lockMs = performance.now() - lockStart;
      const lookupStart = performance.now();
      const [existing] = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
        .where(sql`${emailOutbox.metadata}->>'dedupeKey' = ${key}`).limit(1);
      const lookupMs = performance.now() - lookupStart;
      if (existing) return { id: existing.id, inserted: false, lockMs, lookupMs };
      const [inserted] = await tx.insert(emailOutbox).values({
        emailType: "benchmark_only", toEmail: "nobody@example.invalid",
        subject: "Disposable benchmark — never delivered", html: "<p>No send</p>",
        textBody: "No send", status: "processing", attemptCount: 0, maxAttempts: 6,
        retryAfter: new Date(Date.now() + 600_000), expiresAt: null,
        metadata: { dedupeKey: key, synthetic: true },
      }).returning({ id: emailOutbox.id });
      return { id: inserted.id, inserted: true, lockMs, lookupMs };
    });
    return { ...result, transactionMs: performance.now() - before };
  }
  // Establish every connection before measurement: no connection-creation penalty in waves.
  const clients = await Promise.all(Array.from({ length: concurrency }, () => pool!.connect()));
  clients.forEach(c => c.release());
  for (const size of sizes) {
    console.log(`Seeding ${size.toLocaleString()} synthetic rows`);
    await pool.query("TRUNCATE email_outbox RESTART IDENTITY");
    const seedStart = performance.now();
    await pool.query(`
      INSERT INTO email_outbox
        (email_type,to_email,subject,html,text_body,status,metadata,created_at)
      SELECT 'benchmark_only','nobody@example.invalid','Synthetic outbox evidence',
        repeat(md5(g::text),16), repeat(md5((g+1)::text),8),
        (ARRAY['sent','sent','sent','sent','sent','sent','sent','pending','failed','held'])[(g%10)+1],
        jsonb_build_object('dedupeKey','fixture:'||g,'synthetic',true,
                           'bookingId','synthetic-booking-'||g,'context',repeat(md5(g::text),2)),
        timestamptz '2026-01-01' + g * interval '1 second'
      FROM generate_series(1,$1::int) AS s(g)
    `, [size]);
    await pool.query("VACUUM (ANALYZE) email_outbox");
    const scale: any = {
      size, seedMs: performance.now() - seedStart,
      relation: (await pool.query(`SELECT count(*)::int AS rows,
        pg_relation_size('email_outbox') AS heap_bytes,
        pg_total_relation_size('email_outbox') AS total_bytes,
        avg(pg_column_size(email_outbox))::float8 AS average_row_bytes FROM email_outbox`)).rows[0],
      statusDistribution: (await pool.query("SELECT status,count(*)::int AS rows FROM email_outbox GROUP BY status ORDER BY status")).rows,
      lookups: {}, races: {},
    };
    const cases = {
      early: "fixture:1", middle: `fixture:${Math.floor(size / 2)}`,
      late: `fixture:${size}`, absent: `absent:${size}`,
    };
    // Alternate case order per iteration to reduce case-order cache bias.
    const measured: Record<string, Timing[]> = Object.fromEntries(Object.keys(cases).map(k => [k, []]));
    for (let i = -warmups; i < samples; i++) {
      const entries = Object.entries(cases);
      if (i % 2 === 0) entries.reverse();
      for (const [label, key] of entries) {
        // Absent lookup must stay absent: run the lock+lookup in a rollback transaction.
        const before = performance.now();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const lockStart = performance.now();
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`email-outbox:${key}`]);
          const lockMs = performance.now() - lockStart;
          const query = db.select({ id: emailOutbox.id }).from(emailOutbox)
            .where(sql`${emailOutbox.metadata}->>'dedupeKey' = ${key}`).limit(1).toSQL();
          const lookupStart = performance.now();
          const found = await client.query(query.sql, query.params);
          const lookupMs = performance.now() - lookupStart;
          assert.equal(found.rowCount, label === "absent" ? 0 : 1);
          await client.query("ROLLBACK");
          if (i >= 0) measured[label].push({
            lockMs, lookupMs, transactionMs: performance.now() - before,
            id: Number(found.rows[0]?.id ?? 0), inserted: false,
          });
        } finally { client.release(); }
      }
    }
    for (const [label, key] of Object.entries(cases)) {
      const query = db.select({ id: emailOutbox.id }).from(emailOutbox)
        .where(sql`${emailOutbox.metadata}->>'dedupeKey' = ${key}`).limit(1).toSQL();
      scale.lookups[label] = {
        key, sql: query.sql, ...summary(measured[label]), measurements: measured[label],
        plan: (await pool.query(`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${query.sql}`, query.params)).rows[0]["QUERY PLAN"],
      };
    }
    for (const mode of ["fresh", "existing"] as const) {
      const waves = [];
      for (let round = 0; round < rounds; round++) {
        const key = `race:${size}:${mode}:${round}`;
        if (mode === "existing") await enqueue(key); // Outside measured wave.
        let release!: () => void;
        const barrier = new Promise<void>(resolve => { release = resolve; });
        const tasks = Array.from({ length: concurrency }, async () => {
          await barrier;
          return enqueue(key);
        });
        release();
        const results = await Promise.all(tasks);
        const count = Number((await pool.query("SELECT count(*) AS n FROM email_outbox WHERE metadata->>'dedupeKey'=$1", [key])).rows[0].n);
        const inserted = results.filter(r => r.inserted).length;
        const uniqueReturnedIds = new Set(results.map(r => r.id)).size;
        assert.equal(count, 1);
        assert.equal(inserted, mode === "fresh" ? 1 : 0);
        assert.equal(uniqueReturnedIds, 1);
        waves.push({ round, inserted, rowCount: count, duplicates: Math.max(0, count - 1), uniqueReturnedIds, results });
      }
      scale.races[mode] = { ...summary(waves.flatMap(w => w.results)), waves,
        attempts: rounds * concurrency, duplicates: waves.reduce((n, w) => n + w.duplicates, 0), errors: 0 };
    }
    scale.finalRows = Number((await pool.query("SELECT count(*) AS n FROM email_outbox")).rows[0].n);
    assert.equal(scale.finalRows, size + rounds * 2);
    report.scales.push(scale);
    console.log(JSON.stringify({ size, lookups: Object.fromEntries(Object.entries(scale.lookups).map(([k, v]: [string, any]) => [k, v.lookup])),
      races: Object.fromEntries(Object.entries(scale.races).map(([k,v]: [string,any]) => [k, { transaction: v.transaction, duplicates: v.duplicates }])) }));
  }
  report.finishedAt = new Date().toISOString();
  await cleanup();
  report.cleanup = { stopped: true, dataDirectoryRemoved: true, socketDirectoryRemoved: true };
  await writeFile(path.join(runDir, "measurements.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Evidence: ${path.relative(root, path.join(runDir, "measurements.json"))}`);
} finally {
  await cleanup();
}
