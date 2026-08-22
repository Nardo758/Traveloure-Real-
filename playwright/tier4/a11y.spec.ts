/**
 * playwright/tier4/a11y.spec.ts
 *
 * Tier 4 accessibility audit using @axe-core/playwright.
 * Scans: discover/search, cart/checkout (authenticated), public expert profile.
 *
 * Does NOT fail early due to violations — collects everything and writes
 * per-surface JSON evidence grouped by critical/serious/moderate/minor.
 * Each violation includes up to 5 node targets, truncated HTML, and
 * failureSummary for actionable triage.
 *
 * Expert profile: derives a real href from GET /api/experts via page.request
 * (no hardcoded ID). Deterministic pick varies by seed + project name.
 *
 * Non-production guard applied to all tests that create data.
 * All API calls use page.request (shared cookie jar).
 *
 * Evidence: docs/audits/tier4-evidence/a11y-{surface}-{project}.json
 *
 * Run:
 *   npx playwright test --config playwright/tier4/playwright.config.ts a11y.spec.ts
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  BASE_URL,
  TIER4_SEED,
  seededPick,
  assertNotProduction,
  registerAndLogin,
  addToCartApi,
  findPricedService,
  saveScreenshot,
  writeEvidence,
} from './helpers';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const EVIDENCE_DIR = path.resolve(_dirname, '../../docs/audits/tier4-evidence');

// ── Violation detail type ─────────────────────────────────────────────────────

interface ViolationDetail {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodeCount: number;
  // Up to 5 node targets with truncated HTML and failureSummary
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

// ── Violation grouper ─────────────────────────────────────────────────────────

function groupViolations(violations: any[]): Record<string, ViolationDetail[]> {
  const groups: Record<string, ViolationDetail[]> = {
    critical: [],
    serious: [],
    moderate: [],
    minor: [],
    other: [],
  };
  for (const v of violations) {
    const impact = (v.impact ?? 'other') as string;
    const bucket = groups[impact] ?? groups.other;
    const topNodes = (v.nodes ?? []).slice(0, 5).map((n: any) => ({
      target: Array.isArray(n.target) ? n.target.map((t: any) => String(t)) : [],
      html: String(n.html ?? '').slice(0, 200),
      failureSummary: String(n.failureSummary ?? '').slice(0, 300),
    }));
    bucket.push({
      id: v.id,
      impact: v.impact ?? null,
      description: String(v.description ?? ''),
      help: String(v.help ?? ''),
      helpUrl: String(v.helpUrl ?? ''),
      nodeCount: (v.nodes ?? []).length,
      nodes: topNodes,
    });
  }
  return groups;
}

// ── Surface scanner ───────────────────────────────────────────────────────────

async function scanSurface(
  page: import('@playwright/test').Page,
  surfaceName: string,
  projectName: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, ViolationDetail[]>> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const grouped = groupViolations(results.violations);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const totalViolations = results.violations.length;
  const totalNodes = results.violations.reduce(
    (acc, v) => acc + (v.nodes?.length ?? 0),
    0,
  );

  const evidenceFile = path.join(EVIDENCE_DIR, `a11y-${surfaceName}-${projectName}.json`);
  const ssRel = await saveScreenshot(page, `a11y-${surfaceName}-${projectName}.png`);

  fs.writeFileSync(
    evidenceFile,
    JSON.stringify({
      seed: TIER4_SEED,
      chosenStep: surfaceName,
      engine: projectName,
      project: projectName,
      surface: surfaceName,
      url: page.url(),
      scannedAt: new Date().toISOString(),
      result: `${totalViolations} violation types, ${totalNodes} affected nodes`,
      totalViolations,
      totalNodes,
      violations: grouped,
      incompletes: results.incomplete?.length ?? 0,
      passes: results.passes?.length ?? 0,
      screenshot: ssRel,
      limitations:
        'Violations reported but do not cause test failure (audit mode). ' +
        'Dynamic content and Stripe iframes are not scanned. ' +
        'Node HTML truncated to 200 chars; failureSummary to 300 chars.',
      ...extra,
    }, null, 2),
    'utf-8',
  );

  console.log(
    `[a11y][${projectName}] ${surfaceName}: ${totalViolations} violations ` +
      `(${grouped.critical?.length ?? 0} critical, ${grouped.serious?.length ?? 0} serious) ` +
      `| screenshot: ${ssRel}`,
  );

  return grouped;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Tier4 — a11y audit (axe-core)', () => {
  test.describe.configure({ mode: 'serial' });

  test(
    'T4-a11y: scan discover/search surface',
    { timeout: 60_000 },
    async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;

      await page.goto('/discover', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // Click services tab for a deeper scan of the services surface
      const servicesTab = page.getByTestId('tab-services');
      if (await servicesTab.isVisible().catch(() => false)) {
        await servicesTab.click();
        await page.waitForTimeout(1500);
      }

      await scanSurface(page, 'discover-search', projectName);
      // Always passes — audit mode collects, does not gate.
    },
  );

  test(
    'T4-a11y: scan cart/checkout surface',
    { timeout: 120_000 },
    async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;

      // Non-production guard before creating data
      await assertNotProduction(page);

      // Register a user with page.request so the cookie jar is shared
      await registerAndLogin(page, `a11y-crt-${projectName.slice(0, 3)}`);
      const svc = await findPricedService(page);
      // Add to cart via page.request — shares the same authenticated session
      await addToCartApi(page, svc.id);

      await page.goto('/cart', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      await scanSurface(page, 'cart-checkout', projectName, {
        serviceId: svc.id,
        serviceName: svc.name,
      });

      // Navigate to payment step for additional scan if possible
      const proceedBtn = page.locator(
        '[data-testid="button-skip-to-payment"], [data-testid="button-proceed-payment"]',
      ).first();
      if (await proceedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await proceedBtn.click();
        await page.waitForTimeout(2000);
        await scanSurface(page, 'cart-checkout-payment', projectName, {
          serviceId: svc.id,
        });
      }
    },
  );

  test(
    'T4-a11y: scan public expert profile surface',
    { timeout: 60_000 },
    async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;

      // Derive a real expert profile href using page.request — no hardcoded ID
      const expertsRes = await page.request.get(`${BASE_URL}/api/experts?limit=20`);
      expect(expertsRes.ok(), `experts API failed: ${expertsRes.status()}`).toBe(true);
      const expertsBody = await expertsRes.json().catch(() => ({}));
      const expertsList: any[] = Array.isArray(expertsBody)
        ? expertsBody
        : (expertsBody.experts ?? expertsBody.data ?? []);

      expect(expertsList.length, 'expected at least one expert in the DB').toBeGreaterThan(0);

      // Deterministic pick varies by seed + project so engines scan different profiles
      const picked = seededPick(expertsList, `a11y-expert-profile-${projectName}`);
      const expertId = picked.id as string;
      const expertHref = `/experts/${expertId}`;

      await page.goto(expertHref, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      // Verify it's a real profile page (not 404)
      const is404 = await page
        .locator('h1')
        .filter({ hasText: /404|not found/i })
        .isVisible()
        .catch(() => false);

      if (is404) {
        writeEvidence(`a11y-expert-profile-${projectName}.json`, {
          seed: TIER4_SEED,
          chosenStep: 'expert-profile',
          engine: projectName,
          project: projectName,
          result: `BLOCKED - expert ${expertId} returned 404; scan not performed`,
          limitations: 'Expert profile returned 404. Axe scan was not run.',
          expertId,
          expertHref,
        });
        console.log(`[a11y] expert profile ${projectName}: 404 for ${expertId}`);
        return;
      }

      await scanSurface(page, `expert-profile-${projectName}`, projectName, {
        expertId,
        expertHref,
        expertName: picked.firstName ?? picked.name ?? picked.displayName ?? expertId,
      });
    },
  );
});
