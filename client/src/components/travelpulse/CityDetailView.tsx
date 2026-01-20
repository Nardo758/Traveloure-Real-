import { useQuery } from "@tanstack/react-query";
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
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="hidden-gems" data-testid="tab-hidden-gems">
            <Gem className="h-4 w-4 mr-2" />
            Hidden Gems ({hiddenGems.length})
          </TabsTrigger>
          <TabsTrigger value="happening-now" data-testid="tab-happening-now">
            <Calendar className="h-4 w-4 mr-2" />
            Happening Now ({happeningNow.length})
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            <Activity className="h-4 w-4 mr-2" />
            Live Feed ({liveActivity.length})
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
      </Tabs>
    </motion.div>
  );
}
