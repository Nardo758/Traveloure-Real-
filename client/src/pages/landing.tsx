import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  X,
  Rocket,
  Plane,
  Heart,
  Gem,
  Cake,
  Building2,
  Sparkles,
  Star,
  Users,
  Globe,
  Clock,
  TrendingUp,
  Facebook,
  Instagram,
  Twitter,
  Linkedin
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import lakeImage from "@assets/stock_images/turquoise_lake_with__22a4624c.jpg";

const launchCities = [
  { city: "Mumbai", country: "India" },
  { city: "Bogota", country: "Colombia" },
  { city: "Goa", country: "India" },
  { city: "Kyoto", country: "Japan" },
  { city: "Edinburgh", country: "UK" },
];

const eventTypes = [
  { icon: Plane, title: "TRAVEL", description: "Your perfect vacation with local experts", cta: "Plan Trip", color: "text-blue-600" },
  { icon: Heart, title: "WEDDING", description: "Your dream ceremony with expert help", cta: "Plan Event", color: "text-pink-600" },
  { icon: Gem, title: "PROPOSAL", description: "The perfect moment with expert help", cta: "Plan It", color: "text-purple-600" },
  { icon: Sparkles, title: "ROMANCE", description: "Unforgettable date nights & anniversaries", cta: "Romance", color: "text-red-500" },
  { icon: Cake, title: "BIRTHDAY", description: "Milestone celebrations made special", cta: "Celebrate", color: "text-orange-500" },
  { icon: Building2, title: "CORPORATE", description: "Team events & retreats made easy", cta: "Organize", color: "text-gray-600" },
];

const howItWorks = [
  { step: 1, title: "TELL US YOUR PLANS", description: "Share what you're planning" },
  { step: 2, title: "GET MATCHED WITH EXPERTS", description: "AI + humans find perfect local experts" },
  { step: 3, title: "ENJOY YOUR EXPERIENCE", description: "Relax while experts handle it" },
];

const experts = [
  { name: "Marie L.", location: "Paris Expert", rating: 5, reviews: 124, quote: "Helped 100+ travelers discover real Paris" },
  { name: "Kenji T.", location: "Tokyo Expert", rating: 5, reviews: 98, quote: "Cultural deep dives & hidden gems" },
  { name: "Sofia R.", location: "Barcelona", rating: 5, reviews: 156, quote: "Event planning specialist" },
];

const impactStats = [
  { value: "1,000+", label: "Experiences Planned" },
  { value: "500+", label: "Local Experts Worldwide" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "50+", label: "Countries Covered" },
  { value: "24 Hours", label: "AI-Powered Support" },
  { value: "80%", label: "Time Saved with AI" },
];

const testimonials = [
  { text: "The best investment for our Paris trip. Marie showed us places we'd never have found alone!", author: "Sarah & Mike", location: "New York" },
  { text: "Our wedding planner coordinated everything perfectly. The AI tools saved weeks of work!", author: "Jennifer & David", location: "Chicago" },
  { text: "As an executive assistant, this platform is a game-changer for managing multiple client events simultaneously.", author: "Rachel T.", location: "Executive Assistant" },
];

const heroImages = [lakeImage, lakeImage, lakeImage, lakeImage];

const footerLinks = {
  product: ["Features", "How It Works", "Pricing", "AI Tools"],
  company: ["About", "Careers", "Press", "Blog"],
  support: ["Help Center", "Contact Us", "FAQ", "Terms", "Privacy"],
};

