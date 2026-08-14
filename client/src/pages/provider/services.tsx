/**
 * Provider Catalog — Console IA C9 (§17 17→9 collapse, the provider nine-module stamp).
 *
 * This page is the provider console's Catalog seat ("what I sell") — read / manage / triage
 * only. It carries NO outward-facing distribution chrome (S6, ruling-74-disposition-6
 * clarification below):
 *   - AVAILABILITY: the ratified "availability editing belongs to Catalog" placement — the
 *     expert catalog's slot section transplanted onto /api/provider/services + the SAME
 *     session-ownership-scoped /api/me/services/:serviceId/slots CRUD (expert-console.routes.ts
 *     resolves ownership against provider_services.userId, so it is role-agnostic). This is
 *     the REAL slot editor; the old /provider/calendar "Edit Schedule"/"Block Dates" sheets it
 *     supersedes were non-persisting previews.
 *   - LISTING HEALTH: the per-card health strip (photo/pin/description completeness) — a
 *     triage signal, not a distribution surface.
 *
 * S6 (ruling-74-disposition-6 clarification, "Distribute is the ONE home for outward-facing
 * distribution surfaces"): the storefront header, the per-service share-kit dialog and the
 * Promote (posting-opportunities) block all MOVED to /provider/distribute — ruling 74(6)/(7)
 * had left the storefront header double-mounted (this page AND Distribute both rendered
 * `ProviderStorefrontHeader`) and left the Promote block's CONTAINER on Catalog even after C6
 * pointed its actions at Distribute. This lane resolves both: `ProviderStorefrontHeader` stays
 * `export`ed from this file (Distribute's storefront channel imports it) but is no longer
 * mounted HERE; the per-card Share button + `OfferingShareDetail` dialog is gone (Distribute's
 * Social kit channel now mounts the same shared component); the Promote section
 * (`PostingOpportunitiesCard`) is gone (it now renders on Distribute). Each card keeps exactly
 * one outward-facing pointer — "Distribute this →" (now labeled "Promote this →" on the card,
 * see below) — which lands on `/provider/distribute` with that listing preselected.
 * /provider/share-promote still redirects here (unchanged); its expert twin (a separate,
 * untouched lane) keeps the inline share surface on `/expert/catalog`.
 *
 * CATALOG VISUAL PARITY (docs/design/service-creation-mock.html, "Catalog after" panel):
 * functionality above is unchanged; this pass restyled the Manage-mode card into the mock's
 * slim `.listing` row — small thumb, name, ONE meta line (category · price/unit · booking-mode
 * word), a right rail of a click-to-open health bar + unified status pill, and a two-item
 * primary action row (Edit + "Promote this →") with Duplicate/Delete collapsed into an overflow
 * menu and the C3 "Card shows" control (CardShowsControl) moved into its own gear popover
 * (CardShowsPopover). The category button row became a compact dropdown beside new All/Live/In
 * review/Draft status filter chips (STATUS_FILTERS). The embedded single-slot
 * AvailabilitySection block is deleted; the ?availability=<id> deep-link now switches this page
 * into the "availability" view-mode with that service preselected (ONE availability surface).
 */
import { useTranslation } from "react-i18next";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Catalog visual parity (mock: docs/design/service-creation-mock.html "Catalog after") — the
// slim `.listing` row moves the health detail and the C3 "Card shows" control off the card face
// and into click-to-open popovers; Duplicate/Delete collapse into an overflow menu.
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
// S6: StorefrontShareTools + ensureShortLink stay imported — ProviderStorefrontHeader (below)
// still composes them, it is just no longer MOUNTED on this page (moved to Distribute).
// OfferingShareDetail / PostingOpportunitiesCard are gone from this file's imports — both
// outward-facing surfaces moved to /provider/distribute (S6).
import { StorefrontShareTools, ensureShortLink } from "@/components/backoffice/share-tools";
import { CatalogMapView } from "@/components/provider/catalog-map-view";
import { ProviderAvailabilityManager } from "@/components/logistics/provider-availability-manager";
import { OfferingCard } from "@/components/OfferingCard";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  BedDouble,
  ExternalLink,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ImageOff,
  CheckCircle2,
  Star,
  Settings2,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isPlaceAnchored } from "@shared/service-fundamentals";
