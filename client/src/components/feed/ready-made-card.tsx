/**
 * Feed panel — Ready-Made (expert itinerary template) tile for the city-feed
 * bento, Phase 2. Converges the inline `PackageCard` formerly defined in
 * discover-location.tsx onto a shared `feed/*` panel.
 *
 * ADDITIVE / behaviour-preserving — every testid and data path the inline card
 * carried is kept verbatim:
 *   - wrapper `feed-card-package-${id}`
 *   - `package-rating-${id}`, `package-sold-${id}`
 *   - `btn-view-package-${id}` (View itinerary → /expert-templates/:id)
 *   - `button-more-info-package-${id}` (the teaser "More info" modal)
 *   - `modal-package-rating-${id}`, `modal-view-itinerary-${id}`
 *
 * Data comes from the already-gated public GET /api/expert-templates
 * (approved+published, teaser-redacted); no full content is read here.
 * §13: a real rating renders only when reviewCount > 0, otherwise an honest "New".
 */
import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function FeedReadyMadeCard({
  template,
  layout = "column",
}: {
  template: any;
  layout?: "column" | "row";
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const isRow = layout === "row";

  const priceNum = Number(template.price);
  const priceDisplay = !isNaN(priceNum)
    ? `$${priceNum % 1 === 0 ? priceNum : priceNum.toFixed(2)}`
    : null;

  const reviewCount = Number(template.reviewCount ?? 0);
  const rating = reviewCount > 0 && template.averageRating ? Number(template.averageRating) : null;
  const salesCount = Number(template.salesCount ?? 0);

  const expertName = template.expertName ?? null;
  const destDuration = [template.destination, template.duration ? `${template.duration} days` : null]
    .filter(Boolean)
    .join(" · ");
  const byline = expertName ? `by ${expertName}` : destDuration;

  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground",
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {template.coverImage ? (
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
      ) : (
        <span className="text-2xl">📔</span>
      )}
    </div>
  );

  const cardBody = (
    <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase bg-primary/10 text-primary">
          Ready-made
        </span>
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

      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        {priceDisplay && <span className="text-sm font-bold text-foreground">{priceDisplay}</span>}
        {rating !== null && (
          <span data-testid={`package-rating-${template.id}`}>
            ★ {rating.toFixed(1)} ({reviewCount})
          </span>
        )}
        {salesCount > 0 && <span data-testid={`package-sold-${template.id}`}>{salesCount} sold</span>}
      </div>

      <div className="flex gap-1.5 pt-0.5 flex-wrap mt-auto">
        <Button size="sm" className="h-7 text-xs px-3" asChild data-testid={`btn-view-package-${template.id}`}>
          <a href={`/expert-templates/${template.id}`}>View itinerary</a>
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              data-testid={`button-more-info-package-${template.id}`}
            >
              <Info className="w-3 h-3 mr-1" />
              More info
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{template.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {destDuration && <p className="text-sm text-muted-foreground">{destDuration}</p>}
              {expertName && <p className="text-xs text-muted-foreground">by {expertName}</p>}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {priceDisplay && (
                  <span className="text-base font-bold text-foreground">{priceDisplay}</span>
                )}
                {rating !== null ? (
                  <span data-testid={`modal-package-rating-${template.id}`}>
                    ★ {rating.toFixed(1)} ({reviewCount})
                  </span>
                ) : (
                  <span className="font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    New
                  </span>
                )}
                {salesCount > 0 && <span>{salesCount} sold</span>}
              </div>

              {Array.isArray(template.itineraryPreview) && template.itineraryPreview.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">What's inside (preview)</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {template.itineraryPreview.map((d: any, i: number) => (
                      <div key={i} className="flex items-baseline gap-2 text-xs">
                        <span className="text-muted-foreground flex-shrink-0 font-medium">
                          Day {d.day ?? i + 1}
                        </span>
                        <span className="truncate">{d.title ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Full day-by-day details unlock after purchase.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" asChild data-testid={`modal-view-itinerary-${template.id}`}>
                  <a href={`/expert-templates/${template.id}`}>View itinerary</a>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border border-primary/40 bg-card shadow-sm hover:shadow-md transition-shadow h-full",
        isRow ? "flex flex-row" : "flex flex-col",
      )}
      data-testid={`feed-card-package-${template.id}`}
    >
      {photoArea}
      {cardBody}
    </div>
  );
}
