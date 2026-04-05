import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Sparkles, MapPin, ArrowRight, Star, Plus } from "lucide-react";
import { Link } from "wouter";

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

const CARD_GRADIENTS = [
  "from-rose-400 to-pink-600",
  "from-violet-500 to-purple-700",
  "from-blue-400 to-indigo-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-cyan-400 to-sky-600",
];

const TYPE_EMOJI: Record<string, string> = {
  attraction: "🏛️",
  restaurant: "🍽️",
  hotel: "🏨",
  tour: "🗺️",
  activity: "🎯",
  transport: "🚌",
  wedding: "💍",
  proposal: "💝",
  birthday: "🎂",
  corporate: "🏢",
};

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
      <section className={className}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[#FF385C]" />
          <h2 className="text-xl font-bold text-[#111827] dark:text-white">Recommended For You</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-border">
              <Skeleton className="h-28 w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !data || data.recommendations.length === 0) {
    return null;
  }

  const recs = data.recommendations.slice(0, 6);

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FF385C]" />
          <div>
            <h2 className="text-xl font-bold text-[#111827] dark:text-white">Recommended For You</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {city ? `Trending in ${city}` : (data.message || "Based on current travel trends")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[#FF385C] border-[#FF385C]/30 bg-[#FFE3E8]/40 hidden sm:flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Trending
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recs.map((rec, i) => {
          const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
          const emoji = TYPE_EMOJI[rec.serviceType?.toLowerCase()] || "✨";
          const isTopMatch = rec.matchScore >= 80;

          return (
            <div
              key={rec.id}
              className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
              data-testid={`recommendation-${rec.id}`}
            >
              {/* Color header bar */}
              <div className={`bg-gradient-to-br ${gradient} h-24 relative flex items-end p-3`}>
                <div className="absolute inset-0 bg-black/10" />
                <div className="relative z-10 flex items-end justify-between w-full">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">
                    {emoji}
                  </div>
                  <div className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-0.5">
                    {isTopMatch && <Star className="w-3 h-3 text-yellow-300 fill-yellow-300" />}
                    <span className="text-white text-xs font-bold">{rec.matchScore}%</span>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start gap-2 mb-1">
                  <h4 className="font-semibold text-sm text-foreground leading-snug flex-1">{rec.title}</h4>
                  {isTopMatch && (
                    <Badge className="bg-[#FFE3E8] text-[#FF385C] text-[10px] px-1.5 py-0.5 border-0 flex-shrink-0">
                      Top Match
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{rec.description}</p>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {rec.city}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {rec.serviceType?.replace(/_/g, " ")}
                  </Badge>
                </div>

                {rec.reasons && rec.reasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rec.reasons.slice(0, 2).map((reason, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}

                {rec.relatedServices && rec.relatedServices.length > 0 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {rec.relatedServices.length} service{rec.relatedServices.length > 1 ? "s" : ""} available
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.recommendations.length > 6 && (
        <div className="mt-4 text-center">
          <Button variant="outline" className="border-[#FF385C] text-[#FF385C] hover:bg-[#FFE3E8]" data-testid="button-explore-recommendations">
            Explore all recommendations
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </section>
  );
}
