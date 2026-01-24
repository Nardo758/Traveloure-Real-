import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Star, 
  MapPin, 
  Phone, 
  ExternalLink, 
  MessageSquare,
  DollarSign,
  Check
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface UnifiedResult {
  id: string;
  name: string;
  title?: string;
  rating?: number | null;
  reviewCount?: number | null;
  priceLevel?: string | null;
  address?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  websiteUrl?: string | null;
  website?: string | null;
  phone?: string | null;
  source: "native" | "serp" | "viator" | "amadeus" | "opentable" | "fever";
  isPartner?: boolean;
  category?: string | null;
  bookingUrl?: string | null;
}

interface UnifiedResultCardProps {
  result: UnifiedResult;
  template?: string;
  destination?: string;
  onInquiry?: (result: UnifiedResult) => void;
  showInquiryButton?: boolean;
}

export function UnifiedResultCard({ 
  result, 
  template = "", 
  destination = "",
  onInquiry,
  showInquiryButton = true
}: UnifiedResultCardProps) {
  const [clicked, setClicked] = useState(false);
  
  const isPartner = result.isPartner || result.source === "native" || result.source === "viator" || result.source === "amadeus" || result.source === "fever";
  const displayName = result.name || result.title || "Unknown";
  const imageUrl = result.imageUrl || result.thumbnail;
  const websiteUrl = result.websiteUrl || result.website;

  const trackClickMutation = useMutation({
    mutationFn: async () => {
      if (result.source === "serp") {
        await apiRequest("POST", "/api/serp/track-click", {
          providerId: result.id,
          metadata: {
            name: displayName,
            location: destination,
            category: result.category,
            template
          }
        });
      }
    }
  });

  const handleCardClick = () => {
    if (!clicked && result.source === "serp") {
      setClicked(true);
      trackClickMutation.mutate();
    }
  };

  const handleViewDetails = () => {
    handleCardClick();
    if (result.bookingUrl) {
      window.open(result.bookingUrl, "_blank");
    } else if (websiteUrl) {
      window.open(websiteUrl, "_blank");
    }
  };

  const handleInquiry = () => {
    handleCardClick();
    if (onInquiry) {
      onInquiry(result);
    }
  };

  const renderRating = () => {
    if (result.rating === null || result.rating === undefined) {
      return (
        <Badge variant="secondary" className="text-xs">
          New
        </Badge>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span className="font-medium">{result.rating.toFixed(1)}</span>
        {result.reviewCount !== null && result.reviewCount !== undefined && (
          <span className="text-muted-foreground text-sm">
            ({result.reviewCount.toLocaleString()})
          </span>
        )}
      </div>
    );
  };

  const renderPrice = () => {
    if (!result.priceLevel) {
      return (
        <span className="text-sm text-muted-foreground">Request Quote</span>
      );
    }
    return (
      <div className="flex items-center gap-0.5">
        {result.priceLevel.split("").map((char, i) => (
          <DollarSign 
            key={i} 
            className={`h-3.5 w-3.5 ${char === "$" ? "text-green-600 dark:text-green-400" : "text-muted-foreground/30"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <Card 
      className="overflow-hidden hover-elevate cursor-pointer"
      onClick={handleCardClick}
      data-testid={`card-result-${result.id}`}
    >
      <div className="relative">
        {imageUrl ? (
          <div 
            className="h-40 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        ) : (
          <div className="h-40 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}
        
        {isPartner && (
          <Badge 
            className="absolute top-2 left-2 bg-[#FF385C] text-white border-none"
            data-testid={`badge-partner-${result.id}`}
          >
            <Check className="h-3 w-3 mr-1" />
            Traveloure Partner
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-base line-clamp-1" title={displayName}>
            {displayName}
          </h3>
          {renderRating()}
        </div>

        {result.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {result.description}
          </p>
        )}

        <div className="space-y-1.5 mb-4">
          {result.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="line-clamp-1">{result.address}</span>
            </div>
          )}
          
          {result.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{result.phone}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          {renderPrice()}
          
          <div className="flex gap-2">
            {showInquiryButton && !isPartner && onInquiry && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInquiry();
                }}
                data-testid={`button-inquiry-${result.id}`}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                Contact
              </Button>
            )}
            
            {(result.bookingUrl || websiteUrl) && (
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetails();
                }}
                data-testid={`button-view-${result.id}`}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                {isPartner ? "Book" : "View"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function UnifiedResultGrid({ 
  results, 
  template, 
  destination,
  onInquiry,
  isLoading = false
}: { 
  results: UnifiedResult[];
  template?: string;
  destination?: string;
  onInquiry?: (result: UnifiedResult) => void;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="overflow-hidden animate-pulse">
            <div className="h-40 bg-gray-200 dark:bg-gray-700" />
            <CardContent className="p-4 space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No results found. Try adjusting your filters.</p>
      </div>
    );
  }

  const sortedResults = [...results].sort((a, b) => {
    const aPartner = a.isPartner || a.source !== "serp" ? 1 : 0;
    const bPartner = b.isPartner || b.source !== "serp" ? 1 : 0;
    return bPartner - aPartner;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sortedResults.map((result) => (
        <UnifiedResultCard
          key={result.id}
          result={result}
          template={template}
          destination={destination}
          onInquiry={onInquiry}
        />
      ))}
    </div>
  );
}
