/**
 * Row 101 email-change audit. No signed-in route other than
 * POST /api/auth/change-unverified-email writes a chosen users.email.
 * PATCH /api/profile drops an email key. The route stays open while sends are on.
 *
 * Source half: every production users-email write is one of the known sites
 * (verification change, account-delete anonymize, admin-delete anonymize,
 * OIDC login upsert, Facebook login upsert). HTTP half mounts the auth routes
 * on a disposable database. No payout handle is written.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit \
 *   server/__tests__/verified-email-change-paths.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import passport from "passport";

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const priorResend = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";
process.env.RATE_LIMIT_LOOPBACK_SKIP ??= "1";

const { db, pool } = await import("../db");
const { eq } = await import("drizzle-orm");
const { users, emailVerificationTokens } = await import("../../shared/models/auth");
const { emailOutbox } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { registerAuthRoutes } = await import("../replit_integrations/auth/routes");
const { VERIFICATION_EMAIL_CHANGE_MESSAGE, emailVerificationDeniedBody } = await import("../../shared/email-verification-gate");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

/** A column key `email`, not notificationEmail / emailVerified / requesterEmail. */
const EMAIL_KEY = /(?<![A-Za-z0-9_])email\s*:/;

const ALLOWED_WRITERS = new Set([
  "server/services/email-verification.service.ts",
  "server/replit_integrations/auth/routes.ts",
  "server/routes/admin.routes.ts",
  "server/replit_integrations/auth/replitAuth.ts",
  "server/replit_integrations/auth/facebookAuth.ts",
]);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name === "seeds") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

function balancedArg(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1, openParen + 800);
}

function callArgs(src: string, name: string): string[] {
  const out: string[] = [];
  const needle = `${name}(`;
  let from = 0;
  while (from < src.length) {
    const at = src.indexOf(needle, from);
    if (at === -1) break;
    out.push(balancedArg(src, at + name.length));
    from = at + needle.length;
  }
  return out;
}

/** The `.set(...)` argument of each `db.update(users)` / `tx.update(users)`. */
function updateSetArgs(src: string): string[] {
  const out: string[] = [];
  const re = /\.update\(users\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const window = src.slice(match.index, match.index + 2500);
    const setAt = window.indexOf(".set(");
    if (setAt === -1) continue;
    out.push(balancedArg(src, match.index + setAt + ".set".length));
  }
  return out;
}

