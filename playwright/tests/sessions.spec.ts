import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/create-sessions-table.ts');

/**
 * Sessions table script integrity spec — pure static analysis, no browser or DB.
 *
 * Guards against `scripts/create-sessions-table.ts` being silently broken or stripped of
 * required SQL — which would cause every downstream Playwright CI gate to fail with a
 * cryptic connect-pg-simple error instead of surfacing the root cause here.
 *
 * Verifies:
 *   - The script file exists at its expected path
 *   - The sessions table DDL is present and uses IF NOT EXISTS (idempotent)
 *   - The sessions_pkey primary key constraint is present (idempotent DO $$ block)
 *   - The IDX_sessions_expire index is present and uses IF NOT EXISTS (idempotent)
 *   - The script exits non-zero on error (does not swallow failures)
 *
 * Runs in sessions-table-smoke.yml.  No server, browser, or database required.
 */

test.describe('sessions table script — spec integrity checks', () => {
  let src: string;

  test.beforeAll(() => {
    expect(
      fs.existsSync(SCRIPT_PATH),
      `Script not found: scripts/create-sessions-table.ts — restore or update the path in sessions-table-smoke.yml`,
    ).toBe(true);
    src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  });

  test('script creates the sessions table with IF NOT EXISTS (idempotent)', () => {
    expect(src).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["']?sessions["']?/i);
  });

  test('script declares the sid, sess, and expire columns', () => {
    expect(src).toContain('"sid"');
    expect(src).toContain('"sess"');
    expect(src).toContain('"expire"');
  });

  test('script adds sessions_pkey primary key idempotently (DO $$ guard)', () => {
    expect(src).toContain('sessions_pkey');
    // The key must be added inside a DO $$ block or an IF NOT EXISTS guard so the
    // script is safe to re-run against an already-initialised database.
    expect(src).toMatch(/DO\s+\$\$|IF NOT EXISTS/i);
  });

  test('script creates IDX_sessions_expire index with IF NOT EXISTS (idempotent)', () => {
    expect(src).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+["']?IDX_sessions_expire["']?/i);
  });

  test('script exits non-zero on error (does not swallow failures)', () => {
    expect(src).toContain('process.exit(1)');
  });
});
