import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  Rocket,
  Bot,
  Sparkles,
  Globe,
  Plane,
  Heart,
  Gem,
  Cake,
  Briefcase,
  Star,
  Quote
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.jpg";

const launchCities = [
  { city: "Mumbai", country: "India" },
  { city: "Bogota", country: "Colombia" },
  { city: "Goa", country: "India" },
  { city: "Kyoto", country: "Japan" },
  { city: "Edinburgh", country: "UK" },
];

const heroImages = [lakeImage, lakeImage, lakeImage, lakeImage];

const planOptions = [
  {
    title: "Travel",
    description: "Your perfect vacation with local experts.",
    icon: Plane,
    cta: "Plan Trip",
    href: "/api/login",
  },
  {
    title: "Wedding",
    description: "Your dream ceremony with expert help.",
    icon: Heart,
    cta: "Plan Event",
    href: "/api/login",
  },
  {
    title: "Proposal",
    description: "The perfect moment with expert support.",
    icon: Gem,
    cta: "Plan It",
    href: "/api/login",
  },
  {
    title: "Romance",
    description: "Unforgettable date nights & anniversaries.",
    icon: Sparkles,
    cta: "Romance",
    href: "/api/login",
  },
  {
    title: "Birthday",
    description: "Milestone celebrations made special.",
    icon: Cake,
    cta: "Celebrate",
    href: "/api/login",
  },
  {
    title: "Corporate",
    description: "Team events & retreats made easy.",
    icon: Briefcase,
    cta: "Organize",
    href: "/api/login",
  },
] as const;

const howItWorksSteps = [
  {
    title: "Tell us your plans",
    description: "Share what you're planning and what matters most.",
    step: "1",
  },
  {
    title: "Get matched with experts",
    description: "AI + humans find the perfect local expert for you.",
    step: "2",
  },
  {
    title: "Enjoy your experience",
    description: "Relax while the details come together effortlessly.",
    step: "3",
  },
] as const;

const experts = [
  {
    name: "Marie L.",
    title: "Paris Expert",
    quote: "Helped 100+ travelers discover real Paris.",
    rating: 5,
    reviews: 124,
    image: lakeImage,
  },
  {
    name: "Kenji T.",
    title: "Tokyo Expert",
    quote: "Cultural deep dives & hidden gems.",
    rating: 5,
    reviews: 98,
    image: lakeImage,
  },
  {
    name: "Sofia R.",
    title: "Barcelona",
    quote: "Event planning specialist for unforgettable moments.",
    rating: 5,
    reviews: 156,
    image: lakeImage,
  },
] as const;

const impactStats = [
  { value: "1,000+", label: "Experiences Planned" },
  { value: "500+", label: "Local Experts Worldwide" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "50+", label: "Countries Covered" },
  { value: "24 Hours", label: "AI‑Powered Support" },
  { value: "80%", label: "Time Saved with AI" },
] as const;

const testimonials = [
  { name: "Sarah & Mike", meta: "New York", text: "The best investment for our Paris trip. Marie showed us places we'd never have found alone!", rating: 5 },
  { name: "Jennifer & David", meta: "Chicago", text: "Our wedding planner coordinated everything perfectly. The AI tools saved weeks of work!", rating: 5 },
  { name: "Rachel T.", meta: "Executive Assistant", text: "This platform is a game-changer for managing multiple client events simultaneously.", rating: 5 },
] as const;

