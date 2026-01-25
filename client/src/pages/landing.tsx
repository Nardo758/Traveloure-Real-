import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { CityTickerTape } from "@/components/CityTickerTape";
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
  Zap
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
  { icon: Plane, label: "Travel", slug: "travel", color: "text-blue-500" },
  { icon: Heart, label: "Wedding", slug: "wedding", color: "text-pink-500" },
  { icon: Gem, label: "Proposal", slug: "proposal", color: "text-purple-500" },
  { icon: Sparkles, label: "Date Night", slug: "date-night", color: "text-red-500" },
  { icon: Cake, label: "Birthday", slug: "birthday", color: "text-orange-500" },
  { icon: PartyPopper, label: "Bachelor/Bachelorette", slug: "bachelor-bachelorette", color: "text-pink-600" },
  { icon: HeartHandshake, label: "Anniversary Trip", slug: "anniversary-trip", color: "text-rose-600" },
  { icon: Building2, label: "Corporate Events", slug: "corporate-events", color: "text-slate-600" },
  { icon: Users, label: "Reunions", slug: "reunions", color: "text-indigo-500" },
  { icon: CalendarHeart, label: "Wedding Anniversaries", slug: "wedding-anniversaries", color: "text-rose-500" },
  { icon: Mountain, label: "Retreats", slug: "retreats", color: "text-emerald-500" },
  { icon: Baby, label: "Baby Shower", slug: "baby-shower", color: "text-sky-400" },
  { icon: GraduationCap, label: "Graduation Party", slug: "graduation-party", color: "text-amber-500" },
  { icon: Diamond, label: "Engagement Party", slug: "engagement-party", color: "text-fuchsia-500" },
  { icon: Home, label: "Housewarming Party", slug: "housewarming-party", color: "text-teal-500" },
  { icon: Wine, label: "Retirement Party", slug: "retirement-party", color: "text-violet-500" },
  { icon: Trophy, label: "Career Achievement Party", slug: "career-achievement-party", color: "text-yellow-500" },
  { icon: HandHeart, label: "Farewell Party", slug: "farewell-party", color: "text-cyan-500" },
  { icon: TreePine, label: "Holiday Party", slug: "holiday-party", color: "text-green-600" },
];

const keyFeatures = [
  { icon: Bot, label: "AI Trip Planner", description: "Instant personalized itineraries", href: "/ai-assistant" },
  { icon: UserCheck, label: "Expert Matching", description: "Connect with local specialists", href: "/experts" },
  { icon: Zap, label: "Live Intel", description: "Real-time local insights", href: "/spontaneous" },
  { icon: Globe, label: "Discover", description: "Browse curated experiences", href: "/discover" },
];

const faqItems = [
  {
    id: "ai-plan",
    title: "Let Our AI Plan Your Trip",
    content: "Our advanced AI analyzes your preferences, budget, and travel style to create personalized itineraries. From suggesting hidden gems to optimizing your schedule, our AI ensures every moment of your trip is perfectly planned."
  },
  {
    id: "experts",
    title: "Travel Experts To Help",
    content: "Connect with verified local experts who know their destinations inside out. They provide authentic recommendations, handle logistics, and offer real-time support throughout your journey."
  },
  {
    id: "ai-optimization",
    title: "AI Optimization - Perfectly Tailored For You",
    content: "Our AI continuously learns from your preferences and feedback to refine recommendations. It optimizes routes, timing, and activities to match your unique travel style."
  },
  {
    id: "destinations",
    title: "Discover New Destinations",
    content: "Explore curated destinations handpicked by our experts and AI. From trending hotspots to off-the-beaten-path adventures, find your next perfect getaway."
  },
  {
    id: "partner",
    title: "Partner With Us",
    content: "Join our network of travel experts, service providers, and local guides. Grow your business while helping travelers create unforgettable experiences."
  },
];