// FP-3: property + property_room rows are edited on the Workstation property surface, never in
// the ServiceForm questionnaire. ONE home for that routing decision (ServiceForm's back-door
// guard imports the same module).
import { listingEditHref, isPropertyRoom } from "@/lib/property-editor-link";
import { describeCatalogRefusal, type CatalogAction } from "@/lib/catalog-error-copy";

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
  // FP-1 / B10: advisory notes that are VISIBLE but NOT SCORED — today only the
  // commission-band fallback ("no category → the platform default band applies"). They never
  // move the meter: the property and bundle builders ask for no category, and failing an owner
  // on something they cannot fix is not honest scoring (D3's own rule).
  notices?: { key: string; detail: string }[];
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

// Short "n/a" labels for method-omitted checks (D2) — the muted note beside the health meter.
// Translated under health.omitted.* (ruling 60 Phase A).
const OMITTED_CHECK_KEYS = ["exact_pin", "availability"] as const;

/** Catalog visual parity: 74×56 to match the mock's `.thumb`. Rounded thumbnail from
 *  serviceImage/galleryImages[0]; an honest neutral placeholder tile (muted icon, no fake image)
 *  when neither is present. Sourced from the services list row directly — no dependency on the
 *  health endpoint. (The pin-status chip this used to sit beside is retired — a service's exact
 *  pin status is one of the health checks in the same popover the health bar now opens, so it is
 *  not repeated as a second inline chip.) */
function ServiceThumb({ service }: { service: Service }) {
  const gallery = Array.isArray(service.galleryImages) ? service.galleryImages : [];
  const src = service.serviceImage || gallery[0] || null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-[74px] h-[56px] rounded-md object-cover flex-shrink-0 border border-console-light bg-console-bg"
        data-testid={`img-service-thumb-${service.id}`}
      />
    );
  }
  return (
    <div
      className="w-[74px] h-[56px] rounded-md flex-shrink-0 border border-dashed border-console-light bg-console-bg flex items-center justify-center"
      data-testid={`img-service-thumb-${service.id}`}
    >
      <ImageOff className="w-4 h-4 text-console-mid/50" />
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
    // Catalog visual parity, item 2: this control now renders INSIDE a settings popover (see
    // CardShowsPopover below) rather than inline on the card face, so the old inline border/
    // margin (meant to separate it from the card content above it) is gone — a stacked layout
    // reads better at popover width. Same testids, same mutations, same behavior.
    <div className="flex flex-col gap-3" data-testid={`cardshows-${service.id}`}>
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

/** Catalog visual parity, item 2: the gear trigger that opens CardShowsControl in a popover
 *  instead of showing it inline on every card face. Same mutation, same PATCH — only WHERE it
 *  renders changed. */
function CardShowsPopover({
  service,
  onPatch,
  disabled,
}: {
  service: Service;
  onPatch: (patch: { showPrice?: boolean; bookingMode?: "instant" | "request" | "hidden" }) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-console-mid"
          title="Card shows"
          data-testid={`button-cardshows-toggle-${service.id}`}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <CardShowsControl service={service} onPatch={onPatch} disabled={disabled} />
      </PopoverContent>
    </Popover>
  );
}

// ─── Catalog visual parity: unified listing status (mock's Live / In review / Draft chips) ──
//
// The card already carried the true state as TWO badges (approvalStatus + active/paused). The
// mock's filter bar collapses that into one vocabulary. Judgment call (documented in the lane
// report): the mock ships exactly 3 status chips + All, so "Draft" is a FILTER BUCKET covering
// draft + paused + rejected (none of them are live, none are in review) — but each ROW's own
// pill always shows its true, specific state (Live/In review/Draft/Paused/Rejected), never the
// bucket name. §13: no state is hidden, only the filter groups them coarser than the row does.
type ListingStatus = "live" | "in_review" | "draft" | "paused" | "rejected";

function deriveListingStatus(service: Service): ListingStatus {
  const approval = service.approvalStatus;
  const isActive = service.status === "active";
  if (approval === "approved" && isActive) return "live";
  if (approval === "approved" && !isActive) return "paused";
  if (approval === "submitted") return "in_review";
  if (approval === "rejected") return "rejected";
  return "draft";
}

// Reuses the exact colors DEFAULT_STATUS_MAP already assigns to these same real states
// (active/submitted/draft/paused/rejected) — no new palette invented for this pill.
const LISTING_STATUS_META: Record<ListingStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-green-100 text-green-700 border-green-200" },
  in_review: { label: "In review", className: "bg-blue-100 text-blue-700 border-blue-200" },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-transparent" },
  paused: { label: "Paused", className: "bg-amber-100 text-amber-700 border-amber-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
};

function ListingStatusPill({ service }: { service: Service }) {
  const meta = LISTING_STATUS_META[deriveListingStatus(service)];
  return (
    <Badge variant="outline" className={`text-[10px] ${meta.className}`} data-testid={`status-pill-${service.id}`}>
      {meta.label}
    </Badge>
  );
}

type StatusFilterKey = "all" | "live" | "in_review" | "draft";
const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "in_review", label: "In review" },
  { key: "draft", label: "Draft" },
];
function matchesStatusFilter(service: Service, filter: StatusFilterKey): boolean {
  if (filter === "all") return true;
  const status = deriveListingStatus(service);
  if (filter === "draft") return status === "draft" || status === "paused" || status === "rejected";
  return status === filter;
}

