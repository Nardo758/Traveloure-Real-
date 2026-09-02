import { cn } from "@/lib/utils";

/**
 * ReferencePhotoChip — the tier-1 honesty label (ruling 2026-09-01-photo-tiers).
 *
 * A small mono chip that sits over a TEASER image (gem card, city tile) whose photo is a
 * stock / places-sourced REFERENCE image, until an attributed real photo replaces it. Callers
 * gate rendering on `isReferencePhoto(...)` (see `@/lib/photo-provenance`) AND on the image
 * actually being present — this component is pure presentation and makes no provenance decision
 * itself.
 *
 * It is deliberately unobtrusive and non-interactive (`pointer-events-none`) so it never steals a
 * click from the card-as-link containers these surfaces use. Default placement is bottom-right;
 * pass `className` to move it to a corner a given tile leaves free.
 */
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function ReferencePhotoChip({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 rounded px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-wide",
        "bg-black/55 text-white/90 backdrop-blur-[1px]",
        className ?? "bottom-2 right-2",
      )}
      style={{ fontFamily: EARN_MONO }}
      title="Stock reference image — replaced when a local's own photo is added"
      data-testid={testId}
    >
      reference photo
    </span>
  );
}
