import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { 
  MapPin, 
  TrendingUp, 
  Gem, 
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Zap,
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface City {
  id: string;
  name: string;
  country: string;
  image: string;
  price: number;
  originalPrice?: number;
  discount: number;
  travelers: number;
  seasonalTitle: string;
  categories: { label: string; color: string; bgColor: string; darkBgColor: string }[];
  extraCategories: number;
  status: 'Busy' | 'Moderate' | 'Quiet';
  tip: string;
  trendingCount: number;
  gemsCount: number;
  heatScore: number;
  activeBookings: number;
  isHot?: boolean;
}

const cities: City[] = [
  {
    id: '1',
    name: 'Paris',
    country: 'France',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
    price: 180,
    originalPrice: 200,
    discount: 10,
    travelers: 9234,
    seasonalTitle: 'Autumn Foliage in Parisian Parks',
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100', darkBgColor: 'dark:bg-rose-900/30' },
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Book mid-week stays for November to save up to 15% on hotels before holiday season spikes.',
    trendingCount: 38,
    gemsCount: 19,
    heatScore: 94,
    activeBookings: 18,
    isHot: true,
  },
  {
    id: '2',
    name: 'New York',
    country: 'USA',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80',
    price: 250,
    originalPrice: 278,
    discount: 10,
    travelers: 7821,
    seasonalTitle: 'Fall Foliage in Central Park',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Nightlife', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100', darkBgColor: 'dark:bg-indigo-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Look for midweek deals in late January for lower hotel rates after holiday season.',
    trendingCount: 42,
    gemsCount: 9,
    heatScore: 92,
    activeBookings: 24,
    isHot: true,
  },
  {
    id: '3',
    name: 'Tokyo',
    country: 'Japan',
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80',
    price: 150,
    originalPrice: 167,
    discount: 10,
    travelers: 12847,
    seasonalTitle: 'Autumn Foliage Season',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
      { label: 'Nightlife', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100', darkBgColor: 'dark:bg-indigo-900/30' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Book early for November to avoid peak autumn foliage price spikes.',
    trendingCount: 47,
    gemsCount: 23,
    heatScore: 96,
    activeBookings: 31,
    isHot: true,
  },
  {
    id: '4',
    name: 'Rome',
    country: 'Italy',
    image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80',
    price: 150,
    originalPrice: 167,
    discount: 10,
    travelers: 8234,
    seasonalTitle: 'Autumn Charm with Mild Weather',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100', darkBgColor: 'dark:bg-rose-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
    ],
    extraCategories: 1,
    status: 'Moderate',
    tip: 'Book early for November to avoid peak holiday price spikes.',
    trendingCount: 48,
    gemsCount: 21,
    heatScore: 89,
    activeBookings: 14,
  },
  {
    id: '5',
    name: 'Marrakech',
    country: 'Morocco',
    image: 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=800&q=80',
    price: 120,
    originalPrice: 122,
    discount: 2,
    travelers: 4123,
    seasonalTitle: 'Winter Escape with Mild Weather',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Adventure', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100', darkBgColor: 'dark:bg-emerald-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
    ],
    extraCategories: 2,
    status: 'Quiet',
    tip: 'Early booking discounts available for spring riads.',
    trendingCount: 26,
    gemsCount: 28,
    heatScore: 85,
    activeBookings: 8,
  },
  {
    id: '6',
    name: 'Bangkok',
    country: 'Thailand',
    image: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=80',
    price: 60,
    originalPrice: 61,
    discount: 2,
    travelers: 9876,
    seasonalTitle: 'Post-Rainy Season Refresh',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100', darkBgColor: 'dark:bg-orange-900/30' },
      { label: 'Nightlife', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100', darkBgColor: 'dark:bg-indigo-900/30' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Early bird deals for November festival season available now.',
    trendingCount: 44,
    gemsCount: 42,
    heatScore: 88,
    activeBookings: 19,
  },
  {
    id: '7',
    name: 'Sydney',
    country: 'Australia',
    image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80',
    price: 180,
    originalPrice: 200,
    discount: 10,
    travelers: 6789,
    seasonalTitle: 'Spring Vibes with Blooming Jacarandas',
    categories: [
      { label: 'Adventure', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100', darkBgColor: 'dark:bg-emerald-900/30' },
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Nature', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100', darkBgColor: 'dark:bg-green-900/30' },
    ],
    extraCategories: 2,
    status: 'Moderate',
    tip: 'Book early for summer (Dec-Feb) to avoid peak pricing spikes.',
    trendingCount: 33,
    gemsCount: 18,
    heatScore: 86,
    activeBookings: 11,
  },
  {
    id: '8',
    name: 'London',
    country: 'United Kingdom',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    price: 220,
    originalPrice: 244,
    discount: 10,
    travelers: 11234,
    seasonalTitle: 'Autumn Charm with Fall Colors in Parks',
    categories: [
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100', darkBgColor: 'dark:bg-purple-900/30' },
      { label: 'Nightlife', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100', darkBgColor: 'dark:bg-indigo-900/30' },
      { label: 'Family', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100', darkBgColor: 'dark:bg-blue-900/30' },
    ],
    extraCategories: 1,
    status: 'Busy',
    tip: 'Book early for November to avoid holiday price spikes.',
    trendingCount: 51,
    gemsCount: 15,
    heatScore: 91,
    activeBookings: 27,
    isHot: true,
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Busy': return 'text-orange-500 dark:text-orange-400';
    case 'Moderate': return 'text-yellow-500 dark:text-yellow-400';
    case 'Quiet': return 'text-green-500 dark:text-green-400';
    default: return 'text-gray-500 dark:text-gray-400';
  }
};

const getStatusBg = (status: string) => {
  switch (status) {
    case 'Busy': return 'bg-orange-50 dark:bg-orange-900/20';
    case 'Moderate': return 'bg-yellow-50 dark:bg-yellow-900/20';
    case 'Quiet': return 'bg-green-50 dark:bg-green-900/20';
    default: return 'bg-gray-50 dark:bg-gray-800';
  }
};

export function TrendingCities() {
  const [liveUpdates, setLiveUpdates] = useState(true);

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
              Real-time intelligence from <span className="font-semibold text-foreground">102,530 travelers</span> worldwide
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLiveUpdates(!liveUpdates)}
            className={cn(
              "rounded-full border-2 gap-2",
              liveUpdates 
                ? "border-green-500 text-green-600 dark:text-green-400 dark:border-green-500" 
                : "border-border"
            )}
            data-testid="button-live-updates"
          >
            <Zap className={cn("w-4 h-4", liveUpdates && "fill-green-500")} />
            Live Updates
          </Button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cities.map((city, index) => (
            <motion.div
              key={city.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="group"
            >
              <Link href={`/discover?tab=travelpulse&city=${encodeURIComponent(city.name)}`}>
                <div 
                  className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer border border-border"
                  data-testid={`card-city-${city.id}`}
                >
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={city.image}
                      alt={city.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    
                    {/* Heat Score Badge */}
                    <div 
                      className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
                      data-testid={`badge-heat-score-${city.id}`}
                    >
                      <span className={cn(
                        "text-lg font-bold",
                        city.heatScore >= 90 ? "text-[#FF385C]" : city.heatScore >= 85 ? "text-orange-500 dark:text-orange-400" : "text-amber-500 dark:text-amber-400"
                      )}>
                        {city.heatScore}
                      </span>
                    </div>
                    
                    <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
                      {city.isHot ? (
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
                      {city.travelers > 0 && (
                        <span 
                          className="px-2 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-medium flex items-center gap-1 shadow-sm"
                          data-testid={`badge-travelers-${city.id}`}
                        >
                          <Users className="w-3 h-3" />
                          {city.travelers.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-2xl font-bold text-white">{city.name}</h3>
                      <div className="flex items-center gap-2 text-white/80 text-sm">
                        <MapPin className="w-3 h-3" />
                        {city.country}
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-[#FF385C] mt-0.5 flex-shrink-0" />
                      <h4 className="text-sm font-semibold text-[#FF385C] line-clamp-2">
                        {city.seasonalTitle}
                      </h4>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {city.categories.map((cat) => (
                        <span
                          key={cat.label}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium",
                            cat.bgColor,
                            cat.darkBgColor,
                            cat.color
                          )}
                        >
                          {cat.label}
                        </span>
                      ))}
                      {city.extraCategories > 0 && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted dark:bg-muted text-muted-foreground">
                          +{city.extraCategories}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground">${city.price}</span>
                        {city.originalPrice && (
                          <span className="text-sm text-muted-foreground line-through">
                            ${city.originalPrice}
                          </span>
                        )}
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center">
                          <ArrowUpRight className="w-3 h-3" />
                          {city.discount}%
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        getStatusColor(city.status),
                        getStatusBg(city.status)
                      )}>
                        {city.status}
                      </span>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-3">
                          {city.tip}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border" data-testid={`stats-footer-${city.id}`}>
                      <div className="flex items-center gap-1" data-testid={`stat-active-${city.id}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        {city.activeBookings} active
                      </div>
                      <div className="flex items-center gap-1" data-testid={`stat-trending-${city.id}`}>
                        <TrendingUp className="w-3 h-3" />
                        {city.trendingCount}
                      </div>
                      <div className="flex items-center gap-1" data-testid={`stat-gems-${city.id}`}>
                        <Gem className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                        {city.gemsCount}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-10"
        >
          <Link href="/discover">
            <Button 
              size="lg" 
              className="bg-[#FF385C] text-white font-semibold px-8"
              data-testid="button-explore-all-cities"
            >
              Explore All Destinations
              <ArrowUpRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default TrendingCities;