/** Catalog visual parity, item 1: the health meter + failing-check list moves off the card face
 *  and into a click-to-open popover on the health bar — same data, same §13 honest-absence rule
 *  (renders nothing when the health endpoint hasn't returned this service), never inline text. */
function HealthDetail({ health }: { health: ServiceHealth | undefined }) {
  const { t } = useTranslation("catalog");
  if (!health) {
    return <p className="text-xs text-console-mid">No health data yet.</p>;
  }
  const failing = health.checks.filter((c) => !c.ok);
  const omitted = health.omitted ?? [];
  const notices = health.notices ?? [];
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium text-console-darkest">{t("health.meter", health.score)}</p>
      {failing.length === 0 ? (
        <div className="flex items-center gap-1.5 text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t("health.ready")}
        </div>
      ) : (
        <ul className="space-y-1">
          {failing.map((c) => (
            <li key={c.key} className="text-console-mid">
              • {(HEALTH_CHECK_KEYS as readonly string[]).includes(c.key) ? t(`health.checks.${c.key}`) : c.key}
            </li>
          ))}
        </ul>
      )}
      {notices.map((n) => (
        <p key={n.key} className="text-amber-700" data-testid={`health-notice-${n.key}-${health.serviceId}`}>
          ⚠ {n.detail}
        </p>
      ))}
      {omitted.length > 0 && (
        <p className="italic text-console-mid/70" data-testid={`health-omitted-${health.serviceId}`}>
          {t("health.naPrefix")}:{" "}
          {omitted
            .map((o) => ((OMITTED_CHECK_KEYS as readonly string[]).includes(o.key) ? t(`health.omitted.${o.key}`) : o.key))
            .join(", ")}
        </p>
      )}
    </div>
  );
}

/** The mock's 56px slim bar + status pill, right-aligned on the row. Renders nothing when the
 *  health endpoint has no data for this service yet (§13 honest absence — same rule HealthRow
 *  used to apply inline). */
