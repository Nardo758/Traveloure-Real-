/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`): the report-context screen, rendered with seeded data.
 *   RV1  it asks for 10 each side by default; the reported message is marked once; senders are named by role
 *   RV2  a user-level report shows the latest-messages wording and no "after" field
 *   RV3  the audit notice is always shown
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { ReportContextView } from "../admin/ReportContextView";
import { REPORT_CONTEXT_COPY as T, reportContextUrl } from "@/lib/report-context-copy";

(globalThis as any).React = React;

function render(data: unknown): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([reportContextUrl("r1")], data);
  return renderToString(<Router ssrPath="/admin"><QueryClientProvider client={client}><ReportContextView reportId="r1" /></QueryClientProvider></Router>);
}
const msg = (id: string, sender: string, isReported = false) => ({ id, sender, body: `synthetic ${id}`, hasAttachment: false, createdAt: "2026-01-01T00:00:00Z", isReported });

test("RV1 — message mode", () => {
  assert.equal(reportContextUrl("r1"), "/api/admin/message-reports/r1/context?before=10&after=10");
  const html = render({ reportId: "r1", reportType: "message", mode: "message", anchorMissing: false, before: 10, after: 10, messages: [msg("a", "reporter"), msg("b", "reported", true), msg("c", "other")] });
  assert.equal(html.split('data-testid="report-context-reported"').length - 1, 1);
  assert.ok(html.includes("Reporter") && html.includes("Reported user") && html.includes("Other participant"));
  assert.ok(html.includes('data-testid="report-context-after"'));
  assert.ok(html.includes(T.messageMode));
});

test("RV2 — user-level", () => {
  const html = render({ reportId: "r1", reportType: "user", mode: "users", anchorMissing: false, before: 10, after: 0, messages: [] });
  assert.ok(html.includes(T.usersMode) && html.includes(T.latestLabel) && html.includes(T.empty));
  assert.equal(html.includes('data-testid="report-context-after"'), false);
  const gone = render({ reportId: "r1", reportType: "message", mode: "users", anchorMissing: true, before: 10, after: 0, messages: [] });
  assert.ok(gone.includes(T.anchorMissing));
});

test("RV3 — the audit notice", () => {
  assert.ok(render({ reportId: "r1", reportType: "user", mode: "users", anchorMissing: false, before: 10, after: 0, messages: [] }).includes(T.auditNotice));
});
