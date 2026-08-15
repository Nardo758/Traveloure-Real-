import { useState } from 'react';
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import EnhancedPlanningModal from "@/components/EnhancedPlanningModal";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { CityTickerTape } from "@/components/CityTickerTape";
import { TrendingCities } from "@/components/TrendingCities";
import { ExperienceCard } from "@/components/ui/experience-card";
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
  MapPin,
  Calendar,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.webp";
import { SEOHead } from "@/components/seo-head";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

function formatStat(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M+`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K+`;
  return `${n}+`;
}

// §13: real, admin-curated testimonials only — see GET /api/platform/featured-testimonials
// (server/services/content-query.service.ts:getFeaturedTestimonials). No invented names,
// no invented savings/earnings claims. Renders only fields the API actually returns.
interface FeaturedTestimonial {
  id: string;
  rating: number;
  reviewText: string | null;
  reviewerName: string;
  serviceName: string;
  createdAt: string | null;
}

function TestimonialCard({ testimonial, delay = 0 }: { testimonial: FeaturedTestimonial; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <Card
        className="h-full border border-border bg-background dark:bg-muted/50 shadow-card"
        data-testid={`card-testimonial-${testimonial.id}`}
      >
        <CardContent className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={cn(
                  "w-4 h-4",
                  s <= testimonial.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground",
                )}
              />
            ))}
          </div>
          {testimonial.reviewText && (
            <p className="text-sm text-foreground leading-relaxed flex-1 mb-4" data-testid={`text-testimonial-body-${testimonial.id}`}>
              "{testimonial.reviewText}"
            </p>
          )}
          <div className="mt-auto">
            <p className="text-sm font-semibold text-foreground" data-testid={`text-testimonial-name-${testimonial.id}`}>
              {testimonial.reviewerName}
            </p>
            <p className="text-xs text-muted-foreground">{testimonial.serviceName}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

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

