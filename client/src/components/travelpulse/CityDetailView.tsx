import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Zap,
  MapPin,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Gem,
  Bell,
  Activity,
  Clock,
  Eye,
  EyeOff,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  Star,
  Heart,
  Camera,
  ThumbsUp,
  Brain,
  Sun,
  CloudRain,
  Thermometer,
  Shield,
  Lightbulb,
  Wallet,
  Compass,
  CalendarX,
  Play,
  Image,
  ExternalLink,
  Radio,
  Ticket,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { DestinationCalendar } from "./DestinationCalendar";
import { AIRecommendationBadges, SeasonalInsightBanner } from "./AIRecommendationBadges";

interface TravelPulseCity {
  id: string;
  cityName: string;
  country: string;
  countryCode?: string | null;
  region?: string | null;
  pulseScore: number;
  activeTravelers: number;
  trendingScore: number;
  crowdLevel: string;
  vibeTags: string[];
  currentHighlight?: string | null;
  highlightEmoji?: string | null;
  weatherScore?: number | null;
  avgHotelPrice?: string | null;
  priceChange?: string | null;
  priceTrend?: string | null;
  dealAlert?: string | null;
  totalTrendingSpots: number;
  totalHiddenGems: number;
  totalAlerts: number;
  imageUrl?: string | null;
  aiGeneratedAt?: string | null;
  aiSourceModel?: string | null;
  aiBestTimeToVisit?: string | null;
  aiSeasonalHighlights?: Array<{ month: number; rating: string; highlight: string; weatherDesc: string }> | null;
  aiUpcomingEvents?: Array<{ name: string; dateRange: string; type: string; significance: string }> | null;
  aiTravelTips?: string[] | null;
  aiLocalInsights?: string | null;
  aiSafetyNotes?: string | null;
  aiOptimalDuration?: string | null;
  aiBudgetEstimate?: { budget?: number; midRange?: number; luxury?: number } | null;
  aiMustSeeAttractions?: string[] | null;
  aiAvoidDates?: Array<{ dateRange: string; reason: string }> | null;
}

interface HiddenGem {
  id: string;
  city: string;
  placeName: string;
  placeType?: string | null;
  localRating?: string | null;
  touristMentions: number;
  localMentions: number;
  gemScore: number;
  discoveryStatus: string;
  daysUntilMainstream?: number | null;
  description?: string | null;
  whyLocalsLoveIt?: string | null;
  bestFor: string[];
  priceRange?: string | null;
  imageUrl?: string | null;
}

interface CityAlert {
  id: string;
  city: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  emoji?: string | null;
  isActive: boolean;
}

interface HappeningNow {
  id: string;
  city: string;
  eventType: string;
  title: string;
  description?: string | null;
  venue?: string | null;
  crowdLevel?: string | null;
  entryFee?: string | null;
  isLive: boolean;
  startsAt: string;
}

interface LiveActivity {
  id: string;
  city: string;
  placeName?: string | null;
  activityType: string;
  activityText: string;
  activityEmoji?: string | null;
  userName?: string | null;
  likesCount: number;
  occurredAt: string;
}

interface CityIntelligence {
  city: TravelPulseCity;
  hiddenGems: HiddenGem[];
  alerts: CityAlert[];
  happeningNow: HappeningNow[];
  liveActivity: LiveActivity[];
}

