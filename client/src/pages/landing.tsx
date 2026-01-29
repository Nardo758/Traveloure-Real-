import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { CityTickerTape } from "@/components/CityTickerTape";
import { TrendingCities } from "@/components/TrendingCities";
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
    text: "The travel expert recommendations made our trip to Portugal truly special. We discovered places we would have never found on our own!", 
    author: "Sarah Johnson", 
    location: "New York, USA",
    rating: 5,
    avatar: "SJ"
  },
  { 
    text: "The AI itinerary planning saved me hours of research. It perfectly balanced tourist spots with authentic local experiences.", 
    author: "David Chen", 
    location: "Toronto, Canada",
    rating: 5,
    avatar: "DC"
  },
  { 
    text: "As someone who was unsure where to go, the 'Help Me Decide' feature was a game-changer. I ended up with the perfect vacation!", 
    author: "Maria Rodriguez", 
    location: "Madrid, Spain",
    rating: 5,
    avatar: "MR"
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
  return (
    <div className="flex flex-col min-h-screen bg-background">
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

      <section className="py-16 lg:py-20 bg-card dark:bg-card">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              How <span className="text-[#FF385C]">Traveloure</span> Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Discover everything our platform offers to make your travel planning seamless
            </p>
          </motion.div>

          <Accordion type="single" collapsible className="w-full space-y-3">
            {faqItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <AccordionItem 
                  value={item.id} 
                  className="border border-border rounded-xl overflow-hidden bg-background dark:bg-muted/50 shadow-sm"
                >
                  <AccordionTrigger 
                    className="text-left text-foreground font-medium py-5 px-5 hover:no-underline hover:bg-muted/50 transition-colors gap-3 flex-wrap"
                    data-testid={`accordion-trigger-${item.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-[#FF385C]/10 dark:bg-[#FF385C]/20 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-4 h-4 text-[#FF385C]" />
                      </div>
                      <span>{item.title}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground px-5 pb-5 pt-0">
                    <div className="pl-12">
                      {item.content}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
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
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Our <span className="text-[#FF385C]">Impact</span> In Numbers
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Trusted by travelers worldwide for seamless trip planning experiences
            </p>
          </motion.div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {impactStats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                variants={itemVariants}
              >
                <Card className="h-full border border-border bg-card dark:bg-card shadow-card hover:shadow-card-hover transition-all duration-300" data-testid={`card-stat-${idx}`}>
                  <CardContent className="p-6">
                    <div className={cn("w-12 h-12 rounded-xl bg-muted dark:bg-muted flex items-center justify-center mb-4", stat.color)}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <p className={cn("text-4xl font-bold mb-1", stat.color)}>{stat.value}</p>
                    <p className="text-sm font-semibold text-foreground mb-2">{stat.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{stat.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
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
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Customer <span className="text-emerald-500">Success</span> Stories
            </h2>
            <p className="text-muted-foreground mt-2">
              Hear from travelers who have transformed their travel experiences
            </p>
          </motion.div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {testimonials.map((testimonial, idx) => (
              <motion.div
                key={testimonial.author}
                variants={itemVariants}
              >
                <Card className="h-full border border-border bg-background dark:bg-muted/50 shadow-card hover:shadow-card-hover transition-all duration-300 relative overflow-hidden" data-testid={`card-testimonial-${idx}`}>
                  <div className="absolute top-4 right-4 text-muted-foreground/20">
                    <Quote className="w-12 h-12" />
                  </div>
                  <CardContent className="p-6 relative">
                    <div className="flex gap-1 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star 
                          key={star} 
                          className={cn(
                            "w-4 h-4",
                            star <= testimonial.rating 
                              ? "text-amber-400 fill-amber-400" 
                              : "text-muted-foreground/30"
                          )} 
                        />
                      ))}
                    </div>
                    
                    <p className="text-sm text-foreground leading-relaxed mb-6">
                      "{testimonial.text}"
                    </p>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF385C] to-[#FF8E53] flex items-center justify-center text-white font-semibold text-sm shadow-lg">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{testimonial.author}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {testimonial.location}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
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
              <a href="/api/login" data-testid="link-cta-get-started">
                <Button 
                  size="lg" 
                  className="bg-white text-[#FF385C] font-semibold px-8 h-12 shadow-xl" 
                  data-testid="button-cta-get-started"
                >
                  Get Started - Free
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
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
