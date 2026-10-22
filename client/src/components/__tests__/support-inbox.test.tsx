/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the Support inbox, rendered with seeded data and no network.
 *   SB1  rows render with status labels; "Unassigned" for a row with no assignee; Overdue only where the server said so
 *   SB2  the target line: unset vs set
 *   SB3  an opened row shows the message, first-response state and the three controls
 *   SB4  the PATCH body carries only changed fields
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupportInbox, type SupportList } from "../admin/SupportInbox";
import { SUPPORT_COPY as T, supportListUrl, supportPatchFromDraft } from "@/lib/support-inbox";

(globalThis as any).React = React;

const ROW = {
  id: "s1", name: "Synthetic Sender", email: "s1@traveloure.test", phone: null, subject: "Synthetic subject",
  message: "Synthetic message body", reason: null, preferredContactMethod: null, status: "new",
  assignedAdminId: null, responseNotes: null, firstResponseAt: null, createdAt: "2026-10-01T00:00:00Z", overdue: true,
};
function render(list: SupportList, props: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([supportListUrl("")], list);
  return renderToString(<QueryClientProvider client={client}><SupportInbox {...props} /></QueryClientProvider>);
}

test("SB1 — rows", () => {
  const html = render({
    firstResponseHours: 24,
    assignees: [{ id: "a1", name: "Synthetic Admin" }],
    submissions: [ROW, { ...ROW, id: "s2", status: "in_progress", assignedAdminId: "a1", overdue: false }],
  });
  assert.ok(html.includes('data-testid="support-row-s1"') && html.includes('data-testid="support-row-s2"'));
  assert.ok(html.includes("New") && html.includes("In progress"));
  assert.ok(html.includes(T.unassigned) && html.includes("Synthetic Admin"));
  assert.ok(html.includes('data-testid="support-overdue-s1"'));
  assert.equal(html.includes('data-testid="support-overdue-s2"'), false);
});

test("SB2 — the target line", () => {
  assert.ok(render({ firstResponseHours: null, assignees: [], submissions: [{ ...ROW, overdue: null }] }).includes(T.targetUnset));
  assert.ok(render({ firstResponseHours: 24, assignees: [], submissions: [] }).includes("First-response target: 24 hours"));
  assert.ok(render({ firstResponseHours: null, assignees: [], submissions: [] }).includes(T.empty));
});

test("SB3 — an opened row", () => {
  const html = render({ firstResponseHours: null, assignees: [{ id: "a1", name: "Synthetic Admin" }], submissions: [ROW] }, { initialOpenId: "s1" });
  assert.ok(html.includes('data-testid="support-message"'));
  assert.ok(html.includes(T.detailNoResponse));
  for (const id of ["support-field-status", "support-field-assignee", "support-field-note", "support-save"]) assert.ok(html.includes(`data-testid="${id}"`));
});

test("SB4 — only changed fields are sent", () => {
  const orig = { status: "new", assignedAdminId: null, responseNotes: "" };
  assert.deepEqual(supportPatchFromDraft(orig, orig), {});
  assert.deepEqual(supportPatchFromDraft(orig, { ...orig, assignedAdminId: "a1" }), { assignedAdminId: "a1" });
  assert.deepEqual(supportPatchFromDraft({ ...orig, responseNotes: "x" }, orig), { responseNotes: null });
  assert.deepEqual(supportPatchFromDraft(orig, { ...orig, status: "resolved", responseNotes: "done" }), { status: "resolved", responseNotes: "done" });
});
