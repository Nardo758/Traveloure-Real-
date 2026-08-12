/**
 * Provider Catalog — Console IA C9 (§17 17→9 collapse, the provider nine-module stamp).
 *
 * This page is the provider console's Catalog seat ("what I sell"). C9 completed the same
 * absorptions the expert catalog.tsx got in C2, reusing the shared pieces rather than
 * rebuilding them:
 *   - STOREFRONT HEADER: the /p/:handle management block (honest Live chip mirroring the
 *     storefront.routes.ts read-gate — services approved+active; 404 at zero — plus the
 *     storefront caption share tool via the shared StorefrontShareTools).
 *   - AVAILABILITY: the ratified "availability editing belongs to Catalog" placement — the
 *     expert catalog's slot section transplanted onto /api/provider/services + the SAME
 *     session-ownership-scoped /api/me/services/:serviceId/slots CRUD (expert-console.routes.ts
 *     resolves ownership against provider_services.userId, so it is role-agnostic). This is
 *     the REAL slot editor; the old /provider/calendar "Edit Schedule"/"Block Dates" sheets it
 *     supersedes were non-persisting previews.
 *   - SHARE & PROMOTE absorption: per-service Share kit (Dialog + the shared
 *     OfferingShareDetail — approved+active only, the F2 gate share-images.routes.ts enforces)
 *     and the Posting Opportunities card (shared PostingOpportunitiesCard,
 *     /api/me/posting-opportunities — session-scoped, real rows only §13).
 *     /provider/share-promote now redirects here (its expert twin redirected in C2).
 */
import { useTranslation } from "react-i18next";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/backoffice/primitives";
import {
  OfferingShareDetail,
  type OfferingShareOption,
  PostingOpportunitiesCard,
  StorefrontShareTools,
  ensureShortLink,
} from "@/components/backoffice/share-tools";
import { CatalogMapView } from "@/components/provider/catalog-map-view";
import { OfferingCard } from "@/components/OfferingCard";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  DollarSign,
  Clock,
  Users,
  Camera,
  Car,
  ChefHat,
  Map,
  Heart,
  Sparkles,
  CalendarHeart,
  UserCheck,
  Languages,
  Baby,
  BedDouble,
  Music,
  Mic2,
  Flower2,
  Palette,
  Package,
  BookOpen,
  Scissors,
  Shield,
  Zap,
  Briefcase,
  UtensilsCrossed,
  Wrench,
  MapPin,
  Truck,
  PartyPopper,
  Award,
  Compass,
  Share2,
  ExternalLink,
  CalendarClock,
  ChevronDown,
  ImageOff,
  CheckCircle2,
  Star,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isClassifiable, isPlaceAnchored } from "@shared/service-fundamentals";

interface Service {
  id: string;
  serviceName: string;
  name?: string;
  description?: string;
  serviceType?: string;
  approvalStatus?: string;
  categoryId?: string;
  price?: string | number;
  basePrice?: string | number;
  priceType?: string;
  deliveryTimeframe?: string;
  maxConcurrentBookings?: number;
  status: string;
  active?: boolean;
  isFeatured?: boolean;
  location?: string;
  meetingPoint?: string;
  pickupAvailable?: boolean;
  averageRating?: string;
  reviewCount?: number;
  // C2 Preview toggle: the unfiltered /api/provider/services row already carries these; the
  // storefront card maps price-unit + place-anchored city chip from them (mirrors storefront.tsx).
  pricingUnit?: string | null;
  city?: string | null;
  contentAffinityTags?: string[];
  // PB (§17 Product Builder): a bundle IS a provider_services row (product_shape='bundle',
  // migration 151) — it appears in this list like any listing; NULL = single service.
  productShape?: string | null;
  // Listing Health (below): these ride the EXISTING /api/provider/services row — storage.
  // getProviderServices does an unfiltered db.select(), so photo + pin fields are already on
  // the wire. Sourcing the thumbnail/pin chip from here (not the new health endpoint) is what
  // lets both render pre-mount.
  serviceImage?: string | null;
  galleryImages?: string[] | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationPrecision?: string | null;
  // D2 method-aware fundamentals: rides the same unfiltered row; drives which chip the card
  // shows (pin for place-anchored services, delivery-method for the rest).
  deliveryMethod?: string | null;
  // C3 (ruling 74/75): per-listing "Card shows" options. The owner read resolves bookingMode to a
  // concrete value (never null) with the SAME derivation the storefront uses; showPrice defaults true.
  showPrice?: boolean;
  bookingMode?: "instant" | "request" | "hidden";
}

const AFFINITY_TAG_LABELS: Record<string, string> = {
  hotel_arrival:       "Hotel arrival/departure",
  photo_shoot:         "Photo shoot",
  restaurant_visit:    "Restaurant visit",
  cultural_attraction: "Cultural attraction",
  wellness_experience: "Wellness experience",
  nightlife:           "Nightlife",
  hiking_outdoor:      "Hiking/outdoor",
  wedding_proposal:    "Wedding/proposal",
  general_logistics:   "General logistics",
};

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

