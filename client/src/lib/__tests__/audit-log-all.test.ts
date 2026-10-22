/**
 * Ops gap 12 (ledger `2026-10-22-audit-log-all-actions`): the "All actions" tab's query.
 *   AQ1 only the set filters are sent, trimmed; the page becomes limit/offset
 *   AQ2 an untouched filter set is "no filters"
 *   AQ3 gap 13's before → after status reads from the row's metadata; neither side ⇒ nothing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_AUDIT_FILTERS, auditLogAllQuery, auditStatusChange, hasAuditFilters } from "../audit-log-all";

test("AQ1 the query", () => {
  assert.equal(auditLogAllQuery(EMPTY_AUDIT_FILTERS, 1), "limit=25&offset=0");
  const q = new URLSearchParams(auditLogAllQuery({ ...EMPTY_AUDIT_FILTERS, action: " approve ", actor: "a@b.test", dateFrom: "2027-01-01" }, 3));
  assert.equal(q.get("offset"), "50");
  assert.equal(q.get("action"), "approve");
  assert.equal(q.get("actor"), "a@b.test");
  assert.equal(q.get("dateFrom"), "2027-01-01");
  assert.equal(q.has("resourceType"), false);
});

test("AQ2 no filters", () => {
  assert.equal(hasAuditFilters(EMPTY_AUDIT_FILTERS), false);
  assert.equal(hasAuditFilters({ ...EMPTY_AUDIT_FILTERS, resourceId: "x" }), true);
});

test("AQ3 before → after", () => {
  assert.equal(auditStatusChange({ beforeStatus: "submitted", afterStatus: "approved" }), "submitted → approved");
  assert.equal(auditStatusChange({ afterStatus: "approved" }), "— → approved");
  assert.equal(auditStatusChange({ beforeStatus: "open" }), "open → —");
  assert.equal(auditStatusChange({}), null);
  assert.equal(auditStatusChange(null), null);
  assert.equal(auditStatusChange({ beforeStatus: 3 }), null);
});
