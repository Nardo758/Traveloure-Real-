/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the support inbox's pure rules and the digest counts.
 *   SI1  the PATCH body: an empty body and an unknown key are refused; each field alone is admitted
 *   SI2  the first-response target: whole hours 1–720, else null (no default)
 *   SI3  overdue: null while the target is unset; only open, unanswered rows past the target
 *   SI4  digest counts: new, unassigned, overdue — overdue is null (not 0) while the target is unset
 *   SI5  what counts as a first response
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSupportFirstResponseHours,
  patchCountsAsFirstResponse,
  supportPatchBodySchema,
  supportSubmissionOverdue,
} from "../support-intake";
import { supportDigestCounts } from "../../server/services/admin-digest-shape";

const NOW = new Date("2026-10-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

test("SI1 — the PATCH body", () => {
  assert.equal(supportPatchBodySchema.safeParse({}).success, false);
  assert.equal(supportPatchBodySchema.safeParse({ priority: "high" }).success, false);
  assert.equal(supportPatchBodySchema.safeParse({ status: "closed" }).success, false);
  assert.equal(supportPatchBodySchema.safeParse({ status: "resolved" }).success, true);
  assert.equal(supportPatchBodySchema.safeParse({ assignedAdminId: null }).success, true);
  assert.equal(supportPatchBodySchema.safeParse({ responseNotes: "" }).success, true);
});

test("SI2 — the first-response target", () => {
  assert.deepEqual(["24", " 4 ", "720", "0", "721", "1.5", "", null, undefined, "abc"].map((v) => parseSupportFirstResponseHours(v as any)), [24, 4, 720, null, null, null, null, null, null, null]);
});

test("SI3 — overdue", () => {
  const row = { status: "new", assignedAdminId: null, firstResponseAt: null, createdAt: hoursAgo(30) };
  assert.equal(supportSubmissionOverdue(row, null, NOW), null);
  assert.equal(supportSubmissionOverdue(row, 24, NOW), true);
  assert.equal(supportSubmissionOverdue({ ...row, createdAt: hoursAgo(2) }, 24, NOW), false);
  assert.equal(supportSubmissionOverdue({ ...row, firstResponseAt: hoursAgo(1) }, 24, NOW), false);
  assert.equal(supportSubmissionOverdue({ ...row, status: "resolved" }, 24, NOW), false);
  assert.equal(supportSubmissionOverdue({ ...row, createdAt: null }, 24, NOW), null);
});

test("SI4 — digest counts", () => {
  const rows = [
    { status: "new", assignedAdminId: null, firstResponseAt: null, createdAt: hoursAgo(30) },
    { status: "new", assignedAdminId: "a1", firstResponseAt: null, createdAt: hoursAgo(1) },
    { status: "in_progress", assignedAdminId: null, firstResponseAt: hoursAgo(5), createdAt: hoursAgo(40) },
    { status: null, assignedAdminId: null, firstResponseAt: null, createdAt: hoursAgo(50) },
    { status: "resolved", assignedAdminId: null, firstResponseAt: null, createdAt: hoursAgo(90) },
  ];
  assert.deepEqual(supportDigestCounts(rows, null, NOW), { new: 3, unassigned: 3, overdue: null });
  assert.deepEqual(supportDigestCounts(rows, 24, NOW), { new: 3, unassigned: 3, overdue: 2 });
  assert.deepEqual(supportDigestCounts([], 24, NOW), { new: 0, unassigned: 0, overdue: 0 });
});

test("SI5 — a first response", () => {
  assert.equal(patchCountsAsFirstResponse({ assignedAdminId: "a1" }), false);
  assert.equal(patchCountsAsFirstResponse({ status: "new" }), false);
  assert.equal(patchCountsAsFirstResponse({ responseNotes: "   " }), false);
  assert.equal(patchCountsAsFirstResponse({ status: "in_progress" }), true);
  assert.equal(patchCountsAsFirstResponse({ responseNotes: "called back" }), true);
});
