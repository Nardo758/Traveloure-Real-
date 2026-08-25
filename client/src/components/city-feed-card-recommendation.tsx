/**
 * Native engine-recommendation feed card (Discover Feed Composition Brief).
 *
 * Renders an upsell-engine candidate with the SAME chrome as the organic gem
 * card (photo area → badge row → title → description → actions) so injected
 * recommendations read as discoveries, not ads. The display fields are the
 * Ways-to-Earn offering presentation (display_name + tagline from
 * service_offering_types, resolved server-side); the CTAs are the feed's
 * traveler actions (Add / Ask / Book), NOT the provider-side "I do this".
 *
 * Honesty + secrecy contract:
 *  - every card carries a visible label ("Recommended"; a distinct marker for
 *    paid affiliate placements) — native styling, but disclosed;
 *  - raw keys NEVER reach the DOM: no offeringId/categoryKey in text, hrefs,
 *    or data-testids. If a display name arrives unresolved (raw-key shaped),
 *    it is humanized before render and the key itself is still never emitted.
 */

import React, { useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useGemPhoto } from "@/hooks/use-gem-photo";
import { useAskExpert } from "@/lib/use-ask-expert";

export interface RecommendationCandidate {
  offeringId: string;
  categoryKey: string;
  displayName: string;
  tagline: string | null;
  reason?: string;
  sourceType?: "platform_provider" | "affiliate";
  /** Server-attached endorsement flag — surfaced in the "Why recommended" modal. */
  expertEndorsed?: boolean;
}

/** "aff_guided_tour" → "Guided Tour". Last-resort guard; decorate() on the
 *  server already humanizes its fallback, so this should rarely fire. */
