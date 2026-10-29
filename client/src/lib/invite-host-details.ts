/**
 * Order 290 (ledger `2026-10-29-invite-host-details`): the host's three guest-facing details on an
 * event, written through the EXISTING owner-scoped PATCH /api/user-experiences/:id. Row 277 put
 * hostNote, venueAddress and rsvpBy on that route's pick-based allowlist, with their shapes stated
 * once in shared/schema.ts (1000 / 255 / "YYYY-MM-DD"); this file adds no rule of its own.
 *
 * Only changed fields are sent. An emptied field is an explicit null (cleared), never an omitted
 * key, which means "not mentioned" (the rule the slip's time and budget editors follow). The date
 * stays the "YYYY-MM-DD" string the date input gives; it is never passed through new Date().
 */
export interface InviteHostDetails {
  hostNote: string | null;
  venueAddress: string | null;
  rsvpBy: string | null;
}

export type InviteHostDetailsDraft = Record<keyof InviteHostDetails, string>;

export const INVITE_HOST_DETAILS_KEYS: readonly (keyof InviteHostDetails)[] = ["hostNote", "venueAddress", "rsvpBy"];

/** The stored values as the section's fields; a value the row does not have is an empty field. */
export function hostDetailsDraft(stored: Partial<InviteHostDetails> | null | undefined): InviteHostDetailsDraft {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    hostNote: text(stored?.hostNote),
    venueAddress: text(stored?.venueAddress),
    rsvpBy: text(stored?.rsvpBy),
  };
}

/** The PATCH body: only the changed fields, trimmed, an emptied field as null. */
export function hostDetailsPatch(
  draft: InviteHostDetailsDraft,
  stored: Partial<InviteHostDetails> | null | undefined,
): Partial<InviteHostDetails> {
  const before = hostDetailsDraft(stored);
  const body: Partial<InviteHostDetails> = {};
  for (const key of INVITE_HOST_DETAILS_KEYS) {
    const next = draft[key].trim();
    if (next === before[key].trim()) continue;
    body[key] = next === "" ? null : next;
  }
  return body;
}
