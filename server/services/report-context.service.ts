/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`; fix queue): the read-only thread behind a message report.
 * Reads `user_and_expert_chats` only — the table `message_reports.message_id` points at. No other message table.
 *
 * Message report: the reported message plus up to `before` earlier and `after` later messages in the same thread
 * (the anchor's two users, both directions; a contract chat with no receiver is threaded by its contract).
 * User-level report, or a message report whose message is gone: the latest `before` messages between the two users.
 */
import { and, asc, desc, eq, gt, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { messageReports, userAndExpertChats } from "@shared/schema";
import {
  reportContextSender,
  type ReportContextMessage,
  type ReportContextPayload,
} from "@shared/report-context";

type ChatRow = typeof userAndExpertChats.$inferSelect;

function pairWhere(a: string, b: string): SQL {
  return or(
    and(eq(userAndExpertChats.senderId, a), eq(userAndExpertChats.receiverId, b)),
    and(eq(userAndExpertChats.senderId, b), eq(userAndExpertChats.receiverId, a)),
  )!;
}

export async function loadReportContext(
  reportId: string,
  before: number,
  after: number,
): Promise<{ payload: ReportContextPayload; reportedUserId: string } | null> {
  const [report] = await db
    .select({
      id: messageReports.id,
      reporterId: messageReports.reporterId,
      reportedUserId: messageReports.reportedUserId,
      messageId: messageReports.messageId,
      reportType: messageReports.reportType,
    })
    .from(messageReports)
    .where(eq(messageReports.id, reportId));
  if (!report) return null;

  const view = (r: ChatRow, anchorId: string | null): ReportContextMessage => ({
    id: r.id,
    sender: reportContextSender(r.senderId, report.reporterId, report.reportedUserId),
    body: r.message ?? null,
    hasAttachment: !!r.attachment,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    isReported: r.id === anchorId,
  });

  const anchor = report.messageId
    ? (await db.select().from(userAndExpertChats).where(eq(userAndExpertChats.id, report.messageId)))[0]
    : undefined;

  if (!anchor) {
    const latest = before === 0
      ? []
      : await db
          .select()
          .from(userAndExpertChats)
          .where(pairWhere(report.reporterId, report.reportedUserId))
          .orderBy(desc(userAndExpertChats.createdAt), desc(userAndExpertChats.id))
          .limit(before);
    return {
      reportedUserId: report.reportedUserId,
      payload: {
        reportId: report.id,
        reportType: report.reportType,
        mode: "users",
        anchorMissing: report.reportType === "message",
        before,
        after: 0,
        messages: latest.reverse().map((r) => view(r, null)),
      },
    };
  }

  const thread: SQL = anchor.receiverId
    ? pairWhere(anchor.senderId, anchor.receiverId)
    : anchor.contractId
      ? eq(userAndExpertChats.contractId, anchor.contractId)
      : eq(userAndExpertChats.id, anchor.id);
  // Ordered by (created_at, id); a NULL created_at sorts as the epoch so the comparison stays total.
  const at = sql`COALESCE(${userAndExpertChats.createdAt}, 'epoch'::timestamp)`;
  const anchorAt = anchor.createdAt ?? new Date(0);
  const earlier = before === 0
    ? []
    : await db
        .select()
        .from(userAndExpertChats)
        .where(and(thread, or(lt(at, anchorAt), and(eq(at, anchorAt), lt(userAndExpertChats.id, anchor.id)))))
        .orderBy(desc(at), desc(userAndExpertChats.id))
        .limit(before);
  const later = after === 0
    ? []
    : await db
        .select()
        .from(userAndExpertChats)
        .where(and(thread, or(gt(at, anchorAt), and(eq(at, anchorAt), gt(userAndExpertChats.id, anchor.id)))))
        .orderBy(asc(at), asc(userAndExpertChats.id))
        .limit(after);
  return {
    reportedUserId: report.reportedUserId,
    payload: {
      reportId: report.id,
      reportType: report.reportType,
      mode: "message",
      anchorMissing: false,
      before,
      after,
      messages: [...earlier.reverse(), anchor, ...later].map((r) => view(r, anchor.id)),
    },
  };
}
