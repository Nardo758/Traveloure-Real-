/**
 * Run messaging tests with an explicit provider-free environment. DB suites use
 * an empty, constraint-preserving schema clone, never the shared public dataset.
 * No data, sequences, timers, production credentials or real transports copied.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";

const args = process.argv.slice(2);
const dbMode = args.includes("--isolated-db");
const httpHarness = args.includes("--http-harness");
const testFiles = args.filter((arg) => arg !== "--isolated-db" && arg !== "--http-harness");
if (httpHarness && !dbMode) {
  throw new Error("--http-harness requires --isolated-db");
}
if (!testFiles.length || testFiles.some((file) => !/^server\/.*\.test\.ts$/.test(file) || !fs.existsSync(file))) {
  throw new Error("Supply explicit existing server test files");
}
const env = {};
for (const key of [
  "PATH", "HOME", "XDG_CONFIG_HOME", "NIX_CFLAGS_COMPILE", "NIX_LDFLAGS",
  "NIX_PATH", "NIXPKGS_ALLOW_UNFREE",
]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
Object.assign(env, {
  NODE_ENV: "test", ENVIRONMENT: "TEST",
  STRIPE_SECRET_KEY: "sk_test_automation_messaging_verification_only",
  SESSION_SECRET: "synthetic-messaging-verification-session-secret",
  SESSION_COOKIE_INSECURE: "1", E2E_AI_STUB: "1",
  DATABASE_URL: "postgresql://skip:skip@127.0.0.1:1/skip",
});
const q = (name) => `"${name.replaceAll('"', '""')}"`;
const schema = `automation_msg_${crypto.randomBytes(8).toString("hex")}`;
let pool;
let schemaCreated = false;
let child;
let harness;
let interrupted = false;
const signalProcessGroup = (proc, signal) => {
  if (proc?.pid) {
    try { process.kill(-proc.pid, signal); } catch { /* process group already exited */ }
  }
};
const stopProcessGroup = async (proc) => {
  if (!proc?.pid) return;
  signalProcessGroup(proc, "SIGTERM");
  if (proc.exitCode === null) {
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(deadline);
        proc.removeListener("exit", done);
        resolve();
      };
      const deadline = setTimeout(done, 5_000);
      proc.once("exit", done);
    });
  }
  // Also signal the group if its leader exited while a descendant remained alive.
  signalProcessGroup(proc, "SIGKILL");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(-proc.pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
  }
  throw new Error(`Verification child process group ${proc.pid} did not stop; refusing schema cleanup`);
};
const onSignal = () => {
  interrupted = true;
  signalProcessGroup(child, "SIGTERM");
  signalProcessGroup(harness, "SIGTERM");
};
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

function startHttpHarness() {
  const harnessArgs = [];
  harnessArgs.push("--require", path.resolve("scripts/verification/messaging-schema-preload.cjs"));
  harnessArgs.push(
    "node_modules/tsx/dist/cli.mjs",
    "server/__tests__/fixtures/verification-gate-harness.ts",
  );
  const spawned = spawn(process.execPath, harnessArgs, {
    env: { ...env, VERIFICATION_HARNESS_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  harness = spawned;

  return new Promise((resolve, reject) => {
    let pending = "";
    let settled = false;
    const deadline = setTimeout(() => {
      finish(new Error("Verification HTTP harness did not become ready within 120 seconds"));
    }, 120_000);
    const finish = (error, port) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(port);
    };
    spawned.stdout.setEncoding("utf8");
    spawned.stdout.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        console.log(line);
        const match = line.match(/^VERIFICATION_HARNESS_READY_PORT=(\d+)$/);
        if (match) {
          const port = Number(match[1]);
          if (port > 0 && port <= 65535) finish(null, port);
        }
      }
    });
    spawned.stdout.on("end", () => {
      if (pending) console.log(pending);
    });
    spawned.stderr.setEncoding("utf8");
    spawned.stderr.on("data", (chunk) => process.stderr.write(chunk));
    spawned.once("error", (error) => finish(error));
    spawned.once("exit", (code, signal) => {
      if (!settled) {
        finish(new Error(`Verification HTTP harness exited before readiness (code=${code}, signal=${signal})`));
      }
    });
  });
}

