import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  Cloud,
  Sun,
  CloudRain,
  Snowflake,
  AlertTriangle,
  Info,
  TrendingUp,
  Tag,
  RefreshCw,
  Sparkles,
  MapPin,
  ChevronDown,
  ChevronUp,
  Zap,
  ThermometerSun,
  Shield,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface IntelEvent {
  name: string;
  date: string;
  type: string;
  description: string;
  relevance: "high" | "medium" | "low";
}

interface WeatherForecast {
  summary: string;
  temperature: { high: number; low: number };
  conditions: string;
}

interface SafetyAlert {
  level: "info" | "warning" | "critical";
  message: string;
  source: string;
}

interface TrendingExperience {
  name: string;
  reason: string;
  popularity: number;
}

interface Deal {
  title: string;
  discount: string;
  validUntil: string;
}

interface RealTimeIntelResult {
  destination: string;
  timestamp: string;
  events: IntelEvent[];
  weatherForecast?: WeatherForecast;
  safetyAlerts?: SafetyAlert[];
  trendingExperiences?: TrendingExperience[];
  deals?: Deal[];
}

interface RealTimeIntelWidgetProps {
  destination: string;
  dates?: { start: string; end: string };
  compact?: boolean;
}

function getWeatherIcon(conditions: string) {
  const lower = conditions.toLowerCase();
  if (lower.includes("rain") || lower.includes("shower")) return CloudRain;
  if (lower.includes("snow") || lower.includes("cold")) return Snowflake;
  if (lower.includes("sun") || lower.includes("clear")) return Sun;
  return Cloud;
}

function getSafetyColor(level: SafetyAlert["level"]) {
  switch (level) {
    case "critical": return "bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200";
    case "warning": return "bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200";
    default: return "bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200";
  }
}

function getSafetyIcon(level: SafetyAlert["level"]) {
  switch (level) {
    case "critical": return AlertTriangle;
    case "warning": return AlertTriangle;
    default: return Info;
  }
}

function getEventTypeIcon(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("festival") || lower.includes("cultural")) return PartyPopper;
  if (lower.includes("sport")) return Zap;
  if (lower.includes("concert") || lower.includes("music")) return PartyPopper;
  return Calendar;
}

function getRelevanceBadge(relevance: IntelEvent["relevance"]) {
  switch (relevance) {
    case "high": return <Badge variant="default" data-testid="badge-relevance-high" aria-label="High relevance">Must See</Badge>;
    case "medium": return <Badge variant="secondary" data-testid="badge-relevance-medium" aria-label="Medium relevance">Recommended</Badge>;
    default: return null;
  }
}

