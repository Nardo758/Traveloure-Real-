/**
 * Row 210. The approved retention sentence, shown only when the server sent a day count.
 * The words "delete them sooner" are the ask. No other sentence is added.
 */
import { useState } from "react";
import {
  GUEST_DATA_RETENTION_ASK,
  guestDataRetentionNotice,
  retentionDaysFromPayload,
} from "@shared/guest-data-retention";

export function guestDataDeletionPath(token: string): string {
  return `/api/invites/${encodeURIComponent(token)}/delete-rsvp-details`;
}

export async function requestGuestDataDeletion(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(guestDataDeletionPath(token), { method: "POST" });
  return res.ok;
}

export function GuestDataRetentionNotice({
  retentionDays,
  token,
  onErased,
}: {
  retentionDays: unknown;
  token: string;
  onErased: () => void;
}) {
  const days = retentionDaysFromPayload(retentionDays);
  const [pending, setPending] = useState(false);
  if (days == null || !token) return null;
  const sentence = guestDataRetentionNotice(days);
  const at = sentence.indexOf(GUEST_DATA_RETENTION_ASK);
  async function ask() {
    if (pending) return;
    setPending(true);
    try {
      const ok = await requestGuestDataDeletion(token);
      if (ok) onErased();
    } finally {
      setPending(false);
    }
  }
  return (
    <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-muted-foreground" data-testid="guest-data-retention-notice">
      {at < 0 ? sentence : (
        <>
          {sentence.slice(0, at)}
          <button
            type="button"
            className="inline underline text-foreground disabled:opacity-60"
            disabled={pending}
            onClick={() => { void ask(); }}
            data-testid="guest-data-retention-request"
          >
            {GUEST_DATA_RETENTION_ASK}
          </button>
          {sentence.slice(at + GUEST_DATA_RETENTION_ASK.length)}
        </>
      )}
    </p>
  );
}
