import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
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
  if (score >= 90) return 'text-[#FF385C]';
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
              <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
                Trending <span className="text-[#FF385C]">Cities</span>
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
                    <Link href={`/discover/location/${encodeURIComponent(city.cityName)}?country=${encodeURIComponent(city.country || "")}`}>
                      <div
                        className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer border border-border"
                        data-testid={`card-city-${city.id}`}
                      >
                        <div className="relative h-48 overflow-hidden">
                          {city.imageUrl ? (
                            <img
                              src={city.imageUrl}
                              alt={city.cityName}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <MapPin className="h-12 w-12 text-primary/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                          {/* Pulse Score Badge (top right) — same as CityGrid */}
                          <div
                            className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
                            data-testid={`badge-pulse-score-${city.id}`}
                          >
                            <span className={cn('text-lg font-bold', getPulseColor(city.pulseScore))}>
                              {city.pulseScore}
                            </span>
                          </div>

                          {/* Hot / Trending badge + travelers — top left */}
                          <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
                            {isHot ? (
                              <span
                                className="px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                                data-testid={`badge-hot-${city.id}`}
                              >
                                <Zap className="w-3 h-3 fill-white" />
                                Hot
                              </span>
                            ) : (
                              <span
                                className="px-2.5 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                                data-testid={`badge-trending-${city.id}`}
                              >
                                <TrendingUp className="w-3 h-3" />
                                Trending
                              </span>
                            )}
                            {city.activeTravelers > 0 && (
                              <span
                                className="px-2 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-medium flex items-center gap-1 shadow-sm"
                                data-testid={`badge-travelers-${city.id}`}
                              >
                                <Users className="w-3 h-3" />
                                {city.activeTravelers.toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div className="absolute bottom-3 left-3 right-3">
                            <h3 className="text-2xl font-bold text-white">{city.cityName}</h3>
                            <div className="flex items-center gap-2 text-white/80 text-sm">
                              <MapPin className="w-3 h-3" />
                              {city.country}
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                          {/* Current highlight — same field as CityGrid */}
                          {city.currentHighlight && (
                            <div className="flex items-start gap-2 mb-3">
                              <Sparkles className="w-4 h-4 text-[#FF385C] mt-0.5 flex-shrink-0" />
                              <h4 className="text-sm font-semibold text-[#FF385C] line-clamp-2">
                                {city.currentHighlight}
                              </h4>
                            </div>
                          )}

                          {/* Vibe tags — same field as CityGrid */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {vibeTags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className={cn(
                                  'px-2.5 py-1 rounded-full text-xs font-medium capitalize',
                                  vibeTagColors[tag] || 'bg-muted text-muted-foreground'
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                            {vibeTags.length > 3 && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted dark:bg-muted text-muted-foreground">
                                +{vibeTags.length - 3}
                              </span>
                            )}
                          </div>

                          {/* Price + crowd level — same fields as CityGrid */}
                          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-lg font-bold text-foreground">
                                ${city.avgHotelPrice || 'N/A'}
                              </span>
                              {priceChange !== 0 && (
                                <span
                                  className={cn(
                                    'text-xs flex items-center gap-0.5',
                                    priceChange < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                                  )}
                                >
                                  {priceChange < 0 ? (
                                    <TrendingDown className="w-3 h-3" />
                                  ) : (
                                    <TrendingUp className="w-3 h-3" />
                                  )}
                                  {Math.abs(priceChange)}%
                                </span>
                              )}
                            </div>
                            <span
                              className={cn(
                                'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                                getCrowdColor(city.crowdLevel)
                              )}
                            >
                              {city.crowdLevel || 'Unknown'}
                            </span>
                          </div>

                          {/* Deal alert — same field as CityGrid */}
                          {city.dealAlert && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
                              <div className="flex items-start gap-2">
                                <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-3">
                                  {city.dealAlert}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Footer stats — same metrics as CityGrid */}
                          <div
                            className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border"
                            data-testid={`stats-footer-${city.id}`}
                          >
                            <div className="flex items-center gap-1" data-testid={`stat-pulse-${city.id}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              Pulse {city.pulseScore}
                            </div>
                            <div className="flex items-center gap-1" data-testid={`stat-trending-${city.id}`}>
                              <TrendingUp className="w-3 h-3" />
                              {city.totalTrendingSpots} trending (7d)
                            </div>
                            <div className="flex items-center gap-1" data-testid={`stat-gems-${city.id}`}>
                              <Gem className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                              {city.totalHiddenGems} gems
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
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
              className="bg-[#FF385C] text-white font-semibold px-8"
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
