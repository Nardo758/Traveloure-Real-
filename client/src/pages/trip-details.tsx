import { useTrip, useGenerateItinerary } from "@/hooks/use-trips";
import { useParams, Link } from "wouter";
import { Loader2, Calendar, MapPin, Sparkles, User, ArrowRight, ArrowLeft, Clock, Coffee, Camera, Utensils, Bed, Plane, ChevronRight, ShoppingCart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

const sampleItinerary = [
  {
    day: 1,
    title: "Arrival & Exploration",
    activities: [
      { time: "10:00 AM", activity: "Arrive and check into hotel", icon: Plane, type: "travel" },
      { time: "12:00 PM", activity: "Lunch at local restaurant", icon: Utensils, type: "food" },
      { time: "2:00 PM", activity: "Explore the city center", icon: Camera, type: "sightseeing" },
      { time: "7:00 PM", activity: "Dinner and rest", icon: Bed, type: "rest" },
    ]
  },
  {
    day: 2,
    title: "Cultural Discovery",
    activities: [
      { time: "8:00 AM", activity: "Breakfast at hotel", icon: Coffee, type: "food" },
      { time: "10:00 AM", activity: "Visit historical sites", icon: Camera, type: "sightseeing" },
      { time: "1:00 PM", activity: "Traditional lunch experience", icon: Utensils, type: "food" },
      { time: "3:00 PM", activity: "Museum tour", icon: Camera, type: "sightseeing" },
      { time: "7:00 PM", activity: "Evening entertainment", icon: Coffee, type: "entertainment" },
    ]
  },
  {
    day: 3,
    title: "Adventure Day",
    activities: [
      { time: "7:00 AM", activity: "Early breakfast", icon: Coffee, type: "food" },
      { time: "9:00 AM", activity: "Outdoor adventure activity", icon: Camera, type: "adventure" },
      { time: "1:00 PM", activity: "Scenic lunch spot", icon: Utensils, type: "food" },
      { time: "4:00 PM", activity: "Shopping and souvenirs", icon: Coffee, type: "shopping" },
      { time: "8:00 PM", activity: "Farewell dinner", icon: Utensils, type: "food" },
    ]
  }
];

interface ProviderService {
  id: string;
  providerId: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: string;
  pricingType: string;
  duration: string | null;
  location: string | null;
  rating: string | null;
  reviewCount: number;
  isActive: boolean;
  bookingCount: number;
}

export default function TripDetails() {
  const { id } = useParams();
  const { data: trip, isLoading } = useTrip(id || "");
  const generateItinerary = useGenerateItinerary();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: servicesResult, isLoading: servicesLoading } = useQuery<{ services: ProviderService[], total: number }>({
    queryKey: ["/api/services", { destination: trip?.destination }],
    enabled: !!trip?.destination,
  });

  const handleAddToCart = (serviceId: string) => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Sign in required", 
        description: "Please sign in to add items to your cart" 
      });
      window.location.href = "/api/login";
      return;
    }
    addToCartMutation.mutate(serviceId);
  };

  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart!", description: "Service has been added to your cart." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to add to cart", description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Trip not found</h2>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const duration = differenceInDays(endDate, startDate) + 1;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Header */}
      <div className="relative h-[45vh] min-h-[350px]">
        <img 
          src={`https://source.unsplash.com/1600x900/?${encodeURIComponent(trip.destination)},travel,landmark`}
          alt={trip.destination}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        
        {/* Back Button */}
        <div className="absolute top-4 left-4">
          <Link href="/dashboard">
            <Button variant="outline" className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>

        {/* Trip Info */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-8">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-white/20 backdrop-blur-md text-white border-0">
                <MapPin className="w-3 h-3 mr-1" />
                {trip.destination}
              </Badge>
              <Badge className="bg-accent/80 backdrop-blur-md text-white border-0">
                {trip.status}
              </Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">{trip.title}</h1>
            <div className="flex flex-wrap gap-6 text-white/90">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {format(startDate, "MMMM d")} - {format(endDate, "MMMM d, yyyy")}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {duration} {duration === 1 ? 'day' : 'days'}
              </div>
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {trip.numberOfTravelers} Traveler{trip.numberOfTravelers !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 -mt-6 relative z-10">
        <Card className="shadow-xl border-0">
          <CardContent className="p-0">
            <Tabs defaultValue="itinerary">
              <div className="border-b border-border px-6 pt-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="itinerary" data-testid="tab-itinerary">Itinerary</TabsTrigger>
                    <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings</TabsTrigger>
                    <TabsTrigger value="expert" data-testid="tab-expert">Ask an Expert</TabsTrigger>
                  </TabsList>

                  <Button 
                    onClick={() => generateItinerary.mutate(trip.id)}
                    disabled={generateItinerary.isPending}
                    className="hidden md:flex"
                    data-testid="button-regenerate"
                  >
                    {generateItinerary.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Regenerate Plan
                  </Button>
                </div>
              </div>

              <div className="p-6">
                <TabsContent value="itinerary" className="mt-0 space-y-6">
                  {/* Sample Itinerary Timeline */}
                  <div className="space-y-8">
                    {sampleItinerary.slice(0, Math.min(duration, 3)).map((day, dayIndex) => (
                      <motion.div
                        key={day.day}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: dayIndex * 0.1 }}
                      >
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                            {day.day}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Day {day.day}</h3>
                            <p className="text-muted-foreground">{day.title}</p>
                          </div>
                        </div>

                        <div className="ml-6 pl-6 border-l-2 border-border space-y-4">
                          {day.activities.map((activity, actIndex) => (
                            <div 
                              key={actIndex}
                              className="relative flex items-start gap-4 p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                            >
                              <div className="absolute -left-[33px] w-4 h-4 rounded-full bg-primary border-4 border-background" />
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <activity.icon className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <div className="text-xs text-muted-foreground mb-1">{activity.time}</div>
                                <p className="font-medium text-slate-900 dark:text-white">{activity.activity}</p>
                              </div>
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {duration > 3 && (
                    <div className="text-center py-6 border-t border-border">
                      <p className="text-muted-foreground mb-4">
                        + {duration - 3} more days of activities
                      </p>
                      <Button variant="outline" data-testid="button-view-full">
                        View Full Itinerary
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="bookings" className="mt-0">
                  <div className="text-center py-16">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                      <Plane className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Bookings Yet</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                      Add flights, hotels, and activities to your trip to keep everything organized in one place.
                    </p>
                    <Button variant="outline" data-testid="button-add-booking">
                      Add a Booking
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="expert" className="mt-0">
                  <div className="space-y-8 py-4">
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                          Connect with a Local Expert
                        </h3>
                        <p className="text-muted-foreground mb-6">
                          Get personalized advice, hidden gems, and real-time support from someone who lives in {trip.destination}.
                        </p>
                        <Link href="/chat">
                          <Button className="gap-2" data-testid="button-find-expert">
                            Chat with Expert <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                      <div className="relative">
                        <img 
                          src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=600&auto=format&fit=crop"
                          alt="Local Expert"
                          className="rounded-2xl shadow-xl"
                        />
                      </div>
                    </div>
                    
                    <div className="border-t border-border pt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                          Available Services for Your Trip
                        </h4>
                        <Link href="/discover">
                          <Button variant="outline" size="sm" data-testid="button-browse-all">
                            Browse All <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                      
                      {servicesLoading ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {[1, 2, 3].map((i) => (
                            <Card key={i}>
                              <CardContent className="p-4">
                                <Skeleton className="h-5 w-3/4 mb-2" />
                                <Skeleton className="h-4 w-full mb-3" />
                                <div className="flex justify-between">
                                  <Skeleton className="h-6 w-20" />
                                  <Skeleton className="h-8 w-24" />
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : servicesResult && servicesResult.services.length > 0 ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {servicesResult.services.slice(0, 6).map((service) => (
                            <Card key={service.id} data-testid={`card-service-${service.id}`}>
                              <CardContent className="p-4">
                                <h5 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">
                                  {service.name}
                                </h5>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                  {service.description}
                                </p>
                                <div className="flex items-center gap-2 mb-3">
                                  {service.rating && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Star className="w-3 h-3 fill-current" />
                                      {parseFloat(service.rating).toFixed(1)}
                                    </Badge>
                                  )}
                                  {service.location && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {service.location}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-lg">${parseFloat(service.basePrice).toFixed(0)}</span>
                                  <Button 
                                    size="sm"
                                    onClick={() => handleAddToCart(service.id)}
                                    disabled={addToCartMutation.isPending}
                                    data-testid={`button-add-cart-${service.id}`}
                                  >
                                    {addToCartMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <ShoppingCart className="w-4 h-4 mr-1" />
                                        Add
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p>No services found for {trip.destination}.</p>
                          <p className="text-sm mt-1">Check out our full marketplace for other options.</p>
                          <Link href="/discover">
                            <Button variant="outline" className="mt-4" data-testid="button-discover">
                              Browse Marketplace
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
