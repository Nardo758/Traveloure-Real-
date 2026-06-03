import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { getGuestSessionId } from "@/lib/guestSession";
import { Link, useLocation, useSearch } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  ArrowLeft, 
  Calendar, 
  MapPin,
  Wand2,
  Sparkles,
  Clock,
  DollarSign,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Lock,
  TrendingDown,
  Zap,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { useSignInModal } from "@/contexts/SignInModalContext";
import StripeCheckout from "@/components/booking/StripeCheckout";

interface CartItem {
  id: string;
  serviceId: string;
  quantity: number;
  scheduledDate: string | null;
  notes: string | null;
  service: {
    id: string;
    serviceName: string;
    price: string;
    location: string | null;
    shortDescription: string | null;
    userId: string;
    serviceType: string | null;
    providerName: string | null;
  } | null;
}

interface CartData {
  items: CartItem[];
  subtotal: string;
  platformFee: string;
  total: string;
  itemCount: number;
}

interface ExternalCartItem {
  id: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
  isExternal?: boolean;
  metadata?: {
    cabin?: string;
    baggage?: string;
    stops?: number;
    duration?: string;
    airline?: string;
    flightNumber?: string;
    departureTime?: string;
    arrivalTime?: string;
    seatsLeft?: number;
    lastTicketingDate?: string;
    refundable?: boolean;
    cancellationDeadline?: string;
    boardType?: string;
    bedInfo?: string;
    roomCategory?: string;
    taxTotal?: number;
    nights?: number;
    pricePerNight?: number;
    checkInDate?: string;
    checkOutDate?: string;
    travelers?: number;
    meetingPoint?: string;
    meetingPointCoordinates?: { lat: number; lng: number };
    rawData?: any;
  };
}

interface Recommendation {
  type: string;
  title: string;
  description: string;
  impact: string;
  potentialSavings: number | null;
}

interface ScheduleItem {
  time: string;
  activity: string;
  location: string;
  notes: string;
}

interface OptimizationResult {
  overallScore: number;
  summary: string;
  recommendations: Recommendation[];
  optimizedSchedule: ScheduleItem[];
  estimatedTotal: {
    original: number;
    optimized: number;
    savings: number;
  };
  warnings: string[];
}

type FlowStep = "cart" | "optimize" | "itinerary" | "payment";

interface OptimizationPreview {
  estimatedSavingsPct: number;
  estimatedCostDelta: number;
  estimatedScheduleTighteningPct: number;
  currentScore: number;
  complexityTier: "simple" | "standard" | "complex";
  feeCents: number;
  currency: string;
  freeRerun: boolean;
  metrics: {
    balanceScore: number;
    wellnessScore: number;
    paceScore: number;
    diversityScore: number;
  };
}

interface OptimizationPaymentState {
  clientSecret: string;
  paymentIntentId: string;
  feeCents: number;
  currency: string;
}

