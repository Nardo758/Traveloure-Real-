/**
 * rbac-security.spec.ts
 *
 * Role-Based Access Control security test suite for Traveloure.
 * Verifies that every protected frontend route and API endpoint is
 * inaccessible to users with insufficient roles.
 *
 * ── Architecture notes ───────────────────────────────────────────────────────
 *
 * Frontend guard (client/src/App.tsx → ProtectedRoute):
 *   When requiredRole doesn't match, shows inline "Access Denied" page.
 *   Does NOT redirect — the URL stays but the component is NOT mounted.
 *
 * Role hierarchy (client/src/lib/role-utils.ts → userHasRequiredRole):
 *   admin           → bypasses every requiredRole check
 *   requiredRole="expert"  → EXPERT_ROLES = [expert, local_expert, travel_expert,
 *                            event_planner, executive_assistant]
 *   requiredRole="provider" → PROVIDER_ROLES = [service_provider]
 *   requiredRole="executive_assistant" → only executive_assistant (exact)
 *
 * API blanket guards (server/routes.ts):
 *   /api/admin/*    → adminApiGuard  (DB-verified: role === "admin")
 *   /api/expert/*   → isExpert guard (DB-verified: EXPERT_ROLES or admin)
 *   /api/provider/* → isProvider guard (DB-verified: PROVIDER_ROLES or admin)
 *   /api/ea/*       → isEA guard     (DB-verified: executive_assistant or admin)
 *   All guards query the DB — they never trust client-supplied role values.
 *
 * ── Test accounts (REPOINTED Aug 16, 2026 — see the security note below) ──────
 *   test-traveler-kyoto@traveloure.test  → role: user
 *   kyoto-food@traveloure.test           → role: travel_expert
 *   kyoto-photography@traveloure.test    → role: service_provider
 *   test-admin@traveloure.test           → role: admin
 *   test-ea@traveloure.test              → role: executive_assistant
 *
 *   WHY THESE AND NOT THE ORIGINAL FIVE. This spec was written against
 *   `<role>@traveloure-test.com` — accounts NO seeder has ever created, so its
 *   beforeAll 401'd and all 27 assertions have never executed once (spec-coverage
 *   sweep, Aug 16 2026). The fix is NOT to seed that domain. `traveloure-test.com`
 *   is a REGISTERABLE .com; the production purge in
 *   `server/seeds/e2e-test-accounts.seed.ts` neutralizes `LIKE '%@traveloure.test'`
 *   — the RFC-2606 reserved TLD — and would NOT match it. Seeding an admin-role
 *   credential there puts it outside the ruling 27/33 safety net. So the spec is
 *   repointed onto the purge-covered fixtures that already exist with passwords.
 *   Any future role fixture must live under `.test` for the same reason.
 *
 *   AND IT MUST SURVIVE A FRESH DATABASE. The first repoint used `kyoto-temples@traveloure.test`,
 *   which exists on a long-lived dev bench but is created by NO seeder that CI runs — so this
 *   spec passed locally and failed in CI with "Could not log in roles: expert". The five above are
 *   all present, with passwords, on a database built by nothing but
 *   `migrate-entry` + `create-sessions-table` + `seed-ci-test-users` (what ci-db-setup does).
 *
 * ── Session strategy ─────────────────────────────────────────────────────────
 *   Each role is logged in ONCE in test.beforeAll (5 total POST /api/auth/login
 *   requests).  Session cookies are saved and restored per-test via
 *   context.addCookies() so the login rate-limiter (20 req / 15 min) is
 *   never triggered.
 *
 * Run: npx playwright test playwright/tests/rbac-security.spec.ts --workers=1
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const PW = process.env.E2E_TEST_PASSWORD || "TestPass123!";  // the e2e seeder's password

const ACCOUNTS = {
  traveler: {
    email: "test-traveler-kyoto@traveloure.test",
    password: PW,
    role: "user",
  },
  expert: {
    email: "kyoto-food@traveloure.test",
    password: PW,
    role: "travel_expert",
  },
  provider: {
    email: "kyoto-photography@traveloure.test",
    password: PW,
    role: "service_provider",
  },
  admin: {
    email: "test-admin@traveloure.test",
    password: PW,
    role: "admin",
  },
  ea: {
    email: "test-ea@traveloure.test",
    password: PW,
    role: "executive_assistant",
  },
} as const;

type Role = keyof typeof ACCOUNTS;

// Protected frontend routes per section that must be denied to wrong roles
const EXPERT_PAGES = [
  "/expert/dashboard",
  "/expert/assigned-trips",
  "/expert/earnings",
];
const PROVIDER_PAGES = [
  "/provider/dashboard",
  "/provider/services",
  "/provider/earnings",
];
const ADMIN_PAGES = [
  "/admin/dashboard",
  "/admin/users",
  "/admin/revenue",
  // New routes added since last audit
  "/admin/service-requests",
  "/admin/neighborhood-backfill",
  "/admin/gem-photo-backfill",
];
const EA_PAGES = ["/ea/dashboard"];

// API endpoints to probe per role
const ADMIN_API = ["/api/admin/revenue", "/api/admin/users"];
const EXPERT_API = ["/api/expert/dashboard"];
const PROVIDER_API = ["/api/provider/dashboard"];
const EA_API = ["/api/ea/dashboard"];

// ── Shared session state (populated once in beforeAll) ────────────────────────
// Keyed by Role; value is the Playwright StorageState object.
const sessionStates: Partial<Record<Role, { cookies: any[]; origins: any[] }>> =
  {};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Restore a saved session into a context WITHOUT making a new login request. */
