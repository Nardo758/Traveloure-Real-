import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Brain,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ExpertCard } from "@/components/expert-card";
import { ExpertMatchCard } from "@/components/expert-match-card";
import { format } from "date-fns";

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

const mockExperts = [
  {
    id: 1,
    name: "Marie Laurent",
    avatar: null,
    location: "Paris, France",
    specialty: "Cultural Tours",
    languages: ["English", "French"],
    rating: 4.9,
    reviews: 124,
    trips: 340,
    responseTime: "< 1 hour",
    verified: true,
    superExpert: true,
    bio: "Born and raised in Paris, I've spent 15 years helping travelers discover the hidden gems of the City of Light. From secret wine bars to authentic local experiences.",
    startingPrice: 75,
  },
  {
    id: 2,
    name: "Kenji Tanaka",
    avatar: null,
    location: "Tokyo, Japan",
    specialty: "Cultural Tours",
    languages: ["English", "Japanese"],
    rating: 4.8,
    reviews: 98,
    trips: 215,
    responseTime: "< 2 hours",
    verified: true,
    superExpert: false,
    bio: "Tokyo native with deep knowledge of both traditional Japan and modern pop culture. I specialize in curating unique experiences that blend old and new.",
    startingPrice: 85,
  },
  {
    id: 3,
    name: "Sofia Rodriguez",
    avatar: null,
    location: "Barcelona, Spain",
    specialty: "Food & Wine",
    languages: ["English", "Spanish", "French"],
    rating: 5.0,
    reviews: 156,
    trips: 420,
    responseTime: "< 1 hour",
    verified: true,
    superExpert: true,
    bio: "Culinary expert and certified sommelier. Let me guide you through Barcelona's vibrant food scene, from tapas bars to Michelin-starred restaurants.",
    startingPrice: 95,
  },
  {
    id: 4,
    name: "Raj Patel",
    avatar: null,
    location: "Mumbai, India",
    specialty: "Adventure Travel",
    languages: ["English", "Hindi"],
    rating: 4.7,
    reviews: 87,
    trips: 180,
    responseTime: "< 3 hours",
    verified: true,
    superExpert: false,
    bio: "Adventure enthusiast who has explored every corner of India. From Himalayan treks to Kerala backwaters, I create unforgettable journeys.",
    startingPrice: 55,
  },
  {
    id: 5,
    name: "Isabella Chen",
    avatar: null,
    location: "Bali, Indonesia",
    specialty: "Honeymoon",
    languages: ["English", "Mandarin"],
    rating: 4.9,
    reviews: 203,
    trips: 380,
    responseTime: "< 1 hour",
    verified: true,
    superExpert: true,
    bio: "Romantic getaway specialist with 10 years of experience in Bali. I create magical experiences for couples seeking paradise.",
    startingPrice: 80,
  },
  {
    id: 6,
    name: "Marco Rossi",
    avatar: null,
    location: "Rome, Italy",
    specialty: "Luxury Travel",
    languages: ["English", "Italian", "French"],
    rating: 4.8,
    reviews: 145,
    trips: 290,
    responseTime: "< 2 hours",
    verified: true,
    superExpert: false,
    bio: "Former concierge at Rome's finest hotels. I now help discerning travelers experience Italy's finest offerings with exclusive access.",
    startingPrice: 120,
  },
];

interface MatchedExpert {
  expert: any;
  score: number;
  breakdown: {
    destinationExpertise: number;
    styleAlignment: number;
    budgetFit: number;
    experienceRelevance: number;
    availability: number;
  };
  reasoning: string;
  strengths: string[];
}

