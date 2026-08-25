import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useSearch } from "wouter";
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
// One-source nav-icon map (ruling 2026-08-25-nav-icons) — the masthead tile reads it
// rather than restating the role→glyph mapping; keyed by the nav leaf `name`.
import { NAV_LEAF_ICONS } from "@/components/layout";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Role → the nav leaf name whose earn glyph the masthead tile shows
// (Local Experts→Lamp · Trip Planners→Waypoints · Event Planners→Wine).
const ROLE_NAV_NAME: Record<string, string> = {
  local_expert: "Local Experts",
  travel_expert: "Trip Planners",
  event_planner: "Event Planners",
};

// FIND HELP rail (ruling 2026-08-25-surface-rail) — plain links, current one filled
// navy, replacing the role-pill switcher. The three role links carry live counts and
// the re-homed `tab-role-*` ids (§3.8); Providers is a plain route with no count
// (/api/experts/counts covers the three expert roles only — §13, no invented number).
const FIND_HELP_RAIL: Array<
  | { kind: "route"; label: string; href: string }
  | { kind: "role"; role: string; label: string }
> = [
  { kind: "route", label: "Providers", href: "/providers" },
  { kind: "role", role: "local_expert", label: "Local Experts" },
  { kind: "role", role: "travel_expert", label: "Trip Planners" },
  { kind: "role", role: "event_planner", label: "Event Planners" },
];

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

  // Rail role links are plain links to /experts?role=X (ruling 2026-08-25-surface-rail),
  // but preserve the page's other query params (destination, tripId handoff) so switching
  // role never silently drops filter state (§3.8 preserve).
  const buildRoleHref = useCallback((role: string) => {
    const params = new URLSearchParams(searchString);
    params.set("role", role);
    return `/experts?${params.toString()}`;
  }, [searchString]);

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

  // Audit A8: the default tab was hardcoded to "local_expert" even when it has zero results
  // in the flagship Kyoto market (§12) — a first-time visitor landed on "No experts found"
  // with real data (Trip Planners) one click away. Once real counts arrive, if the CURRENT
  // role (still the hardcoded default — i.e. no explicit ?role= in the URL) has none, switch
  // to the first role that does. An explicit URL/user role choice is never overridden.
  useEffect(() => {
    if (!roleCounts) return;
    if (new URLSearchParams(searchString).get("role")) return;
    if ((roleCounts[selectedRole] ?? 0) > 0) return;
    const roleWithData = Object.keys(roleLabels).find((r) => (roleCounts[r] ?? 0) > 0);
    if (roleWithData && roleWithData !== selectedRole) {
      setSelectedRole(roleWithData);
    }
  }, [roleCounts]);

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

  // Cross-sell shelf (§3.8 "Or start with a trip they already built"): the public
  // Ready-Made feed row carries authorId (§3.2), so filter it client-side to the
  // experts shown on this page — no new endpoint, and §13-hidden when there are none.
  // The feed responds { listings: [...] } (not a bare array).
  const { data: readyMadeFeed } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/ready-made"],
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

  // Ready-Made trips authored by the experts currently on the page (up to 4), for the
  // cross-sell shelf. Filter by authorId ∈ page experts; hidden entirely when empty (§13).
  const pageAuthorIds = new Set(sortedExperts.map((e: any) => String(e.id)));
  const crossSellTrips = (Array.isArray(readyMadeFeed?.listings) ? readyMadeFeed!.listings : [])
    .filter((t: any) => t?.authorId && pageAuthorIds.has(String(t.authorId)))
    .slice(0, 4);

  const seo =
    selectedRole === "travel_expert"
      ? {
          title: "Trip Planners",
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
      {/* Band + FIND HELP rail (SPEC §2/§3.8; rulings 2026-08-25-nav-icons + -surface-rail):
          left = role-glyph tile (from the one NAV_LEAF_ICONS source) + Fraunces title +
          one-line sub; right = FIND HELP eyebrow + four-link rail (Providers · Local
          Experts · Trip Planners · Event Planners), current one filled navy, REPLACING the
          role-pill switcher. The three role links keep the re-homed tab-role-* ids and their
          live count badges; they preserve query params via buildRoleHref. Same band idiom as
          /discover's Marketplace band (discover.tsx). */}
      <section className="bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-[26px]">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"
          >
            <div className="flex items-start gap-3 text-left">
              <span className="w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)] grid place-items-center shrink-0">
                {(() => {
                  const TileIcon = NAV_LEAF_ICONS[ROLE_NAV_NAME[selectedRole]] ?? NAV_LEAF_ICONS["Local Experts"];
                  return <TileIcon className="w-[22px] h-[22px]" />;
                })()}
              </span>
              <div>
                <h1
                  className="text-2xl md:text-[26px] font-semibold text-[color:var(--earn-navy)] leading-tight"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {selectedRole === "travel_expert"
                    ? "Work with a Trip Planner"
                    : selectedRole === "event_planner"
                    ? "Plan Your Event"
                    : "Find Your Perfect Local Expert"}
                </h1>
                <p className="text-sm text-[color:var(--earn-muted)] mt-1 max-w-[60ch]">
                  {selectedRole === "travel_expert"
                    ? "Experienced trip planners who handle every detail — from itineraries to bookings — so you can just enjoy the journey."
                    : selectedRole === "event_planner"
                    ? "Specialist event planners for weddings, proposals, and group celebrations. Let an expert make it unforgettable."
                    : "Connect with verified local experts who know their destinations inside out. Get personalized recommendations and insider access."}
                </p>
              </div>
            </div>

            <nav className="md:text-right" aria-label="Find help" role="tablist">
              <p
                className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-muted)] mb-2"
                style={{ fontFamily: EARN_MONO }}
              >
                Find help
              </p>
              <div className="flex flex-wrap md:justify-end gap-1.5" style={{ fontFamily: EARN_MONO }}>
                {FIND_HELP_RAIL.map((item) => {
                  if (item.kind === "route") {
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]"
                      >
                        {item.label}
                      </Link>
                    );
                  }
                  const active = selectedRole === item.role;
                  const count = roleCounts?.[item.role];
                  return (
                    <Link
                      key={item.role}
                      href={buildRoleHref(item.role)}
                      role="tab"
                      aria-selected={active}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors",
                        active
                          ? "bg-[var(--earn-navy)] text-white font-semibold"
                          : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]",
                      )}
                      data-testid={`tab-role-${item.role}`}
                    >
                      {item.label}
                      {isLoadingCounts ? (
                        <span
                          className={cn(
                            "inline-block w-4 h-3.5 rounded-full animate-pulse",
                            active ? "bg-white/30" : "bg-black/10",
                          )}
                          data-testid={`skeleton-count-${item.role}`}
                        />
                      ) : count !== undefined ? (
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[11px] font-semibold leading-none",
                            active
                              ? "bg-white/25 text-white"
                              : "bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]",
                          )}
                          data-testid={`count-${item.role}`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </motion.div>
        </div>
      </section>

      {/* Filters & Results */}
      <section className="py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Unified Filter Bar — continuity tc-card idiom: hairline border,
              soft shadow, 14px radius (marketplace-continuity language). */}
          <div className="bg-white border rounded-[14px] p-3 mb-6" style={{ borderColor: "#e4e7ec", boxShadow: "0 1px 3px rgba(17,24,39,.04)" }}>
            {/* Top row: search + destination */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="What do you need help with?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 border-border text-foreground text-sm"
                  data-testid="input-search-experts"
                />
              </div>
              <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                <SelectTrigger className="w-full sm:w-44 h-10 border-border" data-testid="select-destination">
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
                  <SelectTrigger className="h-9 w-44 border-border bg-[#F9FAFB] text-sm" data-testid="select-experience-type">
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
                  <SelectTrigger className="h-9 w-36 border-border bg-[#F9FAFB] text-sm" data-testid="select-language">
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
                      className="pl-8 h-9 border-border bg-[#F9FAFB] w-44 text-sm"
                      data-testid="input-neighbourhood-filter"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {sortedExperts.length} found
                </span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 w-40 border-border bg-[#F9FAFB] text-sm" data-testid="select-sort">
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
              <span className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Active:
              </span>
              {selectedDestination !== "All Destinations" && (
                <Badge
                  className="flex items-center gap-1 bg-[#FFF1F3] text-primary border border-[#FECDD3] px-2.5 py-1 text-xs font-medium rounded-full"
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
                <span className="text-xs text-muted-foreground italic" data-testid="text-combined-filter-hint">
                  Experts covering {neighbourhoodQuery.trim()} in {selectedDestination}
                </span>
              )}
            </div>
          )}

          {/* Section heading — continuity's eyebrow + count grammar
              (ProviderStorefrontContinuity's tc-section-heading). */}
          {!isLoadingExperts && sortedExperts.length > 0 && (
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]"
                  style={{ fontFamily: EARN_MONO }}
                >
                  {roleLabels[selectedRole] ?? "Experts"} · {sortedExperts.length}
                </p>
                <h2
                  className="text-[22px] font-semibold tracking-tight text-[color:var(--earn-navy)]"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {selectedRole === "travel_expert"
                    ? "Hand the logistics to a planner"
                    : selectedRole === "event_planner"
                    ? "Make the occasion unforgettable"
                    : "Someone who already knows the way"}
                </h2>
              </div>
              <p
                className="hidden sm:block text-[12px] text-[color:var(--earn-muted)] whitespace-nowrap"
                style={{ fontFamily: EARN_MONO }}
              >
                {sortedExperts.length} {sortedExperts.length === 1 ? "match" : "matches"} · recommended
              </p>
            </div>
          )}

          {/* Expert Cards Grid */}
          {isLoadingExperts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading experts...</span>
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
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed py-16 text-center"
              style={{ borderColor: "#d0d5dd" }}
            >
              <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                <Search className="w-8 h-8 text-[#9CA3AF]" />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
                {selectedRole === "event_planner" ? "No event planners found" : "No experts found"}
              </h3>
              <p className="text-muted-foreground">
                {selectedRole === "event_planner"
                  ? "Try a trip planner instead, or adjust your filters."
                  : "Try adjusting your filters or search terms"}
              </p>
              {selectedRole === "event_planner" && (
                <Link
                  href={buildRoleHref("travel_expert")}
                  className="rounded-md px-4 py-2 text-sm font-bold text-[color:var(--earn-coral-ink)] hover:underline"
                  data-testid="link-trip-planners-fallback"
                >
                  Browse trip planners
                </Link>
              )}
              <button
                className="mt-1 rounded-md px-4 py-2 text-sm font-bold"
                style={{ color: "#d92d55" }}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedDestination("All Destinations");
                  setSelectedLanguage("All Languages");
                  setSelectedExperienceType("");
                  setNeighbourhoodQuery("");
                }}
                data-testid="button-clear-filters"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Load More */}
          {sortedExperts.length > visibleCount && (
            <div className="text-center mt-8">
              <button
                className="inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-bold transition-colors hover:bg-black/[.03]"
                style={{ borderColor: "#d0d5dd", color: "#344054" }}
                onClick={() => setVisibleCount(c => c + 12)}
                data-testid="button-load-more"
              >
                Load more experts
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Cross-sell shelf (§3.8): Ready-Made trips these very experts have already
              built — a second way in beside hiring them. Family cards linking to the
              ready-made detail; hidden entirely when none of the page's experts have a
              published trip (§13, no empty shelf). */}
          {crossSellTrips.length > 0 && (
            <div className="mt-12 border-t pt-8" style={{ borderColor: "var(--earn-border)" }}>
              <div className="mb-4">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]"
                  style={{ fontFamily: EARN_MONO }}
                >
                  Ready-Made · {crossSellTrips.length}
                </p>
                <h2
                  className="text-[22px] font-semibold tracking-tight text-[color:var(--earn-navy)]"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  Or start with a trip they already built
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="experts-cross-sell">
                {crossSellTrips.map((trip: any) => (
                  <Link
                    key={trip.id}
                    href={`/ready-made/${trip.id}`}
                    data-testid={`cross-sell-trip-${trip.id}`}
                    className="group flex flex-col overflow-hidden rounded-[14px] border bg-white transition-all hover:-translate-y-0.5"
                    style={{ borderColor: "var(--earn-border)", boxShadow: "0 1px 3px rgba(17,24,39,.04)" }}
                  >
                    <div className="relative h-32 bg-[var(--earn-chip)]">
                      {trip.heroImageUrl && (
                        <img src={trip.heroImageUrl} alt={trip.title} className="h-full w-full object-cover" />
                      )}
                      {trip.market && (
                        <span
                          className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[9.5px] font-semibold text-[color:var(--earn-ink)]"
                          style={{ fontFamily: EARN_MONO }}
                        >
                          {trip.market}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[color:var(--earn-ink)]">
                        {trip.title}
                      </h3>
                      <p
                        className="mt-1 text-[11.5px] text-[color:var(--earn-muted)]"
                        style={{ fontFamily: EARN_MONO }}
                      >
                        {[trip.durationDays ? `${trip.durationDays} days` : null, `by ${trip.authorName}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
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
          <section className="py-16 bg-white border-t" style={{ borderColor: "#e4e7ec" }}>
            <div className="container mx-auto px-4 max-w-4xl text-center">
              <h2 className="text-3xl font-bold mb-4" style={{ color: "#111827" }}>
                {config.heading}
              </h2>
              <p className="text-lg mb-8 max-w-2xl mx-auto" style={{ color: "#667085" }}>
                {config.body}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href={config.href}>
                  <button
                    className="rounded-md px-8 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-px"
                    style={{ background: "#fb3b63", boxShadow: "0 4px 12px rgba(251,59,99,.18)" }}
                    data-testid="button-become-expert-experts"
                  >
                    {config.cta}
                  </button>
                </Link>
                <Link href="/earn">
                  <button
                    className="rounded-md border px-8 py-3 text-sm font-bold transition-colors hover:bg-black/[.03]"
                    style={{ borderColor: "#d0d5dd", color: "#344054" }}
                    data-testid="button-learn-more"
                  >
                    Learn more
                  </button>
                </Link>
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
