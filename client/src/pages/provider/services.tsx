/**
 * Provider Catalog — Console IA C9 (§17 17→9 collapse, the provider nine-module stamp).
 *
 * CATALOG REBUILD (decision-maker directive, Aug 2026): "assume we have to build it from
 * scratch for the catalog page." This is a from-scratch PRESENTATION rebuild of the Manage
 * (list) surface, transcribed directly from the ratified design mock
 * (docs/design/service-creation-mock.html, `#panel-catalog`) — its own markup/CSS is the
 * source of truth for tokens (--ink #1A1A18, --muted #7A7A72, --hair #E8E8E2, --ground
 * #FAFAF8, --paper #fff, --accent #35605A, --radius 7px), the `.seg` segmented controls,
 * `.pill`/`.pill.live`/`.pill.draft` chips, and the `.listing` row anatomy (74×56 `.thumb`,
 * `.lname`, `.lmeta`, `.lright` health+actions). These are PAGE-SCOPED Tailwind arbitrary
 * values — the global theme, other pages and shared UI component defaults are untouched.
 *
 * The DATA layer (queries, mutations, testids for the specs listed below) is reused
 * verbatim from the pre-rebuild page — only the presentation was rebuilt. Preserved
 * verbatim: `card-service-<id>`, `switch-active-<id>`, `button-edit-<id>`,
 * `button-mode-manage`/`button-mode-preview`, `cardshows-<id>`,
 * `switch-cardshows-price-<id>`, `button-cardshows-booking-<id>-<value>`,
 * `catalog-preview-grid`, `preview-card-<id>`, `button-preview-edit-<id>`,
 * `button-distribute-<id>`, `button-view-list`/`button-view-map`, `text-services-title`
 * (service-display-options.spec.ts, catalog-preview-toggle.spec.ts,
 * distribute-channels.spec.ts, catalog-map-located.spec.ts all key on these).
 *
 * This page is the provider console's Catalog seat ("what I sell") — read / manage / triage
 * only. It carries NO outward-facing distribution chrome (S6, ruling-74-disposition-6
 * clarification below):
 *   - AVAILABILITY: the ratified "availability editing belongs to Catalog" placement — a
 *     compact per-listing summary (mock: "Mon 09:00 · 2 left" chips) whose "Edit slots"
 *     opens the REAL S7 editor (`ProviderAvailabilityManager`) in a drawer, preselected to
 *     the listing. The `?availability=<id>` deep-link still lands there preselected. The
 *     mock's toolbar shows only List | Map — the standalone third "Availability" toggle from
 *     the pre-rebuild page is dropped; its editor is one click away via "Edit slots" instead.
 *   - LISTING HEALTH: the per-card health strip (photo/pin/description completeness) — a
 *     triage signal, now a compact bar + popover detail rather than an always-expanded block.
 *
 * S6 (ruling-74-disposition-6 clarification, "Distribute is the ONE home for outward-facing
 * distribution surfaces"): the storefront header, the per-service share-kit dialog and the
 * Promote (posting-opportunities) block all live on /provider/distribute. `ProviderStorefrontHeader`
 * stays `export`ed from this file (Distribute's storefront channel imports it) but is not
 * mounted here. Each row keeps exactly one outward-facing pointer — the mock's own copy,
 * "Promote this →" — which lands on `/provider/distribute` with that listing preselected
 * (same destination/testid as the prior "Distribute this →" button; only the label text
 * changed, to match the mock verbatim).
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { EmptyState } from "@/components/backoffice/primitives";
// S6: StorefrontShareTools + ensureShortLink stay imported — ProviderStorefrontHeader (below)
// still composes them, it is just no longer MOUNTED on this page (moved to Distribute).
import { StorefrontShareTools, ensureShortLink } from "@/components/backoffice/share-tools";
import { CatalogMapView } from "@/components/provider/catalog-map-view";
import { ProviderAvailabilityManager } from "@/components/logistics/provider-availability-manager";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  DollarSign,
  Clock,
  Users,
  BedDouble,
  MapPin,
  Truck,
  ExternalLink,
  ChevronDown,
  ImageOff,
  CheckCircle2,
  Star,
  MoreHorizontal,
  Search,
  Eye,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
// FP-3: property + property_room rows are edited on the Workstation property surface, never in
// the ServiceForm questionnaire. ONE home for that routing decision (ServiceForm's back-door
// guard imports the same module).
import { listingEditHref, isPropertyRoom } from "@/lib/property-editor-link";
import { describeCatalogRefusal, type CatalogAction } from "@/lib/catalog-error-copy";
import {
  catalogStatusBucket,
  catalogPillDisplay,
  matchesCatalogSearch,
  deriveAvailabilityChips,
  type CatalogStatusBucket,
} from "@/lib/catalog-listing-presentation";
import {
  deriveLocationPinChip,
  deriveBookingCta,
  derivePreviewPrice,
  derivePreviewRating,
} from "@/lib/catalog-preview-presentation";

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
  // Same for a property and each of its room types (product_shape='property'/'property_room',
  // migration 153) — FP-3 groups the rooms under their parent card rather than letting them
  // render as ordinary standalone listings.
  productShape?: string | null;
  // FP-3: set on a property_room row — the provider_services.id of its parent property. Already
  // on the wire (getProviderServices is an unfiltered db.select()); this only names it.
  parentServiceId?: string | null;
  // Listing Health (below): these ride the EXISTING /api/provider/services row — storage.
  // getProviderServices does an unfiltered db.select(), so photo + pin fields are already on
  // the wire. Sourcing the thumbnail/pin chip from here (not the new health endpoint) is what
  // lets both render pre-mount.
  serviceImage?: string | null;
  galleryImages?: string[] | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationPrecision?: string | null;
  // D2 method-aware fundamentals: rides the same unfiltered row; drives the listing meta line.
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

// S5 (ruling 74 disp. 1): the category inspiration tiles MOVED to the Workstation launcher
// (client/src/pages/provider/workstation.tsx) — this page's empty state now just points at
// that screen instead of re-deriving the same 30-category list here.

// ─── Storefront header (C9 — the expert catalog C2 block, provider lane only) ───────────
//
// Handle comes from the session-backed cached auth user (§14: never client-supplied); the
// Live count is derived from the SAME owner-console query the offerings list already loads
// (react-query dedups the key — no new endpoint), filtered by the public read-gate
// (storefront.routes.ts serves approved+active services; 404 at zero — that IS "not live").
// §13: no chip renders until the real count is loaded.
// Exported (D1, ruling 74/76) so the Distribute page's Storefront channel mounts the SAME
// component — a second mount, not a move (per ruling 74 the storefront tools STAY on Catalog).
export function ProviderStorefrontHeader() {
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

// ─── Availability (mock: compact card, "Mon 09:00 · 2 left" chips + Edit slots) ──────────
//
// vendor_availability_slots is the canonical dated-slot model; the /api/me/… CRUD resolves
// ownership against provider_services.userId server-side (role-agnostic, §14). "Edit slots"
// opens the REAL S7 editor (ProviderAvailabilityManager) in a drawer — this card is a summary,
// not a second editor.

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

function AvailabilityCard({
  services,
  servicesLoading,
  onOpenEditor,
  initialServiceId,
}: {
  services: Service[];
  servicesLoading: boolean;
  onOpenEditor: (serviceId: string) => void;
  initialServiceId?: string | null;
}) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || servicesLoading) return;
    if (initialServiceId && services.some((s) => s.id === initialServiceId)) {
      setSelectedServiceId(initialServiceId);
    }
    applied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesLoading, services.length]);

  const activeServiceId = selectedServiceId || services[0]?.id || "";
  const { data: slots, isLoading: slotsLoading } = useQuery<AvailabilitySlot[]>({
    queryKey: [`/api/me/services/${activeServiceId}/slots`],
    enabled: !!activeServiceId,
  });
  const chips = useMemo(() => deriveAvailabilityChips(slots ?? []), [slots]);

  return (
    <div
      className="bg-[#FFFFFF] border border-[#E8E8E2] rounded-[7px]"
      data-testid="section-catalog-availability"
    >
      <div className="px-[22px] py-[13px] border-b border-[#E8E8E2] flex items-center gap-2.5 flex-wrap">
        <h3 className="text-[15px] font-semibold text-[#1A1A18]">Availability</h3>
        <span className="text-[12px] text-[#7A7A72]">
          Slot editing stays here — this is where per-listing curation lives
        </span>
      </div>
      <div className="px-[20px] py-[16px] flex items-center gap-2.5 flex-wrap">
        {servicesLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : services.length === 0 ? (
          <EmptyState
            icon={ChevronDown}
            title="No services yet"
            body="Create a service first, then publish dates travelers can book."
            testId="empty-catalog-no-services"
          />
        ) : (
          <>
            {services.length > 1 && (
              <Select value={activeServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="h-8 w-56 text-[12.5px] border-[#E8E8E2] rounded-[6px]" data-testid="select-catalog-service">
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.serviceName ?? s.name ?? "Untitled service"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {slotsLoading ? (
              <Skeleton className="h-6 w-64" />
            ) : chips.length === 0 ? (
              <span className="text-[12.5px] text-[#7A7A72]" data-testid="empty-catalog-no-slots">
                No availability published yet
              </span>
            ) : (
              chips.map((chip, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-block text-[11.5px] px-[9px] py-[2px] rounded-full border",
                    chip.blocked || chip.full
                      ? "border-[#E8E8E2] bg-[#FAFAF8] text-[#7A7A72]"
                      : "border-[#BFD5D0] bg-[#EDF2F1] text-[#35605A]",
                  )}
                  data-testid={`availability-chip-${i}`}
                >
                  {chip.label}
                </span>
              ))
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 rounded-[6px] border-[#E8E8E2] text-[12.5px] text-[#1A1A18] hover:bg-[#FAFAF8]"
              onClick={() => activeServiceId && onOpenEditor(activeServiceId)}
              disabled={!activeServiceId}
              data-testid="button-edit-slots"
            >
              Edit slots
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Listing Health (ratified "Listing Health" layer, CLAUDE.md §13/§16/§18) ─────────────
//
// Audit finding: ~97% of provider listings ride the approximate neighborhood-centroid
// location backfill and zero carry a provider-confirmed exact pin, because nothing surfaced
// it. The "Health N/M" score/meter depends on GET /api/provider/services/health; the compact
// bar renders NOTHING (no skeleton, no guess) when the endpoint hasn't returned data for this
// service — honest absence, §13.

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
  // FP-1 / B10: advisory notes that are VISIBLE but NOT SCORED.
  notices?: { key: string; detail: string }[];
}
interface HealthResponse {
  services: ServiceHealth[];
  omitted: { key: string; reason: string }[];
}

const HEALTH_CHECK_KEYS = [
  "photo",
  "exact_pin",
  "description",
  "pricing",
  "availability",
  "approval",
  "delivery_asset",
] as const;

const OMITTED_CHECK_KEYS = ["exact_pin", "availability"] as const;

/** 74×56 mock-anatomy thumbnail from serviceImage/galleryImages[0]; an honest neutral
 *  placeholder tile (muted icon, no fake image) when neither is present. */