const inspirationCards = [
  { label: "Photography & Video", slug: "Photography & Videography", icon: Camera, color: "bg-rose-50 text-rose-500" },
  { label: "Transportation", slug: "Transportation & Logistics", icon: Car, color: "bg-blue-50 text-blue-500" },
  { label: "Food & Culinary", slug: "Food & Culinary", icon: ChefHat, color: "bg-orange-50 text-orange-500" },
  { label: "Tours & Experiences", slug: "Tours & Experiences", icon: Map, color: "bg-green-50 text-green-500" },
  { label: "Health & Wellness", slug: "Health & Wellness", icon: Heart, color: "bg-pink-50 text-pink-500" },
  { label: "Beauty & Styling", slug: "Beauty & Styling", icon: Sparkles, color: "bg-purple-50 text-purple-500" },
  { label: "Events & Celebrations", slug: "Events & Celebrations", icon: CalendarHeart, color: "bg-amber-50 text-amber-500" },
  { label: "Personal Assistance", slug: "Personal Assistance", icon: UserCheck, color: "bg-teal-50 text-teal-500" },
  { label: "Language & Translation", slug: "Language & Translation", icon: Languages, color: "bg-indigo-50 text-indigo-500" },
  { label: "Childcare & Family", slug: "Childcare & Family", icon: Baby, color: "bg-sky-50 text-sky-500" },
  { label: "Lodging", slug: "Lodging & Accommodation", icon: BedDouble, color: "bg-cyan-50 text-cyan-600" },
  { label: "Music & Performance", slug: "Music & Performance", icon: Music, color: "bg-violet-50 text-violet-500" },
  { label: "Entertainment", slug: "Entertainment", icon: Mic2, color: "bg-fuchsia-50 text-fuchsia-500" },
  { label: "Floral & Decor", slug: "Floral & Decoration", icon: Flower2, color: "bg-pink-50 text-pink-400" },
  { label: "Arts & Crafts", slug: "Arts & Crafts Instruction", icon: Palette, color: "bg-lime-50 text-lime-600" },
  { label: "Rentals", slug: "Rental Services", icon: Package, color: "bg-stone-50 text-stone-500" },
  { label: "Cultural & Educational", slug: "Cultural & Educational", icon: BookOpen, color: "bg-emerald-50 text-emerald-600" },
  { label: "Attire & Fashion", slug: "Attire & Fashion", icon: Scissors, color: "bg-rose-50 text-rose-400" },
  { label: "Safety & Security", slug: "Safety & Security", icon: Shield, color: "bg-slate-50 text-slate-500" },
  { label: "Business & Professional", slug: "Business & Professional", icon: Briefcase, color: "bg-console-bg text-console-dark" },
  { label: "Technical Services", slug: "Technical Services", icon: Zap, color: "bg-yellow-50 text-yellow-600" },
  { label: "Restaurants & Dining", slug: "Restaurants & Dining", icon: UtensilsCrossed, color: "bg-red-50 text-red-500" },
  { label: "Repairs & Tasks", slug: "Taskrabbit Services", icon: Wrench, color: "bg-orange-50 text-orange-400" },
  { label: "Companionship", slug: "Companionship & Assistance", icon: Users, color: "bg-blue-50 text-blue-400" },
  { label: "Stationery & Print", slug: "Stationery & Paper Goods", icon: Languages, color: "bg-indigo-50 text-indigo-400" },
  { label: "Special Effects", slug: "Specialty Effects & Activities", icon: Zap, color: "bg-yellow-50 text-yellow-500" },
  { label: "Send-Off & Post-Event", slug: "Send-Off & Post-Event", icon: PartyPopper, color: "bg-pink-50 text-pink-500" },
  { label: "Unique Specialists", slug: "Unique Specialty Services", icon: Award, color: "bg-violet-50 text-violet-500" },
  { label: "Spiritual & Wellness", slug: "Spiritual & Wellness", icon: Sparkles, color: "bg-teal-50 text-teal-400" },
  { label: "Local Expertise", slug: "Local Expertise", icon: MapPin, color: "bg-green-50 text-green-500" },
];

