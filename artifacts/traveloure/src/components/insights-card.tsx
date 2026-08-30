import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  Lightbulb,
  Shield,
  Leaf,
  Smartphone,
  Users,
} from "lucide-react";

const INSIGHT_ICONS = {
  bestTime: Calendar,
  duration: Clock,
  budget: DollarSign,
  mustSee: MapPin,
  tips: Lightbulb,
  safety: Shield,
  seasonal: Leaf,
  weather: Smartphone,
  local: Users,
};

interface InsightItem {
  title: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  details?: string[];
}

interface InsightsCardProps {
  insights?: {
    aiBestTimeToVisit?: string;
    aiOptimalDuration?: string;
    aiBudgetEstimate?: string;
    aiMustSeeAttractions?: string | string[];
    aiTravelTips?: string | string[];
    aiSafetyNotes?: string;
    aiSeasonalHighlights?: string;
    aiWeatherInsights?: string;
    aiLocalInsights?: string;
  };
}

export function InsightsCard({ insights }: InsightsCardProps) {
  const items: InsightItem[] = [];

  if (insights?.aiBestTimeToVisit) {
    items.push({
      title: "Best Time to Visit",
      value: insights.aiBestTimeToVisit,
      icon: INSIGHT_ICONS.bestTime,
    });
  }

  if (insights?.aiOptimalDuration) {
    items.push({
      title: "Optimal Duration",
      value: insights.aiOptimalDuration,
      icon: INSIGHT_ICONS.duration,
    });
  }

  if (insights?.aiBudgetEstimate) {
    items.push({
      title: "Budget Estimate",
      value: insights.aiBudgetEstimate,
      icon: INSIGHT_ICONS.budget,
    });
  }

  if (insights?.aiMustSeeAttractions) {
    const attractions = Array.isArray(insights.aiMustSeeAttractions)
      ? insights.aiMustSeeAttractions.join(", ")
      : insights.aiMustSeeAttractions;
    items.push({
      title: "Must-See Attractions",
      value: attractions,
      icon: INSIGHT_ICONS.mustSee,
      details: Array.isArray(insights.aiMustSeeAttractions)
        ? insights.aiMustSeeAttractions
        : undefined,
    });
  }

  if (insights?.aiTravelTips) {
    const tips = Array.isArray(insights.aiTravelTips)
      ? insights.aiTravelTips.join("\n")
      : insights.aiTravelTips;
    items.push({
      title: "Travel Tips",
      value: tips,
      icon: INSIGHT_ICONS.tips,
      details: Array.isArray(insights.aiTravelTips) ? insights.aiTravelTips : undefined,
    });
  }

  if (insights?.aiSafetyNotes) {
    items.push({
      title: "Safety Notes",
      value: insights.aiSafetyNotes,
      icon: INSIGHT_ICONS.safety,
    });
  }

  if (insights?.aiSeasonalHighlights) {
    items.push({
      title: "Seasonal Highlights",
      value: insights.aiSeasonalHighlights,
      icon: INSIGHT_ICONS.seasonal,
    });
  }

  if (insights?.aiWeatherInsights) {
    items.push({
      title: "Weather Insights",
      value: insights.aiWeatherInsights,
      icon: INSIGHT_ICONS.weather,
    });
  }

  if (insights?.aiLocalInsights) {
    items.push({
      title: "Local Insights",
      value: insights.aiLocalInsights,
      icon: INSIGHT_ICONS.local,
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No AI insights available yet. This will populate as TravelPulse data becomes available.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <Card key={idx}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 text-primary" />}
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {item.details ? (
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {item.details.slice(0, 3).map((detail, i) => (
                    <li key={i} className="text-muted-foreground truncate">
                      {detail}
                    </li>
                  ))}
                  {item.details.length > 3 && (
                    <li className="text-xs text-muted-foreground italic">+{item.details.length - 3} more</li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{item.value}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
