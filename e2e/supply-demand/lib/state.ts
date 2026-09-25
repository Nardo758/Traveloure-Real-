/**
 * state.ts — cross-spec fixture registry.
 *
 * Supply specs (s1-s3) persist the ids/handles/tripIds they create here so
 * the demand specs (d*-*.spec.ts, a sibling agent's files) can reuse the
 * SAME Kyoto fixture (Provider A/B/C listings, Expert E, the ready-made)
 * instead of re-minting it. One JSON file per run, keyed by run id so two
 * runs never collide if the file survives between them.
 */
import fs from 'fs';
import path from 'path';
import { RUN_ID } from './run-id';

const STATE_FILE = path.join(process.cwd(), 'test-results', 'supply-demand-state.json');

export type SupplyDemandState = {
  runId: string;
  accounts: Record<string, { email: string; userId?: string; handle?: string }>;
  listings: Record<string, { id?: string; title: string; providerServiceId?: string; categoryKey?: string }>;
  readyMade?: { id?: string; title: string };
  trips: Record<string, { id?: string; label: string }>;
  [key: string]: any;
};

function load(): SupplyDemandState {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.runId === RUN_ID) return parsed;
  } catch {
    // absent or run id mismatch — start fresh
  }
  return { runId: RUN_ID, accounts: {}, listings: {}, trips: {} };
}

export function readState(): SupplyDemandState {
  return load();
}

export function writeState(mutator: (s: SupplyDemandState) => void): SupplyDemandState {
  const s = load();
  mutator(s);
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8');
  } catch {
    // best-effort
  }
  return s;
}
