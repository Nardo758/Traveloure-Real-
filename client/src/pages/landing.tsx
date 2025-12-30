import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Map, 
  Compass, 
  Coffee, 
  Briefcase, 
  ArrowRight,
  Rocket,
  ChevronLeft,
  ChevronRight,
  Quote,
  Mountain,
  Cloud
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const launchCities = [
  { city: "Mumbai", country: "India" },
  { city: "Bogota", country: "Colombia" },
  { city: "Goa", country: "India" },
  { city: "Kyoto", country: "Japan" },
  { city: "Edinburgh", country: "UK" },
];

const heroImages = [
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?q=80&w=800&auto=format&fit=crop",
];

const expertiseContent = [
  {
    id: "let-ai-plan",
    title: "Let Our AI Plan Your Trip",
    description: "AI evaluates countless travel choices for you, comparing flights, hotels, and itineraries to find the perfect match for your budget, schedule, and preferences.",
    icon: Sparkles,
  },
  {
    id: "local-expert",
    title: "Travel Experts To Help",
    description: "Connect with trusted experts for insider tips, hidden gems, and real-time assistance.",
    icon: Map,
  },
  {
    id: "ai-optimization",
    title: "AI Optimization – Perfectly Tailored for You",
    description: "Our AI tailors your trip by optimizing cost, time, and preferences, while providing real-time updates and personalized recommendations.",
    icon: Compass,
  },
  {
    id: "discover-destinations",
    title: "Discover New Destinations",
    description: "From cozy cafés to epic peaks — Adventurer, foodie, or zen-seeker? Your vibe charts the course.",
    icon: Coffee,
  },
  {
    id: "partner-with-us",
    title: "Partner With Us",
    description: "Partner with us to amplify your reach in the thriving travel market. Whether you're a content creator, brand, or tourism provider, our platform connects you with passionate travelers.",
    icon: Briefcase,
  },
];

const impactStats = [
  { 
    value: "8M+", 
    label: "Trips Planned",
    description: "Trusted by travellers worldwide.",
    detail: "Join the millions who've used Traveloure to seamlessly plan their journeys—whether it's a weekend getaway or a month-long adventure."
  },
  { 
    value: "500K+", 
    label: "Custom Itineraries Generated",
    description: "Trusted by travellers worldwide.",
    detail: "Half a million unique, tailored itineraries built using real-time preferences and constraints—no two plans are the same."
  },
  { 
    value: "$500+", 
    label: "Saved on Multi-City Trips",
    description: "Trusted by travellers worldwide.",
    detail: "All route optimization and bundled planning reduce spend dramatically, especially for longer or multi-destination travel."
  },
  { 
    value: "33K+", 
    label: "Reviews Received",
    description: "Trusted by travellers worldwide.",
    detail: "With tens of thousands of 5-star reviews, our platform is trusted by travelers worldwide."
  },
  { 
    value: "200M+", 
    label: "Miles Traveled",
    description: "Trusted by travellers worldwide.",
    detail: "Our users have collectively covered over 200 million miles, exploring the world one trip at a time."
  },
  { 
    value: "100K+", 
    label: "Destinations Explored",
    description: "Trusted by travellers worldwide.",
    detail: "From iconic landmarks to hidden gems, our platform has guided travelers to over 100,000 unique destinations."
  },
];

