import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Route, 
  Clock, 
  Zap, 
  Cloud,
  Sun,
  CloudRain,
  Thermometer,
  UtensilsCrossed,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  MapPin,
  Car,
  Train,
  Plane,
  Ship,
  Footprints,
  Sparkles,
  RefreshCw
} from "lucide-react";

export interface ItineraryItem {
  id: string;
  name: string;
  type: "activity" | "meal" | "transport" | "accommodation" | "free_time";
  startTime: Date;
  endTime: Date;
  location: string;
  coordinates?: { lat: number; lng: number };
  energyLevel: "low" | "medium" | "high";
  isOptional?: boolean;
  notes?: string;
  weatherDependent?: boolean;
}

export interface DayItinerary {
  date: Date;
  items: ItineraryItem[];
  overallEnergyScore: number;
  travelTimeMinutes: number;
  issues: OptimizationIssue[];
}

export interface OptimizationIssue {
  id: string;
  type: "timing" | "energy" | "weather" | "distance" | "meal";
  severity: "warning" | "critical";
  message: string;
  affectedItemIds: string[];
  suggestion?: string;
}

export interface WeatherForecast {
  date: Date;
  condition: "sunny" | "cloudy" | "rainy" | "stormy";
  highTemp: number;
  lowTemp: number;
  precipitation: number;
}

interface ItineraryOptimizationProps {
  experienceId: string;
  experienceName: string;
  days: DayItinerary[];
  weather: WeatherForecast[];
  onOptimize?: () => void;
  onSwapItems?: (dayIndex: number, item1Id: string, item2Id: string) => void;
  onRemoveItem?: (dayIndex: number, itemId: string) => void;
  onAddContingency?: (dayIndex: number, itemId: string) => void;
  isOptimizing?: boolean;
}

