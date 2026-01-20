import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Calendar,
  MapPin,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Sparkles,
  Heart,
  Compass,
  BookOpen,
  Waves,
  Mountain,
  Utensils,
  Plane,
  PartyPopper,
} from "lucide-react";
import { Link } from "wouter";

interface GlobalCity {
  id: string;
  cityName: string;
  country: string;
  countryCode?: string | null;
  heroImage?: string | null;
  pulseScore?: number | null;
  trendingScore?: number | null;
  vibeTags: string[];
  weatherScore?: number | null;
  crowdLevel?: string | null;
  currentHighlight?: string | null;
  highlightEmoji?: string | null;
  seasonalRating: string;
  weatherDescription?: string | null;
  averageTemp?: string | null;
  rainfall?: string | null;
  seasonCrowdLevel?: string | null;
  priceLevel?: string | null;
  highlights: string[];
  events: { id: string; title: string; eventType: string | null; description?: string | null }[];
  aiBestTimeToVisit?: string | null;
  aiBudgetEstimate?: { daily?: { min?: number; max?: number } } | null;
}

interface GlobalEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType?: string | null;
  city?: string | null;
  country: string;
  startMonth?: number | null;
  endMonth?: number | null;
}

interface GlobalCalendarResponse {
  month: number;
  monthName: string;
  totalCities: number;
  vibeFilter: string | null;
  cities: GlobalCity[];
  grouped: {
    best: GlobalCity[];
    good: GlobalCity[];
    average: GlobalCity[];
    avoid: GlobalCity[];
  };
  allEvents: GlobalEvent[];
}

const vibeFilters = [
  { id: "all", label: "All Destinations", icon: Compass },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "adventure", label: "Adventure", icon: Mountain },
  { id: "cultural", label: "Cultural", icon: BookOpen },
  { id: "beach", label: "Beach", icon: Waves },
  { id: "foodie", label: "Foodie", icon: Utensils },
  { id: "nightlife", label: "Nightlife", icon: Sparkles },
  { id: "family", label: "Family", icon: Users },
  { id: "nature", label: "Nature", icon: Mountain },
];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getWeatherIcon(description: string | null | undefined) {
  if (!description) return <Sun className="h-4 w-4 text-yellow-500" />;
  const lower = description.toLowerCase();
  if (lower.includes("snow") || lower.includes("cold")) return <Snowflake className="h-4 w-4 text-blue-400" />;
  if (lower.includes("rain") || lower.includes("monsoon") || lower.includes("wet")) return <CloudRain className="h-4 w-4 text-blue-500" />;
  if (lower.includes("cloud") || lower.includes("overcast")) return <Cloud className="h-4 w-4 text-gray-400" />;
  return <Sun className="h-4 w-4 text-yellow-500" />;
}

