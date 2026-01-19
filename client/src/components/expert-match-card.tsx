import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Star,
  MapPin,
  Languages,
  MessageCircle,
  CheckCircle,
  Award,
  Briefcase,
  Heart,
  Sparkles,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useState } from "react";

interface MatchScoreBreakdown {
  destinationExpertise: number;
  styleAlignment: number;
  budgetFit: number;
  experienceRelevance: number;
  availability: number;
}

interface ExpertMatchCardProps {
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
    experienceTypes?: Array<{
      experienceType?: {
        id: string;
        name: string;
        slug: string;
        icon?: string;
      };
    }>;
    selectedServices?: Array<{
      offering?: {
        name: string;
        price: string;
      };
      category?: {
        name: string;
      };
    }>;
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
  matchScore: number;
  matchBreakdown?: MatchScoreBreakdown;
  matchReasons?: string[];
  matchStrengths?: string[];
  showDetails?: boolean;
  onRequestMatch?: (expertId: string) => void;
  isLoading?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 75) return "text-blue-600 dark:text-blue-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-gray-600 dark:text-gray-400";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent Match";
  if (score >= 75) return "Great Match";
  if (score >= 60) return "Good Match";
  return "Potential Match";
}

function getProgressColor(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 75) return "bg-blue-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-gray-400";
}

