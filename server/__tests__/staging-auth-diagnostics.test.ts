/**
 * Diagnostic behavior only: isolated HTTP apps, real express-session/Passport,
 * in-memory fixtures. No database, account creation, email, or external traffic.
 * The shared-store test proves observer transparency, NOT Postgres failover.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import express from "express";
import session from "express-session";
import passport from "passport";
import {
  createStagingAuthDiagnostics,
  type StagingAuthDiagnostic,
} from "../replit_integrations/auth/staging-auth-diagnostics";

const SECRET = "diagnostics-test-only-signing-key";
const PRIVATE_EMAIL = "private-diagnostic-fixture@example.invalid";
const PRIVATE_PASSWORD = "private-test-password";
const PRIVATE_HEADER = "private-incoming-request-id";

class TestStore extends session.MemoryStore {
  failRead = false;
  failWrite = false;
  override get: session.Store["get"] = (sid, callback) => {
    if (this.failRead) return setImmediate(() => callback(new Error(PRIVATE_PASSWORD)));
    return session.MemoryStore.prototype.get.call(this, sid, callback);
  };
  override set: session.Store["set"] = (sid, value, callback) => {
    if (this.failWrite) return setImmediate(() => callback?.(new Error(PRIVATE_PASSWORD)));
    return session.MemoryStore.prototype.set.call(this, sid, value, callback);
  };
}

async function harness(
  environment: string | undefined = "staging",
  store = new TestStore(),
  write?: (record: StagingAuthDiagnostic) => void,
  secure = false,
) {
  const records: StagingAuthDiagnostic[] = [];
  const diagnostic = createStagingAuthDiagnostics(
    { ENVIRONMENT: environment },
    write ?? ((record) => records.push(record)),
  );
  const app = express();
  const auth = new passport.Passport();
  auth.serializeUser((user, done) => done(null, user));
  auth.deserializeUser((user: Express.User, done) => done(null, user));
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(diagnostic.middleware);
  app.use((req, res, next) => session({
    secret: SECRET, store: diagnostic.observeStore(store),
    resave: false, saveUninitialized: false,
    cookie: { secure, httpOnly: true, sameSite: "lax" },
  })(req, res, (err) => {
    if (err) diagnostic.record("session_load_failed");
    next(err);
  }));
  app.use(auth.initialize(), auth.session());
  app.use((req, _res, next) => {
    diagnostic.record("session_loaded", { authenticated: req.isAuthenticated() });
    next();
  });
  app.post("/api/auth/register", async (req, res) => {
    await new Promise((resolve) => setImmediate(resolve));
    diagnostic.record("register_committed", req.body.diagnostic);
    // Fixture only; mirrors the neutral contract without creating an account.
    res.status(202).json({ code: "registration_received" });
  });
  app.post("/api/auth/login", (req, res) => {
    if (req.body.password !== PRIVATE_PASSWORD) {
      diagnostic.record("login_credentials_rejected");
      return res.status(401).json({ message: "Invalid email or password" });
    }
    req.login({ id: PRIVATE_EMAIL } as Express.User, (err) => {
      if (err) {
        diagnostic.record("login_passport_failed");
        return res.status(500).json({ message: "Failed to create session" });
      }
      diagnostic.record("login_authenticated", { authenticated: req.isAuthenticated() });
      res.json({ ok: true });
    });
  });
  app.get("/api/auth/user", (req, res) => {
    res.status(req.isAuthenticated() ? 200 : 401).json({ authenticated: req.isAuthenticated() });
  });
  app.get("/other", (_req, res) => res.json({ ok: true }));
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "store unavailable" });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return { server, records, store, diagnostic };
}

async function hit(
  server: http.Server, path: string, body?: object, cookie?: string, https = false,
) {
  const data = body ? JSON.stringify(body) : undefined;
  return new Promise<{ status: number; body: any; cookie?: string; setCookie: string[] }>((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: (server.address() as { port: number }).port,
      path, method: data ? "POST" : "GET",
      headers: {
        "X-Request-Id": PRIVATE_HEADER,
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(https ? { "X-Forwarded-Proto": "https" } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"] ?? [];
        resolve({
          status: res.statusCode!, body: JSON.parse(raw), setCookie,
          cookie: setCookie.find((item) => item.startsWith("connect.sid="))?.split(";")[0],
        });
      });
    });
    req.on("error", reject);
    req.end(data);
  });
}

const credentials = { email: PRIVATE_EMAIL, password: PRIVATE_PASSWORD };

test("production/unset environments are silent and leave original store methods intact", async (t) => {
  for (const env of ["PROD", "production", "", undefined]) {
    const store = new TestStore();
    const get = store.get;
    const set = store.set;
    // Passing undefined explicitly to the factory avoids the harness default.
    const diagnostic = createStagingAuthDiagnostics({ ENVIRONMENT: env }, () => assert.fail("must stay silent"));
    assert.equal(diagnostic.observeStore(store), store);
    assert.equal(store.get, get);
    assert.equal(store.set, set);
    diagnostic.record("register_committed");
    const h = await harness(env ?? "");
    t.after(() => h.server.close());
    const login = await hit(h.server, "/api/auth/login", credentials);
    assert.equal(login.status, 200);
    assert.equal((await hit(h.server, "/api/auth/user", undefined, login.cookie)).status, 200);
    assert.deepEqual(h.records, []);
  }
});

test("neutral register -> separate login -> next request preserves session and exposes only safe outcomes", async (t) => {
  const h = await harness();
  t.after(() => h.server.close());
  const registered = await hit(h.server, "/api/auth/register", credentials);
  assert.equal(registered.status, 202);
  assert.equal(registered.cookie, undefined);
  assert.equal((await hit(h.server, "/api/auth/user")).status, 401);
  const loggedIn = await hit(h.server, "/api/auth/login", credentials);
  assert.equal(loggedIn.status, 200);
  assert.ok(loggedIn.cookie);
  assert.equal((await hit(h.server, "/api/auth/user?email=" + PRIVATE_EMAIL, undefined, loggedIn.cookie)).status, 200);
  assert.ok(h.records.some((r) => r.event === "register_committed"));
  assert.ok(h.records.some((r) => r.event === "store_write" && r.outcome === "ok"));
  assert.ok(h.records.some((r) => r.event === "store_read" && r.outcome === "found"));
  assert.ok(h.records.some((r) => r.event === "response_finished" && r.status === 200 && r.sessionCookieIssued));
  const serialized = JSON.stringify(h.records);
  for (const value of [SECRET, PRIVATE_EMAIL, PRIVATE_PASSWORD, PRIVATE_HEADER, loggedIn.cookie]) {
    assert.ok(!serialized.includes(value!), "diagnostic contains private input");
  }
  assert.ok(h.records.every((r) => !r.path.includes("?")));
});

test("credential rejection emits no successful login or store write", async (t) => {
  const h = await harness();
  t.after(() => h.server.close());
  const result = await hit(h.server, "/api/auth/login", { ...credentials, password: "incorrect" });
  assert.equal(result.status, 401);
  assert.equal(result.cookie, undefined);
  assert.ok(h.records.some((r) => r.event === "login_credentials_rejected"));
  assert.ok(!h.records.some((r) => r.event === "store_write" || r.event === "login_authenticated"));
});

test("a second app with a shared fixture store can read the same session; process identifiers differ", async (t) => {
  const store = new TestStore();
  const first = await harness("staging", store);
  const second = await harness("staging", store);
  t.after(() => { first.server.close(); second.server.close(); });
  const login = await hit(first.server, "/api/auth/login", credentials);
  assert.equal((await hit(second.server, "/api/auth/user", undefined, login.cookie)).status, 200);
  assert.notEqual(first.records[0].instance, second.records[0].instance);
  assert.ok(second.records.some((r) => r.event === "store_read" && r.outcome === "found"));
});

test("store read/write errors retain their original failure result without logging error contents", async (t) => {
  const h = await harness();
  t.after(() => h.server.close());
  const login = await hit(h.server, "/api/auth/login", credentials);
  h.store.failRead = true;
  assert.equal((await hit(h.server, "/api/auth/user", undefined, login.cookie)).status, 500);
  assert.ok(h.records.some((r) => r.event === "store_read" && r.outcome === "error"));
  assert.ok(h.records.some((r) => r.event === "session_load_failed"));
  h.store.failRead = false;
  h.store.failWrite = true;
  assert.equal((await hit(h.server, "/api/auth/login", credentials)).status, 500);
  assert.ok(h.records.some((r) => r.event === "store_write" && r.outcome === "error"));
  assert.ok(h.records.some((r) => r.event === "login_passport_failed"));
  assert.ok(!JSON.stringify(h.records).includes(PRIVATE_PASSWORD));
});

test("concurrent requests keep their own generated request IDs; unrelated routes remain silent", async (t) => {
  const h = await harness();
  t.after(() => h.server.close());
  await hit(h.server, "/other");
  assert.deepEqual(h.records, []);
  await Promise.all(Array.from({ length: 4 }, () => hit(h.server, "/api/auth/register", credentials)));
  const ids = new Set(h.records.map((r) => r.requestId));
  assert.equal(ids.size, 4);
  for (const id of ids) {
    assert.deepEqual(h.records.filter((r) => r.requestId === id).map((r) => r.event),
      ["request_started", "session_loaded", "register_committed", "response_finished"]);
  }
});

test("trust proxy/secure cookie behavior is observed without changing it, even if diagnostic writes throw", async (t) => {
  const h = await harness("staging", new TestStore(), undefined, true);
  const throwing = await harness("staging", new TestStore(), () => { throw new Error("log sink unavailable"); }, true);
  t.after(() => { h.server.close(); throwing.server.close(); });
  const login = await hit(h.server, "/api/auth/login", credentials, "stg_gate=private-gate-value", true);
  assert.equal(login.status, 200);
  assert.ok(login.setCookie[0].includes("Secure"));
  assert.ok(h.records.some((r) => r.event === "request_started" && r.secureRequest && r.gateCookiePresent));
  assert.ok(!JSON.stringify(h.records).includes("private-gate-value"));
  const other = await hit(throwing.server, "/api/auth/login", credentials, undefined, true);
  assert.equal(other.status, 200);
  assert.equal((await hit(throwing.server, "/api/auth/user", undefined, other.cookie, true)).status, 200);
});

test("record fields are allowlisted and real auth routes are wired to the observer", async (t) => {
  const h = await harness();
  t.after(() => h.server.close());
  // Outside a traced request, even a valid event cannot emit a record.
  h.diagnostic.record("register_failed");
  assert.deepEqual(h.records, []);
  await hit(h.server, "/api/auth/register", {
    ...credentials,
    diagnostic: {
      password: PRIVATE_PASSWORD, cookie: PRIVATE_PASSWORD, requestId: PRIVATE_HEADER,
      path: PRIVATE_EMAIL, outcome: PRIVATE_PASSWORD, authenticated: PRIVATE_EMAIL,
      status: PRIVATE_PASSWORD,
    },
  });
  const committed = h.records.find((r) => r.event === "register_committed")!;
  assert.equal(committed.outcome, undefined);
  assert.equal(committed.authenticated, undefined);
  assert.equal(committed.status, undefined);
  const serialized = JSON.stringify(h.records);
  for (const value of [PRIVATE_PASSWORD, PRIVATE_HEADER, PRIVATE_EMAIL]) assert.ok(!serialized.includes(value));
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  const auth = source("../replit_integrations/auth/replitAuth.ts");
  const email = source("../replit_integrations/auth/emailAuth.ts");
  assert.ok(auth.includes("app.use(stagingAuthDiagnostics.middleware)"));
  assert.ok(auth.includes("store: stagingAuthDiagnostics.observeStore(sessionStore)"));
  const gate = source("../middleware/staging-access.ts");
  assert.ok(gate.includes("STAGING_GATE_INSTANCE_ID = stagingAuthDiagnostics.instance"));
  for (const event of ["register_committed", "register_existing", "register_conflict", "register_failed",
    "login_credentials_rejected", "login_authenticated", "login_regenerate_failed", "login_passport_failed", "login_failed"]) {
    assert.ok(email.includes(`stagingAuthDiagnostics.record("${event}"`), `${event} not wired`);
  }
});
