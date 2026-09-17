/**
 * THE SERVER'S OWN REFUSAL, RECOVERED FROM THE THROWN ERROR — one implementation, several callers.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`. `apiRequest` throws `new Error("<status>: <raw
 * body>")`, so every named refusal the rails are careful to emit — LD 49's `validity_exceeds_ceiling`
 * with its `ceilingDays`, LD 50's `policy_snapshot_missing`, `component_not_pending` with the
 * current status — arrives at the surface as a string with a JSON document embedded in it. A
 * surface that only prints `err.message` shows the traveler `409: {"message":…,"reason":…}`; a
 * surface that replaces it with its own wording throws away WHICH fact refused, which is exactly
 * the undifferentiated refusal §13 forbids.
 *
 * So this recovers the body, and every surface words it from the server's own fields. It is ONE
 * parse because a second copy is the derivation-drift class §18 rule 1 names — the day a rail adds
 * a field, one surface reads it and the other does not.
 *
 * §13 IN ITS OWN BEHAVIOUR: a body it cannot parse yields `{ message: <the human half of the
 * string> }` and never an invented code. An absent field stays absent; nothing is defaulted.
 *
 * Run: npx tsx --test client/src/lib/__tests__/api-refusal.test.ts
 */

export interface ApiRefusalBody {
  /** The server's sentence, when it sent one. */
  message?: string;
  /** The machine-readable reason a rail names (`reason` or `code`, whichever the rail uses). */
  code?: string;
  reason?: string;
  currentStatus?: string | null;
  ceilingDays?: number;
  requestedDays?: number;
  [key: string]: unknown;
}

/**
 * Strip the `"<status>: "` prefix `apiRequest` adds, then parse what is left as JSON. A non-JSON
 * body (an HTML error page, a bare status text) comes back as a `message` and nothing else.
 */
export function parseApiRefusal(err: unknown): ApiRefusalBody {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return {};
  const stripped = raw.replace(/^\s*\d{3}:\s*/, "");
  const trimmed = stripped.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ApiRefusalBody;
    } catch {
      // Not JSON after all — fall through and hand back the text as the message.
    }
  }
  return { message: trimmed.length > 0 ? trimmed : undefined };
}

/**
 * The sentence to show. The server's `message` when it sent one — it is the rail's own careful
 * wording and names the fact that refused — else the raw text. Never an invented sentence.
 */
export function apiRefusalMessage(err: unknown, fallback: string): string {
  const body = parseApiRefusal(err);
  return body.message && body.message.length > 0 ? body.message : fallback;
}