function HealthBar({ service, health }: { service: Service; health: ServiceHealth | undefined }) {
  if (!health || health.score.total <= 0) return null;
  const { passed, total } = health.score;
  const allPassing = passed === total;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1.5" data-testid={`health-row-${service.id}`}>
          <span className="w-14 h-[5px] rounded-full bg-console-light overflow-hidden inline-block">
            <span
              className={`block h-full rounded-full ${allPassing ? "bg-green-500" : "bg-amber-500"}`}
              style={{ width: `${Math.round((passed / total) * 100)}%` }}
            />
          </span>
          <span className="text-[11px] text-console-mid">
            {passed}/{total}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <HealthDetail health={health} />
      </PopoverContent>
    </Popover>
  );
}

// ─── FP-3: property rooms are not standalone listings ────────────────────────────────────────
//
// Ratified design (service-creation redesign mock, decision-maker Aug 2026): "a property room's
// Edit opens its property's editor at the Rooms step — a room has no service checklist/delivery-
// method of its own, and sending it into the generic ServiceForm is a dishonest surface."
//
// A room IS a provider_services row (migration 153) so it arrives on this owner read like any
// listing — but it is a CHILD row: its category, location, pin and delivery method are inherited
// from its property, and its price is a nightly rate. Rendering it as an ordinary service card
// (with Duplicate, a pin chip and an Edit into the delivery questionnaire) states things about it
// that are not true. It renders instead as a compact room row under its parent property's card,
// showing exactly what a room is: its name, its nightly price, its own review/active state, and
// an Edit that opens the property editor at the Rooms step.
function RoomRow({
  room,
  parentName,
  health,
}: {
  room: Service;
  /** The parent property's name — stated on an ORPHAN row (its property card is not in view). */
  parentName?: string | null;
  health: ServiceHealth | undefined;
}) {
  const { t } = useTranslation("catalog");
  const { t: tCommon } = useTranslation("common");
  const rawPrice = room.price ?? room.basePrice;
  const nightly = rawPrice == null || rawPrice === "" ? "—" : `$${rawPrice} / night`;
  const isActive = room.status === "active";
  return (
    // Catalog visual parity, item 1: "expanded rooms use the same slim row shape" — one unified
    // status pill (was two StatusBadges) + the health bar's click-to-open detail (was inline
    // HealthRow text).
    <div
      className={`flex items-center gap-3 rounded-md border border-console-light px-3 py-2 ${!isActive ? "opacity-60" : ""}`}
      data-testid={`row-catalog-room-${room.id}`}
    >
      <BedDouble className="w-3.5 h-3.5 text-console-mid flex-shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-console-darkest truncate">
          {room.serviceName || room.name || t("card.untitled")}
        </span>
        <span className="text-xs font-medium text-green-600" data-testid={`text-room-price-${room.id}`}>
          {nightly}
        </span>
        {parentName && (
          <span className="text-[11px] text-console-mid" data-testid={`text-room-parent-${room.id}`}>
            Room in {parentName}
          </span>
        )}
      </div>
      <HealthBar service={room} health={health} />
      <ListingStatusPill service={room} />
      <Link href={listingEditHref(room)}>
        <Button variant="outline" size="sm" className="h-7 flex-shrink-0" data-testid={`button-edit-room-${room.id}`}>
          <Edit className="w-3.5 h-3.5 mr-1" /> {tCommon("actions.edit")}
        </Button>
      </Link>
    </div>
  );
}

