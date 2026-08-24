import { useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  MapPin, 
  ArrowRight, 
  ArrowLeft,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Destination {
  id: string;
  name: string;
  country: string;
  image: string;
  experiences: number;
  trending?: boolean;
}

const destinations: Destination[] = [
  {
    id: '1',
    name: 'Santorini',
    country: 'Greece',
    image: 'https://images.unsplash.com/photo-1613395877344-13d4c79e4284?w=800&q=80',
    experiences: 245,
    trending: true,
  },
  {
    id: '2',
    name: 'Kyoto',
    country: 'Japan',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80',
    experiences: 189,
    trending: true,
  },
  {
    id: '3',
    name: 'Machu Picchu',
    country: 'Peru',
    image: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=800&q=80',
    experiences: 156,
  },
  {
    id: '4',
    name: 'Bali',
    country: 'Indonesia',
    image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80',
    experiences: 312,
    trending: true,
  },
  {
    id: '5',
    name: 'Paris',
    country: 'France',
    image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
    experiences: 423,
  },
  {
    id: '6',
    name: 'Dubai',
    country: 'UAE',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80',
    experiences: 278,
    trending: true,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: 'easeOut' as const,
    },
  },
};

export function FeaturedDestinations() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScrollability, 300);
    }
  };

  return (
    <section ref={sectionRef} className="section-padding bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10"
        >
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sunset-100 text-sunset-700 text-sm font-medium mb-4">
              <TrendingUp className="w-4 h-4" />
              Trending Now
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Popular Destinations
            </h2>
            <p className="mt-2 text-gray-600 max-w-xl">
              Explore the world's most beloved travel destinations, curated by our community of travelers.
            </p>
          </div>

          {/* Navigation Arrows - Desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                canScrollLeft
                  ? 'bg-white shadow-soft hover:shadow-soft-lg text-gray-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                canScrollRight
                  ? 'bg-white shadow-soft hover:shadow-soft-lg text-gray-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </div>
        </motion.div>

        {/* Destinations Grid/Scroll */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          ref={scrollRef}
          onScroll={checkScrollability}
          className="flex gap-6 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {destinations.map((destination) => (
            <motion.div
              key={destination.id}
              variants={itemVariants}
              className="flex-shrink-0 w-72 sm:w-80 group cursor-pointer"
            >
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden">
                {/* Image */}
                <img
                  src={destination.image}
                  alt={destination.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Trending Badge */}
                {destination.trending && (
                  <div className="absolute top-4 left-4">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sunset-500 text-white text-xs font-medium">
                      <TrendingUp className="w-3 h-3" />
                      Trending
                    </span>
                  </div>
                )}

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <div className="flex items-center gap-1 text-white/80 text-sm mb-2">
                    <MapPin className="w-4 h-4" />
                    {destination.country}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {destination.name}
                  </h3>
                  <p className="text-white/70 text-sm">
                    {destination.experiences} experiences
                  </p>

                  {/* Hover CTA */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileHover={{ opacity: 1, y: 0 }}
                    className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Button
                      size="sm"
                      className="bg-white text-gray-900 hover:bg-gray-100"
                    >
                      Explore
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* View All Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center"
        >
          <Button
            variant="outline"
            size="lg"
            className="rounded-xl border-2 border-gray-200 hover:border-ocean-500 hover:text-ocean-600 transition-colors"
          >
            View All Destinations
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

export default FeaturedDestinations;
