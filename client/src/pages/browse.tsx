import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  ShoppingCart,
  Plus,
  X,
  Star,
  Clock,
  Calendar,
  MapPin,
  Users,
  Check,
  Sparkles,
  Plane,
  Building,
  UtensilsCrossed,
  Ticket,
  ChevronDown,
  Filter,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CartItem {
  id: string;
  type: "activity" | "hotel" | "service" | "restaurant";
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
}

interface Activity {
  id: string;
  name: string;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  duration: string;
  provider: string;
  image?: string;
  features: string[];
  dates: string;
}

interface Hotel {
  id: string;
  name: string;
  description: string;
  pricePerNight: number;
  totalPrice: number;
  rating: number;
  reviewCount: number;
  location: string;
  provider: string;
  features: string[];
  roomType: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  provider: string;
  features: string[];
  category: string;
}

const sampleActivities: Activity[] = [
  {
    id: "act-1",
    name: "Eiffel Tower Skip-the-Line + Summit Access",
    description: "Skip the 2-hour wait with priority access to summit. Includes elevator to all levels + panoramic city views.",
    price: 89,
    rating: 4.8,
    reviewCount: 12483,
    duration: "2 hours",
    provider: "GetYourGuide",
    features: ["Skip-the-line", "Mobile ticket", "Free cancellation"],
    dates: "Flexible dates",
  },
  {
    id: "act-2",
    name: "Champagne Day Trip: Moet, Dom Perignon + Lunch",
    description: "Full-day tour to Champagne region. Visit Moet & Chandon, Dom Perignon cellars. Includes tastings, lunch, transport.",
    price: 249,
    rating: 4.9,
    reviewCount: 3421,
    duration: "9 hours",
    provider: "Viator",
    features: ["Transport included", "Lunch included", "24hr cancellation"],
    dates: "Available Jan 4,6,8",
  },
  {
    id: "act-3",
    name: "Louvre Museum Skip-Line + Mona Lisa Priority",
    description: "Skip ticket lines + fast-track to Mona Lisa. Expert guide shares secrets of Venus de Milo, Winged Victory & more.",
    price: 65,
    rating: 4.7,
    reviewCount: 18932,
    duration: "3 hours",
    provider: "Klook",
    features: ["Skip-the-line", "Expert guide", "Free cancellation"],
    dates: "Flexible dates",
  },
  {
    id: "act-4",
    name: "Paris Food Tour: Marais District + Wine Tasting",
    description: "Authentic food tour through historic Marais. 10+ tastings: cheese, charcuterie, pastries, wine. Small groups (max 10).",
    price: 119,
    rating: 5.0,
    reviewCount: 892,
    duration: "3.5 hours",
    provider: "Fever",
    features: ["Local guide", "All food included", "Small group"],
    dates: "Daily except Monday",
  },
  {
    id: "act-5",
    name: "Moulin Rouge Show + Champagne + 3-Course Dinner",
    description: "Iconic cabaret show with 100 performers. Includes VIP seats, 3-course French dinner, half-bottle Champagne per person.",
    price: 189,
    rating: 4.6,
    reviewCount: 7234,
    duration: "4 hours",
    provider: "GetYourGuide",
    features: ["VIP seating", "Dinner included", "Champagne included"],
    dates: "Nightly 9pm",
  },
];

