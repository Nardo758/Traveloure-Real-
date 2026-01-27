import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Sparkles,
  MapPin,
  ArrowRight,
  Star
} from "lucide-react";

interface UserRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  matchScore: number;
  reasons: string[];
  relatedServices: Array<{ id: string; name: string; price?: number }>;
}

interface RecommendationsResponse {
  recommendations: UserRecommendation[];
  city?: string;
  message?: string;
}

interface Props {
  city?: string;
  experienceType?: string;
  className?: string;
}

export function UserTemplateRecommendations({ city, experienceType, className = "" }: Props) {
  const params = new URLSearchParams();
  if (city) params.append("city", city);
  if (experienceType) params.append("experienceType", experienceType);
  const queryString = params.toString();
  const queryPath = queryString ? `/api/recommendations/user?${queryString}` : "/api/recommendations/user";

  const { data, isLoading, error } = useQuery<RecommendationsResponse>({
    queryKey: ["/api/recommendations/user", { city, experienceType }],
  });

  if (isLoading) {
    return (
      <Card className={`hover-elevate ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Recommended For You
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.recommendations.length === 0) {
    return null;
  }

  return (
    <Card className={`hover-elevate ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>Recommended For You</CardTitle>
          </div>
          <Badge variant="outline" className="text-primary">
            <TrendingUp className="w-3 h-3 mr-1" />
            {data.message || "Trending"}
          </Badge>
        </div>
        <CardDescription>
          {city ? `Popular experiences in ${city}` : "Popular experiences based on current travel trends"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.recommendations.slice(0, 4).map((rec) => (
          <div 
            key={rec.id}
            className="p-4 rounded-lg border bg-card hover-elevate transition-colors cursor-pointer"
            data-testid={`recommendation-${rec.id}`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-medium">{rec.title}</h4>
                  {rec.matchScore >= 80 && (
                    <Badge variant="default" className="bg-primary text-xs">
                      <Star className="w-3 h-3 mr-1" />
                      Top Match
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {rec.city}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {rec.serviceType.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-primary">
                  {rec.matchScore}% match
                </div>
              </div>
            </div>
            
            {rec.reasons && rec.reasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {rec.reasons.slice(0, 2).map((reason, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {reason}
                  </Badge>
                ))}
              </div>
            )}

            {rec.relatedServices && rec.relatedServices.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {rec.relatedServices.length} related service{rec.relatedServices.length > 1 ? "s" : ""} available
              </div>
            )}
          </div>
        ))}
        
        {data.recommendations.length > 4 && (
          <Button variant="outline" className="w-full" data-testid="button-explore-recommendations">
            Explore all recommendations
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