const testimonials = [
  {
    quote: "The travel expert recommendations made our trip to Portugal truly special. We discovered places we would have never found on our own!",
    name: "Sarah Johnson",
    location: "New York, USA",
    avatar: "SJ"
  },
  {
    quote: "The AI itinerary planning saved me hours of research. It perfectly balanced tourist spots with authentic local experiences.",
    name: "David Chen",
    location: "Toronto, Canada",
    avatar: "DC"
  },
  {
    quote: "As someone who was unsure where to go, the 'Help Me Decide' feature was a game-changer. I ended up with the perfect vacation!",
    name: "Maria Rodriguez",
    location: "Madrid, Spain",
    avatar: "MR"
  },
  {
    quote: "The support team helped me even while I was on my trip. That kind of service is rare. Thank you!",
    name: "Liam O'Brien",
    location: "Dublin, Ireland",
    avatar: "LO"
  },
  {
    quote: "Affordable, smart, and so easy to use. I don't think I'll ever plan a trip manually again!",
    name: "Akira Tanaka",
    location: "Tokyo, Japan",
    avatar: "AT"
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string | undefined>("let-ai-plan");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const nextTestimonial = () => {
    setCurrentTestimonialIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="flex flex-col">
      {/* Beta Announcement Banner */}
      <div className="bg-slate-900 text-white py-3 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-2 text-center text-sm">
          <span className="font-medium">Join Our Beta Launch in 8 Cities Worldwide</span>
          <span className="text-slate-400 hidden md:inline">|</span>
          <span className="text-primary font-medium">Limited Expert Spots Available</span>
        </div>
        <div className="container mx-auto mt-2 text-center">
          <span className="text-slate-400 text-xs">Launching in: </span>
          <span className="text-xs">
            {launchCities.map((loc, i) => (
              <span key={loc.city}>
                <span className="text-white font-medium">{loc.city}</span>
                <span className="text-slate-400">- {loc.country}</span>
                {i < launchCities.length - 1 && <span className="text-slate-600">, </span>}
              </span>
            ))}
          </span>
          <Link href="/api/login">
            <Button 
              variant="ghost" 
              className="text-primary text-xs ml-2 p-0 h-auto"
              data-testid="button-apply-beta"
            >
              Apply Now <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <section className="w-full py-12 md:py-20 relative bg-gradient-to-br from-orange-50 via-white to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 items-center gap-10">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Beta Badge */}
            <div className="flex items-center gap-2 mb-6">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-semibold">
                <Rocket className="w-3 h-3 mr-1" />
                BETA VERSION
              </Badge>
            </div>

            <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Revolutionized Your <br />
              Travel Planning With <br />
              AI & <span className="text-primary">Travel</span> Experts
            </h1>
            <p className="text-muted-foreground mt-6 max-w-md text-sm md:text-base">
              Experience personalized travel planning with insider knowledge from travel experts,
              powered by advanced AI.
            </p>

            {/* Beta Notice */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">BETA</Badge>
              <span>New features in development</span>
              <span className="text-primary">Your feedback matters</span>
            </div>

            <div className="flex flex-wrap gap-4 mt-8">
              <Link href="/api/login">
                <Button 
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-5 rounded-lg text-sm font-semibold"
                  data-testid="button-create-trip"
                >
                  Create a New Trip <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  size="lg"
                  className="px-6 py-5 rounded-lg text-sm font-semibold"
                  data-testid="button-build-expert"
                >
                  Build with an Expert
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  size="lg"
                  className="px-6 py-5 rounded-lg text-sm font-semibold"
                  data-testid="button-help-decide"
                >
                  Help Me Decide
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right Image Carousel - Single Image Slider */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl h-[350px] md:h-[450px]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentImageIndex}
                  src={heroImages[currentImageIndex]}
                  alt={`Travel destination ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover"
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5 }}
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              
              {/* Image Navigation Dots */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {heroImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIndex(i)}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-all",
                      i === currentImageIndex ? "bg-white w-8" : "bg-white/50"
                    )}
                    data-testid={`button-hero-dot-${i}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Accordion Section */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 max-w-4xl">
          <Accordion
            type="single"
            collapsible
            value={activeTab}
            onValueChange={(value) => setActiveTab(value)}
            className="space-y-3"
          >
            {expertiseContent.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className={cn(
                  "rounded-lg bg-white dark:bg-slate-800 border overflow-hidden transition-all",
                  activeTab === item.id ? "border-primary shadow-lg" : "border-border"
                )}
                data-testid={`accordion-${item.id}`}
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                      activeTab === item.id ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    )}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className={cn(
                      "font-semibold text-left",
                      activeTab === item.id ? "text-primary" : "text-slate-900 dark:text-white"
                    )}>
                      {item.title}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 text-muted-foreground">
                  {item.description}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Impact Stats Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Our Impact In Numbers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Plan your perfect trip with personalized suggestions, easy itineraries, and real-time travel tips.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {impactStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-border"
                data-testid={`stat-card-${i}`}
              >
                <div className="text-4xl md:text-5xl font-bold text-primary mb-2">{stat.value}</div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{stat.label}</h3>
                <p className="text-sm text-muted-foreground mb-3">{stat.description}</p>
                <p className="text-xs text-muted-foreground">{stat.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Customer Success Stories
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Hear from travelers who have transformed their travel experiences with our platform.
            </p>
          </div>

          <div className="max-w-3xl mx-auto relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTestimonialIndex}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                className="bg-muted/30 dark:bg-slate-800 rounded-2xl p-8 md:p-12"
              >
                <Quote className="w-10 h-10 text-primary/30 mb-4" />
                <p className="text-lg md:text-xl text-slate-900 dark:text-white mb-6 italic">
                  "{testimonials[currentTestimonialIndex].quote}"
                </p>
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-white">
                      {testimonials[currentTestimonialIndex].avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {testimonials[currentTestimonialIndex].name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {testimonials[currentTestimonialIndex].location}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center gap-4 mt-6">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={prevTestimonial}
                data-testid="button-prev-testimonial"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentTestimonialIndex(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      i === currentTestimonialIndex ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
                    )}
                    data-testid={`button-testimonial-dot-${i}`}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={nextTestimonial}
                data-testid="button-next-testimonial"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Section with Mountain Theme */}
      <section className="relative py-20 md:py-32 bg-gradient-to-b from-sky-100 to-sky-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
        {/* Decorative Clouds */}
        <div className="absolute top-10 left-10 opacity-50">
          <Cloud className="w-16 h-16 text-white" />
        </div>
        <div className="absolute top-20 right-20 opacity-30">
          <Cloud className="w-24 h-24 text-white" />
        </div>
        <div className="absolute top-5 right-40 opacity-40">
          <Cloud className="w-12 h-12 text-white" />
        </div>

        {/* Mountains at bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end pointer-events-none">
          <Mountain className="w-48 h-48 text-slate-700 dark:text-slate-600 opacity-30" />
          <Mountain className="w-64 h-64 text-slate-600 dark:text-slate-500 opacity-40" />
          <Mountain className="w-56 h-56 text-slate-700 dark:text-slate-600 opacity-30" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6">
              <span className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white">TRAVEL</span>
              <span className="text-4xl md:text-5xl font-bold text-primary">OURE</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-6 max-w-3xl mx-auto">
              Tired Of Complicated Travel Plans? Let AI Handle The Hard Part For You
            </h2>
            <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-8">
              From bookings to hidden gems — experience a new way to travel with our intelligent assistant.
            </p>
            <Link href="/api/login">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-6 rounded-full shadow-lg"
                data-testid="button-cta-create-trip"
              >
                Create a New Trip
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
