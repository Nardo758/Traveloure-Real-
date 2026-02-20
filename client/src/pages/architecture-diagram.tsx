import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plane, Hotel, MapPin, Calendar, Brain, Users, Shield, Database,
  Globe, Search, CreditCard, MessageSquare, BarChart3, Sparkles,
  Car, Compass, Star, Heart, ChevronDown, ChevronRight, Layers,
  Zap, Lock, RefreshCw, Package, Wallet, Bell, FileText,
  Briefcase, UserCheck, TrendingUp, Bot, Eye, ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureNode {
  icon: any;
  label: string;
  description: string;
  color: string;
  children?: string[];
}

interface DiagramSection {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  gradient: string;
  borderColor: string;
  features: FeatureNode[];
}

const sections: DiagramSection[] = [
  {
    id: "trip-planning",
    title: "AI-Powered Trip Planning",
    subtitle: "Core travel planning engine",
    icon: Compass,
    gradient: "from-rose-500/10 to-pink-500/10",
    borderColor: "border-rose-500/30",
    features: [
      {
        icon: Brain,
        label: "AI Itinerary Builder",
        description: "Autonomous trip planning using Grok AI with city intelligence data",
        color: "text-rose-500",
        children: ["Auto-fetches TravelPulse data", "Day-by-day activities, meals, transport", "Customize or send to expert"],
      },
      {
        icon: Sparkles,
        label: "Itinerary Optimizer",
        description: "Smart sequencing with 10+ wellness rules and multi-variant comparison",
        color: "text-rose-500",
        children: ["Spa after adventure, culture in morning", "Balance, wellness, pace, diversity scores", "Traveloure Score badge per variant"],
      },
      {
        icon: TrendingUp,
        label: "TravelPulse Intelligence",
        description: "Real-time city trends with 7-day data, hidden gems, and local insights",
        color: "text-rose-500",
        children: ["Daily AI-generated city intelligence", "Growth %, mention count, trending score", "Plan Now / Add to Multi-City queue"],
      },
      {
        icon: Eye,
        label: "Hidden Gems Discovery",
        description: "12-category local secrets finder powered by Grok AI",
        color: "text-rose-500",
        children: ["Off-the-beaten-path experiences", "Authentic local recommendations", "Category-based filtering"],
      },
    ],
  },
  {
    id: "experience-templates",
    title: "Experience Planning System",
    subtitle: "22+ template types with dynamic tabs and filters",
    icon: Layers,
    gradient: "from-violet-500/10 to-purple-500/10",
    borderColor: "border-violet-500/30",
    features: [
      {
        icon: Plane,
        label: "Flights Tab",
        description: "Real-time flight search via Amadeus with price filtering and sorting",
        color: "text-violet-500",
      },
      {
        icon: Hotel,
        label: "Hotels Tab",
        description: "Hotel search with star rating, amenities, and location-based filtering",
        color: "text-violet-500",
      },
      {
        icon: MapPin,
        label: "Activities Tab",
        description: "Tours, activities, and events from Viator, Fever, and Amadeus POIs",
        color: "text-violet-500",
      },
      {
        icon: Car,
        label: "Transportation Tab",
        description: "AI-generated transport packages with per-leg customization and cost comparison",
        color: "text-violet-500",
        children: ["3 package tiers (Budget, Standard, Premium)", "Per-leg mode switching with live cost updates", "Airport-Hotel-Activity route segments"],
      },
      {
        icon: Calendar,
        label: "Template Types",
        description: "Travel, Wedding, Corporate, Honeymoon, Adventure, Wellness, and 16+ more",
        color: "text-violet-500",
        children: ["Category-specific tabs and filters", "Multi-level filtering system", "Interactive map with provider locations"],
      },
    ],
  },
  {
    id: "booking-payments",
    title: "Booking & Payments",
    subtitle: "End-to-end booking with Stripe integration",
    icon: CreditCard,
    gradient: "from-emerald-500/10 to-green-500/10",
    borderColor: "border-emerald-500/30",
    features: [
      {
        icon: ShoppingCart,
        label: "Cart System",
        description: "Multi-item cart with flights, hotels, activities, and transport packages",
        color: "text-emerald-500",
      },
      {
        icon: CreditCard,
        label: "Stripe Payments",
        description: "Secure payment processing with booking confirmation flow",
        color: "text-emerald-500",
      },
      {
        icon: Wallet,
        label: "Wallet & Credits",
        description: "Credit packages, transaction history, and balance management",
        color: "text-emerald-500",
      },
      {
        icon: FileText,
        label: "Booking Management",
        description: "View bookings, contracts, itineraries with PDF export and calendar sync",
        color: "text-emerald-500",
        children: ["Booking confirmation flow", "My Bookings dashboard", "Final itinerary with Traveloure Score"],
      },
    ],
  },
  {
    id: "experts-providers",
    title: "Experts & Service Providers",
    subtitle: "Local expertise marketplace with logistics coordination",
    icon: UserCheck,
    gradient: "from-amber-500/10 to-yellow-500/10",
    borderColor: "border-amber-500/30",
    features: [
      {
        icon: Users,
        label: "Expert Matching",
        description: "AI-powered matching of travelers with local travel experts",
        color: "text-amber-500",
      },
      {
        icon: MessageSquare,
        label: "Expert Advisor Chat",
        description: "Direct messaging with travel experts for personalized advice",
        color: "text-amber-500",
      },
      {
        icon: Briefcase,
        label: "Provider Dashboard",
        description: "Service management, availability, bookings, earnings, and calendar",
        color: "text-amber-500",
        children: ["Availability management", "Booking request handling", "Revenue analytics"],
      },
      {
        icon: Star,
        label: "Expert Tools Suite",
        description: "Leaderboard, business analytics, templates, and content creation studio",
        color: "text-amber-500",
        children: ["Content Creator Studio (10 types)", "AI-powered title/description generation", "Service recommendation engine"],
      },
    ],
  },
  {
    id: "guest-coordination",
    title: "Guest & Event Coordination",
    subtitle: "Multi-person planning for weddings, reunions, and group events",
    icon: Heart,
    gradient: "from-pink-500/10 to-fuchsia-500/10",
    borderColor: "border-pink-500/30",
    features: [
      {
        icon: Users,
        label: "Guest Invite System",
        description: "Invite guests with personalized travel recommendations per attendee",
        color: "text-pink-500",
      },
      {
        icon: Calendar,
        label: "Coordination Hub",
        description: "Planning lifecycle, vendor availability, state management, and bookings",
        color: "text-pink-500",
      },
      {
        icon: BarChart3,
        label: "Budget Intelligence",
        description: "Cost splitting, currency conversion, and tip calculation",
        color: "text-pink-500",
      },
      {
        icon: Bell,
        label: "Notifications",
        description: "Real-time updates for bookings, RSVP changes, and planning milestones",
        color: "text-pink-500",
      },
    ],
  },
  {
    id: "ai-system",
    title: "Dual AI System",
    subtitle: "Grok (xAI) + Anthropic Claude with intelligent routing",
    icon: Bot,
    gradient: "from-cyan-500/10 to-blue-500/10",
    borderColor: "border-cyan-500/30",
    features: [
      {
        icon: Zap,
        label: "Grok (xAI)",
        description: "Expert matching, city intelligence, content generation, hidden gems discovery",
        color: "text-cyan-500",
      },
      {
        icon: Brain,
        label: "Anthropic Claude",
        description: "Empathetic chat, itinerary optimization, transport analysis, travel advice",
        color: "text-cyan-500",
      },
      {
        icon: RefreshCw,
        label: "AI Orchestrator",
        description: "Intelligent routing between AI providers with fallback logic",
        color: "text-cyan-500",
      },
      {
        icon: BarChart3,
        label: "AI Cost Tracking",
        description: "Platform-wide usage monitoring: provider, model, tokens, costs, response times",
        color: "text-cyan-500",
      },
    ],
  },
  {
    id: "integrations",
    title: "External Integrations",
    subtitle: "Travel APIs, venue search, and affiliate partners",
    icon: Globe,
    gradient: "from-indigo-500/10 to-blue-500/10",
    borderColor: "border-indigo-500/30",
    features: [
      {
        icon: Plane,
        label: "Amadeus Self-Service",
        description: "Flights, hotels, POIs, transfers, tours, and safety ratings",
        color: "text-indigo-500",
      },
      {
        icon: MapPin,
        label: "Viator Partner API",
        description: "Real-time tours and activities with booking capabilities",
        color: "text-indigo-500",
      },
      {
        icon: Calendar,
        label: "Fever Partner API",
        description: "Event discovery and ticketing in global cities",
        color: "text-indigo-500",
      },
      {
        icon: Search,
        label: "SerpAPI & Google Maps",
        description: "Venue searches (restaurants, attractions, nightlife) and route visualization",
        color: "text-indigo-500",
      },
      {
        icon: Car,
        label: "12Go & Affiliates",
        description: "Ground transport bookings, Klook activities, Musement tours",
        color: "text-indigo-500",
      },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure & Security",
    subtitle: "PostgreSQL, caching, authentication, and role-based access",
    icon: Shield,
    gradient: "from-slate-500/10 to-gray-500/10",
    borderColor: "border-slate-500/30",
    features: [
      {
        icon: Database,
        label: "PostgreSQL + Drizzle ORM",
        description: "Core data models, cache tables, affiliate tables, template tables",
        color: "text-slate-500",
      },
      {
        icon: Lock,
        label: "Replit Auth (OIDC)",
        description: "OpenID Connect via Passport.js with PostgreSQL session management",
        color: "text-slate-500",
      },
      {
        icon: Shield,
        label: "Role-Based Access Control",
        description: "Provider, Admin, Executive Assistant, Expert, and User roles",
        color: "text-slate-500",
      },
      {
        icon: RefreshCw,
        label: "Caching & Performance",
        description: "24-hour API caching for hotels, flights, activities with background refreshers",
        color: "text-slate-500",
      },
    ],
  },
];

function FeatureCard({ feature, expanded, onToggle }: { feature: FeatureNode; expanded: boolean; onToggle: () => void }) {
  const Icon = feature.icon;
  const hasChildren = feature.children && feature.children.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-all duration-200",
        hasChildren ? "cursor-pointer hover-elevate" : "",
      )}
      onClick={hasChildren ? onToggle : undefined}
      data-testid={`card-feature-${feature.label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 shrink-0", feature.color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm leading-tight">{feature.label}</h4>
            {hasChildren && (
              expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
          {hasChildren && expanded && (
            <ul className="mt-2 space-y-1">
              {feature.children!.map((child, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className={cn("mt-1.5 h-1 w-1 rounded-full shrink-0", feature.color.replace("text-", "bg-"))} />
                  {child}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ section }: { section: DiagramSection }) {
  const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set());
  const Icon = section.icon;

  const toggleFeature = (index: number) => {
    setExpandedFeatures(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <Card className={cn("border-2 overflow-hidden", section.borderColor)} data-testid={`section-${section.id}`}>
      <CardHeader className={cn("bg-gradient-to-r pb-3", section.gradient)}>
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-background/80 shadow-sm")}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {section.features.map((feature, i) => (
          <FeatureCard
            key={i}
            feature={feature}
            expanded={expandedFeatures.has(i)}
            onToggle={() => toggleFeature(i)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ConnectionLine({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2" data-testid={`connection-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-2">
        <div className="h-px w-8 bg-border" />
        <Badge variant="outline" className="text-[10px] px-2 py-0 font-normal">{label}</Badge>
        <div className="h-px w-8 bg-border" />
      </div>
    </div>
  );
}

