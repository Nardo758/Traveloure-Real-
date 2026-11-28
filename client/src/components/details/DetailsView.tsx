/**
 * V31 - the ONE Details view.
 *
 * 1280: a side sheet, 448px, right edge; a listing or a ready-made trip takes the full page instead. The gallery there is
 * one large photo, two thumbnails and a "+N" tile for the rest. 390: a bottom sheet whose first two actions stay pinned
 * and the rest live under the "..." menu; the gallery is the single photo with arrows and "{n} of {m}".
 *
 * It draws only what the record carries: no photo is no photo block, a credit needs an author AND a licence, and there
 * is no "No description available" anywhere. A description is drawn one <p> per paragraph.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  authoredByLine,
  detailsPlaceLine,
  galleryTiles,
  orderedActions,
  paragraphs,
  photoCounter,
  photoCreditLine,
  splitPinnedActions,
  usablePhotos,
  type DetailsActionKey,
  type DetailsFact,
  type DetailsPhoto,
} from "@/lib/details";

export function DetailsView({
  open,
  onClose,
  title,
  type,
  neighbourhood,
  city,
  text,
  teaser,
  photos,
  facts,
  actions,
  author,
  reviewedAt,
  curator,
  fullPage = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The place line is built from these three; missing parts drop, no empty separators. */
  type?: string | null;
  neighbourhood?: string | null;
  city?: string | null;
  text?: string | null;
  /** Short catalogue copy a tile already carries (a gem's teaser lines). Drawn as written, paragraph by paragraph. */
  teaser?: string | null;
  photos?: readonly DetailsPhoto[] | null;
  facts?: readonly DetailsFact[] | null;
  /** One control per action the type actually has; drawn in V27's order. */
  actions: Partial<Record<DetailsActionKey, ReactNode>>;
  author?: { name?: string | null; city?: string | null } | null;
  reviewedAt?: string | Date | null;
  /** A resolved curator, drawn as "Curated by {name}" with the card's own test id; absent means no line at all. */
  curator?: { id: string; name: string } | null;
  fullPage?: boolean;
}) {
  const gallery = usablePhotos(photos);
  const [index, setIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const teaserParas = paragraphs(teaser);
  const textParas = paragraphs(text);
  const ordered = orderedActions(Object.keys(actions) as DetailsActionKey[]);
  const { pinned, more } = splitPinnedActions(ordered);
  const { hero, thumbs, more: extra } = galleryTiles(gallery);
  const current = gallery[Math.min(index, Math.max(gallery.length - 1, 0))] ?? null;
  const credit = photoCreditLine(current);
  const byline = authoredByLine(author, reviewedAt);
  const place = detailsPlaceLine(type, neighbourhood, city);

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

  const thumb = (photo: DetailsPhoto, key: string) => (
    <img key={key} src={photo.url} alt="" data-testid="details-photo-thumb" className="h-full w-full object-cover" />
  );

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
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          data-testid="details-close"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/45 p-1 text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 1280: one large photo, two thumbnails, then "+N". 390: the single photo with arrows and the counter. */}
        <div data-testid="details-photo-block">
          {hero ? (
            <>
              <div className="relative hidden md:block" data-testid="details-gallery-desktop">
                <div className="grid grid-cols-3 grid-rows-2 gap-1">
                  <div className="col-span-2 row-span-2" data-testid="details-photo-hero">
                    <img src={hero.url} alt={title} className="h-[280px] w-full object-cover" data-testid="details-photo" />
                  </div>
                  {thumbs.map((photo, i) => (
                    <div key={photo.url + i} className="h-[138px] overflow-hidden">
                      {thumb(photo, `t${i}`)}
                    </div>
                  ))}
                  {extra > 0 ? (
                    <div
                      className="flex h-[138px] items-center justify-center bg-[var(--earn-chip,#F6F5F1)] text-[13px] font-semibold"
                      data-testid="details-gallery-more"
                    >
                      +{extra}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="relative md:hidden">
                <img src={hero.url} alt={title} className="h-[220px] w-full object-cover" data-testid="details-photo" />
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
              </div>
              {credit ? (
                <p
                  className="px-4 pb-1 pt-2 text-[12px] text-[var(--earn-muted,#6B7280)]"
                  data-testid="details-photo-credit"
                >
                  {credit}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="space-y-3 p-4 pb-24 md:pb-4">
          {place ? (
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--earn-muted,#6B7280)]" data-testid="details-place">
              {place}
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
          {curator ? (
            <p className="text-[12px] text-[var(--earn-muted,#6B7280)]" data-testid={`gem-curated-by-${curator.id}`}>
              Curated by {curator.name}
            </p>
          ) : null}
          {teaserParas.map((para, i) => (
            <p key={`t${i}`} className="text-[14px] leading-relaxed" data-testid="details-teaser">
              {para}
            </p>
          ))}
          {textParas.map((para, i) => (
            <p key={`p${i}`} className="text-[14px] leading-relaxed" data-testid="details-text">
              {para}
            </p>
          ))}

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
            {ordered.map((key) => (
              <div key={key} data-testid={`details-action-slot-${key}`}>
                {actions[key]}
              </div>
            ))}
          </div>

          <div
            className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t bg-[var(--earn-card,#fff)] p-3 md:hidden"
            data-testid="details-actions-pinned"
          >
            {pinned.map((key) => (
              <div key={key} className="min-w-0 flex-1" data-testid={`details-action-slot-${key}`}>
                {actions[key]}
              </div>
            ))}
            {more.length > 0 ? (
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                data-testid="details-actions-more"
                aria-label="More actions"
                className="min-h-[44px] rounded-lg border px-3 text-[18px] leading-none"
                style={{ borderColor: "var(--earn-border, #DAD9D1)" }}
              >
                ⋯
              </button>
            ) : null}
          </div>

          {moreOpen && more.length > 0 ? (
            <div
              className="fixed inset-x-0 bottom-16 z-10 flex flex-col gap-2 bg-[var(--earn-card,#fff)] p-3"
              data-testid="details-actions-more-list"
            >
              {more.map((key) => (
                <div key={key} data-testid={`details-action-slot-${key}`}>
                  {actions[key]}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