const sampleHotels: Hotel[] = [
  {
    id: "hotel-1",
    name: "Hotel Monge - Boutique Hotel, Latin Quarter",
    description: "Charming boutique hotel in historic building. Modern rooms with Eiffel Tower views. Walking distance to Notre Dame.",
    pricePerNight: 190,
    totalPrice: 1330,
    rating: 4.7,
    reviewCount: 2483,
    location: "Latin Quarter",
    provider: "Booking.com",
    features: ["Free WiFi", "Breakfast available", "Free cancellation"],
    roomType: "Superior Double (2 guests)",
  },
  {
    id: "hotel-2",
    name: "The Hoxton, Paris - Trendy Boutique Hotel",
    description: "Hip boutique hotel in renovated 18th-century building. Rooftop terrace, locally-curated design, trendy bar.",
    pricePerNight: 235,
    totalPrice: 1645,
    rating: 4.8,
    reviewCount: 3921,
    location: "2nd Arr.",
    provider: "Hotels.com",
    features: ["Free WiFi", "Minibar", "Free cancellation", "Breakfast available"],
    roomType: "Cosy Room (2 guests)",
  },
  {
    id: "hotel-3",
    name: "Airbnb: Charming Marais Apartment",
    description: "Authentic Parisian flat in best neighborhood. Exposed beams, full kitchen, balcony. Perfect for couples. Hosted by Marie.",
    pricePerNight: 160,
    totalPrice: 1120,
    rating: 4.9,
    reviewCount: 187,
    location: "Marais",
    provider: "Airbnb",
    features: ["WiFi", "Kitchen", "Washer", "Flexible cancellation"],
    roomType: "1-bedroom apartment (2 guests)",
  },
];

const sampleServices: Service[] = [
  {
    id: "svc-1",
    name: "Private Airport Transfer: CDG to Hotel",
    description: "Private sedan picks you up at CDG Airport. Driver meets you at arrivals with name sign. Direct to your hotel.",
    price: 75,
    rating: 4.9,
    reviewCount: 12483,
    provider: "Welcome Pickups",
    features: ["Flight tracking", "Meet & greet", "Free cancellation"],
    category: "Transportation",
  },
  {
    id: "svc-2",
    name: "7-Day Paris Metro Pass (Unlimited Zones 1-3)",
    description: "Unlimited metro, bus, RER travel for 7 days. Covers all major attractions in zones 1-3 including Versailles.",
    price: 54,
    rating: 4.6,
    reviewCount: 8234,
    provider: "Viator",
    features: ["Mobile ticket", "Instant delivery", "Covers Versailles"],
    category: "Transportation",
  },
  {
    id: "svc-3",
    name: "Vacation Photoshoot: 1-Hour Session + 50 Photos",
    description: "Professional photographer captures your Paris moments. Choose iconic locations: Eiffel Tower, Louvre, Seine. 50+ edited photos delivered within 7 days.",
    price: 189,
    rating: 4.9,
    reviewCount: 4231,
    provider: "Flytographer",
    features: ["Pro photographer", "Choose location", "7-day delivery"],
    category: "Photography",
  },
  {
    id: "svc-4",
    name: "Paris Museum Pass: 4 Days Unlimited Access",
    description: "Skip ticket lines at 60+ museums & monuments. Includes Louvre, Versailles, Orsay, Arc de Triomphe, Notre Dame.",
    price: 67,
    rating: 4.8,
    reviewCount: 23492,
    provider: "GetYourGuide",
    features: ["60+ attractions", "Skip-the-line", "Mobile ticket"],
    category: "Passes",
  },
];

