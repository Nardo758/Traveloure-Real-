import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { InlineTransportSelector } from "@/components/itinerary/InlineTransportSelector";
import { TransportHub } from "@/components/itinerary/TransportHub";
import {
  Calendar,
  MapPin,
  Clock,
  DollarSign,
  Users,
  Plane,
  Train,
  Car,
  Hotel,
  Utensils,
  Coffee,
  Sunrise,
  Sunset,
  Moon,
  Star,
  Check,
  Download,
  Printer,
  Share2,
  CalendarPlus,
  ChevronRight,
  ChevronDown,
  Info,
  Sparkles,
  Heart,
  Activity,
  Zap,
  TrendingUp,
  BarChart3,
  PieChart,
  Lightbulb,
  Brain,
  Timer,
  Mountain,
  Waves,
  TreePine,
  Camera,
  ShoppingBag,
  Music,
  Ticket,
  ExternalLink,
  Navigation,
  ArrowRight,
  CircleDot,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TemporalAnchorManager, ScheduleValidator, EnergyBudgetDisplay, AnchorSuggestionsPanel, TripLogisticsDashboard } from "@/components/logistics";

interface ItineraryItem {
  id: string;
  dayNumber: number;
  timeSlot: string;
  startTime: string;
  endTime: string;
  name: string;
  description: string;
  serviceType: string;
  price: string;
  rating: string;
  location: string;
  duration: number;
  travelTimeFromPrevious: number;
  methodologyNote?: string;
  methodologyReason?: string;
  bookingStatus?: 'confirmed' | 'pending' | 'not_required';
  bookingReference?: string;
}

interface TransportPackage {
  type: 'flight' | 'train' | 'transfer' | 'metro_pass' | 'car_rental';
  name: string;
  description: string;
  details: string;
  price: number;
  included: boolean;
  bookingUrl?: string;
}

interface AccommodationPackage {
  id: string;
  name: string;
  type: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rating: number;
  price: number;
  amenities: string[];
  location: string;
  imageUrl?: string;
  bookingStatus: 'confirmed' | 'pending';
}

interface ItineraryMetrics {
  costByCategory: Record<string, number>;
  totalCost: number;
  avgCostPerDay: number;
  avgCostPerPerson: number;
  activeMinutes: number;
  relaxationMinutes: number;
  travelMinutes: number;
  diningMinutes: number;
  avgIntensity: number;
  peakIntensity: number;
  balanceScore: number;
  diversityScore: number;
  paceScore: number;
  wellnessScore: number;
  overallScore: number;
  adventureCount: number;
  culturalCount: number;
  diningCount: number;
  relaxationCount: number;
}

interface TransportAlternative {
  mode: string;
  durationMinutes: number;
  costUsd: number | null;
  energyCost: number;
  reason: string;
}

interface TransportLegData {
  id: string;
  legOrder: number;
  fromName: string;
  toName: string;
  recommendedMode: string;
  userSelectedMode: string | null;
  distanceDisplay: string;
  distanceMeters?: number;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  energyCost?: number;
  alternativeModes?: TransportAlternative[];
  linkedProductUrl?: string | null;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
}

interface ItineraryDay {
  dayNumber: number;
  activities: ItineraryItem[];
  transportLegs: TransportLegData[];
}

interface ItineraryData {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  status: string;
  items: ItineraryItem[];
  days?: ItineraryDay[];
  transportPackage: TransportPackage[];
  accommodations: AccommodationPackage[];
  metrics: ItineraryMetrics;
  dayNotes: Array<{ dayNumber: number; note: string; methodology: string }>;
  itineraryNotes: Array<{ note: string; methodology: string; category: string }>;
  aiReasoning?: string;
}

// Icon mapping for service types
function getServiceIcon(serviceType: string) {
  const type = serviceType.toLowerCase();
  if (type.includes('hik') || type.includes('trek') || type.includes('mountain')) return Mountain;
  if (type.includes('beach') || type.includes('water') || type.includes('surf')) return Waves;
  if (type.includes('spa') || type.includes('wellness') || type.includes('massage')) return Heart;
  if (type.includes('restaurant') || type.includes('dinner') || type.includes('lunch')) return Utensils;
  if (type.includes('breakfast') || type.includes('cafe') || type.includes('coffee')) return Coffee;
  if (type.includes('museum') || type.includes('gallery') || type.includes('cultural')) return Camera;
  if (type.includes('shop') || type.includes('market')) return ShoppingBag;
  if (type.includes('show') || type.includes('concert') || type.includes('music')) return Music;
  if (type.includes('tour') || type.includes('walk') || type.includes('sightse')) return MapPin;
  if (type.includes('adventure') || type.includes('activity')) return Zap;
  if (type.includes('nature') || type.includes('park') || type.includes('garden')) return TreePine;
  return Ticket;
}

