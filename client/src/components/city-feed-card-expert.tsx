import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Info, Star, MapPin, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAskExpert } from "@/lib/use-ask-expert";
import type { BentoCompactActionState } from "@/lib/bento-action-state";

// Family-card grammar (2026-08-25-card-family): mono facts/source rows share the
// per-file local const pattern used across the earn family.
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface CityFeedCardExpertProps {
  expert: any;
  city: string;
  className?: string;
  cardPosition?: number;
  /** Phase 2e Part A (2026-08-26-bento-compact-density): "compact" bento tile;
   *  "full" (default) renders byte-identical to today. */
  density?: "full" | "compact";
  compactActionState?: BentoCompactActionState;
}

/**
 * Photo-led card for a local expert in the city feed, on the family grammar:
 * photo band (gradient + initials fallback, no grey box) · title · meta ·
 * three-column mono facts row · source row · action row (View profile navy /
 * Ask an expert outline). The CARD is the link (the expert's profile) — no
 * "More info" text link or modal.
 */
export function CityFeedCardExpert({ expert, city, className, cardPosition, density = "full", compactActionState: _compactActionState }: CityFeedCardExpertProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const askExpert = useAskExpert();
  const imageUrl = expert.profileImageUrl || expert.profilePhoto || null;

  const name = [expert.firstName, expert.lastName].filter(Boolean).join(" ") || expert.name || "Expert";
  const specialty = expert.expertForm?.primarySpecialty || expert.specialties?.[0] || "Local Expert";
  const packagesCount = Number(expert.packagesCount ?? 0);
  const expertCity = expert.expertForm?.city ?? null;

  // §13 honesty: show a rating ONLY when it is review-backed. The expert-level
  // aggregate (server: getExpertsWithProfiles) is a review-count-weighted mean of
  // the expert's own services' reviews, and is null when reviewCount === 0. Gate on
  // reviewCount and read ONLY averageRating — never a stale `expert.rating` fallback.
  const reviewCount = Number(expert.reviewCount ?? 0);
  const rating = reviewCount > 0 && expert.averageRating != null ? Number(expert.averageRating) : null;

  // Lowest real starting price across the expert's offerings, or null (§13).
  const fromPrice: number | null = (() => {
    const prices = (expert.selectedServices ?? [])
      .map((s: any) => parseFloat(s?.offering?.price ?? ""))
      .filter((n: number) => !isNaN(n) && n > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  })();

  // Initials for the no-photo avatar (first letters of first/last name)
  const initials = [expert.firstName, expert.lastName]
    .filter(Boolean)
    .map((n: string) => n.charAt(0).toUpperCase())
    .join("") || name.charAt(0).toUpperCase();

  // Source-link ruling (2026-08-25-card-source-link): /s/:handle when a claimed
  // handle exists on the payload, else the id-based /experts/:id fallback.
  const profileHref = expert.handle ? `/s/${expert.handle}` : `/experts/${expert.id}`;

  // ─── Compact density (2026-08-26-bento-compact-density) ─────────────────────
  // One mono meta line: from-price / ★rating(count), each omitted when absent
  // (§13); the whole line is omitted when neither is real. Keeps View profile /
  // Ask, the Expert corner tag, and the card-as-link navigation.
  if (density === "compact") {
    const metaText = [
      fromPrice !== null ? `from $${fromPrice}` : null,
      rating !== null ? `★ ${rating.toFixed(1)} (${reviewCount})` : null,
    ]
      .filter((p) => p && String(p).trim().length > 0)
      .join(" · ");
    return (
      <div
        className={cn(
          "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
          className,
        )}
        data-testid={`feed-card-expert-${expert.id}`}
        role="link"
        tabIndex={0}
        aria-label={`${name} profile`}
        onClick={() => (window.location.href = profileHref)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = profileHref;
          }
        }}
      >
        {/* §4a: the card body is the profile path; the Info icon is passive. */}
        <div className="relative h-[84px] overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-100 to-teal-200/70 flex items-center justify-center flex-shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full bg-white/70 flex items-center justify-center text-base font-semibold text-teal-700"
              data-testid={`expert-initials-${expert.id}`}
            >
              {initials}
            </div>
          )}
          <span
            className="absolute top-2 left-2 text-white text-[10px] font-medium rounded-full px-2 py-0.5"
            style={{ background: "var(--earn-navy)" }}
          >
            Expert
          </span>
          <Info
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5"
            style={{ color: "var(--earn-muted)" }}
            data-testid={`info-cue-expert-${expert.id}`}
          />
        </div>
        <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
          <h3 className="font-semibold text-[15px] leading-tight truncate tracking-tight">{name}</h3>
          {metaText && (
            <div className="text-[11px] text-muted-foreground truncate" style={{ fontFamily: EARN_MONO }} data-testid={`expert-facts-${expert.id}`}>
              {metaText}
            </div>
          )}
          <div className="flex gap-1.5 mt-auto pt-0.5">
            <Button
              size="sm"
              asChild
              className="flex-1 h-7 text-xs"
              style={{ background: "var(--earn-navy)", color: "#fff", border: "none" }}
              data-testid={`btn-contact-expert-${expert.id}`}
            >
              <a href={profileHref} onClick={(e) => e.stopPropagation()}>
                View profile
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation();
                askExpert({ expertId: expert.id, city, subject: expertCity || city });
              }}
              data-testid={`btn-ask-expert-${expert.id}`}
            >
              Ask an expert
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer",
        className,
      )}
      data-testid={`feed-card-expert-${expert.id}`}
      role="link"
      tabIndex={0}
      aria-label={`${name} profile`}
      onClick={() => (window.location.href = profileHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = profileHref;
        }
      }}
    >
      {/* Photo band — gradient + initials fallback (family grammar, no grey box) */}
      <div className="relative h-[104px] overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-100 to-teal-200/70 flex items-center justify-center flex-shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full bg-white/70 flex items-center justify-center text-lg font-semibold text-teal-700"
            data-testid={`expert-initials-${expert.id}`}
          >
            {initials}
          </div>
        )}
        <span
          className="absolute top-2 left-2 text-white text-[10px] font-medium rounded-full px-2 py-0.5"
          style={{ background: "var(--earn-navy)" }}
        >
          Expert
        </span>
      </div>

      <div className="p-3 space-y-1.5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <h3 className="font-semibold text-sm truncate">{name}</h3>
          </div>
          {rating !== null && (
            <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-1">{specialty}</p>

        {expertCity && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{expertCity}</span>
          </div>
        )}

        {/* Facts row (family grammar) — 3 mono columns, §13 real fields only */}
        {(fromPrice !== null || rating !== null || packagesCount > 0) && (
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-2" data-testid={`expert-facts-${expert.id}`}>
            {fromPrice !== null && (
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-none truncate" style={{ fontFamily: EARN_MONO }}>
                  ${fromPrice}
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  from
                </div>
              </div>
            )}
            {rating !== null && (
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-none truncate" style={{ fontFamily: EARN_MONO }}>
                  {rating.toFixed(1)} ({reviewCount})
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  rating
                </div>
              </div>
            )}
            {packagesCount > 0 && (
              <div className="min-w-0">
                <div
                  className="text-[12.5px] font-semibold leading-none truncate"
                  style={{ fontFamily: EARN_MONO }}
                  data-testid={`expert-packages-${expert.id}`}
                >
                  {packagesCount}
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide leading-none text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
                  {packagesCount === 1 ? "package" : "packages"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Source row — /s/:handle when claimed, else /experts/:id (id fallback) */}
        <div
          className="flex items-center text-[11px] text-muted-foreground"
          style={{ fontFamily: EARN_MONO }}
          data-testid={`expert-source-${expert.id}`}
        >
          <a
            href={profileHref}
            className="inline-flex items-center gap-1 min-w-0 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{expert.handle ? `@${expert.handle}` : name}</span>
          </a>
        </div>

        <div className="flex gap-1.5 mt-auto pt-0.5">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            style={{ background: "var(--earn-navy)", color: "#fff", border: "none" }}
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = profileHref;
            }}
            data-testid={`btn-contact-expert-${expert.id}`}
          >
            {/* Honest label: this navigates to the expert's profile (chat starts there) */}
            View {expert.firstName || "Expert"}'s profile
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              askExpert({ expertId: expert.id, city, subject: expertCity || city });
            }}
            data-testid={`btn-ask-expert-${expert.id}`}
          >
            Ask an expert
          </Button>
        </div>
      </div>
    </div>
  );
}
