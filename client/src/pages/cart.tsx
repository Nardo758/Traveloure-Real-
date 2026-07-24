import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { getGuestSessionId } from "@/lib/guestSession";
import { getTripContext, updateTripContext, useTripContext, type TripContext } from "@/lib/trip-context";
import { EditTripPanel } from "@/components/trip/edit-trip-panel";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  RefreshCw,
  Route,
  Globe,
} from "lucide-react";
import { format } from "date-fns";
import { useSignInModal } from "@/contexts/SignInModalContext";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { UpsellSlot, UpsellErrorBoundary } from "@/components/UpsellSlot";

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD – US Dollar" },
  { code: "EUR", label: "EUR – Euro" },
  { code: "GBP", label: "GBP – British Pound" },
  { code: "JPY", label: "JPY – Japanese Yen" },
  { code: "AUD", label: "AUD – Australian Dollar" },
  { code: "SGD", label: "SGD – Singapore Dollar" },
];

interface CartItem {
  id: string;
  serviceId: string | null;
  contentType: string | null;
  contentId: string | null;
  contentMeta: Record<string, any> | null;
  isContentItem?: boolean;
  contentDisplay?: {
    name: string;
    imageUrl: string | null;
    city: string | null;
    description: string | null;
    price: string | null;
  } | null;
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
  conciergeFee: string;
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
  const { user, isLoading: authLoading, updatePreferredCurrency } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [flowStep, setFlowStep] = useState<FlowStep>("cart");
  // Generated once per page mount — stays stable across multiple "Pay Now" clicks
  // so duplicate submissions carry the same key and are de-duped server-side + by Stripe.
  const [checkoutIdempotencyKey] = useState<string>(() => crypto.randomUUID());
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
  // Funnel PR2: quiet preview fetched on the CART step so the optimization's real
  // value (savings %, plan score) is visible before the user reaches the optimize
  // step. Same free endpoint the optimize step uses; the nudge renders only when
  // the preview finds room to improve — real metrics only, never invented (§13).
  const [cartNudge, setCartNudge] = useState<OptimizationPreview | null>(null);
  // Funnel PR2: explicit "What are you planning?" — replaces the silent "general"
  // context fallback. Drives the REAL fee tier (complexityTier) + preview metrics.
  const [tripEventType, setTripEventType] = useState<string>("");

  // G6: Trip auto-creation state
  const [resolvingTrip, setResolvingTrip] = useState(false);
  const [resolvedTrip, setResolvedTrip] = useState<{ id: string; title: string; destination: string; startDate: string; endDate: string; numberOfTravelers: number } | null>(null);
  const [tripTitle, setTripTitle] = useState("");
  const [tripDestination, setTripDestination] = useState("");
  // Trip-date range — edited in the always-visible header at the top of the cart (not a step/modal).
  // Seeded from the experience context so an experience-template flow's up-front dates carry over.
  // Live trip context (P2): dates derive from the shared TripContext hook so an
  // edit anywhere (EditTripPanel, another surface) reflects here immediately.
  const [liveTripCtx] = useTripContext();
  const tripStartDate = liveTripCtx.startDate || "";
  const tripEndDate = liveTripCtx.endDate || "";
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [tripTravelers, setTripTravelers] = useState(() => {
    const t = getTripContext().travelers;
    return t && t > 0 ? t : 2;
  });

