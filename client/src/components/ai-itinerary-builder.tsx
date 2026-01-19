import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Clock,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Coffee,
  Utensils,
  Camera,
  Hotel,
  Car,
  AlertCircle,
  RefreshCw,
  Download,
  Share2,
  LightbulbIcon,
  ShirtIcon,
  HeartIcon,
  Accessibility,
  Leaf,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AIItineraryBuilderProps {
  destination: string;
  startDate?: Date;
  endDate?: Date;
  travelers: number;
  experienceType?: string;
  onClose?: () => void;
}

interface DayActivity {
  time: string;
  name: string;
  type: string;
  duration: string;
  estimatedCost: number;
  location: string;
  description: string;
  tips?: string;
  bookingRequired?: boolean;
}

interface DayMeal {
  time: string;
  type: "breakfast" | "lunch" | "dinner";
  suggestion: string;
  cuisine: string;
  priceRange: string;
}

interface DayTransportation {
  from: string;
  to: string;
  mode: string;
  duration: string;
  cost: number;
}

interface DayItinerary {
  day: number;
  date: string;
  theme: string;
  activities: DayActivity[];
  meals: DayMeal[];
  transportation: DayTransportation[];
}

interface Accommodation {
  name: string;
  type: string;
  pricePerNight: number;
  neighborhood: string;
  whyRecommended: string;
}

interface GeneratedItinerary {
  id: string;
  title: string;
  summary: string;
  totalEstimatedCost: number;
  dailyItinerary: DayItinerary[];
  accommodationSuggestions: Accommodation[];
  packingList: string[]; // Simple array of packing items from Grok
  travelTips: string[];
  createdAt: string;
  status: string;
}

const INTEREST_OPTIONS = [
  { id: "culture", label: "Culture & History", icon: Camera },
  { id: "food", label: "Food & Dining", icon: Utensils },
  { id: "adventure", label: "Adventure", icon: Sparkles },
  { id: "nature", label: "Nature & Outdoors", icon: Leaf },
  { id: "nightlife", label: "Nightlife", icon: Coffee },
  { id: "shopping", label: "Shopping", icon: ShirtIcon },
  { id: "wellness", label: "Wellness & Spa", icon: HeartIcon },
  { id: "art", label: "Art & Museums", icon: LightbulbIcon },
];

const PACE_OPTIONS = [
  { value: "relaxed", label: "Relaxed", description: "Fewer activities, more downtime" },
  { value: "moderate", label: "Moderate", description: "Balanced pace with variety" },
  { value: "packed", label: "Packed", description: "Maximum activities each day" },
];