export default function LandingPage() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const nextTestimonial = () => setCurrentTestimonialIndex((prev) => (prev + 1) % testimonials.length);
  const prevTestimonial = () => setCurrentTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB]">
      {/* Coral Gradient Announcement Banner */}
      {showBanner && (
        <div className="bg-gradient-to-r from-[#FF6B6B] via-[#FF8E53] to-[#FF6B6B] text-white py-2.5 px-4">
          <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-2 max-w-6xl">
            <div className="flex flex-col md:flex-row items-center gap-2 text-center md:text-left text-sm">
              <span className="font-semibold">Join Our Beta Launch in 8 Cities Worldwide</span>
              <span className="hidden md:inline text-white/60">|</span>
              <span className="text-white/90">Limited Expert Spots Available</span>
              <span className="hidden lg:inline text-white/60">|</span>
              <span className="hidden lg:flex gap-1 text-white/80">
                {launchCities.map((loc, i) => (
                  <span key={loc.city}>
                    {loc.city}{i < launchCities.length - 1 && ","}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/api/login">
                <Button 
                  size="sm"
                  variant="outline"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20 rounded-full text-xs font-medium h-8"
                  data-testid="button-apply-now"
                >
                  Apply Now <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
              <button 
                onClick={() => setShowBanner(false)}
                className="text-white/70 hover:text-white"
                data-testid="button-close-banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="bg-white py-16 lg:py-24">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Beta Badge */}
              <div className="inline-flex items-center gap-2 bg-[#FFE3E8] text-[#FF385C] px-3 py-1.5 rounded-full text-sm font-medium mb-6">
                <Rocket className="w-4 h-4" />
                BETA VERSION
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-[#111827] leading-[1.1] tracking-tight mb-6">
                Plan Your Perfect<br />
                Life Experiences
              </h1>
              
              <p className="text-lg text-[#6B7280] leading-relaxed mb-6 max-w-lg">
                From dream vacations to unforgettable weddings — connect with local experts who make it happen.
              </p>

              {/* Feature bullets */}
              <div className="flex flex-wrap gap-4 mb-8 text-sm text-[#374151]">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF385C]" /> AI + Human Expertise
                </span>
                <span className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#FF385C]" /> Personalized Plans
                </span>
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#FF385C]" /> Global Network
                </span>
              </div>

              {/* Beta notice */}
              <div className="inline-flex items-center gap-2 bg-[#F3F4F6] border border-[#E5E7EB] px-4 py-2 rounded-lg text-sm text-[#6B7280] mb-6">
                <span className="text-[#FF385C] font-medium">BETA</span>
                <span>New features in development</span>
                <span className="text-[#9CA3AF]">•</span>
                <span>Your feedback matters</span>
              </div>

              {/* CTA Buttons - 3 Main Paths */}
              <div className="flex flex-wrap gap-3">
                <Link href="/browse">
                  <Button 
                    size="lg"
                    className="bg-[#FF385C] hover:bg-[#E23350] text-white font-semibold px-6 h-12"
                    data-testid="button-create-trip"
                  >
                    Create a New Trip <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/experts">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-[#E5E7EB] text-[#374151] font-medium px-6 h-12"
                    data-testid="button-build-with-expert"
                  >
                    Build with an Expert
                  </Button>
                </Link>
                <Link href="/help-me-decide">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-[#E5E7EB] text-[#374151] font-medium px-6 h-12"
                    data-testid="button-help-me-decide"
                  >
                    Help Me Decide
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Right Image Carousel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-2xl overflow-hidden shadow-xl">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={currentImageIndex}
                    src={heroImages[currentImageIndex]}
                    alt="Travel destination"
                    className="w-full h-[350px] lg:h-[420px] object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    data-testid="img-hero"
                  />
                </AnimatePresence>
              </div>
              {/* Image dots */}
              <div className="flex justify-center gap-2 mt-4">
                {heroImages.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      currentImageIndex === idx ? "w-6 bg-[#FF385C]" : "w-2 bg-[#E5E7EB] hover:bg-[#9CA3AF]"
                    )}
                    data-testid={`button-image-dot-${idx}`}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What Would You Like to Plan? */}
      <section className="py-16 lg:py-20 bg-white border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-[#111827] text-center mb-12">
            What Would You Like to Plan?
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            {eventTypes.map((event, idx) => (
              <motion.div
                key={event.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <Link href="/browse">
                  <Card 
                    className="bg-white border border-[#E5E7EB] hover:border-[#FF385C] hover:shadow-lg transition-all cursor-pointer group h-full"
                    data-testid={`card-event-${event.title.toLowerCase()}`}
                  >
                    <CardContent className="p-6 text-center">
                      <div className={cn("w-12 h-12 mx-auto mb-4 rounded-full bg-[#F3F4F6] flex items-center justify-center group-hover:bg-[#FFE3E8] transition-colors", event.color)}>
                        <event.icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-[#111827] mb-2">{event.title}</h3>
                      <p className="text-sm text-[#6B7280] mb-4">{event.description}</p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-[#E5E7EB] text-[#374151] group-hover:bg-[#FF385C] group-hover:text-white group-hover:border-[#FF385C] transition-colors"
                        data-testid={`button-event-${event.title.toLowerCase()}`}
                      >
                        Start Browsing
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Not Sure banner */}
          <div className="bg-[#F3F4F6] rounded-xl p-6 text-center">
            <p className="text-[#374151] mb-4">
              <Sparkles className="w-5 h-5 inline mr-2 text-[#FF385C]" />
              NOT SURE? Try our AI planner or browse local experts
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/ai-assistant">
                <Button className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid="button-ai-planner">
                  AI Trip Planner
                </Button>
              </Link>
              <Link href="/vendors">
                <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-browse-experts">
                  Browse Experts
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 lg:py-20 bg-[#F9FAFB]">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-[#111827] text-center mb-4">
            How It Works
          </h2>
          <p className="text-[#6B7280] text-center mb-12 max-w-xl mx-auto">
            Our AI creates your blueprint, experts add the magic touch
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((item, idx) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="text-center relative"
              >
                {idx < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-[#E5E7EB]">
                    <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                  </div>
                )}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FFE3E8] text-[#FF385C] flex items-center justify-center text-2xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-bold text-[#111827] mb-2">{item.title}</h3>
                <p className="text-sm text-[#6B7280]">{item.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/api/login">
              <Button size="lg" className="bg-[#FF385C] hover:bg-[#E23350] text-white font-semibold px-8" data-testid="button-get-started-free">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Meet Our Local Experts */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-[#111827] text-center mb-4">
            Meet Our Local Experts
          </h2>
          <p className="text-[#6B7280] text-center mb-12">
            Real people, real expertise, real results
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {experts.map((expert, idx) => (
              <motion.div
                key={expert.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
              >
                <Card className="border border-[#E5E7EB] hover:shadow-lg transition-shadow" data-testid={`card-expert-${idx}`}>
                  <CardContent className="p-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#FF385C] to-[#FF8E53] flex items-center justify-center text-white text-2xl font-bold">
                      {expert.name.charAt(0)}
                    </div>
                    <h3 className="font-bold text-[#111827] text-center">{expert.name}</h3>
                    <p className="text-sm text-[#6B7280] text-center mb-2">{expert.location}</p>
                    <div className="flex justify-center items-center gap-1 mb-4">
                      {[...Array(expert.rating)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                      ))}
                      <span className="text-sm text-[#6B7280] ml-1">({expert.reviews})</span>
                    </div>
                    <p className="text-sm text-[#374151] text-center italic mb-4">"{expert.quote}"</p>
                    <Button variant="outline" className="w-full border-[#E5E7EB]" data-testid={`button-view-profile-${idx}`}>
                      View Profile
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/vendors">
              <Button variant="ghost" className="text-[#FF385C] font-semibold hover:bg-transparent hover:text-[#E23350]" data-testid="button-browse-all-experts">
                Browse All Experts <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* By The Numbers */}
      <section className="py-16 lg:py-20 bg-[#F9FAFB]">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-[#111827] text-center mb-12">
            By The Numbers
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 lg:gap-8">
            {impactStats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="text-center p-6 bg-white rounded-xl border border-[#E5E7EB]"
                data-testid={`stat-${idx}`}
              >
                <p className="text-3xl md:text-4xl font-bold text-[#FF385C] mb-2">{stat.value}</p>
                <p className="text-sm text-[#6B7280]">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What People Say (Testimonials) */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-[#111827] text-center mb-12">
            What People Say
          </h2>
          
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTestimonialIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border border-[#E5E7EB]">
                  <CardContent className="p-8 md:p-10">
                    <p className="text-lg md:text-xl text-[#374151] leading-relaxed mb-6 text-center">
                      "{testimonials[currentTestimonialIndex].text}"
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#111827]">- {testimonials[currentTestimonialIndex].author}</p>
                        <p className="text-sm text-[#6B7280]">{testimonials[currentTestimonialIndex].location}</p>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} className="w-5 h-5 text-yellow-400 fill-current" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center items-center gap-4 mt-6">
              <Button variant="ghost" size="icon" onClick={prevTestimonial} className="rounded-full" data-testid="button-prev-testimonial">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex gap-2">
                {testimonials.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentTestimonialIndex(idx)}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      currentTestimonialIndex === idx ? "w-4 bg-[#FF385C]" : "w-2 bg-[#E5E7EB]"
                    )}
                    data-testid={`button-testimonial-dot-${idx}`}
                  />
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={nextTestimonial} className="rounded-full" data-testid="button-next-testimonial">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
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
            <Link href="/api/login">
              <Button size="lg" className="bg-white text-[#FF385C] hover:bg-white/90 font-semibold px-8 h-12" data-testid="button-cta-get-started">
                Get Started - Free
              </Button>
            </Link>
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

      {/* Footer */}
      <footer className="py-12 lg:py-16 bg-white border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Logo Column */}
            <div className="col-span-2 md:col-span-1">
              <Link href="/" data-testid="link-home">
                <span className="text-xl font-bold text-[#111827]">Traveloure</span>
              </Link>
              <p className="text-sm text-[#6B7280] mt-3">
                Plan your perfect life experiences with AI and local experts.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-[#111827] mb-4">PRODUCT</h4>
              <ul className="space-y-2">
                {footerLinks.product.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#6B7280] hover:text-[#FF385C]" data-testid={`link-product-${link.toLowerCase().replace(/\s+/g, '-')}`}>{link}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold text-[#111827] mb-4">COMPANY</h4>
              <ul className="space-y-2">
                {footerLinks.company.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#6B7280] hover:text-[#FF385C]" data-testid={`link-company-${link.toLowerCase().replace(/\s+/g, '-')}`}>{link}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-semibold text-[#111827] mb-4">SUPPORT</h4>
              <ul className="space-y-2">
                {footerLinks.support.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-[#6B7280] hover:text-[#FF385C]" data-testid={`link-support-${link.toLowerCase().replace(/\s+/g, '-')}`}>{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-[#E5E7EB]">
            <p className="text-sm text-[#6B7280] mb-4 md:mb-0">
              © 2024 Traveloure LLC. All rights reserved.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-[#6B7280] hover:text-[#FF385C]" data-testid="link-facebook">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="text-[#6B7280] hover:text-[#FF385C]" data-testid="link-instagram">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="text-[#6B7280] hover:text-[#FF385C]" data-testid="link-twitter">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-[#6B7280] hover:text-[#FF385C]" data-testid="link-linkedin">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
