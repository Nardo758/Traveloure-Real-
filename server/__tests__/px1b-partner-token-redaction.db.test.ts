/**
 * PX-1b — no request URL carrying a configured token value is ever logged or persisted
 * (ledger `2026-10-18-partner-token-redaction`; decision-maker, Oct 18, 2026: the eight request-side
 * integrations keep their partner-required auth; logs and stored rows never carry the token).
 *
 *   L1 the token parameter names are masked by name (token, api_key, affiliate_id, …)
 *   L2 a configured secret's VALUE is masked wherever it appears in text
 *   L3 pino: a log call carrying a token URL emits no secret (the logger's own hooks)
 *   L4 console: with the boot redaction installed, a logged URL, Error or object emits no secret
 *   L5 every partner search builder, its fetch failing with the full request URL in the error (and
 *      answering 500 with the URL echoed), logs nothing carrying a secret
 *   L6 the API-usage writer stores no secret in `error_message` or `metadata`
 *
 * Secret env names are read from the source and set to random values AT TEST TIME — never literals.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/px1b-partner-token-redaction.db.test.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";

const ROOT = process.cwd();
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|API_KEY|_KEY)$/;
function serverFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...serverFiles(p));
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const SECRET_ENV_NAMES = Array.from(
  new Set(
    serverFiles(path.join(ROOT, "server")).flatMap((f) =>
      Array.from(fs.readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)).map((m) => m[1] ?? m[2]),
    ),
  ),
).filter((n) => SECRET_NAME.test(n));
for (const name of SECRET_ENV_NAMES) process.env[name] = `px1b-${crypto.randomUUID()}`;
const secrets = () => SECRET_ENV_NAMES.map((n) => process.env[n]!);
const TOKEN = () => process.env.TRAVELPAYOUTS_TOKEN!;

import { test, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[px1b] REFUSING to write fixtures to '${host}'.`);
}

const { redactUrlForLog, redactSecretsInText, loggerHooks, installConsoleRedaction } = await import("../infrastructure/logger");
const { db, pool } = await import("../db");
const RUN = crypto.randomUUID().slice(0, 8);

after(async () => {
  try {
    await db.execute(sql`DELETE FROM api_usage_logs WHERE provider = ${`px1b-${RUN}`}`);
  } finally {
    await pool.end();
  }
});

const noSecret = (text: string, where: string) => {
  for (const v of secrets()) assert.ok(!text.includes(v), `${where} carries a configured secret`);
};

test("L1 the token parameter names are masked by name", () => {
  const u = `https://partner.example/api?token=a1&api_key=b2&affiliate_id=c3&apikey=d4&marker=405110&q=kyoto`;
  assert.equal(
    redactUrlForLog(u),
    "https://partner.example/api?token=[REDACTED]&api_key=[REDACTED]&affiliate_id=[REDACTED]&apikey=[REDACTED]&marker=405110&q=kyoto",
  );
  assert.equal(redactSecretsInText(`GET ${u} failed`).includes("token=[REDACTED]"), true);
  assert.equal(redactSecretsInText(`GET ${u} failed`).includes("marker=405110"), true, "a public marker is kept");
});

test("L2 a configured secret's value is masked anywhere in text", () => {
  const text = `upstream said: bad credential ${TOKEN()} (sent as ref=${TOKEN()})`;
  const out = redactSecretsInText(text);
  noSecret(out, "redacted text");
  assert.match(out, /\[REDACTED\]/);
});

test("L3 pino emits no secret for a log call carrying a token URL", () => {
  const lines: string[] = [];
  const sink = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); } });
  const log = pino({ hooks: loggerHooks }, sink);
  const url = `https://www.travelpayouts.com/x.json?token=${TOKEN()}`;
  log.warn(`fetch ${url} failed`);
  log.error(new Error(`request to ${url} failed`), "partner search failed");
  log.info({ url, note: `key ${TOKEN()}` }, "context");
  assert.ok(lines.length >= 3);
  noSecret(lines.join("\n"), "pino output");
  const src = fs.readFileSync(path.join(ROOT, "server/infrastructure/logger.ts"), "utf8");
  assert.match(src, /export const logger = pino\(\{[\s\S]*?hooks: loggerHooks/, "the app logger uses the hooks");
});

// Console capture: the redaction wraps whatever console methods exist, so the capture sits UNDER it.
const captured: string[] = [];
const fake = {} as Console;
for (const m of ["log", "info", "warn", "error", "debug"] as const) {
  (fake as any)[m] = (...args: unknown[]) =>
    captured.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
}
installConsoleRedaction(fake);

test("L4 console, with the boot redaction, emits no secret for a URL, an Error or an object", () => {
  const url = `https://api.kiwitaxi.com/v1/x?api_key=${TOKEN()}`;
  fake.warn("[Kiwitaxi] failed", url);
  fake.error(new Error(`request to ${url} failed`));
  fake.log({ url });
  noSecret(captured.join("\n"), "console output");
  const boot = fs.readFileSync(path.join(ROOT, "server/index.ts"), "utf8");
  assert.match(boot, /installConsoleRedaction\(\);/, "installed at boot");
});

test("L5 every partner builder, failing with the request URL in its error, logs no secret", async () => {
  const realFetch = globalThis.fetch;
  const realConsole = { ...console };
  for (const m of ["log", "info", "warn", "error", "debug"] as const) (console as any)[m] = (fake as any)[m];
  captured.length = 0;
  const dir = path.join(ROOT, "server/services/travelpayouts");
  let ran = 0;
  try {
    for (const mode of ["throw", "500"] as const) {
      globalThis.fetch = (async (input: any) => {
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        if (mode === "throw") throw new Error(`request to ${url} failed, reason: connect ECONNREFUSED`);
        return new Response(`bad request: ${url}`, { status: 500 });
      }) as any;
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".service.ts"))) {
        const mod = await import(path.join(dir, f));
        for (const [name, fn] of Object.entries(mod)) {
          if (typeof fn !== "function" || !/^search/.test(name)) continue;
          ran++;
          await (fn as any)({ destination: "Kyoto", city: "Kyoto", origin: "KIX", from: "KIX", to: "Kyoto", pickupLocation: "Kyoto", country: "JP", limit: 3 }).catch(() => {});
        }
      }
    }
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(console, realConsole);
  }
  assert.ok(ran >= 30, `the builders ran twice each (${ran})`);
  noSecret(captured.join("\n"), "partner failure logs");
});

test("L6 the API-usage writer stores no secret in error_message or metadata", async () => {
  const { apiUsageService } = await import("../services/api-usage.service");
  const url = `https://api.discovercars.com/api/v1/search?affiliate_id=${TOKEN()}`;
  await apiUsageService.logApiCall({
    provider: `px1b-${RUN}`,
    endpoint: "search",
    operation: "search",
    estimatedCostCents: 0,
    success: false,
    errorMessage: `request to ${url} failed`,
    metadata: { url, nested: { echo: `ref=${TOKEN()}` }, list: [url] },
  } as any);
  const rows = (await db.execute(sql`SELECT error_message, metadata FROM api_usage_logs WHERE provider = ${`px1b-${RUN}`}`)).rows as any[];
  assert.equal(rows.length, 1);
  noSecret(`${rows[0].error_message} ${JSON.stringify(rows[0].metadata)}`, "stored api_usage_logs row");
});
