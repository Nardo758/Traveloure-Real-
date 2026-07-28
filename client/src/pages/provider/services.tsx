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
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  contentAffinityTags?: string[];
  // PB (§17 Product Builder): a bundle IS a provider_services row (product_shape='bundle',
  // migration 151) — it appears in this list like any listing; NULL = single service.
  productShape?: string | null;
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

  return (
    <section data-testid="section-catalog-availability">
      <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
        Availability
      </h2>
      <Card className="border border-console-light">
        <CardContent className="p-4 space-y-4">
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
                <EmptyState
                  icon={CalendarClock}
                  title="No availability published yet"
                  body="Travelers can't pick a time until you add slots."
                  testId="empty-catalog-no-slots"
                />
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
                className="flex items-end gap-2 flex-wrap pt-2 border-t border-console-light"
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
    </section>
  );
}

export default function ProviderServices() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [shareTarget, setShareTarget] = useState<Service | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dbCategories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });

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
  const usedCategoryIds = [...new Set((services || []).map(s => s.categoryId).filter(Boolean))] as string[];
  const filterLabels = ["All", ...usedCategoryIds.map(id => categoryNameById[id] || id)];

  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => {
          const name = s.categoryId ? categoryNameById[s.categoryId] : undefined;
          return name === selectedCategory;
        });

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
              Your Services
            </h2>
            {isLoading ? (
              <Skeleton className="h-4 w-40 mt-1" />
            ) : (
              <p className="text-console-mid text-sm">{activeCount} of {totalServices} services active</p>
            )}
          </div>
          <Link href="/provider/services/new">
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-service">
              <Plus className="w-4 h-4 mr-2" /> Add New Service
            </Button>
          </Link>
        </div>

        {/* Category Filter — only show when there are services */}
        {totalServices > 0 && filterLabels.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {filterLabels.map((label) => (
              <Button
                key={label}
                variant={selectedCategory === label ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(label)}
                data-testid={`button-category-filter-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >
                {label}
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
              <h3 className="text-lg font-semibold text-console-darkest mb-1">What will you offer?</h3>
              <p className="text-console-mid text-sm">
                Pick a category below to get started, or build your own service from scratch.
              </p>
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
                  <Plus className="w-4 h-4 mr-2" /> Start from scratch
                </Button>
              </Link>
            </div>
          </div>
        ) : isFilterEmpty ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-console-mid font-medium">No services in this category.</p>
              <p className="text-console-mid text-sm mt-1">Try a different filter or add a new service.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSelectedCategory("All")}
                data-testid="button-clear-filter"
              >
                Clear filter
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Service cards */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredServices.map((service) => {
              const displayName = service.serviceName || service.name || "Untitled Service";
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-console-darkest truncate">{displayName}</h3>
                          {isBundle && (
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-bundle-${service.id}`}>
                              Bundle
                            </Badge>
                          )}
                          {service.isFeatured && (
                            <Badge className="bg-primary text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>
                              Featured
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
                          {service.deliveryTimeframe && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Clock className="w-4 h-4" /> {service.deliveryTimeframe}
                            </span>
                          )}
                          {service.maxConcurrentBookings && service.maxConcurrentBookings > 1 && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Users className="w-4 h-4" /> Up to {service.maxConcurrentBookings}
                            </span>
                          )}
                          {service.meetingPoint && (
                            <span className="flex items-center gap-1 text-console-mid truncate max-w-[160px]">
                              <MapPin className="w-4 h-4 flex-shrink-0" /> {service.meetingPoint}
                            </span>
                          )}
                          {service.pickupAvailable && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Truck className="w-4 h-4" /> Pickup available
                            </span>
                          )}
                        </div>

                        {/* Affinity tag chips */}
                        {Array.isArray(service.contentAffinityTags) && service.contentAffinityTags.length > 0 && (
                          <div className="mt-3" data-testid={`affinity-tags-${service.id}`}>
                            <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide mb-1.5">
                              Surfaces when travellers view:
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
                          {isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-console-light">
                      <Link href={isBundle ? "/provider/workstation" : `/provider/services/${service.id}/edit`}>
                        <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                          <Edit className="w-4 h-4 mr-1" /> Edit
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
                          <Copy className="w-4 h-4 mr-1" /> Duplicate
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
                          <Share2 className="w-4 h-4 mr-1" /> Share
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
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
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
            Promote
          </h2>
          <PostingOpportunitiesCard />
        </section>

        {/* C9: the per-service share kit dialog (shared share-tools components — feed/story
            images + caption + §16-safe actions; identical server calls to the retired
            /provider/share-promote page). */}
        <Dialog open={!!shareOffering} onOpenChange={(open) => !open && setShareTarget(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-share-kit">
            <DialogHeader>
              <DialogTitle>{shareOffering?.name ?? "Share"}</DialogTitle>
            </DialogHeader>
            {shareOffering && <OfferingShareDetail offering={shareOffering} showImages />}
          </DialogContent>
        </Dialog>
      </div>
    </ProviderLayout>
  );
}
