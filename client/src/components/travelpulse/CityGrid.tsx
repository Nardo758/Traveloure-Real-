import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MapPin,
  DollarSign,
  Cloud,
  Sparkles,
  ArrowLeft,
  Gem,
  Bell,
  Activity,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CityDetailView } from "./CityDetailView";

interface TravelPulseCity {
  id: string;
  cityName: string;
  country: string;
  countryCode?: string | null;
  region?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  pulseScore: number;
  activeTravelers: number;
  trendingScore: number;
  crowdLevel: string;
  vibeTags: string[];
  currentHighlight?: string | null;
  highlightEmoji?: string | null;
  weatherScore?: number | null;
  avgHotelPrice?: string | null;
  priceChange?: string | null;
  priceTrend?: string | null;
  dealAlert?: string | null;
  totalTrendingSpots: number;
  totalHiddenGems: number;
  totalAlerts: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

interface CityGridProps {
  onCitySelect?: (city: TravelPulseCity) => void;
}

const vibeTagColors: Record<string, string> = {
  romantic: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  adventure: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  foodie: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  nightlife: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  cultural: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  relaxation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  family: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  budget: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  luxury: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  nature: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function getCrowdLevelColor(level: string) {
  switch (level) {
    case "quiet": return "text-green-500";
    case "moderate": return "text-yellow-500";
    case "busy": return "text-orange-500";
    case "packed": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

function getPulseGradient(score: number) {
  if (score >= 90) return "from-rose-500 to-orange-500";
  if (score >= 80) return "from-orange-500 to-amber-500";
  if (score >= 70) return "from-amber-500 to-yellow-500";
  return "from-yellow-500 to-lime-500";
}

function CityCard({ city, onClick }: { city: TravelPulseCity; onClick: () => void }) {
  const priceChange = parseFloat(city.priceChange || "0");
  const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];

  return (
    <motion.div
      layoutId={`city-${city.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="overflow-hidden cursor-pointer hover-elevate group"
        onClick={onClick}
        data-testid={`card-city-${city.cityName.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="relative h-40 overflow-hidden">
          {city.imageUrl ? (
            <img
              src={city.imageUrl}
              alt={city.cityName}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <MapPin className="h-12 w-12 text-primary/30" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge 
              className={cn(
                "bg-gradient-to-r text-white border-0 font-bold",
                getPulseGradient(city.pulseScore)
              )}
            >
              <Zap className="h-3 w-3 mr-1" />
              {city.pulseScore}
            </Badge>
            {city.totalAlerts > 0 && (
              <Badge variant="destructive" className="text-xs" data-testid={`alert-count-${city.cityName.toLowerCase().replace(/\s+/g, "-")}`}>
                <Bell className="h-3 w-3 mr-1" />
                {city.totalAlerts}
              </Badge>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-xl font-bold text-white mb-1">{city.cityName}</h3>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <MapPin className="h-3 w-3" />
              <span>{city.country}</span>
              <span className="text-white/50">•</span>
              <Users className="h-3 w-3" />
              <span>{city.activeTravelers.toLocaleString()} travelers</span>
            </div>
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {city.currentHighlight && (
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">{city.currentHighlight}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {vibeTags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={cn("text-xs capitalize", vibeTagColors[tag] || "")}
              >
                {tag}
              </Badge>
            ))}
            {vibeTags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{vibeTags.length - 3}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 text-sm">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">${city.avgHotelPrice || "N/A"}</span>
              {priceChange !== 0 && (
                <span className={cn(
                  "flex items-center text-xs",
                  priceChange < 0 ? "text-green-500" : "text-red-500"
                )}>
                  {priceChange < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {Math.abs(priceChange)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={cn("capitalize", getCrowdLevelColor(city.crowdLevel))}>
                {city.crowdLevel}
              </span>
            </div>
          </div>

          {city.dealAlert && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs" data-testid={`deal-alert-${city.cityName.toLowerCase().replace(/\s+/g, "-")}`}>
              <DollarSign className="h-3 w-3" />
              <span className="font-medium">{city.dealAlert}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>{city.totalTrendingSpots} trending</span>
            </div>
            <div className="flex items-center gap-1">
              <Gem className="h-3 w-3" />
              <span>{city.totalHiddenGems} gems</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CityGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-40 w-full" />
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex justify-between pt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CityGrid({ onCitySelect }: CityGridProps) {
  const [selectedCity, setSelectedCity] = useState<TravelPulseCity | null>(null);

  const { data, isLoading, error } = useQuery<{ cities: TravelPulseCity[]; count: number }>({
    queryKey: ["/api/travelpulse/cities"],
  });

  const handleCityClick = (city: TravelPulseCity) => {
    setSelectedCity(city);
    onCitySelect?.(city);
  };

  const handleBack = () => {
    setSelectedCity(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <CityGridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Failed to load cities. Please try again.</p>
      </Card>
    );
  }

  const cities = data?.cities || [];

  if (selectedCity) {
    return (
      <CityDetailView
        cityName={selectedCity.cityName}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Trending Cities
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time intelligence from {cities.reduce((acc, c) => acc + c.activeTravelers, 0).toLocaleString()} travelers worldwide
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Calendar className="h-3 w-3 mr-1" />
          Live Updates
        </Badge>
      </div>

      {cities.length === 0 ? (
        <Card className="p-8 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No cities available yet</p>
          <p className="text-muted-foreground">Check back soon for trending destinations!</p>
        </Card>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            layout
          >
            {cities.map((city) => (
              <CityCard
                key={city.id}
                city={city}
                onClick={() => handleCityClick(city)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
