import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CityCard as SharedCityCard } from "./CityCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MapPin,
  DollarSign,
  Sparkles,
  ArrowLeft,
  Gem,
  Bell,
  Activity,
  Calendar,
  Plane,
  Plus,
  Check,
  Wand2,
  LogIn,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTripQueue, QueuedCity } from "@/contexts/TripQueueContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  selectedCityName?: string;
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
  switch ((level || "").toLowerCase()) {
    case "quiet": return "text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
    case "moderate": return "text-yellow-500 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
    case "busy": return "text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20";
    case "packed": return "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
    default: return "text-muted-foreground bg-muted";
  }
}

function getPulseColor(score: number) {
  if (score >= 90) return "text-[#FF385C]";
  if (score >= 80) return "text-orange-500 dark:text-orange-400";
  return "text-amber-500 dark:text-amber-400";
}

function CityCard({ city, onClick }: { city: TravelPulseCity; onClick: () => void }) {
  const [, navigate] = useLocation();
  const { addCity, removeCity, isInQueue } = useTripQueue();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const priceChange = parseFloat(city.priceChange || "0");
  const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];
  const inQueue = isInQueue(city.id);

  // Fetch user's trips when dialog is open and user is logged in
  const { data: userTrips, isLoading: tripsLoading } = useQuery<any[]>({
    queryKey: ["/api/trips"],
    enabled: dialogOpen && isAuthenticated,
  });

  const handlePlanNow = () => {
    setDialogOpen(false);
    navigate(`/quick-start?destination=${encodeURIComponent(city.cityName)}&country=${encodeURIComponent(city.country)}`);
  };

  const handleSelectTrip = (tripId: string) => {
    setDialogOpen(false);
    navigate(`/trip/${tripId}?addCity=${encodeURIComponent(city.cityName)}&country=${encodeURIComponent(city.country)}`);
  };

  const handleAddToQueue = () => {
    setDialogOpen(false);
    if (inQueue) {
      removeCity(city.id);
      toast({
        title: "Removed from trip queue",
        description: `${city.cityName} has been removed from your multi-city trip.`,
      });
    } else {
      const queuedCity: QueuedCity = {
        id: city.id,
        cityName: city.cityName,
        country: city.country,
        imageUrl: city.imageUrl,
        pulseScore: city.pulseScore,
        vibeTags: city.vibeTags,
        totalHiddenGems: city.totalHiddenGems,
        avgHotelPrice: city.avgHotelPrice,
      };
      addCity(queuedCity);
      toast({
        title: "Added to trip queue",
        description: `${city.cityName} added. Open "My Trip" to plan your multi-city adventure.`,
      });
    }
  };

  const isHot = city.trendingScore > 70;
  const citySlug = city.cityName.toLowerCase().replace(/\s+/g, "-");

  return (
    <>
      <SharedCityCard
        variant="pulse"
        cityName={city.cityName}
        country={city.country}
        imageUrl={city.imageUrl}
        score={city.pulseScore}
        isHot={isHot}
        activeTravelers={city.activeTravelers}
        alertCount={city.totalAlerts}
        inTrip={inQueue}
        highlight={city.currentHighlight}
        vibeTags={vibeTags}
        avgPrice={city.avgHotelPrice}
        priceChangePct={Math.round(priceChange)}
        crowdLevel={city.crowdLevel}
        dealAlert={city.dealAlert}
        trendingSpots={city.totalTrendingSpots}
        hiddenGems={city.totalHiddenGems}
        primaryLabel="Take me Here"
        onPrimary={() => setDialogOpen(true)}
        onCardClick={onClick}
        testId={`card-city-${citySlug}`}
      />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#FF385C]" />
                  Take me to {city.cityName}
                </DialogTitle>
                <DialogDescription>
                  Add this destination to a trip or start planning from scratch.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* ── Existing trips ── */}
                {isAuthenticated ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Add to an existing trip
                    </p>
                    {tripsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                      </div>
                    ) : userTrips && userTrips.length > 0 ? (
                      <ScrollArea className="max-h-48">
                        <div className="space-y-2 pr-1">
                          {userTrips.map((trip: any) => (
                            <button
                              key={trip.id}
                              onClick={() => handleSelectTrip(trip.id)}
                              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-[#FF385C] hover:bg-primary/5 transition-all text-left group"
                              data-testid={`button-select-trip-${trip.id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <FolderOpen className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{trip.title || "Untitled Trip"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{trip.destination}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className="text-xs capitalize hidden sm:flex">
                                  {trip.status}
                                </Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[#FF385C] transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3 bg-muted/50 rounded-xl">
                        No trips yet — start one below.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4 bg-muted/50 rounded-xl">
                    <LogIn className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Sign in to access your trips</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Save cities and plan across multiple destinations
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { setDialogOpen(false); navigate("/auth"); }}
                      data-testid="button-sign-in-prompt"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In
                    </Button>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  {/* ── New AI trip ── */}
                  <Button
                    className="w-full justify-start"
                    onClick={handlePlanNow}
                    data-testid={`button-plan-now-${citySlug}`}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Plan New Trip with AI
                  </Button>

                  {/* ── Multi-city queue ── */}
                  <Button
                    variant={inQueue ? "secondary" : "outline"}
                    className="w-full justify-start"
                    onClick={handleAddToQueue}
                    data-testid={`button-add-to-queue-${citySlug}`}
                  >
                    {inQueue ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Remove from Multi-City Queue
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Multi-City Queue
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
    </>
  );
}

function CityGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="bg-card rounded-2xl overflow-hidden border border-border shadow-card">
          <Skeleton className="h-48 w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CityGrid({ onCitySelect, selectedCityName }: CityGridProps) {
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ cities: TravelPulseCity[]; count: number }>({
    queryKey: ["/api/travelpulse/cities"],
  });

  const handleCityClick = (city: TravelPulseCity) => {
    onCitySelect?.(city);
    navigate(
      `/discover/location/${encodeURIComponent(city.cityName)}?country=${encodeURIComponent(city.country || "")}`
    );
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
