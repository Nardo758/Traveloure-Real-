/**
 * OPTIMIZER RUN RECORDS — the ONE writer and reader (Track A step A9; product map §N2–§N4; migration
 * 336; ledger `2026-09-30-a9-run-records`). Every caller is gated on `optimizerRunRecordsEnabled()`.
 *
 *   · `optimizer_runs` is INSERT-ONLY: this module exposes no UPDATE and no DELETE, and nothing else
 *     writes the table. A run is recorded by the generator immediately BEFORE its model call, so the
 *     prompt's hash exists; the prompt TEXT is never stored (§N4). A run that fails before its model
 *     call leaves no run row — its payment stays recorded on the comparison and in `fee_ledger`.
 *   · `optimizer_run_outcomes` is APPEND-ONLY, written by the adopt/choose rails at the moment each
 *     happens. A version with no `run_id` (born before this record, or with the flag off) has no run
 *     to attach an outcome to, and none is invented (§13).
 *   · Recording NEVER fails the operation it records (§15b): every write is caught and logged.
 */
import crypto from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { itineraryVariants, optimizerRunOutcomes, optimizerRuns } from "@shared/schema";
import { runBasisLabel, type OptimizerRunBasis, type RunOutcomeKind } from "@shared/optimizer-runs";

export interface RunRecordContext {
  tripId: string | null;
  comparisonId: string;
  basis: OptimizerRunBasis;
  paymentIntentId: string | null;
  tollRunId: string | null;
  createdBy: string;
}

export const sha256 = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

/** Insert the run (once). Returns its id, or null when the write failed (logged, never thrown). */
export async function recordOptimizerRun(
  ctx: RunRecordContext,
  run: { inputSnapshot: Record<string, unknown>; modelVersion: string; prompt: string },
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(optimizerRuns)
      .values({
        tripId: ctx.tripId,
        comparisonId: ctx.comparisonId,
        authorizationBasis: ctx.basis,
        paymentIntentId: ctx.basis === "paid" ? ctx.paymentIntentId : null,
        tollRunId: ctx.tollRunId,
        inputSnapshot: run.inputSnapshot,
        modelVersion: run.modelVersion,
        promptSha256: sha256(run.prompt),
        createdBy: ctx.createdBy,
        createdAt: new Date(),
      })
      .returning({ id: optimizerRuns.id });
    return row.id;
  } catch (err) {
    console.error("[optimizer-runs] run record failed (non-fatal):", (err as Error).message);
    return null;
  }
}

/** The input snapshot (§N2): ids and row versions, open sets and options, preferences, constraints — never text the model saw. */
export function buildInputSnapshot(input: {
  baselineItems: ReadonlyArray<{ id: unknown; updatedAt?: unknown }>;
  openSetSlots?: ReadonlyArray<{ setId: string; optionId: string }>;
  tripPreferences?: unknown;
  fixedCommitments?: ReadonlyArray<{ id?: unknown }>;
}): Record<string, unknown> {
  const sets: Record<string, string[]> = {};
  for (const s of input.openSetSlots ?? []) {
    sets[s.setId] = Array.from(new Set([...(sets[s.setId] ?? []), s.optionId]));
  }
  return {
    items: input.baselineItems.map((i) => ({
      id: String(i.id),
      updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt ?? null,
    })),
    openSets: Object.entries(sets).map(([setId, optionIds]) => ({ setId, optionIds })),
    preferences: input.tripPreferences ?? null,
    fixedCommitmentIds: (input.fixedCommitments ?? []).map((f) => (f.id != null ? String(f.id) : null)).filter(Boolean),
    // No scoring weight profile is versioned today; NULL says so rather than inventing one (§13).
    weightProfileVersion: null,
  };
}

/** Append one outcome for the run a variant belongs to. No run_id ⇒ nothing is written (§13). */
export async function recordRunOutcome(
  tx: any,
  input: {
    variantId: string;
    kind: RunOutcomeKind;
    actorId: string;
    variantItemIds?: string[];
    setId?: string;
    optionId?: string;
  },
): Promise<void> {
  try {
    // A SAVEPOINT of the caller's transaction: a failed outcome write rolls back only itself and never
    // aborts the adopt it records (§15b).
    await tx.transaction(async (sp: any) => {
    const [v] = await sp.select({ runId: itineraryVariants.runId }).from(itineraryVariants).where(eq(itineraryVariants.id, input.variantId)).limit(1);
    if (!v?.runId) return;
    await sp.insert(optimizerRunOutcomes).values({
      runId: v.runId,
      kind: input.kind,
      variantId: input.variantId,
      variantItemIds: input.variantItemIds ?? null,
      setId: input.setId ?? null,
      optionId: input.optionId ?? null,
      actorId: input.actorId,
      createdAt: new Date(),
    });
    });
  } catch (err) {
    console.error("[optimizer-runs] outcome record failed (non-fatal):", (err as Error).message);
  }
}

/**
 * "Your optimized plans" (§N3): each run on this plan, newest first — its date, what paid for it
 * (the basis, never an amount or a PaymentIntent), its versions and what was adopted. An allowlist
 * projection: no input snapshot, no prompt hash, no payment id reaches a client.
 */
export async function listRunsForTrip(tripId: string) {
  const runs = await db
    .select({ id: optimizerRuns.id, createdAt: optimizerRuns.createdAt, basis: optimizerRuns.authorizationBasis, comparisonId: optimizerRuns.comparisonId })
    .from(optimizerRuns)
    .where(eq(optimizerRuns.tripId, tripId))
    .orderBy(desc(optimizerRuns.createdAt));
  if (runs.length === 0) return [];
  const runIds = runs.map((r) => r.id);
  const variants = await db
    .select({ id: itineraryVariants.id, runId: itineraryVariants.runId, name: itineraryVariants.name, source: itineraryVariants.source, sortOrder: itineraryVariants.sortOrder })
    .from(itineraryVariants)
    .where(inArray(itineraryVariants.runId, runIds));
  const outcomes = await db
    .select({ runId: optimizerRunOutcomes.runId, kind: optimizerRunOutcomes.kind, variantId: optimizerRunOutcomes.variantId, setId: optimizerRunOutcomes.setId, optionId: optimizerRunOutcomes.optionId, createdAt: optimizerRunOutcomes.createdAt })
    .from(optimizerRunOutcomes)
    .where(inArray(optimizerRunOutcomes.runId, runIds));
  return runs.map((r) => ({
    id: r.id,
    comparisonId: r.comparisonId,
    createdAt: r.createdAt,
    basis: r.basis,
    basisLabel: runBasisLabel(r.basis),
    versions: variants
      .filter((v) => v.runId === r.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((v) => ({ id: v.id, name: v.name, baseline: v.source === "user" })),
    outcomes: outcomes.filter((o) => o.runId === r.id).map(({ runId: _r, ...o }) => o),
  }));
}

