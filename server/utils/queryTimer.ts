const THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "500");

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
    }
  }
}