function getRatingColor(rating: string) {
  switch (rating) {
    case "best":
    case "excellent":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    case "good":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    case "average":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    case "avoid":
    case "poor":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function getRatingLabel(rating: string) {
  switch (rating) {
    case "best":
    case "excellent":
      return "Best Time";
    case "good":
      return "Good Time";
    case "average":
      return "Average";
    case "avoid":
    case "poor":
      return "Off Season";
    default:
      return "Unknown";
  }
}

interface GlobalCalendarProps {
  onCityClick?: (cityName: string, country: string) => void;
}

export function GlobalCalendar({ onCityClick }: GlobalCalendarProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedVibe, setSelectedVibe] = useState("all");

  const { data, isLoading, error, refetch } = useQuery<GlobalCalendarResponse>({
    queryKey: [`/api/travelpulse/global-calendar?month=${selectedMonth}&vibe=${selectedVibe}&limit=30`],
  });

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => (prev === 1 ? 12 : prev - 1));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => (prev === 12 ? 1 : prev + 1));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Unable to load the global calendar</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-4" data-testid="button-retry">
          Try Again
        </Button>
      </Card>
    );
  }

  const { grouped, allEvents, monthName } = data || { grouped: { best: [], good: [], average: [], avoid: [] }, allEvents: [], monthName: "" };

  return (
    <div className="space-y-6" data-testid="global-calendar">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Where to Go in {monthName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered recommendations based on weather, events, and crowd levels
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevMonth}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[120px] text-center font-medium">
            {monthName}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {months.map((month, idx) => (
            <Button
              key={month}
              variant={selectedMonth === idx + 1 ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedMonth(idx + 1)}
              className="flex-shrink-0"
              data-testid={`button-month-${idx + 1}`}
            >
              {month.slice(0, 3)}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {vibeFilters.map((vibe) => (
            <Button
              key={vibe.id}
              variant={selectedVibe === vibe.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedVibe(vibe.id)}
              className="flex-shrink-0"
              data-testid={`button-vibe-${vibe.id}`}
            >
              <vibe.icon className="h-4 w-4 mr-1" />
              {vibe.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {grouped.best.length > 0 && (
        <CitySection
          title="Best Time to Visit"
          subtitle="Perfect conditions for travel"
          cities={grouped.best}
          rating="best"
          onCityClick={onCityClick}
        />
      )}

      {grouped.good.length > 0 && (
        <CitySection
          title="Good Time to Visit"
          subtitle="Favorable conditions overall"
          cities={grouped.good}
          rating="good"
          onCityClick={onCityClick}
        />
      )}

      {grouped.average.length > 0 && (
        <CitySection
          title="Average Conditions"
          subtitle="Mixed conditions, check details"
          cities={grouped.average}
          rating="average"
          onCityClick={onCityClick}
        />
      )}

      {allEvents.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Ticket className="h-5 w-5 text-muted-foreground" />
            Events & Festivals in {monthName}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allEvents.slice(0, 6).map((event) => (
              <Card key={event.id} className="hover-elevate" data-testid={`event-card-${event.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Ticket className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Badge variant="secondary" className="mb-1 text-xs capitalize">
                        {event.eventType || "event"}
                      </Badge>
                      <h4 className="font-medium text-sm line-clamp-1">{event.title}</h4>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3" />
                        {event.city ? `${event.city}, ` : ""}{event.country}
                      </div>
                      <Link href={`/experience/travel?destination=${encodeURIComponent(event.city || event.country)}&event=${encodeURIComponent(event.title)}`}>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          data-testid={`button-plan-event-${event.id}`}
                        >
                          <Plane className="h-3 w-3 mr-1" />
                          Plan This Trip
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {grouped.best.length === 0 && grouped.good.length === 0 && grouped.average.length === 0 && (
        <Card className="p-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No destination data available for {monthName}</p>
          <p className="text-xs text-muted-foreground mt-2">Check back after the next AI refresh</p>
        </Card>
      )}

      <ExperienceInspirationWidget
        selectedMonth={selectedMonth}
        selectedVibe={selectedVibe}
        monthName={monthName}
        topCities={[...grouped.best, ...grouped.good].slice(0, 3)}
        events={allEvents.slice(0, 3)}
      />
    </div>
  );
}

function CitySection({
  title,
  subtitle,
  cities,
  rating,
  onCityClick,
}: {
  title: string;
  subtitle: string;
  cities: GlobalCity[];
  rating: string;
  onCityClick?: (cityName: string, country: string) => void;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Badge className={`${getRatingColor(rating)} border`}>
            {getRatingLabel(rating)}
          </Badge>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cities.slice(0, 6).map((city) => (
          <Card 
            key={city.id}
            className="overflow-hidden hover-elevate cursor-pointer h-full"
            onClick={() => onCityClick?.(city.cityName, city.country)}
            data-testid={`city-card-${city.id}`}
          >
            {city.heroImage && (
              <div className="h-32 relative">
                <img
                  src={city.heroImage}
                  alt={city.cityName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-3 right-3">
                  <h4 className="font-semibold text-white">{city.cityName}</h4>
                  <p className="text-xs text-white/80">{city.country}</p>
                </div>
              </div>
            )}
            <CardContent className={city.heroImage ? "p-3" : "p-4"}>
              {!city.heroImage && (
                <div className="mb-2">
                  <h4 className="font-semibold">{city.cityName}</h4>
                  <p className="text-xs text-muted-foreground">{city.country}</p>
                </div>
              )}
              
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {city.weatherDescription && (
                  <span className="flex items-center gap-1">
                    {getWeatherIcon(city.weatherDescription)}
                    <span className="text-muted-foreground">{city.averageTemp}</span>
                  </span>
                )}
                {city.seasonCrowdLevel && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground capitalize">{city.seasonCrowdLevel}</span>
                  </span>
                )}
                {city.pulseScore && city.pulseScore > 70 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">Trending</span>
                  </span>
                )}
              </div>

              {city.events.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <div className="flex items-center gap-1 text-xs">
                    <Ticket className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{city.events[0].title}</span>
                  </div>
                </div>
              )}

              {city.currentHighlight && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {city.highlightEmoji} {city.currentHighlight}
                  </p>
                </div>
              )}

              {city.vibeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {city.vibeTags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs capitalize">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface ExperienceIdea {
  title: string;
  description: string;
  slug: string;
  source: string;
  destination?: string;
  event?: string;
}

function getExperienceIdeasFromContext(
  month: number,
  vibe: string,
  cities: GlobalCity[],
  events: GlobalEvent[]
): ExperienceIdea[] {
  const ideas: ExperienceIdea[] = [];
  
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const monthName = monthNames[month - 1];
  
  if (cities.length > 0) {
    const topCity = cities[0];
    ideas.push({
      title: `${monthName} Getaway to ${topCity.cityName}`,
      description: topCity.currentHighlight 
        ? `${topCity.currentHighlight} - Perfect timing for your trip`
        : `Rated best time to visit with ${topCity.weatherDescription || "great weather"}`,
      slug: "travel",
      source: `${topCity.cityName}, ${topCity.country}`,
      destination: `${topCity.cityName}, ${topCity.country}`
    });
    
    if (topCity.vibeTags.includes("romantic") || vibe === "romantic") {
      ideas.push({
        title: `Romantic Escape to ${topCity.cityName}`,
        description: `Create unforgettable memories in ${topCity.cityName}`,
        slug: "date-night",
        source: `${topCity.cityName}, ${topCity.country}`,
        destination: `${topCity.cityName}, ${topCity.country}`
      });
    }
    
    if (cities.length > 1) {
      const secondCity = cities[1];
      ideas.push({
        title: `Explore ${secondCity.cityName}`,
        description: secondCity.currentHighlight || `Discover what makes ${secondCity.cityName} special this ${monthName}`,
        slug: "travel",
        source: `${secondCity.cityName}, ${secondCity.country}`,
        destination: `${secondCity.cityName}, ${secondCity.country}`
      });
    }
  }
  
  if (events.length > 0) {
    const featuredEvent = events[0];
    ideas.push({
      title: `Experience ${featuredEvent.title}`,
      description: featuredEvent.description || `Join the ${featuredEvent.eventType || "celebration"} in ${featuredEvent.city || featuredEvent.country}`,
      slug: "travel",
      source: featuredEvent.city ? `${featuredEvent.city}, ${featuredEvent.country}` : featuredEvent.country,
      destination: featuredEvent.city || featuredEvent.country,
      event: featuredEvent.title
    });
  }
  
  if (month === 2 || vibe === "romantic") {
    const romanticCity = cities.find(c => c.vibeTags.includes("romantic"));
    ideas.push({
      title: "Plan a Romantic Proposal",
      description: romanticCity 
        ? `${romanticCity.cityName} is perfect for your special moment`
        : "Use our AI insights to find the perfect destination and timing",
      slug: "proposal",
      source: romanticCity ? `${romanticCity.cityName}, ${romanticCity.country}` : "AI Recommendation",
      destination: romanticCity ? `${romanticCity.cityName}, ${romanticCity.country}` : undefined
    });
  }
  
  if (month === 6 || month === 9) {
    ideas.push({
      title: "Destination Wedding Planning",
      description: "Optimal weather conditions in multiple destinations this month",
      slug: "wedding",
      source: "Seasonal Insight"
    });
  }
  
  if (month === 12) {
    ideas.push({
      title: "Holiday Celebration Trip",
      description: "Festive events and celebrations happening worldwide",
      slug: "birthday",
      source: "Holiday Season"
    });
  }
  
  if (vibe === "corporate" || vibe === "business") {
    ideas.push({
      title: "Team Retreat Planning",
      description: "Find destinations with ideal conditions for team building",
      slug: "corporate",
      source: "Business Travel"
    });
  }
  
  if (vibe === "family") {
    ideas.push({
      title: "Family Reunion Trip",
      description: "Gather everyone for an unforgettable family adventure",
      slug: "reunion",
      source: "Family Travel"
    });
  }
  
  return ideas.slice(0, 4);
}

function ExperienceInspirationWidget({
  selectedMonth,
  selectedVibe,
  monthName,
  topCities,
  events,
}: {
  selectedMonth: number;
  selectedVibe: string;
  monthName: string;
  topCities: GlobalCity[];
  events: GlobalEvent[];
}) {
  const ideas = getExperienceIdeasFromContext(selectedMonth, selectedVibe, topCities, events);
  
  if (ideas.length === 0) {
    return null;
  }
  
  return (
    <div className="mt-8 pt-6 border-t" data-testid="experience-inspiration-widget">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2" data-testid="heading-experience-ideas">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            Create an Experience
          </h3>
          <p className="text-sm text-muted-foreground">
            Ideas inspired by {monthName} travel insights
          </p>
        </div>
        <Link href="/experience">
          <Button variant="ghost" size="sm" data-testid="button-view-all-experiences">
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ideas.map((idea, idx) => {
          const params = new URLSearchParams();
          if (idea.destination) params.set("destination", idea.destination);
          if (idea.event) params.set("event", idea.event);
          const queryString = params.toString();
          const href = `/experience/${idea.slug}${queryString ? `?${queryString}` : ""}`;
          
          return (
          <Link key={idx} href={href}>
            <Card 
              className="hover-elevate cursor-pointer h-full"
              data-testid={`experience-idea-${idx}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {idea.slug === "travel" ? (
                      <Plane className="h-5 w-5 text-foreground" />
                    ) : idea.slug === "wedding" || idea.slug === "proposal" || idea.slug === "date-night" ? (
                      <Heart className="h-5 w-5 text-foreground" />
                    ) : (
                      <PartyPopper className="h-5 w-5 text-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-1" data-testid={`idea-title-${idx}`}>
                      {idea.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {idea.description}
                    </p>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {idea.source}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