const impactStats = [
  { 
    value: "8M+", 
    label: "Trips Planned", 
    description: "Trusted by travellers worldwide. Join the millions who've used Wanderlog to seamlessly plan their journeys—whether it's a weekend getaway or a month-long adventure."
  },
  { 
    value: "500K+", 
    label: "Custom Itineraries Generated", 
    description: "Trusted by travellers worldwide. Half a million unique, tailored itineraries built using real-time preferences and constraints—no two plans are the same."
  },
  { 
    value: "$500+", 
    label: "Saved on Multi-City Trips", 
    description: "Trusted by travellers worldwide. AI-route optimization and bundled planning reduce spend dramatically, especially for longer or multi-destination travel."
  },
  { 
    value: "33K+", 
    label: "Reviews Received", 
    description: "Trusted by travellers worldwide. With tens of thousands of 5-star reviews, our platform is trusted by travellers worldwide."
  },
];

const testimonials = [
  { 
    text: "The travel expert recommendations made our trip to Portugal truly special. We discovered places we would have never found on our own!", 
    author: "Sarah Johnson", 
    location: "New York, USA",
    rating: 4
  },
  { 
    text: "The AI itinerary planning saved me hours of research. It perfectly balanced tourist spots with authentic local experiences.", 
    author: "David Chen", 
    location: "Toronto, Canada",
    rating: 5
  },
  { 
    text: "As someone who was unsure where to go, the 'Help Me Decide' feature was a game-changer. I ended up with the perfect vacation!", 
    author: "Maria Rodriguez", 
    location: "Madrid, Spain",
    rating: 4
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB]">
      {/* Top Ribbon Announcement Banner with Animated Cities */}
      <CityTickerTape />

      {/* Hero Section with Background Image */}
      <section 
        className="relative min-h-[600px] lg:min-h-[700px] flex items-center"
        style={{
          backgroundImage: `url(${lakeImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark wash overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
        
        <div className="container mx-auto px-4 max-w-6xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            {/* Beta Badge */}
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm font-medium mb-6">
              <Rocket className="w-4 h-4" />
              BETA VERSION
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-white leading-[1.1] tracking-tight mb-4">
              Plan Your Perfect<br />
              Life Experiences
            </h1>
            
            <p className="text-lg text-white/90 leading-relaxed max-w-2xl mx-auto">
              From dream vacations to unforgettable celebrations — plan it yourself with AI or get personalized help from experts.
            </p>
          </motion.div>

          {/* Main Content Grid - Templates left, Expert + Features right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Left Column: Templates Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="bg-white/10 backdrop-blur-md border-white/20 h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Choose Your Experience</h3>
                      <p className="text-sm text-white/70">Start planning with our templates</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-white/80 mb-4">
                    Choose your experience type to get started:
                  </p>

                  {/* Experience Template Buttons */}
                  <div className="flex flex-wrap gap-2 max-h-[320px] overflow-y-auto pr-1">
                    {experienceTemplates.map((cat) => (
                      <Link key={cat.label} href={`/experiences/${cat.slug}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-1.5 text-xs"
                          data-testid={`button-category-${cat.slug}`}
                        >
                          <cat.icon className={cn("w-3.5 h-3.5", cat.color)} />
                          {cat.label}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Right Column: Expert Card + Features Grid stacked */}
            <div className="flex flex-col gap-4">
              {/* Plan with Expert Card - Compact */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="bg-white/10 backdrop-blur-md border-white/20">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
                        <UserCheck className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Plan with an Expert</h3>
                        <p className="text-xs text-white/70">Get personalized guidance</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-white/80">
                      <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-emerald-400" /> Local tips</span>
                      <span className="flex items-center gap-1"><Star className="w-3 h-3 text-emerald-400" /> Personal support</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-emerald-400" /> Real-time help</span>
                    </div>
                    
                    <Link href="/experts">
                      <Button 
                        size="default"
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
                        data-testid="button-find-expert"
                      >
                        Find an Expert <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Key Features Grid - 2x2 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <div className="grid grid-cols-2 gap-3">
                  {keyFeatures.map((feature) => (
                    <Link key={feature.label} href={feature.href}>
                      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-md p-3 hover:bg-white/20 transition-colors cursor-pointer group h-full">
                        <div className="flex items-center gap-2 mb-1">
                          <feature.icon className="w-4 h-4 text-[#FF385C]" />
                          <span className="text-sm font-semibold text-white">{feature.label}</span>
                        </div>
                        <p className="text-xs text-white/70 group-hover:text-white/90 transition-colors">{feature.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Accordion FAQ Section (Expert Section) */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item) => (
              <AccordionItem key={item.id} value={item.id} className="border-b border-[#E5E7EB]">
                <AccordionTrigger 
                  className="text-left text-[#111827] font-medium py-5 hover:no-underline"
                  data-testid={`accordion-trigger-${item.id}`}
                >
                  {item.title}
                </AccordionTrigger>
                <AccordionContent className="text-[#6B7280] pb-5">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Our Impact In Numbers */}
      <section className="py-16 lg:py-20 bg-[#F9FAFB]">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827]">
              Our <span className="text-[#FF385C]">Impact</span> In Numbers
            </h2>
            <p className="text-[#6B7280] mt-2 max-w-xl">
              Plan your perfect trip with personalized suggestions, easy itineraries, and real-time travel tips.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {impactStats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
              >
                <Card className="h-full border border-[#E5E7EB] bg-white" data-testid={`card-stat-${idx}`}>
                  <CardContent className="p-6">
                    <p className="text-3xl md:text-4xl font-bold text-[#111827] mb-1">{stat.value}</p>
                    <p className="text-sm font-medium text-[#374151] mb-3">{stat.label}</p>
                    <p className="text-xs text-[#6B7280] leading-relaxed">{stat.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-8">
            <div className="w-6 h-2 rounded-full bg-[#10B981]" />
            <div className="w-2 h-2 rounded-full bg-[#E5E7EB]" />
          </div>
        </div>
      </section>

      {/* Customer Success Stories */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827]">
              Customer <span className="text-[#10B981]">Success</span> Stories
            </h2>
            <p className="text-[#6B7280] mt-2">
              Hear from travelers who have transformed their travel experiences with our platform.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
              >
                <Card className="h-full border border-[#E5E7EB] bg-white" data-testid={`card-testimonial-${idx}`}>
                  <CardContent className="p-6">
                    {/* Star rating */}
                    <div className="flex gap-1 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star 
                          key={star} 
                          className={cn(
                            "w-4 h-4",
                            star <= testimonial.rating 
                              ? "text-yellow-400 fill-current" 
                              : "text-gray-300"
                          )} 
                        />
                      ))}
                    </div>
                    
                    <p className="text-sm text-[#374151] leading-relaxed mb-6">
                      {testimonial.text}
                    </p>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF385C] to-[#FF8E53] flex items-center justify-center text-white font-semibold text-sm">
                        {testimonial.author.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-[#111827] text-sm">{testimonial.author}</p>
                        <p className="text-xs text-[#6B7280]">{testimonial.location}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-[#FF385C] to-[#FF8E53] text-white">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready To Plan Your Experience?
          </h2>
          <p className="text-lg text-white/90 mb-8 max-w-xl mx-auto">
            Join thousands who've planned with local experts
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="/api/login">
              <Button size="lg" className="bg-white text-[#FF385C] hover:bg-white/90 font-semibold px-8 h-12" data-testid="button-cta-get-started">
                Get Started - Free
              </Button>
            </a>
            <Link href="/vendors">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 font-medium px-8 h-12" data-testid="button-cta-browse">
                Browse Experts
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 font-medium px-8 h-12" data-testid="button-cta-pricing">
                See Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
