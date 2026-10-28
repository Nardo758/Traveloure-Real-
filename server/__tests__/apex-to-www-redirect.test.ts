/**
 * Row 258 — apex traveloure.com 301s to https://www.traveloure.com.
 * Mounts the REAL middleware on a bare express app and calls it over a socket.
 * Run: npx tsx --test server/__tests__/apex-to-www-redirect.test.ts
 *
 *   AW1  path and query preserved; HEAD is a 301 too.
 *   AW2  www passes through.
 *   AW3  other hosts pass through.
 *   AW4  host normalisation; the first X-Forwarded-Host value governs.
 *   AW5  non-GET methods on a non-exempt path pass through.
 *   AW6  exempt paths pass through for every method; look-alikes 301 on GET.
 *   AW6b GET/HEAD 301 on non-exempt paths, including /t/; other methods pass through.
 *   AW7  no open redirect.
 *   AW8  the 301 sets no cookie.
 *   AW9  getSession() still has no domain; this middleware does not say "cookie" in code.
 *   AW10 mount order in server/index.ts.
 *   AW11 constants.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  APEX_HOST,
  CANONICAL_WWW_ORIGIN,
  EXEMPT_EXACT,
  EXEMPT_PREFIXES,
  apexRedirectTarget,
  apexToWwwRedirect,
} from "../middleware/apex-to-www-redirect";

const WWW = "https://www.traveloure.com";
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

let port = 0;
let server: http.Server;

before(async () => {
  const app = express();
  app.use(apexToWwwRedirect);
  app.use((_req, res) => {
    res.status(200).type("text/plain").send("reached");
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function call(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; location?: string; setCookie?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const loc = res.headers.location;
        const cookie = res.headers["set-cookie"];
        resolve({
          status: res.statusCode ?? 0,
          location: Array.isArray(loc) ? loc[0] : loc,
          setCookie: cookie == null ? undefined : Array.isArray(cookie) ? cookie.join("\n") : cookie,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function assertPassed(
  res: { status: number; location?: string; body: string },
  method: string,
): void {
  assert.equal(res.status, 200, `${method} status`);
  assert.equal(res.location, undefined, `${method} must not set Location`);
  if (method !== "HEAD") assert.equal(res.body, "reached");
}

test("AW1: GET and HEAD on the apex 301 to www, path and query preserved", async () => {
  const priced = await call("GET", "/pricing?x=1&y=a%20b", { Host: "traveloure.com" });
  assert.equal(priced.status, 301);
  assert.equal(priced.location, `${WWW}/pricing?x=1&y=a%20b`);

  const root = await call("GET", "/", { Host: "traveloure.com" });
  assert.equal(root.status, 301);
  assert.equal(root.location, `${WWW}/`);

  const head = await call("HEAD", "/pricing", { Host: "traveloure.com" });
  assert.equal(head.status, 301);
  assert.equal(head.location, `${WWW}/pricing`);
});

test("AW2: www is passed through", async () => {
  const res = await call("GET", "/pricing", { Host: "www.traveloure.com" });
  assertPassed(res, "GET");
});

test("AW3: other hosts are not redirected", async () => {
  for (const host of [
    "localhost:5000",
    "127.0.0.1:5000",
    "something.replit.app",
    "staging.traveloure.com",
    "traveloure.com.evil.test",
    "eviltraveloure.com",
  ]) {
    const res = await call("GET", "/pricing", { Host: host });
    assertPassed(res, "GET");
  }
});

test("AW4: host normalisation, and the first X-Forwarded-Host value governs", async () => {
  for (const host of ["TRAVELOURE.COM", "traveloure.com:443", "traveloure.com."]) {
    const res = await call("GET", "/pricing", { Host: host });
    assert.equal(res.status, 301, host);
    assert.equal(res.location, `${WWW}/pricing`, host);
  }
  const forwarded = await call("GET", "/pricing", {
    Host: "internal.example",
    "X-Forwarded-Host": "traveloure.com",
  });
  assert.equal(forwarded.status, 301);
  assert.equal(forwarded.location, `${WWW}/pricing`);

  const firstWins = await call("GET", "/pricing", {
    Host: "traveloure.com",
    "X-Forwarded-Host": "www.traveloure.com, traveloure.com",
  });
  assertPassed(firstWins, "GET");
});

test("AW5: non-GET methods on the apex pass through", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const res = await call(method, "/pricing", { Host: "traveloure.com" });
    assertPassed(res, method);
  }
});

test("AW6: exempt paths pass through for every method; look-alikes 301 on GET", async () => {
  assert.deepEqual([...EXEMPT_PREFIXES], ["/api/", "/.well-known/", "/internal/"]);
  assert.deepEqual([...EXEMPT_EXACT], ["/health", "/health/ready", "/health/live", "/metrics"]);

  const exempt = [
    "/api/webhooks/stripe",
    "/api/bookings/webhooks/stripe",
    "/api/health",
    "/api/ready",
    "/api/version",
    "/api/login",
    "/api/callback",
    "/api/auth/facebook/callback",
    "/api/ready-made/abc",
    "/health",
    "/health/ready",
    "/health/live",
    "/metrics",
    "/.well-known/apple-developer-merchantid-domain-association",
    "/internal/run-occasion-drafts",
  ];
  for (const path of exempt) {
    const covered =
      (EXEMPT_EXACT as readonly string[]).includes(path) ||
      EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
    assert.equal(covered, true, `${path} is not on the exported exempt lists`);
  }
  for (const prefix of EXEMPT_PREFIXES) {
    assert.ok(exempt.some((path) => path.startsWith(prefix)), `no sample under ${prefix}`);
  }
  for (const exact of EXEMPT_EXACT) {
    assert.ok(exempt.includes(exact), `exact ${exact} is not sampled`);
  }

  for (const path of exempt) {
    for (const method of METHODS) {
      const res = await call(method, path, { Host: "traveloure.com" });
      assertPassed(res, method);
    }
  }

  for (const path of ["/api", "/apix", "/healthy", "/health/x", "/metricsx", "/internal", "/.well-known"]) {
    const res = await call("GET", path, { Host: "traveloure.com" });
    assert.equal(res.status, 301, path);
    assert.equal(res.location, `${WWW}${path}`, path);
  }
});

test("AW6b: GET and HEAD 301 on non-exempt paths; every other method passes through", async () => {
  const paths = ["/pricing", "/t/some-slug", "/sitemap.xml", "/robots.txt", "/stripe/connect/return"];
  for (const path of paths) {
    for (const method of ["GET", "HEAD"]) {
      const res = await call(method, path, { Host: "traveloure.com" });
      assert.equal(res.status, 301, `${method} ${path}`);
      assert.equal(res.location, `${WWW}${path}`, `${method} ${path}`);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const res = await call(method, path, { Host: "traveloure.com" });
      assertPassed(res, method);
    }
  }
});

test("AW7: no open redirect", async () => {
  const doubled = await call("GET", "//evil.example/x", { Host: "traveloure.com" });
  assert.ok(doubled.location?.startsWith(`${WWW}/`), doubled.location);
  assert.equal(new URL(doubled.location!).origin, WWW);

  const slashed = await call("GET", "/\\evil.example", { Host: "traveloure.com" });
  assert.ok(slashed.location?.startsWith(`${WWW}/`), slashed.location);
  assert.equal(new URL(slashed.location!).origin, WWW);

  assert.equal(
    apexRedirectTarget({ method: "GET", originalUrl: "https://evil.example/x", host: "traveloure.com" }),
    null,
  );
  assert.equal(
    apexRedirectTarget({ method: "GET", originalUrl: "http://evil.example/x", host: "traveloure.com" }),
    null,
  );
  const absolute = apexRedirectTarget({
    method: "GET",
    originalUrl: "//evil.example/x",
    host: "traveloure.com",
  });
  assert.equal(absolute, `${WWW}//evil.example/x`);
  assert.ok(absolute!.startsWith(`${WWW}/`));
});

test("AW8: the 301 response has no set-cookie header", async () => {
  const res = await call("GET", "/pricing", { Host: "traveloure.com" });
  assert.equal(res.status, 301);
  assert.equal(res.setCookie, undefined);
});

test("AW9: getSession() has no domain, and the middleware source does not mention cookie outside comments", () => {
  const auth = readFileSync("server/replit_integrations/auth/replitAuth.ts", "utf8");
  const fnStart = auth.indexOf("export function getSession()");
  assert.ok(fnStart >= 0);
  const fnEnd = auth.indexOf("\nfunction ", fnStart);
  assert.ok(fnEnd > fnStart);
  const fn = auth.slice(fnStart, fnEnd);
  const cookieAt = fn.indexOf("cookie: {");
  assert.ok(cookieAt >= 0);
  const after = fn.slice(cookieAt);
  let depth = 0;
  let end = -1;
  for (let i = after.indexOf("{"); i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > 0);
  const block = after.slice(0, end + 1);
  assert.doesNotMatch(block, /\bdomain\b/);

  const mw = readFileSync("server/middleware/apex-to-www-redirect.ts", "utf8");
  const code = mw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.doesNotMatch(code, /cookie/i);
});

test("AW10: the middleware is mounted once, after metrics and before json, static, and routes", () => {
  const index = readFileSync("server/index.ts", "utf8");
  const mount = index.indexOf("app.use(apexToWwwRedirect");
  assert.ok(mount > index.indexOf("app.use(createMetricsRouter())"));
  assert.ok(mount < index.indexOf("express.json("));
  assert.ok(mount < index.indexOf("serveStatic(app)"));
  assert.ok(mount < index.indexOf("registerRoutes("));
  assert.equal(index.split("app.use(apexToWwwRedirect").length - 1, 1);
});

test("AW11: constants", () => {
  assert.equal(CANONICAL_WWW_ORIGIN, "https://www.traveloure.com");
  assert.equal(APEX_HOST, "traveloure.com");
});
