/**
 * "Restore my draft" on the Versions board (audit D3 screen slice; fix-queue row 249; ledger
 * `2026-10-26-d3-restore-my-draft-screen`). One strip, mounted once under the board's header offer.
 *
 * GET restorable → one row per replaced day → a tap opens a fixed-text preview (nothing is sent) →
 * Confirm sends ONE POST with that row's own snapshotId. A changed day has no button; a finalized plan
 * has one line and no buttons. When the GET fails, is missing or has nothing to restore, the strip draws
 * nothing and the board looks as it did (the degrade table D1-D5). No retry, no force, no second endpoint.
 *
 * Row 251 (CB-R Q1 follow-up; ledger `2026-10-29-versions-restore-owner-only`): the strip is the trip
 * OWNER's. A read-only viewer's POST answers 404 with no code (string R10), so the strip draws nothing,
 * and sends no GET, unless `tripRole` is "owner". An absent role is treated as a viewer (hidden).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FIXED_CANCEL, FIXED_CONFIRM } from "@/lib/fixed-plan";
import {
  VERSIONS_RESTORE_UI_COPY as C,
  fillRestoreCopy,
  readRestorable,
  restorableKey,
  restoreFailureKey,
  restoreNoteLine,
  restoreExpiredLine,
  expiredToShow,
  markExpiredSeen,
  readExpiredSeen,
  type ExpiredRestoreView,
  restoreRequestBody,
  restoreRowsToShow,
  restoreSuccessKey,
  restoreUrl,
  savedUntil,
  type RestoreNoteKey,
  type RestoreRowView,
} from "@/lib/versions-restore";

const BUTTON =
  "min-h-[44px] rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-3 text-xs font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-50";

export interface VersionsRestoreViewProps {
  finalized: boolean;
  rows: readonly RestoreRowView[];
  previewDay: number | null;
  pending: boolean;
  notes: Readonly<Record<number, RestoreNoteKey>>;
  onOpen?: (day: number) => void;
  onCancel?: () => void;
  onConfirm?: (row: RestoreRowView) => void;
  /** W13: expired snapshots to say once (already filtered for seen / dismissed). */
  expired?: readonly ExpiredRestoreView[];
  onDismissExpired?: (snapshotId: string) => void;
}

function Result({ day, note }: { day: number; note: RestoreNoteKey }) {
  return (
    <p role="status" aria-live="polite" className="mt-1 text-[color:var(--slip-ink)]" data-testid={`versions-restore-result-${day}`}>
      {restoreNoteLine(note, day)}
    </p>
  );
}

