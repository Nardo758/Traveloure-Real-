import type { AutomationContext, AutomationDefinition } from "../contract";

export const pendingReportNotificationAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.pending-report-admin-notification",
  name: "Notify admins of a newly pending message or user report",
  domain: "moderation",
  type: "must_have",
  trigger: { kind: "event", events: ["message_report.pending", "user_report.pending"] },
  condition: {
    description: "Only a newly inserted pending report with its existing notification payload may notify admins.",
    evaluate: (context) => context.reportPersisted === true &&
      context.status === "pending" &&
      typeof context.reportId === "string" &&
      (context.reportType === "message" || context.reportType === "user"),
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The service inserts the report before notification; existing report authorization, pending status and admin review decisions remain authoritative.",
  action: { kind: "mutate_record", detail: "Insert the existing best-effort admin_notifications row for the pending report" },
  retryPolicy: "No retry; notification insert failure is caught/logged and never fails report creation.",
  failureBehavior: "Report remains pending; this node does not suspend, block, or otherwise enforce against any user.",
  enabled: true,
};