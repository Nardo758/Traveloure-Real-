import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Rocket,
  Bot,
  Users,
  Sparkles,
  Compass,
  Handshake,
  Plane,
  Star,
  Quote
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.jpg";

const launchCities = [
  { city: "Mumbai", country: "India" },
  { city: "Bogota", country: "Colombia" },
  { city: "Goa", country: "India" },
  { city: "Kyoto", country: "Japan" },
  { city: "Edinburgh", country: "UK" },
];

const accordionSections = [
  {
    id: "let-ai-plan",
    title: "Let Our AI Plan Your Trip",
    content: "AI evaluates countless travel choices for you, comparing flights, hotels, and itineraries to find the perfect match for your budget, schedule, and preferences. Our advanced algorithms analyze millions of options in seconds to create your ideal journey.",
  },
  {
    id: "travel-experts",
    title: "Travel Experts To Help",
    content: "Connect with trusted local experts who know their destinations inside and out. Get insider tips, hidden gems, and personalized recommendations that you won't find in any guidebook.",
  },
  {
    id: "ai-optimization",
    title: "AI Optimization – Perfectly Tailored for You",
    content: "Our AI tailors your trip by optimizing cost, time, and preferences, while providing real-time updates and personalized recommendations. Every detail is fine-tuned to match your travel style.",
  },
  {
    id: "discover-destinations",
    title: "Discover New Destinations",
    content: "From cozy cafés to epic mountain peaks — whether you're an adventurer, foodie, or zen-seeker, your vibe charts the course. Explore destinations that match your personality and interests.",
  },
  {
    id: "partner-with-us",
    title: "Partner With Us",
    content: "Partner with us to amplify your reach in the thriving travel market. Whether you're a content creator, brand, or tourism provider, our platform connects you with passionate travelers worldwide.",
  },
];

const featureCards = [
  { icon: Bot, title: "Let Our AI Plan Your Trip" },
  { icon: Users, title: "Travel Experts To Help" },
  { icon: Sparkles, title: "AI Optimization – Perfectly Tailored for You" },
  { icon: Compass, title: "Discover New Destinations" },
  { icon: Handshake, title: "Partner With Us" },
];

const impactStats = [
  { value: "8M+", label: "Trips Planned", description: "Join the millions who've used our platform to seamlessly plan their journeys—whether it's a weekend getaway or a month-long adventure." },
  { value: "500K+", label: "Custom Itineraries Generated", description: "Half a million unique, tailored itineraries built using real-time preferences and constraints—no two plans are the same." },
  { value: "$500+", label: "Saved on Multi-City Trips", description: "All route optimization and bundled planning reduce spend dramatically, especially for longer or multi-destination travel." },
  { value: "33K+", label: "Reviews Received", description: "With tens of thousands of 5-star reviews, our platform is trusted by travelers worldwide." },
  { value: "200M+", label: "Miles Traveled", description: "Our users have collectively covered over 200 million miles, exploring the world one trip at a time." },
  { value: "100K+", label: "Destinations Explored", description: "From iconic landmarks to hidden gems, our platform has guided travelers to over 100,000 unique destinations." },
];

const testimonials = [
  { name: "Sarah Johnson", location: "New York, USA", text: "The travel expert recommendations made our trip to Portugal truly special. We discovered places we would have never found on our own!" },
  { name: "David Chen", location: "Toronto, Canada", text: "The AI itinerary planning saved me hours of research. It perfectly balanced tourist spots with authentic local experiences." },
  { name: "Maria Rodriguez", location: "Madrid, Spain", text: "As someone who was unsure where to go, the 'Help Me Decide' feature was a game-changer. I ended up with the perfect vacation!" },
  { name: "Liam O'Brien", location: "Dublin, Ireland", text: "The support team helped me even while I was on my trip. That kind of service is rare. Thank you!" },
  { name: "Akira Tanaka", location: "Tokyo, Japan", text: "Affordable, smart, and so easy to use. I don't think I'll ever plan a trip manually again!" },
  { name: "Emma Wilson", location: "London, UK", text: "From booking to exploring, everything was seamless. Best travel planning experience I've ever had!" },
];

