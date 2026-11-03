/**
 * PS-4 (a), ledger `2026-11-02-ps4-entry-carry-forward`: a plan drafted from a member's saved occasion carries the
 * occasion's date, but its dates stay unconfirmed (the member gave the day, not the plan's span). The slip asks once:
 * "Keep {date}?" — one tap confirms the same dates through the ONE re-date rail (`PATCH /api/trips/:id`), and
 * "Change" opens the normal dates panel.
 *
 * HELD (pending Leon): both strings below.
 */
import { format } from "date-fns";
import { parseTripDate } from "@/lib/calendar-date";

export const OCCASION_DRAFT_COPY = {
  /** KEEP_DATE — the one-tap confirm. */
  keepDate: "Keep {date}?",
  /** The control beside it that opens the dates panel. */
  change: "Change",
} as const;

/** "Keep Sat Nov 14?" from the plan's start date; null when the date does not parse. */
export function keepDateLabel(startDate: string | null | undefined): string | null {
  const d = parseTripDate(startDate ?? null);
  if (!d) return null;
  return OCCASION_DRAFT_COPY.keepDate.replace("{date}", format(d, "EEE MMM d"));
}

/** The body the one tap sends: the plan's own dates, unchanged, so the re-date stamp records the confirmation. */
export function keepDateBody(startDate: string | null | undefined, endDate: string | null | undefined): { startDate: string; endDate: string } | null {
  const a = /^(\d{4}-\d{2}-\d{2})/.exec(String(startDate ?? ""))?.[1];
  const b = /^(\d{4}-\d{2}-\d{2})/.exec(String(endDate ?? ""))?.[1];
  if (!a || !b || b < a) return null;
  return { startDate: a, endDate: b };
}

/** Whether the chip shows: the owner, a plan drafted from an occasion, dates unconfirmed, and a readable date. */
export function showsKeepDate(input: { isOwner: boolean; fromOccasionDraft?: boolean | null; datesUnset: boolean; startDate?: string | null; endDate?: string | null }): boolean {
  return input.isOwner && !!input.fromOccasionDraft && input.datesUnset && keepDateLabel(input.startDate) !== null && keepDateBody(input.startDate, input.endDate) !== null;
}
