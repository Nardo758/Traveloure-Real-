/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`): the words on the report-context screen (FOUNDER WORDING
 * REVIEW on the PR). The clamp and default live in `@shared/report-context`.
 */
import { REPORT_CONTEXT_DEFAULT } from "@shared/report-context";
import type { ReportContextSender } from "@shared/report-context";

export const REPORT_CONTEXT_COPY = {
  openLink: "View conversation",
  pageTitle: "Conversation behind a report",
  back: "Back to message reports",
  auditNotice: "Opening this conversation is recorded in the audit log.",
  messageMode: "The reported message, with the messages before and after it.",
  usersMode: "The latest messages between the reporter and the reported user.",
  anchorMissing: "The reported message no longer exists. Showing the latest messages between the two users instead.",
  beforeLabel: "Messages before",
  afterLabel: "Messages after",
  latestLabel: "Latest messages",
  maxHint: "Up to 25.",
  show: "Show",
  empty: "No messages between these users",
  loadFailed: "Could not load the conversation",
  notFound: "Report not found",
  reportedBadge: "Reported message",
  attachment: "Attachment",
  noText: "(no text)",
} as const;

export const REPORT_CONTEXT_SENDER_LABELS: Record<ReportContextSender, string> = {
  reporter: "Reporter",
  reported: "Reported user",
  other: "Other participant",
};

export function reportContextUrl(reportId: string, before: number = REPORT_CONTEXT_DEFAULT, after: number = REPORT_CONTEXT_DEFAULT): string {
  return `/api/admin/message-reports/${encodeURIComponent(reportId)}/context?before=${before}&after=${after}`;
}

export function reportContextPagePath(reportId: string): string {
  return `/admin/message-moderation/${encodeURIComponent(reportId)}/context`;
}
