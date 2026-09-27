/**
 * Admin exception refund (ledger `2026-09-27-admin-exception-refund`) — the form's pure rules.
 * The SERVER decides and enforces every one of these again; this only lets the form say "no" before
 * a round trip, and turns the server's "<status>: <json>" error text back into its message.
 */

/** "$12.34" / "12.3" / "12" → 1234 / 1230 / 1200 cents. null for anything that is not a plain amount. */
export function dollarsToCents(input: string): number | null {
  const t = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const EXCEPTION_REFUND_MIN_REASON = 10;

export type ExceptionRefundFormCheck =
  | { ok: true; request: { mode: "full"; reason: string } | { mode: "partial"; amountCents: number; reason: string } }
  | { ok: false; message: string };

export function checkExceptionRefundForm(input: {
  mode: "full" | "partial";
  amount: string;
  reason: string;
  chargedCents: number;
}): ExceptionRefundFormCheck {
  const reason = input.reason.trim();
  if (reason.length < EXCEPTION_REFUND_MIN_REASON) {
    return { ok: false, message: `Say why (at least ${EXCEPTION_REFUND_MIN_REASON} characters).` };
  }
  if (input.mode === "full") return { ok: true, request: { mode: "full", reason } };
  const cents = dollarsToCents(input.amount);
  if (cents === null || cents <= 0) return { ok: false, message: "Enter an amount, like 25.00." };
  if (cents > input.chargedCents) {
    return { ok: false, message: `That is more than the traveler was charged (${formatCents(input.chargedCents)}).` };
  }
  if (cents === input.chargedCents) return { ok: true, request: { mode: "full", reason } };
  return { ok: true, request: { mode: "partial", amountCents: cents, reason } };
}

/** apiRequest throws `Error("<status>: <body>")`; pull the server's own `message` out of it. */
export function serverMessageOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    /* not JSON */
  }
  return body || "Something went wrong.";
}
