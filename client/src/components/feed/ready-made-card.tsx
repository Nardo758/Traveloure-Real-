/**
 * Feed panel — Ready-Made (expert itinerary template) tile for the city-feed
 * bento. Phase 2c: ALWAYS the 2×1 photo-left treatment (including as the
 * fallback anchor — the grid gives every ready-made col-span-2), on the family
 * grammar: photo band (gradient + tag fallback, no grey box) · title · meta ·
 * three-column mono facts row · source row · action row (View itinerary, teal).
 * The CARD is the link (/expert-templates/:id) — the teaser "More info" modal
 * is gone; the detail page carries the teaser.
 *
 * Kept testids: wrapper `feed-card-package-${id}`, `package-rating-${id}`,
 * `package-sold-${id}`, `btn-view-package-${id}`.
 *
 * Data comes from the already-gated public GET /api/expert-templates
 * (approved+published, teaser-redacted); no full content is read here.
 * §13: a real rating renders only when reviewCount > 0, otherwise an honest "New".
 */
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function FeedReadyMadeCard({
  template,
  layout: _layout = "column",
  density = "full",
  embedded = false,
}: {
  template: any;
  /** Accepted for API compatibility; the ready-made tile is ALWAYS photo-left (2×1). */
  layout?: "column" | "row";
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" trims to two
   *  mono lines; "full" (default) keeps today's facts grid + source row. */
  density?: "full" | "compact";
  /** When true, the Bento grid item owns the visual shell and this element only
   *  owns the card's content layout and interaction semantics. */
  embedded?: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const priceNum = Number(template.price);
  const priceDisplay = !isNaN(priceNum)
    ? `$${priceNum % 1 === 0 ? priceNum : priceNum.toFixed(2)}`
    : null;

  const reviewCount = Number(template.reviewCount ?? 0);
  const rating = reviewCount > 0 && template.averageRating ? Number(template.averageRating) : null;
  const salesCount = Number(template.salesCount ?? 0);

  const expertName = template.expertName ?? null;
  const cityWideLabel = typeof template.cityWideLabel === "string" ? template.cityWideLabel : null;
  const destDuration = [template.destination, template.duration ? `${template.duration} days` : null]
    .filter(Boolean)
    .join(" · ");
  const byline = expertName ? `by ${expertName}` : destDuration;

  // Traveler-facing Ready-Made card → the buyer detail page (2026-08-26-bento-
  // compact-density). The whole card is ONE destination: body click, source row
  // and the `Get this trip` CTA all land on /ready-made/:id (never split between
  // the buyer page and the expert-template view). id-resolution there is a
  // real-data matrix row.
  const detailHref = `/ready-made/${template.id}`;
  const ctaHref = detailHref;

  // ─── Compact density ────────────────────────────────────────────────────────
  // Two mono lines: destination · duration, then price · rating(count) · sold
  // (§13 — each fragment omitted when absent). No New pill, no facts grid.
  if (density === "compact") {
    const factLine = [
      priceDisplay,
      rating !== null ? `★ ${rating.toFixed(1)} (${reviewCount})` : null,
      salesCount > 0 ? `${salesCount} sold` : null,
    ]
      .filter((p) => p && String(p).trim().length > 0)
      .join(" · ");
    return (
      <div
        className={cn(
          embedded ? "h-full flex flex-row cursor-pointer" : "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow h-full flex flex-row cursor-pointer",
        )}
        data-testid={`feed-card-package-${template.id}`}
        role="link"
        tabIndex={0}
        aria-label={`${template.title} itinerary`}
        onClick={() => (window.location.href = detailHref)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = detailHref;
          }
        }}
      >
        <div className="relative overflow-hidden flex-shrink-0 flex items-center justify-center w-[40%] min-w-[120px] self-stretch bg-gradient-to-br from-teal-50 via-emerald-100 to-teal-200/70 text-teal-700">
          {template.coverImage && (
            <img
              src={template.coverImage}
              alt={template.title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
        </div>
        <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-teal-50 text-teal-700 self-start">
            Ready-made
          </span>
           {cityWideLabel && (
             <div
               className="text-[10px] text-muted-foreground truncate"
               style={{ fontFamily: EARN_MONO }}
               data-testid={`package-city-wide-${template.id}`}
             >
               {cityWideLabel}
             </div>
           )}
          <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">
            {template.title}
          </h3>
          {destDuration && (
            <div className="text-[11px] text-muted-foreground truncate" style={{ fontFamily: EARN_MONO }}>
              {destDuration}
            </div>
          )}
          {factLine && (
            <div className="text-[11px] text-muted-foreground truncate" style={{ fontFamily: EARN_MONO }}>
              {factLine}
            </div>
          )}
          <div className="flex gap-1.5 pt-0.5 mt-auto">
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
              asChild
              data-testid={`btn-view-package-${template.id}`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <a href={ctaHref}>Get this trip</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div
        className={cn(
          embedded ? "h-full flex flex-row cursor-pointer" : "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow h-full flex flex-row cursor-pointer",
        )}
      data-testid={`feed-card-package-${template.id}`}
      role="link"
      tabIndex={0}
      aria-label={`${template.title} itinerary`}
      onClick={() => (window.location.href = detailHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = detailHref;
        }
      }}
    >
      {/* Photo-left band — ~40% width; gradient + tag fallback, no grey box. */}
      <div className="relative overflow-hidden flex-shrink-0 flex items-center justify-center w-[40%] min-w-[120px] self-stretch bg-gradient-to-br from-teal-50 via-emerald-100 to-teal-200/70 text-teal-700">
        {/* No-photo fallback is the gradient alone — no glyph (Phase 2d). */}
        {template.coverImage && (
          <img
            src={template.coverImage}
            alt={template.title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-teal-50 text-teal-700">
            Ready-made
          </span>
          {cityWideLabel && (
            <span
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: EARN_MONO }}
              data-testid={`package-city-wide-${template.id}`}
            >
              {cityWideLabel}
            </span>
          )}
          {rating === null && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-muted text-muted-foreground">
              New
            </span>
          )}
        </div>

        <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
          {template.title}
        </h3>

        {byline && <p className="text-[12px] text-muted-foreground line-clamp-1">{byline}</p>}

        {/* Facts row (family grammar) — price / rating / sold, §13 real fields only */}
        {(priceDisplay || rating !== null || salesCount > 0) && (
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-2">
            {priceDisplay && (
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-none truncate" style={{ fontFamily: EARN_MONO }}>
                  {priceDisplay}
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  price
                </div>
              </div>
            )}
            {rating !== null && (
              <div className="min-w-0">
                <div
                  className="text-[12.5px] font-semibold leading-none truncate"
                  style={{ fontFamily: EARN_MONO }}
                  data-testid={`package-rating-${template.id}`}
                >
                  ★ {rating.toFixed(1)} ({reviewCount})
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  rating
                </div>
              </div>
            )}
            {salesCount > 0 && (
              <div className="min-w-0">
                <div
                  className="text-[12.5px] font-semibold leading-none truncate"
                  style={{ fontFamily: EARN_MONO }}
                  data-testid={`package-sold-${template.id}`}
                >
                  {salesCount}
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  sold
                </div>
              </div>
            )}
          </div>
        )}

        {/* Source row — the template's own detail page (id-based in-platform link). */}
        <div
          className="flex items-center text-[11px] text-muted-foreground"
          style={{ fontFamily: EARN_MONO }}
          data-testid={`package-source-${template.id}`}
        >
          <a
            href={detailHref}
            className="hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            Ready-made trip{destDuration ? ` · ${destDuration}` : ""}
          </a>
        </div>

        <div className="flex gap-1.5 pt-0.5 flex-wrap mt-auto">
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
            asChild
            data-testid={`btn-view-package-${template.id}`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <a href={ctaHref}>Get this trip</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