export function AIItineraryBuilder({
  destination,
  startDate,
  endDate,
  travelers,
  experienceType,
  onClose,
}: AIItineraryBuilderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState<string>("");
  const [pacePreference, setPacePreference] = useState<string>("moderate");
  const [mustSeeAttractions, setMustSeeAttractions] = useState<string>("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [mobilityConsiderations, setMobilityConsiderations] = useState<string[]>([]);
  const [generatedItinerary, setGeneratedItinerary] = useState<GeneratedItinerary | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

  const steps = [
    { label: "Interests", description: "What do you love?" },
    { label: "Preferences", description: "Customize your trip" },
    { label: "Review", description: "Confirm details" },
    { label: "Generated", description: "Your itinerary" },
  ];

  const tripDays = startDate && endDate 
    ? differenceInDays(endDate, startDate) + 1 
    : 1;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/generate-itinerary", {
        destination,
        dates: {
          start: startDate ? format(startDate, "yyyy-MM-dd") : "",
          end: endDate ? format(endDate, "yyyy-MM-dd") : "",
        },
        travelers,
        budget: budget ? parseFloat(budget) : undefined,
        eventType: experienceType,
        interests,
        pacePreference,
        mustSeeAttractions: mustSeeAttractions.split(",").map(s => s.trim()).filter(Boolean),
        dietaryRestrictions,
        mobilityConsiderations,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedItinerary(data);
      setCurrentStep(3);
    },
  });

  const toggleInterest = (interest: string) => {
    setInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return interests.length > 0;
      case 1: return true;
      case 2: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      generateMutation.mutate();
    } else if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0 && currentStep < 3) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "dining":
      case "restaurant":
        return <Utensils className="h-4 w-4" />;
      case "hotel":
      case "accommodation":
        return <Hotel className="h-4 w-4" />;
      case "attraction":
      case "tour":
        return <Camera className="h-4 w-4" />;
      case "transport":
        return <Car className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">What are you interested in?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select at least one to help us personalize your itinerary
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INTEREST_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = interests.includes(option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => toggleInterest(option.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover-elevate",
                      isSelected 
                        ? "border-[#FF385C] bg-[#FF385C]/5" 
                        : "border-border bg-background"
                    )}
                    data-testid={`interest-${option.id}`}
                  >
                    <Icon className={cn(
                      "h-6 w-6",
                      isSelected ? "text-[#FF385C]" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-sm font-medium",
                      isSelected ? "text-[#FF385C]" : "text-foreground"
                    )}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">Customize your trip</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Fine-tune your preferences for a perfect itinerary
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Total Budget (optional)</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder="e.g., 2000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    data-testid="input-budget"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total budget for activities, dining, and transportation (excluding flights/hotels)
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium">Trip Pace</Label>
                <Select value={pacePreference} onValueChange={setPacePreference}>
                  <SelectTrigger className="mt-1.5" data-testid="select-pace">
                    <SelectValue placeholder="Select pace" />
                  </SelectTrigger>
                  <SelectContent>
                    {PACE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="font-medium">{option.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">- {option.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Must-See Attractions (optional)</Label>
                <Input
                  placeholder="e.g., Eiffel Tower, Louvre Museum"
                  value={mustSeeAttractions}
                  onChange={(e) => setMustSeeAttractions(e.target.value)}
                  className="mt-1.5"
                  data-testid="input-must-see"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated list of places you must visit
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium">Dietary Restrictions</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["Vegetarian", "Vegan", "Halal", "Kosher", "Gluten-free", "Lactose-free"].map((diet) => (
                    <button
                      key={diet}
                      onClick={() => setDietaryRestrictions(prev =>
                        prev.includes(diet) ? prev.filter(d => d !== diet) : [...prev, diet]
                      )}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-all",
                        dietaryRestrictions.includes(diet)
                          ? "border-[#FF385C] bg-[#FF385C]/5 text-[#FF385C]"
                          : "border-border text-muted-foreground"
                      )}
                      data-testid={`dietary-${diet.toLowerCase()}`}
                    >
                      {diet}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Accessibility className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
                  Mobility Considerations
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["Wheelchair accessible", "Limited walking", "Avoid stairs", "Need rest breaks"].map((mobility) => (
                    <button
                      key={mobility}
                      onClick={() => setMobilityConsiderations(prev =>
                        prev.includes(mobility) ? prev.filter(m => m !== mobility) : [...prev, mobility]
                      )}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-all",
                        mobilityConsiderations.includes(mobility)
                          ? "border-[#FF385C] bg-[#FF385C]/5 text-[#FF385C]"
                          : "border-border text-muted-foreground"
                      )}
                      data-testid={`mobility-${mobility.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {mobility}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-foreground">Review your preferences</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ready to generate your personalized itinerary?
              </p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-[#FF385C]" />
                  <div>
                    <p className="text-sm text-muted-foreground">Destination</p>
                    <p className="font-medium text-foreground">{destination}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-[#FF385C]" />
                  <div>
                    <p className="text-sm text-muted-foreground">Dates</p>
                    <p className="font-medium text-foreground">
                      {startDate && endDate
                        ? `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")} (${tripDays} days)`
                        : "Flexible dates"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-[#FF385C]" />
                  <div>
                    <p className="text-sm text-muted-foreground">Travelers</p>
                    <p className="font-medium text-foreground">{travelers} {travelers === 1 ? "person" : "people"}</p>
                  </div>
                </div>

                {budget && (
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-[#FF385C]" />
                    <div>
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="font-medium text-foreground">${parseFloat(budget).toLocaleString()}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {interests.map(interest => (
                      <Badge key={interest} variant="secondary">
                        {INTEREST_OPTIONS.find(i => i.id === interest)?.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Pace</p>
                  <p className="font-medium text-foreground capitalize">{pacePreference}</p>
                </div>

                {dietaryRestrictions.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Dietary</p>
                    <div className="flex flex-wrap gap-2">
                      {dietaryRestrictions.map(diet => (
                        <Badge key={diet} variant="outline">{diet}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {generateMutation.isPending && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF385C] mb-4" />
                <p className="text-muted-foreground text-sm">
                  AI is crafting your personalized itinerary...
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  This may take 15-30 seconds
                </p>
              </div>
            )}

            {generateMutation.isError && (
              <div className="flex items-start gap-3 p-4 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Generation Failed</p>
                  <p className="text-sm mt-1">
                    {(generateMutation.error as any)?.message || "Unable to generate itinerary. Please try again."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    className="mt-3"
                    data-testid="button-retry-generate"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      case 3:
        if (!generatedItinerary) return null;
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Itinerary Generated</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground">{generatedItinerary.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{generatedItinerary.summary}</p>
            </div>

            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-4">
              <div>
                <p className="text-sm text-muted-foreground">Estimated Total</p>
                <p className="text-2xl font-bold text-foreground">
                  ${generatedItinerary.totalEstimatedCost?.toLocaleString() || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" data-testid="button-download">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" data-testid="button-share">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {generatedItinerary.dailyItinerary.map((day, index) => (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(index)}
                  className={cn(
                    "flex-shrink-0 px-4 py-2 rounded-lg border-2 transition-all",
                    selectedDay === index
                      ? "border-[#FF385C] bg-[#FF385C]/5 text-[#FF385C]"
                      : "border-border text-muted-foreground hover-elevate"
                  )}
                  data-testid={`button-day-${day.day}`}
                >
                  <span className="text-sm font-medium">Day {day.day}</span>
                </button>
              ))}
            </div>

            {generatedItinerary.dailyItinerary[selectedDay] && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    {generatedItinerary.dailyItinerary[selectedDay].theme}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {generatedItinerary.dailyItinerary[selectedDay].date}
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                      {generatedItinerary.dailyItinerary[selectedDay].activities.map((activity, idx) => (
                        <div key={idx} className="flex gap-3 pb-4 border-b last:border-0">
                          <div className="flex-shrink-0 w-16 text-sm text-muted-foreground">
                            {activity.time}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start gap-2">
                              {getActivityIcon(activity.type)}
                              <div>
                                <p className="font-medium text-foreground">{activity.name}</p>
                                <p className="text-sm text-muted-foreground">{activity.location}</p>
                                <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {activity.duration}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    ${activity.estimatedCost}
                                  </span>
                                  {activity.bookingRequired && (
                                    <Badge variant="secondary" className="text-xs">Booking Required</Badge>
                                  )}
                                </div>
                                {activity.tips && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1">
                                    <LightbulbIcon className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                    {activity.tips}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {generatedItinerary.travelTips && generatedItinerary.travelTips.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <LightbulbIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    Travel Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {generatedItinerary.travelTips.slice(0, 4).map((tip, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-[#FF385C]">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {currentStep < 3 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            {steps.slice(0, 3).map((step, index) => (
              <div key={step.label} className="flex items-center">
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-all",
                  index < currentStep
                    ? "bg-[#FF385C] border-[#FF385C] text-white"
                    : index === currentStep
                    ? "border-[#FF385C] text-[#FF385C]"
                    : "border-muted text-muted-foreground"
                )}>
                  {index < currentStep ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < 2 && (
                  <div className={cn(
                    "h-0.5 w-8 sm:w-16 mx-2",
                    index < currentStep ? "bg-[#FF385C]" : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>
          <Progress value={(currentStep / 2) * 100} className="h-1" />
        </div>
      )}

      {renderStepContent()}

      {currentStep < 3 && !generateMutation.isPending && (
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-[#FF385C] hover:bg-[#FF385C]/90"
            data-testid="button-next"
          >
            {currentStep === 2 ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Itinerary
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}

      {currentStep === 3 && generatedItinerary && (
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setCurrentStep(0);
              setGeneratedItinerary(null);
            }}
            className="flex-1"
            data-testid="button-start-over"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Start Over
          </Button>
          <Button
            className="flex-1 bg-[#FF385C] hover:bg-[#FF385C]/90"
            data-testid="button-use-itinerary"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Use This Itinerary
          </Button>
        </div>
      )}
    </div>
  );
}
