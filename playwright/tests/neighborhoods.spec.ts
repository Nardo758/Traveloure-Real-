import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/verify-neighborhoods.ts');

/**
 * Neighborhoods gate integrity spec — pure static analysis, no browser or DB.
 *
 * Guards against `scripts/verify-neighborhoods.ts` being silently broken, truncated,
 * or stripped of checks — which would cause the neighborhoods-gate to report "GATE PASSED"
 * even though the logic under test has been removed.
 *
 * Runs in neighborhoods-gate.yml.  No server, browser, or database required.
 */

test.describe('neighborhoods gate — spec integrity checks', () => {
  let src: string;

  test.beforeAll(() => {
    expect(
      fs.existsSync(SCRIPT_PATH),
      `Script not found: scripts/verify-neighborhoods.ts — restore or update the path in neighborhoods-gate.yml`,
    ).toBe(true);
    src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  });

  test('script contains exactly 16 check() assertions', () => {
    const calls = src.match(/\bcheck\s*\(/g) ?? [];
    // The function *definition* also matches — subtract 1 for `function check(`.
    const definitions = src.match(/function\s+check\s*\(/g)?.length ?? 0;
    const assertions = calls.length - definitions;
    expect(assertions).toBe(16);
  });

  test('script covers market-mismatch guard (rule 1)', () => {
    expect(src).toContain('checkMarket');
    expect(src).toContain('"match"');
    expect(src).toContain('"mismatch"');
    expect(src).toContain('"missing"');
  });

  test('script covers adjacency self-loop rejection (rule 2)', () => {
    expect(src).toContain('isSelfLoop');
  });

  test('script covers cross-market slug validation (rule 3)', () => {
    expect(src).toContain('crossMarketSlugs');
  });

  test('script exits 1 on failure (does not silently pass)', () => {
    expect(src).toContain('process.exit(1)');
  });

  test('script prints pass/fail summary', () => {
    expect(src).toContain('passed');
    expect(src).toContain('failed');
  });
});
