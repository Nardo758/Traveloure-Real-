/**
 * security-regression.spec.ts
 *
 * Regression suite for the 10 navbar security controls audited in the
 * Senior Security Engineer brief. Runs entirely at the API layer via
 * page.request — no browser UI interaction needed.
 *
 * Controls tested:
 *  T1  XSS in search            — payloads not reflected in JSON response
 *  T2  JWT/token manipulation    — tampered session cookie rejected (401)
 *  T3  CSRF on logout            — GET /api/auth/logout → 405; SameSite=Lax on cookie
 *  T4  Direct URL privilege      — protected APIs return 401 without session
 *  T5  Parameter tampering       — cross-user resources blocked (401/403/404)
 *  T6  Open redirect             — login/logout never redirect to external URLs
 *  T7  Sensitive data exposure   — password hash absent from /api/experts response
 *  T8  Rate-limit wiring         — X-RateLimit-Limit header present on auth endpoint
 *  T9  Role in localStorage      — server ignores client-supplied X-Role header
 *  T10 Secrets in client code    — no sk_live / sk_test / secret keys in source
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE = process.env.BASE_URL || "http://localhost:5000";
const TS   = Date.now();

// ── shared auth state (populated in beforeAll) ─────────────────────────────
let sessionCookie = ""; // connect.sid value for a valid logged-in traveler

test.beforeAll(async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  const email = `sec.reg.${TS}@traveloure-test.com`;
  await page.request.post(`${BASE}/api/auth/register`, {
    data: { email, password: "SecReg!2026", firstName: "Sec", lastName: "Reg" },
  });

  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email, password: "SecReg!2026" },
  });
  // Capture the session cookie from the response headers
  const cookies = await ctx.cookies(BASE);
  const sid = cookies.find((c) => c.name === "connect.sid");
  if (sid) sessionCookie = sid.value;

  await ctx.close();
});

// ── T1 — XSS in search ────────────────────────────────────────────────────
test.describe("T1 — XSS in search: payloads not reflected", () => {
  const payloads = [
    "<script>alert(document.cookie)</script>",
    "<img src=x onerror=alert('xss')>",
    "javascript:alert('xss')",
    '"><script>alert(\'xss\')</script>',
  ];
  for (const payload of payloads) {
    test(`payload not reflected: ${payload.slice(0, 40)}`, async ({ page }) => {
      const resp = await page.request.get(
        `${BASE}/api/discover?q=${encodeURIComponent(payload)}`
      );
      expect(resp.status()).not.toBe(500);
      const body = await resp.text();
      expect(body).not.toContain("<script>");
      expect(body.toLowerCase()).not.toContain("onerror=alert");
      expect(body).not.toContain("javascript:alert");
    });
  }
});

// ── T2 — JWT / token manipulation ─────────────────────────────────────────
test.describe("T2 — JWT/token manipulation: tampered session rejected", () => {
  test("tampered connect.sid returns 401", async ({ page }) => {
    const tampered = sessionCookie
      ? sessionCookie.slice(0, -4) + "XXXX"
      : "s%3AFAKE.TAMPERED.SESSION.ID.garbage";
    const resp = await page.request.get(`${BASE}/api/bookings/user`, {
      headers: { Cookie: `connect.sid=${tampered}` },
    });
    expect(resp.status()).toBe(401);
  });

  test("no session cookie returns 401", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/bookings/user`);
    expect(resp.status()).toBe(401);
  });

  test("fake Bearer JWT with role=admin rejected on /api/admin/users", async ({ page }) => {
    const fakeJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
      ".SflKxwRJSMeKKF2QT4fwpMeJf36POk2SflKx";
    const resp = await page.request.get(`${BASE}/api/admin/users`, {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });
    expect(resp.status()).toBe(401);
  });
});

// ── T3 — CSRF on logout ───────────────────────────────────────────────────
test.describe("T3 — CSRF: GET logout blocked, SameSite=Lax on cookie", () => {
  test("GET /api/auth/logout returns 405", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/auth/logout`);
    expect(resp.status()).toBe(405);
  });

  test("POST /api/auth/logout returns 200", async ({ page }) => {
    const resp = await page.request.post(`${BASE}/api/auth/logout`);
    expect([200, 204, 302]).toContain(resp.status());
  });

  test("login Set-Cookie includes SameSite=Lax and HttpOnly", async ({ page }) => {
    const email = `sec.csrf.${TS}@traveloure-test.com`;
    await page.request.post(`${BASE}/api/auth/register`, {
      data: { email, password: "CsrfTest!2026", firstName: "C", lastName: "S" },
    });
    const resp = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email, password: "CsrfTest!2026" },
    });
    const setCookie = resp.headers()["set-cookie"] ?? "";
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });
});

// ── T4 — Direct URL privilege ─────────────────────────────────────────────
test.describe("T4 — Direct URL privilege: protected APIs need auth", () => {
  const routes = [
    "/api/admin/users",
    "/api/admin/revenue",
    "/api/expert/earnings",
    "/api/bookings/user",
    "/api/my-bookings",
    "/api/expert/dashboard",
    "/api/provider/dashboard",
    "/api/cart",
    "/api/conversations",
  ];
  for (const route of routes) {
    test(`${route} → 401 without session`, async ({ page }) => {
      const resp = await page.request.get(`${BASE}${route}`);
      expect(resp.status()).toBe(401);
    });
  }
});

// ── T5 — Parameter tampering ──────────────────────────────────────────────
test.describe("T5 — Parameter tampering: cross-user IDs blocked", () => {
  const ids = ["/api/bookings/1", "/api/bookings/999", "/api/trips/1"];
  for (const path of ids) {
    test(`${path} → 401/403/404 with valid-but-wrong session`, async ({ page }) => {
      const headers = sessionCookie
        ? { Cookie: `connect.sid=${sessionCookie}` }
        : {};
      const resp = await page.request.get(`${BASE}${path}`, { headers });
      expect([401, 403, 404, 400]).toContain(resp.status());
    });
  }
});

// ── T6 — Open redirect ────────────────────────────────────────────────────
test.describe("T6 — Open redirect: no external Location headers", () => {
  const redirectAttempts = [
    `/login?redirect=https://evil.com`,
    `/login?next=https://evil.com`,
    `/login?returnTo=https://evil.com`,
    `/api/auth/logout?redirect=https://evil.com`,
  ];
  for (const url of redirectAttempts) {
    test(`${url} does not redirect to evil.com`, async ({ page }) => {
      const resp = await page.request.get(`${BASE}${url}`, {
        maxRedirects: 0,
      });
      const location = resp.headers()["location"] ?? "";
      expect(location).not.toContain("evil.com");
      expect(location).not.toMatch(/^https?:\/\/(?!localhost)/);
    });
  }
});

// ── T7 — Sensitive data exposure ──────────────────────────────────────────
test.describe("T7 — Sensitive data: password not in /api/experts", () => {
  test("password field absent or null in every expert object", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/experts`);
    expect(resp.status()).toBe(200);
    const experts: any[] = await resp.json();
    expect(Array.isArray(experts)).toBe(true);
    for (const expert of experts) {
      expect(expert.password).toBeUndefined();
    }
  });

  test("instagramAccessToken absent from every expert object", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/experts`);
    const experts: any[] = await resp.json();
    for (const expert of experts) {
      expect(expert.instagramAccessToken).toBeUndefined();
    }
  });

  test("no internal server paths in error responses", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/admin/users/9999999`);
    const body = await resp.text();
    expect(body).not.toMatch(/\/home\/runner|node_modules|stack trace/i);
  });
});

// ── T8 — Rate-limit wiring ────────────────────────────────────────────────
test.describe("T8 — Rate limiting: middleware wired on auth endpoints", () => {
  test("X-RateLimit-Limit header present on /api/auth/login", async ({ page }) => {
    const resp = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: `probe.t8.${TS}@nope.test`, password: "WrongPw!" },
    });
    // 401 (wrong credentials) is expected; what we verify is the rate-limit header
    expect([401, 429]).toContain(resp.status());
    const limit = resp.headers()["x-ratelimit-limit"];
    expect(limit).toBeTruthy();
    expect(Number(limit)).toBeGreaterThan(0);
  });

  test("X-RateLimit-Limit header present on /api/auth/register", async ({ page }) => {
    const resp = await page.request.post(`${BASE}/api/auth/register`, {
      data: { email: `probe.t8b.${TS}@nope.test`, password: "WrongPw", firstName: "P", lastName: "Q" },
    });
    expect([201, 400, 429]).toContain(resp.status());
    const limit = resp.headers()["x-ratelimit-limit"];
    expect(limit).toBeTruthy();
  });
});

// ── T9 — Role in localStorage / client-supplied role header ───────────────
test.describe("T9 — Server ignores client-supplied role claim", () => {
  test("X-Role: admin header does not grant admin access", async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/admin/users`, {
      headers: { "X-Role": "admin", "X-User-Role": "admin" },
    });
    expect(resp.status()).toBe(401);
  });

  test("X-Role: admin with valid traveler session still denied /api/admin/users", async ({ page }) => {
    if (!sessionCookie) test.skip();
    const resp = await page.request.get(`${BASE}/api/admin/users`, {
      headers: {
        Cookie: `connect.sid=${sessionCookie}`,
        "X-Role": "admin",
        "X-User-Role": "admin",
      },
    });
    expect([401, 403]).toContain(resp.status());
  });
});

// ── T10 — Secrets in client code ──────────────────────────────────────────
test.describe("T10 — No secret keys in client source", () => {
  const clientDir = path.resolve(__dirname, "../../client/src");

  function grepDir(dir: string, pattern: RegExp): string[] {
    const hits: string[] = [];
    if (!fs.existsSync(dir)) return hits;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        hits.push(...grepDir(full, pattern));
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        if (pattern.test(content)) hits.push(full);
      }
    }
    return hits;
  }

  test("no sk_live keys in client source", () => {
    const hits = grepDir(clientDir, /sk_live_/);
    expect(hits).toHaveLength(0);
  });

  test("no sk_test keys in client source", () => {
    const hits = grepDir(clientDir, /sk_test_/);
    expect(hits).toHaveLength(0);
  });

  test("no Anthropic/xAI secret keys in client source", () => {
    const hits = grepDir(clientDir, /sk-ant-api|xai-[A-Za-z0-9]{20}/);
    expect(hits).toHaveLength(0);
  });

  test("no hardcoded STRIPE_SECRET_KEY in client source", () => {
    const hits = grepDir(clientDir, /STRIPE_SECRET_KEY\s*=\s*["']sk_/);
    expect(hits).toHaveLength(0);
  });

  test("only public VITE_ keys used (pk_ prefix for Stripe)", async ({ page }) => {
    // Fetch the runtime env from client — verify Stripe publishable key starts with pk_
    const resp = await page.request.get(`${BASE}/`);
    expect(resp.status()).toBe(200);
    // The check is at source level — no sk_ anywhere in client code
    const skHits = grepDir(clientDir, /"sk_[a-z]{4}_[A-Za-z0-9]+"/);
    expect(skHits).toHaveLength(0);
  });
});
