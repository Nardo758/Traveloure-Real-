import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Lightbulb,
  Target,
  ArrowRight,
  Sparkles,
  MapPin,
  DollarSign,
  X,
  Check,
  ChevronRight
} from "lucide-react";

interface ExpertRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  country?: string;
  opportunityScore: number;
  potentialRevenue?: number;
  competitionLevel: "low" | "medium" | "high";
  actionItems: string[];
  supportingData: {
    trendScore?: number;
    demandLevel?: string;
    seasonalPeaks?: number[];
    relatedTrends?: string[];
  };
}

interface RecommendationsResponse {
  recommendations: ExpertRecommendation[];
  message?: string;
}

export function ExpertServiceRecommendations() {
  const { data, isLoading, error } = useQuery<RecommendationsResponse>({
    queryKey: ["/api/recommendations/expert"],
  });

  if (isLoading) {
    return (
      <Card className="hover-elevate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Service Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  if (data.recommendations.length === 0) {
    return (
      <Card className="hover-elevate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Service Opportunities
          </CardTitle>
          <CardDescription>
            {data.message || "No recommendations available at this time. Add more destinations to your profile."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getCompetitionColor = (level: string) => {
    switch (level) {
      case "low": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "high": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const getDemandColor = (level?: string) => {
    switch (level) {
      case "trending": return "text-primary";
      case "very_high": return "text-green-600";
      case "high": return "text-blue-600";
      default: return "text-muted-foreground";
    }
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <CardTitle>Service Opportunities</CardTitle>
          </div>
          <Badge variant="outline" className="text-primary">
            <Sparkles className="w-3 h-3 mr-1" />
            AI Powered
          </Badge>
        </div>
        <CardDescription>
          Service recommendations based on TravelPulse market trends in your destinations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.recommendations.slice(0, 5).map((rec) => (
          <div 
            key={rec.id}
            className="p-4 rounded-lg border bg-card hover-elevate transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-medium">{rec.title}</h4>
                  {rec.supportingData.demandLevel === "trending" && (
                    <Badge variant="default" className="bg-primary">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      Trending
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {rec.city}
                  </span>
                  <Badge variant="outline" className={getCompetitionColor(rec.competitionLevel)}>
                    {rec.competitionLevel} competition
                  </Badge>
                  {rec.potentialRevenue && (
                    <span className="flex items-center gap-1 text-green-600">
                      <DollarSign className="w-3 h-3" />
                      ${rec.potentialRevenue.toLocaleString()} potential
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Opportunity</div>
                  <div className="flex items-center gap-2">
                    <Progress value={rec.opportunityScore} className="w-16 h-2" />
                    <span className="text-sm font-medium">{rec.opportunityScore}%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {rec.actionItems.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Next steps:</div>
                <div className="flex flex-wrap gap-2">
                  {rec.actionItems.slice(0, 3).map((item, idx) => (
                    <span key={idx} className="text-xs flex items-center gap-1 bg-muted px-2 py-1 rounded">
                      <ChevronRight className="w-3 h-3" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {data.recommendations.length > 5 && (
          <Button variant="outline" className="w-full">
            View all {data.recommendations.length} opportunities
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
