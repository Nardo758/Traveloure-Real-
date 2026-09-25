/**
 * evidence.ts — per-step evidence capture: screenshot + network log + DB diff.
 */
import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import { q } from './db';

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

/** Attach to a page once per test to capture every /api/ call with its status. */
export function netLogger(page: Page, journey: string) {
  const entries: { url: string; method: string; status?: number; ok?: boolean }[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      entries.push({ url, method: res.request().method(), status: res.status(), ok: res.ok() });
    }
  });
  const flush = () => {
    const { p2, local } = ensureDirs('net');
    const filename = `${journey}.jsonl`;
    const body = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
    for (const dir of [p2, local]) {
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
