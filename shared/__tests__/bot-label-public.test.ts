/**
 * Slice 0 (Addendum A v2) — no bot or AI label in any public payload.
 *
 * "proposed by {bot}" is an ADMIN-ONLY fact. This pins where a bot's identity may be read at all: the bot tables,
 * the bot/admin services and routes, and the admin console page. A public route or traveler page that starts to read
 * a bot name, `proposedBy`, `bot_accounts` or `bot_audit_logs` fails here before it can publish one.
 *
 * Stated negative space (§18d): this is a SOURCE scan for the identifiers that carry a bot's identity. It cannot see
 * a bot name copied into some other column and served from there; nothing on main writes one (an approved bot fact's
 * `verified_by` is the approving admin, LD 57 BOT-1), and a writer that did would be the defect to catch in review.
 *
 * Run: npx tsx --test shared/__tests__/bot-label-public.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const BOT_IDENTITY = /\b(proposedBy|botName|botAccounts|botAuditLogs|bot_accounts|bot_audit_logs)\b/;

/** Every file that may read a bot's identity, and why. Nothing public is on this list. */
const ALLOWED: Record<string, string> = {
  "shared/schema.ts": "declares the bot tables",
  "server/migrations/migration-files.ts": "registers the migrations that create them",
  "server/services/bot-proposals.service.ts": "the bot key and proposal service; its review list is read by /api/admin only",
  "server/services/bot-audit.service.ts": "the bot audit writer and the /api/admin/bot-audit read",
  "server/services/issue-queue.service.ts": "the admin issue queue; botQueueProjection drops the name for the Ops Bot",
  "server/routes/bot.routes.ts": "the token-authed /api/bot surface (its own bot, never another's name)",
  "server/routes/bot-admin.routes.ts": "/api/admin/bot-* behind the blanket admin guard",
  "server/routes/internal.routes.ts": "the internal retention job that prunes bot audit rows",
  "client/src/pages/admin/bot-proposals.tsx": "the admin console page",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

test("a bot's identity is read only by the bot tables, the bot/admin services and routes, and the admin console", () => {
  const offenders: string[] = [];
  for (const file of [...walk("server"), ...walk("shared"), ...walk("client/src")]) {
    if (!BOT_IDENTITY.test(read(file))) continue;
    if (!(file in ALLOWED)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `bot identity read outside the admin/bot surfaces: ${offenders.join(", ")}`);
});

test("the only client page that reads a bot's identity is under the admin console", () => {
  for (const file of Object.keys(ALLOWED).filter((f) => f.startsWith("client/"))) {
    assert.match(file, /^client\/src\/(pages|components)\/admin\//, file);
  }
});

test("the Ops Bot's queue read carries kinds, ids, markets and ages only", () => {
  const svc = read("server/services/issue-queue.service.ts");
  assert.match(
    svc,
    /export function botQueueProjection[\s\S]*?items\.map\(\(\{ kind, id, market, since \}\) => \(\{ kind, id, market, since \}\)\)/,
  );
  const bot = read("server/routes/bot.routes.ts");
  const at = bot.indexOf('router.get("/api/bot/queue"');
  assert.ok(at > -1, "the queue route exists");
  assert.match(bot.slice(at, at + 600), /botQueueProjection\(/);
});

test("the allowlist names only files that exist", () => {
  for (const file of Object.keys(ALLOWED)) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});
