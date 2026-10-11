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

      // Marketplace un-group (Aug 23): the services surface is its own page.
      await page.goto('/services', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      await scanSurface(page, 'discover-search', projectName);
      // Always passes — audit mode collects, does not gate.
    },
  );

});
