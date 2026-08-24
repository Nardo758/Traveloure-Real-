/**
 * `apiRequest` (client/src/lib/queryClient.ts) throws `Error("<status>: <body>")` on a
 * non-2xx response. This pulls the server's honest JSON `.message` out of that string
 * (falling back to the raw body, then the caller's fallback) so a 400/403/409 refusal reads
 * as prose in a toast instead of `"409: {\"code\":\"...\",\"message\":\"...\"}"`.
 *
 * Factored out of client/src/pages/expert/workspace.tsx (QA_PUNCH_LIST W2-A item 13's
 * mode-flip 409 is the first cross-component consumer — several Workstation Add-panel
 * pickers previously did `String(err?.message ?? err)`, which surfaced the raw JSON rather
 * than the server's actual message).
 */
export function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = match ? match[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) return parsed.message as string;
    } catch {
      // not JSON — use the raw body text
    }
    return body || fallback;
  }
  return fallback;
}