export function RealTimeIntelWidget({ destination, dates, compact = false }: RealTimeIntelWidgetProps) {
  const [expanded, setExpanded] = useState(!compact);
  const queryClient = useQueryClient();

  const { data: intel, isLoading, error, refetch, isFetching } = useQuery<RealTimeIntelResult>({
    queryKey: ["/api/destination-intelligence", destination, dates?.start, dates?.end],
    queryFn: async () => {
      const params = new URLSearchParams({ destination });
      if (dates?.start) params.set("startDate", dates.start);
      if (dates?.end) params.set("endDate", dates.end);
      const res = await fetch(`/api/destination-intelligence?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch intelligence");
      return res.json();
    },
    enabled: Boolean(destination),
    staleTime: 5 * 60 * 1000,
  });

  if (!destination) return null;

  if (isLoading) {
    return (
      <Card data-testid="card-intel-loading" aria-busy="true" aria-label="Loading destination intelligence">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
            Real-Time Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-intel-error">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
            Real-Time Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Unable to fetch destination intelligence. Please try again.
            </AlertDescription>
          </Alert>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-3" 
            onClick={() => refetch()}
            data-testid="button-intel-retry"
            aria-label="Retry fetching intelligence"
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!intel) return null;

  const hasEvents = intel.events && intel.events.length > 0;
  const hasWeather = intel.weatherForecast;
  const hasAlerts = intel.safetyAlerts && intel.safetyAlerts.length > 0;
  const hasTrending = intel.trendingExperiences && intel.trendingExperiences.length > 0;
  const hasDeals = intel.deals && intel.deals.length > 0;

  return (
    <Card data-testid="card-real-time-intel" aria-label={`Real-time intelligence for ${destination}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
            Real-Time Intelligence
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-destination">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {destination}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-intel"
              aria-label="Refresh intelligence data"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
            </Button>
            {compact && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpanded(!expanded)}
                data-testid="button-toggle-intel"
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse intelligence panel" : "Expand intelligence panel"}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="text-intel-powered">
          <Zap className="inline h-3 w-3 mr-1" aria-hidden="true" />
          Powered by Grok AI with real-time search
        </p>
      </CardHeader>

      {(expanded || !compact) && (
        <CardContent className="space-y-5">
          {hasAlerts && (
            <div className="space-y-2" data-testid="section-safety-alerts">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                Safety Alerts
              </h4>
              {intel.safetyAlerts!.map((alert, i) => {
                const AlertIcon = getSafetyIcon(alert.level);
                return (
                  <div 
                    key={i}
                    className={cn("p-3 rounded-md border text-sm", getSafetyColor(alert.level))}
                    data-testid={`alert-safety-${i}`}
                    role="alert"
                    aria-label={`${alert.level} alert: ${alert.message}`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertIcon className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-xs opacity-75 mt-1">Source: {alert.source}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasWeather && (
            <div className="space-y-2" data-testid="section-weather">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <ThermometerSun className="h-4 w-4 text-blue-500 dark:text-blue-400" aria-hidden="true" />
                Weather Forecast
              </h4>
              <div className="p-3 rounded-md bg-muted/50">
                <div className="flex items-center gap-3">
                  {(() => {
                    const WeatherIcon = getWeatherIcon(intel.weatherForecast!.conditions);
                    return <WeatherIcon className="h-8 w-8 text-blue-500 dark:text-blue-400" aria-hidden="true" />;
                  })()}
                  <div>
                    <p className="font-medium" data-testid="text-weather-summary">{intel.weatherForecast!.summary}</p>
                    <p className="text-sm text-muted-foreground" data-testid="text-weather-temp">
                      {intel.weatherForecast!.temperature.low}° - {intel.weatherForecast!.temperature.high}° • {intel.weatherForecast!.conditions}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasEvents && (
            <div className="space-y-2" data-testid="section-events">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500 dark:text-purple-400" aria-hidden="true" />
                Upcoming Events
              </h4>
              <div className="space-y-2">
                {intel.events.slice(0, compact ? 2 : 4).map((event, i) => {
                  const EventIcon = getEventTypeIcon(event.type);
                  return (
                    <div 
                      key={i}
                      className="p-3 rounded-md border bg-card hover-elevate"
                      data-testid={`card-event-${i}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-start gap-2">
                          <EventIcon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                          <div>
                            <p className="font-medium text-sm">{event.name}</p>
                            <p className="text-xs text-muted-foreground">{event.date} • {event.type}</p>
                            {!compact && <p className="text-sm mt-1">{event.description}</p>}
                          </div>
                        </div>
                        {getRelevanceBadge(event.relevance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasTrending && (
            <div className="space-y-2" data-testid="section-trending">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                Trending Experiences
              </h4>
              <div className="flex flex-wrap gap-2">
                {intel.trendingExperiences!.slice(0, compact ? 3 : 5).map((exp, i) => (
                  <Badge 
                    key={i} 
                    variant="secondary" 
                    className="flex items-center gap-1"
                    data-testid={`badge-trending-${i}`}
                    aria-label={`Trending: ${exp.name} - ${exp.reason}`}
                  >
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {exp.name}
                    <span className="ml-1 opacity-60">({exp.popularity}%)</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hasDeals && (
            <div className="space-y-2" data-testid="section-deals">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4 text-rose-500 dark:text-rose-400" aria-hidden="true" />
                Special Deals
              </h4>
              <div className="space-y-2">
                {intel.deals!.slice(0, 2).map((deal, i) => (
                  <div 
                    key={i}
                    className="p-3 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"
                    data-testid={`card-deal-${i}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-medium text-sm">{deal.title}</span>
                      <Badge variant="destructive">{deal.discount}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Valid until {deal.validUntil}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasEvents && !hasWeather && !hasAlerts && !hasTrending && !hasDeals && (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-intel">
              No intelligence data available for this destination yet.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function RealTimeIntelWidgetCompact(props: Omit<RealTimeIntelWidgetProps, "compact">) {
  return <RealTimeIntelWidget {...props} compact />;
}
