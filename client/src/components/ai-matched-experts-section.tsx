import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpertMatchCard } from "@/components/expert-match-card";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, RefreshCw, Users, ChevronDown, ChevronUp, Brain, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface AIMatchedExpertsSectionProps {
  destination: string;
  startDate?: Date;
  endDate?: Date;
  experienceType?: string;
  budget?: { min: number; max: number };
  travelers?: number;
  preferences?: string[];
  tripId?: string;
  userId?: string;
  isVisible?: boolean;
}

interface MatchedExpert {
  expert: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
    specialties?: string[];
    reviewsCount?: number;
    tripsCount?: number;
    responseTime?: string;
    verified?: boolean;
    superExpert?: boolean;
    experienceTypes?: any[];
    selectedServices?: any[];
    specializations?: string[];
    expertForm?: {
      destinations?: string[];
      languages?: string[];
      yearsExperience?: string;
      responseTime?: string;
      city?: string;
      country?: string;
    };
  };
  score: number;
  breakdown: {
    destinationExpertise: number;
    styleAlignment: number;
    budgetFit: number;
    experienceRelevance: number;
    availability: number;
  };
  reasoning: string;
  strengths: string[];
}

export function AIMatchedExpertsSection({
  destination,
  startDate,
  endDate,
  experienceType,
  budget,
  travelers = 2,
  preferences = [],
  tripId,
  userId,
  isVisible = true,
}: AIMatchedExpertsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [matchedExperts, setMatchedExperts] = useState<MatchedExpert[]>([]);

  const matchExpertsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/grok/match-experts", {
        tripId,
        userId,
        tripDetails: {
          destination,
          dates: {
            start: startDate?.toISOString(),
            end: endDate?.toISOString(),
          },
          travelers,
          experienceType,
          preferences,
          budget,
        },
      });
      const data = await response.json() as { matches: MatchedExpert[] };
      return data.matches || [];
    },
    onSuccess: (data) => {
      setMatchedExperts(data);
    },
  });

  const displayedExperts = showAll ? matchedExperts : matchedExperts.slice(0, 3);
  const hasMore = matchedExperts.length > 3;

  if (!isVisible || !destination) {
    return null;
  }

  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 dark:from-purple-900/10 dark:to-indigo-900/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span>AI-Matched Experts</span>
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px]">
              Powered by Grok
            </Badge>
          </CardTitle>
          {matchedExperts.length === 0 && !matchExpertsMutation.isPending && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-7 text-xs border-purple-300 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/30"
              onClick={() => matchExpertsMutation.mutate()}
              data-testid="button-find-experts"
            >
              <Sparkles className="w-3 h-3" />
              Find My Experts
            </Button>
          )}
          {matchedExperts.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 h-7 text-xs"
              onClick={() => matchExpertsMutation.mutate()}
              disabled={matchExpertsMutation.isPending}
              data-testid="button-refresh-matches"
            >
              <RefreshCw className={cn("w-3 h-3", matchExpertsMutation.isPending && "animate-spin")} />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {matchExpertsMutation.isPending && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4 animate-pulse text-purple-500" />
              <span>Analyzing your trip details and finding the best expert matches...</span>
            </div>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {matchExpertsMutation.isError && (
          <div className="text-center py-4">
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">
              Unable to find expert matches. Please try again.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => matchExpertsMutation.mutate()}
              data-testid="button-retry"
            >
              Try Again
            </Button>
          </div>
        )}

        {!matchExpertsMutation.isPending && matchedExperts.length === 0 && !matchExpertsMutation.isError && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
              <Target className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h4 className="font-medium text-sm mb-1">Find Your Perfect Expert Match</h4>
            <p className="text-xs text-muted-foreground mb-3 max-w-sm mx-auto">
              Our AI analyzes your {experienceType || "travel"} preferences for {destination} and matches you with 
              local experts who best understand your needs.
            </p>
            <div className="flex flex-wrap justify-center gap-1 mb-4">
              {["Destination expertise", "Style alignment", "Budget fit", "Availability"].map((factor, idx) => (
                <Badge key={idx} variant="secondary" className="text-[10px]">
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {matchedExperts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                <Users className="w-3 h-3 inline mr-1" />
                {matchedExperts.length} experts matched for your {experienceType || "trip"} to {destination}
              </p>
            </div>

            <div className="grid gap-3">
              {displayedExperts.map((match, idx) => (
                <ExpertMatchCard
                  key={match.expert.id}
                  expert={match.expert}
                  matchScore={match.score}
                  matchBreakdown={match.breakdown}
                  matchReasons={[match.reasoning]}
                  matchStrengths={match.strengths}
                  showDetails={idx === 0}
                />
              ))}
            </div>

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowAll(!showAll)}
                data-testid="button-show-more-experts"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    Show {matchedExperts.length - 3} More Experts
                  </>
                )}
              </Button>
            )}

            <div className="flex justify-center pt-2">
              <Link href="/experts">
                <Button variant="outline" size="sm" className="text-xs gap-1" data-testid="link-browse-all-experts">
                  <Users className="w-3 h-3" />
                  Browse All Experts
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
