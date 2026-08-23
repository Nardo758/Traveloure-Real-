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
  Languages,
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
  Info,
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
import { useLocale } from "@/hooks/use-locale";
import { useTranslation } from "react-i18next";
import { useSignInModal } from "@/contexts/SignInModalContext";
// T-REP (G5 #13): pure "Good to know" formatting/derivation helpers, unit-tested in
// client/src/lib/__tests__/service-good-to-know.test.ts.
import {
  formatHours,
  formatMinutes,
  formatPartySize,
  formatStartWindow,
  formatCheckInOut,
  hasAmenities,
  formatTransportProvision,
  formatSeating,
  resolveDepositPreview,
  hasDepositTerms,
  formatResponseWindow,
  formatWeeklyPattern,
} from "@/lib/service-good-to-know";
// Ledger 90 (FP-5, I3): the SAME rail the storefront's Message CTA uses. "Contact Provider" used
// to link to `/chat?provider=<userId>` — a param chat.tsx has never read — landing the traveler on
// a directory of four seeded experts with no composer and no sign of the person they were reading
// about. There is no separate traveler↔provider conversation system to point at: this IS the rail,
// and it works; the CTA was simply speaking a language the destination doesn't parse.
import { useAskExpert } from "@/lib/use-ask-expert";
// S10 (Gate G4): the shared bundle-component summary shape + pure link/label helpers, so the
// available/unavailable rendering decision lives in exactly one place (unit-tested separately).
import {
  bundleComponentHref,
  bundleComponentMethodLabel,
  type BundleComponentSummary,
} from "@/lib/bundle-component-display";

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
  // Ruling 60 Phase B — provider CONTENT translation. Present only when the active locale differs
  // from the listing's own source language (ruling 115: source_locale, NULL = en): status
  // 'approved' means the fields above are the provider's translated content; status 'fallback'
  // means no approved translation exists and the ORIGINAL is shown with an honest label keyed to
  // its actual source language (§13 — never a silent or machine translation). `shownInEnglish` is
  // the pre-115 flag, kept for back-compat (true only for an en-source fallback).
  translation?: {
    locale: string;
    status: "approved" | "fallback";
    source?: string;
    shownInEnglish: boolean;
    sourceLocale?: string;
  } | null;
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
  // SS-6 (docs/DECISIONS.md ruling 69 disposition 9, migration 199): the language(s) the service
  // is DELIVERED in. Absent/null on every pre-199 listing and on every listing whose owner has
  // not said — which renders NOTHING at all, never a presumed "English" (§13).
  deliveryLanguages?: string[] | null;
  // T-REP (G5 #13): D7 logistics-capture columns (migration 195) were already riding the wire
  // (the endpoint spreads the whole row) but had no client type and no render — this lane's
  // whole mandate. leadTimeHours/earliestStartTime/latestStartTime/serviceTimezone are the THREE
  // fields `server/services/booking-eligibility.service.ts` already enforces at checkout
  // (ruling 83) — a traveler could be silently refused for a constraint the page never stated.
  // All nullable: NULL = the provider never declared it, render nothing (§13), never a guessed
  // default (leadTimeHours' DB default of 24 is a real stored value once read back, not invented
  // here).
  partySizeMin?: number | null;
  partySizeMax?: number | null;
  seating?: string | null; // 'private' | 'shared' | null (never answered ⇒ omitted, §13)
  leadTimeHours?: number | null;
  changeCutoffHours?: number | null;
  earliestStartTime?: string | null;
  latestStartTime?: string | null;
  serviceTimezone?: string | null;
  bufferMinutes?: number | null;
  durationMinutes?: number | null;
  // D7 capture-only (no server consumer yet, unlike the three eligibility gates above) — the
  // richer 4-value transport vocabulary (pickup_included/pickup_available/meet_at_point/
  // not_applicable) alongside the legacy yes/no/not_applicable `transportProvided` already
  // rendered in the Direct-Booking trust panel below.
  transportProvision?: string | null;
  // Deposits/partial payments (ruling 72, migration 200) — owner-authored LISTING config, not a
  // platform rate (§8/§18 do not apply; see shared/schema.ts's own comment on the column).
  depositEnabled?: boolean | null;
  depositType?: string | null;
  depositPercentage?: number | null;
  depositFlatAmount?: string | number | null;
  // Consultancy-style deliverable terms — present on any listing, most meaningful for pdf/call/
  // async delivery methods.
  revisionsIncluded?: number | null;
  includesExpertNotes?: boolean | null;
  // Photo gallery (distinct from the single serviceImage cover shown in the hero above).
  galleryImages?: string[] | null;
  // T-REP: provider-level coverage-area rows for THIS listing's category, joined server-side
  // (GET /api/services/:id) from `provider_neighborhood_coverage` — there is no bare
  // `neighborhoods` column on the row itself. Empty array = no declared coverage, never omitted
  // vs. absent-field ambiguity (§13): always an array, so "no neighborhoods" and "not asked yet"
  // read the same way here (there being no per-listing capture to distinguish them from).
  neighborhoods?: { slug: string; name: string }[];
  // Lane M3 (gap #13): the weekly repeat rule, newly carried by GET /api/services/:id. Absent
  // or empty ⇒ the listing declares no weekly rhythm and the row is omitted (§13).
  availabilityPatterns?: { dayOfWeek: number; startTime: string; endTime?: string | null }[];
  // Gap #13 (migration 228): the host's own words. Absent/blank ⇒ the row is omitted (§13).
  whatToBring?: string | null;
  accessNotes?: string | null;
  // S8 property builder (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102).
  // check-in/out and house rules are property-level ONLY (absolute inheritance — a room's own
  // detail read carries its property's values via the `property` field below, not its own).
  // amenities: NULL = never captured, [] = deliberately cleared — both render nothing (§13; see
  // hasAmenities in service-good-to-know.ts).
  checkInTime?: string | null;
  minStayNights?: number | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  amenities?: string[] | null;
  // S8/G2 privacy circle: present (true) only for productShape 'property'/'property_room' when
  // the pin on this response is the JITTERED approximate one, never the exact stored pin — the
  // client MUST label the circle as approximate whenever this is true (§13 honesty). Absent on
  // every other product shape and on a confirmed-booking reveal, where the pin is exact.
  locationApproximate?: true;
  // S9 (docs/DECISIONS.md ledger row 102, migration 212): async (async_messaging/voice_notes)
  // fields — public pre-purchase info, same §13 posture as the D7 block above. `joinLink` is
  // deliberately NOT declared here: it never rides this public read at all (see the strip
  // comment on GET /api/services/:id) — it only ever appears on the confirmed-booking surface.
  responseWindowHours?: number | null;
  scopeStatement?: string | null;
}

