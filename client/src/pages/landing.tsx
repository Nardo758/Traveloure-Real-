import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { CityTickerTape } from "@/components/CityTickerTape";
import { TrendingCities } from "@/components/TrendingCities";
import { ExperienceCard } from "@/components/ui/experience-card";
import { TestimonialCard } from "@/components/ui/testimonial-card";
import { StatCard } from "@/components/ui/stat-card";
import { 
  ArrowRight,
  Rocket,
  Plane,
  Heart,
  Gem,
  Cake,
  Building2,
  Sparkles,
  Star,
  Globe,
  Users,
  CalendarHeart,
  Mountain,
  Baby,
  GraduationCap,
  Diamond,
  Home,
  PartyPopper,
  Trophy,
  HandHeart,
  TreePine,
  Bot,
  UserCheck,
  Wine,
  HeartHandshake,
  Zap,
  ChevronRight,
  Quote,
  MapPin,
  Calendar,
  Shield,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  Award
} from "lucide-react";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.jpg";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SEOHead } from "@/components/seo-head";
import { useSignInModal } from "@/contexts/SignInModalContext";

const experienceTemplates = [
  { icon: Plane, label: "Travel", slug: "travel", color: "text-blue-500", bgColor: "bg-blue-500/10 dark:bg-blue-500/20" },
  { icon: Heart, label: "Wedding", slug: "wedding", color: "text-pink-500", bgColor: "bg-pink-500/10 dark:bg-pink-500/20" },
  { icon: Gem, label: "Proposal", slug: "proposal", color: "text-purple-500", bgColor: "bg-purple-500/10 dark:bg-purple-500/20" },
  { icon: Sparkles, label: "Date Night", slug: "date-night", color: "text-red-500", bgColor: "bg-red-500/10 dark:bg-red-500/20" },
  { icon: Cake, label: "Birthday", slug: "birthday", color: "text-orange-500", bgColor: "bg-orange-500/10 dark:bg-orange-500/20" },
  { icon: PartyPopper, label: "Bachelor/Bachelorette", slug: "bachelor-bachelorette", color: "text-pink-600", bgColor: "bg-pink-600/10 dark:bg-pink-600/20" },
  { icon: HeartHandshake, label: "Anniversary Trip", slug: "anniversary-trip", color: "text-rose-600", bgColor: "bg-rose-600/10 dark:bg-rose-600/20" },
  { icon: Building2, label: "Corporate Events", slug: "corporate-events", color: "text-slate-600 dark:text-slate-400", bgColor: "bg-slate-500/10 dark:bg-slate-500/20" },
  { icon: Users, label: "Reunions", slug: "reunions", color: "text-indigo-500", bgColor: "bg-indigo-500/10 dark:bg-indigo-500/20" },
  { icon: CalendarHeart, label: "Wedding Anniversaries", slug: "wedding-anniversaries", color: "text-rose-500", bgColor: "bg-rose-500/10 dark:bg-rose-500/20" },
  { icon: Mountain, label: "Retreats", slug: "retreats", color: "text-emerald-500", bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20" },
  { icon: Baby, label: "Baby Shower", slug: "baby-shower", color: "text-sky-400", bgColor: "bg-sky-400/10 dark:bg-sky-400/20" },
  { icon: GraduationCap, label: "Graduation Party", slug: "graduation-party", color: "text-amber-500", bgColor: "bg-amber-500/10 dark:bg-amber-500/20" },
  { icon: Diamond, label: "Engagement Party", slug: "engagement-party", color: "text-fuchsia-500", bgColor: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20" },
  { icon: Home, label: "Housewarming Party", slug: "housewarming-party", color: "text-teal-500", bgColor: "bg-teal-500/10 dark:bg-teal-500/20" },
  { icon: Wine, label: "Retirement Party", slug: "retirement-party", color: "text-violet-500", bgColor: "bg-violet-500/10 dark:bg-violet-500/20" },
  { icon: Trophy, label: "Career Achievement Party", slug: "career-achievement-party", color: "text-yellow-500", bgColor: "bg-yellow-500/10 dark:bg-yellow-500/20" },
  { icon: HandHeart, label: "Farewell Party", slug: "farewell-party", color: "text-cyan-500", bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20" },
  { icon: TreePine, label: "Holiday Party", slug: "holiday-party", color: "text-green-600", bgColor: "bg-green-600/10 dark:bg-green-600/20" },
];

const keyFeatures = [
  { icon: Bot, label: "AI Trip Planner", description: "Instant personalized itineraries powered by AI", href: "/ai-assistant", gradient: "from-[#FF385C] to-[#FF8E53]" },
  { icon: UserCheck, label: "Expert Matching", description: "Connect with local specialists who know every hidden gem", href: "/experts", gradient: "from-emerald-500 to-teal-500" },
  { icon: Zap, label: "Live Intel", description: "Real-time local insights and spontaneous opportunities", href: "/spontaneous", gradient: "from-violet-500 to-purple-500" },
  { icon: Globe, label: "Discover", description: "Browse curated experiences from around the world", href: "/discover", gradient: "from-ocean-500 to-ocean-600" },
];

// Horizontal features bar data
const platformBenefits = [
  { icon: Bot, label: "AI-Powered Planning", value: "Smart" },
  { icon: Users, label: "Local Experts", value: "160+" },
  { icon: Zap, label: "Real-Time Intel", value: "Live" },
  { icon: Shield, label: "Money-Back Guarantee", value: "100%" },
  { icon: Globe, label: "Global Markets", value: "8" },
];

// Experience Categories data
const experienceCategories = [
  { 
    icon: Plane, 
    label: "Travel", 
    description: "Plan your next adventure",
    image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80",
    trending: 89,
    expertRates: "$75-120/hr",
    hiddenGems: 247,
    slug: "travel",
    color: "text-blue-500",
    bgColor: "bg-blue-500",
    categories: [
      { label: 'Adventure', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
    ],
    status: "Busy" as const,
    tip: "AI-powered itineraries save 15+ hours of planning and find 30% more hidden gems than manual research.",
    activeCount: 247,
    isHot: true,
  },
  { 
    icon: Heart, 
    label: "Weddings", 
    description: "Plan the perfect day",
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80",
    trending: 74,
    expertRates: "$85-150/hr",
    hiddenGems: 67,
    slug: "wedding",
    color: "text-pink-500",
    bgColor: "bg-pink-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Luxury', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
      { label: 'Planning', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
    ],
    status: "Busy" as const,
    tip: "Expert wedding planners negotiate vendor rates, saving couples $3,200 on average vs. booking directly.",
    activeCount: 156,
    isHot: true,
  },
  { 
    icon: Gem, 
    label: "Proposals", 
    description: "Make it unforgettable",
    image: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=600&q=80",
    trending: 68,
    expertRates: "$500-2,500",
    hiddenGems: 89,
    slug: "proposal",
    color: "text-purple-500",
    bgColor: "bg-purple-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Surprise', color: 'text-fuchsia-600 dark:text-fuchsia-400', bgColor: 'bg-fuchsia-100 dark:bg-fuchsia-900/30' },
      { label: 'Luxury', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
    ],
    status: "Moderate" as const,
    tip: "Local experts coordinate photographers, venues, and backups ensuring every detail is perfect on your big moment.",
    activeCount: 45,
    isHot: true,
  },
  { 
    icon: PartyPopper, 
    label: "Celebrations", 
    description: "Mark special moments",
    image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=600&q=80",
    trending: 62,
    expertRates: "$200-1,500",
    hiddenGems: 134,
    slug: "celebrations",
    color: "text-orange-500",
    bgColor: "bg-orange-500",
    categories: [
      { label: 'Party', color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
      { label: 'Fun', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
      { label: 'Social', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
    ],
    status: "Busy" as const,
    tip: "Group celebration experts know the best private venues, activities, and packages for milestone events.",
    activeCount: 189,
    isHot: true,
  },
  { 
    icon: Sparkles, 
    label: "Date Nights", 
    description: "Plan something special",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80",
    trending: 81,
    expertRates: "$50-300",
    hiddenGems: 289,
    slug: "date-night",
    color: "text-red-500",
    bgColor: "bg-red-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
      { label: 'Fun', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
    ],
    status: "Moderate" as const,
    tip: "Get insider access to reservation-only spots and surprise experiences that make dates unforgettable.",
    activeCount: 312,
    isHot: true,
  },
  { 
    icon: Building2, 
    label: "Corporate", 
    description: "Team building & events",
    image: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&q=80",
    trending: 52,
    expertRates: "Custom quote",
    hiddenGems: 45,
    slug: "corporate-events",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-600",
    categories: [
      { label: 'Business', color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-900/30' },
      { label: 'Team Building', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
      { label: 'Networking', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
    ],
    status: "Moderate" as const,
    tip: "Corporate event specialists handle venue sourcing, catering coordination, and team activities from start to finish.",
    activeCount: 78,
  },
];

// How It Works steps
const howItWorksSteps = [
  {
    step: 1,
    title: "Share Your Vision",
    description: "Tell us about your dream experience — destination, dates, budget, and preferences.",
    icon: Heart,
    color: "from-[#FF385C] to-[#FF6B6B]"
  },
  {
    step: 2,
    title: "Get Matched",
    description: "Our AI matches you with verified local experts who specialize in your experience type.",
    icon: Users,
    color: "from-emerald-500 to-teal-500"
  },
  {
    step: 3,
    title: "Plan Together",
    description: "Collaborate with your expert using AI tools, real-time intel, and insider knowledge.",
    icon: Sparkles,
    color: "from-violet-500 to-purple-500"
  },
  {
    step: 4,
    title: "Experience It",
    description: "Enjoy your perfectly planned experience with on-trip support when you need it.",
    icon: Star,
    color: "from-amber-500 to-orange-500"
  },
];

const faqItems = [
  {
    id: "ai-plan",
    title: "Let Our AI Plan Your Trip",
    content: (
      <div className="space-y-3">
        <p>Our advanced AI analyzes your preferences, budget, and travel style to create personalized itineraries tailored just for you.</p>
        <ul className="list-disc list-inside space-y-1.5 text-sm">
          <li><strong>Smart Itinerary Building:</strong> Tell us your dates, interests, and budget—our AI crafts day-by-day plans in seconds</li>
          <li><strong>Hidden Gem Discovery:</strong> Powered by real traveler data and local insights to find spots tourists often miss</li>
          <li><strong>Schedule Optimization:</strong> Routes are automatically optimized to save you time and reduce transit hassles</li>
          <li><strong>Real-time Adjustments:</strong> Plans adapt to weather, closures, and your changing preferences</li>
        </ul>
      </div>
    ),
    icon: Bot,
  },
  {
    id: "experts",
    title: "Travel Experts To Help",
    content: (
      <div className="space-y-3">
        <p>Connect with verified local experts who know their destinations inside out. They provide authentic recommendations, handle logistics, and offer real-time support.</p>
        <ul className="list-disc list-inside space-y-1.5 text-sm">
          <li><strong>Verified Locals:</strong> Every expert is vetted for deep destination knowledge and excellent communication</li>
          <li><strong>Direct Chat:</strong> Message your expert anytime for tips, restaurant bookings, or last-minute changes</li>
          <li><strong>Personalized Guidance:</strong> Get custom recommendations based on your travel style—foodie, adventure, culture, or relaxation</li>
          <li><strong>On-Trip Support:</strong> Your expert is available throughout your journey for real-time assistance</li>
        </ul>
      </div>
    ),
    icon: UserCheck,
  },
  {
    id: "ai-optimization",
    title: "AI Optimization - Perfectly Tailored For You",
    content: (
      <div className="space-y-3">
        <p>Our AI continuously learns from your preferences and feedback to refine recommendations and optimize every aspect of your trip.</p>
        <ul className="list-disc list-inside space-y-1.5 text-sm">
          <li><strong>Route Intelligence:</strong> Multi-stop journeys are optimized for the shortest travel time and best connections</li>
          <li><strong>Budget Tracking:</strong> AI monitors your spending and suggests alternatives to stay within budget</li>
          <li><strong>Activity Matching:</strong> Recommendations improve as you rate and interact with suggestions</li>
          <li><strong>Transportation Analysis:</strong> Compare flights, trains, and drives with real-time pricing and duration</li>
        </ul>
      </div>
    ),
    icon: Sparkles,
  },
  {
    id: "destinations",
    title: "Discover New Destinations",
    content: (
      <div className="space-y-3">
        <p>Explore curated destinations handpicked by our experts and AI. From trending hotspots to off-the-beaten-path adventures, find your next perfect getaway.</p>
        <ul className="list-disc list-inside space-y-1.5 text-sm">
          <li><strong>Trending Cities:</strong> See where other travelers are heading with live crowd and pricing data</li>
          <li><strong>Hidden Gems:</strong> Discover authentic local secrets powered by our AI discovery system</li>
          <li><strong>Experience Templates:</strong> Browse 20+ experience types—from romantic getaways to corporate retreats</li>
          <li><strong>Seasonal Insights:</strong> Know the best time to visit with weather, festival, and price trend data</li>
        </ul>
      </div>
    ),
    icon: Globe,
  },
  {
    id: "partner",
    title: "Partner With Us",
    content: (
      <div className="space-y-3">
        <p>Join our network of travel experts, service providers, and local guides. Grow your business while helping travelers create unforgettable experiences.</p>
        <ul className="list-disc list-inside space-y-1.5 text-sm">
          <li><strong>Travel Experts:</strong> Share your destination expertise and earn by helping travelers plan their trips</li>
          <li><strong>Service Providers:</strong> List your hotels, tours, restaurants, and activities to reach global travelers</li>
          <li><strong>AI-Powered Tools:</strong> Access our suite of expert tools including AI assistants and revenue optimization</li>
          <li><strong>Flexible Earnings:</strong> Set your own rates and work on your schedule with full earnings transparency</li>
        </ul>
      </div>
    ),
    icon: Users,
  },
];

const impactStats = [
  { 
    value: "8M+", 
    label: "Trips Planned", 
    description: "Join the millions who've seamlessly planned their journeys—from weekend getaways to month-long adventures.",
    icon: MapPin,
    color: "text-[#FF385C]"
  },
  { 
    value: "500K+", 
    label: "Custom Itineraries", 
    description: "Unique, tailored itineraries built using real-time preferences—no two plans are the same.",
    icon: Calendar,
    color: "text-emerald-500"
  },
  { 
    value: "$500+", 
    label: "Average Savings", 
    description: "AI-route optimization and bundled planning reduce spend dramatically on multi-destination travel.",
    icon: Zap,
    color: "text-violet-500"
  },
  { 
    value: "33K+", 
    label: "5-Star Reviews", 
    description: "With tens of thousands of 5-star reviews, our platform is trusted by travelers worldwide.",
    icon: Star,
    color: "text-amber-500"
  },
];

const testimonials = [
  { 
    text: "Sofia helped us navigate Porto wine country and saved us $2,400 on venue negotiations. Her local connections got us exclusive tastings we never could have found ourselves!", 
    author: "Sarah Johnson", 
    location: "New York, USA",
    rating: 5,
    avatar: "SJ",
    destination: "Porto, Portugal",
    tripType: "Anniversary Trip",
    expertName: "Sofia Costa",
    expertHeatScore: 92,
    valueSaved: "$2,400",
    expertRate: "$65/hr",
    tripImage: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400&q=80"
  },
  { 
    text: "Hiroshi's insider knowledge of Kyoto transformed our cherry blossom trip. We visited secret gardens at sunrise before any tourists arrived. Truly magical!", 
    author: "David Chen", 
    location: "Toronto, Canada",
    rating: 5,
    avatar: "DC",
    destination: "Kyoto, Japan",
    tripType: "Cultural Travel",
    expertName: "Hiroshi Tanaka",
    expertHeatScore: 94,
    valueSaved: "$1,800",
    expertRate: "$120/hr",
    tripImage: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&q=80"
  },
  { 
    text: "Priya made our Mumbai wedding seamless. She coordinated 12 vendors, saved us 3 weeks of planning, and the ceremony was absolutely perfect. Worth every penny!", 
    author: "Maria Rodriguez", 
    location: "Madrid, Spain",
    rating: 5,
    avatar: "MR",
    destination: "Mumbai, India",
    tripType: "Wedding Planning",
    expertName: "Priya Sharma",
    expertHeatScore: 96,
    valueSaved: "$3,200",
    expertRate: "$85/hr",
    tripImage: "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=400&q=80"
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function LandingPage() {
  const { openSignInModal } = useSignInModal();
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <SEOHead 
        title="Home"
        description="Plan unforgettable experiences with Traveloure. From romantic getaways to corporate events, our AI-powered platform connects you with expert travel planners and service providers worldwide."
        keywords={["travel platform", "AI travel planning", "event planning", "vacation booking", "travel services"]}
        url="/"
      />
      <CityTickerTape />

      <section 
        className="relative min-h-[650px] lg:min-h-[750px] flex items-center"
        style={{
          backgroundImage: `url(${lakeImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 max-w-6xl relative z-10 py-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium mb-6 border border-white/20"
            >
              <Rocket className="w-4 h-4 text-[#FF385C]" />
              <span>BETA VERSION</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </motion.div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
              Plan Your Perfect<br />
              <span className="bg-gradient-to-r from-[#FF385C] via-[#FF6B6B] to-[#FF8E53] bg-clip-text text-transparent">
                Life Experiences
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/90 leading-relaxed max-w-2xl mx-auto">
              From dream vacations to unforgettable celebrations — plan it yourself with AI or get personalized help from experts.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Card className="bg-white/10 backdrop-blur-lg border-white/20 h-full shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF385C] to-[#FF8E53] flex items-center justify-center shadow-lg">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Choose Your Experience</h3>
                      <p className="text-sm text-white/70">Start planning with our templates</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
                    {experienceTemplates.map((cat, index) => (
                      <motion.div
                        key={cat.label}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + index * 0.02 }}
                      >
                        <Link href={`/experiences/${cat.slug}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white/10 border-white/30 text-white gap-1.5 text-xs"
                            data-testid={`button-category-${cat.slug}`}
                          >
                            <cat.icon className={cn("w-3.5 h-3.5", cat.color)} />
                            {cat.label}
                          </Button>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="flex flex-col gap-5">
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <Card className="bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/20 to-transparent rounded-bl-full" />
                  <CardContent className="p-5 relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                        <UserCheck className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Plan with an Expert</h3>
                        <p className="text-xs text-white/70">Get personalized guidance from locals</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
                      <span className="flex items-center gap-1.5 text-xs text-white/90 bg-white/10 px-2.5 py-1 rounded-full">
                        <Sparkles className="w-3 h-3 text-emerald-400" /> Local tips
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-white/90 bg-white/10 px-2.5 py-1 rounded-full">
                        <Star className="w-3 h-3 text-emerald-400" /> Personal support
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-white/90 bg-white/10 px-2.5 py-1 rounded-full">
                        <Shield className="w-3 h-3 text-emerald-400" /> Verified experts
                      </span>
                    </div>
                    
                    <Link href="/experts">
                      <Button 
                        size="default"
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-lg"
                        data-testid="button-find-expert"
                      >
                        Find an Expert <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="grid grid-cols-2 gap-3"
              >
                {keyFeatures.map((feature, index) => (
                  <motion.div
                    key={feature.label}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                  >
                    <Link href={feature.href}>
                      <div 
                        className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 hover-elevate cursor-pointer group h-full"
                        data-testid={`link-feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center mb-2 shadow-md",
                          feature.gradient
                        )}>
                          <feature.icon className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-white block mb-1">{feature.label}</span>
                        <p className="text-xs text-white/70 line-clamp-2">{feature.description}</p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <TrendingCities />

      {/* Experience Categories Section */}
      <section className="py-16 lg:py-20 bg-card dark:bg-card">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Popular <span className="text-[#FF385C]">Experiences</span>
              </h2>
            </div>
            <p className="text-muted-foreground max-w-xl">
              Browse our most popular experience categories with expert guidance and AI-powered planning
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {experienceCategories.map((category, index) => (
              <ExperienceCard
                key={category.slug}
                {...category}
                delay={index * 0.05}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 lg:py-20 bg-card dark:bg-card">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              How It <span className="text-[#FF385C]">Works</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From dream to reality in four simple steps
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden lg:block absolute top-16 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-[#FF385C] via-emerald-500 via-violet-500 to-amber-500 opacity-30" />
            
            {howItWorksSteps.map((step, idx) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15 }}
                className="relative"
              >
                <Card className="h-full border border-border bg-background dark:bg-muted/50 shadow-card hover:shadow-card-hover transition-all duration-300 text-center" data-testid={`card-step-${step.step}`}>
                  <CardContent className="p-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-lg",
                      step.color
                    )}>
                      <step.icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-sm font-bold text-muted-foreground">
                      {step.step}
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-10"
          >
            <Link href="/ai-assistant">
              <Button size="lg" className="bg-[#FF385C] text-white font-semibold px-8" data-testid="button-get-started-how">
                Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-muted dark:bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Platform <span className="text-[#FF385C]">Intelligence</span>
              </h2>
              <span className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-muted-foreground max-w-xl">
              Real-time collective intelligence from travelers worldwide
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactStats.map((stat, idx) => (
              <StatCard
                key={stat.label}
                {...stat}
                delay={idx * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-card dark:bg-card">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                <Award className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Success <span className="text-emerald-500">Stories</span>
              </h2>
            </div>
            <p className="text-muted-foreground">
              Real results from <span className="font-semibold text-foreground">102,530+</span> travelers worldwide
            </p>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <TestimonialCard
                key={testimonial.author}
                {...testimonial}
                delay={idx * 0.1}
              />
            ))}
          </div>
          
          {/* Platform Stats Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-muted dark:bg-muted/50 rounded-2xl"
            data-testid="platform-stats-bar"
          >
            <div className="text-center" data-testid="stat-avg-rating">
              <p className="text-2xl font-bold text-[#FF385C]">4.9/5</p>
              <p className="text-xs text-muted-foreground">Average Rating</p>
            </div>
            <div className="text-center" data-testid="stat-reviews">
              <p className="text-2xl font-bold text-foreground">50K+</p>
              <p className="text-xs text-muted-foreground">Reviews</p>
            </div>
            <div className="text-center" data-testid="stat-recommend">
              <p className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">98%</p>
              <p className="text-xs text-muted-foreground">Would Recommend</p>
            </div>
            <div className="text-center" data-testid="stat-travelers">
              <p className="text-2xl font-bold text-foreground">2M+</p>
              <p className="text-xs text-muted-foreground">Happy Travelers</p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gradient-to-br from-[#FF385C] via-[#FF5A5F] to-[#FF8E53] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="container mx-auto px-4 max-w-4xl text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Ready To Plan Your Experience?
            </h2>
            <p className="text-lg md:text-xl text-white/90 mb-8 max-w-xl mx-auto">
              Join thousands who've planned unforgettable trips with local experts and AI
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button 
                size="lg" 
                className="bg-white text-[#FF385C] font-semibold px-8 h-12 shadow-xl" 
                onClick={() => openSignInModal()}
                data-testid="button-cta-get-started"
              >
                Get Started - Free
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Link href="/experts">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-white text-white font-medium px-8 h-12 backdrop-blur-sm" 
                  data-testid="button-cta-browse"
                >
                  Browse Experts
                </Button>
              </Link>
              <Link href="/pricing">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-white text-white font-medium px-8 h-12 backdrop-blur-sm" 
                  data-testid="button-cta-pricing"
                >
                  See Pricing
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