describe("users.email writers are the known set", () => {
  it("no production route writes users.email except the audited sites", () => {
    const unexpected: string[] = [];
    for (const file of walk(path.join(ROOT, "server"))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits: string[] = [];
      for (const arg of updateSetArgs(src)) {
        if (EMAIL_KEY.test(arg)) hits.push(`update.set ${arg.replace(/\s+/g, " ").slice(0, 180)}`);
      }
      for (const block of callArgs(src, "upsertUser")) {
        if (EMAIL_KEY.test(block)) hits.push(`upsertUser ${block.replace(/\s+/g, " ").slice(0, 180)}`);
      }
      for (const block of callArgs(src, "updateUser")) {
        if (EMAIL_KEY.test(block)) hits.push(`updateUser ${block.replace(/\s+/g, " ").slice(0, 180)}`);
      }
      if (/UPDATE\s+users[\s\S]{0,500}?\bemail\s*=/i.test(src)) hits.push("SQL UPDATE users ... email");
      if (hits.length === 0) continue;
      if (!ALLOWED_WRITERS.has(rel)) unexpected.push(`${rel}: ${hits.join(" | ")}`);
    }
    assert.deepEqual(unexpected, []);
  });

  it("the allowed writers only anonymize, accept the verify-screen change, or copy a provider email at login", () => {
    const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    const verify = read("server/services/email-verification.service.ts");
    assert.match(verify, /isNull\(users\.emailVerified\)/);
    assert.match(verify, /export async function changeUnverifiedEmail/);
    const changeSets = updateSetArgs(verify).filter((arg) => EMAIL_KEY.test(arg));
    assert.equal(changeSets.length, 1);
    assert.match(changeSets[0], /email:\s*next/);

    for (const rel of ["server/replit_integrations/auth/routes.ts", "server/routes/admin.routes.ts"]) {
      const src = read(rel);
      const sets = updateSetArgs(src).filter((arg) => EMAIL_KEY.test(arg));
      assert.equal(sets.length, 1, rel);
      assert.match(sets[0], /email:\s*anonymizedEmail/);
      assert.match(sets[0], /isDeleted:\s*true/);
    }

    const oidc = read("server/replit_integrations/auth/replitAuth.ts");
    assert.match(oidc, /email:\s*email \|\| undefined/);
    assert.match(oidc, /!\s*existing && email && oidcEmailVerified\(claims\)/);
    const oidcUpserts = callArgs(oidc, "upsertUser").filter((block) => EMAIL_KEY.test(block));
    assert.equal(oidcUpserts.length, 1);

    const facebook = read("server/replit_integrations/auth/facebookAuth.ts");
    assert.match(facebook, /email:\s*email \|\| null/);
    assert.match(facebook, /decideEmailMerge\(\{\s*emailVerified:\s*false/);
    const fbUpserts = callArgs(facebook, "upsertUser").filter((block) => EMAIL_KEY.test(block));
    assert.equal(fbUpserts.length, 1);
    assert.doesNotMatch(fbUpserts[0], /emailVerified/);
    const fbUpdates = callArgs(facebook, "updateUser").filter((block) => EMAIL_KEY.test(block));
    assert.equal(fbUpdates.length, 0);
  });

  it("PATCH /api/profile's schema has no email key, and change-unverified-email stays mounted", () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, "server/replit_integrations/auth/routes.ts"), "utf8"));
    const schemaStart = src.indexOf("const updateProfileSchema");
    const schemaEnd = src.indexOf("export function registerAuthRoutes");
    assert.ok(schemaStart >= 0 && schemaEnd > schemaStart);
    const schema = src.slice(schemaStart, schemaEnd);
    assert.equal(EMAIL_KEY.test(schema), false);
    assert.match(src, /app\.patch\(\s*"\/api\/profile"/);
    assert.match(src, /authStorage\.updateUser\(userId,\s*validation\.data\)/);

    const auth = fs.readFileSync(path.join(ROOT, "server/replit_integrations/auth/emailAuth.ts"), "utf8");
    assert.match(auth, /app\.post\(\s*"\/api\/auth\/change-unverified-email"/);
    assert.match(auth, /changeUnverifiedEmail\(userId,\s*parsed\.data\.email/);
  });
});

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`verified-email-change-paths refuses a non-local database (${host ?? "unknown host"})`);
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${(key as Buffer).toString("hex")}`);
    });
  });
}

const PASSWORD = "longenough-pass1";
const fixtureIds: string[] = [];
const fixtureEmails: string[] = [];

function freshEmail(label: string): string {
  return `vechg-${label}-${crypto.randomUUID()}@traveloure-qa.test`;
}

let server: http.Server;
let base = "";

async function call(method: string, path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  const setCookie = typeof (res.headers as any).getSetCookie === "function"
    ? (res.headers as any).getSetCookie() as string[]
    : [res.headers.get("set-cookie") ?? ""];
  const sid = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("connect.sid="));
  return { status: res.status, body: json, text, cookie: sid };
}

async function emailOf(id: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
  return row?.email ?? null;
}

describe("PATCH /api/profile ignores email; change-unverified-email stays open", () => {
  let userId = "";
  let original = "";
  let cookie = "";

  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    process.env.EMAIL_SENDS_ENABLED = "true";
    await assertDisposableDb();
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    registerAuthRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;

    userId = crypto.randomUUID();
    original = freshEmail("keep");
    fixtureIds.push(userId);
    fixtureEmails.push(original);
    await db.insert(users).values({
      id: userId,
      email: original,
      firstName: "Kept",
      lastName: "Fixture",
      role: "user",
      password: await hashPassword(PASSWORD),
      emailVerified: null,
    } as any);
    const login = await call("POST", "/api/auth/login", { email: original, password: PASSWORD });
    assert.equal(login.status, 200, login.text);
    assert.ok(login.cookie, "login did not set a session cookie");
    cookie = login.cookie!;
  });

  after(async () => {
    if (priorSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = priorSends;
    if (priorResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResend;
    await new Promise<void>((r) => server?.close(() => r()));
    if (fixtureEmails.length) {
      const { inArray } = await import("drizzle-orm");
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, fixtureEmails));
    }
    for (const id of fixtureIds) {
      await pool.query(
        `DELETE FROM sessions WHERE sess->'passport'->'user'->'claims'->>'sub' = $1`,
        [id],
      );
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("an email key on PATCH /api/profile does not change users.email", async () => {
    const other = freshEmail("ignored");
    const res = await call("PATCH", "/api/profile", { email: other, firstName: "Renamed" }, cookie);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.email, original);
    assert.equal(res.body.firstName, "Renamed");
    assert.equal(await emailOf(userId), original);
    assert.notEqual(res.body?.code, emailVerificationDeniedBody().code);

    const onlyEmail = await call("PATCH", "/api/profile", { email: other }, cookie);
    assert.equal(onlyEmail.status, 200, onlyEmail.text);
    assert.equal(onlyEmail.body.email, original);
    assert.equal(onlyEmail.body.firstName, "Renamed");
    assert.equal(await emailOf(userId), original);

    const signedOut = await call("PATCH", "/api/profile", { email: other, firstName: "Nope" });
    assert.equal(signedOut.status, 401, signedOut.text);
    assert.equal(await emailOf(userId), original);
  });

  it("change-unverified-email still updates an unverified account while sends are on", async () => {
    const next = freshEmail("next");
    fixtureEmails.push(next);
    const res = await call("POST", "/api/auth/change-unverified-email", { email: next }, cookie);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body, { message: VERIFICATION_EMAIL_CHANGE_MESSAGE });
    assert.notEqual(res.body?.code, emailVerificationDeniedBody().code);
    assert.equal(await emailOf(userId), next);
    const started = Date.now();
    let queued = false;
    while (Date.now() - started < 5000) {
      const rows = await db.select({ id: emailOutbox.id }).from(emailOutbox)
        .where(eq(emailOutbox.toEmail, next));
      if (rows.length > 0) { queued = true; break; }
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(queued, true, "verification letter was not queued for the new address");
  });
});
