import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ServiceLocationMap, parseLatLng } from "@/components/service-location-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Star,
  DollarSign,
  ShoppingCart,
  MessageSquare,
  CheckCircle,
  Loader2,
  User,
  Users,
  ShieldCheck,
  Building2,
  Flag,
  Calendar,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Car,
  Handshake,
  Package,
  BedDouble,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { format, addMonths, subMonths, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StorefrontLink } from "@/components/marketplace/storefront-link";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";

interface PricingTier {
  label: string;
  price: number;
  description?: string;
}

interface Service {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  priceType: string | null;
  priceBasedOn: string | null;
  pricingTiers: PricingTier[] | null;
  location: string;
  averageRating: string;
  reviewCount: number;
  bookingsCount: number;
  status: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  meetingPoint: string | null;
  pickupAddress: string | null;
  transportProvided: string | null;
  whatIncluded: string[];
  requirements: string[];
  // Real cover-image field (provider_services.serviceImage). Nullable — the hero section
  // only renders when set; no placeholder/stock image is fabricated.
  serviceImage: string | null;
  // X1 (§13 hardcoded-copy arm): real per-offering cancellation policy. Both nullable —
  // NULL means the owner hasn't declared one; render nothing/an honest fallback, never
  // the old fabricated "free cancellation" claim.
  cancellationPolicyType: string | null;
  cancellationPolicy: string | null;
  // §17 bundles (migration 151): additive component list, present only when this service
  // is a bundle (productShape === 'bundle'). F2-gated server-side — only still-approved+
  // active components are ever included.
  bundleComponents?: BundleComponent[];
  // §17 Product Builder — PROPERTY rung (migration 153). productShape 'property' carries a
  // server-gated `rooms` list (approved+active children only); 'property_room' carries
  // `pricingUnit` ('per_night' — nights × price is the real charge, §14) and a gated `property`
  // back-link. Both additive; absent/null for every non-property service (every pre-153 row).
  productShape?: string | null;
  pricingUnit?: string | null;
  parentServiceId?: string | null;
  rooms?: RoomSummary[];
  property?: { id: string; serviceName: string } | null;
  // Vacation mode (link-landing polish, mockup §08 / CLAUDE.md §06b): the owner's
  // business-level away state, mirrored from the storefront payload's own `away` field
  // (server: GET /api/services/:id, content.routes.ts). Null when the owner isn't away —
  // listings stay visible either way, booking is disabled only while `away` is set.
  away?: { until: string; message: string | null } | null;
  // Ruling 22: the location facts were ALREADY on the wire (the endpoint spreads the row);
  // this interface just stopped dropping them on the floor. Map renders only from a real
  // confirmed pin / located stops — no city-center fallback (§13).
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationPrecision?: string | null;
  serviceRadius?: string | number | null;
  dropOffPoint?: string | null;
  routePoints?: ServiceRoutePointRow[];
  // D7 amendment (docs/DECISIONS.md ruling 62, migration 195): which coverage store the owner
  // declared — 'radius' | 'route' | null. NULL = never declared (every pre-195 listing), which
  // renders exactly as before. Both stores always hold their data; this only picks what shows.
  pickupCoverageMode?: string | null;
}