const heroImages = [lakeImage, lakeImage, lakeImage, lakeImage];

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showBanner, setShowBanner] = useState(true);
  const [activeAccordion, setActiveAccordion] = useState<string | undefined>(undefined);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const nextTestimonial = () => {
    setCurrentTestimonialIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="flex flex-col font-body">
      {/* Coral Gradient Announcement Banner */}
      {showBanner && (
        <div className="bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-3 px-4 relative">
          <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
            <div className="flex flex-col md:flex-row items-center gap-2 text-center md:text-left flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Join Our Beta Launch in 8 Cities Worldwide</span>
                <span className="hidden md:inline text-white/70">-</span>
                <span className="text-white/90">Limited Expert Spots Available</span>
              </div>
              <div className="text-sm text-white/80">
                <span>Launching in: </span>
                {launchCities.map((loc, i) => (
                  <span key={loc.city}>
                    <span className="font-medium text-white">{loc.city}</span>
                    <span className="text-white/70">- {loc.country}</span>
                    {i < launchCities.length - 1 && <span className="text-white/50"> &nbsp; </span>}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/api/login">
                <Button 
                  variant="outline"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium"
                  data-testid="button-apply-now"
                >
                  Apply Now <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
              <button 
                onClick={() => setShowBanner(false)}
                className="text-white/70 hover:text-white p-1"
                data-testid="button-close-banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section - Two Column Layout */}
      <section className="w-full py-12 md:py-16 lg:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-7xl grid grid-cols-1 lg:grid-cols-2 items-center gap-10 lg:gap-16">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            {/* BETA VERSION Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-sm mb-6">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="font-semibold text-primary">BETA</span>
              <span className="text-gray-600 dark:text-gray-400">VERSION</span>
            </div>

            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 dark:text-white leading-tight font-display">
              Revolutionized Your<br />
              Travel Planning With<br />
              AI & <span className="text-primary">Travel</span> Experts
            </h1>
            
            <p className="text-gray-600 dark:text-gray-300 mt-6 text-base md:text-lg leading-relaxed">
              Experience personalized travel planning with insider knowledge from travel experts, powered by advanced AI.
            </p>

            {/* Beta Notice Badge */}
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm">
              <Badge variant="secondary" className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs">
                BETA
              </Badge>
              <span className="text-gray-600 dark:text-gray-400">New features in development</span>
              <span className="text-gray-400">-</span>
              <span className="text-primary font-medium">Your feedback matters</span>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/api/login">
                <Button 
                  className="bg-primary hover:bg-primary/90 text-white rounded-lg px-6 font-semibold shadow-sm transition-all"
                  data-testid="button-create-trip"
                >
                  Create a New Trip <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  className="rounded-lg px-6 font-medium border border-gray-300 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  data-testid="button-build-expert"
                >
                  Build with an Expert
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  className="rounded-lg px-6 font-medium border border-gray-300 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  data-testid="button-help-decide"
                >
                  Help Me Decide
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right Image - Image Carousel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full flex justify-center lg:justify-end"
          >
            <div className="relative max-w-lg w-full">
              {/* Image Carousel */}
              <div className="relative rounded-2xl overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={currentImageIndex}
                    src={heroImages[currentImageIndex]}
                    alt={`Travel destination ${currentImageIndex + 1}`}
                    className="w-full h-[300px] md:h-[400px] object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    data-testid="img-hero"
                  />
                </AnimatePresence>
              </div>
              {/* Image Indicators */}
              <div className="flex justify-center gap-2 mt-4">
                {heroImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      currentImageIndex === index 
                        ? "bg-primary w-6" 
                        : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
                    )}
                    data-testid={`button-image-indicator-${index}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Icon Cards Section - Simple horizontal layout */}
      <section className="py-10 md:py-14 bg-white dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-wrap justify-center gap-6 md:gap-10">
            {featureCards.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex flex-col items-center text-center group cursor-pointer"
                data-testid={`card-feature-${index}`}
              >
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                  <feature.icon className="w-6 h-6 text-gray-600 dark:text-gray-400 group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 max-w-[140px] leading-tight">
                  {feature.title}
                </h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact Numbers Section - Clean flat design */}
      <section className="py-16 md:py-20 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              Our Impact In Numbers
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 max-w-xl mx-auto">
              Plan your perfect trip with personalized suggestions, easy itineraries, and real-time travel tips.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {impactStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="text-center md:text-left"
                data-testid={`stat-${index}`}
              >
                <p className="text-4xl md:text-5xl font-bold text-primary font-display">{stat.value}</p>
                <h3 className="font-semibold text-gray-900 dark:text-white mt-2 text-lg">{stat.label}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Trusted by travellers worldwide.</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Success Stories / Testimonials Section */}
      <section className="py-16 md:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              Customer Success Stories
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3">
              Hear from travelers who have transformed their travel experiences with our platform.
            </p>
          </div>
          
          <div className="relative">
            {/* Testimonial Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTestimonialIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 md:p-10"
              >
                <p className="text-lg md:text-xl text-gray-700 dark:text-gray-300 leading-relaxed italic">
                  "{testimonials[currentTestimonialIndex].text}"
                </p>
                <div className="flex items-center gap-4 mt-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg font-display">
                      {testimonials[currentTestimonialIndex].name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {testimonials[currentTestimonialIndex].name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {testimonials[currentTestimonialIndex].location}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevTestimonial}
                className="rounded-full text-gray-500 hover:text-primary"
                data-testid="button-prev-testimonial"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-1.5">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTestimonialIndex(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      currentTestimonialIndex === index 
                        ? "bg-primary w-5" 
                        : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
                    )}
                    data-testid={`button-testimonial-indicator-${index}`}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextTestimonial}
                className="rounded-full text-gray-500 hover:text-primary"
                data-testid="button-next-testimonial"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Accordion Sections - Flat Style */}
      <section className="py-10 md:py-14 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 max-w-4xl">
          <Accordion
            type="single"
            collapsible
            value={activeAccordion}
            onValueChange={(value) => setActiveAccordion(value)}
            className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-b border-gray-200 dark:border-gray-700"
          >
            {accordionSections.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-none py-1"
                data-testid={`accordion-${item.id}`}
              >
                <AccordionPrimitive.Header className="flex">
                  <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between py-4 text-left transition-all hover:no-underline [&[data-state=open]>svg]:rotate-180">
                    <span className={cn(
                      "text-base md:text-lg font-semibold transition-colors",
                      activeAccordion === item.id 
                        ? "text-gray-900 dark:text-white" 
                        : "text-gray-700 dark:text-gray-300"
                    )}>
                      {item.title}
                    </span>
                    <ChevronUp className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200" />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionContent className="pb-4 text-gray-600 dark:text-gray-400 text-sm md:text-base leading-relaxed">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Bottom CTA Section with Graphics */}
      <section className="py-16 md:py-24 bg-white dark:bg-gray-900 relative overflow-hidden">
        {/* Decorative Mountain Graphics */}
        <div className="absolute bottom-0 left-0 w-full h-24 opacity-10">
          <svg viewBox="0 0 1440 120" className="w-full h-full fill-gray-500 dark:fill-gray-600">
            <path d="M0,120 L0,80 L200,40 L400,80 L600,20 L800,60 L1000,30 L1200,70 L1440,40 L1440,120 Z" />
          </svg>
        </div>
        
        {/* Decorative Cloud shapes */}
        <div className="absolute top-10 left-[10%] w-20 h-8 bg-gray-200 dark:bg-gray-700 rounded-full opacity-30" />
        <div className="absolute top-20 right-[15%] w-28 h-10 bg-gray-200 dark:bg-gray-700 rounded-full opacity-20" />

        <div className="container mx-auto px-4 max-w-3xl text-center relative z-10">
          {/* Logo/Brand Mark */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Plane className="w-8 h-8 text-primary" />
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white font-display leading-tight">
            Tired Of Complicated Travel Plans?<br />
            Let AI Handle The Hard Part For You
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-4 max-w-xl mx-auto">
            From bookings to hidden gems — experience a new way to travel with our intelligent assistant.
          </p>
          
          <Link href="/api/login">
            <Button 
              size="lg"
              className="mt-8 bg-primary hover:bg-primary/90 text-white rounded-lg px-8 font-semibold shadow-md transition-all"
              data-testid="button-bottom-cta"
            >
              Create a New Trip
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
