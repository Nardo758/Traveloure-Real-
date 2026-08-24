import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Star, MapPin, MessageCircle, UserCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAskExpert } from "@/lib/use-ask-expert";

interface CityFeedCardExpertProps {
  expert: any;
  city: string;
  className?: string;
  cardPosition?: number;
}

/**
 * Photo-led card for a local expert in the city feed.
 */
export function CityFeedCardExpert({ expert, city, className, cardPosition }: CityFeedCardExpertProps) {
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
  const dialogReviewCount = reviewCount;
  const dialogRating = rating;

  // Initials for the no-photo avatar (first letters of first/last name)
  const initials = [expert.firstName, expert.lastName]
    .filter(Boolean)
    .map((n: string) => n.charAt(0).toUpperCase())
    .join("") || name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col h-full",
        className,
      )}
      data-testid={`feed-card-expert-${expert.id}`}
    >
      {/* Photo band — same fixed height as the other column cards; initials avatar when no photo */}
      <div className="relative h-[104px] overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
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
            className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary"
            data-testid={`expert-initials-${expert.id}`}
          >
            {initials}
          </div>
        )}
        <span className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
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

        {packagesCount > 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`expert-packages-${expert.id}`}>
            📔 {packagesCount} {packagesCount === 1 ? "package" : "packages"}
          </p>
        )}

        {expert.expertForm?.city && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{expert.expertForm.city}</span>
          </div>
        )}

        <div className="flex gap-1.5 mt-auto">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => (window.location.href = `/local-experts/${expert.id}`)}
            data-testid={`btn-contact-expert-${expert.id}`}
          >
            <MessageCircle className="w-3 h-3 mr-1" />
            {/* Honest label: this navigates to the expert's profile (chat starts there) */}
            View {expert.firstName || "Expert"}'s profile
          </Button>

          {/* D9: More info modal — additive, the profile button above is untouched.
              Same shadcn Dialog pattern as the calendar city cards (GlobalCalendar). */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                data-testid={`button-more-info-expert-${expert.id}`}
              >
                <Info className="w-3 h-3 mr-1" />
                More info
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={name}
                      className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary flex-shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{specialty}</p>
                    {expertCity && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {expertCity}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {packagesCount > 0 && (
                    <span data-testid={`modal-expert-packages-${expert.id}`}>
                      📔 {packagesCount} {packagesCount === 1 ? "package" : "packages"}
                    </span>
                  )}
                  {/* §13: rating rendered only when review-backed (see dialogRating above) */}
                  {dialogRating !== null && (
                    <span className="flex items-center gap-0.5" data-testid={`modal-expert-rating-${expert.id}`}>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {dialogRating.toFixed(1)} ({dialogReviewCount})
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Same destination as the existing card button */}
                  <Button
                    size="sm"
                    onClick={() => (window.location.href = `/local-experts/${expert.id}`)}
                    data-testid={`modal-view-profile-${expert.id}`}
                  >
                    View profile
                  </Button>
                  {/* "Ask" goes straight into chat with this expert, pre-filled with the city */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => askExpert({ expertId: expert.id, city, subject: expertCity || city })}
                    data-testid={`modal-ask-expert-${expert.id}`}
                  >
                    <MessageCircle className="w-3 h-3 mr-1" />
                    Ask
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