// Ruling 22: ordered route stops (service_route_points child rows, migration 192).
interface ServiceRoutePointRow {
  id: string;
  position: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

interface BundleComponent {
  id: string;
  serviceName: string;
  shortDescription: string;
}

interface RoomSummary {
  id: string;
  serviceName: string;
  shortDescription: string | null;
  price: string | number;
  categoryAttributes?: { units?: number } | null;
}

// X1: display labels for cancellationPolicyType — mirrors shared/schema.ts
// CANCELLATION_POLICY_TYPE_LABELS (kept local to avoid a client bundle importing the
// server schema module; the vocabulary itself is app-enforced, not a DB CHECK).
// The concrete windows mirror the server's enforcement schedule in
// server/services/cancellation-policy.service.ts (refundPercentFor).
const CANCELLATION_POLICY_TYPE_LABELS: Record<string, string> = {
  flexible: "Flexible — full refund if cancelled at least 24 hours before the start",
  moderate: "Moderate — full refund 5+ days before the start; 50% refund 2+ days before",
  strict: "Strict — 50% refund if cancelled at least 7 days before the start",
  non_refundable: "Non-refundable — no refund once booked",
};

// In-person delivery methods that have a physical meeting point.
const IN_PERSON_METHODS = new Set(["in_person", "hybrid"]);

interface Review {
  id: string;
  bookingId: string;
  serviceId: string;
  providerId: string;
  travelerId: string;
  rating: number;
  reviewText: string | null;
  responseText: string | null;
  responseAt: string | null;
  // §06d: the provider's ONE public reply (migration 190) — distinct from the legacy
  // responseText/responseAt above. GET /api/services/:id/reviews returns the full
  // service_reviews row (storage.getServiceReviews does an unfiltered `db.select()`), so these
  // two fields already ride along with no server-side change needed for this read.
  providerReply: string | null;
  providerRepliedAt: string | null;
  isVerified: boolean;
  status: string;
  createdAt: string;
}

interface ProviderVerification {
  identityVerified: boolean;
  businessVerified: boolean;
  // A6: storefront handle (migration 136, users.handle) — null when the owner hasn't
  // claimed one yet. Backs the breadcrumb's "/p/:handle" link only when non-null.
  handle: string | null;
}

// C2: public read-only availability calendar. Server (GET /api/services/:id/availability)
// reads the C0-canonical vendor_availability_slots table and F2-gates on approved+active —
// same posture as the service detail read itself. No booking-slot selection is wired here
// (that is C3's cart/checkout concern); this is purely informational.
interface AvailabilityDay {
  id: string; // C3: slot id — carried into add-to-cart so checkout can claim the slot atomically
  date: string;
  startTime: string | null;
  endTime: string | null;
  remaining: number;
  status: string;
}

interface AvailabilityResponse {
  month: string;
  days: AvailabilityDay[];
}

export default function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  const { data: service, isLoading: serviceLoading, isError: serviceError } = useQuery<Service>({
    queryKey: ["/api/services", id],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Request timed out")), 10_000);
      try {
        const res = await fetch(`/api/services/${id}`, { credentials: "include", signal: controller.signal });
        if (res.status === 404) return null as unknown as Service;
        if (!res.ok) throw new Error(`Failed to load service: ${res.status}`);
        return res.json() as Promise<Service>;
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!id,
    retry: false,
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/services", id, "reviews"],
    enabled: !!id,
  });

  const { data: providerVerification } = useQuery<ProviderVerification>({
    queryKey: ["/api/providers", service?.userId, "public-verification"],
    enabled: !!service?.userId,
  });

  // Same-owner cross-sell (marketplace Phase B4): purchasable packages by this service's
  // owner, if they're an expert with approved+published templates. Server-gated + teaser-only.
  const { data: ownerPackages = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-templates", { expertId: service?.userId }],
    queryFn: async () => {
      const res = await fetch(`/api/expert-templates?expertId=${service!.userId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!service?.userId,
  });

  // C2: read-only availability calendar, month-scoped.
  const [availabilityMonth, setAvailabilityMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const { data: availability, isLoading: availabilityLoading } = useQuery<AvailabilityResponse>({
    queryKey: ["/api/services", id, "availability", availabilityMonth],
    queryFn: async () => {
      const res = await fetch(`/api/services/${id}/availability?month=${availabilityMonth}`, {
        credentials: "include",
      });
      if (!res.ok) return { month: availabilityMonth, days: [] };
      return res.json() as Promise<AvailabilityResponse>;
    },
    enabled: !!id,
  });
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const upcomingAvailability = (availability?.days || [])
    .filter((d) => d.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));

  const [, navigate] = useLocation();
  // Native "Book on Traveloure": capture a preferred date/time and carry it into the
  // cart (cart_items.scheduled_date → checkout bookingDetails). Optional — non-dated
  // services (e.g. a PDF deliverable) can book without it. This closes the gap where
  // Add-to-Cart wrote no date; the whole flow reuses the audited /api/cart + /api/checkout
  // rail (server-derived amount, idempotent), so there is no money-path change here.
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  // C3: picked availability slot (from the Availability card). When set, it rides add-to-cart
  // as slotId — the server derives the schedule from the slot and checkout claims it atomically.
  const [selectedSlot, setSelectedSlot] = useState<AvailabilityDay | null>(null);

  const addToCartMutation = useMutation({
    mutationFn: async (_vars: { proceed: boolean }) => {
      const scheduledDate = bookingDate
        ? new Date(`${bookingDate}T${bookingTime || "09:00"}:00`).toISOString()
        : undefined;
      return apiRequest("POST", "/api/cart", {
        serviceId: id,
        quantity: 1,
        scheduledDate,
        ...(selectedSlot ? { slotId: selectedSlot.id } : {}),
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      if (vars.proceed) {
        navigate("/cart");
      } else {
        toast({
          title: "Added to cart",
          description: selectedSlot
            ? `Slot held at checkout: ${format(new Date(`${selectedSlot.date}T00:00:00`), "MMM d, yyyy")}${selectedSlot.startTime ? ` at ${selectedSlot.startTime}` : ""}`
            : bookingDate
              ? `Scheduled for ${format(new Date(`${bookingDate}T00:00:00`), "MMM d, yyyy")}${bookingTime ? ` at ${bookingTime}` : ""}`
              : "Service has been added to your cart",
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add to cart", variant: "destructive" });
    },
  });

  // §17 Product Builder — PROPERTY rung: a room ('property_room' + pricingUnit='per_night')
  // books a NIGHT RANGE, not a single slot — a wholly different booking widget from the
  // single-day availability calendar above. Charge = nights × the stored rate, §14
  // server-derived at checkout; this UI only picks dates and does a real (non-authoritative)
  // pre-check against the room's published night slots so the traveler isn't surprised.
  const isRoom = service?.pricingUnit === "per_night";
  const todayIsoForRoom = format(new Date(), "yyyy-MM-dd");
  const [roomCheckIn, setRoomCheckIn] = useState("");
  const [roomCheckOut, setRoomCheckOut] = useState("");
  const roomNights =
    roomCheckIn && roomCheckOut && roomCheckOut > roomCheckIn
      ? Math.round(
          (new Date(`${roomCheckOut}T00:00:00Z`).getTime() - new Date(`${roomCheckIn}T00:00:00Z`).getTime()) /
            86400000,
        )
      : 0;
  const roomNightDates =
    roomNights > 0
      ? Array.from({ length: roomNights }, (_, i) => {
          const d = new Date(`${roomCheckIn}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + i);
          return d.toISOString().slice(0, 10);
        })
      : [];
  // Distinct calendar months the picked range touches — fetched via the SAME public
  // month-availability endpoint the single-day calendar above uses (C2, F2-gated).
  const roomMonths = roomNights > 0 ? Array.from(new Set(roomNightDates.map((d) => d.slice(0, 7)))) : [];
  const { data: roomAvailabilityDays, isLoading: roomAvailabilityLoading } = useQuery<AvailabilityDay[]>({
    queryKey: ["/api/services", id, "room-nights", roomMonths.join(",")],
    queryFn: async () => {
      const perMonth = await Promise.all(
        roomMonths.map(async (m) => {
          const res = await fetch(`/api/services/${id}/availability?month=${m}`, { credentials: "include" });
          if (!res.ok) return [] as AvailabilityDay[];
          const data = (await res.json()) as AvailabilityResponse;
          return data.days || [];
        }),
      );
      return perMonth.flat();
    },
    enabled: isRoom && roomMonths.length > 0,
  });
  const roomUnavailableDates = roomNightDates.filter((date) => {
    const day = roomAvailabilityDays?.find((d) => d.date === date);
    return !day || day.remaining <= 0;
  });
  const roomStayReady = roomNights > 0 && roomNights <= 30;
  const roomStayAvailable = roomStayReady && !roomAvailabilityLoading && roomUnavailableDates.length === 0;

  // D2 (UX audit Jul 29): plain two-input date entry gave no visibility into which nights
  // are actually open — the traveler could only find out after picking (roomUnavailableDates
  // above, still the authoritative pre-cart check). This adds a real calendar view, fed by
  // the SAME public C2 availability read, that grays out/disables nights with no remaining
  // capacity BEFORE the traveler picks — no fabricated availability (§13), a date is only
  // selectable when a real slot with remaining > 0 exists for it.
  const [roomCalendarCursor, setRoomCalendarCursor] = useState<Date>(() => new Date());
  const roomCalendarMonthKeys = isRoom
    ? [format(roomCalendarCursor, "yyyy-MM"), format(addMonths(roomCalendarCursor, 1), "yyyy-MM")]
    : [];
  const { data: roomCalendarDays, isLoading: roomCalendarLoading } = useQuery<AvailabilityDay[]>({
    queryKey: ["/api/services", id, "room-calendar", roomCalendarMonthKeys.join(",")],
    queryFn: async () => {
      const perMonth = await Promise.all(
        roomCalendarMonthKeys.map(async (m) => {
          const res = await fetch(`/api/services/${id}/availability?month=${m}`, { credentials: "include" });
          if (!res.ok) return [] as AvailabilityDay[];
          const data = (await res.json()) as AvailabilityResponse;
          return data.days || [];
        }),
      );
      return perMonth.flat();
    },
    enabled: isRoom,
  });
  const roomAvailableNightSet = new Set(
    (roomCalendarDays || []).filter((d) => d.remaining > 0).map((d) => d.date),
  );
  // Check-in: the picked date itself is the first night — must have real remaining capacity.
  const isRoomCheckInDisabled = (date: Date) => {
    const iso = format(date, "yyyy-MM-dd");
    return iso < todayIsoForRoom || !roomAvailableNightSet.has(iso);
  };
  // Check-out: not itself a night (the traveler departs that morning) — gate on the night
  // immediately before it (the last night of the stay) actually being open. The full-range
  // check (every night in between) still runs post-pick via roomUnavailableDates above.
  const isRoomCheckOutDisabled = (date: Date) => {
    const iso = format(date, "yyyy-MM-dd");
    if (!roomCheckIn || iso <= roomCheckIn) return true;
    const priorNight = format(subDays(date, 1), "yyyy-MM-dd");
    return !roomAvailableNightSet.has(priorNight);
  };
  const [roomCheckInOpen, setRoomCheckInOpen] = useState(false);
  const [roomCheckOutOpen, setRoomCheckOutOpen] = useState(false);

  const addRoomToCartMutation = useMutation({
    mutationFn: async (_vars: { proceed: boolean }) => {
      return apiRequest("POST", "/api/cart", {
        serviceId: id,
        checkIn: roomCheckIn,
        checkOut: roomCheckOut,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      if (vars.proceed) {
        navigate("/cart");
      } else {
        toast({
          title: "Added to cart",
          description: `${roomNights} night${roomNights === 1 ? "" : "s"} — ${format(new Date(`${roomCheckIn}T00:00:00`), "MMM d")} to ${format(new Date(`${roomCheckOut}T00:00:00`), "MMM d, yyyy")}`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Couldn't add this stay to your cart. The dates may no longer be available.",
        variant: "destructive",
      });
    },
  });

  if (serviceLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-6xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full mb-6" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (serviceError || !service) {
    return (
      <Layout>
        <div className="container py-8 max-w-6xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-2">Service Not Found</h1>
          <p className="text-muted-foreground mb-6">The service you're looking for doesn't exist</p>
          <Button asChild data-testid="button-back-discover">
            <Link href="/discover">Browse Services</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const rating = parseFloat(service.averageRating || "0") || 0;
  const priceNum = parseFloat(service.price || "0") || 0;
  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  const hasTiers = Array.isArray(service.pricingTiers) && service.pricingTiers.length > 0;
  // D5 (UX audit Jul 29): a per_night room fell through to the generic "per service" sub-label
  // (jargon that also reads as factually wrong for a nightly room rate) — give it its own branch.
  const priceLabel = service.pricingUnit === "per_night" && priceNum > 0
    ? `${fmtPrice(priceNum)} / night`
    : service.priceType === "hourly" && priceNum > 0
    ? `${fmtPrice(priceNum)} / hr`
    : service.priceType === "package_tiers" && priceNum > 0
    ? `from ${fmtPrice(priceNum)}`
    : service.priceType === "per_event" && priceNum > 0
    ? `${fmtPrice(priceNum)} / event`
    : service.priceType === "variable" && priceNum > 0
    ? `From ${fmtPrice(priceNum)}`
    : priceNum > 0
    ? fmtPrice(priceNum)
    : "Custom quote";
  const priceSubLabel = service.pricingUnit === "per_night" && priceNum > 0
    ? "per night"
    : service.priceType === "hourly"
    ? "billed by the hour"
    : service.priceType === "package_tiers"
    ? "see tiers below"
    : service.priceType === "per_event"
    ? "flat rate per event"
    : service.priceType === "variable"
    ? "starting price"
    : priceNum > 0
    ? "per service"
    : "contact the provider for pricing";

  // Direct-Booking trust panel (mockup "custody-label"): every line is gated on a real
  // field — identity/business verification (public-verification), meeting point, and
  // transportProvided. A line whose backing field is absent is simply not rendered.
  const hasMeetingPoint = IN_PERSON_METHODS.has(service.deliveryMethod) && !!service.meetingPoint;
  const hasPickupAddress = IN_PERSON_METHODS.has(service.deliveryMethod) && !!service.pickupAddress;
  const hasTransportSignal = service.transportProvided === "yes" || service.transportProvided === "no";
  const hasAnyTrustLine =
    !!providerVerification?.identityVerified ||
    !!providerVerification?.businessVerified ||
    hasMeetingPoint ||
    hasPickupAddress ||
    hasTransportSignal;

  // Vacation mode (mockup §08/§06b): the listing stays visible while the owner is away —
  // only new-booking CTAs are disabled. Existing confirmed bookings are untouched (this is
  // a business-level flag, never a provider_services status change — CLAUDE.md §06b).
  const isAway = !!service.away;
  const awayTitle = service.away
    ? `This provider is away until ${format(new Date(service.away.until), "MMM d, yyyy")}`
    : undefined;

  return (
    <Layout>
      <div className="container py-8 max-w-6xl mx-auto">
        {/* Breadcrumb into the provider storefront (mockup: Home > /p/:handle > service name).
            The handle link only renders when the owner has actually claimed one (migration 136) —
            no fake/guessed storefront link is shown for an unclaimed handle. */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/discover" data-testid="breadcrumb-home">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {providerVerification?.handle && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/p/${providerVerification.handle}`} data-testid="breadcrumb-storefront">
                      @{providerVerification.handle}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage data-testid="breadcrumb-service-name">{service.serviceName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" asChild data-testid="button-back">
            <Link href="/discover">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-service-name">
                {service.serviceName}
              </h1>
              {providerVerification?.identityVerified && (
                <Badge className="bg-blue-600 text-white text-xs" title="Provider identity verified" data-testid="badge-identity-verified">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  ID Verified
                </Badge>
              )}
              {providerVerification?.businessVerified && (
                <Badge className="bg-purple-600 text-white text-xs" title="Provider business verified" data-testid="badge-business-verified">
                  <Building2 className="w-3 h-3 mr-1" />
                  Business Verified
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span data-testid="text-location">{service.location || "Remote"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                {service.reviewCount > 0 ? (
                  <span data-testid="text-rating">{rating.toFixed(1)} ({service.reviewCount} reviews)</span>
                ) : (
                  <span data-testid="text-rating">New</span>
                )}
              </div>
            </div>
            {/* Vacation mode (mockup §08/§06b): honest away state — the listing stays visible,
                only booking is disabled below. Real return date only; no fabricated message
                when the owner left none. */}
            {service.away && (
              <Badge
                variant="outline"
                className="mt-2 border-amber-300 bg-amber-50 text-amber-800"
                data-testid="badge-service-away"
              >
                Away — back {format(new Date(service.away.until), "MMM d")}
              </Badge>
            )}
            {/* §17 Product Builder — PROPERTY rung: a room links back to its property, only
                when the property is still approved+active (F2-gated server-side). */}
            {isRoom && service.property && (
              <Link
                href={`/services/${service.property.id}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                data-testid="link-room-property"
              >
                <BedDouble className="w-3.5 h-3.5" />
                Part of {service.property.serviceName}
              </Link>
            )}
          </div>
        </div>

        {/* Hero image — only rendered when the listing has a real cover image (serviceImage);
            no stock/placeholder image is substituted when it's absent (§13). */}
        {service.serviceImage && (
          <div className="mb-6 rounded-lg overflow-hidden border" data-testid="img-hero">
            <img
              src={service.serviceImage}
              alt={service.serviceName}
              className="w-full max-h-[420px] object-cover"
            />
          </div>
        )}

        {/* Link-landing polish (mockup §08): on mobile the booking panel (price/rating/CTA)
            renders BEFORE the long-form content below via `order` — a texted link must put
            photo + price + CTA above the fold without a redesign of either column's content.
            Desktop keeps the original visual (content, then sidebar) via the lg: overrides. */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="order-2 lg:order-1 lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About this service</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground" data-testid="text-description">
                  {service.description || service.shortDescription || "No description available"}
                </p>

                {service.deliveryTimeframe && (
                  <div className="flex items-center gap-2 mt-4 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>Delivery: {service.deliveryTimeframe}</span>
                  </div>
                )}

                {service.deliveryMethod && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Badge variant="outline">{service.deliveryMethod.replace(/_/g, " ")}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ruling 22(c): Location & route — renders ONLY when the service has real
                location facts (confirmed pin and/or route stops). Map draws located stops
                only; unlocated stops stay listed with an honest "not on map" flag. The
                connector is stop order, not travel routing — the map component says so. */}
            {(() => {
              const servicePin = parseLatLng(service.latitude, service.longitude);
              // D7 amendment (ruling 62): the traveler sees ONLY the coverage mode the owner
              // chose. The other store still holds its rows — it is hidden here, never deleted
              // (§13); the owner's wizard says so explicitly. A NULL mode (every pre-195
              // listing) shows both, exactly as ruling 22 shipped it.
              const coverageMode = service.pickupCoverageMode ?? null;
              const routeStops = coverageMode === "radius" ? [] : (service.routePoints ?? []);
              const rawRadiusKm = Number(service.serviceRadius);
              const radiusKm = coverageMode === "route" ? NaN : rawRadiusKm;
              if (!servicePin && routeStops.length === 0) return null;
              const locatedStops = routeStops.filter((s) => parseLatLng(s.latitude, s.longitude) !== null);
              return (
                <Card data-testid="card-location-route">
                  <CardHeader>
                    <CardTitle>Location & route</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg overflow-hidden border">
                      <ServiceLocationMap
                        pin={servicePin}
                        pinLabel={service.meetingPoint || service.serviceName}
                        radiusKm={Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : null}
                        stops={routeStops.map((s) => {
                          const p = parseLatLng(s.latitude, s.longitude);
                          return { id: s.id, position: s.position, name: s.name, lat: p?.lat ?? null, lng: p?.lng ?? null };
                        })}
                        height={300}
                        testIdPrefix="service-detail-map"
                      />
                    </div>
                    {routeStops.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2" data-testid="text-route-summary">
                          Route — {locatedStops.length} of {routeStops.length} stops located
                        </p>
                        <ol className="space-y-1.5">
                          {routeStops
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((s) => (
                              <li key={s.id} className="flex items-center gap-2 text-sm" data-testid={`route-stop-${s.position}`}>
                                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                                  {s.position}
                                </span>
                                <span className="text-muted-foreground">{s.name}</span>
                                {parseLatLng(s.latitude, s.longitude) === null && (
                                  <Badge variant="outline" className="text-[10px]">not on map</Badge>
                                )}
                              </li>
                            ))}
                        </ol>
                      </div>
                    )}
                    {(service.meetingPoint || service.pickupAddress || service.dropOffPoint) && (
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {service.meetingPoint && (
                          <p data-testid="text-map-meeting-point"><span className="font-medium text-foreground">Meet:</span> {service.meetingPoint}</p>
                        )}
                        {service.pickupAddress && (
                          <p data-testid="text-map-pickup"><span className="font-medium text-foreground">Pickup:</span> {service.pickupAddress}</p>
                        )}
                        {service.dropOffPoint && (
                          <p data-testid="text-map-dropoff"><span className="font-medium text-foreground">Drop-off:</span> {service.dropOffPoint}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {hasTiers && (
              <Card data-testid="card-pricing-tiers">
                <CardHeader>
                  <CardTitle>Pricing Tiers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {service.pricingTiers!.map((tier, idx) => (
                      <div key={idx} className="py-3 flex items-start justify-between gap-4" data-testid={`pricing-tier-${idx}`}>
                        <div className="flex-1">
                          <p className="font-medium">{tier.label}</p>
                          {tier.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{tier.description}</p>
                          )}
                        </div>
                        <p className="font-semibold text-lg shrink-0">{fmtPrice(Number(tier.price))}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {service.whatIncluded && service.whatIncluded.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>What's Included</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {service.whatIncluded.map((item, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* §17 bundles (migration 151): components of this bundle, server-gated to only
                still-approved+active items. No section at all for a non-bundle service. */}
            {Array.isArray(service.bundleComponents) && service.bundleComponents.length > 0 && (
              <Card data-testid="card-bundle-components">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" /> What's inside this bundle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {service.bundleComponents.map((component) => (
                      <Link
                        key={component.id}
                        href={`/services/${component.id}`}
                        data-testid={`bundle-component-${component.id}`}
                        className="block py-3 hover-elevate rounded-md px-2 -mx-2"
                      >
                        <p className="font-medium">{component.serviceName}</p>
                        {component.shortDescription && (
                          <p className="text-sm text-muted-foreground mt-0.5">{component.shortDescription}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* §17 Product Builder — PROPERTY rung: this property's room types, server-gated
                to only still-approved+active rooms (same F2 posture as bundle components). */}
            {service.productShape === "property" && Array.isArray(service.rooms) && service.rooms.length > 0 && (
              <Card data-testid="card-property-rooms">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BedDouble className="w-5 h-5 text-primary" /> Rooms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {service.rooms.map((room) => (
                      <Link
                        key={room.id}
                        href={`/services/${room.id}`}
                        data-testid={`property-room-${room.id}`}
                        className="flex items-center justify-between gap-3 py-3 hover-elevate rounded-md px-2 -mx-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{room.serviceName}</p>
                          {room.shortDescription && (
                            <p className="text-sm text-muted-foreground mt-0.5 truncate">{room.shortDescription}</p>
                          )}
                        </div>
                        <p className="font-semibold shrink-0 whitespace-nowrap">
                          From {fmtPrice(Number(room.price))} <span className="font-normal text-muted-foreground text-sm">/ night</span>
                        </p>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Same-owner cross-sell — packages by this expert (Phase B4) */}
            {ownerPackages.length > 0 && (
              <Card data-testid="card-owner-packages">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> Ready made trips by this expert
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ownerPackages.slice(0, 3).map((pkg: any) => (
                    <Link key={pkg.id} href={`/expert-templates/${pkg.id}`}>
                      <div
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                        data-testid={`owner-package-${pkg.id}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{pkg.title}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {pkg.destination}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {pkg.duration} days
                            </span>
                          </div>
                        </div>
                        <p className="font-bold text-primary whitespace-nowrap">${pkg.price}</p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* MP-2 return path — "show me everything this seller offers".
                The breadcrumb above links the same place, but it is a small crumb at the
                top of the page; this is the affordance at the point where a traveler has
                actually decided they like the listing. Renders nothing without a claimed
                handle. Deliberately NOT role-labelled "provider": provider_services is
                role-agnostic, so this owner may well be an expert. */}
            <StorefrontLink
              handle={providerVerification?.handle}
              sellerNoun="seller"
              data-testid="link-service-storefront"
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>Reviews</span>
                  {service.reviewCount > 0 && (
                    <div className="flex items-center gap-1 text-sm font-normal">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>{rating.toFixed(1)}</span>
                      <span className="text-muted-foreground">({service.reviewCount})</span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : !reviews || reviews.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reviews yet. Be the first to review this service!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} serviceId={id!} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Book Now panel (mockup sidebar): price, Direct-Booking trust panel, the
              availability/slot picker, cancellation policy, and the existing add-to-cart CTA —
              all in one sticky column, mirroring the mockup's consolidated booking widget.
              `order-1` (see the wrapping grid's comment) puts this panel first on mobile. */}
          <div className="order-1 lg:order-2 lg:col-span-1">
            <Card className="lg:sticky lg:top-4">
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold" data-testid="text-price">
                    {priceLabel}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {priceSubLabel}
                  </p>
                  {(service.bookingsCount ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1" data-testid="text-bookings-count">
                      <Users className="w-3 h-3" />
                      {service.bookingsCount} booking{service.bookingsCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {/* Link-landing polish (mockup §08): the CTA row moved up to sit directly under
                    the price — on a texted-link mobile viewport this is what keeps "book" inside
                    the fold instead of after the trust panel + full availability calendar below.
                    Same buttons/handlers, no new behavior. */}
                <div className="space-y-3 mb-4">
                  {isRoom ? (
                    <>
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (!user) {
                            openSignInModal();
                            return;
                          }
                          addRoomToCartMutation.mutate({ proceed: true });
                        }}
                        disabled={isAway || !roomStayAvailable || addRoomToCartMutation.isPending}
                        title={awayTitle}
                        data-testid="button-book-now"
                      >
                        {addRoomToCartMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Booking...
                          </>
                        ) : (
                          <>
                            <BookOpen className="w-4 h-4 mr-2" />
                            Book on Traveloure
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          if (!user) {
                            openSignInModal();
                            return;
                          }
                          addRoomToCartMutation.mutate({ proceed: false });
                        }}
                        disabled={isAway || !roomStayAvailable || addRoomToCartMutation.isPending}
                        title={awayTitle}
                        data-testid="button-add-to-cart"
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to Cart
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        className="w-full"
                        onClick={() => {
                          if (!user) {
                            openSignInModal();
                            return;
                          }
                          addToCartMutation.mutate({ proceed: true });
                        }}
                        disabled={isAway || addToCartMutation.isPending}
                        title={awayTitle}
                        data-testid="button-book-now"
                      >
                        {addToCartMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Booking...
                          </>
                        ) : (
                          <>
                            <BookOpen className="w-4 h-4 mr-2" />
                            Book on Traveloure
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          if (!user) {
                            openSignInModal();
                            return;
                          }
                          addToCartMutation.mutate({ proceed: false });
                        }}
                        disabled={isAway || addToCartMutation.isPending}
                        title={awayTitle}
                        data-testid="button-add-to-cart"
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to Cart
                      </Button>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full"
                    asChild
                    data-testid="button-contact-provider"
                  >
                    <Link href={`/chat?provider=${service.userId}`}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Contact Provider
                    </Link>
                  </Button>
                </div>

                {/* Direct-Booking trust panel. The base statement is true of every listing on
                    the platform (payment always rides the audited Traveloure checkout rail);
                    each line below it is gated on a real field and omitted when absent (§13). */}
                <div className="mb-4 p-3 rounded-md border bg-muted/40 text-left" data-testid="section-direct-booking">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                    <Handshake className="w-4 h-4 text-primary" />
                    Direct Booking
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You're booking directly with the provider. Payment is processed securely through Traveloure.
                  </p>
                  {hasAnyTrustLine && (
                    <ul className="mt-2 space-y-1.5">
                      {providerVerification?.identityVerified && (
                        <li className="flex items-center gap-1.5 text-xs" data-testid="trust-line-identity">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          Identity verified
                        </li>
                      )}
                      {providerVerification?.businessVerified && (
                        <li className="flex items-center gap-1.5 text-xs" data-testid="trust-line-business">
                          <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          Business verified
                        </li>
                      )}
                      {hasMeetingPoint && (
                        <li className="flex items-start gap-1.5 text-xs" data-testid="trust-line-meeting-point">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <span>Meets at: {service.meetingPoint}</span>
                        </li>
                      )}
                      {hasPickupAddress && (
                        <li className="flex items-start gap-1.5 text-xs" data-testid="trust-line-pickup">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <span>Pickup: {service.pickupAddress}</span>
                        </li>
                      )}
                      {hasTransportSignal && (
                        <li className="flex items-center gap-1.5 text-xs" data-testid="trust-line-transport">
                          <Car className="w-3.5 h-3.5 text-primary shrink-0" />
                          {service.transportProvided === "yes"
                            ? "Transport provided by the host"
                            : "Transport not provided — arrange your own"}
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                <Separator className="my-4" />

                {isRoom ? (
                  /* §17 Product Builder — PROPERTY rung: a room books a NIGHT RANGE, not a
                     single slot. The pre-check below reads the room's real published night
                     slots (same C2 endpoint the single-day calendar uses) — it's informational;
                     checkout's atomic all-or-nothing claim (§15) is the real authority. */
                  <div className="mb-4" data-testid="card-room-stay">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                      <BedDouble className="w-4 h-4 text-primary" />
                      Pick your dates
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-xs text-muted-foreground" id="label-room-checkin">
                          Check-in
                        </label>
                        <Popover open={roomCheckInOpen} onOpenChange={setRoomCheckInOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              aria-labelledby="label-room-checkin"
                              className="w-full justify-start font-normal text-sm h-10"
                              data-testid="button-room-checkin"
                            >
                              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                              {roomCheckIn
                                ? format(new Date(`${roomCheckIn}T00:00:00`), "MMM d, yyyy")
                                : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <DatePickerCalendar
                              mode="single"
                              month={roomCalendarCursor}
                              onMonthChange={setRoomCalendarCursor}
                              selected={roomCheckIn ? new Date(`${roomCheckIn}T00:00:00`) : undefined}
                              onSelect={(date) => {
                                if (!date) return;
                                const iso = format(date, "yyyy-MM-dd");
                                setRoomCheckIn(iso);
                                if (roomCheckOut && roomCheckOut <= iso) setRoomCheckOut("");
                                setRoomCheckInOpen(false);
                              }}
                              disabled={isRoomCheckInDisabled}
                              data-testid="calendar-room-checkin"
                            />
                            <p className="px-3 pb-3 text-[11px] text-muted-foreground border-t pt-2">
                              Grayed-out nights are already booked or not yet published.
                            </p>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground" id="label-room-checkout">
                          Check-out
                        </label>
                        <Popover open={roomCheckOutOpen} onOpenChange={setRoomCheckOutOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              aria-labelledby="label-room-checkout"
                              disabled={!roomCheckIn}
                              className="w-full justify-start font-normal text-sm h-10 disabled:opacity-50"
                              data-testid="button-room-checkout"
                            >
                              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                              {roomCheckOut
                                ? format(new Date(`${roomCheckOut}T00:00:00`), "MMM d, yyyy")
                                : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <DatePickerCalendar
                              mode="single"
                              month={roomCalendarCursor}
                              onMonthChange={setRoomCalendarCursor}
                              selected={roomCheckOut ? new Date(`${roomCheckOut}T00:00:00`) : undefined}
                              onSelect={(date) => {
                                if (!date) return;
                                setRoomCheckOut(format(date, "yyyy-MM-dd"));
                                setRoomCheckOutOpen(false);
                              }}
                              disabled={isRoomCheckOutDisabled}
                              data-testid="calendar-room-checkout"
                            />
                            <p className="px-3 pb-3 text-[11px] text-muted-foreground border-t pt-2">
                              Grayed-out dates would include a night that's already booked.
                            </p>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {roomCalendarLoading && (
                      <p className="text-[11px] text-muted-foreground mb-1">Loading real availability…</p>
                    )}
                    {roomNights > 0 && (
                      <p className="text-sm" data-testid="text-room-nights">
                        {roomNights} night{roomNights === 1 ? "" : "s"} · {fmtPrice(priceNum * roomNights)} total
                      </p>
                    )}
                    {roomNights > 30 && (
                      <p className="text-xs text-destructive mt-1" data-testid="text-room-too-long">
                        Stays longer than 30 nights aren't supported yet.
                      </p>
                    )}
                    {roomStayReady && roomAvailabilityLoading && (
                      <Skeleton className="h-4 w-40 mt-1" />
                    )}
                    {roomStayReady && !roomAvailabilityLoading && roomUnavailableDates.length > 0 && (
                      <p className="text-xs text-destructive mt-1" data-testid="text-room-unavailable">
                        Not available for {roomUnavailableDates.length} of your selected night
                        {roomUnavailableDates.length === 1 ? "" : "s"}. Try different dates.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* C2/C3: read-only availability calendar with slot selection. */}
                    <div className="mb-4" data-testid="card-availability">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <CalendarCheck className="w-4 h-4 text-primary" />
                          Availability
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setAvailabilityMonth((m) => format(subMonths(new Date(`${m}-01T00:00:00`), 1), "yyyy-MM"))
                            }
                            data-testid="button-availability-prev-month"
                            aria-label="Previous month"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-xs font-medium w-24 text-center" data-testid="text-availability-month">
                            {format(new Date(`${availabilityMonth}-01T00:00:00`), "MMMM yyyy")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setAvailabilityMonth((m) => format(addMonths(new Date(`${m}-01T00:00:00`), 1), "yyyy-MM"))
                            }
                            data-testid="button-availability-next-month"
                            aria-label="Next month"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {availabilityLoading ? (
                        <Skeleton className="h-16 w-full" />
                      ) : upcomingAvailability.length > 0 ? (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {upcomingAvailability.map((day) => {
                            const fullyBooked = day.status === "fully_booked" || day.remaining <= 0;
                            const isSelected = selectedSlot?.id === day.id;
                            return (
                              <button
                                type="button"
                                key={`${day.date}-${day.startTime}`}
                                // C3: an open slot is selectable — the pick rides add-to-cart as slotId
                                // and checkout claims it atomically ("this slot just booked" on a race).
                                disabled={fullyBooked}
                                onClick={() => setSelectedSlot(isSelected ? null : day)}
                                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors ${
                                  fullyBooked
                                    ? "opacity-60 cursor-not-allowed"
                                    : isSelected
                                      ? "border-primary bg-primary/5"
                                      : "hover:bg-muted/50"
                                }`}
                                data-testid={`availability-day-${day.date}`}
                              >
                                <span className="font-medium">
                                  {format(new Date(`${day.date}T00:00:00`), "EEE, MMM d")}
                                  {day.startTime && (
                                    <span className="text-muted-foreground font-normal ml-1.5">
                                      {day.startTime}
                                      {day.endTime ? `–${day.endTime}` : ""}
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {isSelected && <Badge className="text-[10px] px-1.5 py-0" data-testid={`badge-slot-selected-${day.date}`}>Selected</Badge>}
                                  <Badge variant={fullyBooked ? "outline" : "secondary"} className="text-[10px] px-1.5 py-0">
                                    {fullyBooked ? "Fully booked" : `${day.remaining} spot${day.remaining === 1 ? "" : "s"} open`}
                                  </Badge>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-xs" data-testid="text-no-availability">
                          No availability published yet for this month. Contact the provider to check dates.
                        </p>
                      )}
                    </div>

                    {/* Preferred date/time — optional fallback for services without a published
                        slot the traveler wants. Carried into the cart + booking. */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        Or request a date & time <span className="font-normal">(optional)</span>
                      </div>
                      <input
                        type="date"
                        min={todayStr}
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        data-testid="input-booking-date"
                        aria-label="Preferred date"
                      />
                      <input
                        type="time"
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        disabled={!bookingDate}
                        className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                        data-testid="input-booking-time"
                        aria-label="Preferred time"
                      />
                    </div>
                  </>
                )}

                {/* X1 (§13 hardcoded-copy arm): real per-offering cancellation policy.
                    Shows the owner's declared policy when present; otherwise an honest
                    "contact provider" fallback — never a fabricated "free cancellation"
                    claim (the old expert-detail.tsx trio removed by #200). */}
                <div className="mt-4 pt-4 border-t space-y-1.5" data-testid="section-cancellation-policy">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    Cancellation policy
                  </div>
                  {service.cancellationPolicyType ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-cancellation-policy-type">
                      {CANCELLATION_POLICY_TYPE_LABELS[service.cancellationPolicyType] ?? service.cancellationPolicyType}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-cancellation-policy-unset">
                      Contact the provider about cancellations before booking.
                    </p>
                  )}
                  {service.cancellationPolicy && (
                    <p className="text-xs text-muted-foreground" data-testid="text-cancellation-policy-detail">
                      {service.cancellationPolicy}
                    </p>
                  )}
                </div>

                {/* Provider commission transparency. §8: no hardcoded rate literal —
                    the real split is config-resolved server-side (fee_bands /
                    resolveCommissionRates), so the old "90% / 10%" numbers were both a
                    fee-literal violation and potentially wrong. State the model without
                    a fabricated number. */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs text-muted-foreground text-center">
                    A platform service fee is deducted from each booking; the provider
                    receives the remainder.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ReviewCard({ review, serviceId }: { review: Review; serviceId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const flagMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reviews/${review.id}/flag`, { reason: flagReason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId, "reviews"] });
      toast({ title: "Review reported", description: "Thank you. A moderator will review your report." });
      setFlagOpen(false);
      setFlagReason("");
    },
    onError: () => toast({ title: "Failed to report review", variant: "destructive" }),
  });

  if (review.status === "removed") {
    return (
      <div className="border-b last:border-0 pb-4 last:pb-0 text-sm text-muted-foreground italic" data-testid={`card-review-${review.id}`}>
        This review has been removed by a moderator.
      </div>
    );
  }

  return (
    <>
      <div className="border-b last:border-0 pb-4 last:pb-0" data-testid={`card-review-${review.id}`}>
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback>
              <User className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= review.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`}
                  />
                ))}
              </div>
              {review.isVerified && (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {format(new Date(review.createdAt), "MMM d, yyyy")}
            </p>
            {review.reviewText && (
              <p className="text-sm" data-testid={`text-review-${review.id}`}>
                {review.reviewText}
              </p>
            )}
            {review.responseText && (
              <div className="mt-3 pl-4 border-l-2 border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">Provider Response:</p>
                <p className="text-sm" data-testid={`text-response-${review.id}`}>
                  {review.responseText}
                </p>
              </div>
            )}
            {review.providerReply && (
              <div className="mt-3 rounded-md border bg-muted/40 px-3 py-2" data-testid={`block-provider-reply-${review.id}`}>
                <p className="text-xs font-medium text-muted-foreground mb-1">Response from the provider</p>
                <p className="text-sm" data-testid={`text-provider-reply-${review.id}`}>
                  {review.providerReply}
                </p>
              </div>
            )}
          </div>
          {user && review.travelerId !== user.id && (
            <button
              onClick={() => setFlagOpen(true)}
              className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded"
              title="Report this review"
              data-testid={`button-flag-review-${review.id}`}
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this review</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Let us know why this review is inappropriate. Our moderation team will review it.
          </p>
          <Textarea
            placeholder="Describe the issue (optional)"
            value={flagReason}
            onChange={e => setFlagReason(e.target.value)}
            className="h-24"
            data-testid="input-flag-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagOpen(false)}>Cancel</Button>
            <Button
              onClick={() => flagMutation.mutate()}
              disabled={flagMutation.isPending}
              data-testid="button-submit-flag"
            >
              {flagMutation.isPending ? "Submitting…" : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
