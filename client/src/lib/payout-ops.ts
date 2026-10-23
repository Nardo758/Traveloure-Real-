/**
 * Gap 9 screens (ledger `2026-10-22-gap9-payout-admin-screens`): the words (FOUNDER WORDING REVIEW on the PR) and
 * the small client rules for the not-routable list, the Remind button, the Owed view and Mark paid.
 *
 * Nothing here restates a server rule: the cooldown end comes from the server (`reminderCooldownEndsAt`), the
 * routability verdict from `GET /api/admin/experts/not-routable`, and the mark-paid checks from its route.
 */
export const PAYOUT_OPS_COPY = {
  notRoutableTitle: "Experts who are not routable",
  notRoutableDescription: "These experts are not offered to travelers. Each row shows the status of every check.",
  notRoutableEmpty: "Every expert is routable",
  notRoutableLoadFailed: "Could not load experts who are not routable",
  colExpert: "Expert",
  colApplication: "Application",
  colIdentity: "Identity check",
  colStripe: "Stripe Connect",
  notRecorded: "Not recorded",
  allChecksPassedNote: "All three checks pass; this account is excluded for another reason (a test, seed or reserved account).",
  unnamed: "Unnamed account",

  remind: "Remind",
  remindSending: "Sending…",
  remindSent: "Reminder sent",
  remindCooldown: (when: string) => `Reminded recently. Next reminder after ${when}.`,
  remind409: "Not sent: this account is already set up.",
  remind429: "Not sent: a reminder already went out in the last 72 hours.",
  remindFailed: "Could not send the reminder",
  remindTitle: "Sends an in-app notification asking them to finish Stripe Connect. No email is sent.",

  owedTitle: "Amounts owed",
  owedDescription: "What each expert and provider can be paid now, their payouts waiting, and whether Stripe can send them money.",
  owedEmpty: "Nobody is owed anything",
  owedLoadFailed: "Could not load amounts owed",
  colEarner: "Earner",
  colType: "Type",
  colOwed: "Owed now",
  colHeld: "Held",
  colPendingPayouts: "Payouts waiting",
  colTransfer: "Can receive a transfer",
  typeExpert: "Expert",
  typeProvider: "Provider",
  yes: "Yes",
  no: "No",
  pendingPayouts: (n: number, total: string) => (n === 0 ? "None" : `${n} · ${total}`),

  markPaid: "Mark paid",
  markPaidTitle: "Mark this payout as paid outside Stripe",
  markPaidDescription: "Use this only after the money has been sent another way. It does not move money.",
  fieldMethod: "How it was paid",
  fieldReference: "Reference",
  referenceHelp: "A short label or note, such as a transfer date. Never an account or routing number.",
  review: "Review",
  confirmTitle: "Confirm",
  confirmAmount: "Amount",
  confirmEarner: "Paid to",
  confirmMethod: "Method",
  confirmReference: "Reference",
  confirm: "Mark as paid",
  back: "Back",
  cancel: "Cancel",
  markPaidDone: "Marked as paid",
  markPaidFailed: "Could not mark this payout paid",
  paidExternally: (method: string) => `Paid outside Stripe · ${method}`,
} as const;

export const PAYOUT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "wise", label: "Wise" },
  { value: "paypal", label: "PayPal" },
  { value: "check", label: "Check" },
  { value: "external", label: "Other" },
] as const;

/** A stored `payout_method` as a label. Unknown values show as stored. */
export function payoutMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  if (method === "stripe") return "Stripe";
  return PAYOUT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method;
}

export const MARK_PAID_REFERENCE_MAX = 200;

export function referenceReady(reference: string): boolean {
  const t = reference.trim();
  return t.length > 0 && t.length <= MARK_PAID_REFERENCE_MAX;
}

/** The route's own `.strict()` body: the reference rides in `notes`. No amount is sent. */
export function markPaidBody(requesterType: "expert" | "provider", method: string, reference: string) {
  return { requesterType, method, notes: reference.trim() };
}

/** The statuses the route accepts. A UI hint only; the route refuses anything else with 409. */
export function markPaidOffered(status: string | null | undefined): boolean {
  return status === "pending" || status === "approved";
}

/** `apiRequest` throws `"<status>: <body>"`. */
export function apiErrorStatus(err: unknown): number | null {
  const m = /^(\d{3}):/.exec(String((err as Error)?.message ?? ""));
  return m ? Number(m[1]) : null;
}

/** The server's own `message` from an `apiRequest` error, or null. */
export function apiErrorMessage(err: unknown): string | null {
  const body = String((err as Error)?.message ?? "").replace(/^\d{3}:\s*/, "");
  try {
    const m = JSON.parse(body)?.message;
    return typeof m === "string" && m ? m : null;
  } catch {
    return null;
  }
}

export function remindErrorLine(err: unknown): string {
  const status = apiErrorStatus(err);
  if (status === 409) return PAYOUT_OPS_COPY.remind409;
  if (status === 429) return PAYOUT_OPS_COPY.remind429;
  return PAYOUT_OPS_COPY.remindFailed;
}

export function cooldownActive(endsAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!endsAt) return false;
  const t = new Date(endsAt).getTime();
  return Number.isFinite(t) && t > now;
}

/** Replace one payout row in a cached list with the route's answer, without a refetch. */
export function withMarkedPaid<T extends { id: string; requesterType: string; status: string | null; payoutMethod: string | null }>(
  rows: readonly T[] | undefined,
  requesterType: string,
  updated: { id: string; status?: string | null; payoutMethod?: string | null; completedAt?: string | null },
): T[] | undefined {
  if (!rows) return rows as undefined;
  return rows.map((r) =>
    r.id === updated.id && r.requesterType === requesterType
      ? { ...r, status: updated.status ?? r.status, payoutMethod: updated.payoutMethod ?? r.payoutMethod, ...(updated.completedAt ? { completedAt: updated.completedAt } : {}) }
      : r,
  );
}

export function usd(n: number | string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(v) ? v : 0);
}
