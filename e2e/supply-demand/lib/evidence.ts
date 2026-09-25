/**
 * evidence.ts — per-step evidence capture: screenshot + network log + DB diff.
 */
import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import { q } from './db';
import { RUN_ID } from './run-id';

const P2_DIR =
  '/tmp/claude-0/-home-user-Traveloure-Real-/c4e61631-db4f-5b2c-8835-8490cff058fe/scratchpad/pass2';
const LOCAL_DIR = path.join(process.cwd(), 'test-results', 'supply-demand');

function ensureDirs(sub: string): { p2: string; local: string } {
  const p2 = path.join(P2_DIR, sub);
  const local = path.join(LOCAL_DIR, sub);
  for (const d of [p2, local]) {
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch {
      // ignore
    }
  }
  return { p2, local };
}

export async function shot(page: Page, journey: string, nn: string, slug: string): Promise<string> {
  const { p2, local } = ensureDirs('shots');
  const filename = `${journey}-${nn}-${slug}.png`;
  const buf = await page.screenshot({ fullPage: true }).catch(() => null);
  if (buf) {
    try {
      fs.writeFileSync(path.join(p2, filename), buf);
    } catch {
      // ignore
    }
    try {
      fs.writeFileSync(path.join(local, filename), buf);
    } catch {
      // ignore
    }
  }
  return `shots/${filename}`;
}

/**
 * Attach to a page once per test to capture every /api/ call with its status.
 *
 * PER-RUN LOG FILE (lead review — false RC-11 regression, P2-D3-1): the log used to be named
 * `<journey>.jsonl` with no run id, opened with `appendFileSync` on every `flush()` — so a file
 * from an EARLIER harness invocation (a stale bundle, a prior attempt) stayed on disk and grew
 * across runs. Anyone (or anything) reading that file back to corroborate a finding could match a
 * stale run's request instead of this one's — exactly how a real RC-11 fix on a rebuilt bundle
 * read as a fresh regression (the only 404 in the accumulated file was from a stale run). The
 * filename now carries RUN_ID, and — since `netLogger()` is called once at the top of each spec
 * — the file for THIS journey+run pair is truncated the moment the logger is created, before the
 * first `flush()` ever appends to it, so two invocations that happen to share a run id (or a
 * leftover file from a killed run) can never bleed into each other either. In-memory
 * `entries` was already run-scoped (each test's own array, cleared by `flush()`), so no change
 * was needed there — the accumulation was only ever on disk.
 */
export function netLogger(page: Page, journey: string) {
  const entries: { url: string; method: string; status?: number; ok?: boolean }[] = [];
  const filename = `${journey}-${RUN_ID}.jsonl`;
  const { p2, local } = ensureDirs('net');
  for (const dir of [p2, local]) {
    try {
      fs.writeFileSync(path.join(dir, filename), '', 'utf8');
    } catch {
      // ignore
    }
  }
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      entries.push({ url, method: res.request().method(), status: res.status(), ok: res.ok() });
    }
  });
  const flush = () => {
    const { p2: p2dir, local: localDir } = ensureDirs('net');
    const body = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
    for (const dir of [p2dir, localDir]) {
      try {
        fs.appendFileSync(path.join(dir, filename), body, 'utf8');
      } catch {
        // ignore
      }
    }
    entries.length = 0;
  };
  return { entries, flush };
}

export async function dbDiff(
  journey: string,
  nn: string,
  label: string,
  sql: string,
  params: any[],
  before: any[],
): Promise<any[]> {
  const after = await q(sql, params);
  const { p2, local } = ensureDirs('db');
  const filename = `${journey}-${nn}.txt`;
  const text =
    `-- ${label}\n-- SQL: ${sql}\n-- params: ${JSON.stringify(params)}\n\n` +
    `BEFORE (${before.length} rows):\n${JSON.stringify(before, null, 2)}\n\n` +
    `AFTER (${after.length} rows):\n${JSON.stringify(after, null, 2)}\n`;
  for (const dir of [p2, local]) {
    try {
      fs.appendFileSync(path.join(dir, filename), text + '\n---\n', 'utf8');
    } catch {
      // ignore
    }
  }
  return after;
}

export async function dbSnapshot(sql: string, params: any[] = []): Promise<any[]> {
  return q(sql, params);
}
