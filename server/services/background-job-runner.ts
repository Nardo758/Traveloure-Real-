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
): Promise<T | undefined> {
  if (activeJobs.has(name)) {
    logger.warn({ job: name }, "[background-job] overlapping pass skipped");
    return undefined;
  }

  if (activeJobCount >= MAX_CONCURRENT_BACKGROUND_JOBS) {
    logger.warn(
      { job: name, activeJobs: activeJobCount, maxConcurrent: MAX_CONCURRENT_BACKGROUND_JOBS },
      "[background-job] pool-protection concurrency limit reached; pass skipped",
    );
    return undefined;
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

  return undefined;
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