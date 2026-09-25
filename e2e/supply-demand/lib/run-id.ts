/**
 * run-id.ts — one run id shared by every spec file in a single execution.
 *
 * E2E_RUN_ID env var wins when set (lets CI/demand specs pin a known id).
 * Otherwise the FIRST spec file to ask generates one and persists it to
 * test-results/e2e-run-id.txt; every subsequent spec (including the demand
 * specs owned by a sibling agent) reads the same file so supply-created
 * fixtures (accounts, handles, listing titles) are addressable downstream.
 */
import fs from 'fs';
import path from 'path';

const RUN_ID_FILE = path.join(process.cwd(), 'test-results', 'e2e-run-id.txt');

function generateRunId(): string {
  // short, lower-alnum, safe in emails/handles: e.g. "k3f9a1"
  return Math.random().toString(36).slice(2, 8);
}

export function getRunId(): string {
  if (process.env.E2E_RUN_ID && process.env.E2E_RUN_ID.trim()) {
    return process.env.E2E_RUN_ID.trim();
  }
  try {
    fs.mkdirSync(path.dirname(RUN_ID_FILE), { recursive: true });
  } catch {
    // ignore
  }
  try {
    const existing = fs.readFileSync(RUN_ID_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // file absent — fall through to create it
  }
  const id = generateRunId();
  try {
    fs.writeFileSync(RUN_ID_FILE, id, 'utf8');
  } catch {
    // best-effort persistence only
  }
  return id;
}

export const RUN_ID = getRunId();

export function e2eEmail(role: string): string {
  return `e2e-${RUN_ID}-${role}@traveloure.test`;
}

export function e2eHandle(role: string): string {
  return `e2e${RUN_ID}${role}`.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function e2eTitle(base: string): string {
  return `${base} [e2e:${RUN_ID}]`;
}

export const E2E_PASSWORD = 'E2eSupplyDemand!99';
