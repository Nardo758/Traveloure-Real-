import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { createComparison as createComparisonRequest } from "@/lib/create-comparison";
import { useAuth } from "@/hooks/use-auth";
import { getGuestSessionId } from "@/lib/guestSession";
import { getTripContext, updateTripContext, switchTripContext, useTripContext, type TripContext } from "@/lib/trip-context";
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
import { format, parseISO } from "date-fns";
import { useSignInModal } from "@/contexts/SignInModalContext";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { UpsellSlot, UpsellErrorBoundary } from "@/components/UpsellSlot";
import { getAcquisitionRef } from "@/lib/acquisition";
import { useSavedPayment, formatCardLabel } from "@/hooks/use-saved-payment";

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
  slotId?: string | null;
  // Slot detail joined server-side (_enrichCartItems) — real times, never fabricated client-side.
  slot?: { date: string; startTime: string | null; endTime: string | null } | null;
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
    // §17 property rooms (migration 153): 'per_night' marks a room-stay item —
    // charge is nights × price, never quantity × price. NULL/undefined = flat price.
    pricingUnit?: string | null;
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

// L1: mirrors the server's getRoomNights (server/routes/payments.routes.ts) — a §17
// property-room item carries its stay in contentMeta.{checkIn,checkOut} (the pricing
// unit that gates it is item.service.pricingUnit === "per_night"). Client-side display
// only; the server independently re-derives and re-validates this at checkout (§14).
function getRoomStay(item: CartItem): { checkIn: string; checkOut: string; nights: number } | null {
  if (item.service?.pricingUnit !== "per_night") return null;
  const meta = (item.contentMeta ?? {}) as Record<string, unknown>;
  const checkIn = typeof meta.checkIn === "string" ? meta.checkIn : null;
  const checkOut = typeof meta.checkOut === "string" ? meta.checkOut : null;
  if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  if (checkOut <= checkIn) return null;
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  if (!Number.isFinite(nights) || nights < 1) return null;
  return { checkIn, checkOut, nights };
}

/**
 * THE CLIENT POLLING FALLBACK for a cart checkout (task #213, legacy-reconciliation lane).
 *
 * The Stripe webhook (`payment_intent.succeeded`) is the authoritative confirmation path, but it
 * is asynchronous and is not delivered at all in local dev. This flow previously had NO client
 * fallback whatsoever: `StripeCheckout` took `bookingIds` and never used them, so the traveler's
 * browser observed a successful payment and told the server nothing. Both endpoints below now
 * cover cart bookings (they used to query the legacy `bookings` table with `service_bookings`
 * ids and match nothing) and BOTH are idempotent server-side — the atomic conditional in the
 * shared promotion is the guard, so a webhook that lands mid-poll simply wins and every call
 * here becomes a no-op. Never a double flip, and never a reason to block the traveler.
 */
async function confirmCheckoutPayment(
  bookingIds: string[],
  paymentIntentId: string,
  attempts = 4,
  delayMs = 1200,
): Promise<void> {
  if (bookingIds.length === 0) return;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch("/api/bookings/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookingIds }),
      });
      if (res.ok && (await res.json()).allConfirmed) return; // the webhook got there first
    } catch {
      /* transient — keep polling, then fall through to the explicit confirm */
    }
  }
  await Promise.all(
    bookingIds.map((bookingId) =>
      fetch("/api/bookings/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bookingId, paymentIntentId }),
      }).catch(() => undefined),
    ),
  );
}

