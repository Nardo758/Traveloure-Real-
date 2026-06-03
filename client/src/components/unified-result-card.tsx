import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Star, 
  MapPin, 
  Phone, 
  ExternalLink, 
  MessageSquare,
  DollarSign,
  Check,
  UserCheck,
  Send,
  Loader2,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  source: "native" | "serp" | "viator" | "amadeus" | "booking_com" | "opentable" | "fever" | "poi" | "transfer" | "safety" | "restaurant";
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
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [travelDate, setTravelDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [bookingNotes, setBookingNotes] = useState("");
  const { toast } = useToast();

  const isPartnerSource = result.source === "viator" || result.source === "amadeus" || result.source === "booking_com" || result.source === "fever" || result.source === "opentable";
  const isPartner = result.isPartner || isPartnerSource;
  const hasPartnerBookingUrl = isPartner && !!result.bookingUrl;
  const displayName = result.name || result.title || "Unknown";
  const imageUrl = result.imageUrl || result.thumbnail;
  const websiteUrl = result.websiteUrl || result.website;

  const partnerName = result.source === "viator" ? "Viator"
    : result.source === "booking_com" ? "Booking.com"
    : result.source === "fever" ? "Fever"
    : result.source === "amadeus" ? "Amadeus"
    : result.source === "opentable" ? "OpenTable"
    : "Partner";

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

  const bookingRequestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: displayName,
        partnerName,
        partnerCategory: result.category ?? "activity",
        affiliateUrl: result.bookingUrl,
        travelDate: travelDate || null,
        travelers,
        userNotes: bookingNotes || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Booking requested!", description: "An expert will handle this for you." });
      setBookingModalOpen(false);
      setTravelDate(""); setTravelers(1); setBookingNotes("");
    },
    onError: () => {
      toast({ title: "Sign in required", description: "Please sign in to request a booking.", variant: "destructive" });
    },
  });

  const handleCardClick = () => {
    if (!clicked && result.source === "serp") {
      setClicked(true);
      trackClickMutation.mutate();
    }
  };

  const handleViewDetails = () => {
    handleCardClick();
    if (hasPartnerBookingUrl) {
      setBookingModalOpen(true);
    } else if (result.bookingUrl) {
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
    <>
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
                  variant={hasPartnerBookingUrl ? "outline" : "default"}
                  className={hasPartnerBookingUrl ? "border-violet-300 text-violet-700 hover:bg-violet-50" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails();
                  }}
                  data-testid={`button-view-${result.id}`}
                >
                  {hasPartnerBookingUrl ? (
                    <><UserCheck className="h-3.5 w-3.5 mr-1" />Request booking</>
                  ) : (
                    <><ExternalLink className="h-3.5 w-3.5 mr-1" />{isPartner ? "Book" : "View"}</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline affiliate booking modal for partner items */}
      {hasPartnerBookingUrl && (
        <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
          <DialogContent className="max-w-md" data-testid={`booking-modal-${result.id}`}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">{partnerName}</span>
                Request Expert Booking
              </DialogTitle>
              <DialogDescription>{displayName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5 flex items-start gap-2">
                <UserCheck className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-violet-700">A Traveloure expert will book this on your behalf. You'll be notified when it's confirmed.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`bm-date-${result.id}`} className="text-xs font-medium">Travel date</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input id={`bm-date-${result.id}`} type="date" className="pl-8 text-sm" value={travelDate} onChange={e => setTravelDate(e.target.value)} data-testid={`input-date-${result.id}`} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`bm-travelers-${result.id}`} className="text-xs font-medium">Travelers</Label>
                <Input id={`bm-travelers-${result.id}`} type="number" min={1} max={12} className="text-sm" value={travelers} onChange={e => setTravelers(parseInt(e.target.value) || 1)} data-testid={`input-travelers-${result.id}`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`bm-notes-${result.id}`} className="text-xs font-medium">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea id={`bm-notes-${result.id}`} placeholder="Any special requests…" className="text-sm resize-none h-16" value={bookingNotes} onChange={e => setBookingNotes(e.target.value)} data-testid={`textarea-notes-${result.id}`} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setBookingModalOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => bookingRequestMutation.mutate()} disabled={bookingRequestMutation.isPending} data-testid={`button-submit-${result.id}`}>
                  {bookingRequestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Request booking
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
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