export default function LandingPage() {
  const [showBanner, setShowBanner] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  const currentTestimonial = useMemo(
    () => testimonials[currentTestimonialIndex],
    [currentTestimonialIndex]
  );

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
      <section className="w-full py-14 md:py-20 lg:py-24 bg-gradient-to-br from-gray-50 via-white to-primary/5 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* BETA VERSION Badge (top right) */}
          <div className="flex justify-end mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-sm">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="font-semibold text-primary">BETA</span>
              <span className="text-gray-600 dark:text-gray-400">VERSION</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-10 lg:gap-16">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 dark:text-white leading-tight font-display">
              Plan Your Perfect
              <br />
              <span className="text-primary">Life Experiences</span>
            </h1>
            
            <p className="text-gray-600 dark:text-gray-300 mt-6 text-base md:text-lg leading-relaxed">
              From dream vacations to unforgettable weddings — connect with local experts who make it happen, powered by AI.
            </p>

            <div className="mt-6 space-y-3 text-sm md:text-base">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Bot className="w-5 h-5 text-primary" />
                <span className="font-medium">AI + Human Expertise</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="font-medium">Personalized Plans</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Globe className="w-5 h-5 text-primary" />
                <span className="font-medium">Global Network</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/api/login">
                <Button 
                  className="bg-primary hover:bg-primary/90 text-white rounded-lg px-6 font-semibold shadow-sm transition-all"
                  data-testid="button-create-trip"
                >
                  Get Started - Free <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button
                  variant="outline"
                  className="rounded-lg px-6 font-medium border border-gray-300 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  data-testid="button-build-expert"
                >
                  See How It Works
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
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="glass-panel rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-900">Ideas your expert can bring to life</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      <li>• Romantic Paris moments</li>
                      <li>• Beautiful weddings</li>
                      <li>• Adventure destinations</li>
                      <li>• Special celebrations</li>
                    </ul>
                  </div>
                </div>
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
        </div>
      </section>

      {/* What Would You Like to Plan? */}
      <section className="py-14 md:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              What Would You Like to Plan?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
              Pick an experience type and we’ll help you create a blueprint — then match you with the right expert.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {planOptions.map((option, index) => (
              <motion.div
                key={option.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader className="p-6 pb-0">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <option.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="mt-4">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{option.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{option.description}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-4">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary/10 text-primary border border-primary/20" variant="secondary">
                        AI + Experts
                      </Badge>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Fast, guided, and personalized</span>
                    </div>
                  </CardContent>
                  <CardFooter className="p-6 pt-0">
                    <Link href={option.href}>
                      <Button className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg" data-testid={`button-plan-${option.title.toLowerCase()}`}>
                        {option.cta} <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="mt-10">
            <Card className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Not sure? Try our AI planner or browse what’s possible.
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Start with AI, then bring in an expert when you want a human touch.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/explore">
                    <Button variant="outline" className="rounded-lg" data-testid="button-ai-trip-planner">
                      AI Trip Planner
                    </Button>
                  </Link>
                  <Link href="/how-it-works">
                    <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg" data-testid="button-browse-experts">
                      Browse Experts
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-14 md:py-20 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              How It Works
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
              Our AI creates your blueprint — experts add the magic touch.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorksSteps.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">{step.step}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-4">{step.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/api/login">
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg px-8" data-testid="button-how-it-works-cta">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Meet Our Local Experts */}
      <section className="py-14 md:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              Meet Our Local Experts
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3">
              Real people, real expertise, real results.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {experts.map((expert, index) => (
              <motion.div
                key={expert.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
              >
                <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow">
                  <div className="h-40 relative">
                    <img src={expert.image} alt={`${expert.name} profile`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4">
                      <p className="text-white font-semibold">{expert.name}</p>
                      <p className="text-white/80 text-sm">{expert.title}</p>
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 text-amber-500">
                      {Array.from({ length: expert.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-current" />
                      ))}
                      <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">
                        ({expert.reviews})
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed">
                      “{expert.quote}”
                    </p>
                  </CardContent>
                  <CardFooter className="p-6 pt-0">
                    <Link href="/api/login">
                      <Button variant="outline" className="w-full rounded-lg" data-testid={`button-view-profile-${index}`}>
                        View Profile
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/how-it-works">
              <Button variant="ghost" className="text-primary" data-testid="button-browse-all-experts">
                Browse All Experts <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Impact Numbers Section - Clean flat design */}
      <section className="py-14 md:py-20 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              By The Numbers
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3 max-w-xl mx-auto">
              The platform powering experiences planned with AI + experts.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {impactStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="text-center"
                data-testid={`stat-${index}`}
              >
                <p className="text-4xl md:text-5xl font-bold text-primary font-display">{stat.value}</p>
                <h3 className="font-semibold text-gray-900 dark:text-white mt-2 text-lg">{stat.label}</h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Success Stories / Testimonials Section */}
      <section className="py-14 md:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
              What People Say
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-3">
              Stories from travelers, couples, and busy planners.
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
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: currentTestimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-lg md:text-xl text-gray-700 dark:text-gray-300 leading-relaxed italic mt-3">
                  “{currentTestimonial.text}”
                </p>
                <div className="flex items-center gap-4 mt-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg font-display">
                      {currentTestimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {currentTestimonial.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {currentTestimonial.meta}
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

      {/* CTA Section */}
      <section className="py-14 md:py-20 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white font-display">
            Ready To Plan Your Experience?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
            Join thousands who’ve planned with AI + local experts.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
            <Link href="/api/login">
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-lg px-8" data-testid="button-cta-get-started">
                Get Started - Free
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button variant="outline" className="rounded-lg px-8" data-testid="button-cta-browse-experts">
                Browse Experts
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="rounded-lg px-8" data-testid="button-cta-see-pricing">
                See Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
