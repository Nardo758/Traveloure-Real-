import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Zap, TrendingUp, Calendar } from "lucide-react";

interface HeroCardProps {
  city?: {
    name?: string;
    country?: string;
    description?: string;
    population?: number;
    timezone?: string;
    weatherNow?: string;
    temperature?: number;
  };
  happeningNow?: Array<{
    id: string;
    title: string;
    category?: string;
    startTime?: string;
  }>;
  liveActivity?: {
    checkedInCount?: number;
    recentSearches?: number;
    trendingNow?: string[];
  };
  alerts?: Array<{
    id: string;
    message: string;
    severity: "info" | "warning" | "critical";
  }>;
}

export function HeroCard({ city, happeningNow, liveActivity, alerts }: HeroCardProps) {
  return (
    <div className="space-y-4">
      {/* City overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {city?.description && <p className="text-sm text-muted-foreground">{city.description}</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {city?.timezone && (
              <div>
                <p className="text-xs text-muted-foreground">Timezone</p>
                <p className="font-semibold">{city.timezone}</p>
              </div>
            )}
            {city?.temperature !== undefined && (
              <div>
                <p className="text-xs text-muted-foreground">Temperature</p>
                <p className="font-semibold">{city.temperature}°C</p>
              </div>
            )}
            {city?.population && (
              <div>
                <p className="text-xs text-muted-foreground">Population</p>
                <p className="font-semibold">{(city.population / 1e6).toFixed(1)}M</p>
              </div>
            )}
            {city?.weatherNow && (
              <div>
                <p className="text-xs text-muted-foreground">Weather</p>
                <p className="font-semibold">{city.weatherNow}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.severity === "critical" ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Happening now strip */}
      {happeningNow && happeningNow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" />
              Happening Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {happeningNow.slice(0, 3).map((event) => (
                <div key={event.id} className="flex items-start gap-3 pb-2 border-b last:border-0">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{event.title}</p>
                    {event.category && <p className="text-xs text-muted-foreground">{event.category}</p>}
                    {event.startTime && <p className="text-xs text-muted-foreground">{event.startTime}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live activity pulse */}
      {liveActivity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Live Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {liveActivity.checkedInCount !== undefined && (
                <div>
                  <p className="text-xs text-muted-foreground">Checked In</p>
                  <p className="text-2xl font-bold">{liveActivity.checkedInCount}</p>
                </div>
              )}
              {liveActivity.recentSearches !== undefined && (
                <div>
                  <p className="text-xs text-muted-foreground">Recent Searches</p>
                  <p className="text-2xl font-bold">{liveActivity.recentSearches}</p>
                </div>
              )}
              {liveActivity.trendingNow && liveActivity.trendingNow.length > 0 && (
                <div className="md:col-span-1 col-span-2">
                  <p className="text-xs text-muted-foreground">Trending</p>
                  <p className="text-sm font-semibold truncate">{liveActivity.trendingNow[0]}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