// Ruling 22: ordered route stops (service_route_points child rows, migration 192).
interface ServiceRoutePointRow {
  id: string;
  position: number;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

// S10 (Gate G4): matches the server's per-component shape (server/routes/content.routes.ts,
// GET /api/services/:id bundle branch) — see client/src/lib/bundle-component-display.ts for the
// shared type and the pure link/label helpers this page renders through.
type BundleComponent = BundleComponentSummary;

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
  // Ledger 90 (FP-5, I3): the owner's public display name, needed by "Contact Provider" to open
  // a real chat thread (chat.tsx's `?name=` fallback — `/api/experts/:id` is expert-family only).
  displayName?: string | null;
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

// S11 (DECISIONS.md ledger row 107): the REDACTED per-night stay calendar — never bookedCount/
// capacity/providerId, mirroring the T-REP read-strip precedent. `nightlyRate` is null when the
// provider hasn't set a per-range override for that night (§14 inherit case — checkout falls
// back to the listing's own `price`, exactly as this estimate does below).
interface StayAvailabilityNight {
  date: string;
  available: boolean;
  nightlyRate: number | null;
}
interface StayAvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: StayAvailabilityNight[];
}

export default function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { t } = useTranslation("common");
  // Ledger 90 (FP-5, I3) — see the import note. `useAskExpert` already gates on auth (opening the
  // sign-in modal with a returnTo instead of bouncing to "/") and forwards the display-name
  // fallback chat.tsx needs for a provider-role target.
  const askExpert = useAskExpert();

  const { data: service, isLoading: serviceLoading, isError: serviceError } = useQuery<Service>({
    // Ruling 60 Phase B: the active chrome locale (Phase A resolution) rides the read as
    // ?locale=, and is part of the query key so switching language refetches the content.
    queryKey: ["/api/services", id, locale],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Request timed out")), 10_000);
      try {
        const res = await fetch(`/api/services/${id}?locale=${encodeURIComponent(locale)}`, { credentials: "include", signal: controller.signal });
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

  // S11 (§14, ledger row 107): the REAL per-night rate for the picked range, from the redacted
  // stay-availability endpoint — replaces the pre-S11 flat `priceNum × nights` estimate below
  // with each night's own materialized rate (falling back to the listing price per night when a
  // night has no override, the exact §14 inherit rule `resolveStayNightlyRates` applies
  // server-side at quote/charge). Purely a DISPLAY estimate — checkout re-derives the real charge
  // server-side regardless; this only keeps what the traveler sees from disagreeing with it.
  const { data: stayRates, isLoading: stayRatesLoading } = useQuery<StayAvailabilityResponse>({
    queryKey: ["/api/services", id, "stay-availability", roomCheckIn, roomCheckOut],
    queryFn: async () => {
      const res = await fetch(
        `/api/services/${id}/stay-availability?checkIn=${roomCheckIn}&checkOut=${roomCheckOut}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch stay rates");
      return res.json() as Promise<StayAvailabilityResponse>;
    },
    enabled: isRoom && roomNights > 0 && roomNights <= 30,
  });
  // roomEstimatedTotal/roomHasMixedRates (needs `priceNum`, declared further below with the rest
  // of the price-display derivations) are computed just after that declaration.

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
            <Link href="/services">Browse Services</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const rating = parseFloat(service.averageRating || "0") || 0;
  // FP-1 / B3: the stored 'Unknown' default is ABSENCE, not a place — treat it as empty here so
  // the location chip below simply does not render (§13). Same filter as cart.tsx / routes.ts.
  const rawLocation = (service.location ?? "").trim();
  const displayLocation = rawLocation && rawLocation !== "Unknown" ? rawLocation : null;
  const priceNum = parseFloat(service.price || "0") || 0;
  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  // S11 (§14, ledger row 107): the estimate shown BEFORE add-to-cart — each picked night's own
  // materialized rate when the stay-availability fetch has resolved, falling back to the flat
  // `priceNum` per night otherwise (byte-identical to the pre-S11 display). Purely cosmetic:
  // checkout re-derives the authoritative charge server-side via the SAME resolver regardless.
  const roomEstimatedTotal = (() => {
    if (!stayRates || roomNightDates.length === 0) return priceNum * roomNights;
    const byDate = new Map(stayRates.nights.map((n) => [n.date, n.nightlyRate]));
    return roomNightDates.reduce((sum, d) => sum + (byDate.get(d) ?? priceNum), 0);
  })();
  const roomHasMixedRates =
    !!stayRates &&
    new Set(roomNightDates.map((d) => stayRates.nights.find((n) => n.date === d)?.nightlyRate ?? priceNum)).size > 1;
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

  // T-REP (G5 #13) "Good to know" logistics — each line gated on its own real field, omitted
  // (never defaulted) when absent (§13). The formatting/derivation itself lives in the pure,
  // unit-tested `@/lib/service-good-to-know` module; this page only decides WHETHER to render.
  const partySizeText = formatPartySize(service.partySizeMin, service.partySizeMax);
  const seatingText = formatSeating(service.seating);
  const hasLeadTime = typeof service.leadTimeHours === "number" && service.leadTimeHours > 0;
  const hasChangeCutoff = typeof service.changeCutoffHours === "number" && service.changeCutoffHours > 0;
  const startWindowText = formatStartWindow(service.earliestStartTime, service.latestStartTime, service.serviceTimezone);
  // Lane M3: the weekly rhythm a provider authored on the availability grid — until this lane it
  // was owner-gated on both read and write, so no traveler could see it (gap #13).
  const weeklyPatternText = formatWeeklyPattern(service.availabilityPatterns, service.serviceTimezone);
  // Gap #13's last two rows. Blank is "never answered", not "nothing needed" — omitted, never
  // rendered as a claim the host did not make.
  const whatToBringText = (service.whatToBring ?? "").trim() || null;
  const accessNotesText = (service.accessNotes ?? "").trim() || null;
  const hasBuffer = typeof service.bufferMinutes === "number" && service.bufferMinutes > 0;
  const hasDurationMinutes = typeof service.durationMinutes === "number" && service.durationMinutes > 0;
  const hasNeighborhoods = Array.isArray(service.neighborhoods) && service.neighborhoods.length > 0;
  const transportProvisionText = formatTransportProvision(service.transportProvision);
  // Deposit terms are owner listing config, not a platform rate (§8/§18 do not apply — see
  // shared/schema.ts). The dollar preview mirrors resolveDepositPlan's own formula
  // (percentage-of-price or flat) for display only; checkout re-derives the real charge
  // server-side from the confirmed line total (§14) — this is not a second source of truth.
  const hasDeposit = hasDepositTerms(service);
  const depositPreview = resolveDepositPreview(service, fmtPrice, priceNum);
  const hasRevisions = typeof service.revisionsIncluded === "number" && service.revisionsIncluded > 0;
  // S8 (Gate G2): property check-in/out + house rules + amenities — same gate-on-a-real-field
  // posture as every other Good-to-know line above.
  const checkInOutText = formatCheckInOut(service.checkInTime, service.checkOutTime);
  const hasHouseRules = !!service.houseRules && service.houseRules.trim().length > 0;
  const showAmenities = hasAmenities(service.amenities);
  // S9 (docs/DECISIONS.md ledger row 102): response window / scope statement are PUBLIC
  // pre-purchase info for the two async methods (async_messaging/voice_notes) — absent ⇒
  // omitted (§13), never a guessed "we'll get back to you soon". joinLink is deliberately NOT
  // rendered here: it only ever exists on the CONFIRMED-booking surface (server-side reveal),
  // never on this public pre-purchase read at all.
  const responseWindowText = formatResponseWindow(service.responseWindowHours);
  const scopeStatementText = (service.scopeStatement ?? "").trim() || null;
  const hasGoodToKnow =
    !!partySizeText || !!seatingText || hasLeadTime || hasChangeCutoff || !!startWindowText || !!weeklyPatternText || hasBuffer ||
    !!whatToBringText || !!accessNotesText ||
    hasDurationMinutes || hasNeighborhoods || !!transportProvisionText || hasDeposit ||
    !!checkInOutText || hasHouseRules || showAmenities ||
    !!responseWindowText || !!scopeStatementText;

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
            {/* Ruling 60 Phase B (§13 applied to language): when the active locale has no
                approved translation, the original content is shown with an HONEST label keyed to
                the listing's actual source language (ruling 115) — never silently, never
                machine-translated at read time. The label text itself is chrome (Phase A t()),
                the only place B touches A. */}
            {service.translation?.status === "fallback" && (
              <Badge
                variant="outline"
                className="mt-2 text-xs font-normal"
                title={t(
                  (service.translation.sourceLocale ?? "en") === "ja"
                    ? "contentTranslation.shownInJapaneseHint"
                    : "contentTranslation.shownInEnglishHint",
                )}
                data-testid="badge-shown-in-english"
              >
                <Languages className="w-3 h-3 mr-1" />
                {t(
                  (service.translation.sourceLocale ?? "en") === "ja"
                    ? "contentTranslation.shownInJapanese"
                    : "contentTranslation.shownInEnglish",
                )}
              </Badge>
            )}
            <div className="flex items-center gap-4 mt-1 text-muted-foreground flex-wrap">
              {/* ── FP-1 / B3 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P2) ─────────────────────
                  `provider_services.location` DEFAULTs to the literal string 'Unknown', and the
                  console only collects it for the delivery methods that render a "Service area"
                  input — so five of one real provider's listings showed travelers a map-pin chip
                  reading “Unknown”, asserting it as if it were a place. The chip now renders ONLY
                  when there is a real location to state; nothing is shown otherwise (§13 — the
                  same 'Unknown'-is-absence rule cart.tsx and routes.ts already apply). "Remote"
                  is deliberately NOT substituted: we do not know that an unstated location means
                  remote. */}
              {displayLocation && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span data-testid="text-location">{displayLocation}</span>
                </div>
              )}
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

        {/* T-REP (G5 #13): the gallery has been collectible (galleryImages) since the wizard's
            Media step, and the column already rode the wire (`SELECT *`) — only the render was
            missing. Only the cover (serviceImage) showed above; every other photo went nowhere.
            A simple thumbnail strip, distinct from the hero, no lightbox/carousel added — that's
            a bigger UI investment than this lane's honest-rendering mandate calls for. */}
        {Array.isArray(service.galleryImages) && service.galleryImages.length > 0 && (
          <div className="mb-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2" data-testid="section-gallery">
            {service.galleryImages.map((url, idx) => (
              <div key={idx} className="rounded-md overflow-hidden border aspect-square" data-testid={`img-gallery-${idx}`}>
                <img src={url} alt={`${service.serviceName} photo ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
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

                {/* SS-6 (ruling 69 disposition 9): delivery language, plainly, WHEN PRESENT.
                    In the launch market this is a purchasable attribute — a shared session in
                    Japanese and a private one in English are commonly different products — and
                    providers previously could not state it at all. §13: an absent value renders
                    NOTHING. There is deliberately no "English" fallback and no "language not
                    specified" line: silence is the honest answer to a question nobody answered. */}
                {Array.isArray(service.deliveryLanguages) && service.deliveryLanguages.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 text-sm" data-testid="text-delivery-languages">
                    <Languages className="w-4 h-4 text-muted-foreground" />
                    <span>Delivered in: {service.deliveryLanguages.join(", ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* T-REP (G5 #13): "Good to know" — logistics the provider authored in ServiceForm
                that had no home on this page. Every line is gated on a real field; an absent
                value omits the row rather than guessing (§13). The three eligibility lines
                (party size / start window / lead time) mirror the SAME constraints
                booking-eligibility.service.ts already enforces server-side at checkout — stating
                them here means a traveler finds out before trying to book, not after a silent
                refusal. */}
            {hasGoodToKnow && (
              <Card data-testid="card-good-to-know">
                <CardHeader>
                  <CardTitle>Good to know</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5 text-sm">
                    {partySizeText && (
                      <li className="flex items-start gap-2" data-testid="text-party-size">
                        <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Party size: {partySizeText}</span>
                      </li>
                    )}
                    {seatingText && (
                      <li className="flex items-start gap-2" data-testid="text-seating">
                        <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Seating: {seatingText}</span>
                      </li>
                    )}
                    {weeklyPatternText && (
                      <li className="flex items-start gap-2" data-testid="text-weekly-pattern">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Runs {weeklyPatternText}</span>
                      </li>
                    )}
                    {startWindowText && (
                      <li className="flex items-start gap-2" data-testid="text-start-window">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{startWindowText}</span>
                      </li>
                    )}
                    {hasLeadTime && (
                      <li className="flex items-start gap-2" data-testid="text-lead-time">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Book at least {formatHours(service.leadTimeHours!)} ahead</span>
                      </li>
                    )}
                    {hasChangeCutoff && (
                      <li className="flex items-start gap-2" data-testid="text-change-cutoff">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Changes accepted up to {formatHours(service.changeCutoffHours!)} before the start</span>
                      </li>
                    )}
                    {hasDurationMinutes && (
                      <li className="flex items-start gap-2" data-testid="text-duration-minutes">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Duration: {formatMinutes(service.durationMinutes!)}</span>
                      </li>
                    )}
                    {hasBuffer && (
                      <li className="flex items-start gap-2" data-testid="text-buffer-minutes">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{formatMinutes(service.bufferMinutes!)} kept free around each booking</span>
                      </li>
                    )}
                    {whatToBringText && (
                      <li className="flex items-start gap-2" data-testid="text-what-to-bring">
                        <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Bring: {whatToBringText}</span>
                      </li>
                    )}
                    {accessNotesText && (
                      <li className="flex items-start gap-2" data-testid="text-access-notes">
                        <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>
                          Access: {accessNotesText}
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            Shown in the host&apos;s own words. No accessibility standard is claimed
                            on their behalf.
                          </span>
                        </span>
                      </li>
                    )}
                    {transportProvisionText && (
                      <li className="flex items-start gap-2" data-testid="text-transport-provision">
                        <Car className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{transportProvisionText}</span>
                      </li>
                    )}
                    {hasNeighborhoods && (
                      <li className="flex items-start gap-2" data-testid="text-neighborhoods">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>Serves: {service.neighborhoods!.map((n) => n.name).join(", ")}</span>
                      </li>
                    )}
                    {hasDeposit && (
                      <li className="flex items-start gap-2" data-testid="text-deposit-terms">
                        <DollarSign className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{depositPreview ?? "Deposit required — details at checkout"}</span>
                      </li>
                    )}
                    {checkInOutText && (
                      <li className="flex items-start gap-2" data-testid="text-check-in-out">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{checkInOutText}</span>
                      </li>
                    )}
                    {/* Ruling 112 Q6 (migration 214): a declared minimum stay is public
                        pre-purchase info; absent ⇒ omitted, never a guessed 1 night (§13). */}
                    {typeof service.minStayNights === "number" && service.minStayNights >= 1 && (
                      <li className="flex items-start gap-2" data-testid="text-min-stay">
                        <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>
                          Minimum stay: {service.minStayNights} night{service.minStayNights === 1 ? "" : "s"}
                        </span>
                      </li>
                    )}
                    {/* S9 (docs/DECISIONS.md ledger row 102): async delivery's promised response
                        time + scope statement — public pre-purchase info, gated on the real
                        field (§13). joinLink never appears here — see the comment on
                        responseWindowText above. */}
                    {responseWindowText && (
                      <li className="flex items-start gap-2" data-testid="text-response-window">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{responseWindowText}</span>
                      </li>
                    )}
                    {scopeStatementText && (
                      <li className="flex items-start gap-2" data-testid="text-scope-statement">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span>{scopeStatementText}</span>
                      </li>
                    )}
                  </ul>
                  {hasHouseRules && (
                    <div className="mt-4 pt-4 border-t" data-testid="text-house-rules">
                      <p className="text-sm font-medium mb-1">House rules</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{service.houseRules}</p>
                    </div>
                  )}
                  {showAmenities && (
                    <div className="mt-4 pt-4 border-t" data-testid="list-amenities">
                      <p className="text-sm font-medium mb-2">Amenities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {service.amenities!.map((a) => (
                          <Badge key={a} variant="secondary" className="text-xs" data-testid={`badge-amenity-${a}`}>
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
              // S8/G2 privacy circle: the server sends `locationApproximate: true` ONLY when this
              // pin is the ~500m-jittered stand-in for a property/room's real confirmed pin
              // (never for any other product shape). Label it honestly rather than let a
              // traveler mistake the circle for the exact address (§13).
              const isApproximate = service.locationApproximate === true;
              return (
                <Card data-testid="card-location-route">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Location & route
                      {isApproximate && (
                        <Badge variant="outline" className="text-[10px] font-normal" data-testid="badge-approximate-location">
                          Approximate area
                        </Badge>
                      )}
                    </CardTitle>
                    {isApproximate && (
                      <p className="text-xs text-muted-foreground" data-testid="text-approximate-location-note">
                        The exact address is shared after booking. This circle shows the general neighborhood only.
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg overflow-hidden border">
                      <ServiceLocationMap
                        pin={servicePin}
                        pinLabel={isApproximate ? "Approximate area" : (service.meetingPoint || service.serviceName)}
                        radiusKm={isApproximate ? 0.5 : (Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : null)}
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

            {((service.whatIncluded && service.whatIncluded.length > 0) || hasRevisions || service.includesExpertNotes) && (
              <Card>
                <CardHeader>
                  <CardTitle>What's Included</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {service.whatIncluded?.map((item, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                    {/* T-REP (G5 #13): revisionsIncluded/includesExpertNotes were authored on
                        every consulting-style listing and rendered nowhere. */}
                    {hasRevisions && (
                      <li className="flex items-start gap-2" data-testid="text-revisions-included">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">
                          {service.revisionsIncluded} revision{service.revisionsIncluded === 1 ? "" : "s"} included
                        </span>
                      </li>
                    )}
                    {service.includesExpertNotes && (
                      <li className="flex items-start gap-2" data-testid="text-includes-expert-notes">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">Includes personalized expert notes</span>
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* S10 (Gate G4): components of this bundle. The server (content.routes.ts) sends
                EVERY component slot, not just the visible ones — an available:false row is
                unapproved/paused/missing and renders name-only with no link (§13: never a broken
                link, never invented detail). No section at all for a non-bundle service. */}
            {Array.isArray(service.bundleComponents) && service.bundleComponents.length > 0 && (
              <Card data-testid="card-bundle-components">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" /> What's inside this bundle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Same honest posture the Workstation bundle builder states to the provider
                      ("component prices below are shown for reference only, nothing is
                      auto-summed") — the traveler-facing equivalent: this is one bundle price,
                      not a sum of what the components would cost booked separately. */}
                  <p className="text-xs text-muted-foreground mb-3">
                    This is one bundle price — it's not a sum of these components' individual prices.
                  </p>
                  <div className="divide-y">
                    {service.bundleComponents.map((component, index) => {
                      const href = bundleComponentHref(component);
                      const methodLabel = bundleComponentMethodLabel(component);
                      const key = component.available ? component.id : `unavailable-${index}`;
                      const body = (
                        <div className="flex items-start gap-3 py-3">
                          {component.available && component.serviceImage && (
                            <img
                              src={component.serviceImage}
                              alt=""
                              className="w-14 h-14 rounded-md object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-medium ${component.available ? "" : "text-muted-foreground"}`}>
                                {component.serviceName}
                              </p>
                              {methodLabel && (
                                <Badge variant="outline" className="capitalize">{methodLabel}</Badge>
                              )}
                            </div>
                            {component.available && component.shortDescription && (
                              <p className="text-sm text-muted-foreground mt-0.5">{component.shortDescription}</p>
                            )}
                            {!component.available && (
                              <p className="text-sm text-muted-foreground mt-0.5">Currently unavailable</p>
                            )}
                          </div>
                        </div>
                      );
                      return href ? (
                        <Link
                          key={key}
                          href={href}
                          data-testid={`bundle-component-${component.available ? component.id : index}`}
                          className="block hover-elevate rounded-md px-2 -mx-2"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div
                          key={key}
                          data-testid={`bundle-component-unavailable-${index}`}
                          className="px-2 -mx-2"
                        >
                          {body}
                        </div>
                      );
                    })}
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

                  {/* Ledger 90 (FP-5, I3): the working rail, with the listing name carried as the
                      subject so the provider's Inbox thread arrives with context. The provider's
                      display name comes from the public-verification read this page already makes;
                      until it resolves the button is disabled rather than repeating the old
                      dead-end (a CTA that cannot open a thread must not look like it can). */}
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={!providerVerification?.displayName}
                    onClick={() =>
                      askExpert({
                        expertId: service.userId,
                        subject: service.serviceName,
                        returnTo: `/services/${service.id}`,
                        fallbackName: providerVerification?.displayName ?? null,
                      })
                    }
                    data-testid="button-contact-provider"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Contact Provider
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
                        {roomNights} night{roomNights === 1 ? "" : "s"} · {fmtPrice(roomEstimatedTotal)}{" "}
                        {stayRatesLoading ? "(estimating…)" : "estimated total"}
                        {roomHasMixedRates && (
                          <span className="text-muted-foreground"> (rates vary by night)</span>
                        )}
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
