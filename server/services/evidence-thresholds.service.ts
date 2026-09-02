/**
 * EVIDENCE THRESHOLDS — the one place a pass threshold lives (ruling
 * 2026-09-01-evidence-thresholds-config; Phase 0 D3 ratified).
 *
 * Same invariant class as fee_bands, STRICTER: there is NO code-constant fallback. Every key in
 * EVIDENCE_THRESHOLD_KEYS must be present as a row; if any is missing the loader throws
 * EvidenceThresholdsMissingError and BOTH the scorer and Ratify refuse (`thresholds_missing`) —
 * an admin cannot verify a claim against numbers that don't exist. Migration 272 seeds the
 * companion §3 values so no environment boots empty.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { evidenceThresholds, type EvidenceThreshold } from "@shared/schema";
import { EVIDENCE_THRESHOLD_KEYS, type EvidenceThresholdKey } from "@shared/neighborhood-claims";

export type EvidenceThresholds = Record<EvidenceThresholdKey, number>;

export class EvidenceThresholdsMissingError extends Error {
  readonly code = "thresholds_missing" as const;
  constructor(public readonly missing: string[]) {
    super(`evidence_thresholds is missing required rows: ${missing.join(", ")}`);
    this.name = "EvidenceThresholdsMissingError";
  }
}

type Executor = Pick<typeof db, "select">;

/** Load every threshold. Throws EvidenceThresholdsMissingError when any required key is absent. */
export async function loadEvidenceThresholds(executor: Executor = db): Promise<EvidenceThresholds> {
  const rows = await executor.select().from(evidenceThresholds);
  const byKey = new Map(rows.map((r) => [r.thresholdKey, r.value]));
  const missing = EVIDENCE_THRESHOLD_KEYS.filter((k) => !byKey.has(k));
  if (missing.length > 0) throw new EvidenceThresholdsMissingError(missing);
  const out = {} as EvidenceThresholds;
  for (const k of EVIDENCE_THRESHOLD_KEYS) out[k] = byKey.get(k)!;
  return out;
}

export async function listEvidenceThresholds(): Promise<EvidenceThreshold[]> {
  return db.select().from(evidenceThresholds).orderBy(evidenceThresholds.thresholdKey);
}

export function isEvidenceThresholdKey(key: string): key is EvidenceThresholdKey {
  return (EVIDENCE_THRESHOLD_KEYS as readonly string[]).includes(key);
}

/** Admin edit — the key must already exist (rows are seeded by migration; nothing creates them here). */
export async function updateEvidenceThreshold(
  key: EvidenceThresholdKey,
  value: number,
  adminId: string,
): Promise<EvidenceThreshold | null> {
  const [row] = await db
    .update(evidenceThresholds)
    .set({ value, updatedBy: adminId, updatedAt: sql`now()` })
    .where(eq(evidenceThresholds.thresholdKey, key))
    .returning();
  return row ?? null;
}
