import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  Users, 
  CreditCard, 
  MessageSquare, 
  Globe, 
  Shield, 
  Zap,
  Hotel,
  Utensils,
  Camera,
  Compass,
  Heart,
  Star,
  TrendingUp,
  ArrowRight,
  Bot,
  Wallet,
  Bell,
  Share2,
  Download,
  Languages,
  Accessibility
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const mainFeatures: Feature[] = [
  {
    id: 'ai-planning',
    title: 'AI-Powered Planning',
    description: 'Get personalized itineraries based on your preferences, budget, and travel style. Our AI learns what you love.',
    icon: Bot,
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
  },
  {
    id: 'smart-search',
    title: 'Smart Destination Search',
    description: 'Find perfect destinations with filters for weather, budget, activities, and traveler reviews.',
    icon: Compass,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 'experience-booking',
    title: 'Experience Booking',
    description: 'Book tours, activities, and unique experiences directly through the platform with instant confirmation.',
    icon: Camera,
    color: 'text-rose-600',
    bgColor: 'bg-rose-100',
  },
  {
    id: 'hotel-reservations',
    title: 'Hotel Reservations',
    description: 'Compare prices across platforms and book hotels, resorts, and vacation rentals at the best rates.',
    icon: Hotel,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  {
    id: 'dining-guide',
    title: 'Dining & Restaurant Guide',
    description: 'Discover local cuisine with curated restaurant recommendations and easy table reservations.',
    icon: Utensils,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    id: 'trip-collaboration',
    title: 'Group Trip Planning',
    description: 'Plan trips together with friends and family. Vote on destinations, share ideas, and split costs.',
    icon: Users,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
];

const additionalFeatures: Feature[] = [
  {
    id: 'real-time-prices',
    title: 'Real-Time Price Tracking',
    description: 'Get alerts when prices drop for flights, hotels, and experiences.',
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    id: 'secure-payments',
    title: 'Secure Payments',
    description: 'Multiple payment options with PCI-compliant security and fraud protection.',
    icon: CreditCard,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  {
    id: '24-7-support',
    title: '24/7 Support',
    description: 'Round-the-clock assistance via chat, email, or phone in multiple languages.',
    icon: MessageSquare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    id: 'travel-insurance',
    title: 'Travel Insurance',
    description: 'Comprehensive coverage options for trip cancellation, medical, and baggage.',
    icon: Shield,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  {
    id: 'offline-access',
    title: 'Offline Access',
    description: 'Download your itinerary and access it anywhere, even without internet.',
    icon: Download,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
  {
    id: 'multi-currency',
    title: 'Multi-Currency Support',
    description: 'View prices in your preferred currency with real-time exchange rates.',
    icon: Wallet,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
  },
  {
    id: 'smart-notifications',
    title: 'Smart Notifications',
    description: 'Get timely alerts for check-ins, flight changes, and local recommendations.',
    icon: Bell,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  {
    id: 'social-sharing',
    title: 'Social Sharing',
    description: 'Share your trips and recommendations with friends on social media.',
    icon: Share2,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
  },
  {
    id: 'language-support',
    title: 'Multi-Language',
    description: 'Platform available in 20+ languages for global travelers.',
    icon: Languages,
    color: 'text-sky-600',
    bgColor: 'bg-sky-100',
  },
  {
    id: 'accessibility',
    title: 'Accessibility Features',
    description: 'WCAG-compliant design with screen reader support and keyboard navigation.',
    icon: Accessibility,
    color: 'text-lime-600',
    bgColor: 'bg-lime-100',
  },
  {
    id: 'loyalty-program',
    title: 'Loyalty Rewards',
    description: 'Earn points on every booking and redeem for discounts and perks.',
    icon: Star,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  {
    id: 'fast-checkout',
    title: 'One-Click Checkout',
    description: 'Save your details for lightning-fast bookings on future trips.',
    icon: Zap,
    color: 'text-fuchsia-600',
    bgColor: 'bg-fuchsia-100',
  },
];

const stats = [
  { value: '50K+', label: 'Destinations', icon: Globe },
  { value: '2M+', label: 'Happy Travelers', icon: Heart },
  { value: '500K+', label: 'Experiences', icon: Sparkles },
  { value: '4.9', label: 'App Rating', icon: Star },
];

export function FeaturesShowcase() {
  const [activeTab, setActiveTab] = useState<'main' | 'all'>('main');

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-100 text-ocean-700 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            All-in-One Platform
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Everything You Need to
            <span className="block text-gradient-ocean">Plan the Perfect Trip</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From AI-powered recommendations to seamless booking and 24/7 support, 
            Traveloure has everything you need for unforgettable journeys.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center p-6 rounded-2xl bg-gray-50 hover:bg-ocean-50 transition-colors"
            >
              <stat.icon className="w-8 h-8 text-ocean-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Tab Toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setActiveTab('main')}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'main'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Core Features
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Features
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {(activeTab === 'main' ? mainFeatures : [...mainFeatures, ...additionalFeatures]).map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -4 }}
              className="group p-6 rounded-2xl bg-white border border-gray-100 hover:border-ocean-200 hover:shadow-lg transition-all duration-300"
            >
              <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-ocean-600 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 text-center"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 p-8 rounded-3xl bg-gradient-to-r from-ocean-500 to-ocean-600 text-white">
            <div className="text-left">
              <h3 className="text-xl font-semibold mb-1">Ready to explore all features?</h3>
              <p className="text-ocean-100">Start planning your next adventure today.</p>
            </div>
            <Button
              size="lg"
              className="bg-white text-ocean-600 hover:bg-gray-100 font-semibold rounded-xl px-8"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default FeaturesShowcase;
