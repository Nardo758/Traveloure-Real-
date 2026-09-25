/**
 * findings.ts — append-only JSONL finding + visibility-observation writer.
 *
 * Writes to BOTH the shared Pass-2 scratch folder ($P2, an absolute path
 * baked in below per the brief) and test-results/, so the lead can read
 * findings.jsonl from either without a shared filesystem assumption.
 */
import fs from 'fs';
import path from 'path';

const P2_DIR =
  '/tmp/claude-0/-home-user-Traveloure-Real-/c4e61631-db4f-5b2c-8835-8490cff058fe/scratchpad/pass2';
const LOCAL_DIR = path.join(process.cwd(), 'test-results');

export type Finding = {
  id: string;
  journey: string;
  step: string;
  class: string;
  severity: 'P1' | 'P2' | 'P3';
  known: string | null;
  title: string;
  expected: string;
  actual: string;
  where: string;
  evidence?: { shot?: string; net?: string; db?: string };
  behavioural: boolean;
};

export type VisibilityObservation = {
  content: 'service' | 'ready_made' | 'expert_offering' | 'storefront' | 'event';
  item: string;
  surface: string;
  expected: 'visible' | 'hidden';
  actual: 'visible' | 'hidden';
  filter: string;
  journey: string;
};

function appendLine(dirCandidates: string[], filename: string, obj: unknown) {
  const line = JSON.stringify(obj) + '\n';
  for (const dir of dirCandidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, filename), line, 'utf8');
    } catch {
      // best-effort: the other directory (or test-results) still gets it
    }
  }
}

let findingSeq = 0;

export function fileFinding(f: Omit<Finding, 'id'> & { id?: string }): Finding {
  findingSeq += 1;
  const id = f.id ?? `P2-${f.journey}-${findingSeq}`;
  const full: Finding = { ...f, id };
  appendLine([P2_DIR, LOCAL_DIR], 'findings.jsonl', full);
  appendLine([LOCAL_DIR], 'supply-demand-findings.jsonl', full);
  return full;
}

export function fileVisibility(v: VisibilityObservation): void {
  appendLine([P2_DIR, LOCAL_DIR], 'visibility.jsonl', v);
}