export function ItineraryOptimization({
  experienceName,
  days,
  weather,
  onOptimize,
  isOptimizing = false
}: ItineraryOptimizationProps) {
  const [activeTab, setActiveTab] = useState("timeline");
  const [showOptionalItems, setShowOptionalItems] = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const totalIssues = days.reduce((sum, d) => sum + d.issues.length, 0);
  const criticalIssues = days.reduce((sum, d) => sum + d.issues.filter(i => i.severity === "critical").length, 0);
  const avgEnergyScore = days.length > 0 
    ? Math.round(days.reduce((sum, d) => sum + d.overallEnergyScore, 0) / days.length) 
    : 0;
  const totalTravelTime = days.reduce((sum, d) => sum + d.travelTimeMinutes, 0);

  const getWeatherIcon = (condition: WeatherForecast["condition"]) => {
    switch (condition) {
      case "sunny": return <Sun className="w-5 h-5 text-amber-500" />;
      case "cloudy": return <Cloud className="w-5 h-5 text-gray-500" />;
      case "rainy": return <CloudRain className="w-5 h-5 text-blue-500" />;
      case "stormy": return <CloudRain className="w-5 h-5 text-purple-500" />;
    }
  };

  const getEnergyColor = (level: ItineraryItem["energyLevel"]) => {
    switch (level) {
      case "high": return "text-red-500";
      case "medium": return "text-amber-500";
      case "low": return "text-green-500";
    }
  };

  const getItemIcon = (type: ItineraryItem["type"]) => {
    switch (type) {
      case "activity": return <Sparkles className="w-4 h-4" />;
      case "meal": return <UtensilsCrossed className="w-4 h-4" />;
      case "transport": return <Car className="w-4 h-4" />;
      case "accommodation": return <MapPin className="w-4 h-4" />;
      case "free_time": return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const selectedDay = days[selectedDayIndex];
  const dayWeather = weather.find(w => 
    new Date(w.date).toDateString() === new Date(selectedDay?.date).toDateString()
  );

  return (
    <Card className="w-full" data-testid="card-itinerary-optimization">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2" data-testid="text-optimization-title">
            <Route className="h-5 w-5" />
            Itinerary Optimization
          </CardTitle>
          <CardDescription data-testid="text-optimization-description">
            AI-powered scheduling and route optimization for {experienceName}
          </CardDescription>
        </div>
        <Button 
          onClick={onOptimize} 
          disabled={isOptimizing}
          data-testid="button-optimize"
        >
          {isOptimizing ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Optimize Itinerary
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card data-testid="card-total-issues">
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${totalIssues > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {totalIssues}
              </div>
              <p className="text-sm text-muted-foreground">Issues Found</p>
              {criticalIssues > 0 && (
                <Badge variant="destructive" className="mt-1">{criticalIssues} critical</Badge>
              )}
            </CardContent>
          </Card>
          <Card data-testid="card-energy-score">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{avgEnergyScore}%</div>
              <p className="text-sm text-muted-foreground">Energy Balance</p>
              <Progress value={avgEnergyScore} className="h-2 mt-2" />
            </CardContent>
          </Card>
          <Card data-testid="card-travel-time">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{Math.round(totalTravelTime / 60)}h</div>
              <p className="text-sm text-muted-foreground">Total Travel Time</p>
            </CardContent>
          </Card>
          <Card data-testid="card-days-count">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{days.length}</div>
              <p className="text-sm text-muted-foreground">Days Planned</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-optimization">
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Clock className="w-4 h-4 mr-2" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="energy" data-testid="tab-energy">
              <Zap className="w-4 h-4 mr-2" />
              Energy
            </TabsTrigger>
            <TabsTrigger value="weather" data-testid="tab-weather">
              <Cloud className="w-4 h-4 mr-2" />
              Weather
            </TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-issues">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Issues
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {days.map((day, index) => (
                  <Button
                    key={index}
                    variant={selectedDayIndex === index ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDayIndex(index)}
                    data-testid={`button-day-${index}`}
                  >
                    Day {index + 1}
                    {day.issues.length > 0 && (
                      <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 text-xs">
                        {day.issues.length}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-optional" 
                  checked={showOptionalItems}
                  onCheckedChange={setShowOptionalItems}
                  data-testid="switch-show-optional"
                />
                <Label htmlFor="show-optional">Show optional items</Label>
              </div>
            </div>

            {selectedDay && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    {dayWeather && getWeatherIcon(dayWeather.condition)}
                    <span className="text-sm">
                      {dayWeather?.highTemp}° / {dayWeather?.lowTemp}°
                    </span>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{selectedDay.travelTimeMinutes} min travel</span>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${selectedDay.overallEnergyScore > 70 ? 'text-green-500' : selectedDay.overallEnergyScore > 40 ? 'text-amber-500' : 'text-red-500'}`} />
                    <span className="text-sm">{selectedDay.overallEnergyScore}% balanced</span>
                  </div>
                </div>

                <ScrollArea className="h-[350px]">
                  <div className="space-y-2">
                    {selectedDay.items
                      .filter(item => showOptionalItems || !item.isOptional)
                      .map((item, index) => (
                        <div key={item.id}>
                          <div 
                            className={`flex items-start gap-3 p-3 rounded-lg border ${item.isOptional ? 'opacity-60 border-dashed' : ''}`}
                            data-testid={`item-${item.id}`}
                          >
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-medium">{formatTime(item.startTime)}</span>
                              <div className="w-px h-8 bg-border my-1" />
                              <span className="text-xs text-muted-foreground">{formatTime(item.endTime)}</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {getItemIcon(item.type)}
                                <span className="font-medium">{item.name}</span>
                                {item.isOptional && <Badge variant="outline" className="text-xs">Optional</Badge>}
                                {item.weatherDependent && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Cloud className="w-3 h-3 mr-1" />
                                    Weather
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                <span>{item.location}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Zap className={`w-4 h-4 ${getEnergyColor(item.energyLevel)}`} />
                              <span className={`text-xs ${getEnergyColor(item.energyLevel)}`}>
                                {item.energyLevel}
                              </span>
                            </div>
                          </div>
                          {index < selectedDay.items.length - 1 && (
                            <div className="flex items-center justify-center py-1 text-muted-foreground">
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="energy" className="space-y-4 mt-4">
            <Card data-testid="card-energy-analysis">
              <CardHeader>
                <CardTitle className="text-base">Energy Level Distribution</CardTitle>
                <CardDescription>Analyze how activities are distributed by energy requirement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {days.map((day, index) => {
                    const highEnergy = day.items.filter(i => i.energyLevel === "high").length;
                    const medEnergy = day.items.filter(i => i.energyLevel === "medium").length;
                    const lowEnergy = day.items.filter(i => i.energyLevel === "low").length;
                    const total = day.items.length;
                    
                    return (
                      <div key={index} className="space-y-1" data-testid={`row-energy-day-${index}`}>
                        <div className="flex justify-between text-sm">
                          <span data-testid={`text-energy-day-${index}`}>Day {index + 1}</span>
                          <span className="text-muted-foreground" data-testid={`text-energy-breakdown-${index}`}>
                            {highEnergy} high / {medEnergy} med / {lowEnergy} low
                          </span>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden">
                          <div 
                            className="bg-red-500" 
                            style={{ width: `${(highEnergy / total) * 100}%` }}
                          />
                          <div 
                            className="bg-amber-500" 
                            style={{ width: `${(medEnergy / total) * 100}%` }}
                          />
                          <div 
                            className="bg-green-500" 
                            style={{ width: `${(lowEnergy / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-energy-recommendations">
              <CardHeader>
                <CardTitle className="text-base">Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Alternate high and low energy activities</p>
                      <p className="text-xs text-muted-foreground">Prevents burnout and maintains engagement</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Schedule high-energy activities in morning</p>
                      <p className="text-xs text-muted-foreground">Energy levels are typically higher earlier</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Include rest periods after meals</p>
                      <p className="text-xs text-muted-foreground">Aids digestion and recovery</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="weather" className="space-y-4 mt-4">
            <div className="grid grid-cols-4 gap-4">
              {weather.map((w, index) => (
                <Card key={index} data-testid={`card-weather-day-${index}`}>
                  <CardContent className="pt-4 text-center">
                    <p className="text-sm font-medium mb-2" data-testid={`text-weather-date-${index}`}>
                      {new Date(w.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <div className="flex justify-center mb-2">
                      {getWeatherIcon(w.condition)}
                    </div>
                    <div className="flex justify-center gap-2 text-sm">
                      <span className="text-red-500" data-testid={`text-weather-high-${index}`}>{w.highTemp}°</span>
                      <span className="text-blue-500" data-testid={`text-weather-low-${index}`}>{w.lowTemp}°</span>
                    </div>
                    {w.precipitation > 0 && (
                      <p className="text-xs text-blue-500 mt-1" data-testid={`text-weather-precip-${index}`}>{w.precipitation}% rain</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card data-testid="card-weather-dependent">
              <CardHeader>
                <CardTitle className="text-base">Weather-Dependent Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {days.flatMap((day, dayIndex) => 
                    day.items
                      .filter(item => item.weatherDependent)
                      .map(item => {
                        const itemWeather = weather.find(w => 
                          new Date(w.date).toDateString() === new Date(day.date).toDateString()
                        );
                        const hasRisk = itemWeather && (itemWeather.condition === "rainy" || itemWeather.condition === "stormy");
                        
                        return (
                          <div 
                            key={item.id}
                            className={`flex items-center justify-between p-2 rounded-lg border ${hasRisk ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : ''}`}
                            data-testid={`row-weather-item-${item.id}`}
                          >
                            <div>
                              <p className="font-medium" data-testid={`text-weather-item-name-${item.id}`}>{item.name}</p>
                              <p className="text-sm text-muted-foreground">Day {dayIndex + 1}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {itemWeather && getWeatherIcon(itemWeather.condition)}
                              {hasRisk && (
                                <Badge variant="secondary" className="bg-amber-500">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Weather Risk
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues" className="space-y-4 mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {days.flatMap((day, dayIndex) => 
                  day.issues.map(issue => (
                    <Card 
                      key={issue.id}
                      className={issue.severity === "critical" ? "border-red-500" : "border-amber-500"}
                      data-testid={`card-issue-${issue.id}`}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className={`w-5 h-5 ${issue.severity === "critical" ? "text-red-500" : "text-amber-500"}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={issue.severity === "critical" ? "destructive" : "secondary"}>
                                {issue.severity}
                              </Badge>
                              <Badge variant="outline">Day {dayIndex + 1}</Badge>
                              <Badge variant="outline" className="capitalize">{issue.type}</Badge>
                            </div>
                            <p className="font-medium mt-2">{issue.message}</p>
                            {issue.suggestion && (
                              <p className="text-sm text-muted-foreground mt-1">
                                <span className="font-medium">Suggestion:</span> {issue.suggestion}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
                {totalIssues === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                    <p className="font-medium">No issues found</p>
                    <p className="text-sm text-muted-foreground">Your itinerary looks well-optimized!</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