export default function CartPage() {
  const { user, isLoading: authLoading, updatePreferredCurrency } = useAuth();
  const { openSignInModal } = useSignInModal();
  // FP-2: one-click "pay with saved card" for the optimization fee.
  const savedPayment = useSavedPayment(!!user);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [flowStep, setFlowStep] = useState<FlowStep>("cart");
  // Generated once per page mount — stays stable across multiple "Pay Now" clicks
  // so duplicate submissions carry the same key and are de-duped server-side + by Stripe.
  const [checkoutIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [experienceSlug, setExperienceSlug] = useState<string | null>(null);
  const [externalItems, setExternalItems] = useState<ExternalCartItem[]>([]);

  // Optimization preview + payment state (G3 + G4)
  const [previewLoading, setPreviewLoading] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState<OptimizationPreview | null>(null);
  const [optimizationPayment, setOptimizationPayment] = useState<OptimizationPaymentState | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  // FP-2: one-click charge in flight (separate from paymentLoading, which covers the sheet setup path).
  const [oneClickLoading, setOneClickLoading] = useState(false);
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

  // Load experience context on mount.
  // Only apply an experienceSlug filter when the context has an explicit slug —
  // i.e. the user arrived via an experience-template flow. In all other cases
  // (direct /cart visit, general browsing) we leave experienceSlug null so the
  // API returns every item for the user rather than a narrow slug-filtered subset.
  // Previously this effect set a synthetic fallback like "general" or
  // "travel_paris" which caused the server to exclude items stored under real
  // experience slugs, making the cart appear empty even though the TripStrip
  // (which fetches without a slug) correctly showed a non-zero count.
  useEffect(() => {
    const context = getTripContext();
    if (context.experienceSlug) {
      setExperienceSlug(context.experienceSlug);
    }
    // No slug → experienceSlug stays null → fetches all items unfiltered.
  }, []);

  // Header title + the optimize/payment/comparison request assembly's `comparisonContext.destination`
  // BOTH derive from this ONE live selector (liveTripCtx, the useTripContext() hook above) — never a
  // separate frozen-at-mount snapshot. A one-time useState+effect here previously froze this value at
  // page load, so it could silently disagree with `ctx.tripId` (read fresh via getTripContext() at
  // request time) once the trip context changed later on the same page visit — "two reads that can
  // disagree" on which trip is active. Deriving it every render from the same hook the rest of the
  // page's live trip state (tripStartDate/tripEndDate above) already uses closes that gap.
  const experienceTitle = liveTripCtx.title || liveTripCtx.experienceType || null;

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
  // FP-4: once /api/checkout succeeds it clears the cart server-side (bookings are
  // created payment_pending before the Stripe charge), so the live cart query goes
  // empty right under the payment step. Snapshot the real checkout response here so
  // the Order Review + fee breakdown the traveler sees while entering card details
  // reflects what they're actually about to pay — not an empty cart or the pre-checkout
  // (concierge-fee-less) estimate. Server-derived fields only, no invented numbers (§13/§14).
  const [checkoutOrderSnapshot, setCheckoutOrderSnapshot] = useState<{
    items: CartItem[];
    externalItems: ExternalCartItem[];
    subtotal: string;
    platformFee: string;
    conciergeFee: string;
    total: string;
  } | null>(null);
  // FP-4: C3 slot-conflict — which cart item(s) (by serviceId) the last checkout
  // attempt flagged as slot_unavailable, so the traveler sees WHICH item to fix
  // instead of just a toast that vanishes.
  const [flaggedSlotItemIds, setFlaggedSlotItemIds] = useState<Set<string>>(new Set());

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

  // Single source of truth (§13): this is the SAME unfiltered GET /api/cart query,
  // under the identical react-query key, that TripStrip's cart chip reads — so "Your
  // Cart" can never show fewer items/less money than the chip that links here.
  //
  // Previously this fetched `/api/cart?experience=${experienceSlug}`, server-side
  // filtered to items tagged with the CURRENT TripContext.experienceSlug (+ unslugged
  // items). TripContext.experienceSlug is sticky (sessionStorage, mirrored to the
  // server via trip-context.ts) and drifts independently of what's actually in the
  // cart: browsing a second, unrelated experience template after adding real items
  // updates the context's slug without touching those items' stored slug, so the
  // filtered fetch silently excluded them — "Your cart is empty" here while the chip
  // (which always reads the full, unfiltered cart) correctly showed a nonzero count
  // and total. Root-caused + reproduced against a real cart (see the trip-strip
  // divergence writeup); the matching server-side defect — unslugged adds were being
  // stamped with the literal string "general" instead of left NULL, defeating
  // storage.getCartItems()'s own "unslugged items belong in every experience view"
  // fallback — is fixed in routes.ts POST /api/cart. Fixing the query here is the
  // durable half: it can't diverge from the chip regardless of what any experience
  // slug (past, present, or a poisoned trip_contexts row) says.
  const { data: cart, isLoading } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    queryFn: async () => {
      const guestId = localStorage.getItem("traveloure_guest_session");
      const headers: Record<string, string> = {};
      if (guestId) headers["X-Guest-Session"] = guestId;
      const res = await fetch("/api/cart", { credentials: "include", headers });
      if (!res.ok) throw new Error("Failed to fetch cart");
      return res.json();
    },
    enabled: !authLoading,
  });

  // L1: when the trip-level date range isn't set yet, a room-stay item's own dates
  // are real trip dates too — falling back to them keeps the "Add your travel dates"
  // banner/nudge from claiming no dates exist when one is plainly visible in the cart.
  const roomStayFallbackDates = (() => {
    if (tripStartDate && tripEndDate) return null;
    const stays = (cart?.items || [])
      .map((item) => getRoomStay(item))
      .filter((s): s is { checkIn: string; checkOut: string; nights: number } => !!s);
    if (stays.length === 0) return null;
    const checkIns = stays.map((s) => s.checkIn).sort();
    const checkOuts = stays.map((s) => s.checkOut).sort();
    return { start: checkIns[0], end: checkOuts[checkOuts.length - 1] };
  })();
  const effectiveTripStartDate = tripStartDate || roomStayFallbackDates?.start || "";
  const effectiveTripEndDate = tripEndDate || roomStayFallbackDates?.end || "";

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
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: `${data.convertedCount} item${data.convertedCount !== 1 ? "s" : ""} added to your trip!`,
        description: "View and arrange them in your trip itinerary.",
      });
      setShowPlanningDialog(false);
      setLocation(`/plans/${data.tripId}`);
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
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to your cart" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Could not add item", description: "Please try again." });
    },
    onSettled: () => setAddingUpsellId(null),
  });

  const checkoutMutation = useMutation({
    onMutate: () => {
      // A fresh attempt supersedes any earlier slot flag — if the same item fails
      // again the error handler below re-flags it.
      setFlaggedSlotItemIds(new Set());
    },
    mutationFn: async () => {
      if ((cart?.items?.length || 0) === 0) {
        throw new Error("No platform items to checkout");
      }
      const res = await apiRequest("POST", "/api/checkout", {
        currency: displayCurrency,
        idempotencyKey: checkoutIdempotencyKey,
        // S4: raw captured short-link code; the SERVER derives the attribution source
        // (direct | link | cross_sell) — the client never asserts it.
        ...(getAcquisitionRef() ? { ref: getAcquisitionRef() } : {}),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      // Merge resolution (FP-4 × Replit TripStrip fix): the snapshot below MUST read the live
      // cart items BEFORE any invalidation empties them (FP-4), so the Replit branch's
      // top-of-function invalidation is dropped; its base-key ['/api/cart'] pattern (so the
      // TripStrip count updates — slug-scoped keys missed it) is applied to the invalidations
      // at the END of this handler instead. Both intents preserved.
      // Ruling 38 (truthfulness): a 2xx from /api/checkout is NOT by itself a booking.
      // `{duplicate:true}` with no paymentIntent means the server found a prior claim it could
      // not hand a payment sheet for — the old code fell into the `else` below and told the
      // traveler "Booking created!" then redirected to /bookings, which is how a checkout that
      // never obtained a PaymentIntent was reported as a success. Never again: no success copy
      // and no redirect unless there is something real behind it.
      if (!data.paymentIntent && data.duplicate) {
        setFlowStep("cart");
        toast({
          variant: "destructive",
          title: "Checkout couldn't be resumed",
          description:
            data.note ||
            "We couldn't reopen the payment for this checkout. Nothing has been charged — please refresh and try again.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        return;
      }
      if (data.paymentIntent) {
        // FP-4: snapshot the real, server-derived breakdown (incl. conciergeFee, which
        // the live GET /api/cart never computes) BEFORE invalidating — the cart is about
        // to go empty (checkout already cleared it server-side), but the payment step
        // still needs to show the traveler exactly what they're paying for.
        setCheckoutOrderSnapshot({
          items: cart?.items || [],
          externalItems,
          subtotal: data.subtotal,
          platformFee: data.platformFee,
          conciergeFee: data.conciergeFee ?? "0",
          total: data.total,
        });
        setCheckoutPaymentIntent(data.paymentIntent);
        setCheckoutBookingIds(data.bookings?.map((b: any) => b.booking?.id || b.id).filter(Boolean) || []);
        setFlowStep("payment");
      } else {
        toast({ title: "Booking created!", description: "Your services have been booked." });
        setLocation("/bookings");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
    },
    onError: (error: any) => {
      const msg = String(error?.message ?? "");
      if (msg === "No platform items to checkout") {
        toast({ variant: "destructive", title: "No bookable items", description: "External bookings must be completed on provider websites." });
        return;
      }
      // L1b: the server's error body is JSON shaped `{ error, message, serviceId? }` inside
      // a `"<status>: <bodyText>"` message (see queryClient.ts throwIfResNotOk) — parse it so
      // the toast can carry the server's own, specific explanation instead of hiding it.
      let parsedBody: any = null;
      try {
        const jsonStart = msg.indexOf(": ");
        parsedBody = JSON.parse(jsonStart >= 0 ? msg.slice(jsonStart + 2) : msg);
      } catch { /* not JSON (network error, etc.) — falls through to the generic message below */ }

      const errorCode = parsedBody?.error as string | undefined;
      // Ruling 38: the payment provider could not be reached, or the claim expired before
      // payment started. In BOTH cases the server committed nothing — the cart is intact and a
      // retry is the correct next action, so say exactly that instead of the old generic
      // "Your payment could not be processed" (which was written for a charge that failed).
      if (errorCode === "payment_unavailable" || errorCode === "checkout_claim_expired") {
        setFlowStep("cart");
        toast({
          variant: "destructive",
          title: errorCode === "payment_unavailable" ? "Payment provider unavailable" : "Checkout expired",
          description:
            parsedBody?.message ||
            "Nothing was charged and nothing was booked. Your cart is intact — please try again.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        return;
      }
      if (errorCode === "checkout_key_spent") {
        setFlowStep("cart");
        toast({
          variant: "destructive",
          title: "Start a new checkout",
          description:
            parsedBody?.message ||
            "This checkout has already been completed or has expired. Please start a new one.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        return;
      }
      if (errorCode === "slot_unavailable" || errorCode === "nights_unavailable") {
        // C3/§17: a picked availability slot or room-night filled between add-to-cart and
        // checkout — nothing was charged and no booking was created. Flag the specific item
        // (when the server told us which one) so the traveler sees WHICH item to fix instead
        // of just a toast that disappears.
        if (typeof parsedBody?.serviceId === "string") {
          setFlaggedSlotItemIds((prev) => new Set(prev).add(parsedBody.serviceId));
        }
        setFlowStep("cart");
        toast({
          variant: "destructive",
          title: errorCode === "nights_unavailable" ? "Those dates just booked" : "That time slot just booked",
          description: parsedBody?.message
            || "One of your items is no longer available for the dates/time you picked. Please pick another, or remove it.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        return;
      }

      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: parsedBody?.message || parsedBody?.detail
          || "Your payment could not be processed. You have not been charged — please try again.",
      });
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

  // Fix #970: the convert-to-trip control used to gate on `contentItems` alone (Discover
  // saves), so a cart holding ONLY a platform-service row (serviceId, no contentId/contentType)
  // had no "Start Planning" / "Add to Trip Itinerary" control at all — even though
  // POST /api/cart/convert-to-itinerary (W3) already converts service rows and preserves
  // providerServiceId on the created itinerary item. planCandidateItems mirrors that server
  // gate exactly (content OR a real service), so the control renders whenever the cart has
  // ANY convertible item.
  const planCandidateItems = (cart?.items || []).filter(
    (item) => item.isContentItem || (!!item.contentId && !!item.contentType) || !!item.serviceId
  );

  const openPlanningDialog = () => {
    if (!user) { openSignInModal(); return; }
    setSelectedPlanItemIds(new Set(planCandidateItems.map((i) => i.id)));
    setPlanningTripMode("existing");
    setPlanningTripId("");
    setNewTripName("");
    // §13: `provider_services.location` defaults to the literal "Unknown" — that is the
    // absence of a location, not a place name, so it must never be used as a destination fallback.
    const firstServiceLocation = planCandidateItems.find((i) => i.serviceId)?.service?.location;
    setNewTripDestination(
      (contentItems[0]?.contentMeta as any)?.city ||
      (contentItems[0]?.contentMeta as any)?.location ||
      (firstServiceLocation && firstServiceLocation !== "Unknown" ? firstServiceLocation : "") ||
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

      // Persist the resolved tripId — and the identity-coupled display fields it's
      // now bound to — into the context in ONE atomic switchTripContext call.
      // Money-adjacent invariant: this is the write that re-keys the context to
      // whichever trip resolve-trip actually returned, so `tripId` and the
      // destination/title shown on screen can never disagree afterward. A plain
      // merge (updateTripContext) here would only touch tripId/dates/travelers,
      // silently leaving destination/title/experienceType at whatever the LIVE
      // context held by the time this `await` resolved — which is not necessarily
      // `ctxAtResolve` (the snapshot that was actually sent to and used by
      // resolve-trip) if another write raced in during the network round-trip.
      // Pinning every identity field to `ctxAtResolve`/`trip` here closes that gap.
      // The user's explicit header dates WIN over a reused trip's stored dates;
      // fall back to the trip's dates only when none were set (dates derive from
      // the context hook, so this single write updates the header display too).
      switchTripContext({
        tripId: trip.id,
        destination: trip.destination || ctxAtResolve.destination,
        title: trip.title || ctxAtResolve.title,
        startDate: effStart || trip.startDate || undefined,
        endDate: effEnd || trip.endDate || undefined,
        travelers: trip.numberOfTravelers || ctxAtResolve.travelers || undefined,
        experienceType: ctxAtResolve.experienceType,
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
    // L1: fall back to a room-stay item's own dates first — the item already carries real
    // dates, so re-asking for them here would be the same "UI lies about state" bug.
    const effStart = effectiveTripStartDate;
    const effEnd = effectiveTripEndDate;
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

  // Fix #971: shared refusal handling for `POST /api/optimization-payments` — that endpoint now
  // runs the SAME `trip_empty_convert_cart` pre-flight `createComparison`'s
  // `POST /api/itinerary-comparisons` call already handled below (server/routes/optimization.routes.ts),
  // so a signed-in user with an empty trip and a full cart is refused BEFORE any Stripe call
  // instead of paying first and only finding out when the comparison is created. Both entry
  // points into that endpoint (the payment-sheet flow and the one-click saved-card flow) route
  // through this so the same guidance dialog opens either way. Returns true when the response
  // WAS this refusal — the caller stops there, having already surfaced the dialog.
  const handleOptimizationPaymentRefusal = (status: number, body: any): boolean => {
    if (status === 409 && body?.error === "trip_empty_convert_cart") {
      toast({
        title: "Add your cart to the trip first",
        description: "These items aren't on your trip yet, so there's nothing for the optimizer to work with.",
      });
      setShowPlanningDialog(true);
      return true;
    }
    return false;
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
      // Read the body regardless of status — the refusal is a JSON error payload, not a network failure.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleOptimizationPaymentRefusal(res.status, data)) return;
        throw new Error(data?.message || "Could not create payment");
      }

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
      // Runs on every path out of this function — success, the refusal `return`, and the
      // catch — so "Setting up…" never hangs regardless of which of those fires.
      setPaymentLoading(false);
    }
  };

  // FP-2: one-click — charge the saved default card off-session, no payment sheet.
  // Tri-state per FP-1's contract: succeeded (skip straight to /confirm), requiresAction
  // (fall back to the sheet with the returned clientSecret), or the endpoint's normal
  // freeRerun short-circuit (identical to the sheet path).
  const payWithSavedCard = async () => {
    if (!user) {
      openSignInModal();
      return;
    }
    if (!optimizationPreview) return;
    setOneClickLoading(true);
    try {
      const ctxAtPayment = getTripContext();
      const tripId: string | undefined = ctxAtPayment.tripId;
      const userExperienceId: string | undefined = ctxAtPayment.userExperienceId || ctxAtPayment.id;

      const res = await fetch("/api/optimization-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tripId,
          userExperienceId,
          comparisonContext: { destination: experienceTitle },
          useSavedCard: true,
        }),
      });
      // Read the body regardless of status — the refusal is a JSON error payload, not a network failure.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleOptimizationPaymentRefusal(res.status, data)) return;
        throw new Error(data?.message || "Could not start payment");
      }

      if (data.freeRerun) {
        await createComparison();
        return;
      }
      if (data.oneClick && data.status === "succeeded") {
        toast({ title: "Payment successful", description: "Building your optimized itinerary..." });
        await handleOptimizationPaymentSuccess(data.paymentIntentId);
        return;
      }
      if (data.requiresAction) {
        // Bank demands 3DS — fall back to the interactive sheet for this one charge.
        setOptimizationPayment({
          clientSecret: data.clientSecret,
          paymentIntentId: data.paymentIntentId,
          feeCents: data.feeCents,
          currency: data.currency || "USD",
        });
        return;
      }
      // No saved method after all (shouldn't happen if hasDefault was true) — fall back to the sheet.
      await requestOptimizationPayment();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment failed", description: err.message });
    } finally {
      setOneClickLoading(false);
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
      return null;
    };

    // §13 honest-or-absent (mirrors discover.tsx's createComparison): don't invent
    // "Your destination" — if nothing real resolves, block with a toast instead.
    const knownDestination = getComparisonDestination();
    if (!knownDestination) {
      toast({
        title: "Tell us where you're headed",
        description: "Add an item with a location, or start from a trip with a destination, so we know where to plan for.",
      });
      setCreatingComparison(false);
      return;
    }

    try {
      const comparison = await createComparisonRequest({
        title: experienceContext?.title || "My Trip",
        destination: knownDestination,
        startDate: experienceContext?.startDate || new Date().toISOString().split('T')[0],
        endDate: experienceContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: String(combinedTotal),
        // Real traveler count when known; otherwise omitted — server defaults to 1 (§13, no invented "2").
        ...(typeof experienceContext?.travelers === "number" ? { travelers: experienceContext.travelers } : {}),
        baselineItems,
        tripId: experienceContext?.tripId,
        userExperienceId: experienceContext?.userExperienceId || experienceContext?.id,
        optimizationPaymentId,
      });

      // G7: if we have a tripId, signal the comparison page to auto-apply and redirect. This
      // ?autoApply=1 query-param behavior is UNCHANGED (R-E only changed where the auto-apply
      // path itself lands — see itinerary-comparison.tsx).
      const autoApplyFlag = experienceContext?.tripId ? "?autoApply=1" : "";
      setLocation(`/itinerary-comparison/${comparison.id}${autoApplyFlag}`);
    } catch (error: any) {
      // Lane 5b: the optimizer reads the TRIP now, so a full cart against an empty trip is a
      // specific, fixable state rather than a generic failure. The server names it; we open the
      // existing "add these to a trip" dialog instead of dead-ending on a red toast.
      // (Matching on the message body follows the `dispute_window_closed` precedent in
      // my-bookings.tsx — apiRequest throws `"<status>: <body>"`.)
      const msg = typeof error?.message === "string" ? error.message : "";
      if (msg.includes("trip_empty_convert_cart")) {
        toast({
          title: "Add your cart to the trip first",
          description: "These items aren't on your trip yet, so there's nothing for the optimizer to work with.",
        });
        setShowPlanningDialog(true);
        return;
      }
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

        {/* Trip-date header — read-only summary of the strip-owned trip dates (P3b).
            Edits go through the shared EditTripPanel; the dates derive live from TripContext. */}
        {flowStep === "cart" && totalItemCount > 0 && (
          <div
            className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg border border-border bg-card"
            data-testid="header-trip-dates"
          >
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span
              className={`text-sm flex-1 ${effectiveTripStartDate && effectiveTripEndDate ? "font-medium" : "text-muted-foreground"}`}
              data-testid="text-header-trip-dates"
            >
              {effectiveTripStartDate && effectiveTripEndDate
                ? `${format(parseISO(effectiveTripStartDate), "MMM d")} → ${format(parseISO(effectiveTripEndDate), "MMM d")}${
                    !tripStartDate || !tripEndDate ? " (from your room dates)" : ""
                  }`
                : "Add your travel dates"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
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
                      {/* D5 (UX audit Jul 29): "Plan score" shown with no explanation of what
                          it measures — a real title tooltip closes that (display text only,
                          the underlying field name is unchanged). */}
                      <span
                        className="text-muted-foreground"
                        title="Plan score: how tightly scheduled and cost-efficient your current cart is, out of 100. Lower scores mean more room for the optimizer to improve it."
                      >
                        Plan score {cartNudge.currentScore}/100
                      </span>
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

                    // Fix 2 (journey UI fixes): the backend deliberately marks a plan item routed
                    // through to checkout with contentType:"itinerary_item" (cart-projection.service.ts
                    // — EXTERNAL_PROJECTION_CONTENT_TYPE) whenever it has no providerServiceId. That's
                    // correct server-side; the bug was this component rendering it with the generic
                    // Discover badge/copy, which is simply false for something that came from the
                    // traveler's own trip plan, not a Discover save.
                    const isTripRoutedItem = item.contentType === "itinerary_item";
                    const contentTypeLabel = isTripRoutedItem ? "From your trip" : item.contentType === "gem" ? "Hidden Gem" : item.contentType === "hotel" ? "Hotel" : item.contentType === "activity" ? "Activity" : "Discover Item";

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
                                {/* Fix 3 (journey UI fixes): ground-truthed against /api/checkout
                                    (payments.routes.ts) — every content-type cart row (isContentItem,
                                    including this itinerary_item projection) is enriched with
                                    `service: null` (storage._enrichCartItems) and checkout's subtotal
                                    loop + booking-creation loop both `if (!item.service) continue;` —
                                    so this price is genuinely never added to the subtotal/total and no
                                    booking is created for it. "Will be resolved at checkout" was false
                                    for a trip-routed item (nothing resolves it); label it honestly. */}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {isTripRoutedItem
                                    ? "Routed from your trip plan — shown for reference only, not included in this checkout total"
                                    : "Saved from Discover — will be resolved at checkout"}
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

                    const slotFlagged = !!(item.serviceId && flaggedSlotItemIds.has(item.serviceId));
                    // L1: a §17 property-room item is priced nights × rate, never
                    // quantity × price — mirror the server's own math (payments.routes.ts
                    // getRoomNights) so the display can never diverge from the charge.
                    const roomStay = getRoomStay(item);
                    const roomRate = parseFloat(item.service?.price || "0");
                    const roomTotal = roomStay ? roomRate * roomStay.nights : null;

                    return (
                    <Card key={item.id} data-testid={`cart-item-${item.id}`} className={slotFlagged ? "border-destructive/60" : undefined}>
                      <CardContent className="p-4">
                        {slotFlagged && (
                          <div
                            className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                            data-testid={`banner-slot-unavailable-${item.id}`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              This time slot was just booked by someone else. Pick a new time from the service page, or remove this item below.
                            </span>
                          </div>
                        )}
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
                              {roomStay ? (
                                <span className="flex items-center gap-1 font-medium text-foreground" data-testid={`text-room-dates-${item.id}`}>
                                  <Calendar className="w-3 h-3" />
                                  {format(parseISO(roomStay.checkIn), "MMM d")} → {format(parseISO(roomStay.checkOut), "MMM d")}
                                </span>
                              ) : item.scheduledDate ? (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(item.scheduledDate), "PPP")}
                                </span>
                              ) : null}
                            </div>
                            {roomStay ? (
                              <p className="text-sm text-muted-foreground mt-1.5" data-testid={`text-room-nights-${item.id}`}>
                                {roomStay.nights} night{roomStay.nights !== 1 ? "s" : ""} × {formatPrice(roomRate)} = {formatPrice(roomTotal || 0)}
                              </p>
                            ) : item.slotId && item.scheduledDate && (
                              <div
                                className="flex items-center gap-1 mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                                data-testid={`text-slot-held-${item.id}`}
                              >
                                <Lock className="w-3 h-3" />
                                Time slot held at checkout:{" "}
                                {item.slot?.date
                                  ? format(new Date(`${item.slot.date}T00:00:00`), "PPP")
                                  : format(new Date(item.scheduledDate), "PPP")}
                                {item.slot?.startTime && (
                                  <span>
                                    {" · "}{item.slot.startTime}
                                    {item.slot.endTime ? `–${item.slot.endTime}` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg" data-testid={`text-price-${item.id}`}>
                              {formatPrice(roomStay ? (roomTotal || 0) : parseFloat(item.service?.price || "0"))}
                            </p>
                            {roomStay ? (
                              // A room stay is one room for the whole date range — quantity
                              // is meaningless here (the server ignores it, see resolveItemBaseAmount)
                              // so no stepper is shown, just an honest "1 room" label.
                              <p className="text-xs text-muted-foreground mt-2" data-testid={`text-room-unit-${item.id}`}>
                                1 room
                              </p>
                            ) : (
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
                            )}
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
                      {planCandidateItems.length > 0 && (
                        <div className="w-full p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                          <div className="flex items-start gap-2 mb-2">
                            <Route className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <h4 className="text-sm font-medium">Start Planning Your Trip</h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                Add your {planCandidateItems.length} saved item{planCandidateItems.length !== 1 ? "s" : ""} directly to a trip itinerary.
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

                      {/* FP-2: one-click when a default saved card exists and this isn't the
                          free re-run (nothing to charge there). */}
                      {!optimizationPayment && !optimizationPreview.freeRerun && savedPayment.hasDefault ? (
                        <div className="space-y-2">
                          <Button
                            className="w-full bg-primary hover:bg-primary/90"
                            size="lg"
                            onClick={payWithSavedCard}
                            disabled={oneClickLoading || paymentLoading || creatingComparison}
                            data-testid="button-pay-saved-card-optimization"
                          >
                            {oneClickLoading || creatingComparison ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Lock className="w-4 h-4 mr-2" />
                            )}
                            {creatingComparison
                              ? "Building..."
                              : oneClickLoading
                                ? "Charging..."
                                : `Pay ${formatPrice(optimizationPreview.feeCents / 100)} with ${formatCardLabel(savedPayment.defaultCard)}`}
                          </Button>
                          <button
                            type="button"
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            onClick={requestOptimizationPayment}
                            disabled={oneClickLoading || paymentLoading || creatingComparison}
                            data-testid="button-use-different-card-optimization"
                          >
                            Use a different card
                          </button>
                        </div>
                      ) : !optimizationPayment && (
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
                          onSuccess={async (paymentIntentId) => {
                            // #213 (legacy-reconciliation lane): the CLIENT POLLING FALLBACK, which
                            // this flow never had. The webhook is the authoritative confirmation, but
                            // it is asynchronous (and undelivered in local dev), so poll bulk-status
                            // for it and, if it hasn't landed, drive the same shared promotion through
                            // confirm-payment. Both are idempotent — the server's atomic conditional
                            // is the guard, so a webhook arriving mid-poll simply wins and this
                            // becomes a no-op. Best-effort: never block the traveler's confirmation
                            // screen on it (the booking is already paid; the webhook will catch up).
                            await confirmCheckoutPayment(checkoutBookingIds, paymentIntentId).catch(() => {});
                            queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
                            toast({ title: "Payment successful!", description: "Your booking has been confirmed." });
                            setLocation("/bookings");
                          }}
                          onError={(error) => {
                            toast({ variant: "destructive", title: "Payment failed", description: error });
                          }}
                          onCancel={() => {
                            // FP-4: this used to jump to the "itinerary" step, which is only ever
                            // populated by a full-optimization run this flow doesn't produce — landing
                            // there showed an empty page with no way back to the pending payment.
                            // The booking was already created payment_pending server-side before this
                            // Stripe step; staying here (same clientSecret) lets the traveler retry
                            // immediately instead of losing track of it.
                            toast({
                              title: "Payment not completed",
                              description: "Your booking is saved and pending payment. Retry above, or finish it later from My Bookings.",
                            });
                          }}
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
                        {(checkoutOrderSnapshot ? checkoutOrderSnapshot.items : (cart?.items || [])).map((item) => {
                          // L1: same nights × rate math as the cart step — the Order Review
                          // must not repeat the quantity-based lie for a room stay.
                          const roomStay = getRoomStay(item);
                          const rate = parseFloat(item.service?.price || "0");
                          const lineTotal = roomStay ? rate * roomStay.nights : rate * item.quantity;
                          return (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                              <div>
                                <div className="font-medium">{item.service?.serviceName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {roomStay
                                    ? `${format(parseISO(roomStay.checkIn), "MMM d")} → ${format(parseISO(roomStay.checkOut), "MMM d")} · ${roomStay.nights} night${roomStay.nights !== 1 ? "s" : ""}`
                                    : `Qty: ${item.quantity}`}
                                </div>
                              </div>
                              <div className="font-medium">
                                {formatPrice(lineTotal)}
                              </div>
                            </div>
                          );
                        })}
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
                      {/* FP-4: once checkout has run, these figures come straight from that
                          response — the exact amount Stripe is charging above — instead of the
                          live cart query (already emptied server-side) or the pre-checkout
                          estimate (which never includes the Booking Concierge fee; see filed gap). */}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span data-testid="text-subtotal-payment">
                          {formatPrice(checkoutOrderSnapshot ? parseFloat(checkoutOrderSnapshot.subtotal) : combinedSubtotal)}
                        </span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-{formatPrice(optimizationResult.estimatedTotal.savings)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform fee</span>
                        <span data-testid="text-platform-fee-payment">
                          {formatPrice(checkoutOrderSnapshot ? parseFloat(checkoutOrderSnapshot.platformFee) : platformFee)}
                        </span>
                      </div>
                      {(checkoutOrderSnapshot ? parseFloat(checkoutOrderSnapshot.conciergeFee) : conciergeFee) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Booking Concierge fee</span>
                          <span data-testid="text-concierge-fee-payment">
                            {formatPrice(checkoutOrderSnapshot ? parseFloat(checkoutOrderSnapshot.conciergeFee) : conciergeFee)}
                          </span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span data-testid="text-total-payment">
                          {formatPrice(
                            (checkoutOrderSnapshot ? parseFloat(checkoutOrderSnapshot.total) : combinedTotal) -
                              (optimizationResult?.estimatedTotal?.savings || 0)
                          )}
                        </span>
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
                {planCandidateItems.map((item) => {
                  const meta = item.contentMeta as any || {};
                  const isContent = item.isContentItem || (!!item.contentId && !!item.contentType);
                  // Fix #970: a platform-service row has no contentMeta — its honest name/
                  // location/price come from the joined `service` (never invented; §13's
                  // "Unknown" location literal is filtered out, matching the rest of this file).
                  const name = isContent
                    ? (meta.name || item.contentId || "Discover item")
                    : (item.service?.serviceName || "Platform service");
                  const city = isContent
                    ? (meta.city || meta.location || null)
                    : (item.service?.location && item.service.location !== "Unknown" ? item.service.location : null);
                  const price = isContent ? null : item.service?.price;
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
                      {price && parseFloat(String(price)) > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-plan-item-price-${item.id}`}>
                          {formatPrice(parseFloat(String(price)))}
                        </span>
                      )}
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
