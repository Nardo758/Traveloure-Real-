import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { CityCard as SharedCityCard } from '@/components/travelpulse/CityCard';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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
          className="mb-10"
        >
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