function CatalogPreviewCard({ service }: { service: Service }) {
  const { t: tCommon } = useTranslation("common");
  // FP-3: Preview is "what travelers see", so a room KEEPS its traveler card here (a room really
  // is a bookable public listing) — only the hover Edit affordance re-routes to its property.
  const editHref = listingEditHref(service);

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
  // Catalog visual parity, item 3: the unified Live/In review/Draft status filter — a SEPARATE
  // axis from category, applied on top of it (both are AND'd into filteredServices below).
  const [selectedStatus, setSelectedStatus] = useState<StatusFilterKey>("all");
  // Catalog visual parity, item 1: a property's room types collapse to one summary line by
  // default; this tracks which property cards have been expanded to their full room rows.
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  // Catalog visual parity, item 4: ?availability=<serviceId> (produced by ServiceForm's
  // checklist row) used to be consumed by the now-deleted embedded AvailabilitySection. It now
  // switches THIS view into "availability" mode with that service preselected — one surface,
  // same behavior. Parsed once on mount; §13 — an id that doesn't resolve to a real service is
  // just ignored, never guessed at.
  const initialAvailabilityServiceId = useState(
    () => new URLSearchParams(window.location.search).get("availability") ?? undefined,
  )[0];
  // Ruling 22(b): Catalog is the map's home — this toggle swaps the card grid for the map
  // authoring surface (CatalogMapView); everything below the content block is untouched.
  // S7 (DECISIONS.md ledger 102, G1 REC — "one editor... mounted on Catalog"): a third mode adds
  // the availability editor (ProviderAvailabilityManager) alongside List/Map, on the same toggle.
  const [viewMode, setViewMode] = useState<"list" | "map" | "availability">(
    initialAvailabilityServiceId ? "availability" : "list",
  );
  // C2 (ruling 74): Manage ⇄ Preview is a SEPARATE axis from List/Map — it governs the LIST
  // layout's cards only (Manage = today's operational cards; Preview = the shared traveler card).
  // Map is neither Manage nor Preview, so the Manage/Preview control is shown only in list view.
  const [catalogMode, setCatalogMode] = useState<"manage" | "preview">("manage");
  // FP-2 / Package A item 6: Delete is CONFIRMED, not immediate. Holding the target row (not
  // just its id) lets the dialog name the listing it is about to remove — the Workstation's
  // property/bundle deletes already work this way, and Catalog's was the odd one out.
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
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

  // ── FP-2 / Package A item 5: HUMAN ERRORS ON THE CATALOG MUTATIONS ─────────────────────────
  // All four card mutations below used to render `error.message` — which `apiRequest` builds as
  // `"<status>: <raw body>"`, so a refused activation showed the provider a JSON blob. The
  // server's sentence was already honest; it was just wrapped. `describeCatalogRefusal` unwraps
  // it, names the action that failed, and — for the refusals a provider fixes in the listing
  // editor — hands back a `fixInEditor` flag so the toast can carry the way out (the mock's
  // "Add one →"). No server response changed and no refusal is softened.
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

  // Build category name lookup from DB
  const categoryNameById = dbCategories.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  // Derive unique filter labels from live services
  const usedCategoryIds = Array.from(new Set((services || []).map(s => s.categoryId).filter(Boolean))) as string[];
  const filterLabels = ["All", ...usedCategoryIds.map(id => categoryNameById[id] || id)];

  // Catalog visual parity, item 3: category (dropdown) and status (chips) are two independent
  // filters, AND'd together — narrowing one never resets the other.
  const categoryFilteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => {
          const name = s.categoryId ? categoryNameById[s.categoryId] : undefined;
          return name === selectedCategory;
        });
  const filteredServices = categoryFilteredServices.filter((s) => matchesStatusFilter(s, selectedStatus));
  // Status chip counts are computed against the CATEGORY-filtered set only, so picking a status
  // chip never moves the other chips' counts out from under the provider.
  const statusCounts: Record<StatusFilterKey, number> = {
    all: categoryFilteredServices.length,
    live: categoryFilteredServices.filter((s) => matchesStatusFilter(s, "live")).length,
    in_review: categoryFilteredServices.filter((s) => matchesStatusFilter(s, "in_review")).length,
    draft: categoryFilteredServices.filter((s) => matchesStatusFilter(s, "draft")).length,
  };

  // ── FP-3: property rooms are grouped under their parent property card ───────────────────────
  // A room row is never a top-level card here. It renders as a compact RoomRow inside its
  // property's card; if the property card is NOT in the current filtered view (a category filter
  // that catches the room but not the property, or a property row missing from this read), the
  // room still renders as its own row — an ORPHAN row that names its parent — rather than
  // silently vanishing (§13) or reverting to a generic service card.
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
  // Parent name for an orphan row — from the unfiltered read when the parent exists at all.
  const serviceNameById = new globalThis.Map<string, string>(
    (services ?? []).map((s) => [s.id, s.serviceName || s.name || ""]),
  );

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

  return (
    /* FP-4 full-bleed exception #1: the MAP view's canvas is a three-pane authoring
       surface (selector rail · map · authoring cards) whose usable area IS the shell
       width — capping it would shrink the map for no reading benefit. The LIST view is
       ordinary card content and stays inside the shared container. */
    <ProviderLayout title="Catalog" width={viewMode === "map" ? "full" : "contained"}>
      <div className="p-6 space-y-6">
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
              <Button
                variant={viewMode === "availability" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode("availability")}
                data-testid="button-view-availability"
              >
                {t("header.viewAvailability")}
              </Button>
            </div>
            {/* S5 (ruling 74 disp. 1): every "Add New Service" affordance routes through the
                Workstation one-door launcher first — this is no longer a direct deep link into
                ServiceForm step 1. */}
            <Link href="/provider/workstation">
              <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-service">
                <Plus className="w-4 h-4 mr-2" /> {t("header.addService")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Catalog visual parity, item 3: the mock's All/Live/In review/Draft status chips
            (counts derived client-side) replace the old category button row; category filtering
            stays available as a compact dropdown beside the chips. */}
        {viewMode === "list" && totalServices > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-console-light overflow-hidden">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.key}
                  variant={selectedStatus === f.key ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setSelectedStatus(f.key)}
                  data-testid={`button-status-filter-${f.key}`}
                >
                  {f.label} <span className="ml-1 opacity-70">{statusCounts[f.key]}</span>
                </Button>
              ))}
            </div>
            {filterLabels.length > 1 && (
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 w-48" data-testid="select-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterLabels.map((label) => (
                    <SelectItem
                      key={label}
                      value={label}
                      data-testid={`option-category-filter-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    >
                      {label === "All" ? t("filter.all") : label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          /* S5 (ruling 74 disp. 1): first-time empty state is now a simple pointer at the
             Workstation launcher — the 30-tile category picker that used to live here MOVED
             to that screen (client/src/pages/provider/workstation.tsx) so there is exactly
             ONE place a new listing is born. */
          <div className="text-center py-10" data-testid="empty-state-catalog">
            <h3 className="text-lg font-semibold text-console-darkest mb-1">{t("empty.title")}</h3>
            <p className="text-console-mid text-sm mb-4">{t("empty.body")}</p>
            <Link href="/provider/workstation">
              <Button data-testid="button-add-first-service">
                <Plus className="w-4 h-4 mr-2" /> {t("header.addService")}
              </Button>
            </Link>
          </div>
        ) : viewMode === "map" ? (
          /* Ruling 22(b): the map authoring surface — selector rail, canvas, pin + route cards */
          <CatalogMapView services={services ?? []} />
        ) : viewMode === "availability" ? (
          /* S7 (DECISIONS.md ledger 102, G1): the availability editor — per-method semantics
             (weekly patterns + blackouts for scheduled methods, date-ranges for property/room
             shapes, an honest no-scheduling state for artifact/async methods). Item 4: preselects
             the service named by ?availability=<id> (parsed once, above), the ONE availability
             surface's replacement for the deleted embedded section. */
          <ProviderAvailabilityManager initialServiceId={initialAvailabilityServiceId} />
        ) : isFilterEmpty ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-console-mid font-medium">{t("filter.emptyTitle")}</p>
              <p className="text-console-mid text-sm mt-1">{t("filter.emptyBody")}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSelectedCategory("All");
                  setSelectedStatus("all");
                }}
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
          /* Catalog visual parity, item 1: the mock's slim `.listing` row shape — small thumb,
             name, ONE meta line (category · price/unit · booking-mode word), a right rail of
             health bar + status pill, and a two-item primary action row (Edit + "Promote this →")
             with Duplicate/Delete collapsed into an overflow menu. FP-3: rooms are NOT in this
             list — they render as a one-line summary under their property (or as orphan rows
             after the list). */
          <div className="rounded-lg border border-console-light divide-y divide-console-light bg-white overflow-hidden">
            {topLevelServices.map((service) => {
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
              // FP-3: a property is edited on the Workstation property surface — at its Basics —
              // together with its room types; never in the ServiceForm questionnaire.
              const isProperty = service.productShape === "property";
              const childRooms = isProperty ? roomsByParent.get(service.id) ?? [] : [];
              const editHref = listingEditHref(service);
              const bookingModeLabel = BOOKING_MODE_OPTIONS.find(
                (o) => o.value === (service.bookingMode ?? "instant"),
              )?.label;
              const metaLine = [categoryName, priceDisplay !== "—" ? priceDisplay : null, bookingModeLabel]
                .filter(Boolean)
                .join(" · ");
              const roomPrices = childRooms
                .map((r) => {
                  const p = r.price ?? r.basePrice;
                  return p == null || p === "" ? null : Number(p);
                })
                .filter((n): n is number => n != null && !Number.isNaN(n));
              const roomsExpanded = expandedProperties.has(service.id);
              const propertySummaryLine =
                childRooms.length === 0
                  ? "No room types yet — add one in the Workstation."
                  : `${childRooms.length} room type${childRooms.length === 1 ? "" : "s"}` +
                    (roomPrices.length > 0 ? ` · from $${Math.min(...roomPrices)}/night` : "");

              return (
                <div
                  key={service.id}
                  className={`px-4 py-3 ${!isActive ? "opacity-60" : ""}`}
                  data-testid={`card-service-${service.id}`}
                >
                  <div className="flex items-center gap-3">
                    <ServiceThumb service={service} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-console-darkest truncate">{displayName}</h3>
                        {isBundle && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-bundle-${service.id}`}>
                            {t("card.bundle")}
                          </Badge>
                        )}
                        {isProperty && (
                          <Badge variant="outline" className="text-[10px]" data-testid={`badge-property-${service.id}`}>
                            Property
                          </Badge>
                        )}
                        {service.isFeatured && (
                          <Badge className="bg-primary text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>
                            {t("card.featured")}
                          </Badge>
                        )}
                      </div>
                      {/* ONE meta line — category · price/unit · booking-mode word. Everything
                          else the old card showed inline (description, timeframe, meeting point,
                          affinity tags) is still on the listing's Edit screen; it is not repeated
                          here (mock's compact-row anatomy). */}
                      {metaLine && (
                        <p className="text-xs text-console-mid truncate mt-0.5" data-testid={`text-meta-${service.id}`}>
                          {metaLine}
                        </p>
                      )}
                      {isProperty && (
                        <button
                          type="button"
                          className="text-xs text-console-mid underline decoration-dotted mt-0.5 inline-flex items-center gap-1"
                          onClick={() =>
                            setExpandedProperties((prev) => {
                              const next = new globalThis.Set(prev);
                              next.has(service.id) ? next.delete(service.id) : next.add(service.id);
                              return next;
                            })
                          }
                          data-testid={`button-toggle-rooms-${service.id}`}
                        >
                          {roomsExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          {propertySummaryLine}
                        </button>
                      )}
                    </div>
                    {/* Right rail — slim health bar (click for detail) + the unified status pill,
                        with the active/paused switch kept directly clickable (not folded into a
                        popover) since it is the single most frequent action on this row. */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: service.id, status: checked ? "active" : "paused" })
                        }
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-active-${service.id}`}
                      />
                      <HealthBar service={service} health={healthByServiceId.get(service.id)} />
                      <ListingStatusPill service={service} />
                    </div>
                  </div>

                  {/* Expanded room types — same slim row shape, one level down. */}
                  {isProperty && roomsExpanded && (
                    <div className="mt-2 pl-[86px] space-y-1.5" data-testid={`rooms-block-${service.id}`}>
                      {childRooms.length === 0 ? (
                        <p className="text-xs text-console-mid" data-testid={`rooms-empty-${service.id}`}>
                          No room types yet — add one in the Workstation.
                        </p>
                      ) : (
                        childRooms.map((room) => (
                          <RoomRow key={room.id} room={room} health={healthByServiceId.get(room.id)} />
                        ))
                      )}
                    </div>
                  )}

                  {/* Primary action row: Edit + "Promote this →" — the existing Distribute-this
                      wiring, restyled. Duplicate/Delete fold into the overflow menu; the C3 "Card
                      shows" control is its own gear popover. */}
                  <div className="flex items-center gap-2 mt-2 pl-[86px]">
                    <Link href={editHref}>
                      <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                        <Edit className="w-3.5 h-3.5 mr-1" /> {tCommon("actions.edit")}
                      </Button>
                    </Link>
                    {/* S6: Catalog's ONE outward-facing pointer — storefront, share kit and
                        promote all live on Distribute now. Shown for every listing (Distribute
                        itself shows the honest not-live/blocked state for anything that isn't
                        approved+active yet — no gate needed here). */}
                    <Link href={`/provider/distribute?listing=${service.id}`}>
                      <Button variant="outline" size="sm" data-testid={`button-distribute-${service.id}`}>
                        Promote this <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                    <CardShowsPopover
                      service={service}
                      onPatch={(patch) => displayOptionsMutation.mutate({ id: service.id, patch })}
                      disabled={displayOptionsMutation.isPending}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-console-mid"
                          data-testid={`button-more-${service.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* PB: no Duplicate for bundles — duplicateService copies the
                            provider_services row only, not bundle_components, so the copy would
                            be a component-less bundle (filed server follow-up). FP-3: nor for a
                            property — the same one-row copy would produce a property with no room
                            types, which is not a sellable thing. */}
                        {!isBundle && !isProperty && (
                          <DropdownMenuItem
                            onClick={() => duplicateMutation.mutate(service.id)}
                            disabled={duplicateMutation.isPending}
                            data-testid={`button-duplicate-${service.id}`}
                          >
                            <Copy className="w-3.5 h-3.5 mr-2" /> {tCommon("actions.duplicate")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setDeleteTarget(service)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${service.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> {tCommon("actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FP-3: rooms whose property card is NOT in the current view. They still render as room
            rows — naming the property they belong to — never as generic service cards, and never
            silently dropped (§13). Shown in the manage layout only; Preview is the traveler view. */}
        {catalogMode === "manage" && viewMode === "list" && orphanRooms.length > 0 && (
          <div className="space-y-1.5" data-testid="catalog-orphan-rooms">
            <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide">
              Room types
            </p>
            {orphanRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                parentName={room.parentServiceId ? serviceNameById.get(room.parentServiceId) ?? null : null}
                health={healthByServiceId.get(room.id)}
              />
            ))}
          </div>
        )}

        {/* Catalog visual parity, item 4: the embedded single-slot AvailabilitySection block
            (section-catalog-availability) is DELETED — availability editing now has exactly ONE
            surface, the "availability" view-mode above (S7's ProviderAvailabilityManager), which
            the header toggle and the ?availability=<id> deep-link both land on. */}

        {/* S6 (ruling-74-disposition-6 clarification): the storefront header, the per-service
            share-kit dialog and the Promote (posting-opportunities) block all moved to
            /provider/distribute — this page's own outward-facing pointer is now exactly the
            per-card "Distribute this →" button above, nothing more. See the file header
            comment for the full before/after. */}

        {/* ── FP-2 / Package A item 6 — DELETE ASKS FIRST ─────────────────────────────────────
            Catalog's Delete fired `deleteMutation.mutate(id)` straight off the click: one tap,
            the listing gone, no confirmation and no undo — while the Workstation's property and
            bundle deletes, two clicks away, both confirm. This is the same AlertDialog those use,
            and it NAMES the listing so a mis-aimed click on a dense grid is visible before it
            lands.
            SCOPE (deliberate): this is the plain confirm only. The "refuse + archive when
            travelers have already booked it" half is gap #18 on the execution map — a Wave 3
            lane with a server side — so this dialog does NOT claim anything about bookings it
            has not checked (§13). ── */}
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
