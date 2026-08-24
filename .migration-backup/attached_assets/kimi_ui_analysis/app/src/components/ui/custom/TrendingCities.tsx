import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, 
  TrendingUp, 
  Gem, 
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  categories: { label: string; color: string; bgColor: string }[];
  extraCategories: number;
  status: 'Busy' | 'Moderate' | 'Quiet';
  tip: string;
  trendingCount: number;
  gemsCount: number;
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
      { label: 'Romantic', color: 'text-rose-600', bgColor: 'bg-rose-100' },
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Book mid-week stays for November to save up to 15% on hotels before holiday season spikes.',
    trendingCount: 38,
    gemsCount: 19,
  },
  {
    id: '2',
    name: 'New York',
    country: 'USA',
    image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80',
    price: 250,
    originalPrice: 278,
    discount: 10,
    travelers: 0,
    seasonalTitle: 'Fall Foliage in Central Park',
    categories: [
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Nightlife', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Look for midweek deals in late January for lower hotel rates after holiday season.',
    trendingCount: 0,
    gemsCount: 9,
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
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
      { label: 'Nightlife', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Book early for November to avoid peak autumn foliage price spikes.',
    trendingCount: 47,
    gemsCount: 23,
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
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Romantic', color: 'text-rose-600', bgColor: 'bg-rose-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    ],
    extraCategories: 1,
    status: 'Busy',
    tip: 'Book early for November to avoid peak holiday price spikes.',
    trendingCount: 48,
    gemsCount: 21,
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
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Adventure', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Early booking discounts available for spring riads.',
    trendingCount: 26,
    gemsCount: 28,
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
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Foodie', color: 'text-orange-600', bgColor: 'bg-orange-100' },
      { label: 'Nightlife', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Early bird deals for November festival season available now.',
    trendingCount: 44,
    gemsCount: 42,
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
      { label: 'Adventure', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Nature', color: 'text-green-600', bgColor: 'bg-green-100' },
    ],
    extraCategories: 2,
    status: 'Busy',
    tip: 'Book early for summer (Dec-Feb) to avoid peak pricing spikes.',
    trendingCount: 33,
    gemsCount: 18,
  },
  {
    id: '8',
    name: 'London',
    country: 'United Kingdom',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
    price: 220,
    originalPrice: 244,
    discount: 10,
    travelers: 0,
    seasonalTitle: 'Autumn Charm with Fall Colors in Parks',
    categories: [
      { label: 'Cultural', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      { label: 'Nightlife', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
      { label: 'Family', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    ],
    extraCategories: 1,
    status: 'Busy',
    tip: 'Book early for November to avoid holiday price spikes.',
    trendingCount: 0,
    gemsCount: 0,
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Busy': return 'text-orange-500';
    case 'Moderate': return 'text-yellow-500';
    case 'Quiet': return 'text-green-500';
    default: return 'text-gray-500';
  }
};

export function TrendingCities() {
  const [liveUpdates, setLiveUpdates] = useState(true);

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-6 h-6 text-rose-500" />
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                Trending Cities
              </h2>
            </div>
            <p className="text-gray-600">
              Real-time intelligence from <span className="font-semibold">102,530 travelers</span> worldwide
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLiveUpdates(!liveUpdates)}
            className={`rounded-full border-2 ${liveUpdates ? 'border-green-500 text-green-600' : 'border-gray-300'}`}
          >
            <Zap className={`w-4 h-4 mr-2 ${liveUpdates ? 'fill-green-500' : ''}`} />
            Live Updates
          </Button>
        </motion.div>

        {/* Cities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cities.map((city, index) => (
            <motion.div
              key={city.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer"
            >
              {/* Image Section */}
              <div className="relative h-48 overflow-hidden">
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Price Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-rose-500 text-white text-sm font-bold flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" />
                    ${city.price}
                  </span>
                  {city.travelers > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-white/90 text-rose-500 text-xs font-medium flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {city.travelers.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* City Info */}
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="text-2xl font-bold text-white">{city.name}</h3>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <MapPin className="w-3 h-3" />
                    {city.country}
                    {city.travelers > 0 && (
                      <>
                        <span className="text-white/50">•</span>
                        <Users className="w-3 h-3" />
                        {city.travelers.toLocaleString()} travelers
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4">
                {/* Seasonal Title */}
                <div className="flex items-start gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                  <h4 className="text-sm font-semibold text-rose-600 line-clamp-2">
                    {city.seasonalTitle}
                  </h4>
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {city.categories.map((cat) => (
                    <span
                      key={cat.label}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${cat.bgColor} ${cat.color}`}
                    >
                      {cat.label}
                    </span>
                  ))}
                  {city.extraCategories > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      +{city.extraCategories}
                    </span>
                  )}
                </div>

                {/* Price & Status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">${city.price}</span>
                    {city.originalPrice && (
                      <span className="text-sm text-gray-400 line-through">
                        ${city.originalPrice}
                      </span>
                    )}
                    <span className="text-xs text-emerald-600 flex items-center">
                      <ArrowUpRight className="w-3 h-3" />
                      {city.discount}%
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${getStatusColor(city.status)}`}>
                    {city.status}
                  </span>
                </div>

                {/* Tip Box */}
                <div className="bg-emerald-50 rounded-xl p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-500 text-lg">💡</span>
                    <p className="text-xs text-emerald-700 line-clamp-3">
                      {city.tip}
                    </p>
                  </div>
                </div>

                {/* Footer Stats */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {city.trendingCount} trending
                  </div>
                  <div className="flex items-center gap-1">
                    <Gem className="w-3 h-3" />
                    {city.gemsCount} gems
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrendingCities;