export default function CartPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [flowStep, setFlowStep] = useState<FlowStep>("cart");
  const [generating, setGenerating] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [experienceSlug, setExperienceSlug] = useState<string | null>(null);
  const [experienceTitle, setExperienceTitle] = useState<string | null>(null);
  const [externalItems, setExternalItems] = useState<ExternalCartItem[]>([]);

  // Optimization preview + payment state (G3 + G4)
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState<OptimizationPreview | null>(null);
  const [optimizationPayment, setOptimizationPayment] = useState<OptimizationPaymentState | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Initialize guest session ID on first visit (ensures localStorage entry exists)
  useEffect(() => {
    getGuestSessionId();
  }, []);

  // Load experience context from sessionStorage on mount
  useEffect(() => {
    const storedContext = sessionStorage.getItem("experienceContext");
    if (storedContext) {
      try {
        const context = JSON.parse(storedContext);
        if (context.experienceSlug) {
          setExperienceSlug(context.experienceSlug);
          setExperienceTitle(context.title || context.experienceType);
        } else {
          // Use experienceType + destination as fallback key to avoid cross-experience contamination
          const fallbackKey = `${context.experienceType || 'general'}_${context.destination || 'default'}`.replace(/\s+/g, '-').toLowerCase();
          setExperienceSlug(fallbackKey);
          setExperienceTitle(context.title || context.experienceType);
        }
      } catch (e) {
        console.error("Failed to parse experience context");
        setExperienceSlug("general");
      }
    } else {
      setExperienceSlug("general");
    }
  }, []);

  // Load external cart items from sessionStorage when experience slug changes
  useEffect(() => {
    if (experienceSlug) {
      try {
        const stored = sessionStorage.getItem(`externalCart_${experienceSlug}`);
        setExternalItems(stored ? JSON.parse(stored) : []);
      } catch {
        setExternalItems([]);
      }
    }
  }, [experienceSlug]);

  // Save external items to sessionStorage whenever they change
  useEffect(() => {
    if (experienceSlug) {
      if (externalItems.length > 0) {
        sessionStorage.setItem(`externalCart_${experienceSlug}`, JSON.stringify(externalItems));
      } else {
        sessionStorage.removeItem(`externalCart_${experienceSlug}`);
      }
    }
  }, [externalItems, experienceSlug]);

  // Check for step query param and stored optimization result on mount
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const step = params.get("step");
    
    if (step === "itinerary" || step === "payment") {
      // Try to load optimization result from session storage
      const stored = sessionStorage.getItem("optimizationResult");
      if (stored) {
        try {
          const result = JSON.parse(stored);
          setOptimizationResult(result);
          sessionStorage.removeItem("optimizationResult");
          setFlowStep(step as FlowStep);
        } catch (e) {
          console.error("Failed to parse stored optimization result");
          // Fallback to cart step if parsing fails
          setFlowStep("cart");
          toast({ 
            variant: "destructive", 
            title: "Unable to load optimization results",
            description: "Please generate itinerary again"
          });
        }
      } else {
        // No optimization result stored, fall back to cart step
        setFlowStep("cart");
        toast({ 
          title: "Optimization required",
          description: "Please click 'Generate Itinerary' to see your optimized plan"
        });
      }
    }
  }, [searchString, toast]);

  const [checkoutPaymentIntent, setCheckoutPaymentIntent] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
  } | null>(null);
  const [checkoutBookingIds, setCheckoutBookingIds] = useState<string[]>([]);

  const { data: cart, isLoading } = useQuery<CartData>({
    queryKey: ["/api/cart", experienceSlug],
    queryFn: async () => {
      const url = experienceSlug ? `/api/cart?experience=${experienceSlug}` : "/api/cart";
      const guestId = localStorage.getItem("traveloure_guest_session");
      const headers: Record<string, string> = {};
      if (guestId) headers["X-Guest-Session"] = guestId;
      const res = await fetch(url, { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch cart");
      return res.json();
    },
    enabled: !authLoading,
  });

  // Redirect payment step to cart if no platform items exist (external-only carts cannot checkout)
  // But skip this check if we already have a payment intent (post-checkout state)
  useEffect(() => {
    if (flowStep === "payment" && !isLoading && (cart?.items?.length || 0) === 0 && !checkoutPaymentIntent) {
      setFlowStep("cart");
      toast({
        title: "External bookings only",
        description: "Complete external bookings on their provider websites. Platform checkout requires at least one platform service."
      });
    }
  }, [flowStep, cart?.items?.length, isLoading, toast, checkoutPaymentIntent]);

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      return apiRequest("PATCH", `/api/cart/${id}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update item" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/cart/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] });
      toast({ title: "Item removed from cart" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to remove item" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if ((cart?.items?.length || 0) === 0) {
        throw new Error("No platform items to checkout");
      }
      const res = await apiRequest("POST", "/api/checkout", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      if (data.paymentIntent) {
        setCheckoutPaymentIntent(data.paymentIntent);
        setCheckoutBookingIds(data.bookings?.map((b: any) => b.booking?.id || b.id).filter(Boolean) || []);
        setFlowStep("payment");
      } else {
        toast({ title: "Booking created!", description: "Your services have been booked." });
        setLocation("/bookings");
      }
    },
    onError: (error: any) => {
      if (error?.message === "No platform items to checkout") {
        toast({ variant: "destructive", title: "No bookable items", description: "External bookings must be completed on provider websites." });
      } else {
        toast({ variant: "destructive", title: "Checkout failed" });
      }
    },
  });

  const updateExternalItem = (id: string, quantity: number) => {
    const clampedQty = Math.max(1, Math.min(10, quantity));
    setExternalItems(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: clampedQty } : item
    ));
  };

  const removeExternalItem = (id: string) => {
    setExternalItems(prev => prev.filter(item => item.id !== id));
    toast({ title: "Item removed from cart" });
  };

  const externalSubtotal = externalItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const platformSubtotal = parseFloat(cart?.subtotal || "0");
  const combinedSubtotal = platformSubtotal + externalSubtotal;
  const platformFee = parseFloat(cart?.platformFee || "0");
  const combinedTotal = combinedSubtotal + platformFee;
  const totalItemCount = (cart?.itemCount || 0) + externalItems.reduce((sum, item) => sum + item.quantity, 0);

  const [creatingComparison, setCreatingComparison] = useState(false);

  // ── G4: Call heuristic preview before full optimization ──────────────────
  const fetchPreview = async () => {
    if (previewLoading) return;
    if (isLoading) {
      toast({ title: "Loading cart...", description: "Please wait a moment" });
      return;
    }
    const platformItems = cart?.items || [];
    if (platformItems.length === 0 && externalItems.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add items to your cart first" });
      return;
    }

    let eventType: string | undefined;
    try {
      const stored = sessionStorage.getItem("experienceContext");
      if (stored) {
        const ctx = JSON.parse(stored);
        eventType = ctx.experienceType || ctx.eventType;
      }
    } catch { /* ignore */ }

    const items = [
      ...platformItems.map(item => ({
        serviceType: item.service?.serviceType || "sightseeing",
        price: parseFloat(item.service?.price || "0"),
        duration: 90,
        dayNumber: 1,
      })),
      ...externalItems.map((item, i) => ({
        serviceType: item.type || "activity",
        price: item.price,
        duration: 120,
        dayNumber: Math.floor(i / 3) + 1,
      })),
    ];

    setPreviewLoading(true);
    try {
      const res = await fetch("/api/optimization-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items, eventType }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const preview: OptimizationPreview = await res.json();
      setOptimizationPreview(preview);
      setOptimizationPayment(null);
      setFlowStep("optimize");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not load preview", description: err.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── G3: Create Stripe PaymentIntent for the optimization fee ─────────────
  const requestOptimizationPayment = async () => {
    if (!user) {
      openSignInModal();
      return;
    }
    if (!optimizationPreview) return;
    setPaymentLoading(true);
    try {
      let eventType: string | undefined;
      try {
        const stored = sessionStorage.getItem("experienceContext");
        if (stored) {
          const ctx = JSON.parse(stored);
          eventType = ctx.experienceType || ctx.eventType;
        }
      } catch { /* ignore */ }

      const res = await fetch("/api/optimization-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventType, comparisonContext: { destination: experienceTitle } }),
      });
      if (!res.ok) throw new Error("Could not create payment");
      const data = await res.json();

      if (data.freeRerun) {
        // Skip payment for 24h free re-run
        await createComparison();
        return;
      }

      setOptimizationPayment({
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
        feeCents: data.feeCents,
        currency: data.currency || "USD",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment setup failed", description: err.message });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Called after optimization payment succeeds
  const handleOptimizationPaymentSuccess = async (paymentIntentId: string) => {
    try {
      await fetch("/api/optimization-payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId }),
      });
    } catch { /* non-critical */ }
    await createComparison(paymentIntentId);
  };

  const createComparison = async (optimizationPaymentId?: string) => {
    // Prevent double-clicks
    if (creatingComparison) return;
    
    const platformItems = cart?.items || [];
    // Wait for data to be ready
    if (isLoading) {
      toast({ title: "Loading cart...", description: "Please wait a moment" });
      return;
    }
    if (platformItems.length === 0 && externalItems.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add items to your cart first" });
      return;
    }
    setCreatingComparison(true);
    
    let experienceContext: { title?: string; destination?: string; startDate?: string; endDate?: string; travelers?: number; experienceType?: string } | undefined;
    const storedContext = sessionStorage.getItem("experienceContext");
    if (storedContext) {
      try {
        experienceContext = JSON.parse(storedContext);
      } catch (e) {
        console.error("Failed to parse experience context");
      }
    }

    // Build baseline items from platform items
    const platformBaselineItems = platformItems.map(item => ({
      name: item.service?.serviceName || "Service",
      category: item.service?.serviceType || "service",
      price: item.service?.price || "0",
      provider: item.service?.providerName || "Provider",
      location: item.service?.location || "",
      description: item.service?.shortDescription || ""
    }));
    
    // Build baseline items from external items
    const externalBaselineItems = externalItems.map(item => ({
      name: item.name,
      category: item.type,
      price: String(item.price),
      provider: item.provider || "External Provider",
      location: item.metadata?.meetingPoint || "",
      description: item.details || ""
    }));
    
    const baselineItems = [...platformBaselineItems, ...externalBaselineItems];
    
    // Derive destination from available data
    const getComparisonDestination = () => {
      if (experienceContext?.destination) return experienceContext.destination;
      if (platformItems[0]?.service?.location) return platformItems[0].service.location;
      
      // Check external items for destination data
      for (const extItem of externalItems) {
        if (extItem?.metadata?.meetingPoint) return extItem.metadata.meetingPoint;
        // Flight destination (from name like "NYC → LAX")
        if (extItem?.name?.includes('→')) {
          const destCode = extItem.name.split('→')[1]?.trim();
          if (destCode) return destCode;
        }
        // Hotel location (from rawData if available)
        if (extItem?.type === 'hotels' || extItem?.type === 'accommodations') {
          const rawData = extItem?.metadata?.rawData;
          // Check various Amadeus hotel location fields
          if (rawData?.hotel?.address?.cityName) return rawData.hotel.address.cityName;
          if (rawData?.hotel?.cityCode) return rawData.hotel.cityCode;
          if (rawData?.destinationLocation) return rawData.destinationLocation;
        }
        // Flight destination from rawData
        if (extItem?.type === 'flights') {
          const rawData = extItem?.metadata?.rawData;
          if (rawData?.itineraries?.[0]?.segments) {
            const segments = rawData.itineraries[0].segments;
            const lastSegment = segments[segments.length - 1];
            if (lastSegment?.arrival?.iataCode) return lastSegment.arrival.iataCode;
          }
        }
      }
      return "Your destination";
    };
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: experienceContext?.title || "My Trip",
        destination: getComparisonDestination(),
        startDate: experienceContext?.startDate || new Date().toISOString().split('T')[0],
        endDate: experienceContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: String(combinedTotal),
        travelers: experienceContext?.travelers || 2,
        baselineItems,
        ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
      });
      
      const comparison = await response.json();
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      console.error("Failed to create comparison:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to generate itinerary",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const generateItinerary = async () => {
    // Prevent double-clicks
    if (generating) return;
    
    const platformItems = cart?.items || [];
    // Wait for data to be ready
    if (isLoading) {
      toast({ title: "Loading cart...", description: "Please wait a moment" });
      return;
    }
    if (platformItems.length === 0 && externalItems.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add items to your cart first" });
      return;
    }
    setGenerating(true);
    
    // Try to get experience context from session storage
    let experienceContext: { title?: string; destination?: string; startDate?: string; endDate?: string; travelers?: number; experienceType?: string } | undefined;
    const storedContext = sessionStorage.getItem("experienceContext");
    if (storedContext) {
      try {
        experienceContext = JSON.parse(storedContext);
      } catch (e) {
        console.error("Failed to parse experience context");
      }
    }
    
    // Build services from platform items
    const platformServices = platformItems.map(item => ({
      name: item.service?.serviceName,
      provider: item.service?.providerName || "Provider",
      price: parseFloat(item.service?.price || "0"),
      category: item.service?.serviceType || "service"
    }));
    
    // Build services from external items  
    const externalServices = externalItems.map(item => ({
      name: item.name,
      provider: item.provider || "External Provider",
      price: item.price,
      category: item.type
    }));
    
    // Derive destination from available data
    const getDestination = () => {
      if (experienceContext?.destination) return experienceContext.destination;
      if (platformItems[0]?.service?.location) return platformItems[0].service.location;
      
      // Check external items for destination data
      for (const extItem of externalItems) {
        if (extItem?.metadata?.meetingPoint) return extItem.metadata.meetingPoint;
        // Flight destination (from name like "NYC → LAX")
        if (extItem?.name?.includes('→')) {
          const destCode = extItem.name.split('→')[1]?.trim();
          if (destCode) return destCode;
        }
        // Hotel location (from rawData if available)
        if (extItem?.type === 'hotels' || extItem?.type === 'accommodations') {
          const rawData = extItem?.metadata?.rawData;
          // Check various Amadeus hotel location fields
          if (rawData?.hotel?.address?.cityName) return rawData.hotel.address.cityName;
          if (rawData?.hotel?.cityCode) return rawData.hotel.cityCode;
          if (rawData?.destinationLocation) return rawData.destinationLocation;
        }
        // Flight destination from rawData
        if (extItem?.type === 'flights') {
          const rawData = extItem?.metadata?.rawData;
          if (rawData?.itineraries?.[0]?.segments) {
            const segments = rawData.itineraries[0].segments;
            const lastSegment = segments[segments.length - 1];
            if (lastSegment?.arrival?.iataCode) return lastSegment.arrival.iataCode;
          }
        }
      }
      return "Your destination";
    };
    
    // Build request payload with context or fallback values
    const payload = {
      experienceType: experienceContext?.experienceType || "General",
      destination: getDestination(),
      startDate: experienceContext?.startDate,
      endDate: experienceContext?.endDate,
      selectedServices: [...platformServices, ...externalServices],
      preferences: {}
    };
    
    try {
      const response = await fetch("/api/ai/optimize-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const result = await response.json();
        setOptimizationResult(result);
        setFlowStep("itinerary");
      } else {
        toast({ variant: "destructive", title: "Failed to generate itinerary" });
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
      toast({ variant: "destructive", title: "Failed to generate itinerary" });
    } finally {
      setGenerating(false);
    }
  };

  const proceedToPayment = () => {
    setFlowStep("payment");
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container py-8 max-w-5xl mx-auto">
        {/* Flow Steps Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "cart" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <ShoppingCart className="w-4 h-4" />
            <span className="text-sm font-medium">Cart</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "optimize" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium">Optimize</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "itinerary" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Itinerary</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "payment" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <CreditCard className="w-4 h-4" />
            <span className="text-sm font-medium">Payment</span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (flowStep === "cart") {
                window.history.back();
              } else if (flowStep === "optimize") {
                setFlowStep("cart");
                setOptimizationPreview(null);
                setOptimizationPayment(null);
              } else if (flowStep === "itinerary") {
                setFlowStep("cart");
              } else {
                setFlowStep("itinerary");
              }
            }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {flowStep === "cart" && "Your Cart"}
              {flowStep === "optimize" && "Unlock Full Optimization"}
              {flowStep === "itinerary" && "Your Optimized Itinerary"}
              {flowStep === "payment" && "Complete Payment"}
            </h1>
            {flowStep === "cart" && (
              <span className="text-sm text-muted-foreground" data-testid="text-experience-context">
                {experienceTitle || "General"}
              </span>
            )}
          </div>
          {totalItemCount > 0 && flowStep === "cart" && (
            <Badge variant="secondary" data-testid="badge-item-count">{totalItemCount} items</Badge>
          )}
        </div>

        {/* Guest nudge — only shown when unauthenticated and there are items */}
        {!user && !authLoading && totalItemCount > 0 && flowStep === "cart" && (
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="banner-guest-nudge">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
              Your plan is saved in this browser only.{" "}
              <button
                type="button"
                className="font-semibold underline hover:no-underline"
                onClick={() => openSignInModal()}
                data-testid="button-sign-in-nudge"
              >
                Sign in to save it permanently
              </button>
            </p>
          </div>
        )}

        {/* Guest nudge — empty cart prompt for unauthenticated users without items */}
        {!user && !authLoading && totalItemCount === 0 && flowStep === "cart" && !isLoading && !optimizationResult && (
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800" data-testid="banner-guest-empty-nudge">
            <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200 flex-1">
              Build your plan first — no account needed.{" "}
              <button
                type="button"
                className="font-semibold underline hover:no-underline"
                onClick={() => openSignInModal()}
                data-testid="button-sign-in-empty"
              >
                Sign in to save and optimize
              </button>
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (cart?.items?.length || 0) === 0 && externalItems.length === 0 && flowStep === "cart" && !optimizationResult ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
              <p className="text-muted-foreground mb-6">Browse our services and add something you like</p>
              <Button asChild data-testid="button-browse-services">
                <Link href="/discover">Browse Services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Step 1: Cart View */}
            {flowStep === "cart" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                  {(cart?.items || []).map((item) => (
                    <Card key={item.id} data-testid={`card-cart-item-${item.id}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold" data-testid={`text-service-name-${item.id}`}>
                              {item.service?.serviceName || "Unknown Service"}
                            </h3>
                            {item.service?.shortDescription && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.service.shortDescription}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                              {item.service?.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {item.service.location}
                                </span>
                              )}
                              {item.scheduledDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(item.scheduledDate), "PPP")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg" data-testid={`text-price-${item.id}`}>
                              ${parseFloat(item.service?.price || "0").toFixed(2)}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateItemMutation.mutate({ id: item.id, quantity: Math.max(1, (item.quantity || 1) - 1) })}
                                disabled={item.quantity <= 1 || updateItemMutation.isPending}
                                data-testid={`button-decrease-${item.id}`}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center" data-testid={`text-quantity-${item.id}`}>
                                {item.quantity || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateItemMutation.mutate({ id: item.id, quantity: (item.quantity || 1) + 1 })}
                                disabled={updateItemMutation.isPending}
                                data-testid={`button-increase-${item.id}`}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeItemMutation.mutate(item.id)}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {externalItems.map((item) => (
                    <Card key={item.id} data-testid={`card-cart-item-${item.id}`} className="border-[#FF385C]/20">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold" data-testid={`text-service-name-${item.id}`}>
                                {item.name}
                              </h3>
                              <Badge variant="outline" className="text-xs border-[#FF385C] text-[#FF385C]">
                                {item.provider}
                              </Badge>
                            </div>
                            {item.details && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.details}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                              {item.metadata?.meetingPoint && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {item.metadata.meetingPoint}
                                </span>
                              )}
                              {item.metadata?.checkInDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(item.metadata.checkInDate), "PP")} - {format(new Date(item.metadata.checkOutDate || item.metadata.checkInDate), "PP")}
                                </span>
                              )}
                              {item.metadata?.departureTime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(item.metadata.departureTime), "PP p")}
                                </span>
                              )}
                              {item.metadata?.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {item.metadata.duration}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg" data-testid={`text-price-${item.id}`}>
                              ${item.price.toFixed(2)}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateExternalItem(item.id, (item.quantity || 1) - 1)}
                                disabled={item.quantity <= 1}
                                data-testid={`button-decrease-${item.id}`}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center" data-testid={`text-quantity-${item.id}`}>
                                {item.quantity || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateExternalItem(item.id, (item.quantity || 1) + 1)}
                                data-testid={`button-increase-${item.id}`}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeExternalItem(item.id)}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="lg:col-span-1 space-y-4">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span data-testid="text-subtotal">${combinedSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span data-testid="text-platform-fee">${platformFee.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span data-testid="text-total">${combinedTotal.toFixed(2)}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                      <div className="w-full p-3 rounded-lg bg-gradient-to-r from-[#FF385C]/10 to-purple-500/10 border border-[#FF385C]/20">
                        <div className="flex items-start gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-[#FF385C] mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium">Generate Your Itinerary</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              See your selections organized into an itinerary, plus AI-optimized alternatives that could save you money or time.
                            </p>
                          </div>
                        </div>
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          size="lg"
                          onClick={fetchPreview}
                          disabled={previewLoading}
                          data-testid="button-generate-itinerary-comparison"
                        >
                          {previewLoading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 mr-2" />
                          )}
                          {previewLoading ? "Analyzing..." : "Generate Itinerary"}
                        </Button>
                      </div>
                      {(cart?.items?.length || 0) > 0 && (
                        <>
                          <Separator />
                          <Button
                            variant="outline"
                            className="w-full border-2"
                            size="lg"
                            onClick={() => setFlowStep("payment")}
                            data-testid="button-skip-to-payment"
                          >
                            <CreditCard className="w-5 h-5 mr-2" />
                            Proceed to Payment
                          </Button>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 1.5: Optimization Preview + Payment Gate */}
            {flowStep === "optimize" && optimizationPreview && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                  {/* Preview estimate card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#FF385C]" />
                        Optimization Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Our AI scanned your {(cart?.items?.length || 0) + externalItems.length} items and found room for improvement. 
                        Unlock the full optimizer to get your personalised plan.
                      </p>

                      {/* Current score */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">Current efficiency score</span>
                          <span className="text-sm font-bold text-[#FF385C]">{optimizationPreview.currentScore}/100</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF385C] transition-all"
                            style={{ width: `${optimizationPreview.currentScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Estimate highlights */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {optimizationPreview.estimatedSavingsPct > 0 && (
                          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 text-center">
                            <TrendingDown className="w-5 h-5 text-green-600 mx-auto mb-1" />
                            <p className="text-xl font-bold text-green-700 dark:text-green-300">
                              ~{optimizationPreview.estimatedSavingsPct}%
                            </p>
                            <p className="text-xs text-muted-foreground">Potential savings</p>
                            {optimizationPreview.estimatedCostDelta < 0 && (
                              <p className="text-xs text-green-600 font-medium mt-0.5">
                                ~${Math.abs(optimizationPreview.estimatedCostDelta / 100).toFixed(0)} less
                              </p>
                            )}
                          </div>
                        )}
                        {optimizationPreview.estimatedScheduleTighteningPct > 0 && (
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 text-center">
                            <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                              ~{optimizationPreview.estimatedScheduleTighteningPct}%
                            </p>
                            <p className="text-xs text-muted-foreground">Schedule improvement</p>
                          </div>
                        )}
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
                          <Zap className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-300 capitalize">
                            {optimizationPreview.complexityTier}
                          </p>
                          <p className="text-xs text-muted-foreground">Trip complexity</p>
                        </div>
                      </div>

                      {/* Score breakdown */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Score breakdown</p>
                        {(["balanceScore", "wellnessScore", "paceScore", "diversityScore"] as const).map(key => {
                          const labels: Record<string, string> = {
                            balanceScore: "Balance",
                            wellnessScore: "Wellness",
                            paceScore: "Pace",
                            diversityScore: "Diversity",
                          };
                          const val = optimizationPreview.metrics[key];
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-xs w-20 text-muted-foreground">{labels[key]}</span>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#FF385C]/70 rounded-full"
                                  style={{ width: `${val}%` }}
                                />
                              </div>
                              <span className="text-xs w-8 text-right text-muted-foreground">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payment gate — show Stripe Elements after user clicks "Unlock" */}
                  {optimizationPayment && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Lock className="w-5 h-5 text-[#FF385C]" />
                          Pay Optimization Fee
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <StripeCheckout
                          paymentIntent={{
                            clientSecret: optimizationPayment.clientSecret,
                            paymentIntentId: optimizationPayment.paymentIntentId,
                            amount: optimizationPayment.feeCents,
                          }}
                          bookingIds={[]}
                          onSuccess={handleOptimizationPaymentSuccess}
                          onError={(err) => toast({ variant: "destructive", title: "Payment failed", description: err })}
                          onCancel={() => setOptimizationPayment(null)}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Sidebar CTA */}
                <div className="lg:col-span-1">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle className="text-base">Full AI Optimization</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          AI-sequenced day plans for minimum travel time
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          3 alternative itinerary variants to compare
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          Cost & wellness scoring for each variant
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          Free re-run within 24 hours
                        </li>
                      </ul>

                      <Separator />

                      {optimizationPreview.freeRerun ? (
                        <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                            <RefreshCw className="w-4 h-4" />
                            <span className="text-sm font-semibold">Free re-run active!</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            You optimized recently — this run is on us.
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-foreground">
                            ${(optimizationPreview.feeCents / 100).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">one-time fee</p>
                        </div>
                      )}

                      {!optimizationPayment && (
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          size="lg"
                          onClick={requestOptimizationPayment}
                          disabled={paymentLoading || creatingComparison}
                          data-testid="button-unlock-optimization"
                        >
                          {paymentLoading || creatingComparison ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Lock className="w-4 h-4 mr-2" />
                          )}
                          {optimizationPreview.freeRerun
                            ? (creatingComparison ? "Building..." : "Run Full Optimization")
                            : (paymentLoading ? "Setting up..." : "Unlock Full Optimization")
                          }
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 2: Itinerary & Optimized Plans */}
            {flowStep === "itinerary" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                  {/* Optimization Score */}
                  {optimizationResult && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#FF385C]" />
                            Optimization Score
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            <div className="text-4xl font-bold text-[#FF385C]">
                              {optimizationResult.overallScore}%
                            </div>
                            <div className="flex-1">
                              <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-[#FF385C] transition-all"
                                  style={{ width: `${optimizationResult.overallScore}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          {optimizationResult.summary && (
                            <p className="mt-4 text-muted-foreground">{optimizationResult.summary}</p>
                          )}
                          {optimizationResult.estimatedTotal.savings > 0 && (
                            <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400">
                              <DollarSign className="w-4 h-4" />
                              <span>Potential savings: ${optimizationResult.estimatedTotal.savings}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Recommendations */}
                      {optimizationResult.recommendations.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>AI Recommendations</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-3">
                              {optimizationResult.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-3">
                                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <div className="font-medium">{rec.title}</div>
                                    <div className="text-sm text-muted-foreground">{rec.description}</div>
                                    {rec.potentialSavings && rec.potentialSavings > 0 && (
                                      <span className="text-xs text-green-600">Save ${rec.potentialSavings}</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}

                      {/* Optimized Schedule */}
                      {optimizationResult.optimizedSchedule.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Clock className="w-5 h-5" />
                              Optimized Schedule
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {optimizationResult.optimizedSchedule.map((item, i) => (
                                <div key={i} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                                  <div className="text-sm font-medium text-muted-foreground w-16">
                                    {item.time}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium">{item.activity}</div>
                                    <div className="text-sm text-muted-foreground">{item.location}</div>
                                    {item.notes && <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>

                <div className="lg:col-span-1">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Ready to Book?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${combinedSubtotal.toFixed(2)}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-${optimizationResult.estimatedTotal.savings}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span>${platformFee.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${(combinedTotal - (optimizationResult?.estimatedTotal?.savings || 0)).toFixed(2)}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-3">
                      {externalItems.length > 0 && (
                        <div className="w-full p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-700 dark:text-amber-300">
                              <strong>{externalItems.length} external booking{externalItems.length > 1 ? 's' : ''}</strong> (flights, hotels, activities) will need to be completed on the provider's website.
                            </div>
                          </div>
                        </div>
                      )}
                      {(cart?.items?.length || 0) > 0 ? (
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          size="lg"
                          onClick={proceedToPayment}
                          data-testid="button-proceed-payment"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Proceed to Payment
                        </Button>
                      ) : (
                        <div className="w-full text-center text-muted-foreground text-sm">
                          External bookings must be completed on provider websites
                        </div>
                      )}
                      {optimizationResult?.warnings && optimizationResult.warnings.length > 0 && (
                        <div className="w-full p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-700 dark:text-amber-300">
                              {optimizationResult.warnings[0]}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {flowStep === "payment" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                  {checkoutPaymentIntent ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Secure Payment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <StripeCheckout
                          paymentIntent={checkoutPaymentIntent}
                          bookingIds={checkoutBookingIds}
                          onSuccess={(paymentIntentId) => {
                            queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
                            toast({ title: "Payment successful!", description: "Your booking has been confirmed." });
                            setLocation("/bookings");
                          }}
                          onError={(error) => {
                            toast({ variant: "destructive", title: "Payment failed", description: error });
                          }}
                          onCancel={() => setFlowStep("itinerary")}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>Payment Method</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="border rounded-lg p-4 flex items-center gap-4 bg-muted/30">
                          <CreditCard className="w-8 h-8 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium">Credit / Debit Card</div>
                            <div className="text-sm text-muted-foreground">Secure payment via Stripe</div>
                          </div>
                          <Badge variant="secondary">Selected</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your payment information is processed securely. We do not store your card details.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle>Order Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(cart?.items || []).map((item) => (
                          <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                            <div>
                              <div className="font-medium">{item.service?.serviceName}</div>
                              <div className="text-sm text-muted-foreground">Qty: {item.quantity}</div>
                            </div>
                            <div className="font-medium">
                              ${(parseFloat(item.service?.price || "0") * item.quantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                        {externalItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground">Qty: {item.quantity} | {item.provider}</div>
                            </div>
                            <div className="font-medium">
                              ${(item.price * item.quantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-1">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Complete Booking</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${combinedSubtotal.toFixed(2)}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-${optimizationResult.estimatedTotal.savings}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span>${platformFee.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${(combinedTotal - (optimizationResult?.estimatedTotal?.savings || 0)).toFixed(2)}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-3">
                      {externalItems.length > 0 && (
                        <div className="w-full p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-700 dark:text-amber-300">
                              <strong>{externalItems.length} external booking{externalItems.length > 1 ? 's' : ''}</strong> (flights, hotels, activities) will need to be completed on the provider's website.
                            </div>
                          </div>
                        </div>
                      )}
                      {!checkoutPaymentIntent && (cart?.items?.length || 0) > 0 ? (
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          size="lg"
                          onClick={() => checkoutMutation.mutate()}
                          disabled={checkoutMutation.isPending}
                          data-testid="button-complete-booking"
                        >
                          {checkoutMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Complete Booking
                            </>
                          )}
                        </Button>
                      ) : !checkoutPaymentIntent ? (
                        <div className="w-full text-center text-muted-foreground text-sm">
                          External bookings must be completed on provider websites
                        </div>
                      ) : null}
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