// Experience Categories data
const experienceCategories = [
  {
    icon: Plane,
    label: "Travel",
    description: "Plan your next adventure",
    slug: "travel",
    color: "text-blue-500",
    bgColor: "bg-blue-500",
    categories: [
      { label: 'Adventure', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
      { label: 'Cultural', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
    ],
    tip: "AI-powered itineraries help you plan faster and surface hidden gems that manual research often misses.",
  },
  {
    icon: Heart,
    label: "Weddings",
    description: "Plan the perfect day",
    slug: "wedding",
    color: "text-pink-500",
    bgColor: "bg-pink-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Luxury', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
      { label: 'Planning', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
    ],
    tip: "Expert wedding planners negotiate vendor rates and handle the details so you don't have to.",
  },
  {
    icon: Gem,
    label: "Proposals",
    description: "Make it unforgettable",
    slug: "proposal",
    color: "text-purple-500",
    bgColor: "bg-purple-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Surprise', color: 'text-fuchsia-600 dark:text-fuchsia-400', bgColor: 'bg-fuchsia-100 dark:bg-fuchsia-900/30' },
      { label: 'Luxury', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
    ],
    tip: "Local experts coordinate photographers, venues, and backups ensuring every detail is perfect on your big moment.",
  },
  {
    icon: PartyPopper,
    label: "Celebrations",
    description: "Mark special moments",
    slug: "celebrations",
    color: "text-orange-500",
    bgColor: "bg-orange-500",
    categories: [
      { label: 'Party', color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
      { label: 'Fun', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
      { label: 'Social', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
    ],
    tip: "Group celebration experts know the best private venues, activities, and packages for milestone events.",
  },
  {
    icon: Sparkles,
    label: "Date Nights",
    description: "Plan something special",
    slug: "date-night",
    color: "text-red-500",
    bgColor: "bg-red-500",
    categories: [
      { label: 'Romantic', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
      { label: 'Foodie', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
      { label: 'Fun', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
    ],
    tip: "Get insider access to reservation-only spots and surprise experiences that make dates unforgettable.",
  },
  {
    icon: Building2,
    label: "Corporate",
    description: "Team building & events",
    slug: "corporate-events",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-600",
    categories: [
      { label: 'Business', color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-900/30' },
      { label: 'Team Building', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
      { label: 'Networking', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
    ],
    tip: "Corporate event specialists handle venue sourcing, catering coordination, and team activities from start to finish.",
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

export default function LandingPage() {
  const { openSignInModal } = useSignInModal();
  const [planningOpen, setPlanningOpen] = useState(false);

  const { data: currentUser } = useQuery<{ id: string } | null>({ queryKey: ["/api/auth/user"], queryFn: getQueryFn({ on401: "returnNull" }) });

  const { data: platformStats } = useQuery<{
    totalTrips: number; totalUsers: number; totalExperts: number; totalReviews: number; totalCountries: number; avgRating: string;
  }>({ queryKey: ["/api/platform/stats"] });

  // §13 curated testimonial rail: admin-picked real reviews only. Empty (the
  // default, pre-curation state) hides the section entirely — no placeholder,
  // no invented social proof.
  const { data: testimonialsData } = useQuery<{ testimonials: FeaturedTestimonial[] }>({
    queryKey: ["/api/platform/featured-testimonials"],
  });
  const testimonials = testimonialsData?.testimonials ?? [];

  const impactStats = [
    {
      value: platformStats ? formatStat(platformStats.totalTrips) : "0+",
      label: "Trips Planned",
      description: "Itineraries planned on Traveloure so far — from weekend getaways to month-long adventures.",
      icon: MapPin,
      color: "text-primary"
    },
    {
      value: platformStats ? formatStat(platformStats.totalReviews) : "0+",
      label: "Reviews",
      description: "Reviews left by travelers after a completed booking — the only way a review can be written here.",
      icon: Calendar,
      color: "text-emerald-500"
    },
    {
      value: platformStats ? formatStat(platformStats.totalExperts) : "0+",
      label: "Local Experts",
      description: "Local experts reviewed and approved to advise travelers on the platform.",
      icon: Zap,
      color: "text-violet-500"
    },
    {
      value: platformStats ? formatStat(platformStats.totalCountries) : "0+",
      label: "Countries",
      description: "Countries where our experts and providers are currently active.",
      icon: Star,
      color: "text-amber-500"
    },
  ];

  return (
    <>
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
              <Rocket className="w-4 h-4 text-primary" />
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

            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                className="bg-primary hover:bg-[#E0314F] text-white font-semibold px-8 shadow-xl gap-2 min-h-[44px]"
                onClick={() => setPlanningOpen(true)}
                data-testid="button-plan-trip"
              >
                <Sparkles className="w-4 h-4" />
                Plan a Trip with AI
              </Button>
            </div>
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
                      <h2 className="text-xl font-bold text-white">Choose Your Experience</h2>
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
                            className="bg-white/10 border-white/30 text-white gap-1.5 text-xs min-h-[44px] sm:min-h-0"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <Card className="bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/20 to-transparent rounded-bl-full" />
                    <CardContent className="p-4 relative flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shrink-0">
                          <UserCheck className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Local Experts</h3>
                          <p className="text-[10px] text-white/70">Insider guidance from locals</p>
                        </div>
                      </div>
                      <p className="text-xs text-white/80 mb-3 leading-relaxed flex-1">
                        Verified local experts and trip planners who know every hidden gem.
                      </p>
                      <Link href="/experts?role=local_expert">
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold shadow-lg text-xs"
                          data-testid="button-find-expert"
                        >
                          Find an Expert <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                >
                  <Card className="bg-white/10 backdrop-blur-lg border-white/20 shadow-2xl overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-pink-500/20 to-transparent rounded-bl-full" />
                    <CardContent className="p-4 relative flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shrink-0">
                          <Heart className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Plan Your Event</h3>
                          <p className="text-[10px] text-white/70">Weddings, proposals & more</p>
                        </div>
                      </div>
                      <p className="text-xs text-white/80 mb-3 leading-relaxed flex-1">
                        Specialist planners for weddings, proposals, and group celebrations.
                      </p>
                      <Link href="/experts?role=event_planner">
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg text-xs"
                          data-testid="button-plan-event"
                        >
                          Plan your event <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Popular <span className="text-primary">Experiences</span>
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
              How It <span className="text-primary">Works</span>
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
              <Button size="lg" className="bg-primary text-white font-semibold px-8" data-testid="button-get-started-how">
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
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Platform <span className="text-primary">Intelligence</span>
              </h2>
              <span className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-muted-foreground max-w-xl">
              Live numbers from the platform, updated as travelers and experts join
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

      {/* ── Testimonials (§13 curated rail — admin-picked real reviews only; ─ */}
      {/* ── hidden entirely until at least one review is featured) ────────── */}
      {testimonials.length > 0 && (
        <section className="py-16 lg:py-20 bg-card dark:bg-card" data-testid="section-testimonials">
          <div className="container mx-auto px-4 max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                  What Travelers <span className="text-primary">Are Saying</span>
                </h2>
              </div>
              <p className="text-muted-foreground max-w-xl">
                Real reviews from travelers after a completed booking on Traveloure.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((testimonial, idx) => (
                <TestimonialCard key={testimonial.id} testimonial={testimonial} delay={idx * 0.1} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Earn / Partner dual-path CTA ──────────────────────────────────── */}
      <section className="py-16 lg:py-20 bg-gradient-to-br from-teal-700 to-emerald-800 text-white" data-testid="section-earn-cta">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Know a city well? <span className="text-teal-200">Get paid for it.</span>
            </h2>
            <p className="text-teal-100 max-w-xl mx-auto">
              Turn what you know about your city into income on Traveloure.
              Two paths — pick the one that fits.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Link href="/earn?track=provider">
                <div
                  className="rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 p-6 cursor-pointer transition-colors h-full"
                  data-testid="card-earn-local"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-400/30 flex items-center justify-center mb-4">
                    <MapPin className="w-5 h-5 text-teal-100" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Earn as a local</h3>
                  <p className="text-teal-100 text-sm mb-4">
                    Offer tours, transport, photography, and on-the-ground services.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-teal-200">
                    See local offerings <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <Link href="/earn?track=expert">
                <div
                  className="rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 p-6 cursor-pointer transition-colors h-full"
                  data-testid="card-earn-expert"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-400/30 flex items-center justify-center mb-4">
                    <UserCheck className="w-5 h-5 text-teal-100" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Share your expertise</h3>
                  <p className="text-teal-100 text-sm mb-4">
                    Advise travellers, review plans, and coordinate logistics — remotely or in-person.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-teal-200">
                    See expert offerings <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            </motion.div>
          </div>
          <p className="text-center text-teal-200/70 text-xs mt-8">
            Already a partner?{" "}
            <Link href="/earn" className="underline text-teal-200 hover:text-white">
              View all earning options
            </Link>
          </p>
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
              Plan your next trip with local experts and AI
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                className="bg-white text-primary font-semibold px-8 h-12 shadow-xl"
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

    {planningOpen && (
      <EnhancedPlanningModal
        isOpen={planningOpen}
        onClose={() => setPlanningOpen(false)}
        userId={currentUser?.id || ""}
      />
    )}
    </>
  );
}