// Time slot icon
function getTimeSlotIcon(timeSlot: string) {
  const slot = timeSlot?.toLowerCase() || '';
  if (slot.includes('morning') || slot.includes('breakfast')) return Sunrise;
  if (slot.includes('afternoon') || slot.includes('lunch')) return Clock;
  if (slot.includes('evening') || slot.includes('dinner')) return Sunset;
  if (slot.includes('night')) return Moon;
  return Clock;
}

// Transport type icon
function getTransportIcon(type: string) {
  switch (type) {
    case 'flight': return Plane;
    case 'train': return Train;
    case 'transfer':
    case 'car_rental': return Car;
    default: return Navigation;
  }
}

// Category color for badges
function getCategoryColor(category: string): string {
  switch (category.toLowerCase()) {
    case 'adventure': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'wellness': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'dining': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'culture & entertainment': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'transport': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  }
}

export default function MyItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [activeTab, setActiveTab] = useState("timeline");

  // Fetch itinerary data
  const { data, isLoading, error } = useQuery<ItineraryData>({
    queryKey: ['/api/my-itinerary', id],
  });

  // User is the trip owner if logged in and the itinerary belongs to them
  const isOwner = !!user && !!data && user.id === data.userId;
  const transportReadOnly = !isOwner;

  const toggleDay = (day: number) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(day)) {
      newExpanded.delete(day);
    } else {
      newExpanded.add(day);
    }
    setExpandedDays(newExpanded);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    toast({
      title: "Generating PDF",
      description: "Your itinerary PDF is being generated...",
    });
    // PDF generation would be implemented here
  };

  const handleAddToCalendar = async () => {
    try {
      const response = await fetch(`/api/my-itinerary/${id}/calendar`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `traveloure-itinerary-${id}.ics`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Calendar Downloaded",
        description: "Import the .ics file to your calendar app",
      });
    } catch (err) {
      toast({
        title: "Download Failed",
        description: "Could not generate calendar file",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/shared-itinerary/${id}`;
    if (navigator.share) {
      await navigator.share({
        title: data?.title || 'My Traveloure Itinerary',
        url: shareUrl,
      });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied",
        description: "Share link copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-48 md:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Itinerary Not Found</h1>
          <p className="text-muted-foreground mb-4">This itinerary may have been removed or doesn't exist.</p>
          <Link href="/my-trips">
            <Button data-testid="button-back-to-trips">Back to My Trips</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  // Group items and transport legs by day
  // Prefer the days structure from API if available (has transport legs), otherwise build from items
  const itemsByDay = data.items.reduce((acc, item) => {
    if (!acc[item.dayNumber]) acc[item.dayNumber] = [];
    acc[item.dayNumber].push(item);
    return acc;
  }, {} as Record<number, ItineraryItem[]>);

  const legsByDay = data.days?.reduce((acc, day) => {
    acc[day.dayNumber] = day.transportLegs || [];
    return acc;
  }, {} as Record<number, TransportLegData[]>) || {};

  const numDays = Math.max(...Object.keys(itemsByDay).map(Number), 1);

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl print:max-w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Traveloure Itinerary
              </Badge>
              {data.status === 'confirmed' && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <Check className="h-3 w-3 mr-1" />
                  Confirmed
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-itinerary-title">
              {data.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {data.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(data.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(data.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {data.travelers} traveler{data.travelers > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleAddToCalendar} data-testid="button-add-calendar">
              <CalendarPlus className="h-4 w-4 mr-1" />
              Add to Calendar
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} data-testid="button-download-pdf">
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} data-testid="button-share">
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          </div>
        </div>

        {/* Overall Score Card */}
        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">{Math.round(data.metrics?.overallScore || 0)}</span>
                </div>
                <div>
                  <h3 className="font-semibold">Traveloure Score</h3>
                  <p className="text-sm text-muted-foreground">Based on balance, pacing, and wellness optimization</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-primary">{Math.round(data.metrics?.balanceScore || 0)}%</div>
                  <div className="text-xs text-muted-foreground">Balance</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{Math.round(data.metrics?.diversityScore || 0)}%</div>
                  <div className="text-xs text-muted-foreground">Diversity</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">{Math.round(data.metrics?.paceScore || 0)}%</div>
                  <div className="text-xs text-muted-foreground">Pacing</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-purple-600">{Math.round(data.metrics?.wellnessScore || 0)}%</div>
                  <div className="text-xs text-muted-foreground">Wellness</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Methodology Notes */}
        {data.itineraryNotes && data.itineraryNotes.length > 0 && (
          <Card className="mb-6 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-amber-600" />
                Trip Strategy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.itineraryNotes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{note.note}</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="text-xs text-amber-700 dark:text-amber-400 underline decoration-dotted">
                              Why?
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-sm">{note.methodology}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="print:hidden">
          <TabsList className="mb-6">
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Calendar className="h-4 w-4 mr-1" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="packages" data-testid="tab-packages">
              <Plane className="h-4 w-4 mr-1" />
              Packages
            </TabsTrigger>
            <TabsTrigger value="metrics" data-testid="tab-metrics">
              <BarChart3 className="h-4 w-4 mr-1" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="logistics" data-testid="tab-logistics">
              <Package className="h-4 w-4 mr-1" />
              Logistics
            </TabsTrigger>
            <TabsTrigger value="transport" data-testid="tab-transport">
              <Car className="h-4 w-4 mr-1" />
              Transport
            </TabsTrigger>
          </TabsList>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4">
            {Array.from({ length: numDays }, (_, i) => i + 1).map((dayNum) => {
              const dayItems = itemsByDay[dayNum] || [];
              const isExpanded = expandedDays.has(dayNum);
              const dayNote = data.dayNotes?.find(n => n.dayNumber === dayNum);
              const date = new Date(data.startDate);
              date.setDate(date.getDate() + dayNum - 1);

              return (
                <Card key={dayNum} className="overflow-hidden">
                  <CardHeader
                    className="cursor-pointer hover-elevate py-3"
                    onClick={() => toggleDay(dayNum)}
                    data-testid={`card-day-${dayNum}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary">{dayNum}</span>
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            Day {dayNum} - {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          </CardTitle>
                          <CardDescription>
                            {dayItems.length} activities
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {dayNote && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs">
                                  <Lightbulb className="h-3 w-3 mr-1" />
                                  Tip
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium mb-1">{dayNote.note}</p>
                                <p className="text-xs text-muted-foreground">{dayNote.methodology}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="relative pl-6 space-y-4">
                        {/* Timeline line */}
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />

                        {dayItems.map((item, idx) => {
                          const ServiceIcon = getServiceIcon(item.serviceType);
                          const TimeIcon = getTimeSlotIcon(item.timeSlot);
                          const legAfter = legsByDay[dayNum]?.find(l => l.legOrder === idx + 1);

                          return (
                            <div key={item.id}>
                              <div className="relative" data-testid={`activity-${item.id}`}>
                                {/* Timeline dot */}
                                <div className="absolute -left-4 top-3 h-3 w-3 rounded-full bg-primary border-2 border-background" />

                                {/* Travel time indicator */}
                                {item.travelTimeFromPrevious > 0 && idx > 0 && (
                                  <div className="absolute -left-6 -top-3 text-xs text-muted-foreground flex items-center gap-1">
                                    <Navigation className="h-3 w-3" />
                                    {item.travelTimeFromPrevious} min
                                  </div>
                                )}

                                <div className="bg-muted/30 rounded-lg p-4 ml-2">
                                  <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          <TimeIcon className="h-3 w-3 mr-1" />
                                          {item.startTime}
                                        </Badge>
                                        {item.bookingStatus === 'confirmed' && (
                                          <Badge className="bg-green-100 text-green-700 text-xs">
                                            <Check className="h-3 w-3 mr-1" />
                                            Confirmed
                                          </Badge>
                                        )}
                                      </div>
                                      <h4 className="font-medium flex items-center gap-2">
                                        <ServiceIcon className="h-4 w-4 text-primary shrink-0" />
                                        {item.name}
                                      </h4>
                                      {item.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                          {item.description}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                                        {item.location && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {item.location}
                                          </span>
                                        )}
                                        {item.duration && (
                                          <span className="flex items-center gap-1">
                                            <Timer className="h-3 w-3" />
                                            {item.duration} min
                                          </span>
                                        )}
                                        {parseFloat(item.rating) > 0 && (
                                          <span className="flex items-center gap-1">
                                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                            {parseFloat(item.rating).toFixed(1)}
                                          </span>
                                        )}
                                      </div>

                                      {/* Methodology Note */}
                                      {item.methodologyNote && (
                                        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-xs flex items-start gap-2">
                                          <Lightbulb className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                                          <span className="text-amber-800 dark:text-amber-200">{item.methodologyNote}</span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="text-right shrink-0">
                                      <div className="font-bold">${parseFloat(item.price || "0").toLocaleString()}</div>
                                      {item.bookingReference && (
                                        <div className="text-xs text-muted-foreground">
                                          Ref: {item.bookingReference}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Render transport leg after activity */}
                              {legAfter && (
                                <InlineTransportSelector
                                  leg={legAfter}
                                  readOnly={false}
                                  dayNumber={dayNum}
                                  className="my-2 ml-2"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-6">
            {/* Transport Package */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="h-5 w-5 text-primary" />
                  Transport Package
                </CardTitle>
                <CardDescription>
                  All transportation included in your trip
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.transportPackage && data.transportPackage.length > 0 ? (
                  <div className="space-y-4">
                    {data.transportPackage.map((transport, idx) => {
                      const TransportIcon = getTransportIcon(transport.type);
                      return (
                        <div key={idx} className="flex items-start justify-between gap-4 p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <TransportIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">{transport.name}</h4>
                              <p className="text-sm text-muted-foreground">{transport.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">{transport.details}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold">${transport.price.toLocaleString()}</div>
                            {transport.included ? (
                              <Badge className="bg-green-100 text-green-700 text-xs">Included</Badge>
                            ) : transport.bookingUrl && (
                              <Button variant="outline" size="sm" asChild className="mt-1">
                                <a href={transport.bookingUrl} target="_blank" rel="noopener noreferrer">
                                  Book <ExternalLink className="h-3 w-3 ml-1" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No transport packages added yet</p>
                )}
              </CardContent>
            </Card>

            {/* Accommodation Package */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hotel className="h-5 w-5 text-primary" />
                  Accommodation Package
                </CardTitle>
                <CardDescription>
                  Your stays during the trip
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.accommodations && data.accommodations.length > 0 ? (
                  <div className="space-y-4">
                    {data.accommodations.map((stay) => (
                      <div key={stay.id} className="p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{stay.name}</h4>
                              <Badge variant="outline" className="text-xs">{stay.type}</Badge>
                              {stay.bookingStatus === 'confirmed' && (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  <Check className="h-3 w-3 mr-1" />
                                  Confirmed
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {stay.location}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-sm">
                              <span>{stay.checkIn} - {stay.checkOut}</span>
                              <span className="text-muted-foreground">({stay.nights} nights)</span>
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {stay.rating.toFixed(1)}
                              </span>
                            </div>
                            {stay.amenities && stay.amenities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {stay.amenities.slice(0, 4).map((amenity, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">{amenity}</Badge>
                                ))}
                                {stay.amenities.length > 4 && (
                                  <Badge variant="secondary" className="text-xs">+{stay.amenities.length - 4} more</Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">${stay.price.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">total</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No accommodations added yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Cost Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Cost Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.metrics?.costByCategory && Object.entries(data.metrics.costByCategory).map(([category, amount]) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Badge className={cn("text-xs", getCategoryColor(category))}>{category}</Badge>
                        </span>
                        <span className="font-medium">${amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center justify-between font-bold">
                      <span>Total</span>
                      <span>${data.metrics?.totalCost?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Per Day</span>
                      <span>${data.metrics?.avgCostPerDay?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Per Person</span>
                      <span>${data.metrics?.avgCostPerPerson?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time Allocation */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChart className="h-4 w-4" />
                    Time Allocation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-orange-500" />
                          Active
                        </span>
                        <span>{Math.round(data.metrics?.activeMinutes / 60 || 0)}h</span>
                      </div>
                      <Progress value={data.metrics?.activeMinutes ? (data.metrics.activeMinutes / (data.metrics.activeMinutes + data.metrics.relaxationMinutes + data.metrics.diningMinutes) * 100) : 0} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <Heart className="h-4 w-4 text-purple-500" />
                          Relaxation
                        </span>
                        <span>{Math.round(data.metrics?.relaxationMinutes / 60 || 0)}h</span>
                      </div>
                      <Progress value={data.metrics?.relaxationMinutes ? (data.metrics.relaxationMinutes / (data.metrics.activeMinutes + data.metrics.relaxationMinutes + data.metrics.diningMinutes) * 100) : 0} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <Utensils className="h-4 w-4 text-amber-500" />
                          Dining
                        </span>
                        <span>{Math.round(data.metrics?.diningMinutes / 60 || 0)}h</span>
                      </div>
                      <Progress value={data.metrics?.diningMinutes ? (data.metrics.diningMinutes / (data.metrics.activeMinutes + data.metrics.relaxationMinutes + data.metrics.diningMinutes) * 100) : 0} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <Navigation className="h-4 w-4 text-gray-500" />
                          Travel
                        </span>
                        <span>{Math.round(data.metrics?.travelMinutes / 60 || 0)}h</span>
                      </div>
                      <Progress value={20} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Intensity Tracking */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Physical Intensity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Average Intensity</span>
                      <Badge variant="outline">{data.metrics?.avgIntensity?.toFixed(1) || 0}/10</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Peak Intensity</span>
                      <Badge variant="outline">{data.metrics?.peakIntensity || 0}/10</Badge>
                    </div>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      Intensity levels follow the Energy Wave principle - alternating high and low intensity activities for sustainable enjoyment.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Activity Balance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Activity Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                      <Mountain className="h-5 w-5 mx-auto text-orange-600 mb-1" />
                      <div className="font-bold">{data.metrics?.adventureCount || 0}</div>
                      <div className="text-xs text-muted-foreground">Adventure</div>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <Camera className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                      <div className="font-bold">{data.metrics?.culturalCount || 0}</div>
                      <div className="text-xs text-muted-foreground">Cultural</div>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                      <Utensils className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                      <div className="font-bold">{data.metrics?.diningCount || 0}</div>
                      <div className="text-xs text-muted-foreground">Dining</div>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                      <Heart className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                      <div className="font-bold">{data.metrics?.relaxationCount || 0}</div>
                      <div className="text-xs text-muted-foreground">Relaxation</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="logistics" className="space-y-4">
            {id && (
              <>
                <TripLogisticsDashboard
                  tripId={id}
                  tripName={data?.title || data?.destination || "Trip"}
                  budget={0}
                  destination={data?.destination || "destination"}
                />
                <div className="grid md:grid-cols-2 gap-4">
                  <TemporalAnchorManager tripId={id} />
                  <ScheduleValidator tripId={id} />
                </div>
                <EnergyBudgetDisplay tripId={id} />
                <AnchorSuggestionsPanel tripId={id} />
              </>
            )}
          </TabsContent>

          <TabsContent value="transport" className="space-y-6">
            <TransportHub
              tripId={id}
              readOnly={false}
              onNavigateToDay={(dayNumber) => {
                const dayEl = document.getElementById(`itinerary-day-${dayNumber}`);
                if (dayEl) {
                  dayEl.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            />
          </TabsContent>
        </Tabs>

        {/* Print-only full timeline */}
        <div className="hidden print:block space-y-6 mt-8">
          <h2 className="text-xl font-bold">Complete Itinerary</h2>
          {Array.from({ length: numDays }, (_, i) => i + 1).map((dayNum) => {
            const dayItems = itemsByDay[dayNum] || [];
            const date = new Date(data.startDate);
            date.setDate(date.getDate() + dayNum - 1);

            return (
              <div key={dayNum} className="border rounded-lg p-4 break-inside-avoid">
                <h3 className="font-bold mb-3">
                  Day {dayNum} - {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                      <div>
                        <span className="font-medium">{item.startTime}</span> - {item.name}
                        {item.location && <span className="text-gray-500 ml-2">({item.location})</span>}
                      </div>
                      <div className="font-medium">${parseFloat(item.price || "0").toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
