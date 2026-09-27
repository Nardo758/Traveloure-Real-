/**
 * p3.ts — Pass 3 evidence + findings writer.
 *
 * Same shape as evidence.ts / findings.ts, but rooted at `$P2/../pass3` (screenshots, net logs,
 * DB before/after snippets, findings.jsonl) and mirrored under test-results/supply-demand/pass3 so a
 * CI run (which has no /tmp scratchpad) keeps its evidence in the uploaded artifact. Finding ids are
 * `P3-<journey>-<slug>` — SLUGGED, never a counter, so a re-run cannot renumber a filed id (the
 * Pass 2 id-collision lesson, GAP_REGISTER_PASS2.md "A note on ids").
 */
import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import { q } from './db';
import { RUN_ID } from './run-id';

const P3_DIR =
  '/tmp/claude-0/-home-user-Traveloure-Real-/c4e61631-db4f-5b2c-8835-8490cff058fe/scratchpad/pass3';
const LOCAL_DIR = path.join(process.cwd(), 'test-results', 'supply-demand', 'pass3');

function dirs(sub: string): string[] {
  const out: string[] = [];
  for (const base of [P3_DIR, LOCAL_DIR]) {
    const d = sub ? path.join(base, sub) : base;
    try {
      fs.mkdirSync(d, { recursive: true });
      out.push(d);
    } catch {
      // best-effort: a CI runner has no scratchpad
    }
  }
  return out;
}

function writeAll(sub: string, filename: string, body: string | Buffer, append = false) {
  for (const d of dirs(sub)) {
    try {
      if (append) fs.appendFileSync(path.join(d, filename), body);
      else fs.writeFileSync(path.join(d, filename), body);
    } catch {
      // ignore
    }
  }
}

export async function shot3(page: Page, journey: string, nn: string, slug: string): Promise<string> {
  const filename = `${journey}-${nn}-${slug}.png`;
  const buf = await page.screenshot({ fullPage: true }).catch(() => null);
  if (buf) writeAll('shots', filename, buf);
  return `pass3/shots/${filename}`;
}

/** Per-journey, per-run network log of every /api/ call (truncated at creation — see evidence.ts). */
export function netLogger3(page: Page, journey: string) {
  const filename = `${journey}-${RUN_ID}.jsonl`;
  writeAll('net', filename, '');
  const entries: { url: string; method: string; status: number; at: string }[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const e = { url, method: res.request().method(), status: res.status(), at: new Date().toISOString() };
    entries.push(e);
    writeAll('net', filename, JSON.stringify(e) + '\n', true);
  });
  return {
    entries,
    ref: `pass3/net/${filename}`,
    /** Every entry whose path ends with `suffix` (query string ignored), optionally by method. */
    find(suffix: string | RegExp, method?: string) {
      return entries.filter((e) => {
        const p = new URL(e.url).pathname;
        const hit = typeof suffix === 'string' ? p.endsWith(suffix) : suffix.test(p);
        return hit && (!method || e.method === method);
      });
    },
  };
}

/** Run `sql` before an action; call the returned `after()` once the action settled. Writes both. */
export async function dbStep(journey: string, nn: string, label: string, sql: string, params: any[] = []) {
  const before = await q(sql, params);
  return {
    before,
    async after(): Promise<any[]> {
      const after = await q(sql, params);
      const text =
        `-- ${label}\n-- SQL: ${sql}\n-- params: ${JSON.stringify(params)}\n\n` +
        `BEFORE (${before.length} rows):\n${JSON.stringify(before, null, 2)}\n\n` +
        `AFTER (${after.length} rows):\n${JSON.stringify(after, null, 2)}\n---\n`;
      writeAll('db', `${journey}-${nn}.txt`, text, true);
      return after;
    },
    ref: `pass3/db/${journey}-${nn}.txt`,
  };
}

export type P3Finding = {
  id: string;
  journey: string;
  step: string;
  class: string;
  severity: 'P1' | 'P2' | 'P3' | 'NOT_PROVEN' | 'PASS';
  known: string | null;
  title: string;
  expected: string;
  actual: string;
  where: string;
  evidence?: { shot?: string; net?: string; db?: string };
  behavioural: boolean;
};

function builtFrom(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist', 'build-info.json'), 'utf8'));
    return raw.commit ? `${raw.commit} (built ${raw.builtAt})` : null;
  } catch {
    return null;
  }
}

/** Append one Pass 3 finding (or a PASS / NOT_PROVEN observation — severity says which). */
export function file3(f: P3Finding): P3Finding {
  const full = { ...f, runId: RUN_ID, evidence: { ...(f.evidence ?? {}), builtFrom: builtFrom() } };
  writeAll('', 'findings.jsonl', JSON.stringify(full) + '\n', true);
  return f;
}