interface SocialPost {
  id: string;
  source: 'twitter' | 'instagram';
  authorName: string;
  authorHandle?: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  repostsCount?: number;
  postedAt: string;
  postUrl: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface SpontaneousOpp {
  id: string;
  title: string;
  type: string;
  source: string;
  description?: string | null;
  imageUrl?: string | null;
  affiliateUrl?: string | null;
  currentPrice: number | null;
  discountPercent?: number | null;
  urgencyScore: number;
  category?: string | null;
  remainingSpots?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}

interface CityMedia {
  id: string;
  source: 'unsplash' | 'pexels' | 'google_places';
  mediaType: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  context?: string | null;
  attractionName?: string | null;
  photographerName?: string | null;
  photographerUrl?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  isPrimary?: boolean | null;
  downloadLocationUrl?: string | null; // For Unsplash API compliance tracking
  htmlAttributions?: string[] | null; // Required by Google - must display exactly as provided
}

interface CityMediaResponse {
  hero: CityMedia | null;
  gallery: CityMedia[];
  videos: CityMedia[];
  byAttraction: Record<string, CityMedia[]>;
}

interface CityDetailViewProps {
  cityName: string;
  onBack: () => void;
}

const vibeTagColors: Record<string, string> = {
  romantic: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  adventure: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  foodie: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  nightlife: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  cultural: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  relaxation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  family: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  budget: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  luxury: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  nature: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function getAlertSeverityIcon(severity: string) {
  switch (severity) {
    case "critical": return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "warning": return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    default: return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getAlertSeverityClass(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-50 dark:bg-red-900/20";
    case "warning": return "bg-yellow-50 dark:bg-yellow-900/20";
    default: return "bg-blue-50 dark:bg-blue-900/20";
  }
}

function getDiscoveryStatusBadge(status: string, daysUntilMainstream?: number | null) {
  switch (status) {
    case "hidden":
      return (
        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          <EyeOff className="h-3 w-3 mr-1" />
          Hidden
          {daysUntilMainstream && <span className="ml-1">({daysUntilMainstream}d left)</span>}
        </Badge>
      );
    case "emerging":
      return (
        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
          <TrendingUp className="h-3 w-3 mr-1" />
          Emerging
        </Badge>
      );
    case "discovered":
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <Eye className="h-3 w-3 mr-1" />
          Discovered
        </Badge>
      );
    default:
      return null;
  }
}

function getActivityIcon(type: string) {
  switch (type) {
    case "check_in": return <MapPin className="h-4 w-4 text-blue-500" />;
    case "discovery": return <Sparkles className="h-4 w-4 text-purple-500" />;
    case "photo": return <Camera className="h-4 w-4 text-pink-500" />;
    case "review": return <Star className="h-4 w-4 text-yellow-500" />;
    case "booking": return <Calendar className="h-4 w-4 text-green-500" />;
    default: return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

interface EnhancedItem {
  id: string;
  name?: string;
  title?: string;
  description?: string | null;
  price?: string | number | null;
  rating?: string | null;
  starRating?: number | null;
  city?: string | null;
  address?: string | null;
  category?: string | null;
  preferenceTags?: string[];
  aiScore: number;
  aiReasons: string[];
  seasonalMatch: boolean;
  eventNearby?: boolean;
  eventRelated?: boolean;
  budgetMatch: boolean;
  bestTimeMatch: boolean;
  preferenceMatch?: boolean;
}

interface AIRecommendationsResponse {
  hotels: EnhancedItem[];
  activities: EnhancedItem[];
  seasonalInsight: {
    rating: string;
    weatherDescription: string | null;
    crowdLevel: string | null;
    priceLevel: string | null;
    highlights: string[];
    events: { id: string; title: string; eventType: string | null }[];
  } | null;
  bestTimeToVisit: string | null;
  totalHotels: number;
  totalActivities: number;
}

function AIRecommendationsSection({ cityName, country, cachedActivities = [] }: { cityName: string; country: string; cachedActivities?: BookableActivity[] }) {
  const currentMonth = new Date().getMonth() + 1;
  
  const { data, isLoading, error } = useQuery<AIRecommendationsResponse>({
    queryKey: ["/api/travelpulse/ai-recommendations", cityName, country, currentMonth],
    queryFn: async () => {
      const res = await fetch(
        `/api/travelpulse/ai-recommendations/${encodeURIComponent(cityName)}/${encodeURIComponent(country)}?month=${currentMonth}&limit=10`
      );
      if (!res.ok) throw new Error("Failed to fetch AI recommendations");
      return res.json();
    },
    enabled: !!cityName && !!country,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">AI recommendations not available yet for {cityName}</p>
        <p className="text-xs text-muted-foreground mt-2">Check back after the next data refresh</p>
      </Card>
    );
  }

  const { hotels, activities, seasonalInsight, bestTimeToVisit } = data;

  return (
    <div className="space-y-6" data-testid="ai-recommendations-section">
      {seasonalInsight && (
        <SeasonalInsightBanner
          rating={seasonalInsight.rating}
          weatherDescription={seasonalInsight.weatherDescription}
          events={seasonalInsight.events}
          bestTimeToVisit={bestTimeToVisit}
        />
      )}

      {hotels.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Recommended Places to Stay
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hotels.slice(0, 6).map((hotel) => (
              <Card key={hotel.id} className="overflow-hidden" data-testid={`rec-hotel-${hotel.id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm line-clamp-1">{hotel.name}</h4>
                      {hotel.address && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{hotel.address}</p>
                      )}
                    </div>
                    {hotel.starRating && (
                      <div className="flex items-center gap-0.5 ml-2">
                        {Array.from({ length: hotel.starRating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        ))}
                      </div>
                    )}
                  </div>
                  <AIRecommendationBadges
                    aiScore={hotel.aiScore}
                    aiReasons={hotel.aiReasons}
                    seasonalMatch={hotel.seasonalMatch}
                    eventNearby={hotel.eventNearby}
                    budgetMatch={hotel.budgetMatch}
                    bestTimeMatch={hotel.bestTimeMatch}
                    showScore={true}
                  />
                  <div className="flex items-center justify-between mt-2">
                    {hotel.price && (
                      <p className="text-sm font-semibold">
                        ${typeof hotel.price === 'string' ? hotel.price : hotel.price.toFixed(0)}
                        <span className="text-xs text-muted-foreground font-normal">/night</span>
                      </p>
                    )}
                    <a
                      href={`https://www.booking.com/search.html?ss=${encodeURIComponent((hotel.name || '') + ' ' + cityName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                      data-testid={`link-book-hotel-${hotel.id}`}
                    >
                      <Button size="sm" className="text-xs h-7">
                        Book Hotel
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activities.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            Recommended Activities
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activities.slice(0, 6).map((activity) => (
              <Card key={activity.id} className="overflow-hidden" data-testid={`rec-activity-${activity.id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm line-clamp-2">{activity.title || activity.name}</h4>
                      {activity.category && (
                        <Badge variant="outline" className="text-xs mt-1 capitalize">
                          {activity.category}
                        </Badge>
                      )}
                    </div>
                    {activity.rating && (
                      <div className="flex items-center gap-1 ml-2">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        <span className="text-xs font-medium">{activity.rating}</span>
                      </div>
                    )}
                  </div>
                  <AIRecommendationBadges
                    aiScore={activity.aiScore}
                    aiReasons={activity.aiReasons}
                    seasonalMatch={activity.seasonalMatch}
                    eventRelated={activity.eventRelated}
                    budgetMatch={activity.budgetMatch}
                    bestTimeMatch={activity.bestTimeMatch}
                    preferenceMatch={activity.preferenceMatch}
                    showScore={true}
                  />
                  {(() => {
                    const matched = matchActivityToText(activity.title || activity.name || '', cachedActivities);
                    const bookingHref = matched?.bookingUrl
                      ?? `https://www.viator.com/searchResults/all?text=${encodeURIComponent((activity.title || activity.name || '') + ' ' + cityName)}`;
                    return (
                      <div className="flex items-center justify-between mt-2">
                        {activity.price && (
                          <p className="text-sm font-semibold">
                            ${typeof activity.price === 'string' ? activity.price : Number(activity.price).toFixed(0)}
                          </p>
                        )}
                        <a
                          href={bookingHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto"
                          data-testid={`link-book-activity-${activity.id}`}
                        >
                          <Button size="sm" variant={matched ? "default" : "outline"} className="text-xs h-7">
                            {matched ? "Book Now" : "Find & Book"}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </a>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {hotels.length === 0 && activities.length === 0 && (
        <Card className="p-8 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No cached recommendations yet for {cityName}</p>
          <p className="text-xs text-muted-foreground mt-2">Search for hotels or activities to populate recommendations</p>
        </Card>
      )}
    </div>
  );
}

interface BookingOption {
  platform: string;
  url: string;
  type: 'reservation' | 'tickets' | 'tour' | 'website';
}

interface EnrichedRecommendation {
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  type?: string;
  phone?: string;
  website?: string;
  openNow?: boolean;
  thumbnail?: string;
  googleMapsUrl?: string;
  serpLink?: string;
  aiReason?: string;
  aiPriceRange?: string;
  matchConfidence?: 'high' | 'medium' | 'low';
  actionType?: 'book' | 'visit' | 'explore' | 'reserve';
  bookingOptions?: BookingOption[];
}

interface CityEnrichedContent {
  cityName: string;
  country: string;
  lastUpdated: string;
  restaurants: EnrichedRecommendation[];
  attractions: EnrichedRecommendation[];
  nightlife: EnrichedRecommendation[];
  hiddenGems: EnrichedRecommendation[];
  trendingNow: EnrichedRecommendation[];
}

function EnrichedRecommendationCard({ rec, idx }: { rec: EnrichedRecommendation; idx: number }) {
  return (
    <Card className="overflow-hidden" data-testid={`enriched-rec-${idx}`}>
      {rec.thumbnail && (
        <div className="h-32 overflow-hidden">
          <img 
            src={rec.thumbnail} 
            alt={rec.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <h4 className="font-medium text-sm line-clamp-1" data-testid={`rec-name-${idx}`}>{rec.name}</h4>
            {rec.address && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                <MapPin className="h-3 w-3 inline mr-1" />
                {rec.address}
              </p>
            )}
          </div>
          {rec.rating && (
            <div className="flex items-center gap-1 ml-2">
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-medium">{rec.rating}</span>
              {rec.reviewCount && (
                <span className="text-xs text-muted-foreground">({rec.reviewCount})</span>
              )}
            </div>
          )}
        </div>

        {rec.aiReason && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{rec.aiReason}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {rec.type && (
            <Badge variant="secondary" className="text-xs capitalize">{rec.type}</Badge>
          )}
          {rec.priceLevel && (
            <Badge variant="outline" className="text-xs">{rec.priceLevel}</Badge>
          )}
          {rec.openNow !== undefined && (
            <Badge 
              variant={rec.openNow ? "default" : "secondary"} 
              className={cn("text-xs", rec.openNow && "bg-green-500")}
            >
              {rec.openNow ? "Open Now" : "Closed"}
            </Badge>
          )}
          {rec.matchConfidence === 'high' && (
            <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Sparkles className="h-3 w-3 mr-1" />
              Top Pick
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {rec.bookingOptions?.slice(0, 3).map((booking, bidx) => (
            <Button
              key={bidx}
              size="sm"
              variant="outline"
              onClick={() => window.open(booking.url, '_blank')}
              data-testid={`booking-btn-${idx}-${bidx}`}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {booking.platform}
            </Button>
          ))}
          {rec.googleMapsUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(rec.googleMapsUrl, '_blank')}
              data-testid={`maps-btn-${idx}`}
            >
              <MapPin className="h-3 w-3 mr-1" />
              Map
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EnrichedRecommendationsSection({ cityName }: { cityName: string }) {
  const { data, isLoading, error } = useQuery<CityEnrichedContent>({
    queryKey: ["/api/travelpulse/enriched", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/enriched/${encodeURIComponent(cityName)}`);
      if (!res.ok) throw new Error("Failed to fetch enriched content");
      return res.json();
    },
    enabled: !!cityName,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center mt-6">
        <ExternalLink className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Enriched content not available for {cityName} yet</p>
      </Card>
    );
  }

  if (!data) return null;

  const hasContent = 
    data.restaurants.length > 0 || 
    data.attractions.length > 0 || 
    data.nightlife.length > 0 ||
    data.hiddenGems.length > 0 ||
    data.trendingNow.length > 0;

  if (!hasContent) {
    return (
      <Card className="p-6 text-center mt-6">
        <ExternalLink className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No enriched recommendations yet for {cityName}</p>
        <p className="text-xs text-muted-foreground mt-1">Content is generated on next AI refresh</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-6" data-testid="enriched-recommendations-section">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Book Experiences</h3>
        <Badge variant="outline" className="text-xs">AI + Booking</Badge>
      </div>

      {data.trendingNow.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            Trending Now
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.trendingNow.slice(0, 2).map((rec, idx) => (
              <EnrichedRecommendationCard key={`trending-${idx}`} rec={rec} idx={idx} />
            ))}
          </div>
        </div>
      )}

      {data.attractions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            Top Attractions
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.attractions.slice(0, 4).map((rec, idx) => (
              <EnrichedRecommendationCard key={`attraction-${idx}`} rec={rec} idx={100 + idx} />
            ))}
          </div>
        </div>
      )}

      {data.restaurants.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Restaurants & Dining
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.restaurants.slice(0, 4).map((rec, idx) => (
              <EnrichedRecommendationCard key={`restaurant-${idx}`} rec={rec} idx={200 + idx} />
            ))}
          </div>
        </div>
      )}

      {data.hiddenGems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Gem className="h-4 w-4 text-purple-500" />
            Hidden Gems
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.hiddenGems.slice(0, 4).map((rec, idx) => (
              <EnrichedRecommendationCard key={`gem-${idx}`} rec={rec} idx={300 + idx} />
            ))}
          </div>
        </div>
      )}

      {data.nightlife.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-pink-500" />
            Nightlife
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.nightlife.slice(0, 4).map((rec, idx) => (
              <EnrichedRecommendationCard key={`nightlife-${idx}`} rec={rec} idx={400 + idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface BookableActivity {
  id: string;
  productCode: string;
  title: string;
  description?: string | null;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number;
  imageUrl?: string | null;
  provider: string;
  category?: string | null;
  durationMinutes?: number | null;
  bookingUrl: string | null;
}

const CATEGORY_FILTERS = ["All", "Activity", "Tour", "Experience"] as const;
type CategoryFilter = typeof CATEGORY_FILTERS[number];

const PROVIDER_COLORS: Record<string, string> = {
  amadeus: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viator: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function BookableActivitiesSection({ cityName }: { cityName: string }) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");

  const { data, isLoading } = useQuery<{ activities: BookableActivity[]; total: number; city: string }>({
    queryKey: ["/api/travelpulse/activities", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/activities/${encodeURIComponent(cityName)}`);
      if (!res.ok) throw new Error("Failed to fetch bookable activities");
      return res.json();
    },
    enabled: !!cityName,
    staleTime: 10 * 60 * 1000,
  });

  const filtered = (data?.activities ?? []).filter((act) => {
    if (categoryFilter === "All") return true;
    const cat = (act.category ?? "").toLowerCase();
    return cat.includes(categoryFilter.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-8">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-20 rounded-full" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.activities.length === 0) {
    return (
      <Card className="p-8 text-center mt-8" data-testid="card-no-bookable-activities">
        <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground font-medium">No bookable experiences found for {cityName}</p>
        <p className="text-xs text-muted-foreground mt-1">Activities are refreshed regularly</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-8" data-testid="bookable-activities-section">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Book Experiences</h3>
        <Badge variant="outline" className="text-xs">{data.total} available</Badge>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="category-filter-chips">
        {CATEGORY_FILTERS.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={categoryFilter === cat ? "default" : "outline"}
            onClick={() => setCategoryFilter(cat)}
            className="text-xs h-7 rounded-full"
            data-testid={`filter-category-${cat.toLowerCase()}`}
          >
            {cat}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No {categoryFilter} experiences found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.slice(0, 12).map((act) => (
            <Card key={act.id} className="overflow-hidden flex flex-col" data-testid={`bookable-activity-${act.id}`}>
              {act.imageUrl ? (
                <div className="h-36 overflow-hidden flex-shrink-0">
                  <img src={act.imageUrl} alt={act.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-36 bg-muted flex items-center justify-center flex-shrink-0">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <CardContent className="p-3 flex flex-col flex-1">
                <div className="flex gap-1 flex-wrap mb-1">
                  <Badge
                    className={cn("text-xs capitalize", PROVIDER_COLORS[act.provider] ?? "bg-gray-100 text-gray-700")}
                    data-testid={`provider-badge-${act.id}`}
                  >
                    {act.provider}
                  </Badge>
                  {act.category && (
                    <Badge variant="outline" className="text-xs capitalize">{act.category}</Badge>
                  )}
                </div>

                <h4
                  className="font-medium text-sm leading-tight line-clamp-2 mb-1 flex-1"
                  data-testid={`activity-title-${act.id}`}
                >
                  {act.title}
                </h4>

                {act.rating != null && (
                  <div className="flex items-center gap-1 mb-2">
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-medium">{act.rating.toFixed(1)}</span>
                    {act.reviewCount > 0 && (
                      <span className="text-xs text-muted-foreground">({act.reviewCount.toLocaleString()})</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-auto pt-2">
                  <div>
                    {act.price != null && act.price > 0 ? (
                      <p className="text-sm font-bold" data-testid={`activity-price-${act.id}`}>
                        From {act.currency === "USD" ? "$" : act.currency}{act.price.toFixed(0)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Price on request</p>
                    )}
                    {act.durationMinutes && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {act.durationMinutes >= 60
                          ? `${Math.floor(act.durationMinutes / 60)}h${act.durationMinutes % 60 > 0 ? ` ${act.durationMinutes % 60}m` : ""}`
                          : `${act.durationMinutes}m`}
                      </p>
                    )}
                  </div>
                  {act.bookingUrl ? (
                    <a
                      href={act.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-book-activity-${act.id}`}
                    >
                      <Button size="sm" className="text-xs h-7">
                        Book
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs h-7" disabled>
                      View
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CityDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

// ── Activity Matching ─────────────────────────────────────────────────────────
// Cross-reference free-text (social posts, gem names, AI recommendations)
// against cached Viator/Amadeus activities. Returns the best match that also
// has a real booking URL, or null if no confident match is found.
const MATCH_STOPWORDS = new Set([
  'this','that','with','from','have','been','will','your','they','their',
  'more','just','like','what','when','then','than','into','over','some',
  'only','also','very','come','here','time','even','most','such','both',
  'each','after','well','great','there','about','which','those','these',
  'really','amazing','awesome','loved','visit','going','doing',
]);

function matchActivityToText(text: string, activities: BookableActivity[]): BookableActivity | null {
  if (!text || activities.length === 0) return null;
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !MATCH_STOPWORDS.has(w));
  if (words.length === 0) return null;

  let best: BookableActivity | null = null;
  let bestScore = 0;

  for (const act of activities) {
    if (!act.bookingUrl) continue;
    const titleWords = act.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !MATCH_STOPWORDS.has(w));
    if (titleWords.length === 0) continue;

    const matchCount = words.filter(w => titleWords.includes(w)).length;
    if (matchCount === 0) continue;

    const score = matchCount / Math.min(titleWords.length, Math.max(words.length, 1));
    // Require at least 2 matched words OR a strong score on a short title
    if ((matchCount >= 2 || score >= 0.5) && score > bestScore) {
      bestScore = score;
      best = act;
    }
  }
  return best;
}

interface VibeFilter { categories: string[]; minPrice?: number }
const VIBE_TO_FILTER: Record<string, VibeFilter> = {
  foodie:     { categories: ["food", "dining", "restaurant", "culinary"] },
  nightlife:  { categories: ["entertainment", "nightlife", "bars", "club"] },
  cultural:   { categories: ["cultural", "museum", "art", "history", "heritage"] },
  adventure:  { categories: ["outdoor", "adventure", "sports", "hiking", "extreme"] },
  luxury:     { categories: ["luxury", "premium", "fine dining", "vip"], minPrice: 150 },
  romantic:   { categories: ["experience", "romantic", "couples", "sunset"] },
  nature:     { categories: ["outdoor", "nature", "parks", "scenic", "wildlife"] },
  family:     { categories: ["family", "kids", "tours", "zoo"] },
  budget:     { categories: ["budget", "free", "affordable", "walking tour"] },
  relaxation: { categories: ["wellness", "spa", "relaxation", "yoga", "meditation"] },
};

export function CityDetailView({ cityName, onBack }: CityDetailViewProps) {
  const [activeTab, setActiveTab] = useState("hidden-gems");
  const [socialSource, setSocialSource] = useState<'all' | 'twitter' | 'instagram'>('all');
  const [spontaneousWindow, setSpontaneousWindow] = useState<'tonight' | 'tomorrow' | 'weekend'>('tonight');
  const [spontaneousVibe, setSpontaneousVibe] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CityIntelligence>({
    queryKey: ["/api/travelpulse/cities", cityName],
  });

  // Fetch media for this city (after we have city data)
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", cityName, data?.city?.country],
    enabled: !!data?.city?.country,
  });

  // Shared bookable activities — fetched on mount; same query key as
  // BookableActivitiesSection so TanStack Query deduplicates the network call.
  const { data: activitiesData } = useQuery<{ activities: BookableActivity[]; total: number; city: string }>({
    queryKey: ["/api/travelpulse/activities", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/activities/${encodeURIComponent(cityName)}`);
      if (!res.ok) throw new Error("Failed to fetch activities");
      return res.json();
    },
    enabled: !!cityName,
    staleTime: 10 * 60 * 1000,
  });
  const cachedActivities = activitiesData?.activities ?? [];

  // Social feed (X/Twitter via Grok) — pre-warmed on city card open so Grok
  // fetch is already in flight when the user clicks the Live tab.
  const { data: socialPosts, isLoading: xLoading } = useQuery<SocialPost[]>({
    queryKey: ["/api/travelpulse/social-feed", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/social-feed/${encodeURIComponent(cityName)}`);
      if (!res.ok) throw new Error("Failed to fetch social feed");
      return res.json();
    },
    enabled: true,
    staleTime: 28 * 60 * 1000,
  });

  // Instagram feed — pre-warmed on city card open; resolves instantly from 24h DB cache
  const { data: instagramPosts, isLoading: igLoading } = useQuery<SocialPost[]>({
    queryKey: ["/api/travelpulse/instagram-feed", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/instagram-feed/${encodeURIComponent(cityName)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: true,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // 45-second timeout fallback for the X section only
  const [xTimedOut, setXTimedOut] = useState(false);
  useEffect(() => {
    if (!xLoading) {
      setXTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setXTimedOut(true), 45_000);
    return () => clearTimeout(timer);
  }, [xLoading]);

  // Spontaneous opportunities — loaded on demand when Spontaneous tab is active
  const spontaneousFilter = spontaneousVibe ? VIBE_TO_FILTER[spontaneousVibe] : undefined;
  const { data: spontaneousData, isLoading: spontaneousLoading } = useQuery<{ opportunities: SpontaneousOpp[]; total: number }>({
    queryKey: ["/api/spontaneous/quick-search", spontaneousWindow, cityName, spontaneousVibe],
    queryFn: async () => {
      const params = new URLSearchParams({ city: cityName });
      if (spontaneousFilter?.categories.length) params.set("categories", spontaneousFilter.categories.join(","));
      if (spontaneousFilter?.minPrice) params.set("minPrice", String(spontaneousFilter.minPrice));
      const res = await fetch(`/api/spontaneous/quick-search/${spontaneousWindow}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch opportunities");
      return res.json();
    },
    enabled: activeTab === 'spontaneous',
    staleTime: 2 * 60 * 1000,
  });

  // Safety scores — loaded on demand when AI Insights tab is active
  const { data: safetyScores } = useQuery<{
    city: string;
    neighborhoodCount: number;
    overall: number | null;
    lgbtq: number | null;
    medical: number | null;
    physicalHarm: number | null;
    politicalFreedom: number | null;
    theft: number | null;
    women: number | null;
  } | null>({
    queryKey: ["/api/travelpulse/safety", cityName],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/safety/${encodeURIComponent(cityName)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: activeTab === 'ai-insights',
    staleTime: 60 * 60 * 1000,
  });

  // Track Unsplash downloads for API compliance (when Unsplash media is displayed)
  const trackedDownloadsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!mediaData) return;
    
    // Collect all Unsplash media with download tracking URLs
    const unsplashMedia = [
      ...(mediaData.hero && mediaData.hero.source === 'unsplash' && mediaData.hero.downloadLocationUrl ? [mediaData.hero] : []),
      ...mediaData.gallery.filter(m => m.source === 'unsplash' && m.downloadLocationUrl),
    ];
    
    // Track downloads for Unsplash images (fire-and-forget, best effort)
    unsplashMedia.forEach(media => {
      if (media.downloadLocationUrl && !trackedDownloadsRef.current.has(media.downloadLocationUrl)) {
        trackedDownloadsRef.current.add(media.downloadLocationUrl);
        fetch('/api/travelpulse/media/track-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ downloadLocationUrl: media.downloadLocationUrl }),
        }).catch(() => {}); // Silently ignore tracking failures
      }
    });
  }, [mediaData]);

  if (isLoading) {
    return <CityDetailSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <Button variant="ghost" onClick={onBack} className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cities
        </Button>
        <p className="text-muted-foreground">Failed to load city intelligence. Please try again.</p>
      </Card>
    );
  }

  const { city, hiddenGems, alerts } = data;
  const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];
  const priceChange = parseFloat(city.priceChange || "0");

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <Button variant="ghost" onClick={onBack} className="mb-2" data-testid="button-back-to-cities">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Cities
      </Button>

      <div className="relative h-64 rounded-xl overflow-hidden">
        {city.imageUrl ? (
          <img
            src={city.imageUrl}
            alt={city.cityName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <MapPin className="h-16 w-16 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{city.cityName}</h1>
              <div className="flex items-center gap-3 text-white/80">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {city.country}
                </span>
                {city.region && (
                  <>
                    <span className="text-white/50">•</span>
                    <span>{city.region}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <Badge className="bg-gradient-to-r from-rose-500 to-orange-500 text-white border-0 text-lg px-4 py-1">
                <Zap className="h-4 w-4 mr-1" />
                {city.pulseScore}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2" data-testid="alerts-section">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn("rounded-md p-4 flex items-center gap-3", getAlertSeverityClass(alert.severity))}
              data-testid={`alert-item-${alert.id}`}
            >
              {getAlertSeverityIcon(alert.severity)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium" data-testid={`alert-title-${alert.id}`}>{alert.title}</span>
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`alert-message-${alert.id}`}>{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-grid">
        <Card data-testid="stat-active-travelers">
          <CardContent className="py-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold" data-testid="value-active-travelers">{city.activeTravelers.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Active Travelers</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-trending-spots">
          <CardContent className="py-4 text-center">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold" data-testid="value-trending-spots">{city.totalTrendingSpots}</p>
            <p className="text-xs text-muted-foreground">Trending Spots</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-hidden-gems">
          <CardContent className="py-4 text-center">
            <Gem className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold" data-testid="value-hidden-gems">{city.totalHiddenGems}</p>
            <p className="text-xs text-muted-foreground">Hidden Gems</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-avg-price">
          <CardContent className="py-4 text-center">
            <DollarSign className="h-6 w-6 mx-auto mb-2 text-primary" />
            <div className="flex items-center justify-center gap-1">
              <p className="text-2xl font-bold" data-testid="value-avg-price">${city.avgHotelPrice || "N/A"}</p>
              {priceChange !== 0 && (
                <span className={cn(
                  "flex items-center text-sm",
                  priceChange < 0 ? "text-green-500" : "text-red-500"
                )} data-testid="price-change-indicator">
                  {priceChange < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Avg Hotel/Night</p>
          </CardContent>
        </Card>
      </div>

      {city.currentHighlight && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20" data-testid="highlight-card">
          <CardContent className="py-4 flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold text-primary">What's Happening Now</p>
              <p className="text-lg" data-testid="highlight-text">{city.currentHighlight}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {city.dealAlert && (
        <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20" data-testid="deal-alert-card">
          <CardContent className="py-4 flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400">Deal Alert</p>
              <p data-testid="deal-alert-text">{city.dealAlert}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {vibeTags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className={cn("capitalize", vibeTagColors[tag] || "")}
          >
            {tag}
          </Badge>
        ))}
      </div>

      <Tabs defaultValue="hidden-gems" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-6">
          <TabsTrigger value="hidden-gems" data-testid="tab-hidden-gems">
            <Gem className="h-4 w-4 mr-2" />
            Hidden Gems
          </TabsTrigger>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations">
            <Sparkles className="h-4 w-4 mr-2" />
            For You
          </TabsTrigger>
          <TabsTrigger value="spontaneous" data-testid="tab-spontaneous">
            <Zap className="h-4 w-4 mr-2" />
            Spontaneous
          </TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">
            <Radio className="h-4 w-4 mr-2" />
            Live
          </TabsTrigger>
          <TabsTrigger value="media" data-testid="tab-media">
            <Image className="h-4 w-4 mr-2" />
            Photos & Videos
          </TabsTrigger>
          <TabsTrigger value="ai-insights" data-testid="tab-ai-insights">
            <Brain className="h-4 w-4 mr-2" />
            AI Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hidden-gems" className="mt-4">
          {hiddenGems.length === 0 ? (
            <Card className="p-8 text-center">
              <Gem className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No hidden gems discovered yet for {city.cityName}</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {hiddenGems.map((gem) => (
                <Card key={gem.id} className="overflow-hidden" data-testid={`hidden-gem-${gem.id}`}>
                  <div className="flex">
                    {gem.imageUrl && (
                      <div className="w-32 h-32 flex-shrink-0">
                        <img src={gem.imageUrl} alt={gem.placeName} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className="flex-1 py-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold">{gem.placeName}</h3>
                          {gem.placeType && (
                            <Badge variant="outline" className="text-xs capitalize mt-1">
                              {gem.placeType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getDiscoveryStatusBadge(gem.discoveryStatus, gem.daysUntilMainstream)}
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            <span className="font-medium">{gem.localRating}</span>
                            <span className="text-muted-foreground text-xs">by locals</span>
                          </div>
                        </div>
                      </div>
                      {gem.description && (
                        <p className="text-sm text-muted-foreground mb-2">{gem.description}</p>
                      )}
                      {gem.whyLocalsLoveIt && (
                        <div className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
                          <Heart className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span>{gem.whyLocalsLoveIt}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {gem.localMentions} local mentions
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {gem.touristMentions} tourist mentions
                        </span>
                        {gem.priceRange && <span>{gem.priceRange}</span>}
                        {(() => {
                          const matched = matchActivityToText(gem.placeName + ' ' + (gem.placeType ?? '') + ' ' + (gem.description ?? ''), cachedActivities);
                          const href = matched?.bookingUrl
                            ?? `https://www.google.com/maps/search/${encodeURIComponent(gem.placeName + ' ' + city.cityName)}`;
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto"
                              data-testid={`link-explore-gem-${gem.id}`}
                            >
                              <Button size="sm" variant={matched ? "default" : "outline"} className="text-xs h-7">
                                {matched ? "Book" : "Explore"}
                                {matched ? <ExternalLink className="h-3 w-3 ml-1" /> : <MapPin className="h-3 w-3 ml-1" />}
                              </Button>
                            </a>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <AIRecommendationsSection cityName={city.cityName} country={city.country} cachedActivities={cachedActivities} />
          <BookableActivitiesSection cityName={city.cityName} />
          <EnrichedRecommendationsSection cityName={city.cityName} />
        </TabsContent>

        <TabsContent value="spontaneous" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap" data-testid="spontaneous-window-toggle">
              {(["tonight", "tomorrow", "weekend"] as const).map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={spontaneousWindow === w ? "default" : "outline"}
                  onClick={() => setSpontaneousWindow(w)}
                  data-testid={`button-window-${w}`}
                  className="capitalize"
                >
                  {w === "tonight" ? "Tonight" : w === "tomorrow" ? "Tomorrow" : "This Weekend"}
                </Button>
              ))}
            </div>

            {city.vibeTags && city.vibeTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap" data-testid="spontaneous-vibe-filter">
                <Button
                  key="all"
                  size="sm"
                  variant={spontaneousVibe === null ? "secondary" : "ghost"}
                  onClick={() => setSpontaneousVibe(null)}
                  data-testid="button-vibe-all"
                  className="text-xs h-7 capitalize"
                >
                  All Vibes
                </Button>
                {city.vibeTags.map((vibe) => (
                  <Button
                    key={vibe}
                    size="sm"
                    variant={spontaneousVibe === vibe ? "secondary" : "ghost"}
                    onClick={() => setSpontaneousVibe(prev => prev === vibe ? null : vibe)}
                    data-testid={`button-vibe-${vibe}`}
                    className="text-xs h-7 capitalize"
                  >
                    {vibe}
                  </Button>
                ))}
              </div>
            )}

            {spontaneousLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !spontaneousData || spontaneousData.opportunities.length === 0 ? (
              <Card className="p-8 text-center" data-testid="card-no-opportunities">
                <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">No upcoming activities found for {city.cityName}</p>
                <p className="text-xs text-muted-foreground mt-1">Check back soon — new experiences are added daily</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {spontaneousData.opportunities.map((opp) => {
                  const urgencyHigh = opp.urgencyScore >= 80;
                  const urgencyMed = opp.urgencyScore >= 60;
                  return (
                    <Card key={opp.id} className="overflow-hidden" data-testid={`opp-card-${opp.id}`}>
                      <div className="flex">
                        {opp.imageUrl && (
                          <div className="w-28 h-28 flex-shrink-0">
                            <img src={opp.imageUrl} alt={opp.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <CardContent className="flex-1 py-3 px-4">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-sm leading-tight">{opp.title}</h3>
                            <div className="flex gap-1 flex-shrink-0">
                              {opp.discountPercent && opp.discountPercent > 0 && (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                  {opp.discountPercent}% OFF
                                </Badge>
                              )}
                              {urgencyHigh && opp.remainingSpots && (
                                <Badge variant="destructive" className="text-xs">
                                  Only {opp.remainingSpots} left!
                                </Badge>
                              )}
                              {urgencyMed && !urgencyHigh && (
                                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">
                                  Trending
                                </Badge>
                              )}
                            </div>
                          </div>

                          {opp.category && (
                            <Badge variant="outline" className="text-xs capitalize mb-2">
                              {opp.category}
                            </Badge>
                          )}

                          {opp.description && (
                            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{opp.description}</p>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {opp.currentPrice !== null && opp.currentPrice > 0 && (
                                <span className="flex items-center gap-1 font-medium text-foreground">
                                  <DollarSign className="h-3 w-3" />
                                  {Number(opp.currentPrice).toFixed(0)}
                                </span>
                              )}
                              {opp.startTime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(opp.startTime), { addSuffix: true })}
                                </span>
                              )}
                              <span className="capitalize text-muted-foreground">{opp.source}</span>
                            </div>
                            {opp.affiliateUrl && (
                              <a
                                href={opp.affiliateUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`link-book-${opp.id}`}
                              >
                                <Button size="sm" className="text-xs h-7">
                                  Book Now
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2" data-testid="social-source-toggle">
              {(["all", "twitter", "instagram"] as const).map((src) => (
                <Button
                  key={src}
                  size="sm"
                  variant={socialSource === src ? "default" : "outline"}
                  onClick={() => setSocialSource(src)}
                  data-testid={`button-source-${src}`}
                >
                  {src === "all" ? "All" : src === "twitter" ? "𝕏 Twitter" : "Instagram"}
                </Button>
              ))}
            </div>

            <ScrollArea className="h-[600px]">
              <div className="space-y-6 pr-2">

                {/* ── Instagram section ── */}
                {(socialSource === 'all' || socialSource === 'instagram') && (
                  <div className="space-y-3" data-testid="instagram-section">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Camera className="h-3 w-3 text-white" />
                      </div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Instagram</h3>
                    </div>

                    {igLoading ? (
                      <div className="space-y-2" data-testid="ig-loading-skeleton">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : (instagramPosts || []).length === 0 ? (
                      <Card className="p-4 text-center" data-testid="card-no-instagram">
                        <p className="text-sm text-muted-foreground">No Instagram posts found for {city.cityName}</p>
                        <p className="text-xs text-muted-foreground mt-1">Instagram requires API setup to show posts.</p>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {(instagramPosts || []).slice(0, 10).map((post) => {
                          const igMatched = matchActivityToText(post.content, cachedActivities);
                          return (
                            <Card key={post.id} className="hover-elevate" data-testid={`social-post-${post.id}`}>
                              <CardContent className="py-3 px-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                    <Camera className="h-4 w-4 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold text-sm">Instagram</span>
                                      <span className="text-[10px] font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-white px-1.5 py-0.5 rounded">IG</span>
                                      <span className="text-xs text-muted-foreground ml-auto">
                                        {formatDistanceToNow(new Date(post.postedAt), { addSuffix: true })}
                                      </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-snug line-clamp-3">{post.content}</p>
                                    <a
                                      href={post.postUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-2 text-xs text-primary hover:underline flex items-center gap-1 w-fit"
                                      data-testid={`link-view-ig-${post.id}`}
                                    >
                                      View on Instagram
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {igMatched && (
                                      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between gap-2" data-testid={`ig-match-${post.id}`}>
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Ticket className="h-3 w-3 text-primary flex-shrink-0" />
                                          <span className="text-xs text-muted-foreground truncate">
                                            Book: <span className="font-medium text-foreground">{igMatched.title}</span>
                                            {igMatched.price != null && igMatched.price > 0 && ` · from ${igMatched.currency === 'USD' ? '$' : igMatched.currency}${igMatched.price.toFixed(0)}`}
                                          </span>
                                        </div>
                                        <a href={igMatched.bookingUrl!} target="_blank" rel="noopener noreferrer">
                                          <Button size="sm" className="text-xs h-6 flex-shrink-0">Book</Button>
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── X / Twitter section ── */}
                {(socialSource === 'all' || socialSource === 'twitter') && (
                  <div className="space-y-3" data-testid="x-section">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-black text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded">𝕏</span>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">X / Twitter</h3>
                      {xLoading && !xTimedOut && (
                        <span
                          className="text-xs text-muted-foreground animate-pulse flex items-center gap-1"
                          data-testid="x-scanning-indicator"
                        >
                          <Radio className="h-3 w-3" />
                          Scanning X...
                        </span>
                      )}
                    </div>

                    {xLoading && !xTimedOut ? (
                      <div className="space-y-2" data-testid="x-loading-skeleton">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-28 w-full" />
                        ))}
                      </div>
                    ) : xTimedOut ? (
                      <Card className="p-6 text-center" data-testid="card-x-timeout">
                        <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">Live feed temporarily unavailable</p>
                        <p className="text-xs text-muted-foreground mt-1">X/Twitter data is taking longer than expected. Check back shortly.</p>
                      </Card>
                    ) : (socialPosts || []).filter(p => p.source === 'twitter').length === 0 ? (
                      <Card className="p-4 text-center" data-testid="card-no-x">
                        <p className="text-sm text-muted-foreground">No X posts found for {city.cityName}</p>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {(socialPosts || []).filter(p => p.source === 'twitter').slice(0, 10).map((post) => {
                          const initials = post.authorName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                          const xMatched = matchActivityToText(post.content, cachedActivities);
                          return (
                            <Card key={post.id} className="hover-elevate" data-testid={`social-post-${post.id}`}>
                              <CardContent className="py-3 px-4">
                                <div className="space-y-2">
                                  <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center flex-shrink-0">
                                      <span className="text-xs font-bold text-sky-700 dark:text-sky-400">{initials}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-semibold text-sm">{post.authorName}</span>
                                        {post.authorHandle && (
                                          <span className="text-xs text-muted-foreground">{post.authorHandle}</span>
                                        )}
                                        <span className="text-[10px] font-bold ml-auto bg-black text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded">𝕏</span>
                                      </div>
                                      <p className="text-sm leading-snug">{post.content}</p>
                                      {post.imageUrl && (
                                        <img
                                          src={post.imageUrl}
                                          alt="Post media"
                                          className="mt-2 rounded-lg max-h-48 w-full object-cover"
                                          data-testid={`img-post-${post.id}`}
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 pl-12 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      {post.likesCount.toLocaleString()}
                                    </span>
                                    {post.repostsCount !== undefined && (
                                      <span className="flex items-center gap-1">
                                        <Activity className="h-3 w-3" />
                                        {post.repostsCount.toLocaleString()}
                                      </span>
                                    )}
                                    <span>{formatDistanceToNow(new Date(post.postedAt), { addSuffix: true })}</span>
                                    {post.sentiment && (
                                      <Badge className={cn(
                                        "text-[10px] px-1.5 py-0",
                                        post.sentiment === 'positive' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                        post.sentiment === 'negative' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                        "bg-muted text-muted-foreground"
                                      )}>
                                        {post.sentiment}
                                      </Badge>
                                    )}
                                    <a
                                      href={post.postUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-auto text-primary hover:underline flex items-center gap-0.5"
                                      data-testid={`link-view-post-${post.id}`}
                                    >
                                      View on 𝕏
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  {xMatched && (
                                    <div className="pl-12 pt-1 border-t border-border/50 flex items-center justify-between gap-2" data-testid={`x-match-${post.id}`}>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Ticket className="h-3 w-3 text-primary flex-shrink-0" />
                                        <span className="text-xs text-muted-foreground truncate">
                                          Book: <span className="font-medium text-foreground">{xMatched.title}</span>
                                          {xMatched.price != null && xMatched.price > 0 && ` · from ${xMatched.currency === 'USD' ? '$' : xMatched.currency}${xMatched.price.toFixed(0)}`}
                                        </span>
                                      </div>
                                      <a href={xMatched.bookingUrl!} target="_blank" rel="noopener noreferrer">
                                        <Button size="sm" className="text-xs h-6 flex-shrink-0">Book</Button>
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="media" className="mt-4">
          {!mediaData || (mediaData.gallery.length === 0 && mediaData.videos.length === 0) ? (
            <Card className="p-8 text-center" data-testid="card-no-media">
              <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No media available yet for {city.cityName}</p>
              <p className="text-xs text-muted-foreground mt-2">Photos and videos will be added when AI intelligence is refreshed</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Videos Section */}
              {mediaData.videos.length > 0 && (
                <div data-testid="videos-section">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Play className="h-5 w-5 text-primary" />
                    Destination Videos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mediaData.videos.map((video, idx) => (
                      <Card key={video.id} className="overflow-hidden" data-testid={`video-card-${idx}`}>
                        <div className="relative aspect-video bg-muted">
                          <video
                            src={video.url}
                            poster={video.thumbnailUrl || video.previewUrl || undefined}
                            controls
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>by {video.photographerName}</span>
                              {video.duration && (
                                <span>({Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')})</span>
                              )}
                            </div>
                            <a
                              href={video.sourceUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              {video.sourceName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo Gallery Section */}
              {mediaData.gallery.length > 0 && (
                <div data-testid="gallery-section">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    Photo Gallery
                    {mediaData.gallery.some(m => m.source === 'google_places') && (
                      <span className="text-xs text-muted-foreground ml-auto font-medium">Powered by Google</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {mediaData.gallery.map((photo, idx) => (
                      <Card key={photo.id} className="overflow-hidden group" data-testid={`photo-card-${idx}`}>
                        <div className="relative aspect-[4/3] bg-muted">
                          <img
                            src={photo.thumbnailUrl || photo.url}
                            alt={photo.attractionName || `${city.cityName} photo`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          {photo.isPrimary && (
                            <Badge className="absolute top-2 left-2 bg-primary/90 text-white">
                              <Star className="h-3 w-3 mr-1" />
                              Featured
                            </Badge>
                          )}
                          {photo.source === 'google_places' && (
                            <Badge className="absolute top-2 right-2 bg-white/90 text-gray-700 text-[10px]">
                              Google
                            </Badge>
                          )}
                          {photo.attractionName && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                              <p className="text-xs text-white truncate">{photo.attractionName}</p>
                            </div>
                          )}
                        </div>
                        <CardContent className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="truncate">{photo.photographerName}</span>
                              <a
                                href={photo.sourceUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-0.5 flex-shrink-0"
                              >
                                {photo.sourceName}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                            {/* Google Places HTML attribution - required by API */}
                            {photo.source === 'google_places' && photo.htmlAttributions && photo.htmlAttributions.length > 0 && (
                              <div 
                                className="text-[10px] text-muted-foreground truncate"
                                dangerouslySetInnerHTML={{ 
                                  __html: DOMPurify.sanitize(photo.htmlAttributions.join(' '), { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href'] })
                                }}
                              />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Attraction-specific photos (Google Places) */}
              {Object.keys(mediaData.byAttraction).length > 0 && (
                <div data-testid="attractions-media-section">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Photos by Attraction
                    <span className="text-xs text-muted-foreground ml-auto">Powered by Google</span>
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(mediaData.byAttraction).map(([attractionName, photos]) => (
                      <div key={attractionName}>
                        <h4 className="text-sm font-medium mb-2">{attractionName}</h4>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {photos.map((photo, idx) => (
                            <div
                              key={photo.id}
                              className="flex-shrink-0 relative"
                              data-testid={`attraction-photo-${attractionName}-${idx}`}
                            >
                              <div className="w-40 aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                                <img
                                  src={photo.thumbnailUrl || photo.url}
                                  alt={attractionName}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              {/* Google Places HTML attribution - required by API */}
                              {photo.htmlAttributions && photo.htmlAttributions.length > 0 && (
                                <div 
                                  className="text-[10px] text-muted-foreground mt-1 max-w-40 truncate"
                                  dangerouslySetInnerHTML={{ 
                                    __html: DOMPurify.sanitize(photo.htmlAttributions.join(' '), { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href'] })
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attribution notice with Google branding */}
              <div className="text-center mt-4 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Photos and videos provided by Unsplash, Pexels, and Google Places.
                </p>
                {(mediaData.gallery.some(m => m.source === 'google_places') || 
                  Object.values(mediaData.byAttraction).flat().some(m => m.source === 'google_places')) && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <span>Attraction photos</span>
                    <span className="font-medium">Powered by Google</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai-insights" className="mt-4">
          {!city.aiGeneratedAt ? (
            <Card className="p-8 text-center">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">AI insights are being generated for {city.cityName}</p>
              <p className="text-xs text-muted-foreground mt-2">Check back soon for personalized travel intelligence</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card data-testid="card-best-time">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Best Time to Visit
                    </CardTitle>
                    <p className="text-xs text-muted-foreground" data-testid="text-ai-updated">
                      Updated {city.aiGeneratedAt && formatDistanceToNow(new Date(city.aiGeneratedAt), { addSuffix: true })}
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium" data-testid="text-best-time">{city.aiBestTimeToVisit || "Year-round destination"}</p>
                </CardContent>
              </Card>

              {city.aiOptimalDuration && (
                <Card data-testid="card-optimal-duration">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Compass className="h-4 w-4" />
                      Recommended Duration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm" data-testid="text-optimal-duration">{city.aiOptimalDuration}</p>
                  </CardContent>
                </Card>
              )}

              {city.aiBudgetEstimate && (
                <Card data-testid="card-budget-estimate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Daily Budget Estimate (USD)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-xs text-muted-foreground">Budget</p>
                        <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                          ${city.aiBudgetEstimate.budget || 50}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-muted-foreground">Mid-Range</p>
                        <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                          ${city.aiBudgetEstimate.midRange || 150}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <p className="text-xs text-muted-foreground">Luxury</p>
                        <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                          ${city.aiBudgetEstimate.luxury || 300}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {city.aiMustSeeAttractions && city.aiMustSeeAttractions.length > 0 && (
                <Card data-testid="card-must-see">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Must-See Attractions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {city.aiMustSeeAttractions.map((attraction, idx) => (
                        <Badge key={idx} variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
                          <MapPin className="h-3 w-3 mr-1" />
                          {attraction}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {city.aiTravelTips && city.aiTravelTips.length > 0 && (
                <Card data-testid="card-travel-tips">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Local Tips
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {city.aiTravelTips.map((tip, idx) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-primary">-</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {city.aiLocalInsights && (
                <Card data-testid="card-local-insights">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Cultural Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-local-insights">{city.aiLocalInsights}</p>
                  </CardContent>
                </Card>
              )}

              {safetyScores && safetyScores.overall != null && (
                <Card data-testid="card-safety-scores">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      Safety Scores
                      <span className="ml-auto text-xs text-muted-foreground font-normal">
                        Amadeus data · {safetyScores.neighborhoodCount} {safetyScores.neighborhoodCount === 1 ? "neighborhood" : "neighborhoods"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Overall Safety</span>
                        <span data-testid="score-overall">{safetyScores.overall}/100</span>
                      </div>
                      <Progress value={safetyScores.overall} className="h-2" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {([
                        { key: "theft", label: "Theft Risk", invert: true },
                        { key: "physicalHarm", label: "Physical Safety", invert: true },
                        { key: "medical", label: "Medical Access" },
                        { key: "women", label: "Women's Safety" },
                        { key: "lgbtq", label: "LGBTQ+ Safety" },
                        { key: "politicalFreedom", label: "Political Freedom" },
                      ] as { key: keyof typeof safetyScores; label: string; invert?: boolean }[]).map(({ key, label, invert }) => {
                        const raw = safetyScores[key] as number | null;
                        if (raw == null) return null;
                        const displayScore = invert ? Math.max(0, 100 - raw) : raw;
                        return (
                          <div key={key} className="space-y-0.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{label}</span>
                              <span data-testid={`score-${key}`}>{displayScore}</span>
                            </div>
                            <Progress value={displayScore} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {city.aiSafetyNotes && (
                <Card className="bg-yellow-50 dark:bg-yellow-900/20" data-testid="card-safety-notes">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-yellow-600" />
                      Safety Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-safety-notes">{city.aiSafetyNotes}</p>
                  </CardContent>
                </Card>
              )}

              {city.aiSeasonalHighlights && city.aiSeasonalHighlights.length > 0 && (
                <Card data-testid="card-seasonal-guide">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Seasonal Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {city.aiSeasonalHighlights.map((month) => {
                          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                          const ratingColors: Record<string, string> = {
                            excellent: "bg-green-100 dark:bg-green-900/30 border-green-300",
                            good: "bg-blue-100 dark:bg-blue-900/30 border-blue-300",
                            average: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300",
                            poor: "bg-red-100 dark:bg-red-900/30 border-red-300",
                          };
                          return (
                            <div 
                              key={month.month} 
                              className={cn("p-2 rounded-lg border", ratingColors[month.rating] || "bg-muted")}
                              data-testid={`month-${month.month}`}
                            >
                              <p className="text-xs font-medium">{monthNames[month.month - 1]}</p>
                              <p className="text-xs text-muted-foreground truncate" title={month.highlight}>
                                {month.highlight}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {city.aiAvoidDates && city.aiAvoidDates.length > 0 && (
                <Card className="bg-red-50 dark:bg-red-900/20" data-testid="card-avoid-dates">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarX className="h-4 w-4 text-red-600" />
                      Dates to Avoid
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {city.aiAvoidDates.map((avoid, idx) => (
                        <li key={idx} className="text-sm" data-testid={`avoid-date-${idx}`}>
                          <span className="font-medium text-red-600 dark:text-red-400">{avoid.dateRange}</span>
                          <span className="text-muted-foreground"> - {avoid.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <DestinationCalendar cityName={city.cityName} country={city.country} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
