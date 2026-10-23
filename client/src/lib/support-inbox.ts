/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the admin "Support inbox" — its words (FOUNDER WORDING
 * REVIEW on the PR) and the small rules the page reads. Status values and the overdue rule live in
 * `@shared/support-intake`.
 */
import type { SupportStatus } from "@shared/support-intake";

export const SUPPORT_COPY = {
  pageTitle: "Support inbox",
  pageSubtitle: "Messages sent through the contact form, newest first",
  sidebarLabel: "Support inbox",
  filterStatus: "Status",
  filterAll: "All",
  refresh: "Refresh",
  empty: "No messages",
  emptyFiltered: "No messages with this status",
  loadFailed: "Could not load the support inbox",
  targetUnset: "No first-response target is set, so nothing is marked overdue.",
  targetSet: (h: number) => `First-response target: ${h} ${h === 1 ? "hour" : "hours"}`,
  overdue: "Overdue",
  unassigned: "Unassigned",
  assignedTo: "Assigned to",
  colReceived: "Received",
  colFrom: "From",
  colSubject: "Subject",
  colReason: "Reason",
  colStatus: "Status",
  colAssignee: "Assignee",
  detailTitle: "Message",
  detailEmpty: "Select a message to open it",
  detailReceived: "Received",
  detailFirstResponse: "First response",
  detailNoResponse: "No response recorded",
  detailPhone: "Phone",
  detailPrefers: "Prefers",
  fieldStatus: "Status",
  fieldAssignee: "Assignee",
  fieldAssigneeNone: "Unassigned",
  fieldNote: "Internal note",
  fieldNoteHint: "Only admins see this note.",
  save: "Save",
  saved: "Saved",
  saveFailed: "Could not save",
  nothingChanged: "Nothing to save",
} as const;

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  archived: "Archived",
};

export function supportListUrl(status: string): string {
  return status ? `/api/admin/contact-submissions?status=${encodeURIComponent(status)}` : "/api/admin/contact-submissions";
}

export interface SupportDraft {
  status: string;
  assignedAdminId: string | null;
  responseNotes: string;
}

/** The PATCH body: only the fields that changed. Empty object = nothing to send. */
export function supportPatchFromDraft(original: SupportDraft, draft: SupportDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (draft.status !== original.status) out.status = draft.status;
  if ((draft.assignedAdminId ?? null) !== (original.assignedAdminId ?? null)) out.assignedAdminId = draft.assignedAdminId ?? null;
  if (draft.responseNotes !== original.responseNotes) out.responseNotes = draft.responseNotes.trim() ? draft.responseNotes : null;
  return out;
}
