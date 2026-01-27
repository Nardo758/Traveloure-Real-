import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Target,
  ArrowRight,
  Sparkles,
  MapPin,
  AlertCircle,
  ChevronRight,
  BarChart3
} from "lucide-react";

interface ProviderRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  country?: string;
  opportunityScore: number;
  gapScore: number;
  currentSupplyCount: number;
  priceRangeGap: { budget?: number; midrange?: number; luxury?: number };
  recommendedActions: string[];
}

interface RecommendationsResponse {
  recommendations: ProviderRecommendation[];
  location?: string;
  message?: string;
}

export function ProviderServiceRecommendations() {
  const { data, isLoading, error } = useQuery<RecommendationsResponse>({
    queryKey: ["/api/recommendations/provider"],
  });

  if (isLoading) {
    return (
      <Card className="hover-elevate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            Market Opportunities
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
            <Target className="w-5 h-5 text-blue-500" />
            Market Opportunities
          </CardTitle>
          <CardDescription>
            {data.message || "Create your first service to receive market opportunity recommendations."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getGapColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-blue-600";
    return "text-muted-foreground";
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            <CardTitle>Market Opportunities</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {data.location && (
              <Badge variant="outline">
                <MapPin className="w-3 h-3 mr-1" />
                {data.location}
              </Badge>
            )}
            <Badge variant="outline" className="text-primary">
              <Sparkles className="w-3 h-3 mr-1" />
              AI Powered
            </Badge>
          </div>
        </div>
        <CardDescription>
          Service gaps in your market based on demand analysis and competitor data
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
                  {rec.gapScore >= 70 && (
                    <Badge className="bg-green-500">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      High Demand Gap
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {rec.city}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    {rec.currentSupplyCount} current providers
                  </span>
                  <span className={`flex items-center gap-1 ${getGapColor(rec.gapScore)}`}>
                    <AlertCircle className="w-3 h-3" />
                    {rec.gapScore}% supply gap
                  </span>
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
            
            {rec.recommendedActions.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Recommended actions:</div>
                <div className="flex flex-wrap gap-2">
                  {rec.recommendedActions.slice(0, 3).map((action, idx) => (
                    <span key={idx} className="text-xs flex items-center gap-1 bg-muted px-2 py-1 rounded">
                      <ChevronRight className="w-3 h-3" />
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(rec.priceRangeGap).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {rec.priceRangeGap.budget !== undefined && rec.priceRangeGap.budget > 30 && (
                  <Badge variant="outline" className="text-xs">Budget tier gap: {rec.priceRangeGap.budget}%</Badge>
                )}
                {rec.priceRangeGap.midrange !== undefined && rec.priceRangeGap.midrange > 30 && (
                  <Badge variant="outline" className="text-xs">Mid-range tier gap: {rec.priceRangeGap.midrange}%</Badge>
                )}
                {rec.priceRangeGap.luxury !== undefined && rec.priceRangeGap.luxury > 30 && (
                  <Badge variant="outline" className="text-xs">Luxury tier gap: {rec.priceRangeGap.luxury}%</Badge>
                )}
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
