// Approved Part 1 QA infrastructure only. Never imported by the application.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

export const manifestPath = "/tmp/automation-part1-open-owner.json";
const q = value => `"${String(value).replaceAll('"', '""')}"`;
const schemaPattern = /^automation_msg_[a-f0-9]{16}$/;
export function loadOwner() {
  if ((fs.statSync(manifestPath).mode & 0o077) !== 0) throw new Error("Private owner manifest required");
  const owner = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!schemaPattern.test(owner.schema) || !/^[a-f0-9]{32}$/.test(owner.fingerprint) ||
      !/^[a-f0-9]{64}$/.test(owner.nonce)) throw new Error("Invalid fixture ownership");
  if (owner.mailPath !== `/tmp/automation-open-mail-${owner.schema}.json`) throw new Error("Capture path outside owner");
  return owner;
}
export function saveOwner(owner) {
  fs.writeFileSync(manifestPath, JSON.stringify(owner, null, 2), { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
}
async function verifiedPool(expected) {
  if (process.env.NODE_ENV === "production" || !/^[a-f0-9]{32}$/.test(expected ?? "")) {
    throw new Error("Independently verified development fingerprint required");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const r = await pool.query("SELECT md5(current_database() || ':' || coalesce(inet_server_addr()::text,'local')) AS fingerprint");
  if (r.rows[0]?.fingerprint !== expected) { await pool.end(); throw new Error("Development target mismatch"); }
  return pool;
}
export async function createOwner() {
  if (fs.existsSync(manifestPath)) throw new Error("Owner already exists; do not replace retained clock fixtures");
  const expected = process.env.MESSAGING_DEV_FINGERPRINT;
  const pool = await verifiedPool(expected);
  const schema = `automation_msg_${crypto.randomBytes(8).toString("hex")}`;
  try {
    // Same catalog/LIKE/FK/owned-sequence isolation used by the retained runner.
    // A separate owner is necessary because that runner unconditionally drops
    // its schema. No public DML, migration or application table is changed.
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const serials = await pool.query(`SELECT c.relname AS t,a.attname AS col FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND a.attidentity='' AND pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%'`);
    const fks = await pool.query(`SELECT src.relname AS t,con.conname AS name,dst.relname AS target,
      dstn.nspname AS target_schema,pg_get_constraintdef(con.oid) AS def FROM pg_constraint con
      JOIN pg_class src ON src.oid=con.conrelid JOIN pg_namespace srcn ON srcn.oid=src.relnamespace
      JOIN pg_class dst ON dst.oid=con.confrelid JOIN pg_namespace dstn ON dstn.oid=dst.relnamespace
      WHERE con.contype='f' AND srcn.nspname='public'`);
    if (!tables.rows.length || fks.rows.some(f => f.target_schema !== "public")) throw new Error("Unsupported template");
    const statements = [`CREATE SCHEMA ${q(schema)}`];
    for (const { tablename } of tables.rows) statements.push(`CREATE TABLE ${q(schema)}.${q(tablename)} (LIKE public.${q(tablename)} INCLUDING ALL)`);
    serials.rows.forEach(({ t, col }, i) => {
      const seq = `qa_seq_${i}`;
      statements.push(`CREATE SEQUENCE ${q(schema)}.${q(seq)}`,
        `ALTER TABLE ${q(schema)}.${q(t)} ALTER COLUMN ${q(col)} SET DEFAULT nextval('${schema}.${seq}'::regclass)`,
        `ALTER SEQUENCE ${q(schema)}.${q(seq)} OWNED BY ${q(schema)}.${q(t)}.${q(col)}`);
    });
    for (const f of fks.rows) {
      const def = f.def.replace(/REFERENCES\s+(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*))?/,
        `REFERENCES ${q(schema)}.${q(f.target)}`);
      if (def === f.def) throw new Error("Unsupported FK");
      statements.push(`ALTER TABLE ${q(schema)}.${q(f.t)} ADD CONSTRAINT ${q(f.name)} ${def}`);
    }
    await pool.query("BEGIN");
    try { await pool.query(statements.join(";\n")); await pool.query("COMMIT"); }
    catch (error) { await pool.query("ROLLBACK"); throw error; }
    const seq = await pool.query("SELECT pg_get_serial_sequence($1,'id') AS name", [`${schema}.email_outbox`]);
    if (!seq.rows[0]?.name?.startsWith(`${schema}.`)) throw new Error("Outbox sequence ownership missing");
    await pool.query("SELECT setval($1::regclass,$2,false)", [seq.rows[0].name, crypto.randomInt(1_000_000_000, 2_000_000_000)]);
    const accounts = {};
    for (const loop of [1, 2]) {
      accounts[loop] = {};
      for (const kind of ["itinerary_ready", "itinerary_failed", "itinerary_nudge_2h", "itinerary_followup_24h",
        "itinerary_reengagement_5d", "verification", "password_reset", "wrong", "browser_signup"]) {
        accounts[loop][kind] = { email: `${crypto.randomUUID()}@traveloure-qa.test`,
          password: `Qa-${crypto.randomBytes(18).toString("base64url")}`, firstName: `QA ${loop} ${kind}`,
          lastName: "Automation Only", kind, loop };
      }
    }
    const now = new Date();
    const owner = { schema, fingerprint: expected, nonce: crypto.randomBytes(32).toString("hex"),
      createdAt: now.toISOString(), cleanupDue: new Date(+now + 7 * 86400000).toISOString(),
      mailPath: `/tmp/automation-open-mail-${schema}.json`,
      accounts, port: 5001, preparedLoops: [], clocks: [] };
    saveOwner(owner);
    console.log(JSON.stringify({ retainedSchema: schema, createdAt: owner.createdAt, cleanupDue: owner.cleanupDue,
      fixtureTables: tables.rows.length, publicDml: 0, automaticSchedulerAdded: false }));
  } finally { await pool.end(); }
}
export function childEnvironment(owner) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key) && !["RESEND_API_KEY"].includes(key)) delete env[key];
    if ((/DATABASE.*URL/i.test(key) && key !== "DATABASE_URL") ||
      /^PG(HOST|USER|PORT|DATABASE|PASSWORD)$/.test(key)) delete env[key];
  }
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${owner.schema}`);
  env.DATABASE_URL = url.href;
  Object.assign(env, { NODE_ENV: "test", ENVIRONMENT: "TEST", MESSAGING_VERIFICATION_SCHEMA: owner.schema,
    JOURNEY_DB_WRITES_OK: "1", REPL_ID: "", PORT: String(owner.port), APP_BASE_URL: `http://127.0.0.1:${owner.port}`,
    SESSION_SECRET: crypto.randomBytes(32).toString("hex"), STRIPE_SECRET_KEY: "sk_test_qa_network_forbidden",
    STRIPE_SECRET_KEY_TEST: "sk_test_qa_network_forbidden", AUTOMATION_OPEN_OWNER: manifestPath });
  return env;
}
export async function startBrowser(entry = "scripts/verification/automation-open-browser.ts") {
  const owner = loadOwner(), pool = await verifiedPool(owner.fingerprint);
  try {
    const r = await pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [owner.schema]);
    if (r.rowCount !== 1 || Date.now() > Date.parse(owner.cleanupDue)) throw new Error("Fixture expired or absent");
  } finally { await pool.end(); }
  const child = spawn(process.execPath, ["--require", "./scripts/verification/messaging-schema-preload.cjs",
    "node_modules/tsx/dist/cli.mjs", entry],
    { env: childEnvironment(owner), stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.once("exit", code => { process.exitCode = code ?? 1; });
}
export async function cleanupOwner() {
  const owner = loadOwner();
  if (Date.now() < Date.parse(owner.cleanupDue)) throw new Error("Retained real-clock scenarios are not due for cleanup");
  const pool = await verifiedPool(owner.fingerprint);
  try {
    const outside = await pool.query(`SELECT 1 FROM pg_constraint c
      JOIN pg_class target ON target.oid=c.confrelid JOIN pg_namespace n ON n.oid=target.relnamespace
      WHERE n.nspname=$1 AND c.connamespace<>n.oid LIMIT 1`, [owner.schema]);
    if (outside.rowCount) throw new Error("External constraint depends on QA schema; refuse cleanup");
    await pool.query(`DROP SCHEMA IF EXISTS ${q(owner.schema)} CASCADE`);
  } finally { await pool.end(); }
  for (const path of [manifestPath, owner.mailPath, `/tmp/automation-clock-mail-${owner.schema}.jsonl`]) {
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }
  console.log(JSON.stringify({ cleaned: owner.schema, publicDataChanged: false }));
}
if (process.argv[1]?.endsWith("automation-open-fixtures.mjs")) {
  const mode = process.argv[2];
  (mode === "create" ? createOwner() : mode === "serve" ? startBrowser() :
    mode === "check-clocks" ? startBrowser("scripts/verification/automation-open-clock-check.ts") :
    mode === "cleanup" ? cleanupOwner() :
    Promise.reject(new Error("Use create or serve; cleanup is explicit after due checks"))).catch(error => {
      console.error(error.message); process.exitCode = 1;
    });
}
