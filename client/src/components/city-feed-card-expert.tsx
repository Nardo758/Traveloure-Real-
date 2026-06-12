import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Star, MapPin, MessageCircle, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityFeedCardExpertProps {
  expert: any;
  city: string;
  className?: string;
}

/**
 * Photo-led card for a local expert in the city feed.
 */
export function CityFeedCardExpert({ expert, city, className }: CityFeedCardExpertProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const imageUrl = expert.profileImageUrl || expert.profilePhoto || null;

  if (!imageUrl) return null;

  const name = [expert.firstName, expert.lastName].filter(Boolean).join(" ") || expert.name || "Expert";
  const rating = expert.averageRating || expert.rating;
  const specialty = expert.expertForm?.primarySpecialty || expert.specialties?.[0] || "Local Expert";

  return (
    <div
      className={cn(
        "group rounded-xl overflow-hidden border bg-card shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
      data-testid={`feed-card-expert-${expert.id}`}
    >
      {/* Photo — 4:3 aspect */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
        <span className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-medium rounded-full px-2 py-0.5">
          Expert
        </span>
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <h3 className="font-semibold text-sm truncate">{name}</h3>
          </div>
          {rating && (
            <div className="flex items-center gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{Number(rating).toFixed(1)}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-1">{specialty}</p>

        {expert.expertForm?.city && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{expert.expertForm.city}</span>
          </div>
        )}

        <Button
          size="sm"
          className="w-full h-7 text-xs mt-1"
          onClick={() => (window.location.href = `/local-experts/${expert.id}`)}
          data-testid={`btn-contact-expert-${expert.id}`}
        >
          <MessageCircle className="w-3 h-3 mr-1" />
          Chat with {expert.firstName || "Expert"}
        </Button>
      </div>
    </div>
  );
}
