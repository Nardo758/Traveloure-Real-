/**
 * V31 - the ONE Details view.
 *
 * 1280: a side sheet, 448px, right edge; a listing or a ready-made trip takes the full page instead (their text and
 * actions are long). 390: a bottom sheet whose first two actions stay pinned and the rest live under "...".
 *
 * It draws only what the record carries: no photo is no photo block, an uncredited photo is not shown, and there is no
 * "No description available" anywhere - a short or absent text simply draws no text paragraph.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  authoredByLine,
  descriptionState,
  orderedActions,
  photoCounter,
  photoCreditLine,
  splitPinnedActions,
  usablePhotos,
  type DetailsActionKey,
  type DetailsFact,
  type DetailsPhoto,
} from "@/lib/details";

export type DetailsAction = { key: DetailsActionKey; label: string; onPress: () => void };

export function DetailsView({
  open,
  onClose,
  title,
  placeLine,
  text,
  photos,
  facts,
  actions,
  author,
  reviewedAt,
  fullPage = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  placeLine?: string | null;
  text?: string | null;
  photos?: readonly DetailsPhoto[] | null;
  facts?: readonly DetailsFact[] | null;
  actions: readonly DetailsAction[];
  author?: { name?: string | null; city?: string | null } | null;
  reviewedAt?: string | Date | null;
  fullPage?: boolean;
}) {
  const gallery = usablePhotos(photos);
  const [index, setIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const description = descriptionState(text);
  const ordered = orderedActions(actions.map((a) => a.key));
  const byKey = new Map(actions.map((a) => [a.key, a]));
  const pins = splitPinnedActions(ordered);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setMoreOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = gallery[Math.min(index, Math.max(gallery.length - 1, 0))] ?? null;
  const credit = photoCreditLine(current);
  const byline = authoredByLine(author, reviewedAt);

  const actionButton = (key: DetailsActionKey, compact = false) => {
    const action = byKey.get(key);
    if (!action) return null;
    return (
      <button
        key={key}
        type="button"
        onClick={() => {
          onClose();
          action.onPress();
        }}
        data-testid={`details-action-${key}`}
        className={
          compact
            ? "min-h-[40px] w-full rounded-lg border px-3 text-left text-[13px] font-medium"
            : "min-h-[44px] w-full rounded-lg bg-[var(--earn-ink,#1F2937)] px-3 text-[13px] font-semibold text-white"
        }
        style={compact ? { borderColor: "var(--earn-border, #DAD9D1)", color: "var(--earn-ink, #111)" } : undefined}
      >
        {action.label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="details-view">
      <div className="absolute inset-0 bg-black/35" data-testid="details-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          fullPage
            ? "absolute inset-0 overflow-y-auto bg-[var(--earn-card,#fff)]"
            : "absolute bottom-0 left-0 right-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-[var(--earn-card,#fff)] md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[448px] md:rounded-none md:rounded-l-2xl"
        }
      >
        <div className="relative" data-testid="details-photo-block">
          {current ? (
            <div className="relative h-[220px] w-full md:h-[280px]">
              <img src={current.url} alt={title} data-testid="details-photo" className="h-full w-full object-cover" />
              {gallery.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    data-testid="details-photo-prev"
                    onClick={() => setIndex((i) => (i - 1 + gallery.length) % gallery.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    data-testid="details-photo-next"
                    onClick={() => setIndex((i) => (i + 1) % gallery.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1 text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <span
                    className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white"
                    data-testid="details-photo-count"
                  >
                    {photoCounter(index, gallery.length)}
                  </span>
                </>
              ) : null}
              {credit ? (
                <span
                  className="absolute bottom-2 left-3 rounded bg-black/55 px-1.5 py-0.5 text-[10.5px] text-white"
                  data-testid="details-photo-credit"
                >
                  {credit}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          data-testid="details-close"
          className="absolute right-2 top-2 rounded-full bg-black/45 p-1 text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-3 p-4 pb-20 md:pb-4">
          {placeLine ? (
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--earn-muted,#6B7280)]" data-testid="details-place">
              {placeLine}
            </p>
          ) : null}
          <h1 className="text-[22px] font-semibold leading-tight" data-testid="details-title">
            {title}
          </h1>
          {byline ? (
            <p className="text-[12px] text-[var(--earn-muted,#6B7280)]" data-testid="details-byline">
              {byline}
            </p>
          ) : null}
          {description !== "none" ? (
            <p className="text-[14px] leading-relaxed" data-testid="details-text">
              {text}
            </p>
          ) : null}

          {facts && facts.length > 0 ? (
            <ul className="divide-y" data-testid="details-facts">
              {facts.map((f) => (
                <li key={f.label} className="py-2">
                  <p className="text-[13px]">
                    <span className="text-[var(--earn-muted,#6B7280)]">{f.label}: </span>
                    {f.value}
                  </p>
                  <p className="text-[11px] text-[var(--earn-muted,#6B7280)]">{f.source}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="hidden gap-2 md:flex md:flex-col" data-testid="details-actions-desktop">
            {ordered.map((key) => actionButton(key))}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t bg-[var(--earn-card,#fff)] p-3 md:hidden" data-testid="details-actions-pinned">
            {pins.pinned.map((key) => actionButton(key))}
            {pins.more.length > 0 ? (
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                data-testid="details-actions-more"
                className="min-h-[44px] rounded-lg border px-3 text-[18px] leading-none"
                style={{ borderColor: "var(--earn-border, #DAD9D1)" }}
              >
                ...
              </button>
            ) : null}
          </div>

          {moreOpen && pins.more.length > 0 ? (
            <div className="fixed inset-x-0 bottom-16 z-10 flex flex-col gap-2 bg-[var(--earn-card,#fff)] p-3" data-testid="details-actions-more-list">
              {pins.more.map((key) => actionButton(key, true))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
