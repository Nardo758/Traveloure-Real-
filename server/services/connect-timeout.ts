/**
 * pg-pool's acquire/connect deadline. Both strings are raised by node-postgres
 * itself (`pg-pool/index.js`): the waiter queue, and a new client whose
 * handshake exceeded `connectionTimeoutMillis`.
 *
 * Walks `cause` because drizzle wraps the driver error. A statement timeout is
 * a different failure and does not match.
 */
const CONNECT_TIMEOUT_PATTERNS = [
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
  /connection timed out/i,
  /\bETIMEDOUT\b/,
];

function collectMessages(error: unknown, out: string[], depth: number): void {
  if (depth > 6 || error == null) return;
  if (typeof error === "string") {
    out.push(error);
    return;
  }
  if (typeof error !== "object") return;
  const record = error as { message?: unknown; cause?: unknown; errors?: unknown };
  if (typeof record.message === "string") out.push(record.message);
  if (Array.isArray(record.errors)) {
    for (const nested of record.errors) collectMessages(nested, out, depth + 1);
  }
  collectMessages(record.cause, out, depth + 1);
}

export function isConnectTimeoutError(error: unknown): boolean {
  const messages: string[] = [];
  collectMessages(error, messages, 0);
  const text = messages.join("\n");
  return CONNECT_TIMEOUT_PATTERNS.some((pattern) => pattern.test(text));
}