  // Guest cart pending items (stored when unauthenticated users click add-to-cart)
  const [guestPendingIds, setGuestPendingIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("traveloure_guest_cart_pending") || "[]");
    } catch { return []; }
  });
  const [migrationDone, setMigrationDone] = useState(false);
  const migrationStartedRef = useRef(false);

  // Initialize guest session ID on first visit (ensures localStorage entry exists)
  useEffect(() => {
    getGuestSessionId();
  }, []);

  // Migrate guest cart items to DB after sign-in.
  // Only clears IDs that successfully POST; keeps failed ones for retry and surfaces an error.
  // migrationStartedRef prevents re-entry; migrationDone flips only after all POSTs settle
  // so "Prepare Trip" cannot fire against a not-yet-migrated cart.
  useEffect(() => {
    if (authLoading || !user || guestPendingIds.length === 0 || migrationStartedRef.current) return;
    migrationStartedRef.current = true;
    Promise.all(
      guestPendingIds.map(async (serviceId) => {
        try {
          await apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
          return { serviceId, ok: true };
        } catch (err) {
          console.error("[Cart] Failed to migrate guest cart item:", serviceId, err);
          return { serviceId, ok: false };
        }
      })
    ).then((results) => {
      const failedIds = results.filter((r) => !r.ok).map((r) => r.serviceId);
      if (failedIds.length > 0) {
        localStorage.setItem("traveloure_guest_cart_pending", JSON.stringify(failedIds));
        setGuestPendingIds(failedIds);
      } else {
        localStorage.removeItem("traveloure_guest_cart_pending");
        setGuestPendingIds([]);
      }
      if (results.some((r) => r.ok)) {
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      }
      setMigrationDone(true);
    });
  }, [user, authLoading, guestPendingIds]);

  // Load experience context on mount
  useEffect(() => {
    const context = getTripContext();
    if (Object.keys(context).length > 0) {
      if (context.experienceSlug) {
        setExperienceSlug(context.experienceSlug);
        setExperienceTitle(context.title || context.experienceType || null);
      } else {
        // Use experienceType + destination as fallback key to avoid cross-experience contamination
        const fallbackKey = `${context.experienceType || 'general'}_${context.destination || 'default'}`.replace(/\s+/g, '-').toLowerCase();
        setExperienceSlug(fallbackKey);
        setExperienceTitle(context.title || context.experienceType || null);
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

  // Check for step query param and stored optimization preview on mount
  // CON-A.P1: experience-template now hands off an OptimizationPreview (free heuristic).
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const step = params.get("step");

    if (step === "optimize" || step === "payment") {
      const stored = sessionStorage.getItem("optimizationPreview");
      if (stored) {
        try {
          const preview: OptimizationPreview = JSON.parse(stored);
          setOptimizationPreview(preview);
          sessionStorage.removeItem("optimizationPreview");
          setFlowStep(step as FlowStep);
        } catch (e) {
          console.error("Failed to parse stored optimization preview");
          setFlowStep("cart");
          toast({
            variant: "destructive",
            title: "Unable to load optimization preview",
            description: "Please generate itinerary again",
          });
        }
      } else {
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

  // ── Start Planning flow ──────────────────────────────────────────────────
  const [showPlanningDialog, setShowPlanningDialog] = useState(false);
  const [planningTripMode, setPlanningTripMode] = useState<"existing" | "new">("existing");
  const [planningTripId, setPlanningTripId] = useState<string>("");
  const [newTripName, setNewTripName] = useState("");
  const [newTripDestination, setNewTripDestination] = useState("");
  const [selectedPlanItemIds, setSelectedPlanItemIds] = useState<Set<string>>(new Set());
  const [displayCurrency, setDisplayCurrency] = useState<string>(
    () => user?.preferredCurrency || localStorage.getItem("traveloure_currency") || "USD"
  );

  // Sync displayCurrency from user profile when it loads (overrides localStorage if user has a preference)
  useEffect(() => {
    if (user?.preferredCurrency && user.preferredCurrency !== displayCurrency) {
      setDisplayCurrency(user.preferredCurrency);
    }
  }, [user?.preferredCurrency]);

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

  const { data: userTrips = [] } = useQuery<any[]>({
    queryKey: ["/api/trips"],
    enabled: !!user && showPlanningDialog,
  });

  const { data: exchangeRatesData } = useQuery<{ base: string; rates: Record<string, number>; cachedAt: number }>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 60 * 60 * 1000,
  });

  const convertToItineraryMutation = useMutation({
    mutationFn: async (payload: {
      tripId?: string;
      newTripName?: string;
      destination?: string;
      cartItemIds: string[];
    }) => {
      const res = await apiRequest("POST", "/api/cart/convert-to-itinerary", payload);
      return res.json();
    },
    onSuccess: (data: { tripId: string; convertedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] });
      toast({
        title: `${data.convertedCount} item${data.convertedCount !== 1 ? "s" : ""} added to your trip!`,
        description: "View and arrange them in your trip itinerary.",
      });
      setShowPlanningDialog(false);
      setLocation(`/trip/${data.tripId}`);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to add items to trip" });
    },
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

  // "Frequently booked together" in-place add: the upsell slot resolves each
  // candidate to a concrete approved listing server-side; adding it is the same
  // POST /api/cart { serviceId } as any service add — the server derives the
  // price from the catalog, never from this client (§14).
  const [addingUpsellId, setAddingUpsellId] = useState<string | null>(null);
  const addUpsellMutation = useMutation({
    mutationFn: async (c: { offeringId: string; bookable?: { serviceId: string } | null }) => {
      if (!c.bookable?.serviceId) throw new Error("No bookable service");
      setAddingUpsellId(c.offeringId);
      return apiRequest("POST", "/api/cart", { serviceId: c.bookable.serviceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] });
      toast({ title: "Added to your cart" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Could not add item", description: "Please try again." });
    },
    onSettled: () => setAddingUpsellId(null),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if ((cart?.items?.length || 0) === 0) {
        throw new Error("No platform items to checkout");
      }
      const res = await apiRequest("POST", "/api/checkout", {
        currency: displayCurrency,
        idempotencyKey: checkoutIdempotencyKey,
      });
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
  const conciergeFee = parseFloat(cart?.conciergeFee || "0");
  const combinedTotal = combinedSubtotal + platformFee + conciergeFee;
  const totalItemCount = (cart?.itemCount || 0) + externalItems.reduce((sum, item) => sum + item.quantity, 0);

  const exchangeRates = exchangeRatesData?.rates ?? {};
  const formatPrice = (usdAmount: number): string => {
    if (displayCurrency === "USD") return `$${usdAmount.toFixed(2)}`;
    const rate = exchangeRates[displayCurrency];
    if (!rate) return `$${usdAmount.toFixed(2)}`;
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: displayCurrency === "JPY" ? 0 : 2,
      minimumFractionDigits: displayCurrency === "JPY" ? 0 : 2,
    }).format(usdAmount * rate);
  };

  const handleCurrencyChange = (code: string) => {
    setDisplayCurrency(code);
    localStorage.setItem("traveloure_currency", code);
    if (user && updatePreferredCurrency) {
      updatePreferredCurrency(code);
    }
  };

  // Content items (Discover saves) — eligible for "Start planning"
  // Require both contentId AND contentType to be non-empty; do NOT use
  // contentMeta alone since addToCart always writes {} for all cart items.
  const contentItems = (cart?.items || []).filter(
    (item) => item.isContentItem || (!!item.contentId && !!item.contentType)
  );

  const openPlanningDialog = () => {
    if (!user) { openSignInModal(); return; }
    setSelectedPlanItemIds(new Set(contentItems.map((i) => i.id)));
    setPlanningTripMode("existing");
    setPlanningTripId("");
    setNewTripName("");
    setNewTripDestination(
      (contentItems[0]?.contentMeta as any)?.city ||
      (contentItems[0]?.contentMeta as any)?.location ||
      ""
    );
    setShowPlanningDialog(true);
  };

  const handleConvertToItinerary = () => {
    const cartItemIds = Array.from(selectedPlanItemIds);
    if (cartItemIds.length === 0) {
      toast({ variant: "destructive", title: "Select at least one item" });
      return;
    }
    if (planningTripMode === "existing") {
      if (!planningTripId) {
        toast({ variant: "destructive", title: "Please select a trip" });
        return;
      }
      convertToItineraryMutation.mutate({ tripId: planningTripId, cartItemIds });
    } else {
      if (!newTripName.trim()) {
        toast({ variant: "destructive", title: "Please enter a trip name" });
        return;
      }
      convertToItineraryMutation.mutate({
        newTripName: newTripName.trim(),
        destination: newTripDestination.trim() || undefined,
        cartItemIds,
      });
    }
  };

  const [creatingComparison, setCreatingComparison] = useState(false);

  // Funnel PR2: best-effort nudge preview on the cart step (no toasts, no step
  // change — silently absent on failure). Re-runs when the cart contents change.
  useEffect(() => {
    if (flowStep !== "cart") return;
    const platformItems = cart?.items || [];
    if (platformItems.length === 0 && externalItems.length === 0) {
      setCartNudge(null);
      return;
    }
    const ctxForEvent = getTripContext();
    const eventType: string | undefined = ctxForEvent.experienceType || ctxForEvent.eventType;
    const items = [
      ...platformItems.map((item: any) => ({
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
    let cancelled = false;
    fetch("/api/optimization-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items, eventType }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled) setCartNudge(p); })
      .catch(() => { /* nudge is best-effort */ });
    return () => { cancelled = true; };
  }, [flowStep, cart?.items?.length, externalItems.length]);

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

    const ctxForEvent = getTripContext();
    const eventType: string | undefined = ctxForEvent.experienceType || ctxForEvent.eventType;

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

  // ── G6: Resolve (or auto-create) a trip before entering the optimize gate ─
  // The heavy lifting; runs once a trip date is known (already set, or just collected via the modal).
  const proceedOptimize = async (effStart: string, effEnd: string) => {
    setResolvingTrip(true);
    try {
      const ctxAtResolve = getTripContext();
      const ctxExperienceSlug = ctxAtResolve.experienceSlug || undefined;
      const ctxUserExperienceId = ctxAtResolve.userExperienceId || ctxAtResolve.id || undefined;
      const ctxDestination = ctxAtResolve.destination || ctxAtResolve.city || undefined;
      const ctxTripId = ctxAtResolve.tripId || undefined;

      const res = await fetch("/api/cart/resolve-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          experienceSlug: ctxExperienceSlug,
          userExperienceId: ctxUserExperienceId,
          tripId: ctxTripId,
          startDate: effStart || undefined,
          endDate: effEnd || undefined,
          destination: ctxDestination,
          travelers: ctxAtResolve.travelers || undefined,
          // External (affiliate/AI) items exist only in sessionStorage — send a
          // minimal descriptor list so an external-only cart can resolve a trip.
          // No prices sent: the server ignores them by design.
          externalItems: externalItems.map((item) => ({
            name: item.name,
            date: item.date,
          })),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).message || "Could not prepare trip"); }
      const data = await res.json();
      const trip = data.trip;

      setResolvedTrip(trip);
      setTripTitle(trip.title || "");
      setTripDestination(trip.destination || "");
      // The user's explicitly-set header dates WIN over a reused trip's stored dates — a returning
      // trip must not silently clobber a fresh edit. Fall back to the trip's dates only when the
      // header had none (defensive: handleOptimizeClick already requires them).
      setTripTravelers(trip.numberOfTravelers || 2);
      // Prefill "What are you planning?" from an existing template context
      // (wedding/proposal template flows keep their type); default "trip".
      {
        const ctx = getTripContext();
        setTripEventType(ctx.experienceType || ctx.eventType || "trip");
      }

      // Persist the resolved tripId (and the dates) into the experience context so
      // downstream steps (createComparison, requestOptimizationPayment) pick it up
      // The user's explicit header dates WIN over a reused trip's stored dates;
      // fall back to the trip's dates only when none were set (dates derive from
      // the context hook, so this single write updates the header display too).
      updateTripContext({
        tripId: trip.id,
        startDate: effStart || trip.startDate || undefined,
        endDate: effEnd || trip.endDate || undefined,
        travelers: trip.numberOfTravelers || undefined,
      });

      // Trip Details step removed (Trip-Strip P3): the strip + EditTripPanel own
      // trip state, so Continue goes straight into the optimization preview.
      await fetchPreview();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Trip preparation failed", description: err.message });
    } finally {
      setResolvingTrip(false);
    }
  };

  const handleOptimizeClick = async () => {
    if (!user) {
      openSignInModal();
      return;
    }
    if (previewLoading || resolvingTrip) return;
    if (isLoading) {
      toast({ title: "Loading cart...", description: "Please wait a moment" });
      return;
    }
    const platformItems = cart?.items || [];
    if (platformItems.length === 0 && externalItems.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add items to your cart first" });
      return;
    }

    // Every trip needs dates before it can be prepared. Dates live in the always-visible trip-date
    // header at the top of the cart (not a step, not a modal) — if unset, nudge the user there.
    const effStart = tripStartDate;
    const effEnd = tripEndDate;
    if (!effStart || !effEnd) {
      setEditTripOpen(true);
      toast({ title: "Add your travel dates", description: "Set your trip dates to continue." });
      return;
    }
    if (new Date(effEnd) < new Date(effStart)) {
      toast({ variant: "destructive", title: "Invalid dates", description: "End date can't be before the start date." });
      return;
    }
    await proceedOptimize(effStart, effEnd);
  };

  // Trip-date header edits write straight to tripStartDate/tripEndDate and persist into the
  // experience context so downstream steps + a returning visit keep the range.
  const updateTripDates = (next: { start?: string; end?: string }) => {
    const start = next.start ?? tripStartDate;
    let end = next.end ?? tripEndDate;
    if (start && end && new Date(end) < new Date(start)) end = start; // keep end >= start
    updateTripContext({ startDate: start || undefined, endDate: end || undefined });
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
      // Send DB identifiers so the server derives the tier server-side
      const ctxAtPayment = getTripContext();
      const tripId: string | undefined = ctxAtPayment.tripId;
      const userExperienceId: string | undefined = ctxAtPayment.userExperienceId || ctxAtPayment.id;

      const res = await fetch("/api/optimization-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tripId, userExperienceId, comparisonContext: { destination: experienceTitle } }),
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
    
    const experienceContext: TripContext | undefined = getTripContext();

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
        tripId: experienceContext?.tripId,
        userExperienceId: experienceContext?.userExperienceId || experienceContext?.id,
        ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
      });
      
      const comparison = await response.json();
      // G7: if we have a tripId, signal the comparison page to auto-apply and redirect
      const autoApplyFlag = experienceContext?.tripId ? "?autoApply=1" : "";
      setLocation(`/itinerary-comparison/${comparison.id}${autoApplyFlag}`);
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
    const experienceContext: TripContext | undefined = getTripContext();
    
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
    
    // CON-A.P1: free preview path. Full LLM optimization is delivered via the gated
    // paid path (/api/optimization-payments → /confirm) surfaced from the Concierge UI.
    const previewItems = [
      ...platformServices.map(s => ({
        serviceType: s.category || "sightseeing",
        price: s.price,
        duration: 90,
        dayNumber: 1,
      })),
      ...externalServices.map((s, i) => ({
        serviceType: s.category || "activity",
        price: s.price,
        duration: 120,
        dayNumber: Math.floor(i / 3) + 1,
      })),
    ];

    try {
      const response = await fetch("/api/optimization-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: previewItems,
          eventType: experienceContext?.experienceType,
        }),
      });
      if (response.ok) {
        const preview: OptimizationPreview = await response.json();
        setOptimizationPreview(preview);
        setOptimizationPayment(null);
        setFlowStep("optimize");
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
      <div className="container py-8 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
    <div className="container py-8 max-w-5xl mx-auto">
        {/* Flow Steps Indicator — visited/reachable steps are clickable so the
            stepper doubles as navigation; steps the user hasn't unlocked yet
            stay muted and inert (you can't jump to Optimize before Trip
            details, or to Itinerary before an optimization exists). */}
        {(() => {
          const steps: Array<{ key: FlowStep; label: string; icon: ReactNode; reachable: boolean }> = [
            { key: "cart", label: "Cart", icon: <ShoppingCart className="w-4 h-4" />, reachable: true },
            { key: "optimize", label: "Optimize", icon: <Lock className="w-4 h-4" />, reachable: !!optimizationPreview },
            { key: "itinerary", label: "Itinerary", icon: <Sparkles className="w-4 h-4" />, reachable: !!optimizationResult },
            { key: "payment", label: "Payment", icon: <CreditCard className="w-4 h-4" />, reachable: (cart?.items?.length || 0) > 0 || !!checkoutPaymentIntent },
          ];
          return (
            <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && <div className="w-8 h-px bg-border" />}
                  <button
                    type="button"
                    onClick={() => { if (s.reachable && s.key !== flowStep) setFlowStep(s.key); }}
                    disabled={!s.reachable}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                      flowStep === s.key
                        ? "bg-primary text-white"
                        : s.reachable
                          ? "bg-muted hover:bg-primary/15 hover:text-primary cursor-pointer"
                          : "bg-muted/60 text-muted-foreground/60 cursor-default"
                    }`}
                    data-testid={`step-pill-${s.key}`}
                  >
                    {s.icon}
                    <span className="text-sm font-medium">{s.label}</span>
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5 px-3"
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
                // Payment: return to where the user actually came from — an
                // optimized itinerary if one exists, otherwise straight back to
                // the cart (the "Proceed to Payment" skip path). Previously this
                // always went to the Itinerary step, which is empty when the
                // user never optimized.
                setFlowStep(optimizationResult ? "itinerary" : "cart");
              }
            }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            {flowStep === "cart" ? "Back" :
              flowStep === "optimize" ? "Cart" :
              flowStep === "itinerary" ? "Cart" :
              optimizationResult ? "Itinerary" : "Cart"}
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

        {/* Trip-date header — always-visible, editable trip date range (not a step, not a modal).
            Seeds from the experience context; edits persist there for downstream steps. */}
        {flowStep === "cart" && totalItemCount > 0 && (
          <div
            className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 py-3 mb-4 rounded-lg border border-border bg-card"
            data-testid="header-trip-dates"
          >
            <div className="flex items-center gap-2 text-sm font-medium shrink-0 sm:pb-2">
              <Calendar className="w-4 h-4 text-primary" />
              Travel dates
            </div>
            <div className="flex items-end gap-3 flex-1">
              <div className="space-y-1 flex-1 max-w-[10rem]">
                <Label htmlFor="header-start" className="text-xs text-muted-foreground">Start</Label>
                <Input
                  id="header-start"
                  type="date"
                  value={tripStartDate}
                  onChange={(e) => updateTripDates({ start: e.target.value })}
                  className="h-9"
                  data-testid="input-header-start-date"
                />
              </div>
              <div className="space-y-1 flex-1 max-w-[10rem]">
                <Label htmlFor="header-end" className="text-xs text-muted-foreground">End</Label>
                <Input
                  id="header-end"
                  type="date"
                  min={tripStartDate || undefined}
                  value={tripEndDate}
                  onChange={(e) => updateTripDates({ end: e.target.value })}
                  className="h-9"
                  data-testid="input-header-end-date"
                />
              </div>
            </div>
            {(!tripStartDate || !tripEndDate) && (
              <span className="text-xs text-muted-foreground sm:pb-2">Add dates to prepare your trip</span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 sm:mb-1"
              onClick={() => setEditTripOpen(true)}
              data-testid="button-edit-trip"
            >
              Edit trip
            </Button>
          </div>
        )}
        <EditTripPanel open={editTripOpen} onOpenChange={setEditTripOpen} />

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
                Sign in to book
              </button>
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (cart?.items?.length || 0) === 0 && externalItems.length === 0 && guestPendingIds.length === 0 && flowStep === "cart" && !optimizationResult ? (
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
                  {/* Funnel PR2: optimization nudge — REAL preview metrics only (§13);
                      hidden when the preview finds no room to improve, or when the
                      optimizer is disabled (feeCents 0 without a free re-run). Fee is
                      the config-resolved amount the preview returned. */}
                  {cartNudge && !optimizationResult &&
                    (cartNudge.estimatedSavingsPct > 0 || cartNudge.estimatedScheduleTighteningPct > 0) &&
                    (cartNudge.feeCents > 0 || cartNudge.freeRerun) && (
                    <button
                      type="button"
                      onClick={handleOptimizeClick}
                      disabled={resolvingTrip || previewLoading}
                      className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-left text-sm hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF385C]"
                      data-testid="cart-optimize-nudge"
                    >
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="font-medium">
                        Preview: up to {cartNudge.estimatedSavingsPct}% savings
                        {cartNudge.estimatedCostDelta < 0 && (
                          <> (~{formatPrice(Math.abs(cartNudge.estimatedCostDelta / 100))} less)</>
                        )}
                      </span>
                      <span className="text-muted-foreground">Plan score {cartNudge.currentScore}/100</span>
                      <span className="ml-auto font-semibold text-primary whitespace-nowrap">
                        {cartNudge.freeRerun ? "Optimize free →" : `Optimize · ${formatPrice(cartNudge.feeCents / 100)} →`}
                      </span>
                    </button>
                  )}
                  {(cart?.items || []).map((item) => {
                    const isContent = item.isContentItem || (item.contentId && item.contentType);
                    const contentDisplay = item.contentDisplay ?? (item.contentMeta ? {
                      name: (item.contentMeta as any).name || item.contentId || "Item",
                      imageUrl: (item.contentMeta as any).imageUrl || null,
                      city: (item.contentMeta as any).city || null,
                      description: (item.contentMeta as any).description || null,
                      price: (item.contentMeta as any).price || null,
                    } : null);

                    const contentTypeLabel = item.contentType === "gem" ? "Hidden Gem" : item.contentType === "hotel" ? "Hotel" : item.contentType === "activity" ? "Activity" : "Discover Item";

                    if (isContent && contentDisplay) {
                      return (
                        <Card key={item.id} data-testid={`cart-item-${item.id}`} className="border-primary/20">
                          <CardContent className="p-4">
                            <div className="flex gap-4">
                              {contentDisplay.imageUrl && (
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                                  <img src={contentDisplay.imageUrl} alt={contentDisplay.name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold truncate" data-testid={`text-service-name-${item.id}`}>
                                    {contentDisplay.name}
                                  </h3>
                                  <Badge variant="outline" className="text-xs border-primary/40 text-primary flex-shrink-0">
                                    {contentTypeLabel}
                                  </Badge>
                                </div>
                                {contentDisplay.description && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {contentDisplay.description}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                                  {contentDisplay.city && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {contentDisplay.city}
                                    </span>
                                  )}
                                  {contentDisplay.price && (
                                    <span className="flex items-center gap-1 font-medium text-foreground">
                                      {contentDisplay.price}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Saved from Discover — will be resolved at checkout
                                </p>
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
                      );
                    }

                    return (
                    <Card key={item.id} data-testid={`cart-item-${item.id}`}>
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
                              {formatPrice(parseFloat(item.service?.price || "0"))}
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
                    );
                  })}
                  
                  {externalItems.map((item) => (
                    <Card key={item.id} data-testid={`cart-item-${item.id}`} className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold" data-testid={`text-service-name-${item.id}`}>
                                {item.name}
                              </h3>
                              <Badge variant="outline" className="text-xs border-primary text-primary">
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
                              {formatPrice(item.price)}
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

                  {/* Guest pending items — saved in localStorage before sign-in */}
                  {!user && guestPendingIds.map((serviceId) => (
                    <Card key={serviceId} data-testid={`cart-item-${serviceId}`} className="border-primary/20">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <ShoppingCart className="w-8 h-8 text-muted-foreground shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-sm">Saved service</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Sign in to view details and checkout</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              const updated = guestPendingIds.filter((id) => id !== serviceId);
                              localStorage.setItem("traveloure_guest_cart_pending", JSON.stringify(updated));
                              setGuestPendingIds(updated);
                            }}
                            data-testid={`button-remove-pending-${serviceId}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="lg:col-span-1 space-y-4">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>Order Summary</CardTitle>
                        <Select value={displayCurrency} onValueChange={handleCurrencyChange}>
                          <SelectTrigger className="w-28 h-7 text-xs gap-1" data-testid="select-display-currency">
                            <Globe className="w-3 h-3 shrink-0" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_CURRENCIES.map(c => (
                              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span data-testid="text-subtotal">{formatPrice(combinedSubtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform fee</span>
                        <span data-testid="text-platform-fee">{formatPrice(platformFee)}</span>
                      </div>
                      {conciergeFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Booking Concierge fee</span>
                          <span data-testid="text-concierge-fee">{formatPrice(conciergeFee)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span data-testid="text-total">{formatPrice(combinedTotal)}</span>
                      </div>
                      {displayCurrency !== "USD" && (
                        <p className="text-xs text-muted-foreground" data-testid="text-currency-disclaimer">
                          Prices shown and charged in {displayCurrency}.
                        </p>
                      )}
                    </CardContent>
                    {/* Cart cross-sell upsell slot */}
                    <div className="px-6 pb-0">
                      <UpsellSlot
                        surface="cart"
                        onAddBookable={(c) => addUpsellMutation.mutate(c)}
                        addingOfferingId={addingUpsellId}
                        contextPayload={user ? {
                          cartItems: (cart?.items ?? []).map((item: any) => ({
                            offeringId: item.serviceId ?? item.contentId ?? item.offeringId ?? String(item.id ?? ""),
                            categoryKey: item.category ?? item.itemType ?? item.contentType ?? "general",
                          })).filter((ci: any) => ci.offeringId),
                          userProfile: {
                            mobilityLevel: (user as any).mobility_level ?? (user as any).mobilityLevel ?? undefined,
                            budgetTier: (user as any).budget_tier ?? (user as any).budgetTier ?? undefined,
                            partySize: (user as any).default_party_size ?? (user as any).partySize ?? undefined,
                            interests: Array.isArray((user as any).interests) ? (user as any).interests : undefined,
                          },
                        } : undefined}
                      />
                    </div>
                    <CardFooter className="flex flex-col gap-3">
                      {contentItems.length > 0 && (
                        <div className="w-full p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                          <div className="flex items-start gap-2 mb-2">
                            <Route className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <h4 className="text-sm font-medium">Start Planning Your Trip</h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                Add your {contentItems.length} saved discover item{contentItems.length !== 1 ? "s" : ""} directly to a trip itinerary.
                              </p>
                            </div>
                          </div>
                          <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            size="sm"
                            onClick={openPlanningDialog}
                            data-testid="button-start-planning"
                          >
                            <Route className="w-4 h-4 mr-2" />
                            Start Planning
                          </Button>
                        </div>
                      )}
                      {/* Cart-step primary: an honest step-forward CTA. The itinerary
                          cannot be generated from here — it needs confirmed trip
                          details and the optimize step first — so the "Generate
                          Itinerary" label lives on the step where generation
                          actually fires, not in the cart. */}
                      <div className="w-full p-3 rounded-lg bg-gradient-to-r from-[#FF385C]/10 to-purple-500/10 border border-primary/20">
                        <div className="flex items-start gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium">Plan &amp; optimize this trip</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              Next: our AI organizes your selections into an itinerary with optimized alternatives. Trip details live in the strip above — edit anytime.
                            </p>
                          </div>
                        </div>
                        <Button
                          className="w-full bg-primary hover:bg-primary/90"
                          size="lg"
                          onClick={handleOptimizeClick}
                          disabled={
                            previewLoading ||
                            resolvingTrip ||
                            (migrationStartedRef.current && !migrationDone) ||
                            ((cart?.items?.length || 0) === 0 && externalItems.length === 0 && guestPendingIds.length === 0)
                          }
                          data-testid="button-generate-itinerary-comparison"
                        >
                          {(previewLoading || resolvingTrip) ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <MapPin className="w-4 h-4 mr-2" />
                          )}
                          {resolvingTrip ? "Preparing trip..." : previewLoading ? "Analyzing your cart..." : "Continue — Optimize"}
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
                        <Sparkles className="w-5 h-5 text-primary" />
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
                          <span className="text-sm font-bold text-primary">{optimizationPreview.currentScore}/100</span>
                        </div>
                        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
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
                                ~{formatPrice(Math.abs(optimizationPreview.estimatedCostDelta / 100))} less
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
                                  className="h-full bg-primary/70 rounded-full"
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
                          <Lock className="w-5 h-5 text-primary" />
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
                            {formatPrice(optimizationPreview.feeCents / 100)}
                          </p>
                          <p className="text-xs text-muted-foreground">one-time fee{displayCurrency !== "USD" ? ` · charged in ${displayCurrency}` : ""}</p>
                        </div>
                      )}

                      {!optimizationPayment && (
                        <Button
                          className="w-full bg-primary hover:bg-primary/90"
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

                  <Card className="border border-border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                          <Zap className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Work with a Trip Planner</p>
                          <p className="text-xs text-muted-foreground">Let an expert handle every detail</p>
                        </div>
                      </div>
                      {/* Funnel PR2: carry the plan's context to the expert page — the
                          old bare link dropped the cart entirely (funnel audit). The
                          experts page consumes ?destination= (filters + search);
                          tripId rides along for the future full plan-handoff rail
                          (filed follow-up: expert sees the cart snapshot). */}
                      <Link href={`/experts?role=travel_expert${tripDestination ? '&destination=' + encodeURIComponent(tripDestination) : ''}${resolvedTrip?.id ? '&tripId=' + resolvedTrip.id : ''}`}>
                        <Button variant="outline" size="sm" className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" data-testid="button-find-trip-planner">
                          Find a Trip Planner <ArrowLeft className="w-3.5 h-3.5 ml-1.5 rotate-180" />
                        </Button>
                      </Link>
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
                            <Sparkles className="w-5 h-5 text-primary" />
                            Optimization Score
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            <div className="text-4xl font-bold text-primary">
                              {optimizationResult.overallScore}%
                            </div>
                            <div className="flex-1">
                              <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary transition-all"
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
                        <span>{formatPrice(combinedSubtotal)}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-{formatPrice(optimizationResult.estimatedTotal.savings)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform fee</span>
                        <span>{formatPrice(platformFee)}</span>
                      </div>
                      {conciergeFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Booking Concierge fee</span>
                          <span>{formatPrice(conciergeFee)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>{formatPrice(combinedTotal - (optimizationResult?.estimatedTotal?.savings || 0))}</span>
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
                          className="w-full bg-primary hover:bg-primary/90"
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
                  {/* Checkout add-ons — error-bounded so slot failure never blocks payment */}
                  <UpsellErrorBoundary fallback={null}>
                    <UpsellSlot
                      surface="checkout"
                      maxItems={2}
                      heading="Add to your booking"
                    />
                  </UpsellErrorBoundary>
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
                              {formatPrice(parseFloat(item.service?.price || "0") * item.quantity)}
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
                              {formatPrice(item.price * item.quantity)}
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
                        <span>{formatPrice(combinedSubtotal)}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-{formatPrice(optimizationResult.estimatedTotal.savings)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform fee</span>
                        <span>{formatPrice(platformFee)}</span>
                      </div>
                      {conciergeFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Booking Concierge fee</span>
                          <span data-testid="text-concierge-fee-payment">{formatPrice(conciergeFee)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>{formatPrice(combinedTotal - (optimizationResult?.estimatedTotal?.savings || 0))}</span>
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
                          className="w-full bg-primary hover:bg-primary/90"
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

      {/* ── Start Planning Dialog ─────────────────────────────────────────── */}
      <Dialog open={showPlanningDialog} onOpenChange={setShowPlanningDialog}>
        <DialogContent className="max-w-lg" data-testid="dialog-start-planning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="w-5 h-5 text-emerald-600" />
              Add to Trip Itinerary
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Item selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Select items to add ({selectedPlanItemIds.size} selected)
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {contentItems.map((item) => {
                  const meta = item.contentMeta as any || {};
                  const name = meta.name || item.contentId || "Discover item";
                  const city = meta.city || meta.location || null;
                  const checked = selectedPlanItemIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      data-testid={`label-plan-item-${item.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedPlanItemIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(item.id); else next.delete(item.id);
                            return next;
                          });
                        }}
                        data-testid={`checkbox-plan-item-${item.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {city && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{city}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Trip selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Add to which trip?</Label>
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={planningTripMode === "existing" ? "default" : "outline"}
                  onClick={() => setPlanningTripMode("existing")}
                  data-testid="button-mode-existing"
                >
                  Existing trip
                </Button>
                <Button
                  size="sm"
                  variant={planningTripMode === "new" ? "default" : "outline"}
                  onClick={() => setPlanningTripMode("new")}
                  data-testid="button-mode-new"
                >
                  Create new trip
                </Button>
              </div>

              {planningTripMode === "existing" ? (
                userTrips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No trips yet.{" "}
                    <button
                      type="button"
                      className="underline text-foreground"
                      onClick={() => setPlanningTripMode("new")}
                    >
                      Create one instead
                    </button>
                  </p>
                ) : (
                  <Select value={planningTripId} onValueChange={setPlanningTripId}>
                    <SelectTrigger data-testid="select-trip">
                      <SelectValue placeholder="Select a trip…" />
                    </SelectTrigger>
                    <SelectContent>
                      {userTrips.map((trip: any) => (
                        <SelectItem key={trip.id} value={trip.id}>
                          {trip.title || "Untitled trip"} — {trip.destination}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="new-trip-name" className="text-xs text-muted-foreground mb-1 block">
                      Trip name *
                    </Label>
                    <Input
                      id="new-trip-name"
                      placeholder="e.g. Tokyo Adventure"
                      value={newTripName}
                      onChange={(e) => setNewTripName(e.target.value)}
                      data-testid="input-new-trip-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-trip-destination" className="text-xs text-muted-foreground mb-1 block">
                      Destination (optional)
                    </Label>
                    <Input
                      id="new-trip-destination"
                      placeholder="e.g. Tokyo, Japan"
                      value={newTripDestination}
                      onChange={(e) => setNewTripDestination(e.target.value)}
                      data-testid="input-new-trip-destination"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPlanningDialog(false)}
              data-testid="button-cancel-planning"
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConvertToItinerary}
              disabled={convertToItineraryMutation.isPending || selectedPlanItemIds.size === 0}
              data-testid="button-confirm-planning"
            >
              {convertToItineraryMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {convertToItineraryMutation.isPending ? "Adding…" : `Add ${selectedPlanItemIds.size} item${selectedPlanItemIds.size !== 1 ? "s" : ""} to trip`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
