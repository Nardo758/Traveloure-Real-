const THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "500");

const slowQueryLog: Array<{
  label: string;
  duration: number;
  threshold: number;
  userRole: string;
  timestamp: string;
}> = [];

const MAX_LOG_SIZE = 100;

export async function withQueryTimer<T>(
  label: string,
  fn: () => Promise<T>,
  userRole?: string
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    if (duration > THRESHOLD) {
      console.warn(
        `[SLOW QUERY] ${new Date().toISOString()} | ` +
        `role=${userRole || "unknown"} | ` +
        `label="${label}" | ` +
        `duration=${duration}ms | ` +
        `threshold=${THRESHOLD}ms ⚠️`
      );
      slowQueryLog.unshift({
        label,
        duration,
        threshold: THRESHOLD,
        userRole: userRole || "unknown",
        timestamp: new Date().toISOString(),
      });
      if (slowQueryLog.length > MAX_LOG_SIZE) {
        slowQueryLog.pop();
      }
    }
  }
}

export function getSlowQueryLog() {
  return [...slowQueryLog];
}

export function clearSlowQueryLog() {
  slowQueryLog.length = 0;
}
