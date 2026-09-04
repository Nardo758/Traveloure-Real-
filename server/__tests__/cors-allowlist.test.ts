/**
 * cors-allowlist.test.ts — audit finding 13 (ledger `2026-09-03-security-9-11-13`).
 *
 * THE DEFECT: `server/index.ts` reflected the caller's Origin when the allowlist CONTAINED it
 * **or was empty** — and the allowlist was built from `REPLIT_DOMAINS` alone, which is empty on
 * every non-Replit deployment. Combined with an unconditional
 * `Access-Control-Allow-Credentials: true`, an unset env turned the allowlist into a credentialed
 * wildcard.
 *
 * These tests mount the REAL middleware (`createCorsMiddleware`) on a bare express app — the same
 * function `server/index.ts` mounts — so what is proven is the shipped policy, not a restatement
 * of it.
 *
 *   C1 — an unknown origin gets NO `Access-Control-Allow-Origin` and NO credentials header.
 *   C2 — an EMPTY allowlist is a deny, not a wildcard (the exact fail-open being closed).
 *   C3 — a configured origin is echoed exactly, with credentials.
 *   C4 — `*` is never emitted, at any allowlist size, for any origin.
 *   C5 — same-origin always works with zero configuration (the production domain's path).
 *   C6 — every origin source resolves: CORS_ALLOWED_ORIGINS, APP_BASE_URL, REPLIT_DOMAINS
 *        (http+https, as before — no origin that worked before this change stops working),
 *        REPLIT_DEV_DOMAIN.
 *   C7 — loopback is allowed outside a production-strict boot (dev + every CI gate) and refused on
 *        a real production boot.
 *   C8 — a preflight from a disallowed origin gets no allow-origin header (the browser's deny),
 *        and `Vary: Origin` is present on allowed AND denied responses.
 *   C9 — near-miss origins do not slip through: a suffix/prefix of an allowed host, a scheme
 *        downgrade of an https-only entry, and a spoofed `Host` that does not match the Origin.
 *
 * STATED NEGATIVE SPACE (§18d): this proves the ORIGIN decision and the headers that ride on it.
 * It does not prove anything about the session cookie's `sameSite`, about CSRF, or about any
 * surface outside the `/api` mount (`/internal` and the SPA are not CORS-managed at all). It is a
 * process-local test: it cannot say what `REPLIT_DOMAINS`/`APP_BASE_URL` are set to on the live
 * deployment, which is the open question the audit flagged.
 *
 * Run: npx tsx --test server/__tests__/cors-allowlist.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  buildCorsAllowlist,
  createCorsMiddleware,
  normalizeOrigin,
  resolveCorsAllowOrigin,
} from "../middleware/cors-origins";

/** Boot a bare app carrying the REAL middleware, built against the supplied env. */
async function withCorsApp<T>(
  env: Record<string, string | undefined>,
  fn: (call: (path: string, headers: Record<string, string>, method?: string) => Promise<Response>) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use("/api", createCorsMiddleware(env as NodeJS.ProcessEnv));
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn((path, headers, method = "GET") =>
      fetch(`http://127.0.0.1:${port}${path}`, { method, headers }),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const PROD_ENV = {
  NODE_ENV: "production",
  CORS_ALLOWED_ORIGINS: "https://www.traveloure.com",
};

test("C1: an unknown origin gets no Access-Control-Allow-Origin and no credentials header", async () => {
  await withCorsApp(PROD_ENV, async (call) => {
    const res = await call("/api/ping", { Origin: "https://evil.example" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(res.headers.get("access-control-allow-credentials"), null);
    assert.equal(res.status, 200, "the request itself still answers — CORS is a browser-side deny");
  });
});

test("C2: an EMPTY allowlist is a DENY, not a wildcard (the fail-open being closed)", async () => {
  // The pre-fix condition was `allowlist.has(origin) || allowlist.size === 0`.
  const env = { NODE_ENV: "production" };
  assert.equal(buildCorsAllowlist(env as NodeJS.ProcessEnv).size, 0, "precondition: nothing configured");
  await withCorsApp(env, async (call) => {
    const res = await call("/api/ping", { Origin: "https://evil.example" });
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      null,
      "audit finding 13 regrown: an empty allowlist reflected the caller's origin",
    );
  });
});

test("C3: a configured origin is echoed exactly, with credentials", async () => {
  await withCorsApp(PROD_ENV, async (call) => {
    const res = await call("/api/ping", { Origin: "https://www.traveloure.com" });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://www.traveloure.com");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
  });
});

test("C4: `*` is never emitted, for any origin, at any allowlist size", async () => {
  for (const env of [PROD_ENV, { NODE_ENV: "production" }, { NODE_ENV: "development" }]) {
    await withCorsApp(env, async (call) => {
      for (const origin of ["https://evil.example", "https://www.traveloure.com", "null", "http://localhost:5000"]) {
        const res = await call("/api/ping", { Origin: origin });
        assert.notEqual(
          res.headers.get("access-control-allow-origin"),
          "*",
          `wildcard emitted for ${origin} — a wildcard with credentials is the combination CORS forbids`,
        );
      }
    });
  }
});

test("C5: same-origin always works with zero configuration", () => {
  const empty = new Set<string>();
  // The production domain, behind a TLS terminator that sets X-Forwarded-Proto.
  assert.equal(
    resolveCorsAllowOrigin(
      { origin: "https://www.traveloure.com", host: "www.traveloure.com", protocol: "http", forwardedProto: "https" },
      empty,
      { NODE_ENV: "production" } as NodeJS.ProcessEnv,
    ),
    "https://www.traveloure.com",
  );
  // A cross-site caller against the same deployment is still refused.
  assert.equal(
    resolveCorsAllowOrigin(
      { origin: "https://evil.example", host: "www.traveloure.com", protocol: "http", forwardedProto: "https" },
      empty,
      { NODE_ENV: "production" } as NodeJS.ProcessEnv,
    ),
    null,
  );
});

test("C6: every configured origin source resolves", () => {
  const env = {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: " https://www.traveloure.com , https://traveloure.com/ ",
    APP_BASE_URL: "https://app.traveloure.com/some/path",
    REPLIT_DOMAINS: "my-repl.replit.dev, second.replit.app",
    REPLIT_DEV_DOMAIN: "preview.replit.dev",
  } as NodeJS.ProcessEnv;
  const allowlist = buildCorsAllowlist(env);
  for (const expected of [
    "https://www.traveloure.com",
    "https://traveloure.com",
    "https://app.traveloure.com",
    "https://my-repl.replit.dev",
    "http://my-repl.replit.dev", // preserved verbatim from the previous behaviour
    "https://second.replit.app",
    "https://preview.replit.dev",
  ]) {
    assert.ok(allowlist.has(expected), `${expected} missing from the allowlist`);
  }
  assert.equal(allowlist.has("https://evil.example"), false);
  // A path or trailing slash on an entry never widens it.
  assert.equal(normalizeOrigin("https://app.traveloure.com/some/path"), "https://app.traveloure.com");
  // Non-http(s) schemes are not origins we ever echo.
  assert.equal(normalizeOrigin("file:///etc/passwd"), null);
  assert.equal(normalizeOrigin("not a url"), null);
  assert.equal(normalizeOrigin("null"), null);
});

test("C7: loopback is allowed outside a production-strict boot, refused on a real production boot", () => {
  const empty = new Set<string>();
  const req = { origin: "http://localhost:5000", host: "example.test", protocol: "https" };
  // Dev.
  assert.equal(resolveCorsAllowOrigin(req, empty, { NODE_ENV: "development" } as NodeJS.ProcessEnv), "http://localhost:5000");
  // Every CI gate: the PRODUCTION bundle on loopback with the documented escape hatch.
  assert.equal(
    resolveCorsAllowOrigin(req, empty, { NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1" } as NodeJS.ProcessEnv),
    "http://localhost:5000",
  );
  // 127.0.0.1 on the port the journey suite and the local gates use.
  assert.equal(
    resolveCorsAllowOrigin({ ...req, origin: "http://127.0.0.1:5001" }, empty, { NODE_ENV: "development" } as NodeJS.ProcessEnv),
    "http://127.0.0.1:5001",
  );
  // A real production boot refuses it.
  assert.equal(resolveCorsAllowOrigin(req, empty, { NODE_ENV: "production" } as NodeJS.ProcessEnv), null);
  assert.equal(resolveCorsAllowOrigin(req, empty, { ENVIRONMENT: "PROD" } as NodeJS.ProcessEnv), null);
});

test("C8: preflight denies carry no allow-origin, and Vary: Origin is always present", async () => {
  await withCorsApp(PROD_ENV, async (call) => {
    const denied = await call("/api/ping", { Origin: "https://evil.example" }, "OPTIONS");
    assert.equal(denied.status, 204);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.match(denied.headers.get("vary") || "", /Origin/i);

    const allowed = await call("/api/ping", { Origin: "https://www.traveloure.com" }, "OPTIONS");
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.traveloure.com");
    assert.match(allowed.headers.get("vary") || "", /Origin/i);
  });
});

test("C9: near-miss origins do not slip through", () => {
  const env = { NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://www.traveloure.com" } as NodeJS.ProcessEnv;
  const allowlist = buildCorsAllowlist(env);
  const nearMisses = [
    "https://www.traveloure.com.evil.example", // suffix attack
    "https://evilwww.traveloure.com",          // prefix attack
    "http://www.traveloure.com",               // scheme downgrade of an https-only entry
    "https://www.traveloure.com:8443",         // different port is a different origin
  ];
  for (const origin of nearMisses) {
    assert.equal(
      resolveCorsAllowOrigin({ origin, host: "www.traveloure.com", forwardedProto: "https" }, allowlist, env),
      null,
      `${origin} was allowed`,
    );
  }
  // A spoofed Host cannot manufacture a same-origin match for a different Origin.
  assert.equal(
    resolveCorsAllowOrigin(
      { origin: "https://evil.example", host: "evil.example.attacker.test", forwardedProto: "https" },
      allowlist,
      env,
    ),
    null,
  );
});
