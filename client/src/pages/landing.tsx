import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  Map, 
  Compass, 
  Coffee, 
  Briefcase, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Users,
  Bot,
  Globe
} from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const expertiseContent = [
  {
    id: "let-ai-plan",
    title: "Let Our AI Plan Your Trip",
    description: "AI evaluates countless travel choices for you, comparing flights, hotels, and itineraries to find the perfect match for your budget, schedule, and preferences.",
    icon: Sparkles,
    image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "local-expert",
    title: "Travel Experts To Help",
    description: "Connect with trusted experts for insider tips, hidden gems, and real-time assistance.",
    icon: Map,
    image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "ai-optimization",
    title: "AI Optimization – Perfectly Tailored for You",
    description: "Our AI tailors your trip by optimizing cost, time, and preferences, while providing real-time updates and personalized recommendations.",
    icon: Compass,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "discover-destinations",
    title: "Discover New Destinations",
    description: "From cozy cafés to epic peaks — Adventurer, foodie, or zen-seeker? Your vibe charts the course.",
    icon: Coffee,
    image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=800&auto=format&fit=crop"
  },
  {
    id: "partner-with-us",
    title: "Partner With Us",
    description: "Partner with us to amplify your reach in the thriving travel market. Whether you're a content creator, brand, or tourism provider, our platform connects you with passionate travelers.",
    icon: Briefcase,
    image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?q=80&w=800&auto=format&fit=crop"
  },
];

const stats = [
  { value: "10K+", label: "Happy Travelers" },
  { value: "500+", label: "Local Experts" },
  { value: "150+", label: "Destinations" },
  { value: "98%", label: "Satisfaction" },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section 
        className="w-full py-12 md:py-20 relative bg-gradient-to-br from-orange-50 via-white to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
      >
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 items-center gap-10">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Revolutionize Your <br />
              Travel Planning With <br />
              AI & <span className="text-accent">Travel</span> Experts
            </h1>
            <p className="text-muted-foreground mt-6 max-w-md text-sm md:text-base">
              Experience personalized travel planning with insider knowledge from travel experts,
              powered by advanced AI.
            </p>

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

          {/* Right Image */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full rounded-xl overflow-hidden shadow-2xl"
          >
            <img
              src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=800&auto=format&fit=crop"
              alt="Travel Planning"
              className="object-cover w-full h-[300px] md:h-[450px] rounded-xl"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">AI-Powered Planning</p>
                    <p className="text-xs text-muted-foreground">Get personalized itineraries in seconds</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white dark:bg-slate-900 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Accordion Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Why Choose Traveloure?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We combine cutting-edge AI technology with real human expertise to create unforgettable travel experiences.
            </p>
          </div>

          <div className={`grid gap-8 ${activeTab ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-3xl mx-auto'}`}>
            {/* Accordion */}
            <div className="space-y-3">
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
                      activeTab === item.id ? "border-accent shadow-lg" : "border-border"
                    )}
                  >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                          activeTab === item.id ? "bg-accent text-white" : "bg-accent/10 text-accent"
                        )}>
                          <item.icon className="w-5 h-5" />
                        </div>
                        <span className={cn(
                          "font-semibold text-left",
                          activeTab === item.id ? "text-accent" : "text-slate-900 dark:text-white"
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

            {/* Dynamic Image */}
            {activeTab && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl overflow-hidden shadow-xl hidden md:block"
              >
                <img
                  src={expertiseContent.find(e => e.id === activeTab)?.image}
                  alt={expertiseContent.find(e => e.id === activeTab)?.title}
                  className="w-full h-full object-cover min-h-[400px]"
                />
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Plan your perfect trip in just a few simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Tell Us Your Dream",
                description: "Share your destination, dates, budget, and travel preferences.",
                icon: Globe
              },
              {
                step: "02",
                title: "AI Creates Your Plan",
                description: "Our AI generates a personalized itinerary based on your preferences.",
                icon: Bot
              },
              {
                step: "03",
                title: "Connect & Refine",
                description: "Chat with local experts to perfect your travel plans.",
                icon: Users
              }
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative text-center p-8 rounded-2xl bg-muted/50 dark:bg-slate-800"
              >
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-sm font-bold px-4 py-1 rounded-full">
                  Step {item.step}
                </div>
                <div className="w-16 h-16 mx-auto mt-4 mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 relative overflow-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2000&auto=format&fit=crop')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-accent/80 z-10" />
        
        <div className="container mx-auto px-4 relative z-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 max-w-3xl mx-auto">
              Tired Of Complicated Travel Plans? Let AI Handle The Hard Part For You
            </h2>
            <p className="text-white/90 max-w-2xl mx-auto mb-8">
              From bookings to hidden gems — experience a new way to travel with our intelligent assistant.
            </p>
            <Link href="/api/login">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 font-semibold px-8 py-6 rounded-full shadow-lg"
                data-testid="button-cta-create-trip"
              >
                Create a New Trip <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Partner Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">
                Partner With Us
              </h2>
              <p className="text-muted-foreground mb-6">
                Are you a travel expert or a services provider? Join our growing network and connect with travelers from around the world.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/api/login">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-travel-expert">
                    Become a Travel Expert
                  </Button>
                </Link>
                <Link href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="button-service-provider">
                    Join as Service Provider
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=800&auto=format&fit=crop"
                alt="Partners"
                className="rounded-2xl shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
