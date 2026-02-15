import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Zap,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Coffee,
} from "lucide-react";

interface EnergyDay {
  dayNumber: number;
  startingEnergy: number;
  activityDepletion: number;
  endingEnergy: number;
  breakdown: Array<{
    itemId: string;
    title: string;
    energyCost: number;
  }>;
}

interface EnergyResult {
  tripId: string;
  totalDays: number;
  energyByDay: EnergyDay[];
  warnings: string[];
}

interface EnergyBudgetDisplayProps {
  tripId: string;
}

export function EnergyBudgetDisplay({ tripId }: EnergyBudgetDisplayProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingTracking = [] } = useQuery<Array<{ dayNumber: number; endingEnergy: number }>>({
    queryKey: [`/api/trips/${tripId}/energy`],
    enabled: false, // Only calculate on demand
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/calculate-energy`);
      return response.json() as Promise<EnergyResult>;
    },
    onSuccess: (data) => {
      if (data.warnings.length > 0) {
        toast({
          variant: "destructive",
          title: "Energy Warnings",
          description: `${data.warnings.length} day${data.warnings.length !== 1 ? "s" : ""} with low energy detected.`,
        });
      } else {
        toast({ title: "Energy Calculated", description: `${data.totalDays} day${data.totalDays !== 1 ? "s" : ""} analyzed.` });
      }
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Calculation failed", description: error.message });
    },
  });

  const result = calculateMutation.data;

  function getBatteryIcon(energy: number) {
    if (energy < 20) return <BatteryLow className="h-4 w-4 text-red-600" />;
    if (energy < 50) return <BatteryMedium className="h-4 w-4 text-amber-600" />;
    return <BatteryFull className="h-4 w-4 text-green-600" />;
  }

  function getEnergyColor(energy: number) {
    if (energy < 20) return "bg-red-500";
    if (energy < 40) return "bg-amber-500";
    if (energy < 60) return "bg-yellow-500";
    return "bg-green-500";
  }

  function getEnergyBadge(energy: number) {
    if (energy < 20) return <Badge variant="destructive">Critical</Badge>;
    if (energy < 40) return <Badge className="bg-amber-100 text-amber-800">Low</Badge>;
    if (energy < 60) return <Badge className="bg-yellow-100 text-yellow-800">Moderate</Badge>;
    return <Badge className="bg-green-100 text-green-800">Good</Badge>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Energy Budget
            </CardTitle>
            <CardDescription>
              Track daily energy to prevent burnout across your trip
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => calculateMutation.mutate()}
            disabled={calculateMutation.isPending}
          >
            {calculateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-1" />
            )}
            Calculate
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {!result ? (
          <div className="text-center py-6 text-muted-foreground">
            <Battery className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Click "Calculate" to analyze your trip's energy profile</p>
            <p className="text-xs mt-1">Based on activity energy costs in your itinerary</p>
          </div>
        ) : result.totalDays === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Coffee className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No itinerary items found</p>
            <p className="text-xs mt-1">Add activities to your trip to see energy analysis</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-2">
                {result.warnings.map((warning, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {warning}
                  </div>
                ))}
              </div>
            )}

            {/* Day-by-day breakdown */}
            <ScrollArea className="max-h-[350px]">
              <div className="space-y-3">
                {result.energyByDay
                  .sort((a, b) => a.dayNumber - b.dayNumber)
                  .map(day => (
                    <div key={day.dayNumber} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getBatteryIcon(day.endingEnergy)}
                          <span className="font-medium text-sm">Day {day.dayNumber}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getEnergyBadge(day.endingEnergy)}
                          <span className="text-xs text-muted-foreground">{day.endingEnergy}% remaining</span>
                        </div>
                      </div>

                      <Progress value={day.endingEnergy} className="h-2 mb-2" />

                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span>Start: {day.startingEnergy}%</span>
                        <span className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          -{day.activityDepletion}%
                        </span>
                        <span>End: {day.endingEnergy}%</span>
                      </div>

                      {/* Activity breakdown */}
                      {day.breakdown.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {day.breakdown.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate max-w-[200px]">{item.title}</span>
                              <span className={`font-medium ${item.energyCost > 40 ? "text-red-600" : item.energyCost > 25 ? "text-amber-600" : "text-green-600"}`}>
                                -{item.energyCost}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </ScrollArea>

            {/* Summary */}
            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="font-medium">{result.totalDays}</div>
                <div className="text-xs text-muted-foreground">Days</div>
              </div>
              <div>
                <div className="font-medium text-amber-600">
                  {result.energyByDay.filter(d => d.endingEnergy < 30).length}
                </div>
                <div className="text-xs text-muted-foreground">Low Energy Days</div>
              </div>
              <div>
                <div className="font-medium">
                  {result.totalDays > 0
                    ? Math.round(result.energyByDay.reduce((s, d) => s + d.endingEnergy, 0) / result.totalDays)
                    : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Avg Remaining</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
