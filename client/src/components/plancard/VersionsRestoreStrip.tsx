/**
 * "Restore my draft" on the Versions board (audit D3 screen slice; fix-queue row 249; ledger
 * `2026-10-26-d3-restore-my-draft-screen`). One strip, mounted once under the board's header offer.
 *
 * GET restorable → one row per replaced day → a tap opens a fixed-text preview (nothing is sent) →
 * Confirm sends ONE POST with that row's own snapshotId. A changed day has no button; a finalized plan
 * has one line and no buttons. When the GET fails, is missing or has nothing to restore, the strip draws
 * nothing and the board looks as it did (the degrade table D1-D5). No retry, no force, no second endpoint.
 */
import { useState } from "react";
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
}

function Result({ day, note }: { day: number; note: RestoreNoteKey }) {
  return (
    <p role="status" aria-live="polite" className="mt-1 text-[color:var(--slip-ink)]" data-testid={`versions-restore-result-${day}`}>
      {restoreNoteLine(note, day)}
    </p>
  );
}

/** Props only, no hooks: what the strip draws for one state of the GET and the notes. */
export function VersionsRestoreView({ finalized, rows, previewDay, pending, notes, onOpen, onCancel, onConfirm }: VersionsRestoreViewProps) {
  const isFinalized = finalized || Object.values(notes).includes("finalized");
  const rowDays = new Set(rows.map((r) => r.day));
  const orphanNotes = Object.entries(notes)
    .map(([d, note]) => ({ day: Number(d), note }))
    .filter((n) => !rowDays.has(n.day) && n.note !== "finalized")
    .sort((a, b) => a.day - b.day);
  if (!isFinalized && rows.length === 0 && orphanNotes.length === 0) return null;

  return (
    <section
      className="rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-3 text-xs"
      data-testid="versions-restore-strip"
      aria-labelledby="versions-restore-heading"
    >
      <p id="versions-restore-heading" className="font-semibold text-[color:var(--slip-ink)]" data-testid="versions-restore-heading">
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

export function VersionsRestoreStrip({ tripId }: { tripId: string }) {
  const key = restorableKey(tripId);
  const { data } = useQuery<unknown>({ queryKey: key, retry: false, staleTime: 15_000 });
  const shown = restoreRowsToShow(readRestorable(data));
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

  return (
    <VersionsRestoreView
      finalized={shown.finalized}
      rows={shown.rows}
      previewDay={previewDay}
      pending={restore.isPending}
      notes={notes}
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