export default function ExpertsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("All Destinations");
  const [selectedSpecialty, setSelectedSpecialty] = useState("All Specialties");
  const [selectedLanguage, setSelectedLanguage] = useState("All Languages");
  const [selectedExperienceType, setSelectedExperienceType] = useState("");
  const [sortBy, setSortBy] = useState("recommended");
  const [favorites, setFavorites] = useState<string[]>([]);
  
  const [aiMatchOpen, setAiMatchOpen] = useState(false);
  const [aiDestination, setAiDestination] = useState("");
  const [aiStartDate, setAiStartDate] = useState<Date | undefined>(undefined);
  const [aiEndDate, setAiEndDate] = useState<Date | undefined>(undefined);
  const [aiTravelers, setAiTravelers] = useState("2");
  const [matchedExperts, setMatchedExperts] = useState<MatchedExpert[]>([]);
  const [showMatches, setShowMatches] = useState(false);

  const matchExpertsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/grok/match-experts", {
        tripDetails: {
          destination: aiDestination,
          dates: {
            start: aiStartDate?.toISOString(),
            end: aiEndDate?.toISOString(),
          },
          travelers: parseInt(aiTravelers) || 2,
          experienceType: selectedExperienceType || undefined,
          preferences: [],
        },
      });
      const data = await response.json() as { matches: MatchedExpert[] };
      return data.matches || [];
    },
    onSuccess: (data) => {
      setMatchedExperts(data);
      setShowMatches(true);
    },
  });

  // Fetch experience types for filtering
  const { data: experienceTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/experience-types"],
  });

  // Fetch experts from API with optional experience type filter
  const { data: apiExperts = [], isLoading: isLoadingExperts } = useQuery<any[]>({
    queryKey: ["/api/experts", selectedExperienceType],
    queryFn: async () => {
      const url = selectedExperienceType 
        ? `/api/experts?experienceTypeId=${selectedExperienceType}`
        : "/api/experts";
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

  // Filter experts by search and other criteria
  const filteredExperts = apiExperts.filter((expert: any) => {
    const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      fullName.includes(searchQuery.toLowerCase()) ||
      expert.specializations?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDestination =
      selectedDestination === "All Destinations" ||
      expert.expertForm?.destinations?.includes(selectedDestination);

    const matchesLanguage =
      selectedLanguage === "All Languages" ||
      expert.expertForm?.languages?.includes(selectedLanguage);

    return matchesSearch && matchesDestination && matchesLanguage;
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

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#111827] to-[#1F2937] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Find Your Perfect Travel Expert
            </h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Connect with verified local experts who know their destinations inside out.
              Get personalized recommendations and insider access.
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl p-4 shadow-xl max-w-4xl mx-auto"
          >
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search by name, destination, or specialty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 border-[#E5E7EB] text-[#111827]"
                  data-testid="input-search-experts"
                />
              </div>
              <Select value={selectedDestination} onValueChange={setSelectedDestination}>
                <SelectTrigger className="w-full md:w-48 h-12 border-[#E5E7EB]" data-testid="select-destination">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((dest) => (
                    <SelectItem key={dest} value={dest}>
                      {dest}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="h-12 px-8 bg-[#FF385C] hover:bg-[#E23350] text-white"
                data-testid="button-search-experts"
              >
                Search Experts
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* AI Expert Matching Section */}
      <section className="py-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 border-b">
        <div className="container mx-auto px-4 max-w-6xl">
          <Collapsible open={aiMatchOpen} onOpenChange={setAiMatchOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between p-4 h-auto"
                data-testid="button-toggle-ai-match"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-[#111827] dark:text-white flex items-center gap-2">
                      AI Expert Matching
                      <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px]">
                        Powered by Grok
                      </Badge>
                    </div>
                    <p className="text-xs text-[#6B7280]">
                      Let our AI find the perfect experts based on your specific trip details
                    </p>
                  </div>
                </div>
                {aiMatchOpen ? (
                  <ChevronUp className="w-5 h-5 text-[#6B7280]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#6B7280]" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-3 border-purple-200 dark:border-purple-800">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Where are you going?</Label>
                      <Input
                        placeholder="e.g., Tokyo, Japan"
                        value={aiDestination}
                        onChange={(e) => setAiDestination(e.target.value)}
                        className="mt-1"
                        data-testid="input-ai-destination"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full mt-1 justify-start text-left font-normal",
                              !aiStartDate && "text-muted-foreground"
                            )}
                            data-testid="button-ai-start-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {aiStartDate ? format(aiStartDate, "MMM d, yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={aiStartDate}
                            onSelect={setAiStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full mt-1 justify-start text-left font-normal",
                              !aiEndDate && "text-muted-foreground"
                            )}
                            data-testid="button-ai-end-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {aiEndDate ? format(aiEndDate, "MMM d, yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={aiEndDate}
                            onSelect={setAiEndDate}
                            disabled={(date) => aiStartDate ? date < aiStartDate : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Travelers</Label>
                      <Select value={aiTravelers} onValueChange={setAiTravelers}>
                        <SelectTrigger className="mt-1" data-testid="select-ai-travelers">
                          <Users className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} {n === 1 ? "traveler" : "travelers"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button
                      onClick={() => matchExpertsMutation.mutate()}
                      disabled={!aiDestination || matchExpertsMutation.isPending}
                      className="bg-purple-600 text-white gap-2"
                      data-testid="button-find-ai-matches"
                    >
                      {matchExpertsMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Finding Matches...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Find My Perfect Experts
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {matchExpertsMutation.isError && (
                <Card className="mt-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
                  <CardContent className="p-4 flex items-center justify-between">
                    <p className="text-sm text-red-700 dark:text-red-400">
                      Unable to find expert matches. Please try again.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => matchExpertsMutation.mutate()}
                      className="text-xs"
                      data-testid="button-retry-match"
                    >
                      Try Again
                    </Button>
                  </CardContent>
                </Card>
              )}

              {showMatches && matchedExperts.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-purple-600" />
                      <span className="font-medium text-sm">
                        {matchedExperts.length} AI-Matched Experts for {aiDestination}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMatches(false)}
                      className="text-xs"
                    >
                      Show All Experts
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {matchedExperts.map((match, idx) => (
                      <motion.div
                        key={match.expert.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <ExpertMatchCard
                          expert={match.expert}
                          matchScore={match.score}
                          matchBreakdown={match.breakdown}
                          matchReasons={[match.reasoning]}
                          matchStrengths={match.strengths}
                          showDetails={idx < 3}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </section>

      {/* Filters & Results */}
      <section className="py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-3">
              <Select value={selectedExperienceType || "all"} onValueChange={(val) => setSelectedExperienceType(val === "all" ? "" : val)}>
                <SelectTrigger className="w-48 border-[#E5E7EB] bg-white" data-testid="select-experience-type">
                  <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Experience Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Experience Types</SelectItem>
                  {experienceTypes.map((exp: any) => (
                    <SelectItem key={exp.id} value={exp.id}>
                      {exp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="w-40 border-[#E5E7EB] bg-white" data-testid="select-language">
                  <Languages className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-more-filters">
                <Filter className="w-4 h-4 mr-2" />
                More Filters
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-[#6B7280]">
                {sortedExperts.length} experts found
              </span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44 border-[#E5E7EB] bg-white" data-testid="select-sort">
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

          {/* Expert Cards Grid */}
          {isLoadingExperts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
              <span className="ml-2 text-[#6B7280]">Loading experts...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedExperts.map((expert: any, idx: number) => (
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
                }}
                data-testid="button-clear-filters"
              >
                Clear All Filters
              </Button>
            </div>
          )}

          {/* Load More */}
          {sortedExperts.length > 0 && (
            <div className="text-center mt-8">
              <Button
                variant="outline"
                size="lg"
                className="border-[#E5E7EB]"
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
      <section className="py-16 bg-white border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-[#111827] mb-4">
            Are You a Local Expert?
          </h2>
          <p className="text-lg text-[#6B7280] mb-8 max-w-2xl mx-auto">
            Share your knowledge, earn money, and help travelers discover the best
            of your destination. Join our growing community of travel experts.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/become-expert">
              <Button
                size="lg"
                className="bg-[#FF385C] hover:bg-[#E23350] text-white px-8"
                data-testid="button-become-expert"
              >
                Become an Expert
              </Button>
            </Link>
            <Link href="/partner-with-us">
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
    </div>
  );
}
