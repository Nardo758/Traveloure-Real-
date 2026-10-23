/**
 * Boot seeding gate for the readiness endpoints (ledger `2026-10-22-boot-seed-stamps`).
 *
 * `complete` stays false from process start until a seed pass finishes, including a pass that
 * skipped because the stored stamp matched. `/api/ready` and `/health/ready` both read this.
 * `/api/health` and `GET /health` do not.
 */

export type SeedingStatus = { complete: boolean; durationMs: number | null };

let complete = false;
let durationMs: number | null = null;

export function isSeedingComplete(): boolean {
  return complete;
}

export function getSeedingStatus(): SeedingStatus {
  return { complete, durationMs };
}

/** True while a boot has not finished seeding and has not finished a stamp skip. */
export function seedingBlocksReady(status: SeedingStatus = getSeedingStatus()): boolean {
  return !status.complete;
}

export function markBootSeedingComplete(ms: number): void {
  complete = true;
  durationMs = ms;
}

/** Tests only. Production never resets this. */
export function resetBootSeedingStateForTests(): void {
  complete = false;
  durationMs = null;
}