/** Props only, no hooks: what the strip draws for one state of the GET and the notes. */
export function VersionsRestoreView({ finalized, rows, previewDay, pending, notes, onOpen, onCancel, onConfirm, expired = [], onDismissExpired }: VersionsRestoreViewProps) {
  const isFinalized = finalized || Object.values(notes).includes("finalized");
  const expiredDays = new Set(expired.map((e) => e.day));
  const rowDays = new Set([...rows.map((r) => r.day), ...Array.from(expiredDays)]);
  const orphanNotes = Object.entries(notes)
    .map(([d, note]) => ({ day: Number(d), note }))
    .filter((n) => !rowDays.has(n.day) && n.note !== "finalized")
    .sort((a, b) => a.day - b.day);
  if (!isFinalized && rows.length === 0 && orphanNotes.length === 0 && expired.length === 0) return null;

  return (
    <section
      className="rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4 text-xs"
      data-testid="versions-restore-strip"
      aria-labelledby="versions-restore-heading"
    >
      {/* UI-5b: the strip is a card in the board's family, so its label is the family's EYEBROW
          (11px / 0.08em uppercase) rather than a plain semibold sentence, and its padding is the
          card's p-4. Nothing about what it says or when it draws moved. */}
      <p id="versions-restore-heading" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-muted)]" data-testid="versions-restore-heading">
        {C.heading}
      </p>
      {isFinalized ? (
        <p role="status" aria-live="polite" className="mt-1 text-[color:var(--slip-ink)]" data-testid="versions-restore-finalized">
          {C.finalized}
        </p>
      ) : (
        <>
          {rows.map((row) => {
            const note = notes[row.day];
            const until = row.kind === "restorable" ? savedUntil(row.appliedAt) : null;
            const canRestore = row.kind === "restorable" && (note === undefined || note === "failed");
            const previewing = canRestore && previewDay === row.day;
            return (
              <div key={row.day} className="mt-2" data-testid={`versions-restore-row-${row.day}`}>
                <p className="text-[color:var(--slip-ink)]" data-testid={`versions-restore-line-${row.day}`}>
                  {fillRestoreCopy(C.dayLine, { day: row.day })}
                </p>
                {until ? (
                  <p className="text-[color:var(--slip-muted)]" data-testid={`versions-restore-until-${row.day}`}>
                    {fillRestoreCopy(C.savedUntil, { date: until })}
                  </p>
                ) : null}
                {row.kind === "changed" ? (
                  <p className="text-[color:var(--slip-muted)]" data-testid={`versions-restore-note-${row.day}`}>
                    {fillRestoreCopy(C.changed, { day: row.day })}
                  </p>
                ) : null}
                {note && !(row.kind === "changed" && note === "changed") ? <Result day={row.day} note={note} /> : null}
                {previewing ? (
                  <div className="mt-2 space-y-2" data-testid={`versions-restore-preview-${row.day}`}>
                    <p className="text-[color:var(--slip-ink)]">{fillRestoreCopy(C.preview, { day: row.day })}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={BUTTON}
                        disabled={pending}
                        onClick={() => onConfirm?.(row)}
                        data-testid={`versions-restore-confirm-${row.day}`}
                      >
                        {FIXED_CONFIRM}
                      </button>
                      <button
                        type="button"
                        className={BUTTON}
                        disabled={pending}
                        onClick={() => onCancel?.()}
                        data-testid={`versions-restore-cancel-${row.day}`}
                      >
                        {FIXED_CANCEL}
                      </button>
                    </div>
                  </div>
                ) : canRestore ? (
                  <button
                    type="button"
                    className={`mt-2 ${BUTTON}`}
                    disabled={pending}
                    onClick={() => onOpen?.(row.day)}
                    data-testid={`versions-restore-go-${row.day}`}
                  >
                    {C.button}
                  </button>
                ) : null}
              </div>
            );
          })}
          {/* W13: an expired snapshot is said once, with a dismiss; it never gets a button. */}
          {expired.map((e) => (
            <div key={e.snapshotId} className="mt-2 flex items-start justify-between gap-2" data-testid={`versions-restore-expired-${e.day}`}>
              <p role="status" className="text-[color:var(--slip-ink)]" data-testid={`versions-restore-expired-line-${e.day}`}>
                {restoreExpiredLine(e.day)}
              </p>
              <button
                type="button"
                aria-label="Dismiss"
                className="shrink-0 text-[color:var(--slip-muted)] hover:text-[color:var(--slip-ink)]"
                onClick={() => onDismissExpired?.(e.snapshotId)}
                data-testid={`versions-restore-expired-dismiss-${e.day}`}
              >
                ×
              </button>
            </div>
          ))}
          {orphanNotes.map((n) => (
            <div key={n.day} className="mt-2" data-testid={`versions-restore-row-${n.day}`}>
              <Result day={n.day} note={n.note} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

/** Row 251: only the trip's owner is offered a restore; any other role, or none, sees no strip. */
export function restoreStripShown(tripRole: string | null | undefined): boolean {
  return tripRole === "owner";
}

export function VersionsRestoreStrip({ tripId, tripRole }: { tripId: string; tripRole?: string | null }) {
  const shownForRole = restoreStripShown(tripRole);
  const key = restorableKey(tripId);
  const { data, isError: readFailed, refetch: retryRead } = useQuery<unknown>({ queryKey: key, retry: false, staleTime: 15_000, enabled: shownForRole });
  const shown = restoreRowsToShow(readRestorable(data));
  // W13: what this browser was already told, read once when the strip mounts; this render shows the rest once.
  const [seenAtMount] = useState(() => readExpiredSeen(typeof localStorage !== "undefined" ? localStorage : null));
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const expired = expiredToShow(shown.expired, seenAtMount, dismissed);
  const expiredIds = expired.map((e) => e.snapshotId).join(",");
  useEffect(() => {
    // Once drawn, a snapshot's line is recorded as seen, so a reload never shows it again.
    if (shownForRole && expiredIds) markExpiredSeen(typeof localStorage !== "undefined" ? localStorage : null, expiredIds.split(","));
  }, [shownForRole, expiredIds]);
  const [previewDay, setPreviewDay] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, RestoreNoteKey>>({});
  const note = (day: number, k: RestoreNoteKey) => setNotes((prev) => ({ ...prev, [day]: k }));

  const restore = useMutation({
    mutationFn: async (v: { day: number; body: { snapshotId: string } }) =>
      (await apiRequest("POST", restoreUrl(tripId, v.day), v.body)).json(),
    onSuccess: (answer, v) => {
      setPreviewDay(null);
      if (restoreSuccessKey(answer) !== "done") return note(v.day, "failed");
      note(v.day, "done");
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/versions`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (err, v) => {
      setPreviewDay(null);
      const k = restoreFailureKey(err);
      note(v.day, k);
      if (k !== "failed") void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (!shownForRole) return null;
  // PLAN-2 lane 4 (W12): a failed read used to be drawn exactly like "there is nothing to restore" — the strip
  // simply vanished. It now says so, and retry re-reads only.
  if (readFailed) {
    return (
      <section
        className="rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4 text-xs"
        data-testid="versions-restore-strip-error"
        role="alert"
      >
        <p className="text-[color:var(--slip-ink)]">We couldn't check for saved drafts just now.</p>
        <button type="button" className="mt-1 underline" onClick={() => void retryRead()}>
          Try again
        </button>
      </section>
    );
  }
  return (
    <VersionsRestoreView
      finalized={shown.finalized}
      rows={shown.rows}
      previewDay={previewDay}
      pending={restore.isPending}
      notes={notes}
      expired={expired}
      onDismissExpired={(id) => {
        setDismissed((prev) => new Set(prev).add(id));
        markExpiredSeen(typeof localStorage !== "undefined" ? localStorage : null, [id]);
      }}
      onOpen={(day) => setPreviewDay(day)}
      onCancel={() => setPreviewDay(null)}
      onConfirm={(row) => {
        const body = restoreRequestBody(row.snapshotId);
        if (row.kind !== "restorable" || !body || restore.isPending) return;
        restore.mutate({ day: row.day, body });
      }}
    />
  );
}
