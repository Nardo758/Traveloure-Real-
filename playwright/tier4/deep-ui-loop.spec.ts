/**
 * Deep UI/UX loop for task #1637.
 *
 * This suite is deliberately local-only. It exercises rendered controls while
 * using API calls only for fixture/session setup and read-only verification.
 * Each browser project runs two responsive variants per surface.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import * as crypto from "crypto";
import {
  BASE_URL,
  TIER4_SEED,
  assertNotProduction,
  checkOverflow,
  collectConsole,
  findPricedService,
  saveScreenshot,
  seededIndex,
  writeEvidence,
} from "./helpers";
import { assertDisposableDb } from "../tests/journeys/_journey-helpers";

const ROLE_USERS = {
  expert: { email: "ci-expert@traveloure.test", password: "CITestExpert!99", role: /expert/ },
  provider: { email: "ci-provider@traveloure.test", password: "CITestProvider!99", role: /service_provider/ },
  admin: { email: "ci-admin@traveloure.test", password: "CITestAdmin!99", role: /admin/ },
} as const;

const VARIANTS = [
  { name: "desktop-keyboard", viewport: { width: 1365, height: 900 } },
  { name: "mobile-touch", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

type LoopResult = {
  variant: string;
  viewport: { width: number; height: number };
  routes?: string[];
  screenshot: string;
  noHorizontalOverflow: boolean;
  seriousA11y: number;
  criticalA11y: number;
  a11yFindings: Array<{ id: string; impact: string | null; help: string; nodes: number }>;
  consoleErrors: string[];
  details?: Record<string, unknown>;
  surfaceAudits?: SurfaceAudit[];
};

type SurfaceAudit = {
  surface: string;
  screenshot: string;
  noHorizontalOverflow: boolean;
  seriousA11y: number;
  criticalA11y: number;
  a11yFindings: Array<{ id: string; impact: string | null; help: string; nodes: number }>;
};

function uniqueEmail(label: string): string {
  return `deep-ui-${label}-${crypto.randomBytes(5).toString("hex")}@traveloure.test`;
}

async function createContext(browser: Browser, variant: (typeof VARIANTS)[number]): Promise<BrowserContext> {
  const supportsMobileEmulation = browser.browserType().name() !== "firefox";
  return browser.newContext({
    viewport: variant.viewport,
    ...(variant.isMobile && supportsMobileEmulation
      ? { isMobile: true, hasTouch: true }
      : {}),
  });
}

async function loginRole(context: BrowserContext, key: keyof typeof ROLE_USERS): Promise<void> {
  const actor = ROLE_USERS[key];
  const response = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: actor.email, password: actor.password },
  });
  expect(response.ok(), `${key} fixture login failed: ${response.status()} ${await response.text()}`).toBe(true);

  const session = await context.request.get(`${BASE_URL}/api/auth/session`);
  expect(session.ok(), `${key} session check failed`).toBe(true);
  const body = await session.json();
  expect(body.authenticated, `${key} fixture is not authenticated`).toBe(true);
  expect(String(body.user?.role ?? ""), `${key} fixture has the wrong role`).toMatch(actor.role);
}

async function registerTraveler(context: BrowserContext, label: string): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(label);
  const response = await context.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email,
      password: "DeepUiAudit!24",
      firstName: "DeepUI",
      lastName: "Audit",
      userType: "user",
    },
  });
  expect(response.ok(), `traveler registration failed: ${response.status()} ${await response.text()}`).toBe(true);
  const body = await response.json();
  await context.request.post(`${BASE_URL}/api/auth/accept-terms`, {
    data: { acceptTerms: true, acceptPrivacy: true },
  });
  return { id: String(body.user?.id), email };
}

async function auditPage(page: Page): Promise<
  Pick<LoopResult, "noHorizontalOverflow" | "seriousA11y" | "criticalA11y" | "a11yFindings">
> {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return {
    noHorizontalOverflow: await checkOverflow(page),
    seriousA11y: axe.violations.filter((v) => v.impact === "serious").length,
    criticalA11y: axe.violations.filter((v) => v.impact === "critical").length,
    a11yFindings: axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
  };
}

function relevantErrors(messages: { type: string; text: string }[]): string[] {
  return messages
    .filter((m) => m.type === "pageerror" || (m.type === "error" && /uncaught|typeerror|referenceerror|application error/i.test(m.text)))
    .map((m) => m.text);
}

async function expectMeaningfulRoute(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  expect(new URL(page.url()).pathname, `${route} redirected unexpectedly`).toBe(route);
  await expect(page.getByText(/404 - Lost at Sea|Application error|Something went wrong/i)).toHaveCount(0);
  const content = page.locator("main, [role=main]").first();
  await expect(content, `${route} must render a meaningful main surface`).toBeVisible({ timeout: 12_000 });
  expect((await content.innerText()).trim().length, `${route} rendered an empty shell`).toBeGreaterThan(20);
  expect(await checkOverflow(page), `${route} has horizontal overflow`).toBe(true);
}

async function auditSurface(page: Page, surface: string, screenshotName: string): Promise<SurfaceAudit> {
  return {
    surface,
    screenshot: await saveScreenshot(page, screenshotName),
    ...(await auditPage(page)),
  };
}

function summarizeSurfaceAudits(audits: SurfaceAudit[]) {
  return {
    screenshot: audits[0].screenshot,
    noHorizontalOverflow: audits.every((audit) => audit.noHorizontalOverflow),
    seriousA11y: audits.reduce((sum, audit) => sum + audit.seriousA11y, 0),
    criticalA11y: audits.reduce((sum, audit) => sum + audit.criticalA11y, 0),
    a11yFindings: audits.flatMap((audit) => audit.a11yFindings),
    surfaceAudits: audits,
  };
}

test.beforeEach(async ({ page }) => {
  await assertNotProduction(page);
});

test.beforeAll(async () => {
  const guardPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await assertDisposableDb(guardPool);
  } finally {
    await guardPool.end();
  }
});

test.describe("Deep UI QA loops", () => {
  test.describe.configure({ mode: "serial" });

  test("account/auth — two responsive rendered loops", async ({ browser }, testInfo) => {
    const loops: LoopResult[] = [];
    for (const variant of VARIANTS) {
      const context = await createContext(browser, variant);
      const page = await context.newPage();
      const consoleMessages = collectConsole(page);
      const surfaceAudits: SurfaceAudit[] = [];
      try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        if (variant.isMobile) {
          await page.getByTestId("button-mobile-menu").click();
          await page.getByTestId("button-mobile-sign-in").click();
        } else {
          await page.getByTestId("button-sign-in").click();
        }
        const modal = page.getByTestId("modal-sign-in");
        await expect(modal).toBeVisible();

        await page.getByTestId("input-email").fill("not-an-email");
        await page.getByTestId("input-password").fill(" ");
        await page.getByTestId("button-auth-submit").press("Enter");
        await expect(modal).toBeVisible();
        const authError = page.getByTestId("text-auth-error");
        await expect(authError).toHaveText("Enter a valid email address.", { timeout: 8_000 });
        await expect(page.getByTestId("input-email")).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByTestId("input-email")).toHaveAttribute("aria-describedby", "auth-form-error");
        await expect(page.getByTestId("input-email")).toBeFocused();
        surfaceAudits.push(await auditSurface(
          page,
          "sign-in-modal-invalid",
          `deep-auth-modal-invalid-${testInfo.project.name}-${variant.name}.png`,
        ));

        await page.getByTestId("link-forgot-password").click();
        await expect(page.getByTestId("button-auth-submit")).toContainText(/send reset link/i);
        await expect(page.getByTestId("input-password")).not.toBeVisible();
        surfaceAudits.push(await auditSurface(
          page,
          "sign-in-modal-reset",
          `deep-auth-modal-reset-${testInfo.project.name}-${variant.name}.png`,
        ));

        await page.getByTestId("link-back-signin").click();
        await page.getByTestId("link-switch-signup").click();
        await expect(page.getByTestId("input-first-name")).toBeVisible();
        await expect(page.getByTestId("input-last-name")).toBeVisible();
        await expect(page.getByTestId("checkbox-signup-terms")).toBeVisible();
        await expect(page.getByTestId("checkbox-signup-privacy")).toBeVisible();
        surfaceAudits.push(await auditSurface(
          page,
          "sign-in-modal-signup",
          `deep-auth-modal-signup-${testInfo.project.name}-${variant.name}.png`,
        ));

        await page.goto("/signup", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("input-name")).toBeVisible();
        await page.getByTestId("button-create-account").press("Enter");
        expect(new URL(page.url()).pathname).toBe("/signup");
        surfaceAudits.push(await auditSurface(
          page,
          "signup-page-validation",
          `deep-auth-signup-page-${testInfo.project.name}-${variant.name}.png`,
        ));
        loops.push({
          variant: variant.name,
          viewport: variant.viewport,
          ...summarizeSurfaceAudits(surfaceAudits),
          consoleErrors: relevantErrors(consoleMessages),
        });
      } finally {
        await context.close();
      }
    }
    expect(loops.every((loop) => loop.noHorizontalOverflow)).toBe(true);
    expect(loops.every((loop) => loop.consoleErrors.length === 0)).toBe(true);
    writeEvidence(`deep-auth-${testInfo.project.name}.json`, {
      seed: TIER4_SEED,
      chosenStep: "account-auth",
      engine: testInfo.project.name,
      project: testInfo.project.name,
      result: "PASS - two responsive rendered loops",
      loops,
      limitations: "Automated keyboard checks are not a claim of physical screen-reader coverage.",
    });
  });

  test("messaging/reviews — two disposable rendered loops", async ({ browser }, testInfo) => {
    const loops: LoopResult[] = [];
    for (const variant of VARIANTS) {
      const context = await createContext(browser, variant);
      const page = await context.newPage();
      const consoleMessages = collectConsole(page);
      const surfaceAudits: SurfaceAudit[] = [];
      try {
        await registerTraveler(context, `${testInfo.project.name}-${variant.name}`);
        const expertsResponse = await context.request.get(`${BASE_URL}/api/experts?limit=20`);
        expect(expertsResponse.ok()).toBe(true);
        const expertsBody = await expertsResponse.json();
        const experts = Array.isArray(expertsBody) ? expertsBody : (expertsBody.experts ?? expertsBody.data ?? []);
        const expert = experts.find((row: any) => String(row.id).length > 10);
        expect(expert, "A real expert UUID is required for the rendered chat loop").toBeTruthy();
        const name = `${expert.firstName ?? ""} ${expert.lastName ?? ""}`.trim() || "Audit expert";

        await page.goto(`/chat?expertId=${encodeURIComponent(expert.id)}&name=${encodeURIComponent(name)}`, {
          waitUntil: "domcontentloaded",
        });
        const input = page.getByTestId("input-message");
        await expect(input).toBeVisible({ timeout: 15_000 });
        const messageLog = page.getByRole("log", { name: "Message thread" });
        await expect(messageLog).toBeVisible();

        const marker = `deep-ui-${testInfo.project.name}-${variant.name}-${crypto.randomBytes(3).toString("hex")}`;
        const messages = [
          `${marker} hello 👋`,
          `${marker} ${"Long itinerary detail. ".repeat(10)}`,
          `${marker} rapid follow-up ✈️🌏`,
        ];
        for (const message of messages) {
          await input.fill(message);
          await page.getByTestId("button-send").click();
          await expect(input).toHaveValue("", { timeout: 10_000 });
          await expect(messageLog.getByText(message, { exact: true })).toHaveCount(1, { timeout: 12_000 });
        }
        surfaceAudits.push(await auditSurface(
          page,
          "chat-thread-after-rapid-messages",
          `deep-chat-${testInfo.project.name}-${variant.name}.png`,
        ));

        const service = await findPricedService(page);
        await page.goto(`/services/${service.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("text-service-name")).toBeVisible({ timeout: 12_000 });
        const reviewCards = page.locator('[data-testid^="card-review-"]');
        const reviewCount = await reviewCards.count();
        if (reviewCount === 0) {
          await expect(page.getByText(/no reviews|be the first/i).first()).toBeVisible({ timeout: 8_000 });
        }

        surfaceAudits.push(await auditSurface(
          page,
          "service-review-rendering",
          `deep-reviews-${testInfo.project.name}-${variant.name}.png`,
        ));
        loops.push({
          variant: variant.name,
          viewport: variant.viewport,
          ...summarizeSurfaceAudits(surfaceAudits),
          consoleErrors: relevantErrors(consoleMessages),
          details: { sentMessages: messages.length, duplicateCountsVerified: true, reviewCards: reviewCount },
        });
      } finally {
        await context.close();
      }
    }
    expect(loops.every((loop) => loop.noHorizontalOverflow)).toBe(true);
    expect(loops.every((loop) => loop.consoleErrors.length === 0)).toBe(true);
    writeEvidence(`deep-messaging-reviews-${testInfo.project.name}.json`, {
      seed: TIER4_SEED,
      chosenStep: "messaging-reviews",
      engine: testInfo.project.name,
      project: testInfo.project.name,
      result: "PASS - two disposable rendered loops",
      loops,
      limitations: "Review authoring requires a completed booking; this run audits real review rendering, not review submission.",
    });
  });

  test("provider/expert workspaces — two responsive role loops", async ({ browser }, testInfo) => {
    const loops: LoopResult[] = [];
    const routes = {
      expert: ["/expert/today", "/expert/inbox", "/expert/catalog", "/expert/money", "/expert/settings"],
      provider: ["/provider/dashboard", "/provider/inbox", "/provider/services", "/provider/money", "/provider/settings"],
    } as const;

    for (const variant of VARIANTS) {
      for (const role of ["expert", "provider"] as const) {
        const context = await createContext(browser, variant);
        const page = await context.newPage();
        const consoleMessages = collectConsole(page);
        const surfaceAudits: SurfaceAudit[] = [];
        try {
          await loginRole(context, role);
          for (const route of routes[role]) {
            await expectMeaningfulRoute(page, route);
            const routeSlug = route.replace(/^\/|\/$/g, "").replace(/\//g, "-");
            surfaceAudits.push(await auditSurface(
              page,
              route,
              `deep-${role}-${routeSlug}-${testInfo.project.name}-${variant.name}.png`,
            ));
          }
          await page.keyboard.press("Tab");
          loops.push({
            variant: `${variant.name}-${role}`,
            viewport: variant.viewport,
            routes: [...routes[role]],
            ...summarizeSurfaceAudits(surfaceAudits),
            consoleErrors: relevantErrors(consoleMessages),
          });
        } finally {
          await context.close();
        }
      }
    }
    expect(loops.every((loop) => loop.noHorizontalOverflow)).toBe(true);
    expect(loops.every((loop) => loop.consoleErrors.length === 0)).toBe(true);
    writeEvidence(`deep-provider-expert-${testInfo.project.name}.json`, {
      seed: TIER4_SEED,
      chosenStep: "provider-expert",
      engine: testInfo.project.name,
      project: testInfo.project.name,
      result: "PASS - two responsive loops for both roles",
      loops,
    });
  });

  test("admin — access boundary, five consoles, DB spot-checks, isolated destructive fixture", async ({ browser }, testInfo) => {
    const loops: LoopResult[] = [];
    const adminRoutes = ["/admin/users", "/admin/providers", "/admin/revenue", "/admin/payouts", "/admin/service-approvals"];
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      for (const variant of VARIANTS) {
        const surfaceAudits: SurfaceAudit[] = [];
        const travelerContext = await createContext(browser, variant);
        const traveler = await registerTraveler(travelerContext, `admin-boundary-${testInfo.project.name}-${variant.name}`);
        const travelerPage = await travelerContext.newPage();
        await travelerPage.goto("/admin/users", { waitUntil: "domcontentloaded" });
        await expect(travelerPage.getByRole("heading", { name: "Access Denied" })).toBeVisible({
          timeout: 12_000,
        });
        await expect(travelerPage.getByTestId("card-stat-total")).toHaveCount(0);
        surfaceAudits.push(await auditSurface(
          travelerPage,
          "non-admin-access-boundary",
          `deep-admin-boundary-${testInfo.project.name}-${variant.name}.png`,
        ));
        await travelerContext.close();

        const context = await createContext(browser, variant);
        const page = await context.newPage();
        const consoleMessages = collectConsole(page);
        try {
          await context.request.post(`${BASE_URL}/api/auth/logout`);
          await loginRole(context, "admin");
          for (const route of adminRoutes) {
            await expectMeaningfulRoute(page, route);
            const routeSlug = route.replace(/^\/|\/$/g, "").replace(/\//g, "-");
            surfaceAudits.push(await auditSurface(
              page,
              route,
              `deep-${routeSlug}-${testInfo.project.name}-${variant.name}.png`,
            ));
          }

          await page.goto("/admin/users", { waitUntil: "domcontentloaded" });
          const rows = page.locator('[data-testid^="row-user-"]');
          await expect(rows.first()).toBeVisible({ timeout: 15_000 });
          const rowIds = await rows.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-testid")!.replace("row-user-", "")),
          );
          expect(rowIds.length, "Admin user table must have at least three rows").toBeGreaterThanOrEqual(3);
          const start = seededIndex(`admin-db-${testInfo.project.name}-${variant.name}`, rowIds.length);
          const pickedIds = [0, 1, 2].map((offset) => rowIds[(start + offset) % rowIds.length]);
          const dbRows = await pool.query<{
            id: string;
            email: string | null;
            first_name: string | null;
            last_name: string | null;
            role: string | null;
            is_suspended: boolean;
          }>(
            `SELECT id, email, first_name, last_name, role, is_suspended
             FROM users WHERE id = ANY($1::varchar[])`,
            [pickedIds],
          );
          expect(dbRows.rows).toHaveLength(3);
          for (const dbUser of dbRows.rows) {
            const row = page.getByTestId(`row-user-${dbUser.id}`);
            await expect(row).toContainText(dbUser.email ?? "");
            await expect(row).toContainText(dbUser.is_suspended ? "suspended" : "active");
          }

          await page.getByTestId("input-search-users").fill(traveler.email);
          const fixtureRow = page.getByTestId(`row-user-${traveler.id}`);
          await expect(fixtureRow).toBeVisible({ timeout: 12_000 });
          await page.getByTestId(`button-more-${traveler.id}`).click();
          await page.getByTestId(`menu-suspend-${traveler.id}`).click();
          await expect(page.getByTestId("dialog-suspend-user")).toBeVisible();
          await page.getByTestId("input-suspend-reason").fill("Task 1637 isolated audit fixture");
          await page.getByTestId("button-suspend-confirm").click();
          await expect(fixtureRow).toContainText("suspended", { timeout: 12_000 });
          await page.getByTestId(`button-more-${traveler.id}`).click();
          await page.getByTestId(`menu-reactivate-${traveler.id}`).click();
          await expect(fixtureRow).toContainText("active", { timeout: 12_000 });

          surfaceAudits.push(await auditSurface(
            page,
            "admin-users-after-suspend-reactivate",
            `deep-admin-users-reverified-${testInfo.project.name}-${variant.name}.png`,
          ));
          loops.push({
            variant: variant.name,
            viewport: variant.viewport,
            routes: adminRoutes,
            ...summarizeSurfaceAudits(surfaceAudits),
            consoleErrors: relevantErrors(consoleMessages),
            details: {
              dbRecordsChecked: pickedIds.length,
              accessBoundaryVerified: true,
              destructiveFixtureSuspendedAndReactivated: traveler.id,
            },
          });
        } finally {
          await context.close();
        }
      }
    } finally {
      await pool.end();
    }
    expect(loops.every((loop) => loop.noHorizontalOverflow)).toBe(true);
    expect(loops.every((loop) => loop.consoleErrors.length === 0)).toBe(true);
    writeEvidence(`deep-admin-${testInfo.project.name}.json`, {
      seed: TIER4_SEED,
      chosenStep: "admin",
      engine: testInfo.project.name,
      project: testInfo.project.name,
      result: "PASS - two responsive admin loops",
      loops,
    });
  });
});