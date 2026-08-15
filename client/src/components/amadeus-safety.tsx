import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Shield, AlertTriangle, Heart, Scale, UserCheck, Lock, Users, AlertCircle } from "lucide-react";

interface SafetyRating {
  id: string;
  type: string;
  subType: string;
  name: string;
  geoCode: {
    latitude: number;
    longitude: number;
  };
  safetyScores: {
    overall: number;
    lgbtq: number;
    medical: number;
    physicalHarm: number;
    politicalFreedom: number;
    theft: number;
    women: number;
  };
}

interface AmadeusSafetyProps {
  latitude: number;
  longitude: number;
  radius?: number;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-green-100 dark:bg-green-950";
  if (score >= 40) return "bg-yellow-100 dark:bg-yellow-950";
  return "bg-red-100 dark:bg-red-950";
}

function getProgressColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function getOverallLabel(score: number): string {
  if (score >= 80) return "Very Safe";
  if (score >= 60) return "Safe";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Caution Advised";
  return "High Risk";
}

const scoreCategories = [
  { key: 'overall', label: 'Overall Safety', icon: Shield },
  { key: 'women', label: 'Women Safety', icon: UserCheck },
  { key: 'lgbtq', label: 'LGBTQ+ Safety', icon: Users },
  { key: 'physicalHarm', label: 'Physical Safety', icon: AlertTriangle },
  { key: 'theft', label: 'Theft Risk (inverted)', icon: Lock },
  { key: 'medical', label: 'Medical Services', icon: Heart },
  { key: 'politicalFreedom', label: 'Political Freedom', icon: Scale },
];

export function AmadeusSafety({
  latitude,
  longitude,
  radius = 5,
  className = ""
}: AmadeusSafetyProps) {
  const queryUrl = `/api/amadeus/safety?latitude=${latitude}&longitude=${longitude}&radius=${radius}`;
  
  const { data: safetyRatings, isLoading, isError } = useQuery<SafetyRating[]>({
    queryKey: [queryUrl],
    enabled: !!(latitude && longitude),
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="w-20 h-20 rounded-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded" />
                <Skeleton className="flex-1 h-4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Unable to load safety information. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!safetyRatings || safetyRatings.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No safety data available for this location.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rating = safetyRatings[0];
  const overallScore = rating.safetyScores.overall;

  return (
    <Card className={className} data-testid="card-amadeus-safety">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="title-amadeus-safety">
          <Shield className="h-5 w-5 text-primary" />
          Destination Safety
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-center" data-testid="safety-overall-container">
          <div className={`relative w-24 h-24 rounded-full ${getScoreBg(overallScore)} flex items-center justify-center`}>
            <div className="text-center">
              <span className={`text-3xl font-bold ${getScoreColor(overallScore)}`} data-testid="text-safety-overall-score">
                {overallScore}
              </span>
              <p className="text-xs text-muted-foreground">/ 100</p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Badge 
            variant="secondary" 
            className={`${getScoreBg(overallScore)} ${getScoreColor(overallScore)} border-0`}
            data-testid="badge-safety-label"
          >
            {getOverallLabel(overallScore)}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-safety-location">{rating.name}</p>
        </div>

        <div className="space-y-4">
          {scoreCategories.slice(1).map((category) => {
            const Icon = category.icon;
            const score = rating.safetyScores[category.key as keyof typeof rating.safetyScores];
            const displayScore = category.key === 'theft' ? (100 - score) : score;
            
            return (
              <div key={category.key} className="space-y-1" data-testid={`safety-${category.key}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {category.label}
                  </span>
                  <span className={`font-medium ${getScoreColor(displayScore)}`}>
                    {displayScore}/100
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(displayScore)} transition-all`}
                    style={{ width: `${displayScore}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Safety data provided by Amadeus Safe Place API
        </p>
      </CardContent>
    </Card>
  );
}