async function restoreSession(ctx: BrowserContext, role: Role) {
  const state = sessionStates[role];
  if (!state) throw new Error(`No saved session for role "${role}"`);
  if (state.cookies?.length) await ctx.addCookies(state.cookies);
}

/**
 * Navigate to a path and determine whether access was denied.
 *
 * Returns true when either:
 *   (a) The ProtectedRoute "Access Denied" heading appears, OR
 *   (b) The browser was redirected away from the target path.
 *
 * Waits up to 10 s for condition (a); falls back to URL check if the
 * selector times out.
 */
async function isAccessDenied(page: Page, path: string): Promise<boolean> {
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  try {
    await page.waitForSelector("text=Access Denied", { timeout: 10_000 });
    return true;
  } catch {
    // Selector timed out — check if we were redirected
    const currentUrl = page.url();
    if (!currentUrl.includes(path)) {
      return true; // redirected away = access denied
    }
    // Still on the page — check body text as final fallback
    const text = (await page.textContent("body")) ?? "";
    return (
      text.includes("Access Denied") ||
      text.includes("don't have permission")
    );
  }
}

/** Hit an API path and return its HTTP status. */
async function apiStatus(
  page: Page,
  path: string,
  method: "GET" | "POST" = "GET"
): Promise<number> {
  const fn =
    method === "GET"
      ? page.request.get.bind(page.request)
      : page.request.post.bind(page.request);
  const resp = await fn(`${BASE_URL}${path}`);
  return resp.status();
}

// ── One-time setup: login each role ONCE and save cookies ────────────────────

test.beforeAll(async ({ browser }) => {
  for (const [key, account] of Object.entries(ACCOUNTS) as [
    Role,
    (typeof ACCOUNTS)[Role],
  ][]) {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();

    const resp = await pg.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: account.email, password: account.password },
      headers: { "Content-Type": "application/json" },
    });

    if (resp.ok()) {
      sessionStates[key] = await ctx.storageState();
    } else {
      const body = await resp.text().catch(() => "");
      console.warn(
        `[rbac-setup] Login FAILED for ${account.email}: ${resp.status()} — ${body.slice(0, 120)}`
      );
    }

    await ctx.close();
  }

  // Sanity: all 5 roles must have a session
  const missing = (Object.keys(ACCOUNTS) as Role[]).filter(
    (r) => !sessionStates[r]
  );
  if (missing.length) {
    throw new Error(
      `[rbac-setup] Could not log in roles: ${missing.join(", ")}. ` +
        "Check credentials and rate-limiter skip for localhost."
    );
  }
});

// ── Section A: Static bypass scan ────────────────────────────────────────────

