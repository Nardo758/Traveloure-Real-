import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  ArrowRight,
  ChevronUp,
  X
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

export default function LandingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showBanner, setShowBanner] = useState(true);
  const [activeAccordion, setActiveAccordion] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  return (
    <div className="flex flex-col">
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
      <section className="w-full py-12 md:py-16 lg:py-20 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 items-center gap-10 lg:gap-16">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
              Revolutionized Your<br />
              Travel Planning With<br />
              AI & <span className="text-primary">Travel</span> Experts
            </h1>
            
            <p className="text-muted-foreground mt-6 text-base md:text-lg leading-relaxed">
              Experience personalized travel planning with insider knowledge from travel experts, powered by advanced AI.
            </p>

            {/* Beta Notice Badge */}
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-muted/50 dark:bg-slate-800/50 rounded-full text-sm">
              <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                BETA
              </Badge>
              <span className="text-muted-foreground">New features in development</span>
              <span className="text-muted-foreground">-</span>
              <span className="text-primary font-medium">Your feedback matters</span>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/api/login">
                <Button 
                  className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 py-5 text-sm font-semibold shadow-lg shadow-primary/25"
                  data-testid="button-create-trip"
                >
                  Create a New Trip <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  className="rounded-full px-6 py-5 text-sm font-semibold border-slate-300 dark:border-slate-600"
                  data-testid="button-build-expert"
                >
                  Build with an Expert
                </Button>
              </Link>
              <Link href="/explore">
                <Button
                  variant="outline"
                  className="rounded-full px-6 py-5 text-sm font-semibold border-slate-300 dark:border-slate-600"
                  data-testid="button-help-decide"
                >
                  Help Me Decide
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Right Image - Static Lake Image */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full flex justify-center lg:justify-end"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-700 max-w-lg w-full">
              <img
                src={lakeImage}
                alt="Beautiful turquoise lake with boats and mountains"
                className="w-full h-[300px] md:h-[400px] object-cover"
                data-testid="img-hero"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Accordion Sections - Flat Style */}
      <section className="py-8 md:py-12 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 max-w-4xl">
          <Accordion
            type="single"
            collapsible
            value={activeAccordion}
            onValueChange={(value) => setActiveAccordion(value)}
            className="divide-y divide-border border-t border-b"
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
                        ? "text-slate-900 dark:text-white" 
                        : "text-slate-700 dark:text-slate-300"
                    )}>
                      {item.title}
                    </span>
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionContent className="pb-4 text-muted-foreground text-sm md:text-base leading-relaxed">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}
