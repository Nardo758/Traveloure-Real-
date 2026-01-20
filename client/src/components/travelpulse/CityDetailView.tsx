import { useRef, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

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

export function CityDetailView({ cityName, onBack }: CityDetailViewProps) {
  const { data, isLoading, error } = useQuery<CityIntelligence>({
    queryKey: ["/api/travelpulse/cities", cityName],
  });

  // Fetch media for this city (after we have city data)
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", cityName, data?.city?.country],
    enabled: !!data?.city?.country,
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

  const { city, hiddenGems, alerts, happeningNow, liveActivity } = data;
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

      <Tabs defaultValue="hidden-gems" className="w-full">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="hidden-gems" data-testid="tab-hidden-gems">
            <Gem className="h-4 w-4 mr-2" />
            Hidden Gems
          </TabsTrigger>
          <TabsTrigger value="happening-now" data-testid="tab-happening-now">
            <Calendar className="h-4 w-4 mr-2" />
            Happening Now
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            <Activity className="h-4 w-4 mr-2" />
            Live Feed
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
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="happening-now" className="mt-4">
          {happeningNow.length === 0 ? (
            <Card className="p-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No events happening right now in {city.cityName}</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {happeningNow.map((event) => (
                <Card key={event.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {event.isLive && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              LIVE
                            </Badge>
                          )}
                          <h3 className="font-semibold">{event.title}</h3>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize mt-1">
                          {event.eventType}
                        </Badge>
                      </div>
                      {event.crowdLevel && (
                        <Badge variant="secondary" className="capitalize">
                          {event.crowdLevel}
                        </Badge>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {event.venue && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.venue}
                        </span>
                      )}
                      {event.entryFee && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {event.entryFee}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {liveActivity.length === 0 ? (
            <Card className="p-8 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No recent activity in {city.cityName}</p>
            </Card>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {liveActivity.map((activity) => (
                  <Card key={activity.id} className="hover-elevate" data-testid={`activity-item-${activity.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        {getActivityIcon(activity.activityType)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{activity.userName || "Traveler"}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{activity.activityText}</p>
                          {activity.placeName && (
                            <p className="text-xs text-primary mt-1 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {activity.placeName}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}
                          </p>
                          {activity.likesCount > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <ThumbsUp className="h-3 w-3" />
                              {activity.likesCount}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
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

              {city.aiUpcomingEvents && city.aiUpcomingEvents.length > 0 && (
                <Card data-testid="card-upcoming-events">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Upcoming Events
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {city.aiUpcomingEvents.map((event, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{event.name}</p>
                            <p className="text-xs text-muted-foreground">{event.dateRange}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {event.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