function ServiceThumb({ service }: { service: Service }) {
  const gallery = Array.isArray(service.galleryImages) ? service.galleryImages : [];
  const src = service.serviceImage || gallery[0] || null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-[74px] h-[56px] rounded-[5px] object-cover flex-shrink-0 border border-[#E8E8E2] bg-[#EDEBE3]"
        data-testid={`img-service-thumb-${service.id}`}
      />
    );
  }
  return (
    <div
      className="w-[74px] h-[56px] rounded-[5px] flex-shrink-0 border border-[#E8E8E2] bg-[#EDEBE3] flex items-center justify-center"
      data-testid={`img-service-thumb-${service.id}`}
    >
      <ImageOff className="w-4 h-4 text-[#B8B6AC]" />
    </div>
  );
}

/** "Health N/M" — a compact bar + short label that opens a popover with the full detail.
 *  Renders NOTHING when the health endpoint hasn't returned data for this service — honest
 *  absence per §13, never a skeleton or a guess. */
function HealthIndicator({ health }: { health: ServiceHealth | undefined }) {
  const { t } = useTranslation("catalog");
  if (!health) return null;
  const { passed, total } = health.score;
  if (total <= 0) return null;
  const allPassing = passed === total;
  const firstFailing = health.checks.find((c) => !c.ok);
  const shortLabel = allPassing
    ? t("health.ready")
    : firstFailing
    ? (HEALTH_CHECK_KEYS as readonly string[]).includes(firstFailing.key)
      ? t(`health.checks.${firstFailing.key}`)
      : firstFailing.key
    : "";
  const failingLabels = health.checks
    .filter((c) => !c.ok)
    .map((c) => ((HEALTH_CHECK_KEYS as readonly string[]).includes(c.key) ? t(`health.checks.${c.key}`) : c.key));
  const omitted = health.omitted ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[12px] text-[#7A7A72] hover:text-[#1A1A18]"
          data-testid={`health-row-${health.serviceId}`}
        >
          <span className="w-[56px] h-[5px] rounded-full bg-[#E8E8E2] overflow-hidden inline-block">
            <span
              className={cn("block h-full", allPassing ? "bg-[#35605A]" : "bg-[#C79A3C]")}
              style={{ width: `${Math.round((passed / total) * 100)}%` }}
            />
          </span>
          {shortLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-[13px]" align="end">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[#1A1A18]">
            {t("health.meter", { passed, total })}
          </span>
          {allPassing ? (
            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200" variant="outline">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {t("health.ready")}
            </Badge>
          ) : (
            <span className="text-xs text-[#7A7A72]">{failingLabels.join(" · ")}</span>
          )}
        </div>
        {(health.notices ?? []).map((n) => (
          <p key={n.key} className="text-[11px] text-amber-700 mt-1.5" data-testid={`health-notice-${n.key}-${health.serviceId}`}>
            ⚠ {n.detail}
          </p>
        ))}
        {omitted.length > 0 && (
          <p className="text-[11px] italic text-[#7A7A72] mt-1.5" data-testid={`health-omitted-${health.serviceId}`}>
            {t("health.naPrefix")}:{" "}
            {omitted
              .map((o) => ((OMITTED_CHECK_KEYS as readonly string[]).includes(o.key) ? t(`health.omitted.${o.key}`) : o.key))
              .join(", ")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Manage ⇄ Preview toggle (Catalog+Distribute ruling 74, lane C2) ─────────────────────────
//
// CATALOG PREVIEW UPGRADE (decision-maker directive): Preview is now a from-scratch
// transcription of docs/design/catalog-preview-mock.html's `.offer` storefront card — the
// mock's OWN coral/dark-theme tokens (traveler-side branding, distinct from Manage's
// ink/teal idiom), not the generic shared `OfferingCard` the C2/C3 lanes originally reused.
// `OfferingCard` (client/src/components/OfferingCard.tsx) stays untouched here — it is also
// the LIVE public /p/:handle storefront card (storefront.tsx), which this directive does not
// cover; changing it would be scope creep onto a surface no mock authorizes yet.
// `catalog-preview-presentation.ts` carries the pure pin-chip / CTA / price / rating
// derivations this card renders — same honesty rule as the Manage-mode sibling module: real
// data only, absence renders as absence (§13).

const PREVIEW_DELIVERY_LABELS: Record<string, string> = {
  pdf: "PDF guide",
  video: "Video call",
  call: "Phone call",
  in_person: "In-person",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
  hybrid: "Hybrid",
};

/** One honest "In person · Gion, Kyoto · $68 per person" style line — never invents a field
 *  the row doesn't carry. Mirrors the mock's `.lmeta` line format. */
function listingMetaLine(service: Service): string {
  const parts: string[] = [];
  const methodLabel = service.deliveryMethod ? PREVIEW_DELIVERY_LABELS[service.deliveryMethod] : null;
  if (methodLabel) parts.push(methodLabel);
  else if (service.meetingPoint || service.city) parts.push("In person");

  if (service.city) parts.push(service.city);
  else if (service.meetingPoint) parts.push(service.meetingPoint);

  const rawPrice = service.price ?? service.basePrice;
  if (rawPrice != null && rawPrice !== "") {
    const priceStr =
      service.priceType === "hourly"
        ? `$${rawPrice} / hr`
        : service.priceType === "package_tiers"
        ? `from $${rawPrice}`
        : service.priceType === "per_event"
        ? `$${rawPrice} / event`
        : service.priceType === "per_person"
        ? `$${rawPrice} per person`
        : service.pricingUnit === "per_night"
        ? `$${rawPrice} / night`
        : `$${rawPrice}`;
    parts.push(priceStr);
  } else {
    parts.push("Custom quote");
  }
  return parts.join(" · ");
}

// C3 (ruling 74/75): the per-listing "Card shows" control on the Manage row. Two prefs — Show
// price (on/off) and Booking (Instant / Request / Hidden) — that drive the shared traveler
// OfferingCard in Preview AND on the public storefront. Each change PATCHes exactly its one field.
// Kept INLINE (not gated behind a closed popover) — service-display-options.spec.ts asserts this
// control is visible on the Manage row without an extra click, so it stays a quiet inline strip
// rather than the mock's implied popover (a deliberate departure from literal transcription;
// noted in the lane report).
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
      className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5"
      data-testid={`cardshows-${service.id}`}
    >
      <span className="text-[10px] font-medium text-[#7A7A72] uppercase tracking-wide">Card shows</span>
      <div className="flex items-center gap-2">
        <Switch
          checked={showPrice}
          onCheckedChange={(checked) => onPatch({ showPrice: checked })}
          disabled={disabled}
          className="scale-[0.85] data-[state=checked]:bg-[#35605A]"
          data-testid={`switch-cardshows-price-${service.id}`}
        />
        <span className="text-[11.5px] text-[#7A7A72]">Show price</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] text-[#7A7A72]">Booking</span>
        <div className="inline-flex rounded-[6px] border border-[#E8E8E2] overflow-hidden" role="group">
          {BOOKING_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPatch({ bookingMode: opt.value })}
              disabled={disabled}
              aria-pressed={bookingMode === opt.value}
              className={cn(
                "px-2 py-[3px] text-[11px] font-medium transition-colors border-r border-[#E8E8E2] last:border-r-0",
                bookingMode === opt.value ? "bg-[#1A1A18] text-white" : "bg-white text-[#7A7A72] hover:bg-[#FAFAF8]",
              )}
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

// ─── The mock's status pill (All / Live / In review / Draft) ─────────────────────────────
function CatalogPill({ service }: { service: Service }) {
  const { label, cls } = catalogPillDisplay(service);
  return (
    <span
      className={cn(
        "inline-block text-[11.5px] leading-none px-[9px] py-[3px] rounded-full border",
        cls === "live" && "border-[#BFD5D0] bg-[#EDF2F1] text-[#35605A]",
        cls === "draft" && "border-[#D9CDB2] bg-[#FBF6EC] text-[#6B551F]",
        cls === "" && "border-[#E8E8E2] bg-[#FAFAF8] text-[#7A7A72]",
      )}
      data-testid={`pill-status-${service.id}`}
    >
      {label}
    </span>
  );
}

// ─── FP-3: property rooms are not standalone listings ────────────────────────────────────────
//
// A room row collapses to one line under its parent property ("N room types"), expanding to
// the SAME compact row shape as any listing — name, nightly rate, its own active/paused state,
// an Edit that opens the property editor at the Rooms step. It never gets Duplicate, a pin
// chip, or the Card-shows control — a room has no delivery-method/pricing questionnaire of its
// own to show those for.
function RoomListingRow({ room, parentName }: { room: Service; parentName?: string | null }) {
  const rawPrice = room.price ?? room.basePrice;
  const nightly = rawPrice == null || rawPrice === "" ? "—" : `$${rawPrice} / night`;
  const isActive = room.status === "active";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-[14px] py-[9px] border-b border-[#E8E8E2] last:border-b-0",
        !isActive && "opacity-60",
      )}
      data-testid={`row-catalog-room-${room.id}`}
    >
      <BedDouble className="w-3.5 h-3.5 text-[#7A7A72] flex-shrink-0" />
      <span className="text-[13px] text-[#1A1A18] truncate flex-1 min-w-0">
        {room.serviceName || room.name || "Untitled room"}
      </span>
      <span className="text-[12px] text-[#35605A] font-medium flex-shrink-0" data-testid={`text-room-price-${room.id}`}>
        {nightly}
      </span>
      {parentName && (
        <span className="text-[11px] text-[#7A7A72] flex-shrink-0" data-testid={`text-room-parent-${room.id}`}>
          Room in {parentName}
        </span>
      )}
      <CatalogPill service={room} />
      <Link href={listingEditHref(room)}>
        <button
          type="button"
          className="text-[11.5px] text-[#7A7A72] hover:text-[#1A1A18] flex-shrink-0"
          data-testid={`button-edit-room-${room.id}`}
        >
          Edit
        </button>
      </Link>
    </div>
  );
}

/** Collapsed by default ("N room types →"); expands to the room rows above. */
function PropertyRoomsBlock({ property, rooms }: { property: Service; rooms: Service[] }) {
  const [open, setOpen] = useState(false);
  if (rooms.length === 0) {
    return (
      <p className="text-[11.5px] text-[#7A7A72] mt-2" data-testid={`rooms-empty-${property.id}`}>
        No room types yet — add one in the Workstation.
      </p>
    );
  }
  return (
    <div className="mt-2.5" data-testid={`rooms-block-${property.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11.5px] text-[#35605A] flex items-center gap-1 font-medium"
        data-testid={`button-toggle-rooms-${property.id}`}
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
        {rooms.length} room type{rooms.length === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="mt-2 border border-[#E8E8E2] rounded-[6px] overflow-hidden">
          {rooms.map((room) => (
            <RoomListingRow key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}

// Deterministic photo-gradient fallback — cycles the mock's own three `.photo.one/two/three`
// tints by a hash of the listing id, so the same untitled-photo card always gets the same
// tint (never a fake photo, §13 — a gradient is visibly NOT a photograph).
const PREVIEW_PHOTO_GRADIENTS = [
  "linear-gradient(140deg,#6d7f9c,#37445d)",
  "linear-gradient(140deg,#c99f6f,#6e4f34)",
  "linear-gradient(140deg,#8a9c6d,#43532f)",
];
function previewPhotoGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PREVIEW_PHOTO_GRADIENTS[hash % PREVIEW_PHOTO_GRADIENTS.length];
}

/**
 * The mock's `.offer` storefront card, transcribed as page-scoped Tailwind arbitrary values
 * on the mock's own coral/traveler-side tokens (--ink #1A1A18, --mid #7A7A72, --line #E8E8E2,
 * --card #fff, --brand #E85D55, --brand-soft #FDEFEE) — light-only, matching this console's
 * existing (light-only) convention; see the lane report for the dark-mode note.
 *
 * Not the shared `OfferingCard` (that stays the live public-storefront card, untouched here —
 * see the block comment above this section). This card owns its own markup so the mock's photo
 * pin chip / ribbon / hover-Edit / category eyebrow / balanced title / 2-line clamp / price+CTA
 * anatomy can be transcribed exactly.
 */
function CatalogPreviewOfferCard({ service, categoryName }: { service: Service; categoryName?: string }) {
  const { t: tCommon } = useTranslation("common");
  // FP-3: Preview is "what travelers see", so a room KEEPS its traveler card here (a room really
  // is a bookable public listing) — only the hover Edit affordance re-routes to its property.
  const editHref = listingEditHref(service);
  const title = service.serviceName || service.name || "Untitled service";

  const pinChip = deriveLocationPinChip({
    productShape: service.productShape,
    city: service.city,
    deliveryMethod: service.deliveryMethod,
  });
  const cta = deriveBookingCta(service.bookingMode);
  const priceDisplay = derivePreviewPrice({
    showPrice: service.showPrice,
    price: service.price,
    priceType: service.priceType,
    pricingUnit: service.pricingUnit,
  });
  const rating = derivePreviewRating({ rating: service.averageRating, count: service.reviewCount });

  return (
    <div
      className="group/edit relative flex flex-col overflow-hidden rounded-2xl border border-[#E8E8E2] bg-white shadow-[0_1px_2px_rgba(26,26,24,.05)] transition-transform duration-150 hover:-translate-y-[3px] hover:shadow-[0_6px_22px_rgba(26,26,24,.10)]"
      data-testid={`preview-card-${service.id}`}
    >
      <Link
        href={`/services/${service.id}`}
        data-testid={`storefront-service-${service.id}`}
        className="flex flex-1 flex-col text-inherit no-underline"
      >
        <div
          className="relative aspect-[3/2]"
          style={service.serviceImage ? undefined : { background: previewPhotoGradient(service.id) }}
        >
          {service.serviceImage && (
            <img
              src={service.serviceImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {pinChip && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">
              <MapPin className="h-2.5 w-2.5" />
              {pinChip}
            </span>
          )}
          {service.isFeatured && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-wide text-[#E85D55] shadow-[0_1px_2px_rgba(26,26,24,.05)]">
              Featured
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-[9px] px-[15px] pb-4 pt-3.5">
          {categoryName && (
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#E85D55]">
              {categoryName}
            </span>
          )}
          <h3 className="text-[15.5px] font-bold leading-[1.3] tracking-[-0.01em] text-[#1A1A18] [text-wrap:balance]">
            {title}
          </h3>
          {service.description && (
            <p className="line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-[#7A7A72]">
              {service.description}
            </p>
          )}
          {rating && (
            <div className="flex items-center gap-[5px] text-[11.5px] text-[#7A7A72]" data-testid={`storefront-service-${service.id}-rating`}>
              <Star className="h-3.5 w-3.5 text-[#e0a92e] fill-[#e0a92e]" />
              {rating.stars.toFixed(1)}
              <span>· {rating.count} review{rating.count === 1 ? "" : "s"}</span>
            </div>
          )}
          <div className="mt-auto flex min-h-[34px] items-center justify-between gap-2 pt-1">
            <div
              className={cn(
                "font-extrabold tracking-[-0.01em]",
                priceDisplay.quote ? "text-[13.5px] font-bold text-[#7A7A72]" : "text-[18px] text-[#1A1A18]",
                priceDisplay.hidden && "invisible",
              )}
              data-testid={`storefront-service-${service.id}-price`}
            >
              {priceDisplay.text}
              {priceDisplay.unit && (
                <small className="ml-1 text-[11px] font-semibold text-[#7A7A72]">{priceDisplay.unit}</small>
              )}
            </div>
            {cta && (
              <span
                className={cn(
                  "whitespace-nowrap rounded-[9px] px-[17px] py-[9px] text-[12.5px] font-bold",
                  cta.variant === "solid"
                    ? "bg-[#E85D55] text-white"
                    : "border-[1.5px] border-[#E85D55] bg-white text-[#E85D55]",
                )}
                data-testid={`storefront-service-${service.id}-cta`}
              >
                {cta.label}
              </span>
            )}
          </div>
        </div>
      </Link>
      {/* Hover-only Edit deep-link (ruling 74 res. B, owner affordance) — a sibling of the
          card's own <Link>, not a nested anchor; z-10 keeps it clickable above the full-card
          link, positioned bottom-right per the mock's `.offer .edit`. */}
      <Link
        href={editHref}
        className="absolute bottom-2.5 right-2.5 z-10 inline-flex items-center gap-[5px] rounded-lg border border-[#E8E8E2] bg-white/95 px-2.5 py-[5px] text-[11px] font-semibold text-[#7A7A72] opacity-0 shadow-[0_1px_2px_rgba(26,26,24,.05)] transition-opacity group-hover/edit:opacity-100 focus:opacity-100"
        data-testid={`button-preview-edit-${service.id}`}
      >
        <Edit className="h-[11px] w-[11px]" /> {tCommon("actions.edit")}
      </Link>
    </div>
  );
}

// ─── The mock's `.seg` segmented control ──────────────────────────────────────────────────
function Seg({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex border border-[#E8E8E2] rounded-[6px] overflow-hidden flex-shrink-0">
      {children}
    </div>
  );
}
function SegButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "px-[13px] py-[7px] text-[12.5px] border-r border-[#E8E8E2] last:border-r-0 whitespace-nowrap",
        active ? "bg-[#1A1A18] text-white" : "bg-white text-[#7A7A72] hover:text-[#1A1A18]",
      )}
    >
      {children}
    </button>
  );
}

// ─── The mock's `.listing` row (thumb / lname / lmeta / lright health+actions) ────────────
function ListingRow({
  service,
  health,
  rooms,
  isActive,
  onToggleActive,
  onPatchDisplay,
  displayPatchDisabled,
  onDuplicate,
  onRequestDelete,
  duplicateDisabled,
  onOpenAvailability,
}: {
  service: Service;
  health: ServiceHealth | undefined;
  rooms: Service[];
  isActive: boolean;
  onToggleActive: (checked: boolean) => void;
  onPatchDisplay: (patch: { showPrice?: boolean; bookingMode?: "instant" | "request" | "hidden" }) => void;
  displayPatchDisabled: boolean;
  onDuplicate: () => void;
  onRequestDelete: () => void;
  duplicateDisabled: boolean;
  onOpenAvailability?: () => void;
}) {
  const { t } = useTranslation("catalog");
  const displayName = service.serviceName || service.name || t("card.untitled");
  const isBundle = service.productShape === "bundle";
  const isProperty = service.productShape === "property";
  const editHref = listingEditHref(service);

  return (
    <div
      className={cn("flex gap-3.5 px-[18px] py-[15px] border-b border-[#E8E8E2] last:border-b-0 items-start", !isActive && "opacity-60")}
      data-testid={`card-service-${service.id}`}
    >
      <ServiceThumb service={service} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[14px] font-semibold text-[#1A1A18] truncate" data-testid={`text-listing-name-${service.id}`}>
            {displayName}
          </h3>
          {isBundle && <Badge variant="outline" className="text-[10px]" data-testid={`badge-bundle-${service.id}`}>{t("card.bundle")}</Badge>}
          {isProperty && <Badge variant="outline" className="text-[10px]" data-testid={`badge-property-${service.id}`}>Property</Badge>}
          {service.isFeatured && (
            <Badge className="bg-primary text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>{t("card.featured")}</Badge>
          )}
        </div>

        <p className="text-[12.5px] text-[#7A7A72] mt-0.5 truncate" data-testid={`text-listing-meta-${service.id}`}>
          {listingMetaLine(service)}
        </p>

        <div className="flex items-center gap-3.5 mt-2.5 flex-wrap">
          <CatalogPill service={service} />
          <label className="flex items-center gap-1.5 text-[12.5px] text-[#7A7A72] cursor-pointer">
            <Switch
              checked={isActive}
              onCheckedChange={onToggleActive}
              className="scale-[0.85] data-[state=checked]:bg-[#35605A]"
              data-testid={`switch-active-${service.id}`}
            />
            Show on my storefront
          </label>
          {/* mock row's "Availability →" — per-listing jump into the slot editor (same drawer
              the compact Availability card's "Edit slots" opens, preselected to this listing). */}
          {onOpenAvailability && (
            <button
              type="button"
              onClick={onOpenAvailability}
              className="text-[12.5px] text-[#1A1A18] underline underline-offset-2 hover:text-[#35605A]"
              data-testid={`button-availability-${service.id}`}
            >
              Availability →
            </button>
          )}
          <HealthIndicator health={health} />
        </div>

        {/* C3: per-listing "Card shows" control (Show price + Booking mode). */}
        <CardShowsControl service={service} onPatch={onPatchDisplay} disabled={displayPatchDisabled} />

        {/* FP-3: the property's room types collapse to one line, expanding to the same row shape. */}
        {isProperty && <PropertyRoomsBlock property={service} rooms={rooms} />}

        {Array.isArray(service.contentAffinityTags) && service.contentAffinityTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid={`affinity-tags-${service.id}`}>
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
        )}
      </div>

      {/* mock `.lright` — quiet actions: Edit + "Promote this →"; Duplicate/Delete in overflow */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-auto">
        <Link href={editHref}>
          <button
            type="button"
            className="text-[12.5px] text-[#7A7A72] hover:text-[#1A1A18] hover:underline underline-offset-2"
            data-testid={`button-edit-${service.id}`}
          >
            {t("card.edit", { defaultValue: "Edit" })}
          </button>
        </Link>
        <Link href={`/provider/distribute?listing=${service.id}`}>
          <button
            type="button"
            className="text-[12.5px] text-[#35605A] hover:underline underline-offset-2"
            data-testid={`button-distribute-${service.id}`}
          >
            Promote this →
          </button>
        </Link>
        {!isBundle && !isProperty && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="text-[#7A7A72] hover:text-[#1A1A18] p-0.5"
                data-testid={`button-more-${service.id}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate} disabled={duplicateDisabled} data-testid={`button-duplicate-${service.id}`}>
                <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRequestDelete} className="text-red-600 focus:text-red-600" data-testid={`button-delete-${service.id}`}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(isBundle || isProperty) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="text-[#7A7A72] hover:text-[#1A1A18] p-0.5"
                data-testid={`button-more-${service.id}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRequestDelete} className="text-red-600 focus:text-red-600" data-testid={`button-delete-${service.id}`}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

const STATUS_CHIPS: Array<{ key: "all" | CatalogStatusBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "in_review", label: "In review" },
  { key: "draft", label: "Draft" },
];

export default function ProviderServices() {
  const { t } = useTranslation("catalog");
  const { t: tCommon } = useTranslation("common");
  // Mock toolbar: "Search your listings" (client-side name/category filter).
  const [searchQuery, setSearchQuery] = useState("");
  // Mock toolbar: status chips All | Live | In review | Draft.
  const [statusFilter, setStatusFilter] = useState<"all" | CatalogStatusBucket>("all");
  // Ruling 22(b): Catalog is the map's home — this toggle swaps the row list for the map
  // authoring surface (CatalogMapView). The mock's toolbar shows only List | Map — the
  // pre-rebuild third "Availability" toggle is retired; its editor is reachable from the
  // compact Availability card's "Edit slots" (drawer) or the `?availability=<id>` deep-link.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  // C2 (ruling 74): Manage ⇄ Preview is a SEPARATE axis from List/Map — it governs the LIST
  // layout's rows only (Manage = mock-faithful operational rows; Preview = the shared
  // traveler card). Map is neither Manage nor Preview, so this control is shown in list view.
  const [catalogMode, setCatalogMode] = useState<"manage" | "preview">("manage");
  // FP-2 / Package A item 6: Delete is CONFIRMED, not immediate.
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  // Availability drawer — houses the REAL S7 editor (ProviderAvailabilityManager), preselected.
  const [availabilityDrawerOpen, setAvailabilityDrawerOpen] = useState(false);
  const [availabilityDrawerServiceId, setAvailabilityDrawerServiceId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dbCategories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });

  // Listing Health score — ONE query, keyed on the services list. 404s (200-HTML pre-mount, per
  // CLAUDE.md's dead-route note) land the query in an error state with no data; HealthIndicator
  // renders nothing per service in that case (§13 honest absence).
  const { data: healthData } = useQuery<HealthResponse>({
    queryKey: ["/api/provider/services/health"],
    enabled: !!services && services.length > 0,
  });
  // `Map` the constructor is shadowed by the lucide-react-adjacent naming elsewhere on this
  // page historically — use globalThis.Map explicitly to avoid any ambiguity.
  const healthByServiceId = new globalThis.Map<string, ServiceHealth>(
    (healthData?.services ?? []).map((h) => [h.serviceId, h]),
  );

  // WAVE 2 / S2: the listing home's "Publish some availability" checklist row (and any other
  // deep-link) still lands here with the service preselected — the S7 editor now opens in the
  // drawer instead of a scroll target.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || isLoading) return;
    const requested = new URLSearchParams(window.location.search).get("availability");
    if (requested && (services ?? []).some((s) => s.id === requested)) {
      setAvailabilityDrawerServiceId(requested);
      setAvailabilityDrawerOpen(true);
    }
    deepLinkApplied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, services?.length]);

  // ── FP-2 / Package A item 5: HUMAN ERRORS ON THE CATALOG MUTATIONS ─────────────────────────
  const toastRefusal = (action: CatalogAction, err: unknown, service?: { id: string; productShape?: string | null; parentServiceId?: string | null }) => {
    const copy = describeCatalogRefusal(action, err);
    const href = service ? listingEditHref(service) : null;
    toast({
      variant: "destructive",
      title: copy.title,
      description: copy.description,
      action: copy.fixInEditor && href ? (
        <ToastAction altText="Open this listing's editor" onClick={() => navigate(href)}>
          Fix it
        </ToastAction>
      ) : undefined,
    });
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service updated" });
    },
    onError: (error: Error, vars) => {
      const service = services?.find((s) => s.id === vars.id);
      toastRefusal(vars.status === "active" ? "activate" : "pause", error, service);
    },
  });

  const displayOptionsMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { showPrice?: boolean; bookingMode?: "instant" | "request" | "hidden" } }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
    },
    onError: (error: Error, vars) => {
      toastRefusal("display", error, services?.find((s) => s.id === vars.id));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/provider/services/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      setDeleteTarget(null);
      toast({ title: "Service deleted" });
    },
    onError: (error: Error, id) => {
      toastRefusal("delete", error, services?.find((s) => s.id === id));
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
    onError: (error: Error, id) => {
      toastRefusal("duplicate", error, services?.find((s) => s.id === id));
    },
  });

  const totalServices = services?.length ?? 0;

  const categoryNameById = dbCategories.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const allServices = services ?? [];
  const statusCounts: Record<"all" | CatalogStatusBucket, number> = {
    all: allServices.length,
    live: allServices.filter((s) => catalogStatusBucket(s) === "live").length,
    in_review: allServices.filter((s) => catalogStatusBucket(s) === "in_review").length,
    draft: allServices.filter((s) => catalogStatusBucket(s) === "draft").length,
    other: 0,
  };

  const statusFiltered = statusFilter === "all" ? allServices : allServices.filter((s) => catalogStatusBucket(s) === statusFilter);
  const filteredServices = statusFiltered.filter((s) => {
    const name = s.serviceName || s.name || "";
    const categoryName = s.categoryId ? categoryNameById[s.categoryId] : undefined;
    return matchesCatalogSearch(searchQuery, name, categoryName);
  });

  // ── FP-3: property rooms are grouped under their parent property row ────────────────────────
  const roomsByParent = new globalThis.Map<string, Service[]>();
  for (const s of filteredServices) {
    if (!isPropertyRoom(s.productShape)) continue;
    const key = s.parentServiceId ?? "";
    roomsByParent.set(key, [...(roomsByParent.get(key) ?? []), s]);
  }
  const topLevelServices = filteredServices.filter((s) => !isPropertyRoom(s.productShape));
  const topLevelIds = new Set(topLevelServices.map((s) => s.id));
  const orphanRooms = filteredServices.filter(
    (s) => isPropertyRoom(s.productShape) && !(s.parentServiceId && topLevelIds.has(s.parentServiceId)),
  );
  const serviceNameById = new globalThis.Map<string, string>(
    (services ?? []).map((s) => [s.id, s.serviceName || s.name || ""]),
  );

  // C2 Preview honesty filter (§13): a listing appears in Preview ONLY if it would appear on the
  // public /p/:handle storefront.
  const previewServices = filteredServices.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  );

  const activeCount = allServices.filter((s) => s.status === "active").length;
  const isFirstTimeEmpty = !isLoading && totalServices === 0;
  const isFilterEmpty = !isLoading && totalServices > 0 && filteredServices.length === 0;

  function openAvailabilityEditor(serviceId: string) {
    setAvailabilityDrawerServiceId(serviceId);
    setAvailabilityDrawerOpen(true);
  }

  return (
    /* FP-4 full-bleed exception #1: the MAP view's canvas is a three-pane authoring
       surface whose usable area IS the shell width. The LIST view is ordinary content and
       stays inside the shared container. */
    <ProviderLayout title="Catalog" width={viewMode === "map" ? "full" : "contained"}>
      <div className="p-6 space-y-4">
        {/* ── Header (mock: title + real N-listing subtitle + black Add New Service) ────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-[-0.01em] text-[#1A1A18]" data-testid="text-services-title">
              Catalog
            </h2>
            {isLoading ? (
              <Skeleton className="h-4 w-96 mt-1.5" />
            ) : (
              <p className="text-[13px] text-[#7A7A72] mt-1 max-w-[70ch]" data-testid="text-catalog-subtitle">
                What you sell — {totalServices} listing{totalServices === 1 ? "" : "s"}. Storefront, share kit and the
                promote feed now live on{" "}
                <Link href="/provider/distribute">
                  <span className="text-[#35605A] underline underline-offset-2 cursor-pointer">Distribute</span>
                </Link>
                ; new listings are born on{" "}
                <Link href="/provider/workstation">
                  <span className="text-[#35605A] underline underline-offset-2 cursor-pointer">Workstation</span>
                </Link>
                .
              </p>
            )}
          </div>
          <Link href="/provider/workstation">
            <Button
              className="bg-[#1A1A18] hover:bg-black text-white rounded-[6px] text-[13.5px] font-semibold h-auto py-[9px] px-4"
              data-testid="button-add-service"
            >
              <Plus className="w-4 h-4 mr-1.5" /> {t("header.addService")}
            </Button>
          </Link>
        </div>

        {/* ── Toolbar card (mock: search + status chips + Manage/Preview + List/Map) ─────── */}
        {totalServices > 0 && (
          <div className="bg-white border border-[#E8E8E2] rounded-[7px] px-[18px] py-[14px] flex items-center gap-2.5 flex-wrap">
            {viewMode === "list" && (
              <>
                <div className="relative flex-shrink-0">
                  <Search className="w-3.5 h-3.5 text-[#7A7A72] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your listings"
                    aria-label="Search listings"
                    className="h-9 w-[210px] pl-8 text-[13.5px] border-[#E8E8E2] rounded-[6px] bg-white focus-visible:ring-1 focus-visible:ring-[#35605A]"
                    data-testid="input-catalog-search"
                  />
                </div>
                <Seg>
                  {STATUS_CHIPS.map((chip) => (
                    <SegButton
                      key={chip.key}
                      active={statusFilter === chip.key}
                      onClick={() => setStatusFilter(chip.key)}
                      testId={`button-status-filter-${chip.key.replace("_", "-")}`}
                    >
                      {chip.label} ({statusCounts[chip.key]})
                    </SegButton>
                  ))}
                </Seg>
              </>
            )}
            <div className="ml-auto flex items-center gap-2.5 flex-wrap">
              {viewMode === "list" && (
                <Seg>
                  <SegButton active={catalogMode === "manage"} onClick={() => setCatalogMode("manage")} testId="button-mode-manage">
                    Manage
                  </SegButton>
                  <SegButton active={catalogMode === "preview"} onClick={() => setCatalogMode("preview")} testId="button-mode-preview">
                    Preview
                  </SegButton>
                </Seg>
              )}
              <Seg>
                <SegButton active={viewMode === "list"} onClick={() => setViewMode("list")} testId="button-view-list">
                  {t("header.viewList")}
                </SegButton>
                <SegButton active={viewMode === "map"} onClick={() => setViewMode("map")} testId="button-view-map">
                  {t("header.viewMap")}
                </SegButton>
              </Seg>
            </div>
          </div>
        )}

        {/* ── Banner (mock: `.banner.preview` / `.banner.manage`, list view only) ─────────── */}
        {totalServices > 0 && viewMode === "list" && (
          catalogMode === "preview" ? (
            <div
              className="flex items-center gap-[9px] rounded-[10px] border border-[rgba(232,93,85,0.22)] bg-[#FDEFEE] px-[13px] py-[9px] text-[12.5px] font-semibold text-[#E85D55]"
              data-testid="banner-catalog-preview"
            >
              <Eye className="h-[15px] w-[15px] flex-shrink-0" />
              <span>
                You&rsquo;re seeing your storefront as travelers do.{" "}
                <span className="font-medium opacity-[.85]">
                  Paused &amp; unapproved listings are hidden here, exactly like your public page.
                </span>
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-[9px] rounded-[10px] border border-[rgba(46,125,91,0.20)] bg-[#EAF4EF] px-[13px] py-[9px] text-[12.5px] font-semibold text-[#2E7D5B]"
              data-testid="banner-catalog-manage"
            >
              <Edit className="h-[15px] w-[15px] flex-shrink-0" />
              <span>
                Manage mode — your controls.{" "}
                <span className="font-medium opacity-[.85]">
                  Toggle status, edit, and set what each card shows to travelers below.
                </span>
              </span>
            </div>
          )
        )}

        {/* ── Content ──────────────────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-[7px]" />
            ))}
          </div>
        ) : isFirstTimeEmpty ? (
          <div className="text-center py-10 bg-white border border-[#E8E8E2] rounded-[7px]" data-testid="empty-state-catalog">
            <h3 className="text-lg font-semibold text-[#1A1A18] mb-1">{t("empty.title")}</h3>
            <p className="text-[#7A7A72] text-sm mb-4">{t("empty.body")}</p>
            <Link href="/provider/workstation">
              <Button className="bg-[#1A1A18] hover:bg-black text-white" data-testid="button-add-first-service">
                <Plus className="w-4 h-4 mr-2" /> {t("header.addService")}
              </Button>
            </Link>
          </div>
        ) : viewMode === "map" ? (
          <div className="space-y-2">
            {/* Ruling 22(c): a read-only traveler-eye preview — authoring lives in the create
                flow's Logistics step (mock item ⑨/⑩). */}
            <p className="text-[11.5px] text-[#7A7A72]">
              Pins, radius, zones and route stops are authored in the create flow's Logistics step —{" "}
              <Link href="/provider/workstation">
                <span className="text-[#35605A] underline underline-offset-2 cursor-pointer">open it →</span>
              </Link>
            </p>
            <CatalogMapView services={services ?? []} />
          </div>
        ) : isFilterEmpty ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-[#7A7A72] font-medium">No listings match {searchQuery ? "your search" : "this filter"}.</p>
              <p className="text-[#7A7A72] text-sm mt-1">Try a different search term or status.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                data-testid="button-clear-filter"
              >
                {t("filter.clear")}
              </Button>
            </CardContent>
          </Card>
        ) : catalogMode === "preview" ? (
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
              className="grid grid-cols-3 gap-[18px] max-[820px]:grid-cols-2 max-[540px]:grid-cols-1"
              data-testid="catalog-preview-grid"
            >
              {previewServices.map((service) => (
                <CatalogPreviewOfferCard
                  key={service.id}
                  service={service}
                  categoryName={service.categoryId ? categoryNameById[service.categoryId] : undefined}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {/* mock: single `.card` housing the `.listing` rows */}
            <div className="bg-white border border-[#E8E8E2] rounded-[7px]">
              {topLevelServices.map((service) => (
                <ListingRow
                  key={service.id}
                  service={service}
                  health={healthByServiceId.get(service.id)}
                  rooms={service.productShape === "property" ? roomsByParent.get(service.id) ?? [] : []}
                  isActive={service.status === "active"}
                  onToggleActive={(checked) => toggleMutation.mutate({ id: service.id, status: checked ? "active" : "paused" })}
                  onPatchDisplay={(patch) => displayOptionsMutation.mutate({ id: service.id, patch })}
                  displayPatchDisabled={displayOptionsMutation.isPending}
                  onDuplicate={() => duplicateMutation.mutate(service.id)}
                  duplicateDisabled={duplicateMutation.isPending}
                  onRequestDelete={() => setDeleteTarget(service)}
                  onOpenAvailability={() => {
                    setAvailabilityDrawerServiceId(service.id);
                    setAvailabilityDrawerOpen(true);
                  }}
                />
              ))}
            </div>

            {/* FP-3: rooms whose property row is NOT in the current view — never silently
                dropped (§13); shown as their own compact rows naming the property. */}
            {orphanRooms.length > 0 && (
              <div className="bg-white border border-[#E8E8E2] rounded-[7px]" data-testid="catalog-orphan-rooms">
                {orphanRooms.map((room) => (
                  <RoomListingRow
                    key={room.id}
                    room={room}
                    parentName={room.parentServiceId ? serviceNameById.get(room.parentServiceId) ?? null : null}
                  />
                ))}
              </div>
            )}

            {/* mock: compact Availability card below the listing list. */}
            <AvailabilityCard
              services={allServices}
              servicesLoading={isLoading}
              onOpenEditor={openAvailabilityEditor}
              initialServiceId={availabilityDrawerServiceId}
            />
          </>
        )}

        {/* S6 (ruling-74-disposition-6 clarification): the storefront header, the per-service
            share-kit dialog and the Promote (posting-opportunities) block all live on
            /provider/distribute — this page's own outward-facing pointer is now exactly the
            per-row "Promote this →" button above, nothing more. */}

        {/* ── Availability drawer — the REAL S7 editor, preselected ───────────────────────── */}
        <Sheet open={availabilityDrawerOpen} onOpenChange={setAvailabilityDrawerOpen}>
          <SheetContent side="right" className="w-[min(560px,94vw)] sm:max-w-none overflow-y-auto" data-testid="drawer-availability-editor">
            <SheetHeader>
              <SheetTitle>Edit availability</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ProviderAvailabilityManager initialServiceId={availabilityDrawerServiceId ?? undefined} />
            </div>
          </SheetContent>
        </Sheet>

        {/* ── FP-2 / Package A item 6 — DELETE ASKS FIRST ─────────────────────────────────── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent data-testid="dialog-delete-service">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget?.serviceName || t("card.untitled")}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the listing from your catalog and from anywhere travelers can find
                it. It can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-service">
                {tCommon("actions.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-service"
              >
                {tCommon("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProviderLayout>
  );
}
