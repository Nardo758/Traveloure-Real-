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
  evidence?: { shot?: string; net?: string; db?: string; builtFrom?: string };
  behavioural: boolean;
};

/**
 * builtFrom — the exact server build every finding was proven against (lead-mandated, found
 * after a whole pass ran against a stale `dist/index.cjs` built BEFORE the very fix a finding
 * then reported as a fresh regression). Read once from `dist/build-info.json` (written by the
 * build script) and stamped onto every finding's evidence automatically, so no call site has to
 * remember to pass it and no finding can go unattributed to a build.
 */
let cachedBuiltFrom: string | null | undefined;
function readBuiltFrom(): string | null {
  if (cachedBuiltFrom !== undefined) return cachedBuiltFrom;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'dist', 'build-info.json'), 'utf8');
    const parsed = JSON.parse(raw);
    cachedBuiltFrom = parsed.commit ? `${parsed.commit} (built ${parsed.builtAt})` : null;
  } catch {
    cachedBuiltFrom = null;
  }
  return cachedBuiltFrom;
}

export type VisibilityObservation = {
  content: 'service' | 'ready_made' | 'expert_offering' | 'storefront' | 'event';
  item: string;
  surface: string;
  expected: 'visible' | 'hidden';
  actual: 'visible' | 'hidden';
  filter: string;
  journey: string;
  /**
   * Milliseconds from the admin-approve click to the surface first reporting visible, or null
   * when it never did within the poll window. Lead review (findings hygiene): time-to-visible is
   * DATA about the run, not a defect — it belongs here, not as a per-surface SPEC_DIVERGENCE
   * finding cluttering findings.jsonl with 6×N rows for N items.
   */
  ms: number | null;
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
  const builtFrom = readBuiltFrom();
  const full: Finding = { ...f, id, evidence: { ...(f.evidence ?? {}), ...(builtFrom ? { builtFrom } : {}) } };
  appendLine([P2_DIR, LOCAL_DIR], 'findings.jsonl', full);
  appendLine([LOCAL_DIR], 'supply-demand-findings.jsonl', full);
  return full;
}

export function fileVisibility(v: VisibilityObservation): void {
  appendLine([P2_DIR, LOCAL_DIR], 'visibility.jsonl', v);
}
