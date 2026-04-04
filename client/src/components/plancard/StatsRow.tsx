import { differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingDown, Heart, Route, CheckCircle2, DollarSign, Gauge } from "lucide-react";
import { STATS_ICONS, type TemplateConfig, type PlanCardTrip, type PlanCardDay } from "./plancard-types";

export interface ExtraStat {
  label: string;
  value: string | number;
  icon?: typeof Star;
}

interface StatsRowProps {
  trip: PlanCardTrip;
  days: PlanCardDay[];
  totalActivities: number;
  totalLegs: number;
  totalMinutes: number;
  templateConfig: TemplateConfig;
  extraStats?: ExtraStat[];
}

export function StatsRow({ trip, days, totalActivities, totalLegs, totalMinutes, templateConfig, extraStats }: StatsRowProps) {
  const coreItems = [
    { label: templateConfig.statsLabels[0], value: days.length || differenceInDays(new Date(trip.endDate ?? Date.now()), new Date(trip.startDate ?? Date.now())) + 1, icon: STATS_ICONS[0] },
    { label: templateConfig.statsLabels[1], value: totalActivities, icon: STATS_ICONS[1] },
    { label: templateConfig.statsLabels[2], value: totalLegs, icon: STATS_ICONS[2] },
    { label: templateConfig.statsLabels[3], value: totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "-", icon: STATS_ICONS[3] },
  ];

  const extraItems = (extraStats || []).map(s => ({
    label: s.label,
    value: s.value,
    icon: s.icon || Star,
  }));

  const allItems = [...coreItems, ...extraItems];
  const cols = allItems.length <= 4 ? 4 : allItems.length;

  return (
    <div className={`grid border-b border-border`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-testid={`stats-row-${trip.id}`}>
      {allItems.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i} className={`py-3 px-3 text-center ${i < allItems.length - 1 ? "border-r border-border" : ""}`}>
            <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Icon className="w-3 h-3" /> {s.label}
            </div>
            <div className="text-lg font-bold text-foreground" data-testid={`text-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}-${trip.id}`}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}

export { CheckCircle2 as BookedIcon, DollarSign as CostIcon, Gauge as EfficiencyIcon };

interface OptimizerMetricsProps {
  tripId: string;
  traveloureScore: number | null | undefined;
  savings: string | null | undefined;
  savingsPercent: string | null | undefined;
  wellnessTime: number | null | undefined;
  travelDistance: number | null | undefined;
  starDelta: number | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
}

export function OptimizerMetrics({ tripId, traveloureScore, savings, savingsPercent, wellnessTime, travelDistance, starDelta, totalCost, perPerson }: OptimizerMetricsProps) {
  const hasMetrics = traveloureScore != null || savings || wellnessTime || travelDistance || starDelta || totalCost;
  if (!hasMetrics) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-border bg-muted/30" data-testid={`optimizer-metrics-${tripId}`}>
      {traveloureScore != null && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-primary/10 text-primary border-0" data-testid={`badge-traveloure-score-${tripId}`}>
          <Star className="w-3 h-3" /> {traveloureScore} Score
        </Badge>
      )}
      {totalCost && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" data-testid={`badge-total-cost-${tripId}`}>
          {totalCost}{perPerson && ` (${perPerson})`}
        </Badge>
      )}
      {savings && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0" data-testid={`badge-savings-${tripId}`}>
          <TrendingDown className="w-3 h-3" /> Saves {savings}{savingsPercent && ` (${savingsPercent})`}
        </Badge>
      )}
      {wellnessTime && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-0" data-testid={`badge-wellness-${tripId}`}>
          <Heart className="w-3 h-3" /> {wellnessTime}m wellness
        </Badge>
      )}
      {travelDistance && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-0" data-testid={`badge-travel-distance-${tripId}`}>
          <Route className="w-3 h-3" /> {travelDistance}m travel
        </Badge>
      )}
      {starDelta && (
        <Badge variant="secondary" className="text-[11px] gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-0" data-testid={`badge-star-delta-${tripId}`}>
          <Star className="w-3 h-3" /> {starDelta} stars
        </Badge>
      )}
    </div>
  );
}
