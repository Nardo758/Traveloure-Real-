import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Loader2, CheckCircle, ArrowLeft,
  MapPin, Navigation, Truck, Radius, Info, Image, Clock, FileText, ShieldAlert,
  Users, Route, CalendarClock,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useExpertVerificationStatus } from "@/hooks/use-expert-verification-status";
import { LOCAL_EXPERT_TIERS, TRIP_PLANNER_TIERS, isAffiliateCategory } from "@/lib/earn-roles";
import {
  LocationPointPicker,
  parseStoredPoint,
  type LocationPoint,
} from "@/components/backoffice/location-point-picker";
// D7 (docs/DECISIONS.md ruling 62): the ONE definition of "place-anchored" — the same predicate
// the server scorers and console chips use, never a second local copy.
import { isPlaceAnchored } from "@shared/service-fundamentals";
// D9 (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67): the SAME resolver the
// server re-runs on the write, so what this wizard renders and what the API will accept cannot
// drift. The client calls it only to draw the card — it never decides what it may affirm.
import {
  resolveApplicableAttestations,
  detectProtectedTitleClaims,
  type AttestationKey,
} from "@shared/service-attestations";
import { ServiceAttestationsCard } from "@/components/provider/service-attestations-card";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  categoryKey?: string | null;
  description: string | null;
  requiresBackgroundCheck?: boolean;
  insuranceBand?: number | null;
}

interface CategoryField {
  id: string;
  categoryKey: string;
  fieldKey: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "url" | "multiselect";
  required: boolean;
  options: string[] | null;
  sortOrder: number;
  defaultPriceType?: string | null;
}

interface PricingTier {
  label: string;
  price: number;
  description: string;
}

interface ServiceSubcategory {
  id: string;
  name: string;
  sortOrder: number | null;
}

interface ExpertOfferingType {
  id: string;
  offeringTypeKey: string;
  serviceTier: string;
  displayName: string;
  tagline: string | null;
  deliveryFormats: string[];
  isSurprising: boolean;
  sortOrder: number;
}

// Provider-side /earn catalog row — GET /api/offering-types/services
// (content.routes.ts, service_offering_types). Raw-SQL-backed endpoint, so
// fields come back snake_case (mirrors client/src/pages/earn.tsx's own
// ServiceOfferingType interface) plus `id`, needed here to persist the FK
// (provider_services.service_offering_type_id, migration 148).
interface ProviderOfferingType {
  id: string;
  offering_type_key: string;
  category_key: string;
  display_name: string;
  tagline: string | null;
  is_surprising: boolean;
  market_scoped: string[] | null;
  sort_order: number;
}

interface ServiceFormData {
  name: string;
  categoryId: string;
  subcategoryId: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person" | "Hourly" | "Package tiers" | "Per-event";
  pricingTiers: PricingTier[];
  guestMin: number;
  guestMax: number;
  duration: string;
  deliveryMethod: "in-person" | "video-call" | "hybrid" | "pdf" | "call" | "voice_notes" | "async_messaging";
  // Expert-specific: tier + approval workflow
  expertOfferingTypeId: string;
  approvalStatus: "draft" | "submitted" | "approved" | "rejected";
  // Provider-specific: which /earn service_offering_types row this listing IS
  // (migration 148 FK). "" = unlinked (legacy row, or not yet picked).
  serviceOfferingTypeId: string;
  // Provider-specific: status + features
  active: boolean;
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  contentAffinityTags: string[];
  // Shared: content
  whatIncluded: string[];
  requirements: string[];
  maxConcurrentClients: number;
  // Logistics
  serviceArea: string;
  neighborhood: string;
  neighborhoods: string[];
  meetingPoint: string;
  // L27-P3: the CONFIRMED map point for this listing (migration-129 latitude/longitude).
  // Null = no pin. `locationPrecision` is the row's server-derived precision, carried
  // read-only so the picker can label a migration-129 centroid honestly as approximate —
  // the client never sends it (§13: the server derives precision, see
  // server/utils/service-location.ts).
  locationPoint: LocationPoint | null;
  locationPrecision: string | null;
  pickupAvailable: boolean;
  pickupAddress: string;
  // Content logistics envelope (migration 166, QA_PUNCH_LIST item 20) — the one logistics field
  // provider_services had no home for. Sibling of pickupAddress/meetingPoint (arrival); this is
  // departure. "" = never captured, matches meetingPoint's own optional-string convention.
  dropOffPoint: string;
  serviceRadius: number;
  // SS-4 (ruling 69 disposition 9, migration 199): the PICKUP radius, its own column at last.
  // "" = not set — deliberately a string so the never-captured state survives round-tripping and
  // reaches the server as NULL rather than as a fabricated 0 (§13).
  pickupRadiusKm: string;
  // SS-6 (ruling 69 disposition 9, migration 199): the language(s) the service is DELIVERED in.
  // `null` = never captured (render nothing); `[]` = deliberately cleared. The two must not
  // collapse, so this is nullable rather than defaulting to an empty array.
  deliveryLanguages: string[] | null;
  transportProvided: "yes" | "no" | "not_applicable";
  // ── D7 service-logistics capture (docs/DECISIONS.md ruling 62, migration 195) ───────────────
  // CAPTURE ONLY — nothing reads these yet. Every one is a string here so that "" can mean
  // NEVER CAPTURED and reach the server as an honest NULL (§13), never a fabricated default.
  transportProvision: string;      // transportProvisionEnum | ""
  pickupCoverageMode: string;      // "radius" | "route" | ""  — the ruling-62 AMENDMENT
  durationMinutes: string;
  bufferMinutes: string;
  earliestStartTime: string;       // "HH:MM"
  latestStartTime: string;         // "HH:MM"
  serviceTimezone: string;         // IANA id
  partySizeMin: string;
  partySizeMax: string;
  changeCutoffHours: string;
  canAnchor: "" | "yes" | "no";    // tri-state: "" = never declared
  // Booking terms
  cancellationPolicy: string;
  // X1 (§13): structured policy TYPE — see CANCELLATION_POLICY_TYPE_OPTIONS. "" = not declared.
  cancellationPolicyType: string;
  // Deposits / partial payments (Lane 7, ruling 72) — PROVIDER OPT-IN PER LISTING. When on, the
  // traveler pays a deposit at checkout and the balance in a second checkout before a cutoff.
  depositEnabled: boolean;
  depositType: "" | "percentage" | "flat";
  depositPercentage: string;
  depositFlatAmount: string;
  // ── Travel surcharge (B1, ruling 81) — PROVIDER-CHOSEN MODE per listing. §14 money lane: the
  // provider sets the mode + config here; the CHARGE is derived server-side at checkout from the
  // traveler's confirmed pickup. NEVER-CLOBBER: switching the mode keeps the other modes' config
  // (every field is round-tripped, so a mode change never blanks the sibling values).
  surchargeMode: "" | "none" | "flat" | "zones" | "per_km"; // "" hydrates as none
  surchargeFlatAmount: string;
  surchargePerKm: string;
  surchargeMaxKm: string;
  surchargeTiers: Array<{ radiusKm: string; fee: string }>; // zones mode — saved via a separate PUT
  leadTime: string;
  // Media
  serviceImage: string;
  galleryImages: string[];
  // D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md): the deliverable file URL for a
  // pdf-delivery listing. Same URL-paste mechanism as serviceImage/galleryImages (there is
  // no upload/object-storage rail in this codebase to reuse — every media field here is a
  // pasted URL). Only meaningful (and only rendered) when deliveryMethod === "pdf".
  serviceFile: string;
  // Per-category dynamic attributes
  categoryAttributes: Record<string, any>;
}

interface ServiceFormProps {
  role: "expert" | "provider";
  id?: string;
  onSuccess?: (serviceId: string) => void;
}

/**
 * SS-6 (docs/DECISIONS.md ruling 69 disposition 9, migration 199) — the languages a service can be
 * DELIVERED in. A short starter list for the launch market plus the majors; the column itself is a
 * free jsonb string array, so this list constrains the UI only and never the data. Deliberately NOT
 * pre-selected: an absent value means "the provider never told us" and must render as nothing on
 * the traveler surface, never as a presumed "English" (§13).
 */
const DELIVERY_LANGUAGE_OPTIONS: string[] = [
  "English",
  "日本語",
  "中文",
  "한국어",
  "Français",
  "Deutsch",
  "Español",
  "Italiano",
  "Português",
];

const AFFINITY_TAG_OPTIONS: { value: string; label: string }[] = [
  { value: "hotel_arrival", label: "Hotel arrival/departure" },
  { value: "photo_shoot", label: "Photo shoot" },
  { value: "restaurant_visit", label: "Restaurant visit" },
  { value: "cultural_attraction", label: "Cultural attraction" },
  { value: "wellness_experience", label: "Wellness experience" },
  { value: "nightlife", label: "Nightlife" },
  { value: "hiking_outdoor", label: "Hiking/outdoor" },
  { value: "wedding_proposal", label: "Wedding/proposal" },
  { value: "general_logistics", label: "Any trip (general logistics)" },
];

// ── D7 service-logistics capture (docs/DECISIONS.md ruling 62, migration 195) ────────────────
// Vocabularies mirror shared/schema.ts's transportProvisionEnum / pickupCoverageModeEnum
// (app-enforced, no DB CHECK). "" is offered as a real option: NOT SAYING is honest, and is
// what every pre-195 listing already means (§13).
// `segLabel` is the terse caption for the segmented control (ruling 74 / lane T1 — the mock's
// "Transport & Logistics" step); `label` is the full sentence shown as the helper line under it.
const TRANSPORT_PROVISION_OPTIONS: { value: string; segLabel: string; label: string }[] = [
  { value: "pickup_included", segLabel: "Pickup included", label: "Pickup included — I collect the traveler" },
  { value: "pickup_available", segLabel: "Pickup available", label: "Pickup available — can be arranged" },
  { value: "meet_at_point", segLabel: "Meet at point", label: "Meet at the meeting point — traveler makes their own way" },
  { value: "not_applicable", segLabel: "No transport", label: "Not applicable" },
];
// The pickup provisions — the two that make a coverage AREA meaningful (ruling 62 amendment).
const PICKUP_PROVISIONS: ReadonlySet<string> = new Set(["pickup_included", "pickup_available"]);
/** "" → null (never captured). A non-numeric entry is also null, never a fabricated 0. */
const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// X1 (§13 hardcoded-copy arm): structured cancellation-policy TYPE vocabulary — mirrors
// shared/schema.ts cancellationPolicyTypeEnum. App-enforced (no DB CHECK, migration 144).
//
// SIX-SIGMA PASS (docs/findings/SIX_SIGMA_PROVIDER_PASS.md, Tier A / finding M-1): these
// labels previously described the windows VAGUELY ("well in advance", "shorter notice",
// "limited refund window") while the traveler-facing page (`service-detail.tsx`'s
// CANCELLATION_POLICY_TYPE_LABELS) and the SERVER'S ACTUAL ENFORCEMENT
// (`server/services/cancellation-policy.service.ts` refundPercentFor) both use concrete
// hour thresholds. The seller therefore agreed to a refund schedule whose real terms were
// never shown at the point of choosing. The strings below are now the same concrete windows
// the buyer is shown and the server enforces — one vocabulary across all three surfaces.
// Keep these in step with `refundPercentFor` and `shared/schema.ts`'s
// CANCELLATION_POLICY_TYPE_LABELS if any of them changes.
const CANCELLATION_POLICY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "flexible", label: "Flexible — full refund if cancelled at least 24 hours before the start" },
  { value: "moderate", label: "Moderate — full refund 5+ days before the start; 50% refund 2+ days before" },
  { value: "strict", label: "Strict — 50% refund if cancelled at least 7 days before the start" },
  { value: "non_refundable", label: "Non-refundable — no refund once booked" },
];

function buildEmptyForm(role: "expert" | "provider"): ServiceFormData {
  return {
    name: "",
    categoryId: "",
    subcategoryId: "",
    description: "",
    basePrice: 0,
    priceType: "Fixed",
    pricingTiers: [],
    guestMin: 0,
    guestMax: 0,
    duration: "",
    deliveryMethod: "in-person",
    expertOfferingTypeId: "",
    approvalStatus: "draft",
    serviceOfferingTypeId: "",
    active: true,
    revisionsIncluded: 0,
    includesExpertNotes: false,
    contentAffinityTags: [],
    whatIncluded: [],
    requirements: [],
    maxConcurrentClients: 1,
    serviceArea: "",
    neighborhood: "",
    neighborhoods: [],
    meetingPoint: "",
    locationPoint: null,
    locationPrecision: null,
    pickupAvailable: false,
    pickupAddress: "",
    dropOffPoint: "",
    serviceRadius: 0,
    pickupRadiusKm: "",
    deliveryLanguages: null,
    transportProvided: "not_applicable",
    // D7 (ruling 62): every field starts UNCAPTURED — an empty string, not a guessed default.
    transportProvision: "",
    pickupCoverageMode: "",
    durationMinutes: "",
    bufferMinutes: "",
    earliestStartTime: "",
    latestStartTime: "",
    serviceTimezone: "",
    partySizeMin: "",
    partySizeMax: "",
    changeCutoffHours: "",
    depositEnabled: false,
    depositType: "",
    depositPercentage: "",
    depositFlatAmount: "",
    surchargeMode: "none",
    surchargeFlatAmount: "",
    surchargePerKm: "",
    surchargeMaxKm: "",
    surchargeTiers: [],
    canAnchor: "",
    cancellationPolicy: "",
    cancellationPolicyType: "",
    leadTime: "",
    serviceImage: "",
    galleryImages: [],
    serviceFile: "",
    categoryAttributes: {},
  };
}

function mapPriceTypeFromBackend(raw: string | null | undefined): ServiceFormData["priceType"] {
  switch (raw) {
    case "hourly":        return "Hourly";
    case "package_tiers": return "Package tiers";
    case "per_event":     return "Per-event";
    case "range":         return "Range";
    case "per_person":    return "Per-person";
    default:              return "Fixed";
  }
}

function mapPriceTypeToBackend(display: ServiceFormData["priceType"]): string {
  switch (display) {
    case "Hourly":         return "hourly";
    case "Package tiers":  return "package_tiers";
    case "Per-event":      return "per_event";
    case "Range":          return "range";
    case "Per-person":     return "per_person";
    default:               return "fixed";
  }
}

function mapDefaultPriceTypeHint(hint: string): ServiceFormData["priceType"] | null {
  switch (hint) {
    case "hourly":         return "Hourly";
    case "package_tiers":  return "Package tiers";
    case "per_event":      return "Per-event";
    case "range":          return "Range";
    case "per_person":     return "Per-person";
    case "fixed":          return "Fixed";
    default:               return null;
  }
}

