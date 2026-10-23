/** Ops gap 10 (ledger `2026-10-22-report-message-context`): the conversation behind one message report. Admin-only. */
import React from "react";
import { useParams } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { ReportContextView } from "@/components/admin/ReportContextView";
import { REPORT_CONTEXT_COPY } from "@/lib/report-context-copy";

export default function AdminReportContext() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminLayout title={REPORT_CONTEXT_COPY.pageTitle}>
      <div className="p-6">{id ? <ReportContextView reportId={id} /> : null}</div>
    </AdminLayout>
  );
}
