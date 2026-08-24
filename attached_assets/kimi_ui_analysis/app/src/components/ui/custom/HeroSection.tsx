import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, 
  Calendar, 
  Users, 
  Search,
  ArrowRight,
  Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface HeroSectionProps {
  onSearch?: (searchData: {
    destination: string;
    dates: string;
    guests: number;
  }) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
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

const searchBoxVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: 'easeOut' as const,
      delay: 0.6,
    },
  },
};

export function HeroSection({ onSearch }: HeroSectionProps) {
  const [destination, setDestination] = useState('');
  const [dates, setDates] = useState('');
  const [guests, setGuests] = useState(2);

  const handleSearch = () => {
    onSearch?.({ destination, dates, guests });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80"
          alt="Beautiful mountain landscape"
          className="w-full h-full object-cover"
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-ocean-900/30 via-transparent to-sunset-900/30" />
      </div>

      {/* Floating Elements */}
      <motion.div
        animate={{ y: [0, -15, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-32 right-20 w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-40 left-16 w-12 h-12 rounded-full bg-ocean-400/20 backdrop-blur-sm hidden lg:block"
      />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          {/* Badge */}
          <motion.div variants={itemVariants} className="mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-md text-white text-sm font-medium">
              <Star className="w-4 h-4 text-sunset-400 fill-sunset-400" />
              #1 Travel Planning Platform
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1 
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight"
          >
            Plan Your Perfect
            <span className="block mt-2 bg-gradient-to-r from-ocean-300 via-white to-sunset-300 bg-clip-text text-transparent">
              Journey
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p 
            variants={itemVariants}
            className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10"
          >
            Discover extraordinary destinations, book unique experiences, and create 
            unforgettable memories with AI-powered trip planning.
          </motion.p>

          {/* Stats */}
          <motion.div 
            variants={itemVariants}
            className="flex flex-wrap justify-center gap-8 mb-12"
          >
            {[
              { value: '50K+', label: 'Destinations' },
              { value: '2M+', label: 'Happy Travelers' },
              { value: '4.9', label: 'App Rating' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-white/60">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Search Box */}
          <motion.div
            variants={searchBoxVariants}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Destination */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                    Destination
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ocean-500" />
                    <Input
                      type="text"
                      placeholder="Where to?"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="pl-10 py-3 h-12 border-gray-200 rounded-xl focus:border-ocean-500 focus:ring-ocean-500"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                    Dates
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ocean-500" />
                    <Input
                      type="text"
                      placeholder="Add dates"
                      value={dates}
                      onChange={(e) => setDates(e.target.value)}
                      className="pl-10 py-3 h-12 border-gray-200 rounded-xl focus:border-ocean-500 focus:ring-ocean-500"
                    />
                  </div>
                </div>

                {/* Guests */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                    Guests
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ocean-500" />
                    <select
                      value={guests}
                      onChange={(e) => setGuests(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-3 h-12 border border-gray-200 rounded-xl focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 appearance-none bg-white text-gray-700"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                        <option key={num} value={num}>
                          {num} {num === 1 ? 'Guest' : 'Guests'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search Button */}
                <div className="flex items-end">
                  <Button
                    onClick={handleSearch}
                    className="w-full h-12 gradient-ocean text-white font-semibold rounded-xl hover:shadow-glow transition-all duration-300 group"
                  >
                    <Search className="w-5 h-5 mr-2" />
                    Search
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div 
            variants={itemVariants}
            className="mt-8 flex flex-wrap justify-center gap-3"
          >
            <span className="text-white/60 text-sm">Popular:</span>
            {['Paris', 'Tokyo', 'New York', 'Bali', 'London'].map((city) => (
              <button
                key={city}
                onClick={() => setDestination(city)}
                className="text-white/80 text-sm hover:text-white underline underline-offset-2 transition-colors"
              >
                {city}
              </button>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-white/40 flex justify-center pt-2"
        >
          <div className="w-1.5 h-3 bg-white/60 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  );
}

export default HeroSection;
