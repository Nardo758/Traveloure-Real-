/**
 * PS-4 (a): the "Keep {date}?" chip for a plan drafted from a saved occasion. One tap confirms the dates the plan
 * already holds through `PATCH /api/trips/:id` (the one re-date rail, which stamps `dates_confirmed_at`); "Change"
 * opens the normal dates panel. No panel opens on the one tap.
 */
import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OCCASION_DRAFT_COPY, keepDateBody, keepDateLabel } from "@/lib/occasion-draft-copy";

const CHIP =
  "inline-flex h-[34px] items-center rounded-[var(--slip-radius-chip)] border px-3 text-[13px] font-semibold hover:bg-[color:var(--slip-ground)]";

export function KeepOccasionDate({
  tripId,
  startDate,
  endDate,
  onChange,
  onKept,
}: {
  tripId: string;
  startDate: string | null;
  endDate: string | null;
  onChange?: () => void;
  onKept?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const label = keepDateLabel(startDate);
  const body = keepDateBody(startDate, endDate);
  if (!label || !body) return null;
  const keep = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/trips/${tripId}`, body);
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      void queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      onKept?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void keep()}
        disabled={busy}
        className={`${CHIP} border-[color:var(--slip-primary)] bg-[color:var(--slip-card)] text-[color:var(--slip-primary)]`}
        data-testid="slip-keep-occasion-date"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => onChange?.()}
        className={`${CHIP} border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] text-[color:var(--slip-navy)]`}
        data-testid="slip-keep-occasion-date-change"
      >
        {OCCASION_DRAFT_COPY.change}
      </button>
    </>
  );
}