function mapServiceToForm(s: any, role: "expert" | "provider"): ServiceFormData {
  // Parse guest range from priceBasedOn if per_event (e.g. "per_event_10_100")
  let guestMin = 0, guestMax = 0;
  if (s.priceBasedOn && typeof s.priceBasedOn === "string") {
    const m = s.priceBasedOn.match(/per_event_(\d+)_(\d+)/);
    if (m) { guestMin = parseInt(m[1]); guestMax = parseInt(m[2]); }
  }
  return {
    name: s.serviceName || "",
    categoryId: s.categoryId || "",
    subcategoryId: s.subcategoryId || "",
    description: s.description || "",
    basePrice: Number(s.price || 0),
    priceType: mapPriceTypeFromBackend(s.priceType),
    pricingTiers: Array.isArray(s.pricingTiers) ? s.pricingTiers : [],
    guestMin,
    guestMax,
    duration: s.deliveryTimeframe || s.duration || "",
    deliveryMethod: fromCanonicalDelivery(s.deliveryMethod),
    expertOfferingTypeId: s.expertOfferingTypeId || "",
    approvalStatus: s.approvalStatus || "draft",
    serviceOfferingTypeId: s.serviceOfferingTypeId || "",
    active: s.status === "active",
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    contentAffinityTags: Array.isArray(s.contentAffinityTags) ? s.contentAffinityTags : [],
    whatIncluded: (s.whatIncluded as string[]) || [],
    requirements: (s.requirements as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    serviceArea: s.location || "",
    neighborhood: s.neighborhood || "",
    neighborhoods: Array.isArray(s.neighborhoods) ? s.neighborhoods : (s.neighborhood ? [s.neighborhood] : []),
    meetingPoint: s.meetingPoint || "",
    // Existing coordinates + their precision, exactly as stored (decimal → string).
    locationPoint: parseStoredPoint(s.latitude, s.longitude),
    locationPrecision: s.locationPrecision ?? null,
    pickupAvailable: Boolean(s.pickupAvailable),
    pickupAddress: s.pickupAddress || "",
    dropOffPoint: s.dropOffPoint || "",
    serviceRadius: Number(s.serviceRadius || 0),
    // NULL round-trips as "" / null — never coerced into a number or a presumed language.
    pickupRadiusKm: s.pickupRadiusKm == null ? "" : String(s.pickupRadiusKm),
    deliveryLanguages: Array.isArray(s.deliveryLanguages) ? (s.deliveryLanguages as string[]) : null,
    transportProvided: (s.transportProvided === "yes" || s.transportProvided === "no" ? s.transportProvided : "not_applicable"),
    // D7 (ruling 62): NULL on the row round-trips back as "" — still uncaptured, never coerced
    // into a value the provider did not choose.
    transportProvision: s.transportProvision || "",
    pickupCoverageMode: s.pickupCoverageMode || "",
    durationMinutes: s.durationMinutes == null ? "" : String(s.durationMinutes),
    bufferMinutes: s.bufferMinutes == null ? "" : String(s.bufferMinutes),
    earliestStartTime: s.earliestStartTime || "",
    latestStartTime: s.latestStartTime || "",
    serviceTimezone: s.serviceTimezone || "",
    partySizeMin: s.partySizeMin == null ? "" : String(s.partySizeMin),
    partySizeMax: s.partySizeMax == null ? "" : String(s.partySizeMax),
    changeCutoffHours: s.changeCutoffHours == null ? "" : String(s.changeCutoffHours),
    depositEnabled: !!s.depositEnabled,
    depositType: ((s.depositType as any) === "percentage" || (s.depositType as any) === "flat") ? (s.depositType as any) : "",
    depositPercentage: s.depositPercentage == null ? "" : String(s.depositPercentage),
    depositFlatAmount: s.depositFlatAmount == null ? "" : String(s.depositFlatAmount),
    // B1 (ruling 81): NULL mode round-trips as 'none'. Amounts stay "" when never set (§13). Tiers
    // are hydrated separately (a child-row GET); mapServiceToForm only sees the row here.
    surchargeMode: (["none", "flat", "zones", "per_km"].includes(s.surchargeMode) ? s.surchargeMode : "none") as any,
    surchargeFlatAmount: s.surchargeFlatAmount == null ? "" : String(s.surchargeFlatAmount),
    surchargePerKm: s.surchargePerKm == null ? "" : String(s.surchargePerKm),
    surchargeMaxKm: s.surchargeMaxKm == null ? "" : String(s.surchargeMaxKm),
    surchargeTiers: [],
    canAnchor: s.canAnchor === true ? "yes" : s.canAnchor === false ? "no" : "",
    cancellationPolicy: s.cancellationPolicy || "",
    cancellationPolicyType: s.cancellationPolicyType || "",
    leadTime: s.leadTime || "",
    serviceImage: s.serviceImage || "",
    galleryImages: Array.isArray(s.galleryImages) ? s.galleryImages : [],
    // Owner-only field — this hydration only ever runs off the owner-gated
    // GET /api/provider/services/:id read, never a public surface.
    serviceFile: s.serviceFile || "",
    categoryAttributes: (s.categoryAttributes && typeof s.categoryAttributes === "object") ? s.categoryAttributes : {},
  };
}

// Canonical service-template row (from GET /api/service-templates) — the wizard's
// template gallery source, absorbed into ServiceForm in Phase 2.
interface ServiceTemplate {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  suggestedPrice: string | null;
  requirements: unknown;
  whatIncluded: unknown;
}

const templateArrayToStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? (v as string[])
    : typeof v === "string" && v
    ? v.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

// ── Delivery-method canonicalization (migration-109 CHECK) ──────────────────
// The DB CHECK enforces the canonical 7: pdf, video, call, in_person,
// voice_notes, async_messaging, hybrid. ServiceForm's UI historically used the
// legacy labels in-person / video-call / hybrid and wrote them RAW — which the
// CHECK rejects (in-person / video-call are not canonical), so every create/edit
// with those two values failed on insert. Map at the write boundary so all
// ServiceForm writes are CHECK-valid, and on the way in so edits/templates
// (which now carry canonical values post-109) display correctly in the picker.
// T3-2: fromCanonicalDelivery used to collapse pdf/call/voice_notes/async_messaging
// (and in_person) all onto "in-person" on read — a service actually stored as e.g.
// 'pdf' would reopen showing "In-Person" selected (+ a spuriously-required Meeting
// Point), and re-saving without touching the field would silently rewrite it to
// in_person. Every one of the 7 canonical values now has its own faithful UI
// value/option, so fromCanonicalDelivery ∘ toCanonicalDelivery is the identity on
// all 7 and a no-change save always sends back exactly what was loaded.
type UiDelivery = ServiceFormData["deliveryMethod"];
const toCanonicalDelivery = (v: string): string =>
  v === "in-person" ? "in_person" : v === "video-call" ? "video" : v; // hybrid, pdf, call, voice_notes, async_messaging + already-canonical pass through
const fromCanonicalDelivery = (v: string | null | undefined): UiDelivery =>
  v === "video" || v === "video-call"
    ? "video-call"
    : v === "hybrid"
    ? "hybrid"
    : v === "pdf" || v === "call" || v === "voice_notes" || v === "async_messaging"
    ? v
    : "in-person"; // in_person/in-person (and any unrecognized value) → in-person

// Map tier deliveryFormats to the form's deliveryMethod values
function tierFormatsToAllowedMethods(formats: string[]): Set<string> {
  const methodMap: Record<string, string[]> = {
    "video": ["video-call"],
    "live_text": ["video-call"],
    "chat": ["video-call", "in-person"],
    "written": ["in-person"],
    "done_for_you": ["in-person", "hybrid"],
    "hybrid": ["hybrid"],
    "in_person": ["in-person"],
  };
  const allowed = new Set<string>();
  for (const fmt of formats) {
    for (const m of (methodMap[fmt] ?? [])) allowed.add(m);
  }
  return allowed;
}

// Fallback label for a category_key when /api/service-categories has no
// matching row's name (e.g. transient catalog drift) — replace_ with space,
// title-case. aff_* keys never reach here (filtered out of
// providerOfferingTypes upstream).
function prettifyCategoryKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ServiceForm({ role, id, onSuccess }: ServiceFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [creationSuccess, setCreationSuccess] = useState(false);
  // L2: the post-create success copy must reflect what actually happened server-side
  // (the row's real status/approvalStatus), never just which button was pressed — a
  // create is clamped server-side to a non-approved born state (D1a), so "Publish"
  // does not mean "live" the way the old hardcoded copy claimed.
  const [creationOutcome, setCreationOutcome] = useState<{ status?: string | null; approvalStatus?: string | null }>({});
  const [newIncluded, setNewIncluded] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  // L27-P3 (§13): only an explicit Confirm/Remove in the picker sends `locationPoint`.
  // Untouched ⇒ the key is omitted entirely ⇒ the server leaves latitude/longitude/
  // location_precision exactly as they are, so an unrelated edit can never turn a
  // migration-129 neighborhood centroid into an `'exact'` claim.
  const [locationPointTouched, setLocationPointTouched] = useState(false);

  // Audit item #10 (PROVIDER_CONSOLE_IMPROVEMENT_AUDIT.md): the form is a 4-step
  // wizard instead of one ~7-viewport scroll. LAYOUT ONLY — the field set, zod/
  // server validation, payload shape and endpoints are untouched. Navigation is
  // FREE in both create and edit mode (steps are clickable, Next/Back never
  // validate) — one code path for both modes; in edit mode the clickable
  // indicator doubles as jump-nav, so a separate anchored layout isn't needed.
  // Required-field enforcement stays exactly where it was (button disabled
  // states + createMutation's own throws); the only addition is that a
  // submit-time miss jumps the user to the step that holds the field.
  const [currentStep, setCurrentStep] = useState(1);

  // Single category taxonomy
  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  // Expert 5-tier offering types catalog
  const { data: expertOfferingTypes = [] } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/expert/offering-types"],
    enabled: role === "expert",
    staleTime: 5 * 60_000,
  });

  // Provider /earn offering catalog (offering-first provider create, §17).
  // Public, 5-min-cached endpoint — content.routes.ts already filters is_active=true.
  const { data: providerOfferingTypesRaw = [] } = useQuery<ProviderOfferingType[]>({
    queryKey: ["/api/offering-types/services"],
    enabled: role === "provider",
    staleTime: 5 * 60_000,
  });

  // Affiliate-sourced categories (aff_*) are partner inventory, not something a
  // provider signs up to offer (see earn-roles.ts isAffiliateCategory) — never
  // creatable here. Filtered client-side; the public endpoint stays unchanged.
  const providerOfferingTypes = providerOfferingTypesRaw.filter(
    (o) => !!o.category_key && !isAffiliateCategory(o.category_key) && (o as any).is_active !== false
  );

  // Provider offering picker (§17 compaction): the ~114-option list stays
  // collapsed to a one-line summary once a selection exists (including on
  // edit-mode load), and only expands to the search+list on "Change" or when
  // nothing is selected yet — see the render block below for the derivation.
  const [offeringPickerOpen, setOfferingPickerOpen] = useState(false);
  const [offeringSearchQuery, setOfferingSearchQuery] = useState("");

  // "Don't see your offering?" (ratified flow, mockup §06c — migration 189 /
  // offering_type_requests). Shown at the bottom of the picker's list AND in its
  // zero-match state. Submitting auto-selects the catch-all 'custom_other_offering'
  // (seeded by migration 189) via the existing handleSelectProviderOffering path so the
  // provider can proceed immediately — the request itself is reviewed separately by admin.
  const [requestOfferingOpen, setRequestOfferingOpen] = useState(false);
  const [requestOfferingName, setRequestOfferingName] = useState("");
  const [requestOfferingDescription, setRequestOfferingDescription] = useState("");
  const [requestOfferingConfirmedName, setRequestOfferingConfirmedName] = useState<string | null>(null);

  // Category label lookup for the offering picker's group headers — prefers
  // the /api/service-categories row's name, falls back to prettifying the
  // offering's own category_key (never fabricates a category).
  const categoryLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories as ServiceCategory[]) {
      if (c.categoryKey) map.set(c.categoryKey, c.name);
    }
    return map;
  }, [categories]);

  // Group the offering catalog by category_key for the compact picker,
  // applying the search filter (display_name + tagline + group label,
  // case-insensitive) and dropping groups left empty by the filter. Group
  // order follows first appearance in the already sort_order-sorted API
  // response; item order within a group is untouched.
  const offeringGroups = useMemo(() => {
    const q = offeringSearchQuery.trim().toLowerCase();
    const groups: { key: string; label: string; items: ProviderOfferingType[] }[] = [];
    const indexByKey = new Map<string, number>();
    for (const o of providerOfferingTypes) {
      const label = categoryLabelByKey.get(o.category_key) ?? prettifyCategoryKey(o.category_key);
      if (q) {
        const haystack = `${o.display_name} ${o.tagline ?? ""} ${label}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      let idx = indexByKey.get(o.category_key);
      if (idx === undefined) {
        idx = groups.length;
        indexByKey.set(o.category_key, idx);
        groups.push({ key: o.category_key, label, items: [] });
      }
      groups[idx].items.push(o);
    }
    return groups;
  }, [providerOfferingTypes, categoryLabelByKey, offeringSearchQuery]);

  // Partition the expert tier picker by the signed-in user's expert role, using
  // the existing ratified serviceTier→role vocabulary in lib/earn-roles.ts
  // (never invented here). That module only defines a partition for
  // local_expert (LOCAL_EXPERT_TIERS) vs travel_expert (TRIP_PLANNER_TIERS) —
  // event_planner / executive_assistant / not-yet-loaded users have no defined
  // subset, so they see the full unpartitioned list rather than a fabricated one.
  const visibleExpertOfferingTypes = (() => {
    if (role !== "expert") return expertOfferingTypes;
    const userRole = (user as any)?.role;
    if (userRole === "local_expert") {
      return expertOfferingTypes.filter((t) => (LOCAL_EXPERT_TIERS as readonly string[]).includes(t.serviceTier));
    }
    if (userRole === "travel_expert" || userRole === "expert") {
      return expertOfferingTypes.filter((t) => (TRIP_PLANNER_TIERS as readonly string[]).includes(t.serviceTier));
    }
    return expertOfferingTypes;
  })();

  // Canonical service-template gallery (expert create-from-template — Phase 2).
  // Selection pre-fills the form; the write still goes through the canonical
  // create mutation below (draft/submitted), NOT the born-approved from-template route.
  const { data: serviceTemplates = [] } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
    enabled: role === "expert" && !isEditMode,
    staleTime: 5 * 60_000,
  });

  const [formData, setFormData] = useState<ServiceFormData>(buildEmptyForm(role));

  const selectedProviderOffering = providerOfferingTypes.find(
    (o) => o.id === formData.serviceOfferingTypeId
  ) ?? null;
  const selectedProviderOfferingLabel = selectedProviderOffering
    ? (categoryLabelByKey.get(selectedProviderOffering.category_key) ?? prettifyCategoryKey(selectedProviderOffering.category_key))
    : null;

  const { data: subcategories = [] } = useQuery<ServiceSubcategory[]>({
    queryKey: ["/api/service-categories", formData.categoryId, "subcategories"],
    enabled: !!formData.categoryId,
  });

  const { data: allNeighborhoods = [] } = useQuery<Array<{ id: string; city: string; country: string; name: string; slug: string }>>({
    queryKey: ["/api/city-neighborhoods"],
  });

  // Fetch the selected category's categoryKey so we can load its dynamic fields
  const selectedCategoryKey = (categories as ServiceCategory[]).find((c) => c.id === formData.categoryId)?.categoryKey ?? null;

  const { data: categoryFields = [] } = useQuery<CategoryField[]>({
    queryKey: ["/api/service-categories", selectedCategoryKey, "fields"],
    enabled: !!selectedCategoryKey,
  });

  const { data: existingService, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/provider/services", id],
    enabled: isEditMode,
  });

  // B1 (ruling 81): the saved zones-mode surcharge rings — a child-row read, hydrated into the form
  // separately from the listing row (mapServiceToForm only sees the parent). Edit mode only.
  const { data: surchargeTierState } = useQuery<{ surchargeTiers: Array<{ radiusKm: string; fee: string }> }>({
    queryKey: ["/api/provider/services", id, "surcharge-tiers"],
    enabled: isEditMode,
  });

  // ── D9 attestations (ruling 62's D9 clause / ruling 67) ──────────────────────────────────
  // Affirmations already ON RECORD for this listing. Edit mode only — a listing that does not
  // exist yet can have none (the record is a child row of the service). Read-only here: the
  // record is append-only and this query never writes.
  const { data: attestationState } = useQuery<{
    applicable: Array<{ key: string; affirmedAt: string | null }>;
    affirmedOther: Array<{ key: string; affirmedAt: string }>;
  }>({
    queryKey: ["/api/provider/services", id, "attestations"],
    enabled: isEditMode,
  });
  // Locally checked-but-unsaved boxes. Written to the server only AFTER the listing save
  // succeeds — the affirmation is a child row and needs the service id to exist.
  const [attestationChecks, setAttestationChecks] = useState<Record<string, boolean>>({});

  const categoryPreSelected = useRef(false);
  const offeringTypeKeyPreSelected = useRef(false);
  const providerOfferingTypeKeyPreSelected = useRef(false);

  const templatePreFilled = useRef(false);

  // Pre-fill from ?tpl_* URL params (set by "Use This Template" on service-templates page)
  useEffect(() => {
    if (!isEditMode && !templatePreFilled.current) {
      const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const tplName = sp.get("tpl_name");
      if (!tplName) return;
      templatePreFilled.current = true;

      // tpl_delivery carries the canonical delivery value from the template row (post-109).
      const deliveryMethod: ServiceFormData["deliveryMethod"] =
        fromCanonicalDelivery(sp.get("tpl_delivery") || "");

      let whatIncluded: string[] = [];
      try {
        const raw = sp.get("tpl_included");
        if (raw) whatIncluded = JSON.parse(raw);
      } catch {
        whatIncluded = [];
      }

      setFormData((prev) => ({
        ...prev,
        name: tplName,
        description: sp.get("tpl_desc") || prev.description,
        basePrice: parseFloat(sp.get("tpl_price") || "0") || prev.basePrice,
        duration: sp.get("tpl_duration") || prev.duration,
        deliveryMethod,
        whatIncluded: whatIncluded.length > 0 ? whatIncluded : prev.whatIncluded,
      }));
    }
  }, [isEditMode]);

  // Pre-select tier from ?offeringTypeKey= URL param (used by /earn CTA)
  useEffect(() => {
    if (
      role !== "expert" ||
      isEditMode ||
      expertOfferingTypes.length === 0 ||
      offeringTypeKeyPreSelected.current
    ) return;
    const raw = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("offeringTypeKey") || ""
      : "";
    if (!raw) return;
    const match = expertOfferingTypes.find((t) => t.offeringTypeKey === raw);
    if (match) {
      offeringTypeKeyPreSelected.current = true;
      setFormData((prev) => ({ ...prev, expertOfferingTypeId: match.id }));
    }
  }, [expertOfferingTypes, isEditMode, role]);

  // Pre-select the /earn offering from ?offeringTypeKey= for providers (same
  // URL contract as the expert effect above — the /earn CTA passes this key).
  // Waits for both catalogs so the derived category can resolve in one step.
  useEffect(() => {
    if (
      role !== "provider" ||
      isEditMode ||
      providerOfferingTypes.length === 0 ||
      categories.length === 0 ||
      providerOfferingTypeKeyPreSelected.current
    ) return;
    const raw = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("offeringTypeKey") || ""
      : "";
    if (!raw) return;
    const match = providerOfferingTypes.find((o) => o.offering_type_key === raw);
    if (match) {
      providerOfferingTypeKeyPreSelected.current = true;
      const catMatch = categories.find((c) => c.categoryKey === match.category_key);
      setFormData((prev) => ({
        ...prev,
        serviceOfferingTypeId: match.id,
        categoryId: catMatch ? catMatch.id : prev.categoryId,
      }));
    }
  }, [providerOfferingTypes, categories, isEditMode, role]);

  // Pre-select category from ?category= URL param
  useEffect(() => {
    if (!isEditMode && categories.length > 0 && !categoryPreSelected.current) {
      const raw = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("category") || ""
        : "";
      if (raw) {
        const lower = raw.toLowerCase();
        const match = categories.find((c) =>
          c.name.toLowerCase() === lower ||
          c.slug.toLowerCase() === lower ||
          c.name.toLowerCase().includes(lower) ||
          lower.includes(c.name.toLowerCase())
        );
        if (match) {
          setFormData((prev) => ({ ...prev, categoryId: match.id }));
          categoryPreSelected.current = true;
        }
      }
    }
  }, [categories, isEditMode]);

  useEffect(() => {
    if (existingService) {
      setFormData(mapServiceToForm(existingService, role));
    }
  }, [existingService, role]);

  // B1: merge the saved zone rings into the form once they load (after mapServiceToForm has set the
  // rest). Strings so the number inputs stay controlled; NULL/absent stays an empty list (§13).
  useEffect(() => {
    const tiers = surchargeTierState?.surchargeTiers;
    if (Array.isArray(tiers) && tiers.length > 0) {
      setFormData((prev) => ({
        ...prev,
        surchargeTiers: tiers.map((t) => ({ radiusKm: String(t.radiusKm ?? ""), fee: String(t.fee ?? "") })),
      }));
    }
  }, [surchargeTierState]);

  // Pre-select category's default price type when creating a new service.
  // We only stamp prevCategoryIdRef *after* categoryFields has loaded so
  // the effect re-fires once the async query resolves.
  const prevCategoryIdRef = useRef<string>("");
  useEffect(() => {
    if (isEditMode) return;
    if (!formData.categoryId) return;
    if (formData.categoryId === prevCategoryIdRef.current) return;
    // Wait until fields for this category have actually arrived
    if (categoryFields.length === 0) return;
    // Mark as processed now that we have data
    prevCategoryIdRef.current = formData.categoryId;
    const hint = categoryFields[0]?.defaultPriceType;
    if (hint) {
      const mapped = mapDefaultPriceTypeHint(hint);
      if (mapped) setFormData((prev) => ({ ...prev, priceType: mapped, pricingTiers: [] }));
    }
  }, [categoryFields, formData.categoryId, isEditMode]);

  const set = (key: keyof ServiceFormData, value: any) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  // Offering-first provider create (§17): picking a /earn offering sets the FK
  // and DERIVES the category from the offering's category_key — the
  // chip↔picker vocabulary break this closes. Category becomes a read-only
  // display once an offering is chosen (see the Category field below).
  const handleSelectProviderOffering = (o: ProviderOfferingType) => {
    const catMatch = categories.find((c) => c.categoryKey === o.category_key);
    setFormData((prev) => ({
      ...prev,
      serviceOfferingTypeId: o.id,
      categoryId: catMatch ? catMatch.id : prev.categoryId,
      subcategoryId: "",
      categoryAttributes: {},
    }));
  };

  // POST /api/me/offering-requests (offering-requests.routes.ts). userId comes from the
  // session server-side (§14-by-analogy) — never sent from here.
  const requestOfferingMutation = useMutation({
    mutationFn: async () => {
      const name = requestOfferingName.trim();
      return apiRequest("POST", "/api/me/offering-requests", {
        requestedName: name,
        description: requestOfferingDescription.trim() || undefined,
      });
    },
    onSuccess: () => {
      const confirmedName = requestOfferingName.trim();
      setRequestOfferingConfirmedName(confirmedName);
      setRequestOfferingOpen(false);
      setRequestOfferingName("");
      setRequestOfferingDescription("");
      // Auto-select the catch-all offering so the provider can proceed immediately
      // instead of being blocked on admin review of the new type.
      const catchAll = providerOfferingTypes.find((o) => o.offering_type_key === "custom_other_offering");
      if (catchAll) handleSelectProviderOffering(catchAll);
      setOfferingPickerOpen(false);
      setOfferingSearchQuery("");
    },
  });

  const handleAddIncluded = () => {
    if (newIncluded.trim()) {
      set("whatIncluded", [...formData.whatIncluded, newIncluded.trim()]);
      setNewIncluded("");
    }
  };

  const handleRemoveIncluded = (index: number) => {
    set("whatIncluded", formData.whatIncluded.filter((_, i) => i !== index));
  };

  const handleAddRequirement = () => {
    if (newRequirement.trim()) {
      set("requirements", [...formData.requirements, newRequirement.trim()]);
      setNewRequirement("");
    }
  };

  const handleRemoveRequirement = (index: number) => {
    set("requirements", formData.requirements.filter((_, i) => i !== index));
  };

  // Create-from-template (Phase 2): pre-fill the form from a canonical template
  // row. The write is the normal ServiceForm submit → canonical POST with
  // approvalStatus draft/submitted; never born-approved.
  const applyTemplate = (t: ServiceTemplate) => {
    setFormData((prev) => ({
      ...prev,
      name: t.title,
      description: t.description ?? prev.description,
      categoryId: t.categoryId ?? prev.categoryId,
      deliveryMethod: fromCanonicalDelivery(t.deliveryMethod),
      duration: t.deliveryTimeframe ?? prev.duration,
      basePrice: t.suggestedPrice ? (parseFloat(t.suggestedPrice) || prev.basePrice) : prev.basePrice,
      requirements: templateArrayToStrings(t.requirements),
      whatIncluded: templateArrayToStrings(t.whatIncluded),
    }));
    toast({
      title: "Loaded from template",
      description: "Review and edit below, then Save as draft or Submit for review — it is never auto-approved.",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddAnother = () => {
    setCreationSuccess(false);
    setCreationOutcome({});
    setCurrentStep(1);
    setFormData(buildEmptyForm(role));
    setLocationPointTouched(false);
    setNewIncluded("");
    setNewRequirement("");
    setRequestOfferingConfirmedName(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createMutation = useMutation({
    mutationFn: async (submitAction: "draft" | "submit" | "publish") => {
      // In-person / hybrid services must tell the traveler WHERE to meet before they go live.
      // Enforced at submit/publish only — a draft is allowed to be incomplete. Existing listings
      // are grandfathered until their next submit/publish (the has_insurance/F2 precedent).
      const isInPerson = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";
      // D7 (ruling 62): the SHARED predicate decides where the logistics capture applies, so
      // "place-anchored" means the same thing here as it does in the server scorers and the
      // console chips (shared/service-fundamentals.ts).
      const isPlaceAnchoredListing = isPlaceAnchored({
        deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
        productShape: existingService?.productShape ?? null,
      });
      const isPickupProvision = PICKUP_PROVISIONS.has(formData.transportProvision);
      if (submitAction !== "draft" && isInPerson && !formData.meetingPoint.trim()) {
        throw new Error("Add a meeting point — in-person services must show travelers where to meet. Save as draft to finish later.");
      }

      // Offering-first / tier-required on a NEW create only (submit/publish, not draft) —
      // editing a legacy service with no linkage must still save (don't brick old rows).
      if (!isEditMode && submitAction !== "draft") {
        if (role === "provider" && !formData.serviceOfferingTypeId) {
          throw new Error("Pick an offering from the /earn catalog before publishing — it links this listing to what you signed up to provide. Save as draft to finish later.");
        }
        if (role === "expert" && !formData.expertOfferingTypeId) {
          throw new Error("Select a service tier before submitting for approval. Save as draft to finish later.");
        }
      }

      // Compute price scalar and priceBasedOn from the selected pricing model
      let priceScalar = String(formData.basePrice);
      let pricingTiersPayload: PricingTier[] = [];
      let priceBasedOn: string | null = null;

      if (formData.priceType === "Package tiers" && formData.pricingTiers.length > 0) {
        pricingTiersPayload = formData.pricingTiers;
        const validPrices = formData.pricingTiers.map((t) => t.price).filter((p) => p > 0);
        if (validPrices.length > 0) priceScalar = String(Math.min(...validPrices));
      } else if (formData.priceType === "Per-event") {
        if (formData.guestMin > 0 && formData.guestMax > 0) {
          priceBasedOn = `per_event_${formData.guestMin}_${formData.guestMax}`;
        } else {
          priceBasedOn = "per_event";
        }
      }

      const payload: Record<string, any> = {
        serviceName: formData.name,
        categoryId: formData.categoryId || undefined,
        subcategoryId: formData.subcategoryId || undefined,
        description: formData.description,
        price: priceScalar,
        priceType: mapPriceTypeToBackend(formData.priceType),
        pricingTiers: pricingTiersPayload,
        priceBasedOn,
        deliveryTimeframe: formData.duration,
        // Canonicalize to the migration-109 CHECK vocabulary before write.
        deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
        whatIncluded: formData.whatIncluded,
        requirements: formData.requirements,
        maxConcurrentBookings: formData.maxConcurrentClients,
        location: formData.serviceArea || "Unknown",
        neighborhood: formData.neighborhoods.length > 0 ? formData.neighborhoods[0] : (formData.neighborhood || null),
        neighborhoods: formData.neighborhoods,
        meetingPoint: formData.meetingPoint || null,
        pickupAvailable: formData.pickupAvailable,
        pickupAddress: formData.pickupAvailable ? (formData.pickupAddress || null) : null,
        // Content logistics envelope (migration 166, QA_PUNCH_LIST item 20) — mirrors
        // pickupAddress's own pickupAvailable gate; drop-off only means something alongside pickup.
        dropOffPoint: formData.pickupAvailable ? (formData.dropOffPoint || null) : null,
        // D7 NEVER-CLOBBER (ruling 62's amendment, §13): a saved radius survives a provider
        // choosing the ROUTE coverage mode. Under any pickup provision the radius is kept as
        // entered — switching coverage mode changes what RENDERS, never what is stored. The
        // historical `pickupAvailable` clearing rule is left exactly as it was for every other
        // case (an explicit pickup toggle-OFF is a different act from a coverage-mode choice).
        serviceRadius:
          formData.serviceRadius > 0 && (formData.pickupAvailable || isPickupProvision)
            ? formData.serviceRadius
            : null,
        // SS-4 (ruling 69 disposition 9): the pickup radius writes its OWN column. `serviceRadius`
        // above is untouched by this field and vice versa — that separation IS the fix, and the
        // two-labels-one-column notice the six-sigma pass added is retired with it. "" stays NULL
        // ("not set"), never 0.
        pickupRadiusKm: formData.pickupRadiusKm.trim() === "" ? null : (parseInt(formData.pickupRadiusKm, 10) || 0),
        // SS-6 (ruling 69 disposition 9): sent only once the provider has touched the field —
        // `null` here means "never captured" and must not be confused with a cleared `[]`.
        deliveryLanguages: formData.deliveryLanguages,
        // Transport disclosure only carries meaning for an in-person/hybrid meeting; remote → not_applicable.
        transportProvided: isInPerson ? formData.transportProvided : "not_applicable",
        // ── D7 service-logistics capture (ruling 62, migration 195) ─────────────────────────
        // Only sent for place-anchored listings (the shared isPlaceAnchored predicate) — the
        // keys are OMITTED entirely otherwise, so a PATCH on a pdf/call listing leaves whatever
        // was captured earlier untouched rather than wiping it (§13).
        ...(isPlaceAnchoredListing
          ? {
              transportProvision: formData.transportProvision || null,
              // The coverage MODE is meaningless without a pickup provision — clear the CHOICE
              // when it no longer applies. This clears no DATA: `serviceRadius` above and the
              // `service_route_points` rows are both untouched by this write.
              pickupCoverageMode: isPickupProvision ? (formData.pickupCoverageMode || null) : null,
              durationMinutes: intOrNull(formData.durationMinutes),
              bufferMinutes: intOrNull(formData.bufferMinutes),
              earliestStartTime: formData.earliestStartTime || null,
              latestStartTime: formData.latestStartTime || null,
              serviceTimezone: formData.serviceTimezone.trim() || null,
              partySizeMin: intOrNull(formData.partySizeMin),
              partySizeMax: intOrNull(formData.partySizeMax),
              changeCutoffHours: intOrNull(formData.changeCutoffHours),
              canAnchor: formData.canAnchor === "" ? null : formData.canAnchor === "yes",
              // ── B1 travel surcharge CONFIG (ruling 81) — §14 money lane, but this WRITE only sets
              // the listing config; the CHARGE is derived server-side at checkout from the traveler's
              // confirmed pickup, never off req.body. NEVER-CLOBBER (ruling 62): every field is sent
              // on every save, so switching the mode preserves the other modes' amounts. Amounts stay
              // NULL when never set (§13), never a fabricated 0.
              surchargeMode: formData.surchargeMode || "none",
              surchargeFlatAmount: formData.surchargeFlatAmount.trim() === "" ? null : formData.surchargeFlatAmount.trim(),
              surchargePerKm: formData.surchargePerKm.trim() === "" ? null : formData.surchargePerKm.trim(),
              surchargeMaxKm: intOrNull(formData.surchargeMaxKm),
            }
          : {}),
        cancellationPolicy: formData.cancellationPolicy || null,
        cancellationPolicyType: formData.cancellationPolicyType || null,
        // Deposits (Lane 7, ruling 72): provider opt-in. When off, everything is cleared to null so
        // the listing checks out at the full price (§13). The server derives the actual deposit
        // amount at checkout from these persisted values × the line total (§14) — never from a
        // traveler's request body.
        depositEnabled: formData.depositEnabled,
        depositType: formData.depositEnabled ? (formData.depositType || null) : null,
        depositPercentage:
          formData.depositEnabled && formData.depositType === "percentage" && formData.depositPercentage.trim() !== ""
            ? (parseInt(formData.depositPercentage, 10) || null)
            : null,
        depositFlatAmount:
          formData.depositEnabled && formData.depositType === "flat" && formData.depositFlatAmount.trim() !== ""
            ? formData.depositFlatAmount
            : null,
        leadTime: formData.leadTime || null,
        serviceImage: formData.serviceImage || null,
        galleryImages: formData.galleryImages,
        // D3: the deliverable file only means something for pdf delivery — never send a
        // stale value up for a listing that has since switched to a different delivery
        // method (a leftover file URL on a call/in-person row would be dead weight, and
        // could confuse the delivery_asset fundamentals check).
        serviceFile: formData.deliveryMethod === "pdf" ? (formData.serviceFile || null) : null,
        categoryAttributes: formData.categoryAttributes,
      };

      // L27-P3: the confirmed map point. Sent ONLY when the earner actually used the
      // picker in this session — an object for a confirmed pin, explicit `null` to remove
      // one. Omitted otherwise so the server leaves the stored coordinates/precision
      // untouched (§13). The client never sends latitude/longitude/locationPrecision
      // directly: the server strips those and derives `'exact'` from this field alone.
      if (locationPointTouched) {
        payload.locationPoint = formData.locationPoint;
      }

      // Role-specific fields
      if (role === "provider") {
        payload.includesExpertNotes = formData.includesExpertNotes;
        payload.contentAffinityTags = formData.contentAffinityTags;
        payload.status = submitAction === "publish" ? "active" : "draft";
        if (formData.serviceOfferingTypeId) {
          payload.serviceOfferingTypeId = formData.serviceOfferingTypeId;
        }
      } else {
        // Expert: send tier FK + approvalStatus for workflow
        if (formData.expertOfferingTypeId) {
          payload.expertOfferingTypeId = formData.expertOfferingTypeId;
        }
        if (submitAction === "draft") {
          payload.approvalStatus = "draft";
          payload.status = "draft";
        } else if (submitAction === "submit") {
          payload.approvalStatus = "submitted";
          payload.status = "draft";
        }
      }
      // revisionsIncluded is shared (expert + provider)
      payload.revisionsIncluded = formData.revisionsIncluded;

      // SS-5a (ruling 69 disposition 3): the ticked confirmations travel WITH the write, because
      // the publish gate is judged before the row exists on a create — a child row cannot pre-date
      // its parent. The server re-derives what applies and refuses anything outside it; this sends
      // only keys, never an opinion about applicability.
      const affirmWithWrite = Object.entries(attestationChecks)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (affirmWithWrite.length > 0) {
        payload.affirmAttestations = affirmWithWrite;
      }

      // L2: read back the actual created/updated row (status + approvalStatus) rather
      // than assuming from submitAction — the server clamps the born approval state
      // (D1a), so what the client asked for and what actually landed can diverge.
      const res = isEditMode
        ? await apiRequest("PATCH", `/api/provider/services/${id}`, payload)
        : await apiRequest("POST", "/api/provider/services", payload);
      const service = await res.json().catch(() => null);

      // ── D9 attestations (ruling 62's D9 clause / ruling 67) ────────────────────────────
      // An affirmation is a CHILD ROW, so it can only be written once the service id exists —
      // hence a second call AFTER the save rather than fields on the listing payload. The
      // server re-derives the applicable set from the saved row and refuses anything outside
      // it; this call sends nothing but the keys the provider ticked.
      //
      // A failure here does NOT fail the save — the listing genuinely landed, and reporting
      // "Failed to create service" would be a lie (§13). It is surfaced as its own honest
      // toast in onSuccess instead.
      let attestationError: string | null = null;
      const keysToAffirm = Object.entries(attestationChecks)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const savedServiceId: string | undefined = service?.id ?? (isEditMode ? id : undefined);
      if (keysToAffirm.length > 0 && savedServiceId) {
        try {
          await apiRequest("POST", `/api/provider/services/${savedServiceId}/attestations`, {
            affirm: keysToAffirm,
          });
        } catch (err: any) {
          attestationError = err?.message || "unknown error";
        }
      }
      // ── B1 zone tiers (ruling 81) ──────────────────────────────────────────────────────────
      // The zones-mode rings are CHILD ROWS (service_surcharge_tiers), so — like attestations —
      // they can only be written once the service id exists: a second owner-gated replace-list PUT
      // AFTER the save. Sent ONLY when the chosen mode is 'zones', so switching AWAY from zones
      // leaves the saved rings untouched (never-clobber, ruling 62). A failure here does NOT fail
      // the save (§13) — surfaced as its own toast.
      let surchargeTierError: string | null = null;
      if (formData.surchargeMode === "zones" && savedServiceId) {
        const tiers = formData.surchargeTiers
          .map((t) => ({ radiusKm: Number(t.radiusKm), fee: Number(t.fee) }))
          .filter((t) => Number.isFinite(t.radiusKm) && t.radiusKm > 0 && Number.isFinite(t.fee) && t.fee >= 0);
        try {
          await apiRequest("PUT", `/api/provider/services/${savedServiceId}/surcharge-tiers`, { tiers });
        } catch (err: any) {
          surchargeTierError = err?.message || "unknown error";
        }
      }
      return { submitAction, service, attestationError, surchargeTierError };
    },
    onSuccess: ({ submitAction, service, attestationError, surchargeTierError }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      if (surchargeTierError) {
        toast({
          title: "Listing saved — travel zones were not recorded",
          description: `${surchargeTierError}. Reopen this listing and re-save the zones.`,
          variant: "destructive",
        });
      }
      if (attestationError) {
        // English, deliberately: ServiceForm is on I18N-2's "hardcoded English, migrate the
        // WHOLE surface in one commit" list, and a single t() call here would half-wrap it —
        // the one thing that convention forbids. The attestation CARD is a new file and is
        // wholly wrapped; this toast belongs to the wizard, not the card.
        toast({
          title: "Listing saved — confirmations were not recorded",
          description: `${attestationError}. Reopen this listing and confirm them.`,
          variant: "destructive",
        });
      }
      if (role === "expert") {
        queryClient.invalidateQueries({ queryKey: ["/api/expert/service-listings"] });
      }
      if (isEditMode) {
        toast({ title: "Service updated" });
        navigate(`/${role}/services`);
        return;
      }
      // Real outcome, not the button label: draft stays draft even if the client tried
      // to send something else; anything else lands "submitted" unless the row somehow
      // came back "approved" (grandfathered/edge case — never true for a fresh create).
      const approvalStatus: string = service?.approvalStatus ?? (submitAction === "draft" ? "draft" : "submitted");
      const isLive = approvalStatus === "approved" && service?.status !== "draft";
      if (role === "expert") {
        if (approvalStatus === "draft") {
          toast({ title: "Draft saved", description: "Not yet visible to travelers — submit it for review when ready." });
        } else if (isLive) {
          toast({ title: "Service published!", description: "Your service is now live." });
        } else {
          toast({ title: "Submitted for review", description: "It goes live once approved." });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
        navigate("/expert/services");
        return;
      }
      setCreationOutcome({ status: service?.status ?? null, approvalStatus });
      setCreationSuccess(true);
      if (onSuccess && service?.id) onSuccess(service.id);
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? "Failed to update service" : "Failed to create service",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const { data: verificationStatus } = useQuery<{ providerVerificationStatus: string; backgroundCheckConfirmed: boolean }>({
    queryKey: ["/api/provider/verification-status"],
    enabled: role === "provider",
  });

  // F2 identity + business verification gate (Phase 0.5). Fetches the provider application
  // status to surface whether identityVerificationStatus and businessVerificationStatus
  // are both "verified" before allowing a service to be published.
  const { data: providerAppStatus } = useQuery<{ identityVerificationStatus: string; businessVerificationStatus: string }>({
    queryKey: ["/api/provider/application-status"],
    enabled: role === "provider",
    select: (d: any) => ({
      identityVerificationStatus: d.identityVerificationStatus ?? "pending",
      businessVerificationStatus: d.businessVerificationStatus ?? "pending",
    }),
  });

  // dispatch v1.3 R2 (docs/DECISIONS.md ruling 53): the expert-side mirror of the provider
  // identity+business gate above — same early-visibility purpose, but experts have no
  // business-verification check (local_expert_forms carries no such column; ruling 53). Shares
  // the ONE hook (also used by expert/catalog.tsx) so both surfaces read the identical real
  // `local_expert_forms.identity_verification_status`, never a locally re-derived guess (§13).
  const expertVerification = useExpertVerificationStatus({ enabled: role === "expert" });

  const selectedCategory = categories.find((c) => c.id === formData.categoryId);
  const needsMeetingPoint = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";
  // ── D7 (docs/DECISIONS.md ruling 62) ─────────────────────────────────────────────────────
  // Placement: the logistics/delivery step, shown ONLY for place-anchored methods, decided by
  // the SHARED predicate (shared/service-fundamentals.ts) rather than a local method list.
  const showLogisticsCapture = isPlaceAnchored({
    deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
    productShape: existingService?.productShape ?? null,
  });
  const pickupProvisionChosen = PICKUP_PROVISIONS.has(formData.transportProvision);

  // ── D9 (ruling 62's D9 clause, executed by ruling 67) ────────────────────────────────────
  // The applicable attestation set for the listing AS CURRENTLY DRAFTED, from the SHARED
  // resolver. Recomputed as the provider changes category or delivery method, so the card
  // tracks what they are actually building. This is a PREVIEW: the server re-derives the same
  // set from the saved row on the write and rejects anything outside it (§14 posture).
  const attestationResolution = useMemo(
    () =>
      resolveApplicableAttestations({
        deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
        productShape: existingService?.productShape ?? null,
        categoryKey: selectedCategory?.categoryKey ?? null,
        categorySlug: selectedCategory?.slug ?? null,
      }),
    [formData.deliveryMethod, existingService?.productShape, selectedCategory?.categoryKey, selectedCategory?.slug],
  );
  // attestationKey → the date it was affirmed, for the read-only rows.
  const attestationAffirmedAt = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of attestationState?.applicable ?? []) {
      if (a.affirmedAt) out[a.key] = a.affirmedAt;
    }
    for (const a of attestationState?.affirmedOther ?? []) out[a.key] = a.affirmedAt;
    return out;
  }, [attestationState]);

  // ── SS-5a PUBLISH GATE (ruling 69 disposition 3) ────────────────────────────────────────
  // The applicable attestations this listing has NOT affirmed, counting both what is on record
  // and what is ticked in this session (both of which the save will carry). This mirrors the
  // server predicate; the SERVER is still the authority — this only stops the provider from
  // walking into a 403 they could not see coming.
  const unaffirmedAttestations = useMemo(
    () =>
      attestationResolution.applicable.filter(
        (key) => !attestationAffirmedAt[key] && !attestationChecks[key],
      ),
    [attestationResolution, attestationAffirmedAt, attestationChecks],
  );
  // The gate binds on a TRANSITION to active: an already-live listing is grandfathered, exactly
  // as the server has it, so an edit of a live listing is never blocked here either.
  const attestationGateBlocked =
    unaffirmedAttestations.length > 0 && !(isEditMode && existingService?.status === "active");

  // ── SS-5c SOFT WARNING (ruling 69 disposition 5) ────────────────────────────────────────
  // The SAME shared detector the server runs, over the text as currently drafted, so the nudge
  // appears while the provider is typing rather than only after a save. It never blocks and never
  // edits: the server attaches the authoritative warning to its own response.
  const protectedTitleWarning = useMemo(
    () => detectProtectedTitleClaims({ serviceName: formData.name, description: formData.description }),
    [formData.name, formData.description],
  );

  // NEVER-CLOBBER SURFACING (ruling 62's amendment, §13): picking one coverage mode must not
  // silently delete the other's data — so state, out loud, that the other side is still there.
  const savedRouteStopCount: number = Array.isArray(existingService?.routePoints)
    ? existingService.routePoints.length
    : 0;
  const savedRadiusKm = Number(existingService?.serviceRadius ?? 0);
  // SIX-SIGMA PASS (Tier A / finding M-4): is the row being edited PUBLICLY LIVE right now?
  // Read from the loaded row, never from the in-form draft state — the question is what the
  // marketplace currently shows, not what this form is about to send. `false` while the row is
  // still loading, so a slow read never claims a listing is live (§13).
  const isCurrentlyLive = isEditMode && existingService?.status === "active";
  const isCategoryGated = !!(selectedCategory?.requiresBackgroundCheck || (selectedCategory?.insuranceBand ?? 0) >= 2);
  const isProviderVerified = verificationStatus?.providerVerificationStatus === "verified";
  const publishBlocked = role === "provider" && isCategoryGated && !isProviderVerified;
  // Verification gate: both identity and business verification must be "verified" before going live.
  const identityVerified = providerAppStatus?.identityVerificationStatus === "verified";
  const bizVerified = providerAppStatus?.businessVerificationStatus === "verified";
  const verificationGateBlocked = role === "provider" && (!identityVerified || !bizVerified);
  // Expert equivalent: identity only. `undefined` while the real status is still unknown
  // (loading/unresolvable) — never treated as "unverified" so a slow network doesn't
  // flash an incorrect block (§13: no state is asserted until it's real).
  const expertIdentityKnown = role === "expert" && !expertVerification.isLoading && !expertVerification.isError;
  const expertVerificationGateBlocked = expertIdentityKnown && !expertVerification.isVerified;

  // ── Step machinery (audit item #10) ──────────────────────────────────────
  const STEP_TITLES = ["What you offer", "Details", "Photos", "Terms & requirements"];
  const TOTAL_STEPS = STEP_TITLES.length;

  const goToStep = (step: number) => {
    setCurrentStep(Math.min(Math.max(step, 1), TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Mirrors ONLY the checks already enforced elsewhere (button disabled states +
  // createMutation's throws) — nothing new is required here. Used to (a) route a
  // submit-time miss to the step holding the field and (b) explain a disabled
  // final button. Draft saves stay check-free, exactly as before.
  const missingForFinal: { step: number; label: string }[] = [];
  if (!formData.name) missingForFinal.push({ step: 1, label: "Service name" });
  if (!formData.categoryId) missingForFinal.push({ step: 1, label: "Category" });
  if (role === "provider" && !isEditMode && !formData.serviceOfferingTypeId) {
    missingForFinal.push({ step: 1, label: "An offering from the catalog" });
  }
  if (role === "expert" && !isEditMode && !formData.expertOfferingTypeId) {
    missingForFinal.push({ step: 1, label: "Service tier" });
  }
  if (needsMeetingPoint && !formData.meetingPoint.trim()) {
    missingForFinal.push({ step: 2, label: "Meeting point" });
  }

  const handleFinalSubmit = (action: "submit" | "publish") => {
    const firstMissing = missingForFinal[0];
    if (firstMissing) {
      // Jump to the step that holds the invalid field; the mutation's own
      // checks remain the backstop and are unchanged.
      goToStep(firstMissing.step);
      toast({
        title: "A required field is missing",
        description: `${firstMissing.label} (Step ${firstMissing.step}) is required before ${action === "publish" ? "publishing" : "submitting"}. You can Save Draft to finish later.`,
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(action);
  };

  if (isEditMode && loadingExisting) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (creationSuccess) {
    // L2: copy reflects the actual returned row (creationOutcome), never a
    // hardcoded "published/live" claim regardless of what really happened.
    const { status: outcomeStatus, approvalStatus: outcomeApproval } = creationOutcome;
    const isDraftOutcome = outcomeStatus === "draft" || outcomeApproval === "draft";
    const isLiveOutcome = outcomeApproval === "approved" && outcomeStatus !== "draft";
    const successTitle = isDraftOutcome
      ? "Draft saved"
      : isLiveOutcome
        ? "Service published!"
        : "Submitted for review";
    const successBody = isDraftOutcome
      ? "Not yet visible to travelers — submit it for review when ready."
      : isLiveOutcome
        ? "Your service is now live. You can add more services to build out your full catalog."
        : "It goes live once approved. You'll be notified when it's reviewed.";
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {successTitle}
            </h2>
            <p className="text-gray-500 text-sm">
              {successBody}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(`/${role}/services`)}>
                View My Services
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleAddAnother}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Another Service
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // "Don't see your offering?" row, rendered at the bottom of the picker's list AND inside
  // its zero-match state (same block, both call sites below).
  const renderDontSeeYourOffering = () => {
    if (requestOfferingOpen) {
      return (
        <div className="p-3 space-y-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-700">Tell us what you do</p>
          <Input
            value={requestOfferingName}
            onChange={(e) => setRequestOfferingName(e.target.value)}
            placeholder="e.g., Falconry experience"
            data-testid="input-request-offering-name"
          />
          <Textarea
            value={requestOfferingDescription}
            onChange={(e) => setRequestOfferingDescription(e.target.value)}
            placeholder="Optional — a sentence or two about it"
            className="min-h-[60px] text-sm"
            data-testid="input-request-offering-description"
          />
          {requestOfferingMutation.isError && (
            <p className="text-xs text-red-600" data-testid="text-request-offering-error">
              Couldn't submit your request — please try again.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={requestOfferingName.trim().length < 3 || requestOfferingMutation.isPending}
              onClick={() => requestOfferingMutation.mutate()}
              data-testid="button-submit-request-offering"
            >
              {requestOfferingMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRequestOfferingOpen(false);
                requestOfferingMutation.reset();
              }}
              data-testid="button-cancel-request-offering"
            >
              Cancel
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="p-3 border-t border-gray-100">
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => setRequestOfferingOpen(true)}
          data-testid="button-request-offering"
        >
          Don't see your offering? Request it
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">

      {/* ── Breadcrumb / Back ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate(`/${role}/services`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          My Services
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground font-medium">
          {isEditMode ? "Edit Service" : "New Service"}
        </span>
      </div>

      {/* ── Step indicator (audit item #10) — freely clickable in both modes ── */}
      <nav aria-label="Form steps" className="overflow-x-auto" data-testid="service-form-steps">
        <ol className="flex items-center gap-1 sm:gap-2">
          {STEP_TITLES.map((title, i) => {
            const stepNum = i + 1;
            const isActive = currentStep === stepNum;
            return (
              <li key={stepNum} className="flex items-center gap-1 sm:gap-2 shrink-0">
                {i > 0 && <div className="w-3 sm:w-6 h-px bg-border" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => goToStep(stepNum)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`button-step-${stepNum}`}
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold border ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border"
                    }`}
                  >
                    {stepNum}
                  </span>
                  <span className="hidden sm:inline whitespace-nowrap">{title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── dispatch v1.3 R2 (ruling 53): expert identity-verification status, visible on
          EVERY step (not gated to step 1 or the final Publish click) — "the expert always
          knows verification status, what's blocking, and what happens next... never
          discovered at the publish click." Reuses expert-status.tsx's own copy/verbs via
          the shared hook. Draft saves are unaffected — this is informational only. ── */}
      {role === "expert" && !expertVerification.isLoading && !expertVerification.isVerified && (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
            expertVerification.isError
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : expertVerification.isFailed
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
          data-testid="banner-expert-identity-verification"
        >
          <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${expertVerification.isFailed ? "text-red-600" : "text-amber-600"}`} />
          <div className="flex-1">
            {expertVerification.isError ? (
              <>
                <p className="font-medium">Verification status unavailable</p>
                <p className="text-xs mt-0.5 opacity-80">
                  We couldn't load your identity-verification status just now. Publishing requires a verified
                  identity — check your{" "}
                  <a href="/expert-status" className="underline font-medium">Expert Status page</a>.
                </p>
              </>
            ) : expertVerification.isProcessing ? (
              <>
                <p className="font-medium">Identity verification in progress</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Usually a few minutes. You can keep building — drafts save either way — and publishing
                  unlocks as soon as it clears.
                </p>
              </>
            ) : expertVerification.isFailed ? (
              <>
                <p className="font-medium">Identity verification needs attention</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Your last attempt was unsuccessful, so publishing is still blocked. Retry in your{" "}
                  <a href="/expert-status" className="underline font-medium">Expert Status page</a>.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Identity verification required before this listing can go live</p>
                <p className="text-xs mt-0.5 opacity-80">
                  Save as a draft anytime — verification is only required to publish. Verify now in your{" "}
                  <a href="/expert-status" className="underline font-medium">Expert Status page</a> (about 2 minutes).
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {currentStep === 1 && (<>

      {/* ── Offering-first provider create (§17): pick the /earn offering FIRST — ────
          category derives from it below. Shown for both create and edit so an edited
          legacy row's (unset) linkage is visible, but only REQUIRED on a new create
          (enforced in createMutation + the Publish button, not here). ── */}
      {role === "provider" && (() => {
        // Collapse to a one-line summary once a selection exists (including
        // an edit-mode row loaded with its linkage already set) — reopened
        // by "Change". Nothing-selected always shows the expanded picker,
        // regardless of offeringPickerOpen, so a required-on-create pick is
        // never hidden behind a stale collapsed state.
        const expanded = offeringPickerOpen || !formData.serviceOfferingTypeId;
        return (
        <Card data-testid="provider-offering-picker">
          <CardHeader>
            <CardTitle>What are you offering? *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {providerOfferingTypesRaw.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading offerings…</p>
            ) : !expanded ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-primary bg-primary/5 p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {selectedProviderOffering?.display_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {selectedProviderOfferingLabel}
                      {selectedProviderOffering?.tagline ? ` — ${selectedProviderOffering.tagline}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRequestOfferingConfirmedName(null);
                      setOfferingPickerOpen(true);
                    }}
                    data-testid="button-reopen-offering-picker"
                  >
                    Change
                  </Button>
                </div>
                {requestOfferingConfirmedName && selectedProviderOffering?.offering_type_key === "custom_other_offering" && (
                  <p className="text-xs text-muted-foreground" data-testid="text-request-offering-confirmed">
                    Requested: {requestOfferingConfirmedName} — meanwhile your listing continues under Custom / Other
                  </p>
                )}
              </div>
            ) : (
              <>
                <Input
                  value={offeringSearchQuery}
                  onChange={(e) => setOfferingSearchQuery(e.target.value)}
                  placeholder="Search offerings — driver, photographer, chef…"
                  data-testid="input-offering-search"
                />
                <div className="max-h-[420px] overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                  {offeringGroups.length === 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground p-3">
                        No offerings match '{offeringSearchQuery}'
                      </p>
                      {renderDontSeeYourOffering()}
                    </div>
                  ) : (
                    <>
                      {offeringGroups.map((group) => (
                        <div key={group.key} className="p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-1 sticky top-0 bg-background">
                            {group.label}
                          </p>
                          <div className="space-y-1">
                            {group.items.map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => {
                                  setRequestOfferingConfirmedName(null);
                                  handleSelectProviderOffering(o);
                                  setOfferingPickerOpen(false);
                                  setOfferingSearchQuery("");
                                }}
                                className={`w-full text-left px-2 py-2 rounded-md border transition-colors flex items-baseline gap-2 ${
                                  formData.serviceOfferingTypeId === o.id
                                    ? "border-primary bg-primary/5"
                                    : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                                }`}
                                data-testid={`option-offering-${o.offering_type_key}`}
                              >
                                <span className="font-medium text-sm text-gray-900 shrink-0">{o.display_name}</span>
                                {o.tagline && (
                                  <span className="text-xs text-gray-500 truncate">{o.tagline}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {renderDontSeeYourOffering()}
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick the offering that matches what you provide — this sets your category below and links
                  your listing to the /earn catalog. Required before publishing; you can save as a draft
                  without one and finish later.
                </p>
              </>
            )}
          </CardContent>
        </Card>
        );
      })()}

      {/* ── Start from a template (expert create — absorbed from the wizard, Phase 2) ── */}
      {role === "expert" && !isEditMode && serviceTemplates.length > 0 && (
        <Card data-testid="service-template-gallery">
          <CardHeader>
            <CardTitle>Start from a template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {serviceTemplates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    {t.description && (
                      <div className="text-sm text-muted-foreground truncate">{t.description}</div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(t)}
                    data-testid={`button-use-template-${t.id}`}
                  >
                    Use this template
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Picking a template pre-fills the form below. Review, edit, then Save as draft or Submit for review —
              it is never auto-approved.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Basic Information ── */}
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? "Edit Service" : "Create New Service"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Service Name */}
          <div>
            <Label htmlFor="name">Service Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={role === "expert" ? "e.g., Custom Itinerary Planning, Cultural Immersion Tour" : "e.g., Private City Walking Tour, Airport Transfer"}
              className="mt-2"
            />
          </div>

          {/* Category — single canonical taxonomy; derived + locked when a provider offering is selected (§17) */}
          <div>
            <Label htmlFor="category">Category *</Label>
            {role === "provider" && formData.serviceOfferingTypeId ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-secondary/40 px-3 py-2">
                <span className="text-sm font-medium" data-testid="text-derived-category">
                  {selectedCategory?.name ?? "—"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set("serviceOfferingTypeId", "")}
                  data-testid="button-change-offering"
                >
                  Change offering
                </Button>
              </div>
            ) : (
              <Select
                value={formData.categoryId}
                onValueChange={(v) => {
                  setFormData((prev) => ({ ...prev, categoryId: v, subcategoryId: "", categoryAttributes: {} }));
                }}
              >
                <SelectTrigger id="category" className="mt-2">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {role === "provider" && formData.serviceOfferingTypeId && (
              <p className="text-xs text-muted-foreground mt-1">Derived from your selected /earn offering above.</p>
            )}
            {selectedCategory?.description && (
              <p className="text-xs text-muted-foreground mt-1">{selectedCategory.description}</p>
            )}
          </div>

          {/* Verification banner — shown when selected category requires background check / elevated insurance */}
          {role === "provider" && isCategoryGated && (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${isProviderVerified ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}
              data-testid="banner-verification-required"
            >
              <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isProviderVerified ? "text-green-600" : "text-amber-600"}`} />
              <div>
                {isProviderVerified ? (
                  <p className="font-medium">Background verification complete — you can publish this service.</p>
                ) : (
                  <>
                    <p className="font-medium">Background check required before going live</p>
                    <p className="text-xs mt-0.5 opacity-80">
                      This category requires a background check and/or elevated insurance verification.
                      You can save as a draft now and contact support to complete verification before publishing.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* F2 identity + business verification gate banner (Phase 0.5).
              Shows when either identity or business verification is not yet "verified". */}
          {role === "provider" && verificationGateBlocked && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border text-sm bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200"
              data-testid="banner-identity-biz-verification-required"
            >
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-medium">Identity &amp; business verification required before publishing</p>
                <p className="text-xs mt-0.5 opacity-80">
                  {!identityVerified && !bizVerified
                    ? "Both identity verification (Stripe Identity) and business verification (Stripe Connect) must be completed first."
                    : !identityVerified
                    ? "Identity verification (Stripe Identity) must be completed before going live."
                    : "Business verification (Stripe Connect) must be completed before going live."}
                  {" "}Complete these steps in your{" "}
                  <a href="/provider-status" className="underline font-medium">Provider Status page</a>.
                </p>
              </div>
            </div>
          )}

          {/* Subcategory */}
          {subcategories.length > 0 && (
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                value={formData.subcategoryId}
                onValueChange={(v) => set("subcategoryId", v)}
              >
                <SelectTrigger id="subcategory" className="mt-2">
                  <SelectValue placeholder="Select a subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((subcat) => (
                    <SelectItem key={subcat.id} value={subcat.id}>
                      {subcat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pricing */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="priceType">Pricing Model</Label>
              <Select
                value={formData.priceType}
                onValueChange={(v: any) => set("priceType", v)}
              >
                <SelectTrigger id="priceType" className="mt-2" data-testid="select-price-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fixed">Fixed price</SelectItem>
                  <SelectItem value="Range">Price range</SelectItem>
                  <SelectItem value="Per-person">Per person</SelectItem>
                  <SelectItem value="Hourly">Hourly rate</SelectItem>
                  <SelectItem value="Package tiers">Package tiers</SelectItem>
                  <SelectItem value="Per-event">Per event (flat fee)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Hourly — single rate + /hr label */}
            {formData.priceType === "Hourly" && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="basePrice">Hourly Rate ($) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    min="0"
                    value={formData.basePrice || ""}
                    onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-2"
                    data-testid="input-hourly-rate"
                  />
                </div>
                <span className="text-sm font-medium text-muted-foreground pb-2.5">/ hr</span>
              </div>
            )}

            {/* Package tiers — dynamic tier builder */}
            {formData.priceType === "Package tiers" && (
              <div className="space-y-3">
                <Label>Pricing Tiers</Label>
                {formData.pricingTiers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add tiers like Basic, Standard, or Premium — each with a price and short description.
                  </p>
                )}
                {formData.pricingTiers.map((tier, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-secondary/40 rounded-lg border" data-testid={`tier-row-${idx}`}>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Tier name (e.g. Basic)"
                        value={tier.label}
                        onChange={(e) => {
                          const updated = [...formData.pricingTiers];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          set("pricingTiers", updated);
                        }}
                        data-testid={`input-tier-label-${idx}`}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          placeholder="Price"
                          value={tier.price || ""}
                          onChange={(e) => {
                            const updated = [...formData.pricingTiers];
                            updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                            set("pricingTiers", updated);
                          }}
                          data-testid={`input-tier-price-${idx}`}
                        />
                      </div>
                      <Input
                        placeholder="Short description (optional)"
                        value={tier.description}
                        onChange={(e) => {
                          const updated = [...formData.pricingTiers];
                          updated[idx] = { ...updated[idx], description: e.target.value };
                          set("pricingTiers", updated);
                        }}
                        className="col-span-2"
                        data-testid={`input-tier-desc-${idx}`}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => set("pricingTiers", formData.pricingTiers.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-tier-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => set("pricingTiers", [...formData.pricingTiers, { label: "", price: 0, description: "" }])}
                  data-testid="button-add-tier"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add tier
                </Button>
              </div>
            )}

            {/* Per-event — flat rate + optional guest range */}
            {formData.priceType === "Per-event" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="basePrice">Flat Event Rate ($) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    min="0"
                    value={formData.basePrice || ""}
                    onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-2"
                    data-testid="input-event-rate"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="guestMin">Min guests (optional)</Label>
                    <Input
                      id="guestMin"
                      type="number"
                      min="0"
                      value={formData.guestMin || ""}
                      onChange={(e) => set("guestMin", parseInt(e.target.value) || 0)}
                      placeholder="e.g. 10"
                      className="mt-2"
                      data-testid="input-guest-min"
                    />
                  </div>
                  <div>
                    <Label htmlFor="guestMax">Max guests (optional)</Label>
                    <Input
                      id="guestMax"
                      type="number"
                      min="0"
                      value={formData.guestMax || ""}
                      onChange={(e) => set("guestMax", parseInt(e.target.value) || 0)}
                      placeholder="e.g. 100"
                      className="mt-2"
                      data-testid="input-guest-max"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fixed / Range / Per-person — scalar price input */}
            {(formData.priceType === "Fixed" || formData.priceType === "Range" || formData.priceType === "Per-person") && (
              <div>
                <Label htmlFor="basePrice">
                  {formData.priceType === "Range"
                    ? "Starting Price ($) *"
                    : formData.priceType === "Per-person"
                    ? "Price Per Person ($) *"
                    : "Base Price ($) *"}
                </Label>
                <Input
                  id="basePrice"
                  type="number"
                  min="0"
                  value={formData.basePrice || ""}
                  onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                  className="mt-2"
                  data-testid="input-base-price"
                />
              </div>
            )}
          </div>

          {/* Expert Tier Picker — partitioned by the signed-in user's expert role where
              lib/earn-roles.ts defines one (local_expert / travel_expert); otherwise
              shows the full unpartitioned catalog (see visibleExpertOfferingTypes). */}
          {role === "expert" && (
            <div>
              <Label>Service Tier *</Label>
              {expertOfferingTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">Loading tiers…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {visibleExpertOfferingTypes.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        set("expertOfferingTypeId", tier.id);
                      }}
                      className={`text-left p-3 rounded-lg border-2 transition-colors ${
                        formData.expertOfferingTypeId === tier.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      data-testid={`option-tier-${tier.offeringTypeKey}`}
                    >
                      <p className="font-medium text-sm text-gray-900">{tier.displayName}</p>
                      {tier.tagline && (
                        <p className="text-xs text-gray-500 mt-0.5">{tier.tagline}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      </>)}

      {currentStep === 2 && (<>

      {/* ── Details & Delivery ── */}
      <Card>
        <CardHeader>
          <CardTitle>Details & Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Description */}
          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe what your service includes, what makes it special, and what travelers can expect..."
              rows={4}
              className="mt-2"
            />
          </div>

          {/* Duration */}
          <div>
            <Label htmlFor="duration">Duration *</Label>
            <Input
              id="duration"
              value={formData.duration}
              onChange={(e) => set("duration", e.target.value)}
              placeholder={role === "expert" ? "e.g., 2 hours, 3 days, 1 week" : "e.g., 30 minutes, 2 hours, same-day"}
              className="mt-2"
            />
          </div>

          {/* Delivery Method */}
          {(() => {
            const selectedTier = expertOfferingTypes.find((t) => t.id === formData.expertOfferingTypeId);
            const allowed = selectedTier && selectedTier.deliveryFormats.length > 0
              ? tierFormatsToAllowedMethods(selectedTier.deliveryFormats)
              : null;
            // T3-2: every canonical delivery value gets its own faithful UI option so
            // editing an existing service always reopens showing the value actually
            // stored (see fromCanonicalDelivery) instead of collapsing onto "In-Person".
            const allMethods: { value: UiDelivery; label: string }[] = [
              { value: "in-person", label: "In-Person" },
              { value: "video-call", label: "Video Call" },
              { value: "hybrid", label: "Hybrid (In-Person + Video)" },
              { value: "pdf", label: "PDF Guide" },
              { value: "call", label: "Phone Call" },
              { value: "voice_notes", label: "Voice Notes" },
              { value: "async_messaging", label: "Async Messaging" },
            ];
            let visibleMethods = allowed
              ? allMethods.filter((m) => allowed.has(m.value))
              : allMethods;
            // A tier's deliveryFormats filter (above) is a NEW-selection guardrail, not an
            // editor for an existing row — an already-stored value must always stay visible
            // and selected, or the Select silently falls back off it and a no-change save
            // would corrupt the stored delivery_method (the exact T3-2 bug, one layer up).
            if (allowed && !visibleMethods.some((m) => m.value === formData.deliveryMethod)) {
              const current = allMethods.find((m) => m.value === formData.deliveryMethod);
              if (current) visibleMethods = [...visibleMethods, current];
            }
            return (
              <div>
                <Label htmlFor="deliveryMethod">Delivery Method *</Label>
                <Select
                  value={formData.deliveryMethod}
                  onValueChange={(v: any) => set("deliveryMethod", v)}
                >
                  <SelectTrigger id="deliveryMethod" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                    {visibleMethods.length === 0 && (
                      <SelectItem value="in-person">In-Person</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {allowed && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Options filtered to your selected tier's delivery formats.
                  </p>
                )}

                {/* ── SS-6 delivery language (ruling 69 disposition 9, migration 199) ─────────
                    Placed beside the delivery METHOD because it answers the sibling question:
                    how it is delivered, and in what language. This is NOT ruling 60's chrome or
                    content translation — it is a purchasable attribute of the experience itself
                    (in Kyoto, an English-run session is commonly a different product from the
                    shared Japanese one). Untouched ⇒ nothing is sent and nothing is shown. */}
                <div className="mt-4">
                  <Label>Delivered in (languages)</Label>
                  <p className="text-xs text-muted-foreground mb-2" data-testid="text-delivery-languages-hint">
                    The language(s) you actually run this service in. Leave blank if you would
                    rather not say — we will not guess one for you.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {DELIVERY_LANGUAGE_OPTIONS.map((lang) => {
                      const selected = formData.deliveryLanguages?.includes(lang) ?? false;
                      return (
                        <label key={lang} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              // The FIRST touch turns null (never captured) into a real array;
                              // unticking the last one leaves [] (deliberately cleared), which is
                              // a different fact and is preserved as such.
                              const current = formData.deliveryLanguages ?? [];
                              set(
                                "deliveryLanguages",
                                e.target.checked
                                  ? [...current, lang]
                                  : current.filter((l) => l !== lang),
                              );
                            }}
                            className="h-4 w-4 rounded"
                            data-testid={`checkbox-delivery-language-${lang}`}
                          />
                          {lang}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md): the deliverable file —
              only relevant for pdf delivery. Buyers unlock this after a confirmed booking
              (never before purchase); this field is only ever hydrated from the owner-gated
              read. R4 (docs/DECISIONS.md ruling 58; QA_PUNCH_LIST.md P1 — RESOLVED) added a
              platform-managed upload path (POST /api/provider/services/:id/deliverable-file)
              alongside this legacy paste-a-link input; the two are distinguished on the stored
              value by an `objstore:` prefix (never shown to the owner, so a plain `objstore:...`
              string never leaks into this text field). The copy below states which case THIS
              listing is actually in — factual, no spin. */}
          {formData.deliveryMethod === "pdf" && (() => {
            const isManaged = formData.serviceFile.trim().startsWith("objstore:");
            return (
              <div>
                <Label htmlFor="serviceFile">Deliverable File URL *</Label>
                <Input
                  id="serviceFile"
                  value={isManaged ? "" : formData.serviceFile}
                  onChange={(e) => set("serviceFile", e.target.value)}
                  placeholder={isManaged ? "Leave blank to keep the protected upload" : "https://... (link to the PDF a buyer receives after purchase)"}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Buyers can download this only after their booking is confirmed. It is never
                  shown before purchase.
                </p>
                {isManaged ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                    This listing's deliverable is an uploaded file in platform-protected storage —
                    the platform streams it to buyers and can revoke access. Pasting a link above
                    replaces it with an unprotected one.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    A pasted link is not platform-protected: we control who receives it, but not
                    what they do with it afterward — once a buyer has it, it can be shared further
                    and we can't revoke it. Use a link you're willing to rotate.
                  </p>
                )}
                {!formData.serviceFile && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    A pdf-delivery listing needs a deliverable file before travelers can receive
                    anything after buying it.
                  </p>
                )}
              </div>
            );
          })()}

        </CardContent>
      </Card>

      {/* ── Category-Specific Dynamic Fields ── */}
      {categoryFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {(categories as ServiceCategory[]).find((c) => c.id === formData.categoryId)?.name ?? "Category"} Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {categoryFields.map((field) => {
              const value = formData.categoryAttributes[field.fieldKey] ?? "";
              const setCatAttr = (val: any) =>
                setFormData((prev) => ({
                  ...prev,
                  categoryAttributes: { ...prev.categoryAttributes, [field.fieldKey]: val },
                }));

              if (field.type === "boolean") {
                return (
                  <div key={field.fieldKey} className="flex items-center justify-between">
                    <Label htmlFor={`cat-${field.fieldKey}`} className="flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Switch
                      id={`cat-${field.fieldKey}`}
                      checked={Boolean(value)}
                      onCheckedChange={setCatAttr}
                      data-testid={`switch-cat-${field.fieldKey}`}
                    />
                  </div>
                );
              }

              if (field.type === "select" && Array.isArray(field.options)) {
                return (
                  <div key={field.fieldKey}>
                    <Label htmlFor={`cat-${field.fieldKey}`}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Select value={String(value || "")} onValueChange={setCatAttr}>
                      <SelectTrigger id={`cat-${field.fieldKey}`} className="mt-2" data-testid={`select-cat-${field.fieldKey}`}>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (field.type === "multiselect" && Array.isArray(field.options)) {
                const selected: string[] = Array.isArray(value) ? value : [];
                return (
                  <div key={field.fieldKey}>
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {field.options.map((opt) => {
                        const active = selected.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setCatAttr(active ? selected.filter((s) => s !== opt) : [...selected, opt])
                            }
                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${active ? "bg-primary text-white border-primary" : "bg-background text-foreground border-border hover:border-primary"}`}
                            data-testid={`chip-cat-${field.fieldKey}-${opt}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // text / number / url
              return (
                <div key={field.fieldKey}>
                  <Label htmlFor={`cat-${field.fieldKey}`}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <Input
                    id={`cat-${field.fieldKey}`}
                    type={field.type === "number" ? "number" : "text"}
                    value={String(value ?? "")}
                    onChange={(e) => setCatAttr(field.type === "number" ? (parseFloat(e.target.value) || "") : e.target.value)}
                    placeholder={field.type === "url" ? "https://..." : `Enter ${field.label.toLowerCase()}`}
                    className="mt-2"
                    data-testid={`input-cat-${field.fieldKey}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── What's Included ── */}
      <Card>
        <CardHeader>
          <CardTitle>What's Included</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {formData.whatIncluded.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveIncluded(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newIncluded}
              onChange={(e) => setNewIncluded(e.target.value)}
              placeholder="e.g., 2-hour guided tour, Hotel pickup, Lunch..."
              onKeyDown={(e) => e.key === "Enter" && handleAddIncluded()}
            />
            <Button onClick={handleAddIncluded} variant="outline" size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Logistics (conditional based on delivery method) ── */}
      {needsMeetingPoint && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Meeting Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="meetingPoint">Meeting Point *</Label>
              <Textarea
                id="meetingPoint"
                value={formData.meetingPoint}
                onChange={(e) => set("meetingPoint", e.target.value)}
                placeholder="Where will the service take place? (e.g., Hotel lobby, Specific landmark, Street address)"
                rows={2}
                className="mt-2"
              />
            </div>

            {/* L27-P3: place/confirm the precise point behind the free-text meeting point.
                Additive — the text above stays the required field and is unchanged; a pin
                is optional, and the picker renders nothing at all when no Maps key is
                configured (the form then behaves exactly as it did before). */}
            <LocationPointPicker
              value={formData.locationPoint}
              precision={formData.locationPrecision}
              addressHint={formData.meetingPoint || formData.serviceArea}
              onChange={(point) => {
                setLocationPointTouched(true);
                set("locationPoint", point);
              }}
              label="Pin this location on the map (optional)"
              helpText="Confirming a pin shows travelers exactly where to meet and lets this listing appear on planning maps. Without one, only your typed meeting point is shown."
              idPrefix="service-location"
            />

            {/* Transport disclosure — travelers need to know if they must arrange their own transport */}
            <div>
              <Label htmlFor="transportProvided" className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Do you provide transport during this service?
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Once you meet the traveler, will you transport them (e.g. car, van)? This is shown to travelers so they can plan.
              </p>
              <Select
                value={formData.transportProvided}
                onValueChange={(v: "yes" | "no" | "not_applicable") => set("transportProvided", v)}
              >
                <SelectTrigger id="transportProvided" data-testid="select-transport-provided">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes — I provide transport</SelectItem>
                  <SelectItem value="no">No — traveler arranges their own</SelectItem>
                  <SelectItem value="not_applicable">Not applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Neighborhoods multi-select */}
            <div>
              <Label>Neighborhoods (Optional)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Select all neighborhoods you serve. The first selected becomes the primary display neighborhood.
              </p>
              {allNeighborhoods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No neighborhoods available.</p>
              ) : (
                <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1 mt-1">
                  {Object.entries(
                    allNeighborhoods.reduce<Record<string, typeof allNeighborhoods>>((acc, n) => {
                      const key = `${n.city}, ${n.country}`;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(n);
                      return acc;
                    }, {})
                  ).map(([cityLabel, items]) => (
                    <div key={cityLabel}>
                      <p className="text-xs font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wide">{cityLabel}</p>
                      {items.map((n) => {
                        const checked = formData.neighborhoods.includes(n.slug);
                        const isPrimary = formData.neighborhoods[0] === n.slug;
                        return (
                          <label
                            key={n.slug}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                            data-testid={`checkbox-neighborhood-${n.slug}`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...formData.neighborhoods, n.slug]
                                  : formData.neighborhoods.filter((s) => s !== n.slug);
                                set("neighborhoods", next);
                              }}
                            />
                            <span className="flex-1">{n.name}</span>
                            {checked && isPrimary && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">primary</Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Service Area */}
            <div>
              <Label htmlFor="serviceArea">Service Area</Label>
              <Input
                id="serviceArea"
                value={formData.serviceArea}
                onChange={(e) => set("serviceArea", e.target.value)}
                placeholder="e.g., Central Paris, Tokyo Shibuya, Barcelona Gràcia"
                className="mt-2"
              />
            </div>

            {/* Pickup */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="pickupAvailable" className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Offer Pickup/Drop-off
                </Label>
                <Switch
                  id="pickupAvailable"
                  checked={formData.pickupAvailable}
                  onCheckedChange={(checked) => set("pickupAvailable", checked)}
                />
              </div>
              {formData.pickupAvailable && (
                <>
                  <div>
                    <Label htmlFor="pickupAddress">Pickup Location</Label>
                    <Input
                      id="pickupAddress"
                      value={formData.pickupAddress}
                      onChange={(e) => set("pickupAddress", e.target.value)}
                      placeholder="e.g., Main train station, Airport terminal 2"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    {/* Content logistics envelope (migration 166, QA_PUNCH_LIST item 20) — the
                        one logistics field with no prior home. Optional: "" stays honest NULL
                        (never fabricated as "same as pickup"). */}
                    <Label htmlFor="dropOffPoint">Drop-off Point</Label>
                    <Input
                      id="dropOffPoint"
                      value={formData.dropOffPoint}
                      onChange={(e) => set("dropOffPoint", e.target.value)}
                      placeholder="e.g., Hotel lobby, Same as pickup location"
                      className="mt-2"
                      data-testid="input-drop-off-point"
                    />
                  </div>
                  <div>
                    <Label htmlFor="serviceRadius" className="flex items-center gap-2">
                      <Radius className="w-4 h-4" />
                      Service Radius (km)
                    </Label>
                    <Input
                      id="serviceRadius"
                      type="number"
                      value={formData.serviceRadius}
                      onChange={(e) => set("serviceRadius", parseInt(e.target.value) || 0)}
                      className="mt-2"
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── D7 service logistics (docs/DECISIONS.md ruling 62, migration 195) ──────────────────
          CAPTURE ONLY. Nothing on this card is read by the transport resolver, the fundamentals
          checks or any traveler surface yet — ruling 62 captures the field set NOW, while the
          provider count is ~0, and wires consumers in later lanes. Every control offers a real
          "not specified" state: an unanswered question stays unanswered (§13). */}
      {showLogisticsCapture && (
        <Card data-testid="card-service-logistics">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Service logistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-xs text-muted-foreground">
              These details aren't shown to travelers yet — we're capturing them now so the
              planner can use them when that lands. Leave anything you're unsure of blank.
            </p>

            {/* ── Getting there: transport provision + the ruling-62 AMENDMENT's coverage choice.
                T1 (ruling 74) brings this to the mock: the provision is a SEGMENTED choice, the
                coverage is an explicit radius/route TOGGLE, and the never-clobber notice states
                out loud that the hidden side's data is preserved (ruling 62/64, §13). */}
            <div className="space-y-4" data-testid="logistics-section-transport">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Getting there
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How does the traveler reach the start? Tap the one that fits — tap it again to
                  leave it unset.
                </p>
              </div>

              <div>
                <Label className="text-sm">Transport provision</Label>
                <ToggleGroup
                  type="single"
                  value={formData.transportProvision}
                  onValueChange={(v) => set("transportProvision", v || "")}
                  variant="outline"
                  className="mt-2 flex-wrap justify-start gap-2"
                  data-testid="segmented-transport-provision"
                >
                  {TRANSPORT_PROVISION_OPTIONS.map((o) => (
                    <ToggleGroupItem
                      key={o.value}
                      value={o.value}
                      aria-label={o.label}
                      className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      data-testid={`toggle-transport-${o.value}`}
                    >
                      {o.segLabel}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.transportProvision
                    ? TRANSPORT_PROVISION_OPTIONS.find((o) => o.value === formData.transportProvision)?.label
                    : "Not specified."}
                </p>
              </div>

            {pickupProvisionChosen && (
              <div className="rounded-md border p-3 space-y-3" data-testid="block-pickup-coverage">
                <Label className="flex items-center gap-2">
                  <Radius className="w-4 h-4" />
                  Pickup coverage — a radius or a route?
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pick how your pickup area is defined. Switching between them never deletes the
                  other one's data — it only changes what travelers see.
                </p>
                <ToggleGroup
                  type="single"
                  value={formData.pickupCoverageMode}
                  onValueChange={(v) => set("pickupCoverageMode", v || "")}
                  variant="outline"
                  className="justify-start gap-2"
                  data-testid="segmented-pickup-coverage-mode"
                >
                  <ToggleGroupItem
                    value="radius"
                    data-testid="toggle-coverage-radius"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Radius className="w-4 h-4" /> Radius
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="route"
                    data-testid="toggle-coverage-route"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Route className="w-4 h-4" /> Route
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  {formData.pickupCoverageMode === "radius"
                    ? "Radius — a distance around your meeting pin."
                    : formData.pickupCoverageMode === "route"
                      ? "Route — a fixed set of stops you collect from."
                      : "Not specified — pick a radius or a route."}
                </p>

                {formData.pickupCoverageMode === "radius" && (
                  <div>
                    <Label htmlFor="coverageRadius">Pickup radius (km)</Label>
                    <Input
                      id="coverageRadius"
                      type="number"
                      min={0}
                      value={formData.pickupRadiusKm}
                      onChange={(e) => set("pickupRadiusKm", e.target.value)}
                      placeholder="Not set"
                      className="mt-1"
                      data-testid="input-coverage-radius"
                    />
                    {/* SS-4 CLOSED (docs/DECISIONS.md ruling 69 disposition 9, migration 199).
                        The six-sigma pass (finding M-3) measured this input and "Service Radius
                        (km)" in the Pickup card above writing ONE column: typing 17 here made
                        #serviceRadius read 17 instantly. They are now two columns
                        (`pickup_radius_km` and `service_radius`), so the honesty notice that used
                        to sit here — stating they were the same number — is RETIRED rather than
                        reworded: it described a defect that no longer exists. NEVER-CLOBBER: the
                        split added a column and backfilled nothing, so a listing saved under the
                        old UI keeps its number on `service_radius` and shows "Not set" here until
                        its owner says otherwise (§13 — never a guessed copy). */}
                    {savedRouteStopCount > 0 && (
                      <p className="text-xs text-amber-700 mt-2" data-testid="text-coverage-other-preserved">
                        {savedRouteStopCount} route {savedRouteStopCount === 1 ? "stop is" : "stops are"} saved —
                        not shown while coverage is set to radius. Nothing was deleted; switch to
                        Route to show them again.
                      </p>
                    )}
                  </div>
                )}

                {formData.pickupCoverageMode === "route" && (
                  <div>
                    <p className="text-xs text-muted-foreground" data-testid="text-route-coverage-hint">
                      {savedRouteStopCount > 0
                        ? `${savedRouteStopCount} route ${savedRouteStopCount === 1 ? "stop" : "stops"} saved. Edit them on the Catalog map view.`
                        : "No route stops saved yet — add them on the Catalog map view (Services → Map)."}
                    </p>
                    {savedRadiusKm > 0 && (
                      <p className="text-xs text-amber-700 mt-2" data-testid="text-coverage-other-preserved">
                        A {savedRadiusKm} km service radius is saved — not shown while coverage is
                        set to route. Nothing was deleted; switch to Radius to show it again.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── B1 Travel surcharge (ruling 81) — PROVIDER-CHOSEN MODE. Only for a listing that
                actually collects travelers in person (a pickup provision). The provider picks how
                (if at all) distance changes the price; the CHARGE is derived server-side at checkout
                from the traveler's confirmed pickup, never here. NEVER-CLOBBER: switching the mode
                keeps every other mode's numbers (they are separate fields on the same form). */}
            {pickupProvisionChosen && (
              <div className="rounded-md border p-3 space-y-3" data-testid="block-travel-surcharge">
                <Label className="flex items-center gap-2">
                  <Radius className="w-4 h-4" />
                  Travel surcharge — charge more for a distant pickup?
                </Label>
                <p className="text-xs text-muted-foreground">
                  Optional. When on, a traveler who books with a pickup location outside your area
                  pays a travel fee, shown as its own line at checkout. We only ever charge it from
                  the real pickup a traveler confirms — never a guess.
                </p>
                <ToggleGroup
                  type="single"
                  value={formData.surchargeMode || "none"}
                  onValueChange={(v) => set("surchargeMode", (v || "none") as any)}
                  variant="outline"
                  className="justify-start gap-2 flex-wrap"
                  data-testid="segmented-surcharge-mode"
                >
                  <ToggleGroupItem value="none" data-testid="toggle-surcharge-none"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">None</ToggleGroupItem>
                  <ToggleGroupItem value="flat" data-testid="toggle-surcharge-flat"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Flat fee</ToggleGroupItem>
                  <ToggleGroupItem value="zones" data-testid="toggle-surcharge-zones"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Zones</ToggleGroupItem>
                  <ToggleGroupItem value="per_km" data-testid="toggle-surcharge-per-km"
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Per km</ToggleGroupItem>
                </ToggleGroup>

                {formData.surchargeMode === "flat" && (
                  <div data-testid="block-surcharge-flat">
                    <Label htmlFor="surchargeFlatAmount">Flat travel fee ($)</Label>
                    <Input
                      id="surchargeFlatAmount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={formData.surchargeFlatAmount}
                      onChange={(e) => set("surchargeFlatAmount", e.target.value)}
                      placeholder="e.g. 20.00"
                      className="mt-1"
                      data-testid="input-surcharge-flat-amount"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Charged once when the pickup is outside your coverage radius
                      {savedRadiusKm > 0 ? ` (${savedRadiusKm} km)` : ` (set a Service radius on the Pickup card)`}.
                      Inside it, no fee.
                    </p>
                  </div>
                )}

                {formData.surchargeMode === "per_km" && (
                  <div data-testid="block-surcharge-per-km">
                    <Label htmlFor="surchargePerKm">Rate per km ($)</Label>
                    <Input
                      id="surchargePerKm"
                      type="number"
                      min={0}
                      step="0.01"
                      value={formData.surchargePerKm}
                      onChange={(e) => set("surchargePerKm", e.target.value)}
                      placeholder="e.g. 1.50"
                      className="mt-1"
                      data-testid="input-surcharge-per-km"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Multiplied by the straight-line distance from your pin to the pickup —
                      as-the-crow-flies, not driving distance.
                    </p>
                  </div>
                )}

                {formData.surchargeMode === "zones" && (
                  <div className="space-y-2" data-testid="block-surcharge-zones">
                    <p className="text-xs text-muted-foreground">
                      Draw rings from smallest to largest. A pickup pays the fee of the first ring it
                      falls inside. A pickup beyond the largest ring can't book.
                    </p>
                    {formData.surchargeTiers.map((tier, i) => (
                      <div key={i} className="flex items-end gap-2" data-testid={`row-surcharge-tier-${i}`}>
                        <div className="flex-1">
                          <Label htmlFor={`tier-radius-${i}`}>Ring {i + 1} radius (km)</Label>
                          <Input
                            id={`tier-radius-${i}`}
                            type="number"
                            min={0}
                            step="0.1"
                            value={tier.radiusKm}
                            onChange={(e) => {
                              const next = [...formData.surchargeTiers];
                              next[i] = { ...next[i], radiusKm: e.target.value };
                              set("surchargeTiers", next);
                            }}
                            className="mt-1"
                            data-testid={`input-tier-radius-${i}`}
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor={`tier-fee-${i}`}>Fee ($)</Label>
                          <Input
                            id={`tier-fee-${i}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={tier.fee}
                            onChange={(e) => {
                              const next = [...formData.surchargeTiers];
                              next[i] = { ...next[i], fee: e.target.value };
                              set("surchargeTiers", next);
                            }}
                            className="mt-1"
                            data-testid={`input-tier-fee-${i}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => set("surchargeTiers", formData.surchargeTiers.filter((_, j) => j !== i))}
                          data-testid={`button-remove-tier-${i}`}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set("surchargeTiers", [...formData.surchargeTiers, { radiusKm: "", fee: "" }])}
                      data-testid="button-add-surcharge-tier"
                    >
                      Add a ring
                    </Button>
                  </div>
                )}

                {formData.surchargeMode !== "none" && (
                  <div data-testid="block-surcharge-max-km">
                    <Label htmlFor="surchargeMaxKm">Won't travel beyond (km) — optional</Label>
                    <Input
                      id="surchargeMaxKm"
                      type="number"
                      min={0}
                      value={formData.surchargeMaxKm}
                      onChange={(e) => set("surchargeMaxKm", e.target.value)}
                      placeholder="No limit"
                      className="mt-1"
                      data-testid="input-surcharge-max-km"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      A pickup farther than this can't book at all. Leave blank for no limit.
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* ── Timing ── */}
            <div className="space-y-3 pt-4 border-t" data-testid="logistics-section-timing">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Timing
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How long it runs, and the window it can start in.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="durationMinutes">Duration (minutes)</Label>
                <Input
                  id="durationMinutes" type="number" min={0} placeholder="e.g. 180"
                  value={formData.durationMinutes}
                  onChange={(e) => set("durationMinutes", e.target.value)}
                  className="mt-1" data-testid="input-duration-minutes"
                />
              </div>
              <div>
                <Label htmlFor="bufferMinutes">Setup / buffer (minutes)</Label>
                <Input
                  id="bufferMinutes" type="number" min={0} placeholder="e.g. 30"
                  value={formData.bufferMinutes}
                  onChange={(e) => set("bufferMinutes", e.target.value)}
                  className="mt-1" data-testid="input-buffer-minutes"
                />
              </div>
              <div>
                <Label htmlFor="earliestStartTime">Earliest start</Label>
                <Input
                  id="earliestStartTime" type="time"
                  value={formData.earliestStartTime}
                  onChange={(e) => set("earliestStartTime", e.target.value)}
                  className="mt-1" data-testid="input-earliest-start"
                />
              </div>
              <div>
                <Label htmlFor="latestStartTime">Latest start</Label>
                <Input
                  id="latestStartTime" type="time"
                  value={formData.latestStartTime}
                  onChange={(e) => set("latestStartTime", e.target.value)}
                  className="mt-1" data-testid="input-latest-start"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="serviceTimezone">Timezone (IANA)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="serviceTimezone" placeholder="e.g. Asia/Tokyo"
                  value={formData.serviceTimezone}
                  onChange={(e) => set("serviceTimezone", e.target.value)}
                  data-testid="input-service-timezone"
                />
                <Button
                  type="button" variant="outline"
                  onClick={() => {
                    // Suggest, never assume — the provider still has to keep or change it.
                    try {
                      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                      if (tz) set("serviceTimezone", tz);
                    } catch { /* no resolvable zone — leave the field alone (§13) */ }
                  }}
                  data-testid="button-detect-timezone"
                >
                  Use mine
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                The start times above are local wall-clock times in this zone.
              </p>
            </div>
            </div>

            {/* ── Capacity ── */}
            <div className="space-y-3 pt-4 border-t" data-testid="logistics-section-capacity">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Capacity
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The party size this fits. Per-person vs per-group is your pricing type — set there,
                  not asked twice here.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="partySizeMin">Minimum party size</Label>
                  <Input
                    id="partySizeMin" type="number" min={0} placeholder="e.g. 1"
                    value={formData.partySizeMin}
                    onChange={(e) => set("partySizeMin", e.target.value)}
                    className="mt-1" data-testid="input-party-size-min"
                  />
                </div>
                <div>
                  <Label htmlFor="partySizeMax">Maximum party size</Label>
                  <Input
                    id="partySizeMax" type="number" min={0} placeholder="e.g. 8"
                    value={formData.partySizeMax}
                    onChange={(e) => set("partySizeMax", e.target.value)}
                    className="mt-1" data-testid="input-party-size-max"
                  />
                </div>
              </div>
            </div>

            {/* ── Booking rules ── */}
            <div className="space-y-3 pt-4 border-t" data-testid="logistics-section-booking-rules">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Booking rules
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lead time is set under Booking terms — these are the change window and whether the
                  day can be planned around this.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="changeCutoffHours">Change cutoff (hours before)</Label>
                  <Input
                    id="changeCutoffHours" type="number" min={0} placeholder="e.g. 24"
                    value={formData.changeCutoffHours}
                    onChange={(e) => set("changeCutoffHours", e.target.value)}
                    className="mt-1" data-testid="input-change-cutoff-hours"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    When a traveler can still move the booking. Separate from your refund policy.
                  </p>
                </div>
                <div>
                  <Label htmlFor="canAnchor">Can this anchor a day?</Label>
                  <Select
                    value={formData.canAnchor || "unspecified"}
                    onValueChange={(v) => set("canAnchor", (v === "unspecified" ? "" : v) as "" | "yes" | "no")}
                  >
                    <SelectTrigger id="canAnchor" className="mt-1" data-testid="select-can-anchor">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Not specified</SelectItem>
                      <SelectItem value="yes">Yes — the day can be planned around it</SelectItem>
                      <SelectItem value="no">No — it fits around other plans</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      </>)}

      {currentStep === 4 && (<>

      {/* ── Booking Terms ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Booking Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="leadTime" className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Lead Time Required
            </Label>
            <Input
              id="leadTime"
              value={formData.leadTime}
              onChange={(e) => set("leadTime", e.target.value)}
              placeholder="e.g., 48 hours, 1 week, 3 days"
              className="mt-2"
              data-testid="input-lead-time"
            />
            <p className="text-xs text-muted-foreground mt-1">How far in advance must clients book?</p>
          </div>
          <div>
            <Label htmlFor="cancellationPolicyType">Cancellation Policy</Label>
            <Select
              value={formData.cancellationPolicyType || undefined}
              onValueChange={(v) => set("cancellationPolicyType", v)}
            >
              <SelectTrigger id="cancellationPolicyType" className="mt-2" data-testid="select-cancellation-policy-type">
                <SelectValue placeholder="Not declared — no policy shown to travelers" />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_POLICY_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Shown to travelers as a real per-offering policy. Leave unset if you haven't decided — we never show a fabricated default.
            </p>
            {/* SIX-SIGMA PASS (Tier A / finding M-1): the option you pick is not advisory —
                the server computes the refund from it. Say so where the choice is made. */}
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-cancellation-enforced-note">
              These windows are applied automatically when a traveler cancels — the refund is
              calculated from the option you pick here, not from the notes below.
            </p>
          </div>
          <div>
            <Label htmlFor="cancellationPolicy">Cancellation Policy Details (optional)</Label>
            <Textarea
              id="cancellationPolicy"
              value={formData.cancellationPolicy}
              onChange={(e) => set("cancellationPolicy", e.target.value)}
              placeholder="e.g., Full refund if cancelled 48 hours before. 50% refund if cancelled 24 hours before. No refund within 12 hours."
              rows={3}
              className="mt-2"
              data-testid="textarea-cancellation-policy"
            />
          </div>

          {/* ── Deposits / partial payments (Lane 7, ruling 72) — PROVIDER OPT-IN ─────────────────
              Off by default: the listing checks out at the full price, exactly as before. When on,
              the traveler pays a deposit now and settles the balance in a second checkout before a
              cutoff derived from your service date and change window. The deposit amount is computed
              server-side at checkout from the values below. */}
          <div className="rounded-md border p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer" htmlFor="depositEnabled">
              <input
                id="depositEnabled"
                type="checkbox"
                checked={formData.depositEnabled}
                onChange={(e) => set("depositEnabled", e.target.checked)}
                data-testid="checkbox-deposit-enabled"
              />
              <span className="font-medium">Take a deposit for this listing</span>
            </label>
            <p className="text-xs text-muted-foreground">
              When on, travelers pay a deposit at checkout and the remaining balance in a second
              checkout before a cutoff. Leave off to collect the full price up front.
            </p>
            {formData.depositEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="depositType">Deposit type</Label>
                  <Select
                    value={formData.depositType || undefined}
                    onValueChange={(v) => set("depositType", v as "percentage" | "flat")}
                  >
                    <SelectTrigger id="depositType" className="mt-2" data-testid="select-deposit-type">
                      <SelectValue placeholder="Choose percentage or flat amount" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage of the total</SelectItem>
                      <SelectItem value="flat">Flat amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.depositType === "percentage" && (
                  <div>
                    <Label htmlFor="depositPercentage">Deposit percentage (%)</Label>
                    <Input
                      id="depositPercentage"
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 30"
                      value={formData.depositPercentage}
                      onChange={(e) => set("depositPercentage", e.target.value)}
                      className="mt-2"
                      data-testid="input-deposit-percentage"
                    />
                  </div>
                )}
                {formData.depositType === "flat" && (
                  <div>
                    <Label htmlFor="depositFlatAmount">Deposit amount</Label>
                    <Input
                      id="depositFlatAmount"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 50.00"
                      value={formData.depositFlatAmount}
                      onChange={(e) => set("depositFlatAmount", e.target.value)}
                      className="mt-2"
                      data-testid="input-deposit-flat-amount"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Requirements from Client (absorbed from the expert wizard, Phase 2) ── */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements from Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {formData.requirements.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRequirement(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newRequirement}
              onChange={(e) => setNewRequirement(e.target.value)}
              placeholder="e.g., Passport copy, Dietary restrictions, Preferred dates..."
              onKeyDown={(e) => e.key === "Enter" && handleAddRequirement()}
            />
            <Button onClick={handleAddRequirement} variant="outline" size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── D9 attestations (ruling 62's D9 clause, executed by ruling 67) ──────────────────
          Placement: the "Terms & requirements" step — the C9 precedent that puts per-listing
          curation on the "what I sell" module. The card renders ITSELF only when the SHARED
          resolver returns a non-empty applicable set for what is currently drafted; nothing
          here decides applicability locally. IT IS NOW A PUBLISH GATE (ruling 69 disposition
          3, answering the question ruling 67 filed as SS-5a): an unticked applicable box
          blocks a TRANSITION to active — draft saves and already-live listings are exempt,
          which is the whole grandfathering mechanism. The server holds the authority; the
          disabled Publish button below only makes the refusal visible before it happens. */}
      <ServiceAttestationsCard
        resolution={attestationResolution}
        affirmedAt={attestationAffirmedAt}
        checked={attestationChecks}
        onToggle={(key: AttestationKey, next: boolean) =>
          setAttestationChecks((prev) => ({ ...prev, [key]: next }))
        }
        unaffirmed={unaffirmedAttestations}
        gateApplies={!(isEditMode && existingService?.status === "active")}
        titleClaimWarning={protectedTitleWarning}
      />

      </>)}

      {currentStep === 3 && (<>

      {/* ── Photos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Photos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="serviceImage">Cover Photo URL</Label>
            <Input
              id="serviceImage"
              value={formData.serviceImage}
              onChange={(e) => set("serviceImage", e.target.value)}
              placeholder="https://..."
              className="mt-2"
              data-testid="input-service-image"
            />
            {formData.serviceImage && (
              <img
                src={formData.serviceImage}
                alt="Cover preview"
                className="mt-2 w-full h-40 object-cover rounded-lg border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
          <div>
            <Label>Gallery Images</Label>
            <div className="space-y-2 mt-2">
              {formData.galleryImages.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <img
                    src={url}
                    alt={`Gallery ${idx + 1}`}
                    className="w-12 h-12 object-cover rounded border flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                  />
                  <span className="flex-1 text-sm text-muted-foreground truncate">{url}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set("galleryImages", formData.galleryImages.filter((_, i) => i !== idx))}
                    data-testid={`button-remove-gallery-${idx}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newGalleryUrl}
                onChange={(e) => setNewGalleryUrl(e.target.value)}
                placeholder="https://... (image URL)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGalleryUrl.trim()) {
                    set("galleryImages", [...formData.galleryImages, newGalleryUrl.trim()]);
                    setNewGalleryUrl("");
                  }
                }}
                data-testid="input-gallery-url"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (newGalleryUrl.trim()) {
                    set("galleryImages", [...formData.galleryImages, newGalleryUrl.trim()]);
                    setNewGalleryUrl("");
                  }
                }}
                data-testid="button-add-gallery"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      </>)}

      {/* ── Provider-Specific Features ── */}
      {currentStep === 4 && role === "provider" && (
        <Card>
          <CardHeader>
            <CardTitle>Additional Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Revisions */}
            <div>
              <Label htmlFor="revisionsIncluded">Revisions Included</Label>
              <Input
                id="revisionsIncluded"
                type="number"
                value={formData.revisionsIncluded}
                onChange={(e) => set("revisionsIncluded", parseInt(e.target.value) || 0)}
                min="0"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Number of revisions or refinements included</p>
            </div>

            {/* Expert Notes */}
            <div className="flex items-center justify-between">
              <Label htmlFor="expertNotes" className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                Includes Expert Notes
              </Label>
              <Switch
                id="expertNotes"
                checked={formData.includesExpertNotes}
                onCheckedChange={(checked) => set("includesExpertNotes", checked)}
              />
            </div>

            {/* Max Concurrent */}
            <div>
              <Label htmlFor="maxClients">Max Concurrent Clients</Label>
              <Input
                id="maxClients"
                type="number"
                value={formData.maxConcurrentClients}
                onChange={(e) => set("maxConcurrentClients", parseInt(e.target.value) || 1)}
                min="1"
                className="mt-2"
              />
            </div>

            {/* Content Affinity Tags */}
            <div>
              <Label>Content Affinity Tags</Label>
              <p className="text-xs text-muted-foreground mb-2">Mark contexts where this service is relevant</p>
              <div className="space-y-2">
                {AFFINITY_TAG_OPTIONS.map((tag) => (
                  <div key={tag.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={tag.value}
                      checked={formData.contentAffinityTags.includes(tag.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          set("contentAffinityTags", [...formData.contentAffinityTags, tag.value]);
                        } else {
                          set("contentAffinityTags", formData.contentAffinityTags.filter((t) => t !== tag.value));
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <Label htmlFor={tag.value} className="cursor-pointer text-sm font-normal">
                      {tag.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="active" className="cursor-pointer font-medium">
                {formData.active ? "Published" : "Draft"}
              </Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => set("active", checked)}
              />
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Expert-Specific Approval Workflow ── */}
      {currentStep === 4 && role === "expert" && (
        <Card>
          <CardHeader>
            <CardTitle>Submission & Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                Save your service as a draft, then submit it for approval. Our team will review and approve it within 48 hours.
              </p>
            </div>
            <div>
              <Label htmlFor="revisionsIncluded-expert">Revisions Included</Label>
              <Input
                id="revisionsIncluded-expert"
                type="number"
                value={formData.revisionsIncluded}
                onChange={(e) => set("revisionsIncluded", parseInt(e.target.value) || 0)}
                min="0"
                className="mt-2"
                data-testid="input-revisions-expert"
              />
              <p className="text-xs text-muted-foreground mt-1">Number of revisions or refinements included</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Current Status</Label>
              <div className="mt-2">
                <Badge variant={formData.approvalStatus === "submitted" ? "default" : "secondary"}>
                  {formData.approvalStatus === "draft" ? "Draft (Not submitted)" : "Submitted for review"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step Navigation / Action Buttons ── */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex gap-3 flex-col sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              onClick={() => navigate(`/${role}/services`)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>

            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={() => goToStep(currentStep - 1)}
                disabled={createMutation.isPending}
                data-testid="button-step-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}

            <div className="flex-1" />

            {/* Draft save is reachable from EVERY step (unchanged: drafts skip
                required-field checks), so nobody has to walk to step 4 to bail out.

                SIX-SIGMA PASS (docs/findings/SIX_SIGMA_PROVIDER_PASS.md, Tier A / finding M-4):
                this action sends `status:"draft"` unconditionally, so on a listing that is
                CURRENTLY LIVE it takes the listing off the marketplace. Measured directly:
                clicking it on an `active` listing moved that row to `draft` in the DB, with
                nothing on screen saying so — and it sits immediately beside "Next", on every
                step, wearing the same neutral label it wears for a brand-new draft. The
                BEHAVIOUR is deliberately left alone here (whether an edit should preserve
                `active` is a product call — filed Tier B); what changes is that the button now
                says what it is about to do. */}
            <Button
              variant="outline"
              onClick={() => createMutation.mutate("draft")}
              disabled={createMutation.isPending}
              title={isCurrentlyLive ? "This listing is live. Saving it as a draft removes it from the marketplace until you publish it again." : undefined}
              data-testid="button-save-draft"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isCurrentlyLive
                ? "Unpublish & Save Draft"
                : role === "expert" ? "Save as Draft" : "Save Draft"}
            </Button>

            {currentStep < TOTAL_STEPS ? (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => goToStep(currentStep + 1)}
                disabled={createMutation.isPending}
                data-testid="button-step-next"
              >
                Next: {STEP_TITLES[currentStep]}
              </Button>
            ) : role === "expert" ? (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => handleFinalSubmit("submit")}
                disabled={createMutation.isPending || !formData.name || !formData.categoryId || (!isEditMode && !formData.expertOfferingTypeId)}
                title={
                  expertVerificationGateBlocked
                    ? "Submitting for review is fine while unverified — but it can't go live until your identity is verified in your Expert Status page"
                    : undefined
                }
                data-testid="button-submit-service"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Submit for Approval
              </Button>
            ) : (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => handleFinalSubmit("publish")}
                disabled={createMutation.isPending || !formData.name || !formData.categoryId || publishBlocked || verificationGateBlocked || attestationGateBlocked || (!isEditMode && !formData.serviceOfferingTypeId)}
                title={
                  verificationGateBlocked
                    ? "Complete identity and business verification in your Provider Status page before publishing"
                    : publishBlocked
                    ? "Complete background verification before publishing this category"
                    : attestationGateBlocked
                    ? "Tick the confirmations on the Terms & requirements step before publishing"
                    : (!isEditMode && !formData.serviceOfferingTypeId)
                    ? "Pick an offering from the /earn catalog first"
                    : undefined
                }
                data-testid="button-publish-service"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {verificationGateBlocked || publishBlocked
                  ? "Verification Required"
                  : attestationGateBlocked
                  ? "Confirmations Required"
                  : "Publish Service"}
              </Button>
            )}
          </div>

          {/* Final-step disabled explanation: name WHICH step holds each missing
              required field, with a jump link — mirrors the existing enforcement,
              adds none. */}
          {currentStep === TOTAL_STEPS && missingForFinal.length > 0 && (
            <p className="text-xs text-muted-foreground sm:text-right" data-testid="text-missing-required">
              Still needed before you {role === "expert" ? "submit" : "publish"}:{" "}
              {missingForFinal.map((m, i) => (
                <span key={`${m.step}-${m.label}`}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => goToStep(m.step)}
                  >
                    {m.label} (Step {m.step})
                  </button>
                </span>
              ))}
              . Or Save Draft and finish later.
            </p>
          )}

          {/* dispatch v1.3 R2: reinforce "what happens next" right at the submit action —
              submitting for review is never blocked while unverified (only going LIVE is
              gated, ruling 53), so this stays a note, not a disabled button. */}
          {currentStep === TOTAL_STEPS && expertVerificationGateBlocked && (
            <p className="text-xs text-amber-700 sm:text-right" data-testid="text-expert-submit-verification-note">
              You can submit for review now — it just won't go live until you{" "}
              <a href="/expert-status" className="underline font-medium">verify your identity</a>.
            </p>
          )}

          {/* SIX-SIGMA PASS (docs/findings/SIX_SIGMA_PROVIDER_PASS.md, Tier A / finding M-2):
              the PROVIDER half of the same honesty note. Measured on the wizard's final step:
              the Publish button relabels itself "Verification Required" and goes DISABLED, and
              the only statement of why lived in a `title` tooltip — no visible text and no link
              to /provider-status anywhere on the wizard (measured: 0 status links in the DOM).
              A disabled control whose reason is invisible is a dead end; the expert branch above
              already had its escape, the provider branch did not. Copy only — this asserts no
              new state and changes no gate; it names the block the gate has ALREADY decided and
              points at the page that clears it. */}
          {currentStep === TOTAL_STEPS && role === "provider" && (verificationGateBlocked || publishBlocked) && (
            <p className="text-xs text-amber-700 sm:text-right" data-testid="text-provider-publish-verification-note">
              {verificationGateBlocked
                ? "Publishing needs identity and business verification. "
                : "This category needs background verification before it can be published. "}
              <a href="/provider-status" className="underline font-medium">Finish verification on your Provider Status page</a>
              {" "}— your work here is safe, use Save Draft and come back.
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