export default function BrowsePage() {
  const [, setLocation] = useLocation();
  const [destination, setDestination] = useState("Paris, France");
  const [startDate, setStartDate] = useState("2026-01-02");
  const [endDate, setEndDate] = useState("2026-01-09");
  const [travelers, setTravelers] = useState(2);
  const [activeTab, setActiveTab] = useState("activities");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showInputForm, setShowInputForm] = useState(true);

  const nights = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const platformFee = Math.round(cartTotal * 0.03);
  const grandTotal = cartTotal + platformFee;

  const handleStartBrowsing = () => {
    setShowInputForm(false);
  };

  if (showInputForm) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Card className="border-gray-200">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Plan Your Trip
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="destination">Trip to:</Label>
                  <div className="relative">
                    <Input
                      id="destination"
                      placeholder="Eg: Paris, New York, Japan"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="pl-10"
                      data-testid="input-destination"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Travel Dates:</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="start-date" className="text-sm text-gray-500">From</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        data-testid="input-start-date"
                      />
                    </div>
                    <div>
                      <Label htmlFor="end-date" className="text-sm text-gray-500">To</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        data-testid="input-end-date"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">({nights} nights)</p>
                </div>

                <div className="space-y-2">
                  <Label>Travelers (Optional - helps with group activities):</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="adults" className="text-sm text-gray-500">Adults</Label>
                      <Input
                        id="adults"
                        type="number"
                        min={1}
                        value={travelers}
                        onChange={(e) => setTravelers(parseInt(e.target.value) || 1)}
                        data-testid="input-travelers"
                      />
                    </div>
                    <div>
                      <Label htmlFor="children" className="text-sm text-gray-500">Children</Label>
                      <Input
                        id="children"
                        type="number"
                        min={0}
                        defaultValue={0}
                        data-testid="input-children"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white h-12 text-lg font-semibold"
                  onClick={handleStartBrowsing}
                  data-testid="button-start-browsing"
                >
                  Start Browsing Experiences <ArrowRight className="w-5 h-5 ml-2" />
                </Button>

                <p className="text-center text-sm text-gray-500">
                  That's it! No budget questions, no preference surveys.
                  <br />Just browse and add what you like to your cart.
                </p>

                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <Sparkles className="w-5 h-5 text-[#FF385C] mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Once you've built your cart, our AI will show you optimized
                    alternatives that could save you hundreds of dollars!
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        {/* Header Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-[#FF385C]" />
              <span className="font-medium text-gray-900">{destination}</span>
              <span className="text-gray-400">|</span>
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">Jan 2-9, 2026</span>
            </div>

            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="relative" data-testid="button-open-cart">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  ${cartTotal.toLocaleString()} ({cart.length})
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF385C] text-white text-xs rounded-full flex items-center justify-center">
                      {cart.length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle>Your Cart</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-200px)] mt-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Your cart is empty</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Browse and add items to see your total cost
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {["activity", "hotel", "service"].map((type) => {
                        const items = cart.filter((i) => i.type === type);
                        if (items.length === 0) return null;
                        const typeLabel = type === "activity" ? "Activities" : type === "hotel" ? "Accommodation" : "Services";
                        const typeTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                        return (
                          <div key={type}>
                            <div className="flex items-center justify-between text-sm font-medium text-gray-500 mb-2">
                              <span>{typeLabel.toUpperCase()} ({items.length})</span>
                              <span>${typeTotal.toLocaleString()}</span>
                            </div>
                            {items.map((item) => (
                              <Card key={item.id} className="mb-2" data-testid={`cart-item-${item.id}`}>
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900 text-sm truncate">{item.name}</p>
                                      {item.details && (
                                        <p className="text-xs text-gray-500">{item.details}</p>
                                      )}
                                      {item.provider && (
                                        <p className="text-xs text-gray-400">via {item.provider}</p>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-gray-400 hover:text-red-500"
                                      onClick={() => removeFromCart(item.id)}
                                      data-testid={`button-remove-${item.id}`}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => updateQuantity(item.id, -1)}
                                        disabled={item.quantity <= 1}
                                        data-testid={`button-qty-minus-${item.id}`}
                                      >
                                        <span className="text-sm">-</span>
                                      </Button>
                                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => updateQuantity(item.id, 1)}
                                        data-testid={`button-qty-plus-${item.id}`}
                                      >
                                        <span className="text-sm">+</span>
                                      </Button>
                                    </div>
                                    <span className="font-medium text-gray-900">${(item.price * item.quantity).toLocaleString()}</span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        );
                      })}

                      <Separator />

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal ({cart.length} items)</span>
                          <span className="font-medium">${cartTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Platform Fee (3%)</span>
                          <span>${platformFee.toLocaleString()}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-base font-semibold">
                          <span>Total</span>
                          <span>${grandTotal.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-400 text-right">
                          (per person: ${Math.round(grandTotal / travelers).toLocaleString()})
                        </p>
                      </div>

                      {cart.length >= 3 && (
                        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-gray-900 mb-1">Unlock AI Optimization</p>
                                <p className="text-sm text-gray-600 mb-3">
                                  Our AI can create optimized alternatives that could save you:
                                </p>
                                <ul className="text-sm text-gray-600 space-y-1 mb-3">
                                  <li>$200-400 in costs</li>
                                  <li>6-10 hours of travel time</li>
                                  <li>+ Hidden gems you'll love</li>
                                </ul>
                                <div className="flex gap-2">
                                  <Button
                                    className="bg-[#FF385C] hover:bg-[#E23350] text-white flex-1"
                                    onClick={() => setLocation("/optimize")}
                                    data-testid="button-ai-optimize"
                                  >
                                    See AI Optimization - $19.99
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" data-testid="button-save-cart">
                          Save Cart
                        </Button>
                        <Button variant="outline" className="flex-1" data-testid="button-share-cart">
                          Share Cart
                        </Button>
                      </div>

                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                        data-testid="button-checkout"
                      >
                        Proceed to Checkout
                      </Button>
                    </div>
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full max-w-2xl mb-6">
              <TabsTrigger value="activities" className="gap-2" data-testid="tab-activities">
                <Ticket className="w-4 h-4" /> Activities
              </TabsTrigger>
              <TabsTrigger value="hotels" className="gap-2" data-testid="tab-hotels">
                <Building className="w-4 h-4" /> Hotels
              </TabsTrigger>
              <TabsTrigger value="services" className="gap-2" data-testid="tab-services">
                <Plane className="w-4 h-4" /> Services
              </TabsTrigger>
              <TabsTrigger value="restaurants" className="gap-2" data-testid="tab-restaurants">
                <UtensilsCrossed className="w-4 h-4" /> Restaurants
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activities" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-600">Showing {sampleActivities.length} activities in {destination}</p>
                <Button variant="outline" size="sm" data-testid="button-sort-activities">
                  Sort: Popular <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <div className="grid gap-4">
                {sampleActivities.map((activity) => (
                  <Card key={activity.id} className="overflow-hidden" data-testid={`card-activity-${activity.id}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-48 h-40 md:h-auto bg-gray-200 flex-shrink-0 flex items-center justify-center">
                          <Ticket className="w-12 h-12 text-gray-400" />
                        </div>
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 mb-1">{activity.name}</h3>
                              <p className="text-sm text-gray-500 mb-2">via {activity.provider}</p>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span className="flex items-center gap-1">
                                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                  {activity.rating} ({activity.reviewCount.toLocaleString()} reviews)
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" /> {activity.duration}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" /> {activity.dates}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-3">{activity.description}</p>
                              <div className="flex flex-wrap gap-2">
                                {activity.features.map((feature) => (
                                  <Badge key={feature} variant="secondary" className="text-xs">
                                    <Check className="w-3 h-3 mr-1" /> {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm text-gray-500">From</p>
                              <p className="text-xl font-bold text-gray-900">${activity.price}</p>
                              <p className="text-xs text-gray-500 mb-3">per person</p>
                              <Button
                                className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                                onClick={() =>
                                  addToCart({
                                    id: activity.id,
                                    type: "activity",
                                    name: activity.name,
                                    price: activity.price * travelers,
                                    quantity: 1,
                                    details: `${travelers} people x $${activity.price}`,
                                    provider: activity.provider,
                                  })
                                }
                                data-testid={`button-add-${activity.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" /> Add ${activity.price * travelers}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="hotels" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-600">Showing {sampleHotels.length} properties in {destination}</p>
                <Button variant="outline" size="sm" data-testid="button-sort-hotels">
                  Sort: Recommended <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <div className="grid gap-4">
                {sampleHotels.map((hotel) => (
                  <Card key={hotel.id} className="overflow-hidden" data-testid={`card-hotel-${hotel.id}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-48 h-40 md:h-auto bg-gray-200 flex-shrink-0 flex items-center justify-center">
                          <Building className="w-12 h-12 text-gray-400" />
                        </div>
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 mb-1">{hotel.name}</h3>
                              <p className="text-sm text-gray-500 mb-2">via {hotel.provider}</p>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span className="flex items-center gap-1">
                                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                  {hotel.rating} ({hotel.reviewCount.toLocaleString()} reviews)
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" /> {hotel.location}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{hotel.description}</p>
                              <p className="text-sm text-gray-700 mb-2">Room: {hotel.roomType}</p>
                              <div className="flex flex-wrap gap-2">
                                {hotel.features.map((feature) => (
                                  <Badge key={feature} variant="secondary" className="text-xs">
                                    <Check className="w-3 h-3 mr-1" /> {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm text-gray-500">${hotel.pricePerNight}/night x {nights} nights</p>
                              <p className="text-xl font-bold text-gray-900">${hotel.totalPrice.toLocaleString()}</p>
                              <p className="text-xs text-gray-500 mb-3">total</p>
                              <Button
                                className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                                onClick={() =>
                                  addToCart({
                                    id: hotel.id,
                                    type: "hotel",
                                    name: hotel.name,
                                    price: hotel.totalPrice,
                                    quantity: 1,
                                    details: `Jan 2-9 | ${nights} nights x $${hotel.pricePerNight}`,
                                    provider: hotel.provider,
                                  })
                                }
                                data-testid={`button-add-${hotel.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" /> Add ${hotel.totalPrice.toLocaleString()}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="services" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-600">Showing {sampleServices.length} services in {destination}</p>
                <Button variant="outline" size="sm" data-testid="button-sort-services">
                  Sort: Popular <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <div className="grid gap-4">
                {sampleServices.map((service) => (
                  <Card key={service.id} className="overflow-hidden" data-testid={`card-service-${service.id}`}>
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-48 h-40 md:h-auto bg-gray-200 flex-shrink-0 flex items-center justify-center">
                          <Plane className="w-12 h-12 text-gray-400" />
                        </div>
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <Badge variant="outline" className="mb-2">{service.category}</Badge>
                              <h3 className="font-semibold text-gray-900 mb-1">{service.name}</h3>
                              <p className="text-sm text-gray-500 mb-2">via {service.provider}</p>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span className="flex items-center gap-1">
                                  <Star className="w-4 h-4 text-yellow-400 fill-current" />
                                  {service.rating} ({service.reviewCount.toLocaleString()} reviews)
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-3">{service.description}</p>
                              <div className="flex flex-wrap gap-2">
                                {service.features.map((feature) => (
                                  <Badge key={feature} variant="secondary" className="text-xs">
                                    <Check className="w-3 h-3 mr-1" /> {feature}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xl font-bold text-gray-900">${service.price}</p>
                              <p className="text-xs text-gray-500 mb-3">
                                {service.category === "Transportation" && service.price > 60 ? "one-way" : "per person"}
                              </p>
                              <Button
                                className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                                onClick={() =>
                                  addToCart({
                                    id: service.id,
                                    type: "service",
                                    name: service.name,
                                    price: service.category === "Transportation" && service.price < 60 ? service.price * travelers : service.price,
                                    quantity: 1,
                                    details: service.category === "Transportation" && service.price < 60 ? `${travelers} x $${service.price}` : undefined,
                                    provider: service.provider,
                                  })
                                }
                                data-testid={`button-add-${service.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" /> Add ${service.category === "Transportation" && service.price < 60 ? service.price * travelers : service.price}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="restaurants" className="space-y-4">
              <div className="text-center py-12">
                <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg font-medium">Restaurant browsing coming soon!</p>
                <p className="text-gray-400 mt-2">We're adding restaurant reservations to the platform.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
