import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { CityCard as SharedCityCard } from '@/components/travelpulse/CityCard';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  TrendingUp,
  TrendingDown,
  Gem,
  Sparkles,
  Users,
  Zap,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TravelPulseCity {
  id: string;
  cityName: string;
  country: string;
  imageUrl?: string | null;
  pulseScore: number;
  activeTravelers: number;
  trendingScore: number;
  crowdLevel: string;
  vibeTags: string[];
  currentHighlight?: string | null;
  avgHotelPrice?: string | null;
  priceChange?: string | null;
  dealAlert?: string | null;
  totalTrendingSpots: number;
  totalHiddenGems: number;
}

const vibeTagColors: Record<string, string> = {
  romantic: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30',
  adventure: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
  foodie: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30',
  nightlife: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30',
  cultural: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  relaxation: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30',
  family: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  budget: 'text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30',
  luxury: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
  nature: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
};

const getCrowdColor = (level: string) => {
  switch ((level || '').toLowerCase()) {
    case 'busy': return 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
    case 'moderate': return 'text-yellow-500 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
    case 'quiet': return 'text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    default: return 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800';
  }
};

const getPulseColor = (score: number) => {
  if (score >= 90) return 'text-primary';
  if (score >= 80) return 'text-orange-500 dark:text-orange-400';
  return 'text-amber-500 dark:text-amber-400';
};

function CityCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border">
      <Skeleton className="h-48 w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function TrendingCities() {
  const [, navigate] = useLocation();
  const [liveUpdates, setLiveUpdates] = useState(true);

  const { data, isLoading } = useQuery<{ cities: TravelPulseCity[]; count: number }>({
    queryKey: ['/api/travelpulse/cities'],
  });

  const cities = (data?.cities || []).slice(0, 8);

  return (
    <section className="py-16 lg:py-20 bg-muted dark:bg-background">
      <div className="container mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
                Trending <span className="text-primary">Cities</span>
              </h2>
            </div>
            <p className="text-muted-foreground">
              Real-time TravelPulse intelligence from{' '}
              <span className="font-semibold text-foreground">
                {isLoading ? '…' : (data?.cities.reduce((s, c) => s + (c.activeTravelers || 0), 0) || 0).toLocaleString()}
              </span>{' '}
              active travelers worldwide
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLiveUpdates(!liveUpdates)}
            className={cn(
              'rounded-full border-2 gap-2',
              liveUpdates
                ? 'border-green-500 text-green-600 dark:text-green-400 dark:border-green-500'
                : 'border-border'
            )}
            data-testid="button-live-updates"
          >
            <Zap className={cn('w-4 h-4', liveUpdates && 'fill-green-500')} />
            Live Updates
          </Button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <CityCardSkeleton key={i} />)
            : cities.map((city, index) => {
                const priceChange = parseFloat(city.priceChange || '0');
                const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];
                const isHot = city.trendingScore > 70;

                return (
                  <motion.div
                    key={city.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="group"
                  >
                    <SharedCityCard
                      variant="pulse"
                      cityName={city.cityName}
                      country={city.country}
                      imageUrl={city.imageUrl}
                      score={city.pulseScore}
                      isHot={isHot}
                      activeTravelers={city.activeTravelers}
                      highlight={city.currentHighlight}
                      vibeTags={vibeTags}
                      avgPrice={city.avgHotelPrice}
                      priceChangePct={Math.round(priceChange)}
                      crowdLevel={city.crowdLevel}
                      dealAlert={city.dealAlert}
                      trendingSpots={city.totalTrendingSpots}
                      hiddenGems={city.totalHiddenGems}
                      primaryLabel="Take me Here"
                      onPrimary={() => navigate(`/discover/location/${encodeURIComponent(city.cityName)}?country=${encodeURIComponent(city.country || "")}`)}
                      onCardClick={() => navigate(`/discover/location/${encodeURIComponent(city.cityName)}?country=${encodeURIComponent(city.country || "")}`)}
                      testId={`card-city-${city.id}`}
                    />
                  </motion.div>
                );
              })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-10"
        >
          <Link href="/discover?tab=travelpulse">
            <Button
              size="lg"
              className="bg-primary text-white font-semibold px-8"
              data-testid="button-explore-all-cities"
            >
              Explore All in TravelPulse
              <TrendingUp className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default TrendingCities;
