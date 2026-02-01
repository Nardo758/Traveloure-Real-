import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Phone, Globe, DollarSign, Plus, ExternalLink } from "lucide-react";
import { useState } from "react";

interface VenueCardProps {
  venue: {
    id: string;
    name: string;
    address: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: number;
    photos?: string[];
    phone?: string;
    website?: string;
    types?: string[];
    source: string;
  };
  onAddToCart?: (venue: any) => void;
  onViewDetails?: (venue: any) => void;
}

export function VenueCard({ venue, onAddToCart, onViewDetails }: VenueCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const getPriceLevelIndicator = (level?: number) => {
    if (!level) return null;
    return "$".repeat(level);
  };

  const formatTypes = (types?: string[]) => {
    if (!types || types.length === 0) return null;
    // Filter out generic types and show only relevant ones
    const relevantTypes = types.filter(t => 
      !['point_of_interest', 'establishment'].includes(t)
    );
    return relevantTypes.slice(0, 2).map(type => 
      type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    );
  };

  const defaultImage = "https://images.unsplash.com/photo-1519167758481-83f29da8fd21?w=800&q=80";
  const venueImage = venue.photos && venue.photos.length > 0 && !imageError 
    ? venue.photos[0] 
    : defaultImage;

  return (
    <Card className="overflow-hidden hover-elevate" data-testid={`card-venue-${venue.id}`}>
      <div className="relative h-48 overflow-hidden bg-gray-100">
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
          </div>
        )}
        <img
          src={venueImage}
          alt={venue.name}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageError(true);
            setImageLoading(false);
          }}
        />
        {venue.priceLevel && (
          <Badge className="absolute top-2 right-2 bg-white/90 text-gray-900 no-default-hover-elevate no-default-active-elevate">
            {getPriceLevelIndicator(venue.priceLevel)}
          </Badge>
        )}
        {venue.rating && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-white/90 px-2 py-1 rounded-md">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-semibold">{venue.rating.toFixed(1)}</span>
            {venue.reviewCount && (
              <span className="text-xs text-gray-600">({venue.reviewCount})</span>
            )}
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-lg line-clamp-1 mb-1">{venue.name}</h3>
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="line-clamp-2">{venue.address}</p>
          </div>
        </div>

        {formatTypes(venue.types) && (
          <div className="flex flex-wrap gap-1">
            {formatTypes(venue.types)?.map((type, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {type}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          {venue.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              <span className="text-xs">{venue.phone}</span>
            </div>
          )}
          {venue.website && (
            <a
              href={venue.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[#FF385C]"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-venue-website-${venue.id}`}
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs">Website</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex gap-2">
        {onViewDetails && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onViewDetails(venue)}
            data-testid={`button-view-details-${venue.id}`}
          >
            View Details
          </Button>
        )}
        {onAddToCart && (
          <Button
            className="flex-1 bg-[#FF385C]"
            onClick={() => onAddToCart(venue)}
            data-testid={`button-add-to-cart-${venue.id}`}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add to Cart
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
