import { logger } from "../infrastructure/logger";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 2_000;
const MAX_CONCURRENT_BACKGROUND_JOBS = 4;

const TRANSIENT_POSTGRES_CODES = new Set([
  "08000", // connection exception
  "08001", // unable to connect
  "08003", // connection does not exist
  "08004", // connection rejected
  "08006", // connection failure
  "08007", // transaction resolution unknown
  "08P01", // protocol violation
  "40001", // serialization failure
  "40P01", // deadlock detected
  "53300", // too many connections
  "55006", // object in use
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now
]);

const TRANSIENT_CONNECTION_MESSAGES = [
  /timeout exceeded when trying to connect/i,
  /connection timed out/i,
  /connection terminated unexpectedly/i,
  /connection refused/i,
  /connection reset/i,
  /connection slots are reserved/i,
  /too many clients/i,
  /client has encountered a connection error/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bETIMEDOUT\b/i,
  /\bEPIPE\b/i,
];

const activeJobs = new Set<string>();
let activeJobCount = 0;

/**
 * The sentinel a skipped pass resolves to (lane: internal-jobs-hardening, L4).
 *
 * `undefined` used to mean BOTH "this pass was skipped" and "the job body returned void" — so an
 * endpoint could not tell a real overlap skip from a job that ran, and the two void-returning jobs
 * (email-outbox, travelpayouts-report-poll) reported `skipped: true` on EVERY call, successful or
 * not. §17 rule 2: silence must be distinguishable from the job not having run.
 */
export interface BackgroundJobSkipped {
  __skipped: true;
  reason: "overlap" | "cap";
}

export function isBackgroundJobSkip(value: unknown): value is BackgroundJobSkipped {
  return typeof value === "object" && value !== null && (value as BackgroundJobSkipped).__skipped === true;
}

export interface BackgroundJobOptions {
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export function isTransientDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code === "string" && TRANSIENT_POSTGRES_CODES.has(candidate.code)) {
    return true;
  }

  const message = typeof candidate.message === "string" ? candidate.message : String(error);
  return TRANSIENT_CONNECTION_MESSAGES.some((pattern) => pattern.test(message));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one scheduled pass without allowing an interval tick to pile up behind a
 * slow pass. Only transient database/connection failures are retried; all
 * other errors remain failures and are surfaced to the caller.
 */
export async function runBackgroundJob<T>(
  name: string,
  job: () => Promise<T>,
  options: BackgroundJobOptions = {},
): Promise<T | BackgroundJobSkipped> {
  if (activeJobs.has(name)) {
    logger.warn({ job: name }, "[background-job] overlapping pass skipped");
    return { __skipped: true, reason: "overlap" };
  }

  if (activeJobCount >= MAX_CONCURRENT_BACKGROUND_JOBS) {
    logger.warn(
      { job: name, activeJobs: activeJobCount, maxConcurrent: MAX_CONCURRENT_BACKGROUND_JOBS },
      "[background-job] pool-protection concurrency limit reached; pass skipped",
    );
    return { __skipped: true, reason: "cap" };
  }

  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const initialBackoffMs = Math.max(0, options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS);
  const maxBackoffMs = Math.max(initialBackoffMs, options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);

  activeJobs.add(name);
  activeJobCount++;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await job();
      } catch (error) {
        const transient = isTransientDatabaseError(error);
        if (!transient || attempt === maxAttempts) {
          logger.error(
            { err: error, job: name, attempt, maxAttempts, transient },
            "[background-job] pass failed",
          );
          throw error;
        }

        const delayMs = Math.min(initialBackoffMs * 2 ** (attempt - 1), maxBackoffMs);
        logger.warn(
          { err: error, job: name, attempt, nextAttempt: attempt + 1, delayMs },
          "[background-job] transient database failure; retrying",
        );
        await sleep(delayMs);
      }
    }
  } finally {
    activeJobs.delete(name);
    activeJobCount--;
  }

  // Unreachable: the loop above always returns or throws (maxAttempts >= 1). Kept for the
  // type-checker. Callers treat a bare `undefined` as a CONTRACT ERROR, not a skip (L4), so if
  // this ever did become reachable it would surface loudly instead of masquerading as a skip.
  return undefined as unknown as T;
}

export function getBackgroundJobStats(): {
  activeJobs: number;
  maxConcurrentJobs: number;
  running: string[];
} {
  return {
    activeJobs: activeJobCount,
    maxConcurrentJobs: MAX_CONCURRENT_BACKGROUND_JOBS,
    running: Array.from(activeJobs),
  };
}