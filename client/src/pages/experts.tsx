import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  Star,
  MessageSquare,
  Filter,
  Globe,
  Languages,
  Award,
  Heart,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  Verified,
  Loader2,
  Sparkles,
  Target,
  Home,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExpertCard } from "@/components/expert-card";
import { SEOHead } from "@/components/seo-head";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const destinations = [
  "All Destinations",
  "Paris, France",
  "Tokyo, Japan",
  "Barcelona, Spain",
  "Bali, Indonesia",
  "New York, USA",
  "Rome, Italy",
  "Mumbai, India",
  "Sydney, Australia",
];

const specialties = [
  "All Specialties",
  "Cultural Tours",
  "Adventure Travel",
  "Food & Wine",
  "Luxury Travel",
  "Budget Travel",
  "Wedding Planning",
  "Honeymoon",
  "Family Vacations",
  "Solo Travel",
  "Business Travel",
];

const languages = [
  "All Languages",
  "English",
  "Spanish",
  "French",
  "Japanese",
  "Mandarin",
  "Hindi",
  "Portuguese",
  "German",
  "Italian",
];

const roleLabels: Record<string, string> = {
  travel_expert: "Trip Planners",
  local_expert: "Local Experts",
  event_planner: "Event Planners",
};

export default function ExpertsPage() {
  const [location, navigate] = useLocation();
  const searchString = useSearch();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("All Destinations");
  const [selectedSpecialty, setSelectedSpecialty] = useState("All Specialties");
  const [selectedLanguage, setSelectedLanguage] = useState("All Languages");
  const [selectedExperienceType, setSelectedExperienceType] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    return role && role in roleLabels ? role : "local_expert";
  });
  const [neighbourhoodQuery, setNeighbourhoodQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [sortBy, setSortBy] = useState("recommended");
  const neighbourhoodInputRef = useRef<HTMLInputElement>(null);

  const handleNeighbourhoodChipClick = useCallback((neighbourhood: string) => {
    setNeighbourhoodQuery(neighbourhood);
    setTimeout(() => {
      const el = neighbourhoodInputRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      el.select();
    }, 50);
  }, []);

  const handleRoleChange = useCallback((role: string) => {
    if (!(role in roleLabels)) return;
    setSelectedRole(role);
    if (role !== "local_expert") {
      setNeighbourhoodQuery("");
    }
    const params = new URLSearchParams(searchString);
    if (params.get("role") === role) return;
    params.set("role", role);
    navigate(`${location}?${params.toString()}`);
  }, [searchString, location, navigate]);

  const [favorites, setFavorites] = useState<string[]>([]);

  // Sprint 2.1 plan handoff: the cart's "Find a Trip Planner" link arrives with
  // ?tripId= — carry it into each expert's detail page so the request the
  // traveler makes there shares their trip plan with that expert.
  const handoffTripId = new URLSearchParams(searchString).get("tripId");

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const destParam = params.get("destination");
    const topicParam = params.get("topic");
    const roleParam = params.get("role");
    if (destParam) {
      setSearchQuery(destParam);
      const match = destinations.find(d =>
        d.toLowerCase().startsWith(destParam.toLowerCase().split(",")[0])
      );
      if (match) setSelectedDestination(match);
    }
    if (topicParam) {
      const topicToSpecialty: Record<string, string> = {
        activities: "Cultural Tours",
        flights: "Business Travel",
        hotels: "Luxury Travel",
        transfers: "Adventure Travel",
        "car-rental": "Adventure Travel",
        transport: "Adventure Travel",
        insurance: "Adventure Travel",
        "luggage-storage": "Adventure Travel",
      };
      const specialty = topicToSpecialty[topicParam];
      if (specialty) setSelectedSpecialty(specialty);
    }
    const resolved = roleParam && roleParam in roleLabels ? roleParam : "local_expert";
    setSelectedRole(resolved);
    if (resolved !== "local_expert") {
      setNeighbourhoodQuery("");
    }
  }, [searchString]);

  // Fetch experience types for filtering
  const { data: experienceTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/experience-types"],
  });

  // Fetch role counts (updates when destination or neighbourhood changes)
  const debouncedNeighbourhoodQuery = useDebounce(neighbourhoodQuery, 300);
  const { data: roleCounts, isLoading: isLoadingCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/experts/counts", selectedExperienceType, debouncedNeighbourhoodQuery, selectedDestination],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedExperienceType) params.set("experienceTypeId", selectedExperienceType);
      if (debouncedNeighbourhoodQuery.trim().length >= 2) params.set("neighbourhood", debouncedNeighbourhoodQuery.trim());
      if (selectedDestination !== "All Destinations") params.set("location", selectedDestination);
      const url = params.toString() ? `/api/experts/counts?${params.toString()}` : "/api/experts/counts";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch expert counts");
      return res.json();
    },
  });

  // Fetch experts from API with optional experience type, destination, neighbourhood, and role filter
  const { data: apiExperts = [], isLoading: isLoadingExperts } = useQuery<any[]>({
    queryKey: ["/api/experts", selectedExperienceType, debouncedNeighbourhoodQuery, selectedDestination, selectedRole],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedExperienceType) params.set("experienceTypeId", selectedExperienceType);
      if (debouncedNeighbourhoodQuery.trim().length >= 2) params.set("neighbourhood", debouncedNeighbourhoodQuery.trim());
      if (selectedDestination !== "All Destinations") params.set("location", selectedDestination);
      if (selectedRole) params.set("role", selectedRole);
      const url = params.toString() ? `/api/experts?${params.toString()}` : "/api/experts";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch experts");
      return res.json();
    },
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  // Filter experts by search and language (destination + neighbourhood are handled server-side)
  const filteredExperts = apiExperts.filter((expert: any) => {
    const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.toLowerCase();
    const neighbourhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
    const matchesSearch =
      searchQuery === "" ||
      fullName.includes(searchQuery.toLowerCase()) ||
      expert.specializations?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
      neighbourhoods.some((n: string) => n.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesLanguage =
      selectedLanguage === "All Languages" ||
      expert.expertForm?.languages?.includes(selectedLanguage);

    return matchesSearch && matchesLanguage;
  });

  const sortedExperts = [...filteredExperts].sort((a: any, b: any) => {
    switch (sortBy) {
      case "price-low":
        const aPrice = a.selectedServices?.[0]?.offering?.price || 0;
        const bPrice = b.selectedServices?.[0]?.offering?.price || 0;
        return parseFloat(aPrice) - parseFloat(bPrice);
      case "price-high":
        const aPriceHigh = a.selectedServices?.[0]?.offering?.price || 0;
        const bPriceHigh = b.selectedServices?.[0]?.offering?.price || 0;
        return parseFloat(bPriceHigh) - parseFloat(aPriceHigh);
      default:
        return b.superExpert ? 1 : -1;
    }
  });

  const seo =
    selectedRole === "travel_expert"
      ? {
          title: "Travel Advisors & Trip Planners",
          description:
            "Work with experienced trip planners who handle every detail — itineraries, bookings, and logistics — so you can just enjoy the journey.",
          keywords: ["trip planner", "travel advisor", "custom itinerary", "trip planning service"],
        }
      : selectedRole === "event_planner"
      ? {
          title: "Destination Event Planners",
          description:
            "Specialist event planners for destination weddings, proposals, and group celebrations. Find an expert to make it unforgettable.",
          keywords: ["destination wedding planner", "event planner", "proposal planner", "group celebration"],
        }
      : {
          title: "Local Travel Experts",
          description:
            "Connect with verified local experts who know their destinations inside out. Get personalized recommendations, bookable services, and insider access.",
          keywords: ["local expert", "local guide", "insider travel tips", "personalized travel"],
        };

  return (
    <div className="min-h-screen bg-[var(--earn-ground)]">
      <SEOHead
        title={seo.title}
        description={seo.description}
        keywords={seo.keywords}
        url={selectedRole ? `/experts?role=${selectedRole}` : "/experts"}
      />
      {/* Hero — UNIFIED header band, shared pattern with /discover: centered navy
          title (text-[28px]/3xl) + one-line muted subtitle, then the page's control
          row beneath (here: the role switcher). py-9 = the ratified middle size.
          Change the pattern in BOTH places or not at all. */}
      <section className="bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-9">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-5"
          >
            <h1 className="text-[28px] md:text-3xl font-semibold tracking-tight text-[color:var(--earn-navy)] mb-1.5">
              {selectedRole === "travel_expert"
                ? "Work with a Trip Planner"
                : selectedRole === "event_planner"
                ? "Plan Your Event"
                : "Find Your Perfect Local Expert"}
            </h1>
            <p className="text-[15px] text-[color:var(--earn-muted)] max-w-2xl mx-auto">
              {selectedRole === "travel_expert"
                ? "Experienced trip planners who handle every detail — from itineraries to bookings — so you can just enjoy the journey."
                : selectedRole === "event_planner"
                ? "Specialist event planners for weddings, proposals, and group celebrations. Let an expert make it unforgettable."
                : "Connect with verified local experts who know their destinations inside out. Get personalized recommendations and insider access."}
            </p>
          </motion.div>

          {/* Role Switcher */}
          <motion.div
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex justify-center"
          >
            <div
              className="inline-flex bg-[var(--earn-chip)] rounded-full p-1 gap-1"
              role="tablist"
              aria-label="Expert type"
              data-testid="role-switcher"
            >
              {[
                { role: "local_expert", label: "Local Experts" },
                { role: "travel_expert", label: "Travel Advisors" },
                { role: "event_planner", label: "Event Planners" },
              ].map(({ role, label }) => {
                const count = roleCounts?.[role];
                return (
                  <button
                    key={role}
                    role="tab"
                    aria-selected={selectedRole === role}
                    onClick={() => handleRoleChange(role)}
                    className={cn(
                      "px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-1.5",
                      selectedRole === role
                        ? "bg-[var(--earn-teal)] text-white shadow-sm"
                        : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)]"
                    )}
                    data-testid={`tab-role-${role}`}
                  >
                    {label}
                    {isLoadingCounts ? (
                      <span
                        className={cn(
                          "inline-block w-5 h-4 rounded-full animate-pulse",
                          selectedRole === role ? "bg-white/30" : "bg-black/10"
                        )}
                        data-testid={`skeleton-count-${role}`}
                      />
                    ) : count !== undefined ? (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold leading-none",
                          selectedRole === role
                            ? "bg-white/25 text-white"
                            : "bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                        )}
                        data-testid={`count-${role}`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.div>

        </div>
      </section>

      {/* Filters & Results */}
      <section className="py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Unified Filter Bar */}
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-3 mb-6 shadow-sm">
            {/* Top row: search + destination */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name, destination, or specialty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 border-[#E5E7EB] text-[#111827] text-sm"
                  data-testid="input-search-experts"
                />
              </div>
              <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                <SelectTrigger className="w-full sm:w-44 h-10 border-[#E5E7EB]" data-testid="select-destination">
                  <MapPin className="w-4 h-4 mr-1.5 text-gray-400 flex-shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((dest) => (
                    <SelectItem key={dest} value={dest}>{dest}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bottom row: secondary filters + sort + count */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Select value={selectedExperienceType || "all"} onValueChange={(val) => setSelectedExperienceType(val === "all" ? "" : val)}>
                  <SelectTrigger className="h-9 w-44 border-[#E5E7EB] bg-[#F9FAFB] text-sm" data-testid="select-experience-type">
                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
                    <SelectValue placeholder="Experience Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Experience Types</SelectItem>
                    {experienceTypes.map((exp: any) => (
                      <SelectItem key={exp.id} value={exp.id}>{exp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger className="h-9 w-36 border-[#E5E7EB] bg-[#F9FAFB] text-sm" data-testid="select-language">
                    <Languages className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" />
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedRole === "local_expert" && (
                  <div className="relative">
                    <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                      ref={neighbourhoodInputRef}
                      placeholder="Neighbourhood"
                      value={neighbourhoodQuery}
                      onChange={(e) => setNeighbourhoodQuery(e.target.value)}
                      className="pl-8 h-9 border-[#E5E7EB] bg-[#F9FAFB] w-44 text-sm"
                      data-testid="input-neighbourhood-filter"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-[#6B7280] whitespace-nowrap">
                  {sortedExperts.length} found
                </span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 w-40 border-[#E5E7EB] bg-[#F9FAFB] text-sm" data-testid="select-sort">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="rating">Highest Rated</SelectItem>
                    <SelectItem value="reviews">Most Reviews</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Active Filter Chips */}
          {(selectedDestination !== "All Destinations" || neighbourhoodQuery.trim().length >= 2) && (
            <div className="flex flex-wrap items-center gap-2 mb-5" data-testid="active-filter-chips">
              <span className="text-sm text-[#6B7280] font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Active:
              </span>
              {selectedDestination !== "All Destinations" && (
                <Badge
                  className="flex items-center gap-1 bg-[#FFF1F3] text-[#FF385C] border border-[#FECDD3] px-2.5 py-1 text-xs font-medium rounded-full"
                  data-testid="chip-filter-destination"
                >
                  <MapPin className="w-3 h-3" />
                  {selectedDestination}
                  <button
                    onClick={() => setSelectedDestination("All Destinations")}
                    className="ml-0.5 hover:text-[#E23350] focus:outline-none"
                    data-testid="button-clear-destination-chip"
                    aria-label="Clear destination filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {neighbourhoodQuery.trim().length >= 2 && (
                <Badge
                  className="flex items-center gap-1 bg-[#EEF2FF] text-[#6366F1] border border-[#C7D2FE] px-2.5 py-1 text-xs font-medium rounded-full"
                  data-testid="chip-filter-neighbourhood"
                >
                  <Home className="w-3 h-3" />
                  {neighbourhoodQuery.trim()}
                  <button
                    onClick={() => setNeighbourhoodQuery("")}
                    className="ml-0.5 hover:text-[#4F46E5] focus:outline-none"
                    data-testid="button-clear-neighbourhood-chip"
                    aria-label="Clear neighbourhood filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {selectedDestination !== "All Destinations" && neighbourhoodQuery.trim().length >= 2 && (
                <span className="text-xs text-[#6B7280] italic" data-testid="text-combined-filter-hint">
                  Experts covering {neighbourhoodQuery.trim()} in {selectedDestination}
                </span>
              )}
            </div>
          )}

          {/* Expert Cards Grid */}
          {isLoadingExperts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
              <span className="ml-2 text-[#6B7280]">Loading experts...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedExperts.slice(0, visibleCount).map((expert: any, idx: number) => (
                <motion.div
                  key={expert.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <ExpertCard
                    expert={expert}
                    showServices={true}
                    experienceTypeFilter={selectedExperienceType || undefined}
                    onNeighbourhoodClick={handleNeighbourhoodChipClick}
                    detailQuery={handoffTripId ? `?tripId=${encodeURIComponent(handoffTripId)}` : undefined}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {sortedExperts.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                <Search className="w-8 h-8 text-[#9CA3AF]" />
              </div>
              <h3 className="text-lg font-semibold text-[#111827] mb-2">
                No experts found
              </h3>
              <p className="text-[#6B7280] mb-4">
                Try adjusting your filters or search terms
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedDestination("All Destinations");
                  setSelectedLanguage("All Languages");
                  setSelectedExperienceType("");
                  setNeighbourhoodQuery("");
                }}
                data-testid="button-clear-filters"
              >
                Clear All Filters
              </Button>
            </div>
          )}

          {/* Load More */}
          {sortedExperts.length > visibleCount && (
            <div className="text-center mt-8">
              <Button
                variant="outline"
                size="lg"
                className="border-[#E5E7EB]"
                onClick={() => setVisibleCount(c => c + 12)}
                data-testid="button-load-more"
              >
                Load More Experts
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Become an Expert CTA */}
      {(() => {
        const ctaConfig: Record<string, { heading: string; body: string; cta: string; href: string }> = {
          travel_expert: {
            heading: "Are You a Trip Planner?",
            body: "Help travellers design itineraries and craft unforgettable journeys. Earn money sharing your expertise on the Traveloure platform.",
            cta: "Become a Trip Planner",
            href: "/become-expert?type=travel_expert",
          },
          event_planner: {
            heading: "Are You an Event Planner?",
            body: "Plan weddings, proposals, and group celebrations. Join our network of specialist event planners and reach clients worldwide.",
            cta: "Become an Event Planner",
            href: "/become-expert?type=event_planner",
          },
          local_expert: {
            heading: "Are You a Local Expert?",
            body: "Share your city knowledge, earn money, and help travelers discover the best of your destination. Join our growing community of local guides.",
            cta: "Become a Local Expert",
            href: "/become-expert?type=local_expert",
          },
        };
        const config = ctaConfig[selectedRole] ?? ctaConfig.local_expert;
        return (
          <section className="py-16 bg-white border-t border-[#E5E7EB]">
            <div className="container mx-auto px-4 max-w-4xl text-center">
              <h2 className="text-3xl font-bold text-[#111827] mb-4">
                {config.heading}
              </h2>
              <p className="text-lg text-[#6B7280] mb-8 max-w-2xl mx-auto">
                {config.body}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href={config.href}>
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-white px-8"
                    data-testid="button-become-expert"
                  >
                    {config.cta}
                  </Button>
                </Link>
                <Link href="/earn">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-[#E5E7EB] px-8"
                    data-testid="button-learn-more"
                  >
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