test.describe("A — Static bypass scan", () => {
  test("no || true bypass near auth checks in client or server code", async () => {
    const { execSync } = await import("child_process");

    const authPattern =
      /isAuth|isAdmin|isExpert|isProvider|isEA|requiredRole|adminApiGuard/i;

    const clientLines = execSync(
      "grep -rn '|| true' client/src --include='*.tsx' || true",
      { cwd: process.cwd(), encoding: "utf8" }
    )
      .split("\n")
      .filter((l) => authPattern.test(l));

    const serverLines = execSync(
      "grep -rn '|| true' server --include='*.ts' || true",
      { cwd: process.cwd(), encoding: "utf8" }
    )
      .split("\n")
      .filter((l) => authPattern.test(l));

    expect(
      clientLines,
      `Client || true bypass near auth:\n${clientLines.join("\n")}`
    ).toHaveLength(0);
    expect(
      serverLines,
      `Server || true bypass near auth:\n${serverLines.join("\n")}`
    ).toHaveLength(0);
  });

  test("client-side isAdmin/isExpert are cosmetic only — not gating API calls", async () => {
    const { execSync } = await import("child_process");
    const apiCallPat = /fetch\s*\(|apiRequest\s*\(|axios\s*\(/;

    const isAdminLines = execSync(
      "grep -rn 'isAdmin' client/src --include='*.tsx' || true",
      { cwd: process.cwd(), encoding: "utf8" }
    )
      .split("\n")
      .filter((l) => l.trim());

    const isExpertLines = execSync(
      "grep -rn 'isExpert' client/src --include='*.tsx' || true",
      { cwd: process.cwd(), encoding: "utf8" }
    )
      .split("\n")
      .filter((l) => l.trim());

    const dangerous = [...isAdminLines, ...isExpertLines].filter((l) =>
      apiCallPat.test(l)
    );
    expect(
      dangerous,
      `Client isAdmin/isExpert gating API calls (bypassable):\n${dangerous.join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Section B: Traveler blocked from all protected pages ─────────────────────

test.describe("B — Traveler (role=user) cannot access protected pages", () => {
  test.setTimeout(120_000);

  test("traveler blocked from expert pages", async ({ page }) => {
    await restoreSession(page.context(), "traveler");
    for (const path of EXPERT_PAGES) {
      const denied = await isAccessDenied(page, path);
      expect(denied, `Traveler must be denied at ${path}`).toBe(true);
    }
  });

  test("traveler blocked from provider pages", async ({ page }) => {
    await restoreSession(page.context(), "traveler");
    for (const path of PROVIDER_PAGES) {
      const denied = await isAccessDenied(page, path);
      expect(denied, `Traveler must be denied at ${path}`).toBe(true);
    }
  });

  test("traveler blocked from all admin pages including 3 new routes", async ({
    page,
  }) => {
    await restoreSession(page.context(), "traveler");
    for (const path of ADMIN_PAGES) {
      const denied = await isAccessDenied(page, path);
      expect(denied, `Traveler must be denied at ${path}`).toBe(true);
    }
  });

  test("traveler blocked from EA pages", async ({ page }) => {
    await restoreSession(page.context(), "traveler");
    for (const path of EA_PAGES) {
      const denied = await isAccessDenied(page, path);
      expect(denied, `Traveler must be denied at ${path}`).toBe(true);
    }
  });
});

// ── Section C: Expert blocked from non-expert pages ──────────────────────────

test.describe(
  "C — Expert (role=local_expert) cannot access provider or admin pages",
  () => {
    test.setTimeout(120_000);

    test("expert blocked from provider pages", async ({ page }) => {
      await restoreSession(page.context(), "expert");
      for (const path of PROVIDER_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `Expert must be denied at ${path}`).toBe(true);
      }
    });

    test("expert blocked from admin pages", async ({ page }) => {
      await restoreSession(page.context(), "expert");
      for (const path of ADMIN_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `Expert must be denied at ${path}`).toBe(true);
      }
    });

    test("expert blocked from EA pages", async ({ page }) => {
      await restoreSession(page.context(), "expert");
      for (const path of EA_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(
          denied,
          `Expert must be denied at ${path} (requiredRole=executive_assistant, exact match)`
        ).toBe(true);
      }
    });
  }
);

// ── Section D: Provider blocked from non-provider pages ──────────────────────

test.describe(
  "D — Provider (role=service_provider) cannot access expert or admin pages",
  () => {
    test.setTimeout(120_000);

    test("provider blocked from expert pages", async ({ page }) => {
      await restoreSession(page.context(), "provider");
      for (const path of EXPERT_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `Provider must be denied at ${path}`).toBe(true);
      }
    });

    test("provider blocked from admin pages", async ({ page }) => {
      await restoreSession(page.context(), "provider");
      for (const path of ADMIN_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `Provider must be denied at ${path}`).toBe(true);
      }
    });

    test("provider blocked from EA pages", async ({ page }) => {
      await restoreSession(page.context(), "provider");
      for (const path of EA_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `Provider must be denied at ${path}`).toBe(true);
      }
    });
  }
);

// ── Section E: EA blocked from provider and admin; allowed on expert ──────────

test.describe(
  "E — EA (role=executive_assistant) cannot access provider or admin pages",
  () => {
    test.setTimeout(120_000);

    test("EA blocked from provider pages", async ({ page }) => {
      await restoreSession(page.context(), "ea");
      for (const path of PROVIDER_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `EA must be denied at ${path}`).toBe(true);
      }
    });

    test("EA blocked from admin pages", async ({ page }) => {
      await restoreSession(page.context(), "ea");
      for (const path of ADMIN_PAGES) {
        const denied = await isAccessDenied(page, path);
        expect(denied, `EA must be denied at ${path}`).toBe(true);
      }
    });

    test("EA is blocked from expert pages — EA is its own namespace, NOT expert-family", async ({
      page,
    }) => {
      await restoreSession(page.context(), "ea");
      // INVERTED Aug 16, 2026 — this test asserted the OPPOSITE and the product was right.
      //
      // It claimed "executive_assistant is in EXPERT_ROLES (by design)" and required
      // /expert/dashboard to be ALLOWED. That was true when it was written, and the
      // role-vocabulary audit (Jul 27 2026) deliberately ended it: `server/middleware/role-rbac.ts`
      // used to carry its own EXPERT_ROLES list that INCLUDED executive_assistant, diverging from
      // the client and from the ratified EA-console model (§9 — EA is its own /ea namespace gated
      // by isEA, consuming /api/ea/* only). Dropping EA from the expert family was the point of
      // that audit, and `shared/roles.ts` EXPERT_ROLES is now
      // ["expert","local_expert","travel_expert","event_planner"] — no EA.
      //
      // The spec never ran after that ruling (its fixtures did not exist, so beforeAll 401'd and
      // all 28 tests were skipped), so it went on asserting the superseded model in silence. It
      // now asserts the ratified one: EA denied at expert pages.
      const denied = await isAccessDenied(page, "/expert/dashboard");
      expect(
        denied,
        "EA must be denied at /expert/dashboard (EXPERT_ROLES excludes executive_assistant since the Jul 27 2026 role-vocabulary audit)"
      ).toBe(true);
    });
  }
);

// ── Section F: API endpoint status codes ─────────────────────────────────────

test.describe(
  "F — API returns 401/403 for unauthenticated and wrong-role requests",
  () => {
    test.setTimeout(60_000);

    test("unauthenticated: all protected APIs return 401", async ({ page }) => {
      // Fresh context — no cookies set
      for (const path of [
        ...ADMIN_API,
        ...EXPERT_API,
        ...PROVIDER_API,
        ...EA_API,
      ]) {
        const status = await apiStatus(page, path);
        expect(
          status,
          `Unauthenticated ${path} should return 401`
        ).toBe(401);
      }
    });

    test("traveler gets 403 on admin, expert, provider, EA APIs", async ({
      page,
    }) => {
      await restoreSession(page.context(), "traveler");
      for (const path of [
        ...ADMIN_API,
        ...EXPERT_API,
        ...PROVIDER_API,
        ...EA_API,
      ]) {
        const status = await apiStatus(page, path);
        expect(
          [403, 404],
          `Traveler ${path} must be 403/404, got ${status}`
        ).toContain(status);
      }
    });

    test("expert gets 403 on admin, provider, EA APIs", async ({ page }) => {
      await restoreSession(page.context(), "expert");
      for (const path of [...ADMIN_API, ...PROVIDER_API, ...EA_API]) {
        const status = await apiStatus(page, path);
        expect(
          [403, 404],
          `Expert ${path} must be 403/404, got ${status}`
        ).toContain(status);
      }
    });

    test("provider gets 403 on admin, expert, EA APIs", async ({ page }) => {
      await restoreSession(page.context(), "provider");
      for (const path of [...ADMIN_API, ...EXPERT_API, ...EA_API]) {
        const status = await apiStatus(page, path);
        expect(
          [403, 404],
          `Provider ${path} must be 403/404, got ${status}`
        ).toContain(status);
      }
    });

    test("EA gets 403 on admin and provider APIs", async ({ page }) => {
      await restoreSession(page.context(), "ea");
      for (const path of [...ADMIN_API, ...PROVIDER_API]) {
        const status = await apiStatus(page, path);
        expect(
          [403, 404],
          `EA ${path} must be 403/404, got ${status}`
        ).toContain(status);
      }
    });
  }
);

// ── Section G: User-menu shows only role-appropriate links ───────────────────
//
// Role-specific console links live in the Shadcn DropdownMenu inside
// UserMenu (data-testid="button-user-menu").  The dropdown content is
// not in the DOM until opened, so each test clicks the trigger first.

test.describe("G — User-menu shows only role-appropriate console links", () => {
  test.setTimeout(60_000);

  /** Open the user-menu dropdown and return the resulting menu HTML. */
  async function openUserMenu(page: Page): Promise<string> {
    await page.goto(`${BASE_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Wait for the user menu trigger to appear (auth hook resolved)
    await page.waitForSelector('[data-testid="button-user-menu"]', {
      timeout: 10_000,
    });
    await page.click('[data-testid="button-user-menu"]');
    // Wait for dropdown content to mount
    await page.waitForTimeout(500);
    return (await page.locator("body").innerHTML()).toLowerCase();
  }

  test("traveler user-menu has no expert/admin/provider console links", async ({
    page,
  }) => {
    await restoreSession(page.context(), "traveler");
    const html = await openUserMenu(page);
    expect(html).not.toContain('data-testid="link-expert-console"');
    expect(html).not.toContain('data-testid="link-admin-console"');
    expect(html).not.toContain('data-testid="link-provider-console"');
    expect(html).not.toContain('data-testid="link-ea-console"');
  });

  test("expert user-menu shows Expert Console link", async ({ page }) => {
    await restoreSession(page.context(), "expert");
    const html = await openUserMenu(page);
    expect(
      html,
      "Expert should see link-expert-console in user menu"
    ).toContain("link-expert-console");
  });

  test("provider user-menu shows Provider Console link", async ({ page }) => {
    await restoreSession(page.context(), "provider");
    const html = await openUserMenu(page);
    expect(
      html,
      "Provider should see link-provider-console in user menu"
    ).toContain("link-provider-console");
  });

  test("admin user-menu shows Admin Panel link", async ({ page }) => {
    await restoreSession(page.context(), "admin");
    const html = await openUserMenu(page);
    expect(html, "Admin should see link-admin-console in user menu").toContain(
      "link-admin-console"
    );
  });
});

// ── Section H: Privilege escalation attacks ───────────────────────────────────

test.describe("H — Privilege escalation attacks are rejected", () => {
  test.setTimeout(60_000);

  test("H1: localStorage role injection does not grant API access", async ({
    page,
  }) => {
    await restoreSession(page.context(), "traveler");
    await page.goto(`${BASE_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Inject elevated role into every client-side storage key
    await page.evaluate(() => {
      localStorage.setItem("role", "admin");
      localStorage.setItem("userRole", "admin");
      sessionStorage.setItem("role", "admin");
      sessionStorage.setItem("userRole", "admin");
    });

    // Server must still return 403 because it reads role from DB
    const status = await apiStatus(page, "/api/admin/revenue");
    expect(
      [401, 403],
      `localStorage injection must be rejected, got ${status}`
    ).toContain(status);
  });

  test("H2: X-Role header injection does not grant API access", async ({
    page,
  }) => {
    await restoreSession(page.context(), "traveler");

    const resp = await page.request.get(`${BASE_URL}/api/admin/revenue`, {
      headers: {
        "X-User-Role": "admin",
        "X-Role": "admin",
        role: "admin",
      },
    });
    expect(
      [401, 403],
      `Header role injection must be rejected, got ${resp.status()}`
    ).toContain(resp.status());
  });

  test("H3: role=admin in request body does not grant API access", async ({
    page,
  }) => {
    await restoreSession(page.context(), "traveler");

    const resp = await page.request.post(`${BASE_URL}/api/admin/users`, {
      data: { role: "admin", userRole: "admin" },
      headers: { "Content-Type": "application/json" },
    });
    expect(
      [401, 403, 404, 405],
      `Body role injection must be rejected, got ${resp.status()}`
    ).toContain(resp.status());
  });

  test("H4: unauthenticated request cannot see any admin content", async ({
    page,
  }) => {
    // No cookies at all
    await page.goto(`${BASE_URL}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);

    const adminText = ((await page.textContent("body")) ?? "").toLowerCase();
    const noAdminContent =
      !adminText.includes("user management") &&
      !adminText.includes("revenue overview") &&
      !adminText.includes("platform analytics");
    expect(noAdminContent, "Unauthenticated user must not see admin content").toBe(
      true
    );

    const status = await apiStatus(page, "/api/admin/revenue");
    expect(status, "Unauthenticated /api/admin/revenue must return 401").toBe(401);
  });
});
