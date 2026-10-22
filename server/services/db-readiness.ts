/**
 * Liveness must answer before a Neon wake-up finishes. Readiness may try a few
 * short times so a compute that is already starting can still pass.
 *
 * The pool's own connect timeout stays longer (`POOL_CONNECTION_TIMEOUT_MS`)
 * so the in-flight handshake can finish and warm the compute after the HTTP
 * handler has already returned. One shared in-flight probe: a healthcheck
 * burst must not open one connection per request.
 */
export const LIVENESS_DB_BUDGET_MS = 800;
export const READINESS_ATTEMPTS = 3;
export const READINESS_ATTEMPT_BUDGET_MS = 800;
export const READINESS_RETRY_DELAY_MS = 150;

export interface DbProbe {
  once(): Promise<boolean>;
  within(budgetMs: number): Promise<boolean>;
}

function raceBoolean(work: Promise<boolean>, budgetMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), budgetMs);
    timer.unref?.();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function createDbProbe(execute: () => Promise<unknown>): DbProbe {
  let inflight: Promise<boolean> | null = null;
  const once = (): Promise<boolean> => {
    if (!inflight) {
      inflight = Promise.resolve()
        .then(execute)
        .then(
          () => true,
          () => false,
        )
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
  return {
    once,
    within(budgetMs: number) {
      return raceBoolean(once(), budgetMs);
    },
  };
}

let shared: DbProbe | null = null;

export function getSharedProbe(): DbProbe {
  if (!shared) {
    shared = createDbProbe(async () => {
      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1`);
    });
  }
  return shared;
}

/** For tests that must not keep a probe created against a fake executor. */
export function resetSharedProbeForTests(): void {
  shared = null;
}

export function livenessDatabaseReachable(budgetMs = LIVENESS_DB_BUDGET_MS): Promise<boolean> {
  return getSharedProbe().within(budgetMs);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  timer.unref?.();
});

export async function probeDatabaseReady(options?: {
  attempts?: number;
  attemptBudgetMs?: number;
  delayMs?: number;
  probe?: (budgetMs: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ ok: boolean; attempts: number }> {
  const attempts = Math.max(1, options?.attempts ?? READINESS_ATTEMPTS);
  const attemptBudgetMs = options?.attemptBudgetMs ?? READINESS_ATTEMPT_BUDGET_MS;
  const delayMs = options?.delayMs ?? READINESS_RETRY_DELAY_MS;
  const probe = options?.probe ?? ((ms: number) => getSharedProbe().within(ms));
  const sleep = options?.sleep ?? defaultSleep;
  for (let i = 1; i <= attempts; i++) {
    if (await probe(attemptBudgetMs)) return { ok: true, attempts: i };
    if (i < attempts && delayMs > 0) await sleep(delayMs);
  }
  return { ok: false, attempts };
}
