/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`): how much of a thread staff may read behind a message
 * report. Pure, so the route and the screen read one copy.
 *
 * `before` / `after` are request params. The server clamps each to REPORT_CONTEXT_MAX; a missing or non-numeric
 * value is the screen's default, REPORT_CONTEXT_DEFAULT. A user-level report has no anchor message, so it reads the
 * latest `before` messages between the two users, under the same cap.
 */
export const REPORT_CONTEXT_MAX = 25;
export const REPORT_CONTEXT_DEFAULT = 10;

export function clampReportContextCount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return REPORT_CONTEXT_DEFAULT;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return REPORT_CONTEXT_DEFAULT;
  return Math.min(REPORT_CONTEXT_MAX, Math.max(0, Math.trunc(n)));
}

export type ReportContextMode = "message" | "users";
export type ReportContextSender = "reporter" | "reported" | "other";

export interface ReportContextMessage {
  id: string;
  sender: ReportContextSender;
  body: string | null;
  hasAttachment: boolean;
  createdAt: string | null;
  isReported: boolean;
}

export interface ReportContextPayload {
  reportId: string;
  reportType: string;
  mode: ReportContextMode;
  /** True when a message report's message no longer exists, so the latest messages between the users are shown. */
  anchorMissing: boolean;
  before: number;
  after: number;
  messages: ReportContextMessage[];
}

export function reportContextSender(senderId: string, reporterId: string, reportedUserId: string): ReportContextSender {
  if (senderId === reportedUserId) return "reported";
  if (senderId === reporterId) return "reporter";
  return "other";
}
