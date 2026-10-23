/**
 * Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the support inbox's rules over `contact_submissions`. Pure, so
 * the admin route, the digest shape and the page read one copy.
 *
 * The first-response target is the admin setting `support_first_response_hours`. It has no default: while it is unset
 * (or not a whole number of hours) nothing is overdue and the digest's overdue count is null, never 0.
 */
import { z } from "zod";

export const SUPPORT_FIRST_RESPONSE_HOURS_SETTING = "support_first_response_hours" as const;

/** The values `contact_submissions.status` holds (no DB CHECK; app-enforced). */
export const SUPPORT_STATUSES = ["new", "in_progress", "resolved", "archived"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_OPEN_STATUSES: readonly SupportStatus[] = ["new", "in_progress"];

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v);
}

/** A whole number of hours, 1 to 720, as the settings screen stores it. */
export function isValidSupportFirstResponseHoursSetting(v: unknown): boolean {
  return typeof v === "string" && /^[1-9][0-9]{0,2}$/.test(v.trim()) && Number(v.trim()) <= 720;
}

/** The stored target, or null when the row is absent or invalid (no default). */
export function parseSupportFirstResponseHours(raw: string | null | undefined): number | null {
  return isValidSupportFirstResponseHoursSetting(raw) ? Number(String(raw).trim()) : null;
}

export interface SupportRowFacts {
  status: string | null;
  assignedAdminId: string | null;
  firstResponseAt: Date | string | null;
  createdAt: Date | string | null;
}

function isOpen(status: string | null): boolean {
  return (SUPPORT_OPEN_STATUSES as readonly string[]).includes(status ?? "new");
}

/**
 * Overdue: still open, no first response, and older than the target. Null when the target is unset, and for a row
 * with no `created_at` (its age is unknown).
 */
export function supportSubmissionOverdue(row: SupportRowFacts, targetHours: number | null, now: Date): boolean | null {
  if (targetHours == null) return null;
  if (!isOpen(row.status) || row.firstResponseAt) return false;
  if (!row.createdAt) return null;
  const created = new Date(row.createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  return now.getTime() - created > targetHours * 3_600_000;
}

/**
 * The PATCH body: a `.strict()` pick of the three things the inbox sets. An empty body is refused (400), never a
 * no-op success. `assignedAdminId: null` unassigns; `responseNotes: null` or "" clears the note.
 */
export const supportPatchBodySchema = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    assignedAdminId: z.string().trim().min(1).max(255).nullable().optional(),
    responseNotes: z.string().max(5000).nullable().optional(),
  })
  .strict()
  .refine((b) => b.status !== undefined || b.assignedAdminId !== undefined || b.responseNotes !== undefined, {
    message: "Send at least one of status, assignedAdminId or responseNotes.",
  });
export type SupportPatchBody = z.infer<typeof supportPatchBodySchema>;

/** A response is a move out of `new` or a non-empty note. Assigning alone is not a response. */
export function patchCountsAsFirstResponse(body: SupportPatchBody): boolean {
  if (body.status !== undefined && body.status !== "new") return true;
  return typeof body.responseNotes === "string" && body.responseNotes.trim().length > 0;
}