// ─── Storefront header (C9 — the expert catalog C2 block, provider lane only) ───────────
//
// Handle comes from the session-backed cached auth user (§14: never client-supplied); the
// Live count is derived from the SAME owner-console query the offerings list already loads
// (react-query dedups the key — no new endpoint), filtered by the public read-gate
// (storefront.routes.ts serves approved+active services; 404 at zero — that IS "not live").
// §13: no chip renders until the real count is loaded.
function ProviderStorefrontHeader() {
  const { toast } = useToast();
  const { user } = useAuth();
  const handle = (user as any)?.handle as string | null | undefined;

  const services = useQuery<Service[]>({ queryKey: ["/api/provider/services"] });
  const countsLoaded = !services.isLoading;

  const approvedCount = (Array.isArray(services.data) ? services.data : []).filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  ).length;

  const isLive = !!handle && countsLoaded && approvedCount > 0;
  const publicPath = handle ? `/p/${handle}` : null;
  const publicUrl = publicPath ? `${window.location.origin}${publicPath}` : null;

  async function copyLink() {
    if (!publicUrl || !publicPath) return;
    // Same tracked short-link rail the share tools use, full-URL fallback on any error.
    const link = await ensureShortLink({ targetType: "storefront" }, publicPath);
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: link });
  }

  return (
    <Card className="border border-console-light" data-testid="card-storefront-header">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-console-darkest">Your storefront</h2>
            {handle ? (
              <p
                className="text-[12.5px] text-console-mid truncate"
                style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
                data-testid="text-storefront-url"
              >
                {window.location.host}
                {publicPath}
              </p>
            ) : (
              <p className="text-sm text-console-mid" data-testid="text-storefront-no-handle">
                No handle yet —{" "}
                <Link href="/provider/settings">
                  <span
                    className="underline cursor-pointer font-medium text-primary"
                    data-testid="link-storefront-claim-handle"
                  >
                    Claim your handle in Settings →
                  </span>
                </Link>
              </p>
            )}
          </div>
          {handle && (
            countsLoaded ? (
              isLive ? (
                <Badge
                  className="text-xs border bg-green-100 text-green-800 border-green-200"
                  data-testid="badge-storefront-live"
                >
                  Live · {approvedCount} approved service{approvedCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge
                  className="text-xs border bg-amber-100 text-amber-800 border-amber-200"
                  data-testid="badge-storefront-not-live"
                >
                  Not live yet — approval pending
                </Badge>
              )
            ) : (
              <Skeleton className="h-5 w-32" />
            )
          )}
          <span className="flex-1" />
          {isLive && publicUrl && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
                data-testid="button-storefront-preview"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Preview
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink} data-testid="button-storefront-copy-link">
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy link
              </Button>
            </div>
          )}
        </div>

        {/* The storefront caption share tool (shared component) — only when the page is
            actually live; promoting a 404 storefront would be a dead share (§13). */}
        {isLive && handle && (
          <div className="pt-3 border-t border-console-light">
            <p className="text-xs font-medium text-console-mid mb-2">Share your storefront</p>
            <StorefrontShareTools handle={handle} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Availability section (C9 — the expert catalog section on the provider query) ────────
//
// vendor_availability_slots is the canonical dated-slot model; the /api/me/… CRUD resolves
// ownership against provider_services.userId server-side (role-agnostic, §14). The Channel
// Calendar's availability lane reads exactly what this section writes.

interface AvailabilitySlot {
  id: string;
  date: string;
  startTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null;
}

/** apiRequest throws `Error("<status>: <body>")` — pull the server's honest message out of it
 *  (falling back to the raw text) so a 409 booked-slot refusal reads as prose, not a status code. */
function parseApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = match ? match[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) return parsed.message as string;
    } catch {
      // not JSON — use the raw body text
    }
    return body || fallback;
  }
  return fallback;
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function AvailabilitySection() {
  const { toast } = useToast();
  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [capacity, setCapacity] = useState("");
  // Collapsible section — default OPEN (this is a primary task), header states real
  // service/slot-count data so collapsing loses no information (§13).
  const [sectionOpen, setSectionOpen] = useState(true);

  const list = Array.isArray(services) ? services : [];
  const activeServiceId = selectedServiceId || list[0]?.id || "";

  const { data: slots, isLoading: slotsLoading } = useQuery<AvailabilitySlot[]>({
    queryKey: [`/api/me/services/${activeServiceId}/slots`],
    enabled: !!activeServiceId,
  });

  const createSlotMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { date };
      if (startTime.trim()) body.startTime = startTime.trim();
      if (capacity.trim()) body.capacity = Number(capacity);
      const res = await apiRequest("POST", `/api/me/services/${activeServiceId}/slots`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot added", description: "Travelers can now book this date." });
      setDate("");
      setStartTime("");
      setCapacity("");
    },
    onError: (err) => {
      toast({
        title: "Could not add slot",
        description: parseApiErrorMessage(err, "Please check the date and try again."),
        variant: "destructive",
      });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await apiRequest("DELETE", `/api/me/slots/${slotId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/me/services/${activeServiceId}/slots`] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/next-availability"] });
      toast({ title: "Slot removed" });
    },
    onError: (err) => {
      // 409 booked-slot refusal surfaces here, honestly, as the server wrote it.
      toast({
        title: "Could not remove slot",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const currentService = list.find((s) => s.id === activeServiceId);
  const slotCountLabel = slotsLoading
    ? "…"
    : slots && slots.length > 0
    ? `${slots.length} slot${slots.length === 1 ? "" : "s"}`
    : "none yet";
  const headerSummary = servicesLoading
    ? ""
    : list.length === 0
    ? "no services yet"
    : `${currentService?.serviceName ?? currentService?.name ?? "Untitled"} · ${slotCountLabel}`;

  return (
    <section data-testid="section-catalog-availability">
      <button
        type="button"
        onClick={() => setSectionOpen((o) => !o)}
        className="w-full flex items-center justify-between mb-2 py-1 group"
        data-testid="button-toggle-availability"
      >
        <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide flex items-center gap-1.5">
          Availability
          {headerSummary && (
            <span className="normal-case font-normal text-console-mid/80" data-testid="text-availability-summary">
              · {headerSummary}
            </span>
          )}
        </h2>
        <ChevronDown
          className={`w-4 h-4 text-console-mid transition-transform ${sectionOpen ? "rotate-180" : ""}`}
        />
      </button>
      {sectionOpen && (
      <Card className="border border-console-light">
        <CardContent className="p-3 space-y-3">
          {servicesLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No services yet"
              body="Create a service first, then publish dates travelers can book."
              testId="empty-catalog-no-services"
            />
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="catalog-service-picker" className="text-sm text-console-mid whitespace-nowrap">
                  Service
                </Label>
                <Select value={activeServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger id="catalog-service-picker" className="w-64" data-testid="select-catalog-service">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.serviceName ?? s.name ?? "Untitled service"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const current = list.find((s) => s.id === activeServiceId);
                  return current?.approvalStatus ? <StatusBadge status={current.approvalStatus} /> : null;
                })()}
              </div>

              {slotsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !slots || slots.length === 0 ? (
                <div
                  className="flex items-center gap-2 rounded-lg border border-dashed border-console-light px-3 py-2.5 text-sm text-console-mid"
                  data-testid="empty-catalog-no-slots"
                >
                  <CalendarClock className="w-4 h-4 flex-shrink-0 text-console-mid/60" />
                  <span>No availability published yet — travelers can't pick a time until you add slots.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-console-light p-3"
                      data-testid={`catalog-slot-${slot.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-console-darkest">
                          {formatSlotDate(slot.date)}
                          {slot.startTime && <span className="text-console-mid"> · {slot.startTime}</span>}
                        </p>
                        <p className="text-xs text-console-mid">
                          {(slot.bookedCount ?? 0)} / {slot.capacity ?? 1} booked
                          {slot.status ? ` · ${slot.status}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 flex-shrink-0"
                        disabled={deleteSlotMutation.isPending}
                        onClick={() => deleteSlotMutation.mutate(slot.id)}
                        data-testid={`button-delete-slot-${slot.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <form
                className="flex items-end gap-2 flex-wrap pt-1.5 border-t border-console-light"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!date || !activeServiceId) return;
                  createSlotMutation.mutate();
                }}
              >
                <div>
                  <Label htmlFor="catalog-slot-date" className="text-xs text-console-mid">Date</Label>
                  <Input
                    id="catalog-slot-date"
                    type="date"
                    className="h-8"
                    min={new Date().toISOString().slice(0, 10)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    data-testid="input-slot-date"
                  />
                </div>
                <div>
                  <Label htmlFor="catalog-slot-time" className="text-xs text-console-mid">Start time (optional)</Label>
                  <Input
                    id="catalog-slot-time"
                    type="time"
                    className="h-8"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-slot-start-time"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="catalog-slot-capacity" className="text-xs text-console-mid">Capacity</Label>
                  <Input
                    id="catalog-slot-capacity"
                    type="number"
                    className="h-8"
                    min={1}
                    max={100}
                    placeholder="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    data-testid="input-slot-capacity"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5"
                  disabled={createSlotMutation.isPending || !date || !activeServiceId}
                  data-testid="button-add-slot"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add slot
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
      )}
    </section>
  );
}

// ─── Listing Health (ratified "Listing Health" layer, CLAUDE.md §13/§16/§18) ─────────────
//
// Audit finding: ~97% of provider listings ride the approximate neighborhood-centroid
// location backfill and zero carry a provider-confirmed exact pin, because nothing surfaced
// it. Photo + pin render from fields ALREADY on the /api/provider/services row (below), so
// they work even before the new health router is mounted; only the "Health N/M" score/meter
// depends on GET /api/provider/services/health, and that section renders NOTHING (no
// skeleton, no guess) when the endpoint is unavailable — honest absence, §13.

interface HealthCheck {
  key: string;
  ok: boolean;
  detail?: string;
}
interface ServiceHealth {
  serviceId: string;
  checks: HealthCheck[];
  score: { passed: number; total: number };
  // D2 method-aware fundamentals: checks that don't apply to this service's shape, omitted
  // with a reason — rendered as a muted "n/a" note, never as a failure.
  omitted?: { key: string; reason: string }[];
}
interface HealthResponse {
  services: ServiceHealth[];
  omitted: { key: string; reason: string }[];
}

// Short, compact labels for the failing-checks inline list (the check KEY, not the longer
// server-provided `detail` prose — "no photo · no exact pin · no availability").
// Ruling 60 Phase A: the English strings moved to locales/<lng>/catalog.json under
// health.checks.*; the server-sent check key is the translation key, and an UNKNOWN key still
// falls through to the raw key exactly as before (the `?? c.key` at the call site).
const HEALTH_CHECK_KEYS = [
  "photo",
  "exact_pin",
  "description",
  "pricing",
  "availability",
  "approval",
  "delivery_asset",
] as const;

const TONE_CLASSNAMES = {
  ok: "bg-green-100 text-green-700 border-green-200",
  warn: "bg-amber-100 text-amber-700 border-amber-200",
  bad: "bg-red-100 text-red-700 border-red-200",
  neutral: "bg-console-bg text-console-mid border-console-light",
} as const;

// Short "n/a" labels for method-omitted checks (D2) — the muted note beside the health meter.
// Translated under health.omitted.* (ruling 60 Phase A).
const OMITTED_CHECK_KEYS = ["exact_pin", "availability"] as const;

// Delivery-method chip for non-place-anchored services — shown INSTEAD of a pin chip, because
// scoring a PDF guide red for "no location" was exactly the unfairness D2 removes.
// The seven canonical delivery methods are a DATA vocabulary (CLAUDE.md §3) — the keys below
// are those values verbatim and are never translated; only their display labels are
// (delivery.* in catalog.json).
const DELIVERY_CHIP_KEYS = ["pdf", "video", "call", "voice_notes", "async_messaging"] as const;

/** 62×46 rounded thumbnail from serviceImage/galleryImages[0]; an honest neutral placeholder
 *  tile (muted icon, no fake image) when neither is present. Sourced from the services list
 *  row directly — no dependency on the health endpoint. */
function ServiceThumb({ service }: { service: Service }) {
  const gallery = Array.isArray(service.galleryImages) ? service.galleryImages : [];
  const src = service.serviceImage || gallery[0] || null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-[62px] h-[46px] rounded-md object-cover flex-shrink-0 border border-console-light bg-console-bg"
        data-testid={`img-service-thumb-${service.id}`}
      />
    );
  }
  return (
    <div
      className="w-[62px] h-[46px] rounded-md flex-shrink-0 border border-dashed border-console-light bg-console-bg flex items-center justify-center"
      data-testid={`img-service-thumb-${service.id}`}
    >
      <ImageOff className="w-4 h-4 text-console-mid/50" />
    </div>
  );
}

/** Pin-status chip. Semantics mirror the server's exact_pin health check exactly (exact pin =
 *  lat+lng present AND locationPrecision='exact'; else approximate-vs-none by coordinate
 *  presence), computed locally from the services-list row so it renders pre-mount too. */
function pinStatus(service: Service): { labelKey: string; tone: keyof typeof TONE_CLASSNAMES; titleKey: string } {
  const hasCoords = service.latitude != null && service.longitude != null && service.latitude !== "" && service.longitude !== "";
  const isExact = hasCoords && service.locationPrecision === "exact";
  if (isExact) {
    return { labelKey: "pin.exact", tone: "ok", titleKey: "pin.exactTitle" };
  }
  if (hasCoords) {
    return { labelKey: "pin.approximate", tone: "warn", titleKey: "pin.approximateTitle" };
  }
  return { labelKey: "pin.none", tone: "bad", titleKey: "pin.noneTitle" };
}

/** Pin chip: clicking it opens the service's Edit (the existing edit navigation) — the pin
 *  picker lives in the form, not here. D2 method-aware: a non-place-anchored service (PDF,
 *  call, voice notes, messaging…) gets a neutral delivery-method chip instead — its location
 *  status is not a defect and must not render as one. Unclassifiable rows (no deliveryMethod,
 *  not a property) keep the historical pin chip, mirroring the server's applicability rule. */
function PinChip({ service, isBundle }: { service: Service; isBundle: boolean }) {
  const { t } = useTranslation("catalog");
  const shape = { deliveryMethod: service.deliveryMethod, productShape: service.productShape };
  const editHref = isBundle ? "/provider/workstation" : `/provider/services/${service.id}/edit`;

  if (isClassifiable(shape) && !isPlaceAnchored(shape)) {
    const method = service.deliveryMethod ?? "";
    const label = (DELIVERY_CHIP_KEYS as readonly string[]).includes(method)
      ? t(`delivery.${method}`)
      : t("delivery.fallback");
    return (
      <Badge
        variant="outline"
        title={t("pin.remoteTitle")}
        className={`text-[10px] ${TONE_CLASSNAMES.neutral}`}
        data-testid={`chip-pin-${service.id}`}
      >
        {label}
      </Badge>
    );
  }

  const { labelKey, tone, titleKey } = pinStatus(service);
  return (
    <Link href={editHref}>
      <Badge
        variant="outline"
        title={t(titleKey)}
        className={`text-[10px] cursor-pointer ${TONE_CLASSNAMES[tone]}`}
        data-testid={`chip-pin-${service.id}`}
      >
        {t(labelKey)}
      </Badge>
    </Link>
  );
}

/** "Health N/M" meter + failing-check names. Renders NOTHING when the health endpoint hasn't
 *  returned data for this service (endpoint unavailable pre-mount, or the service is missing
 *  from the response) — honest absence per §13, never a skeleton or a guess. */
function HealthRow({ health }: { health: ServiceHealth | undefined }) {
  const { t } = useTranslation("catalog");
  if (!health) return null;
  const { passed, total } = health.score;
  if (total <= 0) return null;
  const allPassing = passed === total;
  const failingLabels = health.checks
    .filter((c) => !c.ok)
    .map((c) =>
      (HEALTH_CHECK_KEYS as readonly string[]).includes(c.key) ? t(`health.checks.${c.key}`) : c.key,
    );
  // D2: method-omitted checks render as a muted "n/a" note (reason on hover) — visibly not
  // counted, never presented as failures.
  const omitted = health.omitted ?? [];

  return (
    <div className="mt-3 pt-3 border-t border-console-light" data-testid={`health-row-${health.serviceId}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-console-darkest">
          {t("health.meter", { passed, total })}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-console-light overflow-hidden">
          <div
            className={`h-full rounded-full ${allPassing ? "bg-green-500" : "bg-amber-500"}`}
            style={{ width: `${Math.round((passed / total) * 100)}%` }}
          />
        </div>
        {allPassing ? (
          <Badge className={`text-[10px] ${TONE_CLASSNAMES.ok}`} variant="outline">
            <CheckCircle2 className="w-3 h-3 mr-1" /> {t("health.ready")}
          </Badge>
        ) : (
          <span className="text-xs text-console-mid">{failingLabels.join(" · ")}</span>
        )}
        {omitted.length > 0 && (
          <span
            className="text-[11px] italic text-console-mid/60"
            title={omitted.map((o) => o.reason).join("; ")}
            data-testid={`health-omitted-${health.serviceId}`}
          >
            {t("health.naPrefix")}:{" "}
            {omitted
              .map((o) =>
                (OMITTED_CHECK_KEYS as readonly string[]).includes(o.key)
                  ? t(`health.omitted.${o.key}`)
                  : o.key,
              )
              .join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Manage ⇄ Preview toggle (Catalog+Distribute ruling 74, lane C2) ─────────────────────────
//
// Preview renders each listing through C1's SHARED OfferingCard — the EXACT traveler card the
// public /p/:handle storefront draws — so "what you see = what users see" by construction. The
// data-prep below (delivery-method chip, place-anchored city chip, price-unit label, rating slot,
// non-away CTA) mirrors storefront.tsx's own mapping verbatim; the card itself is reused, never
// re-implemented. Hover-Edit (ruling 74 resolution B) is layered as an OVERLAY sibling of the
// card link (a named `group/edit` so it never fights the card's own `group` hover) — the
// OfferingCard's storefront output stays byte-identical (C1 is not regressed).

const PREVIEW_DELIVERY_LABELS: Record<string, string> = {
  pdf: "PDF guide",
  video: "Video call",
  call: "Phone call",
  in_person: "In-person",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
  hybrid: "Hybrid",
};

function previewPriceUnitLabel(priceType?: string | null, pricingUnit?: string | null): string | null {
  if (pricingUnit === "per_night") return "per night";
  if (priceType === "per_person") return "per person";
  if (priceType === "hourly") return "per hour";
  if (priceType === "per_event") return "per event";
  return null;
}

/** Storefront rating line — "New" pill when there are no reviews (never a fabricated score),
 *  else star + weighted average + review count. Mirrors storefront.tsx RatingLine. */
function PreviewRatingLine({ rating, count }: { rating?: string | number | null; count?: number | null }) {
  if (!count || count === 0 || rating == null) {
    return <Badge variant="outline" className="text-[11px] w-fit">New</Badge>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
      {Number(rating).toFixed(1)}
      <span>· {count} review{count === 1 ? "" : "s"}</span>
    </span>
  );
}

// C3 (ruling 74/75): the per-listing "Card shows" control on the Manage card. Two prefs — Show
// price (on/off) and Booking (Instant / Request / Hidden) — that drive the shared traveler
// OfferingCard in Preview AND on the public storefront. Each change PATCHes exactly its one field.
// `bookingMode` arrives concrete from the owner read (resolved with the storefront's own derivation),
// so an unset listing shows the account default pre-selected; the moment the provider picks a segment
// it becomes an explicit per-listing choice. Not a §14/§18/§19 money field.
const BOOKING_MODE_OPTIONS: Array<{ value: "instant" | "request" | "hidden"; label: string }> = [
  { value: "instant", label: "Instant" },
  { value: "request", label: "Request" },
  { value: "hidden", label: "Hidden" },
];

function CardShowsControl({
  service,
  onPatch,
  disabled,
}: {
  service: Service;
  onPatch: (patch: { showPrice?: boolean; bookingMode?: "instant" | "request" | "hidden" }) => void;
  disabled?: boolean;
}) {
  const showPrice = service.showPrice ?? true;
  const bookingMode = service.bookingMode ?? "instant";
  return (
    <div
      className="mt-3 pt-3 border-t border-console-light flex flex-wrap items-center gap-x-4 gap-y-2"
      data-testid={`cardshows-${service.id}`}
    >
      <span className="text-[10px] font-medium text-console-mid uppercase tracking-wide">Card shows</span>
      <div className="flex items-center gap-2">
        <Switch
          checked={showPrice}
          onCheckedChange={(checked) => onPatch({ showPrice: checked })}
          disabled={disabled}
          data-testid={`switch-cardshows-price-${service.id}`}
        />
        <span className="text-xs text-console-mid">Show price</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-console-mid">Booking</span>
        <div className="inline-flex rounded-md border border-console-light overflow-hidden" role="group">
          {BOOKING_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPatch({ bookingMode: opt.value })}
              disabled={disabled}
              aria-pressed={bookingMode === opt.value}
              className={
                "px-2 py-1 text-xs font-medium transition-colors " +
                (bookingMode === opt.value
                  ? "bg-console-dark text-white"
                  : "bg-white text-console-mid hover:bg-console-light/40")
              }
              data-testid={`button-cardshows-booking-${service.id}-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogPreviewCard({ service }: { service: Service }) {
  const { t: tCommon } = useTranslation("common");
  const isBundle = service.productShape === "bundle";
  const editHref = isBundle ? "/provider/workstation" : `/provider/services/${service.id}/edit`;

  const chips = service.deliveryMethod && PREVIEW_DELIVERY_LABELS[service.deliveryMethod]
    ? [PREVIEW_DELIVERY_LABELS[service.deliveryMethod]]
    : [];
  // D5: place-anchored listings get a city-level text chip (row's own city field; nothing mapped/derived, §13).
  if (
    isPlaceAnchored({ deliveryMethod: service.deliveryMethod, productShape: service.productShape }) &&
    service.city?.trim()
  ) {
    chips.push(`📍 ${service.city.trim()}`);
  }

  const rawPrice = service.price;
  const hasPrice = rawPrice != null && rawPrice !== "";
  const price = hasPrice ? `$${Number(rawPrice).toFixed(0)}` : "Custom quote";
  const unit = hasPrice ? previewPriceUnitLabel(service.priceType, service.pricingUnit) : null;
  const cta = service.pricingUnit === "per_night" ? "Check dates →" : "View & book →";

  return (
    <div className="relative group/edit" data-testid={`preview-card-${service.id}`}>
      <OfferingCard
        href={`/services/${service.id}`}
        testId={`storefront-service-${service.id}`}
        image={service.serviceImage ?? null}
        title={service.serviceName || service.name || "Untitled service"}
        chips={chips}
        ratingSlot={<PreviewRatingLine rating={service.averageRating} count={service.reviewCount} />}
        price={price}
        unit={unit}
        cta={cta}
        showPrice={service.showPrice}
        bookingMode={service.bookingMode}
      />
      {/* Hover-only Edit deep-link (ruling 74 res. B) — a sibling of the card's own <Link>, not a
          nested anchor; z-10 keeps it clickable above the full-card link. */}
      <Link
        href={editHref}
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-md border border-console-light bg-white/95 px-2 py-1 text-xs font-medium text-console-dark shadow-sm opacity-0 transition-opacity group-hover/edit:opacity-100 focus:opacity-100"
        data-testid={`button-preview-edit-${service.id}`}
      >
        <Edit className="w-3.5 h-3.5" /> {tCommon("actions.edit")}
      </Link>
    </div>
  );
}

export default function ProviderServices() {
  const { t } = useTranslation("catalog");
  const { t: tCommon } = useTranslation("common");
  // NOTE the filter state stays the ENGLISH category name / the literal "All": it is compared
  // against live category names coming off the API (content, not chrome — ruling 60's system B)
  // and is also the source of the `button-category-filter-*` testids. Only the "All" pill's
  // DISPLAY is translated.
  const [selectedCategory, setSelectedCategory] = useState("All");
  // Ruling 22(b): Catalog is the map's home — this toggle swaps the card grid for the map
  // authoring surface (CatalogMapView); everything below the content block is untouched.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  // C2 (ruling 74): Manage ⇄ Preview is a SEPARATE axis from List/Map — it governs the LIST
  // layout's cards only (Manage = today's operational cards; Preview = the shared traveler card).
  // Map is neither Manage nor Preview, so the Manage/Preview control is shown only in list view.
  const [catalogMode, setCatalogMode] = useState<"manage" | "preview">("manage");
  const [shareTarget, setShareTarget] = useState<Service | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dbCategories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });

  // Listing Health score — ONE query, keyed on the services list. 404s (200-HTML pre-mount, per
  // CLAUDE.md's dead-route note) land the query in an error state with no data; HealthRow
  // renders nothing per service in that case (§13 honest absence), so this is safe to mount
  // unconditionally ahead of the health router's own mount.
  const { data: healthData } = useQuery<HealthResponse>({
    queryKey: ["/api/provider/services/health"],
    enabled: !!services && services.length > 0,
  });
  // `Map` the constructor is shadowed on this page by the lucide-react `Map` icon import — use
  // globalThis.Map explicitly rather than renaming the icon import everywhere it's used.
  const healthByServiceId = new globalThis.Map<string, ServiceHealth>(
    (healthData?.services ?? []).map((h) => [h.serviceId, h]),
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service updated" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  // C3 (ruling 74/75): the per-listing "Card shows" control PATCHes exactly ONE display pref
  // (showPrice or bookingMode) — never the whole row, so it can't disturb any other listing field.
  // The server parses these off insertProviderServiceSchema.partial() (owner-gated as today); they
  // are display prefs, not §14/§18/§19 money fields, so they persist unstripped.
  const displayOptionsMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { showPrice?: boolean; bookingMode?: "instant" | "request" | "hidden" } }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/provider/services/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/provider/services/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service duplicated", description: "The copy is a draft awaiting review — edit and submit it." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const totalServices = services?.length ?? 0;

  // Build category name lookup from DB
  const categoryNameById = dbCategories.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  // Derive unique filter labels from live services
  const usedCategoryIds = Array.from(new Set((services || []).map(s => s.categoryId).filter(Boolean))) as string[];
  const filterLabels = ["All", ...usedCategoryIds.map(id => categoryNameById[id] || id)];

  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => {
          const name = s.categoryId ? categoryNameById[s.categoryId] : undefined;
          return name === selectedCategory;
        });

  // C2 Preview honesty filter (§13): a listing appears in Preview ONLY if it would appear on the
  // public /p/:handle storefront — the SAME predicate storefront.routes.ts loadStorefront applies
  // to lane 1 (approvalStatus='approved' AND status='active'; owner-scoping is implicit here since
  // the query is already the session owner's services). Mirrored, never loosened: a paused/draft/
  // unapproved listing is visible in Manage but drops out of Preview, exactly as travelers see.
  const previewServices = filteredServices.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  );

  const activeCount = (services || []).filter(s => s.status === "active").length;
  const isFirstTimeEmpty = !isLoading && totalServices === 0;
  const isFilterEmpty = !isLoading && totalServices > 0 && filteredServices.length === 0;

  // C9: the per-service share kit rides the shared OfferingShareDetail; images render only
  // for approved+active services — the same gate share-images.routes.ts enforces (a
  // submitted/paused listing's share-image 404s, so surfacing it would be a dead preview).
  const shareOffering: OfferingShareOption | null = shareTarget
    ? {
        id: shareTarget.id,
        lane: "service",
        laneLabel: "Service",
        name: shareTarget.serviceName || shareTarget.name || "Untitled service",
        city: null,
        price:
          shareTarget.price != null && shareTarget.price !== ""
            ? `$${Number(shareTarget.price).toFixed(0)}`
            : null,
        publicHref: `/services/${shareTarget.id}`,
      }
    : null;

  return (
    <ProviderLayout title="Catalog">
      <div className="p-6 space-y-6">
        {/* C9: the /p/:handle storefront management header (the expert catalog C2 block). */}
        <ProviderStorefrontHeader />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-console-darkest" data-testid="text-services-title">
              {t("header.title")}
            </h2>
            {isLoading ? (
              <Skeleton className="h-4 w-40 mt-1" />
            ) : (
              <p className="text-console-mid text-sm">
                {t("header.countSummary", { active: activeCount, total: totalServices })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* C2 (ruling 74): Manage ⇄ Preview segmented control — a separate axis from List/Map,
                shown only in list view (the map is neither Manage nor Preview). */}
            {viewMode === "list" && (
              <div className="flex rounded-lg border border-console-light overflow-hidden">
                <Button
                  variant={catalogMode === "manage" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setCatalogMode("manage")}
                  data-testid="button-mode-manage"
                >
                  Manage
                </Button>
                <Button
                  variant={catalogMode === "preview" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setCatalogMode("preview")}
                  data-testid="button-mode-preview"
                >
                  Preview
                </Button>
              </div>
            )}
            <div className="flex rounded-lg border border-console-light overflow-hidden">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                {t("header.viewList")}
              </Button>
              <Button
                variant={viewMode === "map" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("map")}
                data-testid="button-view-map"
              >
                {t("header.viewMap")}
              </Button>
            </div>
            <Link href="/provider/services/new">
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-service">
                <Plus className="w-4 h-4 mr-2" /> {t("header.addService")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Category Filter — only show when there are services (list view only) */}
        {viewMode === "list" && totalServices > 0 && filterLabels.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {filterLabels.map((label) => (
              <Button
                key={label}
                variant={selectedCategory === label ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(label)}
                data-testid={`button-category-filter-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >
                {label === "All" ? t("filter.all") : label}
              </Button>
            ))}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : isFirstTimeEmpty ? (
          /* First-time empty state: show all categories */
          <div className="space-y-6">
            <div className="text-center py-4">
              <h3 className="text-lg font-semibold text-console-darkest mb-1">{t("empty.title")}</h3>
              <p className="text-console-mid text-sm">{t("empty.body")}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {inspirationCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.slug}
                    onClick={() => navigate(`/provider/services/new?category=${encodeURIComponent(card.slug)}`)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-console-light bg-white hover:border-primary hover:shadow-sm transition-all text-center group"
                    data-testid={`card-inspiration-${card.slug.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-console-dark leading-tight">{card.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-center">
              <Link href="/provider/services/new">
                <Button variant="outline" data-testid="button-add-first-service">
                  <Plus className="w-4 h-4 mr-2" /> {t("empty.fromScratch")}
                </Button>
              </Link>
            </div>
          </div>
        ) : viewMode === "map" ? (
          /* Ruling 22(b): the map authoring surface — selector rail, canvas, pin + route cards */
          <CatalogMapView services={services ?? []} />
        ) : isFilterEmpty ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-console-mid font-medium">{t("filter.emptyTitle")}</p>
              <p className="text-console-mid text-sm mt-1">{t("filter.emptyBody")}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSelectedCategory("All")}
                data-testid="button-clear-filter"
              >
                {t("filter.clear")}
              </Button>
            </CardContent>
          </Card>
        ) : catalogMode === "preview" ? (
          /* C2 Preview: the shared traveler card, honest storefront visibility (approved+active). */
          previewServices.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center" data-testid="preview-empty">
                <p className="text-console-mid font-medium">Nothing is live to preview yet</p>
                <p className="text-console-mid text-sm mt-1">
                  Preview shows your listings exactly as travelers see them on your storefront — only
                  approved, active ones appear. Get a listing approved and switched on to see it here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="catalog-preview-grid"
            >
              {previewServices.map((service) => (
                <CatalogPreviewCard key={service.id} service={service} />
              ))}
            </div>
          )
        ) : (
          /* Service cards */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredServices.map((service) => {
              // The listing's own NAME is provider content (ruling 60 system B) and is never
              // translated; only the placeholder shown when there is no name is chrome.
              const displayName = service.serviceName || service.name || t("card.untitled");
              const rawPrice = service.price ?? service.basePrice;
              const priceDisplay = rawPrice == null || rawPrice === ""
                ? "—"
                : service.priceType === "hourly"
                ? `$${rawPrice} / hr`
                : service.priceType === "package_tiers"
                ? `from $${rawPrice}`
                : service.priceType === "per_event"
                ? `$${rawPrice} / event`
                : `$${rawPrice}`;
              const categoryName = service.categoryId ? (categoryNameById[service.categoryId] || service.serviceType || "") : (service.serviceType || "");
              const isActive = service.status === "active";
              // PB: bundles are edited in the Workstation's bundle builder (components +
              // price live there), not the ServiceForm.
              const isBundle = service.productShape === "bundle";

              return (
                <Card
                  key={service.id}
                  className={!isActive ? "opacity-60" : ""}
                  data-testid={`card-service-${service.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <ServiceThumb service={service} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-console-darkest truncate">{displayName}</h3>
                          {/* L10a: the real approval + active/paused state is the primary badge on
                              every card (same StatusBadge vocabulary as the Workstation list) —
                              previously only a category chip showed here, so a draft/submitted/
                              rejected listing looked identical to an approved one. */}
                          {service.approvalStatus && (
                            <StatusBadge status={service.approvalStatus} />
                          )}
                          <StatusBadge status={isActive ? "active" : "paused"} />
                          {isBundle && (
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-bundle-${service.id}`}>
                              {t("card.bundle")}
                            </Badge>
                          )}
                          {service.isFeatured && (
                            <Badge className="bg-primary text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>
                              {t("card.featured")}
                            </Badge>
                          )}
                          {categoryName && (
                            <Badge variant="outline" className="text-[10px]">{categoryName}</Badge>
                          )}
                        </div>

                        {service.description && (
                          <p className="text-sm text-console-mid mt-1 line-clamp-2">{service.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                          <span className="flex items-center gap-1 font-semibold text-green-600" data-testid={`text-price-${service.id}`}>
                            <DollarSign className="w-4 h-4" /> {priceDisplay}
                          </span>
                          <PinChip service={service} isBundle={isBundle} />
                          {service.deliveryTimeframe && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Clock className="w-4 h-4" /> {service.deliveryTimeframe}
                            </span>
                          )}
                          {service.maxConcurrentBookings && service.maxConcurrentBookings > 1 && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Users className="w-4 h-4" />{" "}
                              {t("card.upTo", { count: service.maxConcurrentBookings })}
                            </span>
                          )}
                          {service.meetingPoint && (
                            <span className="flex items-center gap-1 text-console-mid truncate max-w-[160px]">
                              <MapPin className="w-4 h-4 flex-shrink-0" /> {service.meetingPoint}
                            </span>
                          )}
                          {service.pickupAvailable && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Truck className="w-4 h-4" /> {t("card.pickupAvailable")}
                            </span>
                          )}
                        </div>

                        {/* Affinity tag chips */}
                        {Array.isArray(service.contentAffinityTags) && service.contentAffinityTags.length > 0 && (
                          <div className="mt-3" data-testid={`affinity-tags-${service.id}`}>
                            <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide mb-1.5">
                              {t("card.affinityHeading")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {service.contentAffinityTags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1.5 bg-primary/8 text-primary border border-primary/20"
                                  data-testid={`chip-affinity-${service.id}-${tag}`}
                                >
                                  {AFFINITY_TAG_LABELS[tag] ?? tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: service.id, status: checked ? "active" : "paused" })
                          }
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-active-${service.id}`}
                        />
                        <span className="text-xs text-console-mid">
                          {isActive ? tCommon("state.active") : tCommon("state.paused")}
                        </span>
                      </div>
                    </div>

                    {/* C3: per-listing "Card shows" control (Show price + Booking mode). Bundles
                        are edited in the Workstation, but their storefront card honors the same two
                        prefs, so the control belongs on every listing card. */}
                    <CardShowsControl
                      service={service}
                      onPatch={(patch) => displayOptionsMutation.mutate({ id: service.id, patch })}
                      disabled={displayOptionsMutation.isPending}
                    />

                    <div className="flex gap-2 mt-4 pt-3 border-t border-console-light">
                      <Link href={isBundle ? "/provider/workstation" : `/provider/services/${service.id}/edit`}>
                        <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                          <Edit className="w-4 h-4 mr-1" /> {tCommon("actions.edit")}
                        </Button>
                      </Link>
                      {/* PB: no Duplicate for bundles — duplicateService copies the
                          provider_services row only, not bundle_components, so the copy
                          would be a component-less bundle (filed server follow-up). */}
                      {!isBundle && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => duplicateMutation.mutate(service.id)}
                          disabled={duplicateMutation.isPending}
                          data-testid={`button-duplicate-${service.id}`}
                        >
                          <Copy className="w-4 h-4 mr-1" /> {tCommon("actions.duplicate")}
                        </Button>
                      )}
                      {/* C9 Share & Promote absorption: share kit only for approved+active
                          services — the F2 gate the public page + share image enforce. */}
                      {service.approvalStatus === "approved" && isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShareTarget(service)}
                          data-testid={`button-share-${service.id}`}
                        >
                          <Share2 className="w-4 h-4 mr-1" /> {tCommon("actions.share")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(service.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${service.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> {tCommon("actions.delete")}
                      </Button>
                    </div>

                    <HealthRow health={healthByServiceId.get(service.id)} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* C9: availability editing's ratified Catalog home (see header comment). */}
        <AvailabilitySection />

        {/* C9: Share & Promote's opportunity-scoped creation half — real rows only (§13). */}
        <section data-testid="section-catalog-promote">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            {t("sections.promote")}
          </h2>
          <PostingOpportunitiesCard />
        </section>

        {/* C9: the per-service share kit dialog (shared share-tools components — feed/story
            images + caption + §16-safe actions; identical server calls to the retired
            /provider/share-promote page). */}
        <Dialog open={!!shareOffering} onOpenChange={(open) => !open && setShareTarget(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-share-kit">
            <DialogHeader>
              <DialogTitle>{shareOffering?.name ?? t("shareDialog.fallbackTitle")}</DialogTitle>
            </DialogHeader>
            {shareOffering && <OfferingShareDetail offering={shareOffering} showImages />}
          </DialogContent>
        </Dialog>
      </div>
    </ProviderLayout>
  );
}