export default function ArchitectureDiagram() {
  const dataFlow = [
    { from: "User", action: "searches destination", to: "Experience Templates" },
    { from: "Templates", action: "fetch from", to: "Amadeus, Viator, Fever APIs" },
    { from: "AI System", action: "optimizes", to: "Itineraries & Recommendations" },
    { from: "User", action: "books via", to: "Stripe Payment Processing" },
    { from: "Experts", action: "coordinate via", to: "Chat & Coordination Hub" },
    { from: "System", action: "caches in", to: "PostgreSQL with 24h refresh" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Traveloure Platform Architecture
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
            Core functionality and features of the AI-powered travel planning platform
          </p>
        </div>

        <Card className="mb-8 border-2 border-[#FF385C]/20 bg-gradient-to-r from-[#FF385C]/5 to-transparent" data-testid="section-data-flow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#FF385C]" />
              How It All Connects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dataFlow.map((flow, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" data-testid={`flow-step-${i}`}>
                  <Badge variant="secondary" className="shrink-0 text-xs">{flow.from}</Badge>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">{flow.action}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">{flow.to}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <SectionCard section={sections[0]} />
            <ConnectionLine label="generates itineraries for" />
            <SectionCard section={sections[1]} />
            <ConnectionLine label="items added to cart" />
            <SectionCard section={sections[2]} />
          </div>

          <div className="space-y-6">
            <SectionCard section={sections[3]} />
            <ConnectionLine label="coordinates with" />
            <SectionCard section={sections[4]} />
            <ConnectionLine label="powered by" />
            <SectionCard section={sections[5]} />
          </div>
        </div>

        <div className="mt-6">
          <ConnectionLine label="connected to external services and infrastructure" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <SectionCard section={sections[6]} />
          <SectionCard section={sections[7]} />
        </div>

        <Card className="mt-8 border-dashed" data-testid="section-tech-stack">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Tech Stack Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Frontend</p>
                <div className="flex flex-wrap gap-1.5">
                  {["React 18", "TypeScript", "Vite", "TanStack Query", "Tailwind", "Framer Motion"].map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Backend</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Node.js", "Express", "TypeScript", "Zod", "Passport.js", "Drizzle ORM"].map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">AI</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Grok (xAI)", "Claude (Anthropic)", "AI Orchestrator", "TravelPulse"].map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Data</p>
                <div className="flex flex-wrap gap-1.5">
                  {["PostgreSQL", "Drizzle ORM", "24h Cache", "Stripe", "Replit Auth"].map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