export function humanizeOfferingKey(key: string): string {
  return key
    .replace(/^aff_/, "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** True when a display name still looks like a machine key (snake_case). */
function looksLikeRawKey(value: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(value);
}

export function resolveRecommendationName(c: RecommendationCandidate): string {
  const dn = (c.displayName ?? "").trim();
  if (!dn || dn === c.offeringId || looksLikeRawKey(dn)) {
    return humanizeOfferingKey(dn || c.offeringId);
  }
  return dn;
}

// Category-derived placeholder visuals (emoji + tint), mirroring gemTypeMeta.
// Keyword-matched so the raw key itself is never rendered.
function recVisualMeta(c: RecommendationCandidate): { emoji: string; phBg: string; phText: string } {
  const k = `${c.categoryKey} ${c.displayName}`.toLowerCase();
  if (/photo/.test(k)) return { emoji: "📷", phBg: "bg-teal-50", phText: "text-teal-600" };
  if (/chef|food|culinary|dining|restaurant|tasting/.test(k))
    return { emoji: "🍵", phBg: "bg-pink-50", phText: "text-pink-600" };
  if (/transport|driver|transfer|car/.test(k))
    return { emoji: "🚗", phBg: "bg-blue-50", phText: "text-blue-600" };
  if (/event|ticket|show|concert|festival/.test(k))
    return { emoji: "🎫", phBg: "bg-pink-50", phText: "text-pink-600" };
  if (/wellness|spa|massage|yoga/.test(k))
    return { emoji: "🧘", phBg: "bg-teal-50", phText: "text-teal-600" };
  if (/tour|guide|walk|experience|activit/.test(k))
    return { emoji: "🧭", phBg: "bg-amber-50", phText: "text-amber-700" };
  return { emoji: "✨", phBg: "bg-amber-50", phText: "text-amber-700" };
}

interface CityFeedCardRecommendationProps {
  candidate: RecommendationCandidate;
  city: string;
  /** Slot position in the feed — used for testids/photo cache keys so raw
   *  offering keys never land in DOM attributes. */
  position: number;
  scheduledDate?: string | null;
  onAdd?: (item: any) => void;
  /** Book CTA handler — the page navigates (click attribution + categoryKey
   *  stay out of the DOM). Button hidden when omitted. */
  onBook?: (candidate: RecommendationCandidate) => void;
  /** Honest-disclosure copy (admin-configurable upstream). */
  recommendedLabel?: string;
  affiliateLabel?: string;
  layout?: "column" | "row";
  className?: string;
  cardPosition?: number;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" bento tile;
   *  "full" (default) renders byte-identical to today. */
  density?: "full" | "compact";
}

// Mono face for the compact meta line — matches the earn family's per-file const.
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function CityFeedCardRecommendation({
  candidate,
  city,
  position,
  scheduledDate,
  onAdd,
  onBook,
  recommendedLabel = "Recommended",
  affiliateLabel = "Paid partner",
  layout = "column",
  className,
  cardPosition,
  density = "full",
}: CityFeedCardRecommendationProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  // Why-recommended disclosure modal — opened by the CARD itself (family
  // grammar: the card is the link; no "More info" text link).
  const [infoOpen, setInfoOpen] = useState(false);
  const askExpert = useAskExpert();
  const name = resolveRecommendationName(candidate);
  const meta = recVisualMeta(candidate);
  const isAffiliate = candidate.sourceType === "affiliate";
  const isRow = layout === "row";

  // Impression ledger (converged from the inline RecommendationCard): the engine's
  // own /api/upsell/impression endpoint, fired once per mount. /api/feed/impression
  // never existed; this is the real ledger. Date mode uses the discover_date surface.
  const impressionFiredRef = useRef(false);
  useEffect(() => {
    if (!impressionFiredRef.current) {
      impressionFiredRef.current = true;
      fetch("/api/upsell/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: scheduledDate ? "discover_date" : "discover_location",
          offeringIds: [candidate.offeringId],
        }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.offeringId]);

  // Same photo pipeline as organic gem cards; offerings have no image column,
  // so look one up by display name + city, with the category emoji fallback.
  const { photoUrl, loading } = useGemPhoto(`rec-${position}-${name}`, name, city, null);

  const addLabel = scheduledDate
    ? `Add to ${new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Add to trip";

  const photoArea = (
    <div
      className={cn(
        "relative overflow-hidden flex-shrink-0 flex items-center justify-center",
        meta.phBg,
        meta.phText,
        isRow ? "w-36 self-stretch" : "h-[104px] w-full",
      )}
    >
      {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {!loading && photoUrl && (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* No-photo fallback is the tinted band alone — no emoji glyph (Phase 2d). */}
    </div>
  );

  const cardBody = (
    <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
      {/* Honest-disclosure label, in the gem card's badge-row position */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase whitespace-nowrap",
            isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
          )}
        >
          <Sparkles className="w-2.5 h-2.5" />
          {isAffiliate ? affiliateLabel : recommendedLabel}
        </span>
      </div>

      <h3 className="font-semibold text-[15px] leading-tight line-clamp-2 tracking-tight">
        {name}
      </h3>

      {candidate.tagline && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{candidate.tagline}</p>
      )}

      {candidate.reason && (
        <p className="text-[10px] text-muted-foreground/70 italic truncate">{candidate.reason}</p>
      )}

      <div className="flex gap-1.5 pt-0.5 flex-wrap">
        {onBook && (
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
            onClick={(e) => {
              e.stopPropagation();
              onBook(candidate);
            }}
            data-testid={`btn-book-rec-${position}`}
          >
            Book now
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 text-xs px-3"
          style={{ background: "var(--earn-navy)", color: "#fff", border: "none" }}
          onClick={(e) => {
            e.stopPropagation();
            onAdd?.({
              title: name,
              description: candidate.tagline,
              city,
              type: "recommendation",
              scheduledDate,
            });
          }}
          data-testid={`btn-add-rec-${position}`}
        >
          <Plus className="w-3 h-3 mr-1" />
          {addLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5"
          onClick={(e) => {
            e.stopPropagation();
            askExpert({ city, subject: name });
          }}
          data-testid={`btn-ask-rec-${position}`}
        >
          Ask an expert
        </Button>

        {/* "Why recommended" disclosure modal — opened by clicking the card
            (family grammar: the card is the link; the "More info" text link is
            gone). Built ONLY from wire fields (reason + expertEndorsed);
            templateStrength/matchType/price never reach the client (§13). */}
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
                  isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
                )}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {isAffiliate ? affiliateLabel : recommendedLabel}
              </span>

              {candidate.tagline && (
                <p className="text-sm text-muted-foreground">{candidate.tagline}</p>
              )}

              {(candidate.reason || candidate.expertEndorsed) && (
                <div className="p-2 rounded-lg bg-muted/50 border border-muted">
                  <p className="text-xs font-medium mb-1">Why you're seeing this</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {candidate.reason && <p data-testid={`modal-rec-reason-${position}`}>{candidate.reason}</p>}
                    {candidate.expertEndorsed === true && (
                      <p data-testid={`modal-rec-endorsed-${position}`}>✓ Endorsed by a local expert</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {onBook && (
                  <Button
                    size="sm"
                    style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
                    onClick={() => onBook(candidate)}
                    data-testid={`modal-book-rec-${position}`}
                  >
                    Book now
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAdd?.({
                      title: name,
                      description: candidate.tagline,
                      city,
                      type: "recommendation",
                      scheduledDate,
                    })
                  }
                  data-testid={`modal-add-rec-${position}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {addLabel}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  // ─── Compact density (2026-08-26-bento-compact-density) ─────────────────────
  // One mono meta line = reason (else tagline), truncated. Card opens the same
  // "Why recommended" modal. §13: line omitted when neither field is present.
  if (density === "compact") {
    const metaText = (candidate.reason ?? candidate.tagline ?? "").trim();
    return (
      <div
        className={cn(
          "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col",
          className,
        )}
        data-testid={`feed-card-rec-${position}`}
        role="link"
        tabIndex={0}
        aria-label={`Why ${name} is recommended`}
        onClick={() => setInfoOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setInfoOpen(true);
          }
        }}
      >
        {/* Compact photo band — 84px; tinted band + disclosure corner tag only. */}
        <div className={cn("relative overflow-hidden flex-shrink-0 flex items-center justify-center h-[84px] w-full", meta.phBg, meta.phText)}>
          {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
          {!loading && photoUrl && (
            <img
              src={photoUrl}
              alt={name}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          )}
          <span
            className={cn(
              "absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase whitespace-nowrap",
              isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
            )}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {isAffiliate ? affiliateLabel : recommendedLabel}
          </span>
        </div>
        <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
          <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">{name}</h3>
          {metaText && (
            <div className="text-[11px] text-muted-foreground truncate" style={{ fontFamily: EARN_MONO }}>
              {metaText}
            </div>
          )}
          <div className="flex gap-1.5 pt-0.5 items-center mt-auto">
            {onBook && (
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBook(candidate);
                }}
                data-testid={`btn-book-rec-${position}`}
              >
                Book now
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              style={{ background: "var(--earn-navy)", color: "#fff", border: "none" }}
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.({
                  title: name,
                  description: candidate.tagline,
                  city,
                  type: "recommendation",
                  scheduledDate,
                });
              }}
              data-testid={`btn-add-rec-${position}`}
            >
              <Plus className="w-3 h-3 mr-1" />
              {addLabel}
            </Button>
            {/* Compact = exactly two buttons: Ask shows ONLY when Book is absent. */}
            {!onBook && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={(e) => {
                  e.stopPropagation();
                  askExpert({ city, subject: name });
                }}
                data-testid={`btn-ask-rec-${position}`}
              >
                Ask an expert
              </Button>
            )}
          </div>
        </div>

        {/* Same "Why recommended" disclosure modal, opened by the card. */}
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
                  isAffiliate ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
                )}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {isAffiliate ? affiliateLabel : recommendedLabel}
              </span>

              {candidate.tagline && (
                <p className="text-sm text-muted-foreground">{candidate.tagline}</p>
              )}

              {(candidate.reason || candidate.expertEndorsed) && (
                <div className="p-2 rounded-lg bg-muted/50 border border-muted">
                  <p className="text-xs font-medium mb-1">Why you're seeing this</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {candidate.reason && <p data-testid={`modal-rec-reason-${position}`}>{candidate.reason}</p>}
                    {candidate.expertEndorsed === true && (
                      <p data-testid={`modal-rec-endorsed-${position}`}>✓ Endorsed by a local expert</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {onBook && (
                  <Button
                    size="sm"
                    style={{ background: "var(--earn-teal)", color: "#fff", border: "none" }}
                    onClick={() => onBook(candidate)}
                    data-testid={`modal-book-rec-${position}`}
                  >
                    Book now
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAdd?.({
                      title: name,
                      description: candidate.tagline,
                      city,
                      type: "recommendation",
                      scheduledDate,
                    })
                  }
                  data-testid={`modal-add-rec-${position}`}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {addLabel}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer",
        isRow ? "flex flex-row" : "flex flex-col",
        className,
      )}
      data-testid={`feed-card-rec-${position}`}
      role="link"
      tabIndex={0}
      aria-label={`Why ${name} is recommended`}
      onClick={() => setInfoOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setInfoOpen(true);
        }
      }}
    >
      {photoArea}
      {cardBody}
    </div>
  );
}