export function ExpertMatchCard({
  expert,
  matchScore,
  matchBreakdown,
  matchReasons,
  matchStrengths,
  showDetails = false,
  onRequestMatch,
  isLoading = false,
}: ExpertMatchCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Travel Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;

  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map((s) => parseFloat(s.offering?.price || "0")))
    : null;

  const location =
    expert.expertForm?.city && expert.expertForm?.country
      ? `${expert.expertForm.city}, ${expert.expertForm.country}`
      : expert.expertForm?.destinations?.[0] || null;

  const languages = expert.expertForm?.languages || [];
  const responseTime = expert.responseTime || expert.expertForm?.responseTime || null;
  const reviewsCount = expert.reviewsCount || null;
  const tripsCount = expert.tripsCount || null;
  const rating = 4.9;
  const verified = expert.verified !== false;
  const superExpert = expert.superExpert || false;

  const specialties = expert.specialties || expert.specializations?.slice(0, 2) || [];

  const breakdownItems = matchBreakdown
    ? [
        { label: "Destination Expertise", value: matchBreakdown.destinationExpertise },
        { label: "Style Alignment", value: matchBreakdown.styleAlignment },
        { label: "Budget Fit", value: matchBreakdown.budgetFit },
        { label: "Experience Relevance", value: matchBreakdown.experienceRelevance },
        { label: "Availability", value: matchBreakdown.availability },
      ]
    : [];

  return (
    <Card
      className="hover-elevate transition-all overflow-visible group"
      data-testid={`card-expert-match-${expert.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
            <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span className={cn("text-xs font-bold", getScoreColor(matchScore))} data-testid="text-match-score">
              {matchScore}% Match
            </span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              matchScore >= 90 && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
              matchScore >= 75 && matchScore < 90 && "border-blue-500 text-blue-600 dark:text-blue-400",
              matchScore >= 60 && matchScore < 75 && "border-amber-500 text-amber-600 dark:text-amber-400",
              matchScore < 60 && "border-gray-400 text-gray-600 dark:text-gray-400"
            )}
            data-testid="badge-match-label"
          >
            {getScoreLabel(matchScore)}
          </Badge>
        </div>

        <div className="flex gap-3">
          <div className="relative shrink-0">
            <Avatar className="w-12 h-12 border border-white shadow-sm">
              <AvatarImage src={expert.profileImageUrl || undefined} alt={fullName} />
              <AvatarFallback className="bg-gradient-to-br from-[#FF385C] to-[#E23350] text-white font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            {superExpert && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
                <Award className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-[#111827] dark:text-white text-sm truncate" data-testid="text-expert-name">
                    {fullName}
                  </h3>
                  {verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500 shrink-0" />}
                  {superExpert && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1 py-0 border-0 shrink-0">Super</Badge>
                  )}
                </div>

                {location && (
                  <div className="flex items-center gap-1 text-[#6B7280] text-xs">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{location}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className="p-1 rounded-full hover-elevate shrink-0"
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                data-testid="button-favorite"
              >
                <Heart
                  className={cn("w-4 h-4 transition-colors", isFavorite ? "fill-[#FF385C] text-[#FF385C]" : "text-gray-400")}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
              <div className="flex items-center text-amber-500">
                <Star className="w-3 h-3 fill-amber-500" />
                <span className="ml-0.5 font-semibold">{rating.toFixed(1)}</span>
                {reviewsCount !== null ? (
                  <span className="text-[#6B7280] ml-0.5">({reviewsCount})</span>
                ) : (
                  <span className="text-[#6B7280] ml-0.5">(New)</span>
                )}
              </div>

              {tripsCount !== null && (
                <div className="flex items-center gap-0.5 text-[#6B7280]">
                  <Briefcase className="w-3 h-3" />
                  <span>{tripsCount} trips</span>
                </div>
              )}
            </div>
          </div>

          {lowestPrice && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-[#6B7280]">From</p>
              <p className="text-lg font-bold text-[#FF385C]" data-testid="text-price">
                ${lowestPrice}
              </p>
            </div>
          )}
        </div>

        {matchStrengths && matchStrengths.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-1 mb-1">
              <Target className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-medium text-[#374151] dark:text-gray-300">Why this match:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {matchStrengths.slice(0, 3).map((strength, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-0"
                  data-testid={`badge-strength-${idx}`}
                >
                  {strength}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(specialties.length > 0 || languages.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {specialties.slice(0, 3).map((specialty, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-[#F3F4F6] dark:bg-gray-800 text-[#374151] dark:text-gray-300 border-0"
                data-testid={`badge-specialty-${idx}`}
              >
                {specialty}
              </Badge>
            ))}
            {languages.length > 0 && (
              <span className="text-[10px] text-[#6B7280] flex items-center gap-0.5">
                <Languages className="w-3 h-3" />
                {languages.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        )}

        {showDetails && matchBreakdown && (
          <div className="mt-2">
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center gap-1 text-[10px] text-[#6B7280] hover:text-[#374151] dark:hover:text-gray-300 transition-colors"
              data-testid="button-toggle-breakdown"
            >
              <TrendingUp className="w-3 h-3" />
              <span>Match Breakdown</span>
              {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showBreakdown && (
              <div className="mt-2 space-y-1.5 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50">
                {breakdownItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#6B7280] w-28 truncate">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", getProgressColor(item.value))}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                    <span className={cn("text-[10px] font-medium w-8 text-right", getScoreColor(item.value))}>
                      {item.value}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {matchReasons && matchReasons.length > 0 && showBreakdown && (
          <div className="mt-2 p-2 rounded-md bg-blue-50 dark:bg-blue-900/20">
            <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
              {matchReasons[0]}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5E7EB] dark:border-gray-700">
          <Button variant="outline" size="sm" className="flex-1 gap-1 h-7 text-xs" data-testid="button-message">
            <MessageCircle className="w-3 h-3" />
            Message
          </Button>
          {onRequestMatch ? (
            <Button
              size="sm"
              className="flex-1 bg-[#FF385C] hover:bg-[#E23350] h-7 text-xs gap-1"
              onClick={() => onRequestMatch(expert.id)}
              disabled={isLoading}
              data-testid="button-request-match"
            >
              <Sparkles className="w-3 h-3" />
              {isLoading ? "Matching..." : "Request Expert"}
            </Button>
          ) : (
            <Link href={`/experts/${expert.id}`} className="flex-1">
              <Button size="sm" className="w-full bg-[#FF385C] hover:bg-[#E23350] h-7 text-xs" data-testid="button-view-profile">
                View Profile
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