try {
  if (dbMode) {
    const expected = process.env.MESSAGING_DEV_FINGERPRINT;
    if (!/^[a-f0-9]{32}$/.test(expected || "") || !process.env.DATABASE_URL) {
      throw new Error("Independently verify the development database fingerprint before opting in");
    }
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const identity = await pool.query(
      "SELECT md5(current_database() || ':' || coalesce(inet_server_addr()::text, 'local')) AS fingerprint",
    );
    if (identity.rows[0]?.fingerprint !== expected) {
      throw new Error("Refusing fixture DDL: database is not the independently verified development target");
    }
    console.log("DEVELOPMENT_TARGET_MATCH=true");
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const serials = await pool.query(`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND a.attidentity=''
      AND pg_get_expr(d.adbin,d.adrelid) LIKE 'nextval(%'
      ORDER BY c.relname,a.attname
    `);
    const foreignKeys = await pool.query(`
      SELECT src.relname AS table_name, con.conname AS name,
        dst.relname AS target_name, dstn.nspname AS target_schema,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class src ON src.oid=con.conrelid
      JOIN pg_namespace srcn ON srcn.oid=src.relnamespace
      JOIN pg_class dst ON dst.oid=con.confrelid
      JOIN pg_namespace dstn ON dstn.oid=dst.relnamespace
      WHERE con.contype='f' AND srcn.nspname='public'
    `);
    if (!tables.rows.length || foreignKeys.rows.some((fk) => fk.target_schema !== "public")) {
      throw new Error("Refusing unsupported or empty fixture schema");
    }
    const statements = [`CREATE SCHEMA ${q(schema)}`];
    for (const { tablename } of tables.rows) {
      statements.push(`CREATE TABLE ${q(schema)}.${q(tablename)} (LIKE public.${q(tablename)} INCLUDING ALL)`);
    }
    // LIKE copies serial defaults by reference; replace every reference so no
    // public sequence is advanced. Identity columns already get their own sequence.
    serials.rows.forEach(({ table_name, column_name }, i) => {
      const seq = `msg_seq_${i}`;
      statements.push(`CREATE SEQUENCE ${q(schema)}.${q(seq)}`);
      statements.push(`ALTER TABLE ${q(schema)}.${q(table_name)} ALTER COLUMN ${q(column_name)}
        SET DEFAULT nextval('${schema}.${seq}'::regclass)`);
      statements.push(`ALTER SEQUENCE ${q(schema)}.${q(seq)} OWNED BY ${q(schema)}.${q(table_name)}.${q(column_name)}`);
    });
    for (const fk of foreignKeys.rows) {
      // LIKE intentionally does not copy FKs; restore them to the cloned tables.
      const definition = fk.definition.replace(
        /REFERENCES\s+(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*))?/,
        `REFERENCES ${q(schema)}.${q(fk.target_name)}`,
      );
      if (definition === fk.definition) throw new Error("Unsupported foreign-key syntax");
      statements.push(`ALTER TABLE ${q(schema)}.${q(fk.table_name)} ADD CONSTRAINT ${q(fk.name)} ${definition}`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(statements.join(";\n"));
      await client.query("COMMIT");
      schemaCreated = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const isolatedUrl = new URL(process.env.DATABASE_URL);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    isolatedUrl.searchParams.set("application_name", "automation-messaging-verification");
    env.DATABASE_URL = isolatedUrl.href;
    env.MESSAGING_VERIFICATION_SCHEMA = schema;
    env.JOURNEY_DB_WRITES_OK = "1";
    const isolatedPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
    try {
      const scope = await isolatedPool.query("SELECT current_schema() AS name");
      if (scope.rows[0]?.name !== schema) throw new Error("Fixture search path did not take effect");
    } finally {
      await isolatedPool.end();
    }
    console.log(`ISOLATED_EMPTY_SCHEMA_READY=true tables=${tables.rows.length} foreignKeys=${foreignKeys.rows.length}`);
  }
  if (interrupted) throw new Error("Verification interrupted before tests started");

  if (httpHarness) {
    if (interrupted) throw new Error("Verification interrupted before HTTP harness startup");
    const port = await startHttpHarness();
    const baseUrl = `http://127.0.0.1:${port}`;
    // The selected HTTP suites must never fall back to the preview/default :5000 target.
    env.JOURNEY_BASE_URL = baseUrl;
    console.log(`ISOLATED_HTTP_HARNESS_READY=true address=${baseUrl}`);
  }
  if (interrupted) throw new Error("Verification interrupted before tests started");

  const nodeArgs = [];
  if (dbMode) nodeArgs.push("--require", path.resolve("scripts/verification/messaging-schema-preload.cjs"));
  nodeArgs.push(
    "node_modules/tsx/dist/cli.mjs", "--test", "--test-force-exit", "--test-concurrency=1", ...testFiles,
  );
  console.log("PROVIDER_FREE_ALLOWLIST=true");
  const exitCode = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, nodeArgs, { env, stdio: "inherit", detached: true });
    let escalation;
    const deadline = setTimeout(() => {
      console.error("Verification exceeded its three-minute test budget");
      signalProcessGroup(child, "SIGTERM");
      escalation = setTimeout(() => signalProcessGroup(child, "SIGKILL"), 5_000);
    }, 180_000);
    child.once("error", (error) => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(deadline);
      clearTimeout(escalation);
      resolve(interrupted ? 1 : code ?? 1);
    });
  });
  process.exitCode = exitCode;
} finally {
  await stopProcessGroup(child);
  // Stop the fixture HTTP server before dropping its schema, even after test/startup failure.
  await stopProcessGroup(harness);
  if (schemaCreated) {
    await pool.query(`DROP SCHEMA ${q(schema)} CASCADE`);
    const remaining = await pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
    if (remaining.rowCount !== 0) throw new Error("Fixture schema cleanup did not complete");
    console.log("ISOLATED_SCHEMA_REMOVED=true");
  }
  if (pool) await pool.end();
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
}