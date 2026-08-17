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
  Users, Route, CalendarClock, Circle, ChevronRight,
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
import { isPlaceAnchored, needsScheduling, SESSION_END_METHODS } from "@shared/service-fundamentals";
// S-1 (ledger 2026-08-16-console-sweep): the edit-split panel below renders the SERVER's own
// lane list — this module is the one the PATCH handler itself imports (§18 rule 1: delegates,
// never re-implements). Do not restate these lists inline.
import { IDENTITY_EDIT_LANE, SAFE_EDIT_LANE_LABELS } from "@shared/edit-split";
// D9 (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67): the SAME resolver the
// server re-runs on the write, so what this wizard renders and what the API will accept cannot
// drift. The client calls it only to draw the card — it never decides what it may affirm.
import {
  resolveApplicableAttestations,
  detectProtectedTitleClaims,
  type AttestationKey,
} from "@shared/service-attestations";
import { ServiceAttestationsCard } from "@/components/provider/service-attestations-card";
// FP-3: a property / property_room row's editor is the Workstation property surface, never this
// questionnaire. One home for that routing decision (Catalog uses the same module).
import {
  isPropertyEditorShape,
  isPropertyRoom,
  propertyEditorHref,
} from "@/lib/property-editor-link";
// FP-2: the final action's required-field set (pure + unit-tested — see the module header for
// the "asterisk set = enforced set" rule it keeps).
// WAVE 2 / S2: the SAME module now also derives the listing home's checklist rows
// (`deriveServiceChecklist`) off the SAME required-item descriptors — one set, never forked.
import {
  missingRequiredForFinal,
  deriveServiceChecklist,
  effectivePriceScalar,
  DESCRIPTION_CHECKLIST_MIN,
  type ChecklistRow,
} from "@/lib/service-form-required";
// WAVE 2 / A1 (S1+S3): the flow's SHAPE, as data. Method-first — the step list is built from the
// delivery method, and one module says which step holds which section (see its header for the
// unreachability invariant a branching wizard has to keep).
import {
  clampStep,
  flowForMethod,
  stepForSection,
  stepNumberOf,
  STEP_LONG_TITLES,
  STEP_SHORT_TITLES,
  type SectionKey,
  type StepKey,
} from "@/lib/service-form-steps";
// A1 / S3: the create flow's step 4 — the map authoring component (pin canvas + the ruling-22
// replace-list route stops). Catalog's map is a traveler preview from this lane on.
import { ServiceMapAuthoring } from "@/components/provider/service-map-authoring";
// WAVE 2 / S4 (ledger row 99): the post-creation "Pricing & fees" drawer — surcharge mode +
// amounts, deposit config and cancellation policy moved here from the wizard steps above.
import { PricingFeesDrawer } from "@/components/provider/pricing-fees-drawer";
import { ServicePhotosDrawer } from "@/components/provider/service-photos-drawer";
import { ServiceLanguagesCard } from "@/components/service-languages-card";
import { pricingFeesFromService, pricingFeesSummary } from "@/lib/pricing-fees";

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
  // Provider-specific: features. FP-2 / A2: the `active` boolean is GONE — it backed the dead
  // Published/Draft switch on step 4 and nothing else (never sent, never gated on). Status is
  // the server's, read from the record; see the status pill on the provider step-4 card.
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  contentAffinityTags: string[];
  // Shared: content
  whatIncluded: string[];
  requirements: string[];
  maxConcurrentClients: number;
  // Logistics
  neighborhood: string;
  meetingPoint: string;
  // Gap #13 (migration 228): host's own words. "" = never answered — sent as null, omitted everywhere.
  whatToBring: string;
  accessNotes: string;
  // L27-P3: the CONFIRMED map point for this listing (migration-129 latitude/longitude).
  // Null = no pin. `locationPrecision` is the row's server-derived precision, carried
  // read-only so the picker can label a migration-129 centroid honestly as approximate —
  // the client never sends it (§13: the server derives precision, see
  // server/utils/service-location.ts).
  locationPoint: LocationPoint | null;
  locationPrecision: string | null;
  pickupAvailable: boolean;
  // Migration 238: pickup intent — mirrors pickupAvailable, persisted to its own column so the
  // wizard and ServiceForm share a single authoritative source in provider_services.
  collectsAndDrops: boolean;
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
  // Ruling 115 (migration 216): the language the listing's ORIGINAL content is written in.
  // Owner-declared on Basics ("I'm writing this in"); defaults to English — never guessed from
  // the text. Drives translation targets and the traveler-facing "shown in <language>" label.
  sourceLocale: "en" | "ja";
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
  seating: string;                 // "" | "private" | "shared" — the Capacity step's Seating
  changeCutoffHours: string;
  canAnchor: "" | "yes" | "no";    // tri-state: "" = never declared
  // ── S9 session/async fields (docs/DECISIONS.md ledger row 102, migration 212) ───────────────
  // joinLink: the provider's OWN meeting link for a scheduled remote session (call/video).
  // SENSITIVE — this client never receives another provider's stored value, only its own via the
  // owner-gated GET /api/provider/services/:id read; the traveler-facing reveal is server-side
  // (GET /api/service-bookings, confirmed bookings only) and is not this form's concern.
  joinLink: string;
  // responseWindowHours/scopeStatement: async (async_messaging/voice_notes) — the promised
  // response time and an SLA/promise statement. "" = never captured (§13).
  responseWindowHours: string;
  scopeStatement: string;
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
// Vocabulary mirrors shared/schema.ts's transportProvisionEnum (app-enforced, no DB CHECK).
// D-9 (ledger 119): the four-way provision question is no longer ASKED — the mock's ratified
// "one transport question" collapse. `transportProvision` still hydrates and round-trips
// unchanged (never-clobber), and PICKUP_PROVISIONS below still gates the coverage block for
// legacy rows whose stored provision said "pickup".
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
// WAVE 2 / S4 (ledger row 99): the control this vocabulary fed moved to the post-creation
// "Pricing & fees" drawer — `CANCELLATION_POLICY_TYPE_OPTIONS` now lives (as the sole copy) in
// `client/src/lib/pricing-fees.ts`, imported by `pricing-fees-drawer.tsx`. This wizard no longer
// renders the control, so it no longer needs the list either.

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
    revisionsIncluded: 0,
    includesExpertNotes: false,
    contentAffinityTags: [],
    whatIncluded: [],
    requirements: [],
    maxConcurrentClients: 1,
    neighborhood: "",
    meetingPoint: "",
    whatToBring: "",
    accessNotes: "",
    locationPoint: null,
    locationPrecision: null,
    pickupAvailable: false,
    collectsAndDrops: false,
    pickupAddress: "",
    dropOffPoint: "",
    serviceRadius: 0,
    pickupRadiusKm: "",
    deliveryLanguages: null,
    sourceLocale: "en",
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
    seating: "",
    changeCutoffHours: "",
    joinLink: "",
    responseWindowHours: "",
    scopeStatement: "",
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
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    contentAffinityTags: Array.isArray(s.contentAffinityTags) ? s.contentAffinityTags : [],
    whatIncluded: (s.whatIncluded as string[]) || [],
    requirements: (s.requirements as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    neighborhood: s.neighborhood || "",
    meetingPoint: s.meetingPoint || "",
    whatToBring: (s as any).whatToBring || "",
    accessNotes: (s as any).accessNotes || "",
    // Existing coordinates + their precision, exactly as stored (decimal → string).
    locationPoint: parseStoredPoint(s.latitude, s.longitude),
    locationPrecision: s.locationPrecision ?? null,
    pickupAvailable: Boolean(s.pickupAvailable),
    collectsAndDrops: Boolean((s as any).collectsAndDrops),
    pickupAddress: s.pickupAddress || "",
    dropOffPoint: s.dropOffPoint || "",
    serviceRadius: Number(s.serviceRadius || 0),
    // NULL round-trips as "" / null — never coerced into a number or a presumed language.
    pickupRadiusKm: s.pickupRadiusKm == null ? "" : String(s.pickupRadiusKm),
    deliveryLanguages: Array.isArray(s.deliveryLanguages) ? (s.deliveryLanguages as string[]) : null,
    // Ruling 115: NULL on the row = English (the pre-216 assumption made explicit).
    sourceLocale: s.sourceLocale === "ja" ? "ja" : "en",
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
    seating: s.seating || "",
    changeCutoffHours: s.changeCutoffHours == null ? "" : String(s.changeCutoffHours),
    // S9 (ledger row 102): joinLink hydrates from the owner-gated read only (this mapper's one
    // caller); response window / scope statement round-trip like the D7 block above.
    joinLink: s.joinLink || "",
    responseWindowHours: s.responseWindowHours == null ? "" : String(s.responseWindowHours),
    scopeStatement: s.scopeStatement || "",
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

// WAVE 2 / S2: the listing home's hero needs a human method label. Same 7 canonical UI values
// (and the same copy) as the Basics step's own method picker — kept as a small module-scope
// map rather than a second inline array, so a future eighth branch can't drift between the two.
const DELIVERY_METHOD_LABELS: Readonly<Record<string, string>> = {
  "in-person": "In-Person",
  "video-call": "Video Call",
  hybrid: "Hybrid (In-Person + Video)",
  pdf: "PDF Guide",
  call: "Phone Call",
  voice_notes: "Voice Notes",
  async_messaging: "Async Messaging",
};
function deliveryMethodLabel(method: string): string {
  return DELIVERY_METHOD_LABELS[method] ?? method;
}

// WAVE 2 / S2: ONE status-pill definition for a provider listing, shared by the wizard's own
// "Current Status" card (FP-2 / A2) and the new listing home's hero — two different English
// phrasings of the same record would be its own small dishonesty on the same page. NOTE: a
// listing whose `status` came back "draft" reads as Draft REGARDLESS of `approvalStatus` — the
// F2 / migration 111 "born submitted" default means `approvalStatus` is "submitted" from the
// first save even for a plain Save Draft (QA_PUNCH_LIST finding C8, a ratified — if confusing —
// platform default, not something this lane changes), so `status` is checked FIRST or every
// fresh draft would misreport itself as already "In review".
type ListingStatusTone = "unsaved" | "draft" | "review" | "rejected" | "approved-paused" | "live";
function listingStatusPill(
  existingService: { status?: string | null; approvalStatus?: string | null } | null | undefined,
  isEditMode: boolean,
): { label: string; tone: ListingStatusTone } {
  if (!isEditMode) return { label: "Not saved yet", tone: "unsaved" };
  if (existingService?.status === "draft") return { label: "Draft (not submitted)", tone: "draft" };
  if (existingService?.approvalStatus === "approved") {
    return existingService?.status === "active"
      ? { label: "Live", tone: "live" }
      : { label: "Approved — paused", tone: "approved-paused" };
  }
  if (existingService?.approvalStatus === "rejected") return { label: "Changes requested", tone: "rejected" };
  return { label: "In review", tone: "review" };
}

export function ServiceForm({ role, id, onSuccess }: ServiceFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [newIncluded, setNewIncluded] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  // FP-1 / B7: in-flight + succeeded state for the protected-deliverable upload (ruling 58 / R4).
  // `deliverableUploaded` means "this session uploaded a file, so the row ALREADY carries an
  // objstore: key" — it is what keeps the subsequent save from clobbering that key with an empty
  // URL box, and what satisfies the publish gate without the owner having to paste anything.
  const [deliverableUploading, setDeliverableUploading] = useState(false);
  const [deliverableUploaded, setDeliverableUploaded] = useState(false);
  // L27-P3 (§13): only an explicit Confirm/Remove in the picker sends `locationPoint`.
  // Untouched ⇒ the key is omitted entirely ⇒ the server leaves latitude/longitude/
  // location_precision exactly as they are, so an unrelated edit can never turn a
  // migration-129 neighborhood centroid into an `'exact'` claim.
  const [locationPointTouched, setLocationPointTouched] = useState(false);
  // Ruling 85: true once a NEW listing's pin was seeded from the provider's saved account office
  // location, so the picker can show a "pre-filled from your office" note. Reset when the pin is
  // cleared/moved by the user (they've taken over from the pre-fill).
  const [officePinPrefilled, setOfficePinPrefilled] = useState(false);
  const officePreFilled = useRef(false);

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

  // ── WAVE 2 / LANE S2 — the listing home ──────────────────────────────────────────────────────
  // A saved listing (edit mode, provider role — the execution map's provider-console lane) lands
  // on the checklist/hero view by DEFAULT; the wizard itself is entered only via a checklist row
  // (or any other `?step=<key>` deep link, A1). `!isEditMode` (still on `/…/new`) always renders
  // the wizard, same as before this lane — a draft that does not exist yet has no listing home to
  // land on. Local state, not derived from the URL on every render, because a checklist-row click
  // and a save-success both need to flip this WITHOUT waiting on a wouter route remount.
  const [viewListingHome, setViewListingHome] = useState<boolean>(
    () => isEditMode && role === "provider" && !new URLSearchParams(window.location.search).get("step"),
  );

  // WAVE 2 / S4 (ledger row 99): the "Pricing & fees" drawer, mounted beside the listing home's
  // checklist — never inside it (none of the fields it edits is required-for-final; see
  // pricing-fees.ts's module doc). Local open/close state only; the drawer owns its own fetch/save.
  const [pricingDrawerOpen, setPricingDrawerOpen] = useState(false);
  // Gap #16: the listing home's Photos & media drawer — the cover photo's owning surface.
  const [photosDrawerOpen, setPhotosDrawerOpen] = useState(false);

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

  // ── Ruling 112 Q4 — AUTOSAVE (the mock's contract: "Draft · autosaved — closing this tab
  // keeps everything"). Create mode only: the in-progress form is checkpointed to localStorage
  // and restored on return, retiring the punch-list "wizard persistence" loss. Edit mode already
  // persists to the real row. Merged over buildEmptyForm so a shape change in the form never
  // resurrects stale keys as the whole state.
  const AUTOSAVE_KEY = `traveloure:new-service-autosave:v1:${role}`;
  const readAutosave = (): { formData: Partial<ServiceFormData>; currentStep?: number; savedAt?: string } | null => {
    if (isEditMode || typeof window === "undefined") return null;
    // Ruling 114: an EXPLICIT entry intent — an ideas-rail tile, an /earn CTA, a Workstation
    // category card (?offeringTypeKey= / ?category=) — beats a stale checkpoint. The checkpoint
    // is not deleted (the next plain visit still offers it); it just doesn't hijack this one.
    const params = new URLSearchParams(window.location.search);
    if (params.get("offeringTypeKey") || params.get("category")) return null;
    try {
      const raw = window.localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && parsed.formData ? parsed : null;
    } catch {
      return null;
    }
  };
  const initialAutosave = useRef(readAutosave());
  const [formData, setFormData] = useState<ServiceFormData>(() =>
    initialAutosave.current
      ? { ...buildEmptyForm(role), ...initialAutosave.current.formData }
      : buildEmptyForm(role),
  );
  const [autosaveRestoredAt, setAutosaveRestoredAt] = useState<string | null>(
    initialAutosave.current?.savedAt ?? null,
  );
  const clearAutosave = () => {
    try { window.localStorage.removeItem(AUTOSAVE_KEY); } catch { /* private mode */ }
  };
  const discardAutosave = () => {
    clearAutosave();
    initialAutosave.current = null;
    setAutosaveRestoredAt(null);
    setFormData(buildEmptyForm(role));
    setCurrentStep(1);
  };
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  useEffect(() => {
    const st = initialAutosave.current?.currentStep;
    if (!isEditMode && typeof st === "number" && st >= 1) setCurrentStep(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isEditMode) return;
    // Only checkpoint once the provider has actually typed something — a pristine empty form
    // saved on mount would greet every future visit with a bogus "restored" banner.
    const dirty = Boolean(
      formData.name?.trim() ||
      formData.description?.trim() ||
      formData.basePrice > 0 ||
      formData.serviceOfferingTypeId ||
      formData.expertOfferingTypeId,
    );
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ formData, currentStep, savedAt }),
        );
        setAutosavedAt(savedAt);
      } catch { /* storage full / private mode — the manual Save Draft rail still works */ }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, currentStep, isEditMode]);

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

  // Fetch all pages of neighborhoods sequentially (reference catalog may exceed 200-row page).
  const { data: allNeighborhoods = [] } = useQuery<Array<{ id: string; city: string; country: string; name: string; slug: string }>>({
    queryKey: ["/api/city-neighborhoods", "all"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const PAGE = 200;
      let all: Array<{ id: string; city: string; country: string; name: string; slug: string }> = [];
      let offset = 0;
      for (;;) {
        const res = await fetch(`/api/city-neighborhoods?limit=${PAGE}&offset=${offset}`);
        const json = await res.json() as { data: Array<{ id: string; city: string; country: string; name: string; slug: string }>; hasMore: boolean };
        all = all.concat(json.data);
        if (!json.hasMore) break;
        offset += PAGE;
      }
      return all;
    },
  });
  // Ruling 112 Q1: the global 20-city checkbox wall is retired for a single searchable pick —
  // this is its filter text. One neighborhood, because the column is one neighborhood (the old
  // multi-select silently dropped every pick after the first — Run-2 finding R7).
  const [neighborhoodQuery, setNeighborhoodQuery] = useState("");

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

  // WAVE 2 / S2: the listing home's "Publish some availability" row reads the REAL slot count —
  // same endpoint Catalog's own AvailabilitySection already reads (`GET /api/me/services/:id/slots`,
  // ownership resolved server-side against `provider_services.userId`, role-agnostic §14) — never a
  // second implementation of "does this listing have any". Provider + edit mode only: the row (and
  // the query) do not exist for a draft that has no id yet.
  const { data: availabilitySlots } = useQuery<Array<{ id: string }>>({
    queryKey: [`/api/me/services/${id}/slots`],
    enabled: isEditMode && role === "provider",
  });

  // Ruling 85: the provider's account-level office location — used ONLY to PRE-FILL a NEW listing's
  // map pin so they don't re-place it every time. Provider role + create mode only (an expert has
  // no provider form; an edit already carries its own pin, or deliberately lacks one). The office
  // coords are provider-CONFIRMED (saved via the same confirm-gated picker), so seeding a new pin
  // with them is honest (§13); the provider can still move or remove it per listing before saving.
  const { data: providerAccountForm } = useQuery<{ officeLocation?: { address?: string | null; lat: number; lng: number } | null } | null>({
    queryKey: ["/api/provider-application"],
    enabled: role === "provider" && !isEditMode,
  });

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

  // Ruling 85: seed a NEW listing's meeting pin from the provider's saved account office location.
  // Runs once, only when creating (never editing), only if the provider has NOT already touched the
  // pin and none is set yet, and only if the account office location is present + parseable. §13: a
  // NULL/absent office location leaves the picker empty — behaves exactly as before (no pre-fill).
  // The pin is marked "touched" so the seeded point is actually SENT on create (see the submit
  // guard); it stays fully overridable/removable per listing.
  // Ruling 86 (§13): "touched" is necessary but NOT sufficient — the submit guard also requires the
  // listing to be place-anchored at submit time, so this seed can never reach a pdf/call/async
  // listing whose Meeting Location card (and therefore the pin + its pre-fill note) never renders.
  useEffect(() => {
    if (role !== "provider" || isEditMode || officePreFilled.current) return;
    if (locationPointTouched || formData.locationPoint) return;
    const loc = providerAccountForm?.officeLocation;
    if (!loc) return;
    const point = parseStoredPoint(loc.lat, loc.lng);
    if (!point) return; // §13: never seed from a non-finite/out-of-range stored value
    officePreFilled.current = true;
    setFormData((prev) => ({ ...prev, locationPoint: point }));
    setLocationPointTouched(true);
    setOfficePinPrefilled(true);
  }, [providerAccountForm, role, isEditMode, locationPointTouched, formData.locationPoint]);

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

  // ── A1: `?step=<key>` deep link ────────────────────────────────────────────────────────────
  // The checklist rows, Catalog's map preview and the pin-health rail all need to re-enter the
  // flow AT a named step ("fix this listing's location" = the Logistics step), and a step NUMBER
  // would be wrong the moment the delivery method changed the flow's shape. So the link carries
  // the step's stable KEY and this resolves it against the loaded row's own method. Runs ONCE
  // (guarded), after the row has hydrated — otherwise it would fight the provider's own
  // navigation, and in edit mode it would resolve against the empty form's default method.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (isEditMode && !existingService) return; // wait for the real method
    const requested = new URLSearchParams(window.location.search).get("step");
    if (!requested) {
      deepLinkApplied.current = true;
      return;
    }
    const n = stepNumberOf(formData.deliveryMethod, requested as StepKey);
    // An unknown key, or one this branch does not have, is NOT an error and never a guess: the
    // provider simply stays on step 1 (§13 — a pdf listing has no Logistics step to land on).
    if (n > 0) {
      setCurrentStep(n);
      // S2: a `?step=` link means "enter the flow here" — never the listing home, even for a
      // provider whose default landing (see `viewListingHome`'s initializer) would otherwise be it.
      setViewListingHome(false);
    }
    deepLinkApplied.current = true;
  }, [isEditMode, existingService, formData.deliveryMethod]);

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

  // ── FP-1 / B7: the protected-deliverable upload (ruling 58 / R4's first client caller) ────
  // Raw bytes, not multipart — the server route is `express.raw({ type: ["application/pdf", …] })`
  // scoped to itself, and no multipart plumbing exists anywhere in this codebase. The server
  // validates the %PDF- magic bytes, caps at 20MB and NEVER echoes the storage key back, so all
  // this handler learns is success/failure. On success the stored value becomes `objstore:<key>`;
  // we mirror that locally as the sentinel the field already understands (`isManaged`), which
  // flips the honest "platform-protected" copy and satisfies the publish gate — the same string
  // the owner-gated read would hydrate on the next open.
  const uploadDeliverable = async (file: File) => {
    if (!id) return; // create mode has no row to attach to — the UI says so instead
    setDeliverableUploading(true);
    try {
      const res = await fetch(`/api/provider/services/${id}/deliverable-file`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // Honest, actionable failure — the server's own message (not a PDF, too large, storage
        // unavailable), never a generic "something went wrong" and never a fake success.
        throw new Error(body?.message ?? `Upload failed (${res.status})`);
      }
      // The upload has ALREADY written provider_services.serviceFile server-side. Record that
      // locally and clear the URL box: from here the save must OMIT the field entirely, or an
      // empty box (or a stale pasted link) would overwrite the protected key that was just
      // stored. Deliberately NOT invalidating ["/api/provider/services", id] — that query's
      // hydration effect resets the whole form, which would discard the provider's unsaved edits.
      setDeliverableUploaded(true);
      set("serviceFile", "");
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services/health"] });
      toast({
        title: "Deliverable uploaded",
        description: "Buyers receive this file from platform-protected storage after their booking is confirmed.",
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setDeliverableUploading(false);
    }
  };

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
      // FP-1 / B5: the timing/capacity/booking-rules half of the D7 capture follows the SCHEDULED
      // predicate (call + video join in_person/hybrid), matching the card that now renders them.
      // The transport/pickup/surcharge half stays place-anchored. Both halves keep ruling 62's
      // never-clobber shape: keys are OMITTED (never null) when they do not apply, so a save on a
      // listing that has since changed method leaves whatever was captured earlier untouched.
      const isScheduledListing = needsScheduling({
        deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
        productShape: existingService?.productShape ?? null,
      });
      // isRemoteSessionListing / isAsyncListing (S9, ledger row 102) are computed once at
      // component scope above — the JSX below reads the same values.
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
        // Ruling 112 Q1: display location is COMPOSED from the picked neighborhood (structured
        // data the provider chose — never parsed, never guessed), and the literal "Unknown"
        // client write is retired. No neighborhood → the key is omitted so an edit never
        // clobbers a stored location with a placeholder.
        location: (() => {
          const sel = allNeighborhoods.find((n) => n.slug === formData.neighborhood);
          return sel ? `${sel.name}, ${sel.city}` : undefined;
        })(),
        neighborhood: formData.neighborhood || null,
        meetingPoint: formData.meetingPoint || null,
        whatToBring: formData.whatToBring.trim() || null,
        accessNotes: formData.accessNotes.trim() || null,
        pickupAvailable: formData.pickupAvailable,
        collectsAndDrops: formData.pickupAvailable,
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
        // Ruling 115: the declared source language of the listing's own content.
        sourceLocale: formData.sourceLocale,
        // Transport disclosure only carries meaning for an in-person/hybrid meeting; remote → not_applicable.
        transportProvided: isInPerson ? formData.transportProvided : "not_applicable",
        // ── D7 service-logistics capture (ruling 62, migration 195) ─────────────────────────
        // Sent for PLACE-ANCHORED listings only — getting to a place, and charging for the
        // distance to it, mean nothing on a remote session. The keys are OMITTED entirely
        // otherwise, so a PATCH on a pdf/call listing leaves whatever was captured earlier
        // untouched rather than wiping it (§13).
        ...(isPlaceAnchoredListing
          ? {
              transportProvision: formData.transportProvision || null,
              // The coverage MODE is meaningless without a pickup provision — clear the CHOICE
              // when it no longer applies. This clears no DATA: `serviceRadius` above and the
              // `service_route_points` rows are both untouched by this write.
              pickupCoverageMode: isPickupProvision ? (formData.pickupCoverageMode || null) : null,
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
        // FP-1 / B5: timing, capacity and booking rules follow the SCHEDULED predicate — a live
        // call/video session has a duration, a start window, a time zone, a party size and a
        // change cutoff exactly as an in-person tour does. Same omit-when-absent contract.
        ...(isScheduledListing
          ? {
              durationMinutes: intOrNull(formData.durationMinutes),
              bufferMinutes: intOrNull(formData.bufferMinutes),
              earliestStartTime: formData.earliestStartTime || null,
              latestStartTime: formData.latestStartTime || null,
              serviceTimezone: formData.serviceTimezone.trim() || null,
              partySizeMin: intOrNull(formData.partySizeMin),
              partySizeMax: intOrNull(formData.partySizeMax),
              // Capacity-step "Seating" (migration 239): "" ⇒ null (never answered, §13).
              seating: formData.seating || null,
              changeCutoffHours: intOrNull(formData.changeCutoffHours),
              canAnchor: formData.canAnchor === "" ? null : formData.canAnchor === "yes",
            }
          : {}),
        // S9 (ledger row 102): joinLink sent for a scheduled remote session (call/video) only —
        // omitted entirely otherwise, same never-clobber contract as the blocks above, so a
        // method switch away from call/video never wipes a previously-saved link.
        ...(isRemoteSessionListing
          ? { joinLink: formData.joinLink.trim() || null }
          : {}),
        // S9: response window / scope statement sent for the two async methods only — omitted
        // otherwise. Descriptive only; does not touch completionRuleFor or the completion
        // machinery (shared/service-fundamentals.ts, server/services/booking-completion.service.ts).
        ...(isAsyncListing
          ? {
              responseWindowHours: intOrNull(formData.responseWindowHours),
              scopeStatement: formData.scopeStatement.trim() || null,
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
        //
        // FP-1 / B7 NEVER-CLOBBER: after a protected upload in this session the row already
        // carries `objstore:<key>` — a key this client is never shown (by design: the rail's whole
        // point is that the location is never disclosed). So while the URL box is empty and an
        // upload has happened, the key is OMITTED from the payload entirely and the stored value
        // survives. Typing a URL after uploading still replaces it, exactly as the field's own
        // copy promises.
        ...(formData.deliveryMethod === "pdf" && deliverableUploaded && !formData.serviceFile.trim()
          ? {}
          : { serviceFile: formData.deliveryMethod === "pdf" ? (formData.serviceFile || null) : null }),
        categoryAttributes: formData.categoryAttributes,
      };

      // L27-P3: the confirmed map point. Sent ONLY when the earner actually used the
      // picker in this session — an object for a confirmed pin, explicit `null` to remove
      // one. Omitted otherwise so the server leaves the stored coordinates/precision
      // untouched (§13). The client never sends latitude/longitude/locationPrecision
      // directly: the server strips those and derives `'exact'` from this field alone.
      //
      // Ruling 86 (§13): ALSO gated on the listing being place-anchored. `isInPerson` is the
      // same predicate as `needsMeetingPoint`, which is what renders the Meeting Location card
      // — the ONLY surface that shows a pin (picker + the ruling-85 "Pre-filled from your office
      // location" note). Ruling 85's office seed marks the pin touched so it saves, with no
      // delivery-method condition, so a pdf/call/async listing was getting the provider's office
      // coordinates stamped on it with NO UI anywhere showing them: a location the provider never
      // saw or confirmed, on a listing that has none. OMIT (never `null`) when not place-anchored:
      // key-absent = untouched is the never-clobber contract (extractServiceLocation rule 3), so
      // an edit-mode round trip cannot wipe a pin that is already stored; `null` would clobber it.
      if (locationPointTouched && isInPerson) {
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

      // ── WAVE 2 / LANE S2 — the listing home ──────────────────────────────────────────────
      // A PROVIDER save — Save Draft or Submit for review, from the wizard OR the listing
      // home's own button, create OR edit — lands on the listing home. This replaces both the
      // old generic "View My Services / Add Another Service" create screen and the silent
      // edit-mode bounce back to Catalog. L2's rule holds unchanged: the outcome copy reflects
      // the RETURNED row, never the button label — a create is clamped server-side to a
      // non-approved born state (F2 / migration 111), so "Submit for review" never claims live.
      if (role === "provider") {
        const approvalStatus: string | null | undefined =
          service?.approvalStatus ?? (isEditMode ? existingService?.approvalStatus : undefined);
        const isDraftOutcome = submitAction === "draft" || approvalStatus === "draft";
        toast({
          title: isDraftOutcome ? "Draft saved" : "Submitted for review",
          description: isDraftOutcome
            ? "Not yet visible to travelers — submit it for review when ready."
            : "It goes live once approved. You'll be notified when it's reviewed.",
        });
        const savedId: string | undefined = service?.id ?? id;
        // Ruling 112 Q4: the row now owns this draft — the local checkpoint's job is done.
        if (!isEditMode) { clearAutosave(); setAutosaveRestoredAt(null); }
        if (onSuccess && savedId) onSuccess(savedId);
        // `viewListingHome`'s useState INITIALIZER only ever runs once, at this component
        // instance's true first mount — and wouter's `<Switch>` reuses the SAME `ServiceForm`
        // instance across `/provider/services/new` → `/provider/services/:id/edit` (same
        // component reference at the same tree position, only the `id` PROP changes), exactly
        // the reason the old `handleAddAnother` had to hand-reset local state instead of relying
        // on a remount. So this is set EXPLICITLY here rather than trusted to re-derive itself
        // from the URL on a navigation that will not actually remount anything.
        setViewListingHome(true);
        if (!isEditMode && savedId) {
          // The id did not exist a moment ago — give the row its own URL too (so a reload,
          // bookmark or share lands back here), even though the state flip above already did
          // the actual rendering work.
          navigate(`/provider/services/${savedId}/edit`);
        }
        return;
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
      // role === "expert" from here on (provider already returned above).
      if (approvalStatus === "draft") {
        toast({ title: "Draft saved", description: "Not yet visible to travelers — submit it for review when ready." });
      } else if (isLive) {
        toast({ title: "Service published!", description: "Your service is now live." });
      } else {
        toast({ title: "Submitted for review", description: "It goes live once approved." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      navigate("/expert/services");
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
  // ── FP-1 / A1 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P0) ──────────────────────────────
  // Picking an offering makes Category a LOCKED, derived display. When the offering's
  // `category_key` matches no `service_categories` row, that lock rendered "—",
  // `formData.categoryId` stayed empty, and Publish was permanently disabled behind a bare
  // "Still needed: Category (Step 1)" the provider had no way to satisfy — the custom-offering
  // dead end. The DATA cause is fixed (seeder + migration 208); this is the RENDER half: an
  // unresolvable key is now an explicit, honest error with a way out, never a silent dash on a
  // dead button (§13 — say what is wrong rather than look merely incomplete).
  const offeringCategoryUnresolved =
    role === "provider" &&
    !!formData.serviceOfferingTypeId &&
    !!selectedProviderOffering &&
    categories.length > 0 &&
    !selectedCategory;
  const needsMeetingPoint = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";
  // ── D7 (docs/DECISIONS.md ruling 62) ─────────────────────────────────────────────────────
  // Placement: the logistics/delivery step, shown ONLY for place-anchored methods, decided by
  // the SHARED predicate (shared/service-fundamentals.ts) rather than a local method list.
  const showLogisticsCapture = isPlaceAnchored({
    deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
    productShape: existingService?.productShape ?? null,
  });
  // ── FP-1 / B5 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ──────────────────────────────
  // Picking Video Call or Phone removed the ENTIRE logistics card — all eight scheduling fields
  // (duration, buffer, earliest/latest start, timezone, party size, change cutoff, can-anchor)
  // vanished. But a live remote session is SCHEDULED: `SCHEDULED_METHODS`
  // (shared/service-fundamentals.ts) already says call/video need bookable slots, and the health
  // rail already scores them on availability. A Kyoto provider selling a 09:00 call to a New York
  // buyer could not state WHICH 09:00. The timing / capacity / booking-rules sections are now
  // gated on the SHARED scheduled predicate; place-anchored (`showLogisticsCapture`) still gates
  // transport / pickup coverage / travel surcharge, which are meaningless without a place.
  // isPlaceAnchored ⊂ needsScheduling, so an in-person listing sees exactly what it saw before.
  const showScheduledLogistics = needsScheduling({
    deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
    productShape: existingService?.productShape ?? null,
  });
  // S9 (docs/DECISIONS.md ledger row 102): joinLink applies to a scheduled REMOTE session only
  // (call/video — SESSION_END_METHODS) — narrower than showScheduledLogistics above, which also
  // covers in-person/hybrid (a physical meeting point, not a link). Async fields apply to the two
  // provider-declared-completion methods (async_messaging/voice_notes — PROVIDER_DECLARED_METHODS).
  // Computed here (component scope) rather than inside the mutation so both the JSX below and the
  // submit payload can read the same value.
  const isRemoteSessionListing = SESSION_END_METHODS.has(toCanonicalDelivery(formData.deliveryMethod));
  const isAsyncListing = formData.deliveryMethod === "voice_notes" || formData.deliveryMethod === "async_messaging";
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

  // ── Step machinery — WAVE 2 / A1: METHOD-FIRST, BRANCHING (audit item #10 originally) ──────
  // The four fixed steps are gone. `flowForMethod` (client/src/lib/service-form-steps.ts) is the
  // ONE placement authority: it says which steps this listing has and which step holds which
  // section, and the same module answers the "still needed" jump links (service-form-required.ts).
  // Nothing here re-derives placement locally.
  //
  // The step INDEX is derived, never stored clamped: switching to a shorter branch (in-person → 5
  // steps, pdf → 3) while standing on step 5 must not leave the form pointing off the end. It
  // lands on the new branch's last step instead, and nothing in `formData` is touched — the
  // never-clobber posture (FP-1 / B5): a hidden section's answers are still there, still sent, and
  // reappear the moment the method comes back.
  const flow = flowForMethod(formData.deliveryMethod);
  const TOTAL_STEPS = flow.length;
  const effectiveStep = clampStep(formData.deliveryMethod, currentStep);
  const stepKey: StepKey = flow[effectiveStep - 1];
  /** Is the wizard standing on this step right now? */
  const onStep = (key: StepKey) => stepKey === key;
  /** Does this step hold that section? (Placement only — VISIBILITY is still the shared
   *  predicates: isPlaceAnchored / needsScheduling / the pdf gate.) */
  const onSection = (section: SectionKey) => stepForSection(section, formData.deliveryMethod) === stepKey;

  const goToStep = (step: number) => {
    setCurrentStep(clampStep(formData.deliveryMethod, step));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goToStepKey = (key: StepKey) => {
    const n = stepNumberOf(formData.deliveryMethod, key);
    if (n > 0) goToStep(n);
  };

  // ── The wizard's required-field set — see client/src/lib/service-form-required.ts ──────────
  // The predicate lives in that module (pure, unit-tested) rather than inline here, because the
  // rule it keeps is a two-way one — THE ASTERISK SET EQUALS THE ENFORCED SET — and a rule
  // stated only in prose inside this file is a rule nothing can check. Every entry mirrors an
  // enforcement that already exists (a disabled-button condition, or a server publish gate);
  // this list is the routing/explanation half. FP-2 / Package A item 4 added the three that were
  // missing (price, required category fields, the attestation confirmations) and the same lane
  // removed the two asterisks nothing required (Description, Duration). Draft saves stay
  // check-free, exactly as before.
  const requiredFieldInput = {
    role,
    isEditMode,
    name: formData.name,
    categoryId: formData.categoryId,
    offeringCategoryUnresolved,
    serviceOfferingTypeId: formData.serviceOfferingTypeId,
    expertOfferingTypeId: formData.expertOfferingTypeId,
    needsMeetingPoint,
    meetingPoint: formData.meetingPoint,
    deliveryMethod: formData.deliveryMethod,
    serviceFile: formData.serviceFile,
    deliverableUploaded,
    priceType: formData.priceType,
    basePrice: formData.basePrice,
    pricingTiers: formData.pricingTiers,
    categoryFields,
    categoryAttributes: formData.categoryAttributes,
    attestationGateBlocked,
  };
  const missingForFinal = missingRequiredForFinal(requiredFieldInput);

  // WAVE 2 / S2: the listing home's checklist — the SAME `requiredFieldInput` above (never a
  // forked set), plus the two facts only this surface needs: whether an attestation applies at
  // all (so the row never renders hollow) and the real slot count (so "Publish some
  // availability" ticks off the record, never off a click). Only meaningful once the row exists.
  const checklistRows: ChecklistRow[] = isEditMode
    ? deriveServiceChecklist({
        ...requiredFieldInput,
        attestationsApplicable: attestationResolution.applicable.length > 0,
        availabilitySlotCount: Array.isArray(availabilitySlots) ? availabilitySlots.length : 0,
        // Gap #16: the same expression the Catalog thumb renders (serviceImage || gallery[0]) —
        // the row ticks exactly when a traveler-facing card would show a photo.
        coverPhotoPresent: Boolean(formData.serviceImage || formData.galleryImages[0]),
        // The 140+ row reads the same field the Basics counter counts (mock fidelity, Aug 17).
        description: formData.description,
      })
    : [];

  const handleFinalSubmit = (action: "submit" | "publish") => {
    const firstMissing = missingForFinal[0];
    if (firstMissing) {
      // Jump to the step that holds the invalid field; the mutation's own
      // checks remain the backstop and are unchanged.
      goToStep(firstMissing.step);
      toast({
        title: "A required field is missing",
        description: `${firstMissing.label} — on ${STEP_SHORT_TITLES[firstMissing.stepKey]} (step ${firstMissing.step}) — is required before you submit this for review. ${isEditMode ? "You can Save Draft to finish later." : "Your draft is autosaved — finish it any time."}`,
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

  // ── FP-3 BACK DOOR: /provider/services/:id/edit opened with a property or property_room id ──
  //
  // Catalog no longer links here for those rows, but a deep link, a stale bookmark, a browser
  // history entry or a hand-typed URL still can. The questionnaire below asks for a delivery
  // method, a service checklist, "what's included", a meeting point — a guest room answers none
  // of it, and worse, SAVING it would write those answers onto an accommodation row. So the form
  // is never rendered for one; an honest interstitial names the shape and links to the surface
  // that actually edits it.
  //
  // The classification is SERVER-DERIVED: `productShape` comes off the fetched
  // GET /api/provider/services/:id row (owner-gated), never from the URL or any other
  // client-supplied value — a crafted `?shape=` could not turn this guard off or on.
  // `existingService` is undefined while the row is missing/404 (that path is unchanged).
  const backDoorShape: string | null = isEditMode ? (existingService?.productShape ?? null) : null;
  if (isPropertyEditorShape(backDoorShape)) {
    const isRoom = isPropertyRoom(backDoorShape);
    const editorHref =
      propertyEditorHref({
        id: id!,
        productShape: backDoorShape,
        parentServiceId: existingService?.parentServiceId ?? null,
      }) ?? "/provider/workstation";
    return (
      <div className="p-6 max-w-lg mx-auto" data-testid="guard-property-shape">
        <Card>
          <CardContent className="p-8 space-y-4">
            <div className="flex items-center gap-2 text-console-darkest">
              <Info className="w-5 h-5 flex-shrink-0 text-primary" />
              <h2 className="text-lg font-semibold">
                {isRoom ? "Rooms are edited on their property" : "Properties are edited in the Workstation"}
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              {isRoom
                ? "This listing is a room type inside a property. A room has no delivery method and no service checklist of its own — it inherits them from its property — so the service form can't describe it honestly. Its name, nightly price, units and availability live on the property editor."
                : "A property is an accommodation with room types priced per night, not a single service. Its details and its room types are edited together in the Workstation."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={() => navigate(editorHref)}
                data-testid="button-goto-property-editor"
              >
                {isRoom ? "Open the property editor" : "Open in the Workstation"}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/${role}/services`)}
                data-testid="button-guard-back-to-catalog"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Catalog
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── WAVE 2 / LANE S2 — THE LISTING HOME ───────────────────────────────────────────────────
  // Reuses the SAME route that already owns per-listing editing (`/provider/services/:id/edit`,
  // the ratified mock's "listing home" maps onto it rather than a new page) instead of the old
  // generic post-create screen this replaced. Hero (name · method · price · status pill) + the
  // derived checklist (`deriveServiceChecklist`, `client/src/lib/service-form-required.ts`) +
  // Submit for review, gated on the SAME `missingForFinal` the wizard's own final step already
  // uses (never a forked "is this ready" opinion) + links to the drawers this lane does not
  // rebuild (photos, deliverable, availability — all pre-existing surfaces).
  if (isEditMode && role === "provider" && viewListingHome && existingService) {
    const price = effectivePriceScalar({
      priceType: formData.priceType,
      basePrice: formData.basePrice,
      pricingTiers: formData.pricingTiers,
    });
    const statusPill = listingStatusPill(existingService, isEditMode);
    // ONLY "review" freezes the checklist/button — a rejected listing needs to be
    // resubmittable (that's the whole point of "changes requested"), and an already-live
    // listing can still submit an edit for re-review (§17's edit-split, gap #17, Wave 3).
    const frozen = statusPill.tone === "review";
    const doneCount = checklistRows.filter((r) => r.done).length;
    const leftCount = checklistRows.length - doneCount;
    const openChecklistRow = (row: ChecklistRow) => {
      if (row.target.kind === "availability") {
        navigate(`/provider/services?availability=${encodeURIComponent(id!)}`);
        return;
      }
      // Gap #16: "Add a cover photo" opens the Photos & media drawer — the owning surface.
      if (row.target.kind === "photos") {
        setPhotosDrawerOpen(true);
        return;
      }
      setViewListingHome(false);
      goToStepKey(row.target.stepKey);
    };
    return (
      <div className="p-6 max-w-3xl space-y-6" data-testid="view-listing-home">
        <button
          onClick={() => navigate(`/${role}/services`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-listing-home-back"
        >
          <ArrowLeft className="w-4 h-4" /> My Services
        </button>

        <Card data-testid="card-listing-hero">
          <CardContent className="p-5 flex items-start gap-4 flex-wrap">
            <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
            <div className="flex-1 min-w-[220px]">
              <h2 className="text-lg font-semibold text-gray-900" data-testid="text-listing-hero-name">
                {formData.name || "Untitled listing"}
              </h2>
              <p className="text-sm text-muted-foreground" data-testid="text-listing-hero-sub">
                {deliveryMethodLabel(formData.deliveryMethod)}
                {" · "}
                {price != null ? `$${price}${formData.priceType !== "Fixed" ? ` (${formData.priceType})` : ""}` : "No price set yet"}
              </p>
            </div>
            <Badge
              variant={statusPill.tone === "live" ? "default" : "secondary"}
              data-testid="badge-listing-hero-status"
            >
              {statusPill.label}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" data-testid="text-checklist-heading">
              {frozen
                ? leftCount === 0
                  ? "Submitted — nothing outstanding"
                  : `Submitted — ${leftCount} still outstanding`
                : leftCount === 0
                  ? "Nothing left — ready for review"
                  : `${leftCount} ${leftCount === 1 ? "thing" : "things"} left before review`}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Derived from the draft — rows navigate to the surface that owns the work; nothing
              here ticks itself.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div data-testid="list-checklist">
              {checklistRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openChecklistRow(row)}
                  className="w-full flex items-start gap-3 px-5 py-3 text-left border-t first:border-t-0 hover:bg-muted/40 transition-colors"
                  data-testid={`checklist-row-${row.id}`}
                  aria-checked={row.done}
                >
                  <span
                    className={`mt-0.5 flex-shrink-0 rounded-full ${row.done ? "text-green-600" : "text-muted-foreground/50"}`}
                  >
                    {row.done ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{row.label}</span>
                    <span className="block text-xs text-muted-foreground">{row.hint}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── WAVE 2 / S4 (ledger row 99) — "Pricing & fees", BESIDE the checklist, never inside
            it: none of the drawer's fields is required-for-final (verified in pricing-fees.ts's
            module doc), so this card never gates Submit and never appears as a checklist row. */}
        <Card data-testid="card-pricing-fees">
          <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-gray-900">Pricing &amp; fees</p>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-pricing-fees-summary">
                {pricingFeesSummary(
                  pricingFeesFromService(existingService, (surchargeTierState as any)?.surchargeTiers),
                  { surchargeApplicable: showLogisticsCapture && pickupProvisionChosen },
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Tune later — not required to go live.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setPricingDrawerOpen(true)}
              data-testid="button-open-pricing-fees"
            >
              Manage
            </Button>
          </CardContent>
        </Card>

        {/* Ruling 112 Q7 — the mock's three-card settings rail. Availability and Photos & media
            sit BESIDE Pricing & fees as standing settings cards; each navigates to the surface
            that owns the work (the checklist-row rule), it never edits inline. */}
        <Card data-testid="card-listing-availability">
          <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-gray-900">Availability</p>
              <p className="text-xs text-muted-foreground mt-1">
                Slots, ranges and blackout dates. Lives on Catalog, beside the listing.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/${role}/services?availability=${id}`)}
              data-testid="button-open-listing-availability"
            >
              Manage
            </Button>
          </CardContent>
        </Card>
        {/* Gap #16 (Gate G5): the card opens the Photos & media drawer — the cover photo's
            owning surface (upload rail + pasted-link fallback). The gallery stays authored on
            the Review & submit step (an open question the mock names, deliberately not built). */}
        <Card data-testid="card-listing-photos">
          <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-gray-900">Photos &amp; media</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cover photo — uploaded to platform-protected storage, or a pasted link. The
                gallery stays on Review &amp; submit.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setPhotosDrawerOpen(true)}
              data-testid="button-open-listing-photos"
            >
              Manage
            </Button>
          </CardContent>
        </Card>

        {/* Ruling 115 — Languages: the console surface for the ruling-60 translation rails.
            Sits on the same settings rail (never a checklist row — a translation is optional). */}
        <ServiceLanguagesCard
          serviceId={id!}
          sourceLocale={existingService?.sourceLocale === "ja" ? "ja" : "en"}
          original={{
            serviceName: existingService?.serviceName ?? null,
            shortDescription: existingService?.shortDescription ?? null,
            description: existingService?.description ?? null,
            meetingPoint: existingService?.meetingPoint ?? null,
          }}
        />

        {/* ── S-1 (ledger 2026-08-16-console-sweep, P1) — the §23 edit-split, STATED before the
            provider edits, not discovered afterwards via the "Edit in review" pill. The mock's
            "Editing a live listing" two-column panel, rendered ONLY for an approved listing
            (§23 governs edits after first approval; a draft has no live row to protect). Both
            lanes come from @shared/edit-split — the module the PATCH handler itself imports —
            so this panel can never drift from the split the server actually applies. */}
        {existingService.approvalStatus === "approved" && (
          <Card data-testid="card-edit-split">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Editing a live listing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Edits that cannot mislead a traveler about what they are buying go straight live;
                edits that change the thing itself re-enter review — and the previously approved
                version stays live and bookable while they do.
              </p>
              <div className="grid sm:grid-cols-2 rounded-md border overflow-hidden">
                <div className="p-4 border-b sm:border-b-0 sm:border-r bg-[#EDF2F1]">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#35605A] mb-2">
                    Goes live immediately
                  </p>
                  <ul className="space-y-1" data-testid="list-edit-split-safe">
                    {SAFE_EDIT_LANE_LABELS.map((label) => (
                      <li key={label} className="text-xs text-gray-700">
                        <span className="text-muted-foreground">— </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#6B551F] mb-2">
                    Re-enters review
                  </p>
                  <ul className="space-y-1" data-testid="list-edit-split-identity">
                    {IDENTITY_EDIT_LANE.map((row) => (
                      <li key={row.label} className="text-xs text-gray-700">
                        <span className="text-muted-foreground">— </span>
                        {row.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="text-edit-split-note">
                While a re-review is pending, the listing shows{" "}
                <Badge variant="default" className="align-middle text-[10px] px-1.5 py-0">Live</Badge>{" "}
                +{" "}
                <Badge variant="secondary" className="align-middle text-[10px] px-1.5 py-0">Edit in review</Badge>{" "}
                on Catalog — travelers keep booking the approved version, and the edit lands only
                when it passes. <span className="font-medium text-gray-900">Nothing is taken down for an edit.</span>
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-gray-900">Ready when you are</p>
              <p className="text-xs text-muted-foreground mt-1">
                {frozen
                  ? "Submitted for review. We'll email you when it's decided. You can keep editing while it waits — changes are re-checked before anything goes live."
                  : "Reviewed by our team before it goes live. You can keep editing while it's in review."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/${role}/services`)}
                data-testid="button-listing-home-finish-later"
              >
                Finish later
              </Button>
              <Button
                onClick={() => handleFinalSubmit("publish")}
                disabled={frozen || createMutation.isPending || missingForFinal.length > 0 || verificationGateBlocked || publishBlocked || attestationGateBlocked}
                title={
                  missingForFinal.length > 0
                    ? `Still needed: ${missingForFinal.map((m) => m.label).join(", ")}`
                    : verificationGateBlocked
                    ? "Complete identity and business verification in your Provider Status page first"
                    : publishBlocked
                    ? "Complete background verification before submitting a listing in this category"
                    : undefined
                }
                data-testid="button-listing-home-submit"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {frozen ? "Submitted" : statusPill.tone === "live" ? "Submit changes for review" : "Submit for review"}
              </Button>
            </div>
          </div>
          {!frozen && missingForFinal.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-listing-home-missing">
              Still needed before you submit for review:{" "}
              {missingForFinal.map((m, i) => (
                <span key={`${m.step}-${m.label}`}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => openChecklistRow({ id: m.section, label: m.label, hint: "", done: false, target: { kind: "step", section: m.section, stepKey: m.stepKey, step: m.step } })}
                  >
                    {m.label}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </Card>

        {/* ── Ruling 114: the post-publish nudge — one line at the moment of momentum,
            pointing at the Workstation ideas rail (ruling 113: inspiration lives on the
            creation area). Named siblings come from the /earn catalog's own rows for THIS
            listing's category (nothing invented, §13); no siblings ⇒ no nudge. ── */}
        {role === "provider" && frozen && (() => {
          const siblings = providerOfferingTypes
            .filter(
              (o) =>
                o.category_key === selectedProviderOffering?.category_key &&
                o.id !== selectedProviderOffering?.id &&
                o.offering_type_key !== "custom_other_offering",
            )
            .slice(0, 2);
          if (siblings.length === 0 || !selectedCategory?.name) return null;
          return (
            <div
              className="flex items-baseline gap-2 flex-wrap rounded-lg border px-4 py-3 text-sm bg-amber-50 border-amber-200 text-amber-900"
              data-testid="nudge-more-ideas"
            >
              <span>
                <strong>Providers in {selectedCategory.name} also offer</strong>{" "}
                {siblings.map((o) => o.display_name.toLowerCase()).join(" and ")}.
              </span>
              <button
                type="button"
                className="ml-auto underline underline-offset-2 font-medium whitespace-nowrap"
                style={{ color: "var(--console-brand, #35605A)" }}
                onClick={() => navigate("/provider/workstation")}
                data-testid="link-nudge-workstation-ideas"
              >
                See ideas on Workstation →
              </button>
            </div>
          );
        })()}

        <PricingFeesDrawer
          open={pricingDrawerOpen}
          onOpenChange={setPricingDrawerOpen}
          serviceId={id!}
          surchargeApplicable={showLogisticsCapture && pickupProvisionChosen}
          basePriceLabel={price != null ? `$${price}${formData.priceType !== "Fixed" ? ` (${formData.priceType})` : ""}` : "No price set yet"}
          service={existingService}
          surchargeTiers={(surchargeTierState as any)?.surchargeTiers}
        />
        <ServicePhotosDrawer
          open={photosDrawerOpen}
          onOpenChange={setPhotosDrawerOpen}
          serviceId={id!}
          coverUrl={formData.serviceImage || formData.galleryImages[0] || ""}
          onCoverChange={(url) => set("serviceImage", url)}
        />
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
    <div className="p-6 max-w-5xl space-y-6">

      {/* ── Breadcrumb / Back ── */}
      <div className="flex items-center gap-2 text-sm">
        {/* WAVE 2 / S2: a provider who entered the flow FROM the listing home (a checklist row,
            or any other `?step=` deep link) gets back to it without a round trip through the
            server — the row it navigated from is what should be highlighted on return.
            RULING 113 (Workstation vs Catalog): the CREATE flow is Workstation territory — a
            provider's fresh create reads "Workstation › New service" and "Back" lands on
            /provider/workstation, never Catalog. Edit mode stays "Listing home" (the listing
            exists — it's being operated), and the expert console keeps "My Services". */}
        <button
          onClick={() =>
            isEditMode && role === "provider"
              ? setViewListingHome(true)
              : navigate(role === "provider" ? "/provider/workstation" : `/${role}/services`)
          }
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-form-back"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEditMode && role === "provider"
            ? "Listing home"
            : role === "provider"
            ? "Workstation"
            : "My Services"}
        </button>
        <span className="text-muted-foreground">›</span>
        <span className="text-foreground font-medium">
          {isEditMode ? "Edit Service" : role === "provider" ? "New service" : "New Service"}
        </span>
      </div>

      {/* ── MOCK CONFORMANCE (decision-maker, Aug 17): the mock's LEFT STEP RAIL replaces the
          horizontal ladder — a sticky card with the vertical step list, the why-these-steps
          note, and the generated-not-fixed reminder. Same testids, same click targets, same
          branch behavior (A1: the list IS the branch); only the chrome moved. ── */}
      <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      <aside className="lg:sticky lg:top-4 mb-6 lg:mb-0">
      <nav
        aria-label="Form steps"
        className="rounded-[7px] border border-[#E8E8E2] bg-white p-3.5"
        data-testid="service-form-steps"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[.07em] text-[#7A7A72] mb-3 px-1.5">Steps</p>
        <ol className="space-y-0.5">
          {flow.map((key, i) => {
            const title = STEP_SHORT_TITLES[key];
            const stepNum = i + 1;
            const isActive = effectiveStep === stepNum;
            const isDone = effectiveStep > stepNum;
            return (
              <li key={stepNum}>
                <button
                  type="button"
                  onClick={() => goToStep(stepNum)}
                  aria-current={isActive ? "step" : undefined}
                  className={`w-full flex items-start gap-2.5 rounded-md px-1.5 py-2 text-[13px] text-left transition-colors ${
                    isActive
                      ? "bg-[#EDF2F1] text-[#1A1A18] font-semibold"
                      : isDone
                      ? "text-[#1A1A18] hover:bg-[#FAFAF8]"
                      : "text-[#7A7A72] hover:bg-[#FAFAF8]"
                  }`}
                  data-testid={`button-step-${stepNum}`}
                  data-step-key={key}
                >
                  <span
                    className={`flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-[11px] font-semibold border ${
                      isActive
                        ? "bg-[#35605A] text-white border-[#35605A]"
                        : isDone
                        ? "bg-[#1A1A18] text-white border-[#1A1A18]"
                        : "bg-white text-[#7A7A72] border-[#E8E8E2]"
                    }`}
                  >
                    {isDone ? "✓" : stepNum}
                  </span>
                  <span className="min-w-0">{title}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {/* The mock's step-count line: say WHY this listing has these steps, so a shortened flow
            reads as a deliberate branch rather than as missing questions (§13). */}
        <p className="text-xs text-muted-foreground mt-3 pt-2.5 border-t border-[#E8E8E2] px-1.5" data-testid="text-step-count">
          <strong>{TOTAL_STEPS} steps</strong> for &ldquo;{deliveryMethodLabel(formData.deliveryMethod)}&rdquo;.{" "}
          {flow.includes("logistics")
            ? "Scheduling, Capacity and Logistics are here because this one happens somewhere."
            : "No location, transport or travel-surcharge questions in this flow — the Logistics step never appears."}
        </p>
      </nav>
      <p className="mt-3 rounded-md border border-dashed border-[#E8E8E2] bg-[#FAFAF8] px-3 py-2.5 text-xs text-[#7A7A72] leading-relaxed">
        The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard.
      </p>
      </aside>

      <div className="min-w-0 space-y-6">

      {/* ── D-16 (ledger 119): the step's own header — its long title, the mock's
          "Draft · autosaved" chip (create mode, once a checkpoint exists), and "Step X of Y". ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="step-header">
        <h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">
          <span className="truncate" data-testid="text-step-long-title">{STEP_LONG_TITLES[stepKey]}</span>
          {!isEditMode && autosavedAt && (
            <Badge variant="outline" className="text-[11px] font-normal shrink-0" data-testid="badge-draft-autosaved">
              Draft · autosaved
            </Badge>
          )}
        </h2>
        <span className="text-sm text-muted-foreground shrink-0" data-testid="text-step-position">
          Step {effectiveStep} of {TOTAL_STEPS}
        </span>
      </div>

      {/* ── FP-2 / A1 UPFRONT REVIEW NOTICE (Package A item 1; service-creation mock, fix A1) ────
          The final action was labelled "Publish Service" while EVERY create is clamped
          server-side to a non-approved born state (F2 / migration 111 — `approval_status`
          DEFAULTs 'submitted'). The button is now "Submit for review", and this is the other
          half of the same honesty: the expert branch already got a review card, but only on
          step 4, and the provider branch found out only on the success screen AFTER clicking.
          Same notice, up front, for BOTH roles, on every step.

          NO SLA NUMBER, deliberately: the execution map's Gate G5 #7 has "review SLA — is
          '2 business days' real?" OPEN with the disposition "measure first, then commit or
          drop the number", so stating one here would be exactly the §13 claim that gate
          exists to prevent. The mock's A1 copy is adopted without its "usually within 2
          business days" clause until #7 is answered. This is COPY ONLY — no gate, no
          lifecycle change; the write path is untouched. ── */}
      {!isEditMode && (
        <div
          className="flex items-start gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-900"
          data-testid="notice-review-before-live"
        >
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            <strong>New listings are reviewed before they go live.</strong> When you finish, this
            goes to our team for review — you'll be notified when it's been looked at. Your work
            autosaves as you go, so you can leave and come back any time.
          </p>
        </div>
      )}

      {/* Ruling 112 Q4 — the autosave contract, stated and kept. The restore banner appears
          only when a previous visit's checkpoint was actually loaded; the quiet status line
          confirms each checkpoint so "did that save?" never needs asking. */}
      {!isEditMode && autosaveRestoredAt && (
        <div
          className="flex items-start gap-3 p-3 rounded-lg border text-sm"
          style={{ background: "var(--console-ground)", borderColor: "var(--console-line)", color: "var(--console-darkest)" }}
          data-testid="banner-autosave-restored"
        >
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--console-brand)" }} />
          <p className="flex-1">
            <strong>Picked up where you left off.</strong> This draft was autosaved{" "}
            {new Date(autosaveRestoredAt).toLocaleString()} — closing the tab keeps everything.
          </p>
          <button
            type="button"
            onClick={discardAutosave}
            className="text-xs underline underline-offset-2 shrink-0"
            data-testid="button-discard-autosave"
          >
            Start fresh
          </button>
        </div>
      )}
      {!isEditMode && !autosaveRestoredAt && autosavedAt && (
        <p className="text-xs text-muted-foreground -mt-2" data-testid="text-autosave-status">
          Draft · autosaved — closing this tab keeps everything.
        </p>
      )}

      {/* Ruling 114: the provider verification banners live in THIS stack — visible on every
          step (the ruling-53 posture), never wedged between form fields. Copy unchanged. */}
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

      {onStep("basics") && (<>

      {/* ── Offering-first provider create (§17): pick the /earn offering FIRST — ────
          category derives from it below. Shown for both create and edit so an edited
          legacy row's (unset) linkage is visible, but only REQUIRED on a new create
          (enforced in createMutation + the Publish button, not here). ── */}
      {role === "provider" && (() => {
        // Mock fidelity (Aug 17): the mock draws the offering as a COMPACT field paired with
        // "Name it" in the Basics top row, with the full searchable catalog opening on demand —
        // not as a full-page card that dominates the fresh-create screen. Ruling 114's intent
        // ("one card; the offering is primary; one place to change it") is preserved: the offering
        // still sets the category and still has a single Change path — only its PRESENTATION moves
        // from a card header to the mock's paired dropdown-style field. The full picker below is
        // now strictly on-demand (opened from that field), never the default surface.
        const expanded = offeringPickerOpen;
        if (!expanded) return null;
        return (
        <Card data-testid="provider-offering-picker">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle>What are you offering? *</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOfferingPickerOpen(false);
                setOfferingSearchQuery("");
              }}
              data-testid="button-close-offering-picker"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {providerOfferingTypesRaw.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading offerings…</p>
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

      {/* ── Basics — ONE card (ruling 114). Mock fidelity (Aug 17): the offering is a COMPACT
          field paired with "Name it" in a two-column top row, not a card-header identity — the
          mock's own layout. Selection logic, category derivation and the single Change path are
          unchanged; only the presentation moved. ── */}
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? "Edit service" : "Create new service"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ── Mock row1 — What are you offering? | Name it ─────────────────────────────────── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start space-y-6 lg:space-y-0">
            {/* Offering — compact, provider-only (experts pick a Service Tier below instead). */}
            {role === "provider" ? (
              <div>
                <Label>What are you offering? *</Label>
                {formData.serviceOfferingTypeId && selectedProviderOffering ? (
                  <div
                    className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-secondary/40 px-3 py-2.5"
                    data-testid="offering-identity-header"
                  >
                    <span className="text-sm font-medium truncate">{selectedProviderOffering.display_name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setRequestOfferingConfirmedName(null);
                        setOfferingPickerOpen(true);
                      }}
                      data-testid="button-reopen-offering-picker"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 w-full justify-start font-normal text-muted-foreground"
                    onClick={() => setOfferingPickerOpen(true)}
                    data-testid="button-choose-offering"
                  >
                    Choose an offering — driver, guide, chef…
                  </Button>
                )}
                {/* Category shown as help beneath, exactly as the mock draws it — resolved from
                    the offering, never asked twice. The unresolved case still gets its honest
                    failure banner (rendered below, in the Category block). */}
                {formData.serviceOfferingTypeId && !offeringCategoryUnresolved ? (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-offering-category-help">
                    Category: {selectedCategory?.name ?? "—"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Sets your category and links this listing to the /earn catalog. Required before
                    publishing; you can save a draft without one and finish later.
                  </p>
                )}
                {requestOfferingConfirmedName && selectedProviderOffering?.offering_type_key === "custom_other_offering" && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-request-offering-confirmed">
                    Requested: {requestOfferingConfirmedName} — meanwhile your listing continues under Custom / Other
                  </p>
                )}
              </div>
            ) : (
              <div className="hidden lg:block" aria-hidden="true" />
            )}

            {/* Name it — the mock's short imperative label + one line of help. */}
            <div>
              <Label htmlFor="name">Name it *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={role === "expert" ? "e.g., Custom Itinerary Planning, Cultural Immersion Tour" : "e.g., Private City Walking Tour, Airport Transfer"}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Travelers see this first.</p>
            </div>
          </div>

          {/* Ruling 115: the DECLARED source language of the listing's own content — asked,
              never guessed from the text (§13). Drives which locales are translation targets
              (Languages card on Listing Home) and the traveler-facing "shown in <language>"
              fallback label. */}
          <div>
            <Label htmlFor="source-locale">I'm writing this in</Label>
            <Select
              value={formData.sourceLocale}
              onValueChange={(v) => set("sourceLocale", v as "en" | "ja")}
            >
              <SelectTrigger id="source-locale" className="mt-2 w-56" data-testid="select-source-locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en" data-testid="option-source-locale-en">English</SelectItem>
                <SelectItem value="ja" data-testid="option-source-locale-ja">日本語 (Japanese)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Write in your own language — travelers can switch languages, and you can add or
              AI-draft a translation from the listing's Languages card after saving.
            </p>
          </div>

          {/* Category — single canonical taxonomy. Mock fidelity (Aug 17): a PROVIDER's category
              is shown only as help beneath the offering field above (never a manual select), so
              this whole block is hidden for providers EXCEPT the unresolved-offering failure case
              (FP-1/A1's honest banner). A provider with no offering yet sees nothing here — they
              pick an offering first and the category derives. Non-provider paths keep the Select. */}
          {role === "provider" && !offeringCategoryUnresolved ? null : (
          <div>
            <Label htmlFor="category">Category *</Label>
            {role === "provider" && formData.serviceOfferingTypeId ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-secondary/40 px-3 py-2">
                <span className="text-sm font-medium" data-testid="text-derived-category">
                  {selectedCategory?.name ?? (offeringCategoryUnresolved ? "Not resolvable" : "—")}
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
            {role === "provider" && formData.serviceOfferingTypeId && !offeringCategoryUnresolved && (
              <p className="text-xs text-muted-foreground mt-1">Derived from your selected /earn offering above.</p>
            )}
            {/* FP-1 / A1: the honest failure. Names the offering, says exactly what is missing and
                who can fix it, and offers the one action that unblocks the provider right now —
                instead of a silent "—" plus a Publish button that never enables. */}
            {offeringCategoryUnresolved && (
              <div
                className="mt-2 flex items-start gap-3 p-3 rounded-lg border text-sm bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-200"
                data-testid="banner-offering-category-unresolved"
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-medium">
                    We can't resolve a category for “{selectedProviderOffering?.display_name}”
                  </p>
                  <p className="text-xs mt-0.5 opacity-80">
                    This offering points at a category this platform doesn't currently have, so we
                    can't file your listing under one — and a listing without a category can't be
                    published. This is our problem to fix, not yours: please contact support with
                    this listing's name. In the meantime your work is safe{isEditMode ? " — Save Draft keeps it" : " (drafts autosave)"},
                    or use <strong>Change offering</strong> to pick a different one and publish
                    today.
                  </p>
                </div>
              </div>
            )}
            {selectedCategory?.description && (
              <p className="text-xs text-muted-foreground mt-1">{selectedCategory.description}</p>
            )}
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

          {/* ── METHOD-FIRST (Wave 2 / A1, S1) ────────────────────────────────────────────────
              THE question, asked SECOND — right after what you are offering and what it is
              called, and before anything that depends on it. It used to sit halfway down step 2,
              under "Details & Delivery", which meant a provider answered a screenful of
              questions that the answer here would have removed. The step list above is built
              from this answer, so changing it changes the flow immediately.

              NEVER-CLOBBER (FP-1 / B5): switching the method only changes which steps and
              sections RENDER. Nothing in `formData` is reset here, and the payload already omits
              the keys a method does not apply to — so an in-person draft switched to PDF and back
              still has its start window, party size and pin exactly as they were. ── */}
          {/* Delivery Method */}
          {(() => {
            const selectedTier = expertOfferingTypes.find((t) => t.id === formData.expertOfferingTypeId);
            const allowed = selectedTier && selectedTier.deliveryFormats.length > 0
              ? tierFormatsToAllowedMethods(selectedTier.deliveryFormats)
              : null;
            // T3-2: every canonical delivery value gets its own faithful UI option so
            // editing an existing service always reopens showing the value actually
            // stored (see fromCanonicalDelivery) instead of collapsing onto "In-Person".
            // MOCK CONFORMANCE (decision-maker, Aug 17 — "the mock lays out the ratified
            // Service Creation flow"): the method question renders as the mock's TILE GRID
            // (name + meta, aria-pressed), not a dropdown — same state write, same tier
            // filter, same never-clobber; only the chrome changed.
            const allMethods: { value: UiDelivery; label: string; meta: string }[] = [
              { value: "in-person", label: "In person", meta: "Place-anchored" },
              { value: "video-call", label: "Video call", meta: "Live, remote" },
              { value: "call", label: "Phone call", meta: "Live, remote" },
              { value: "pdf", label: "PDF guide", meta: "Artifact" },
              { value: "voice_notes", label: "Voice notes", meta: "Async lane" },
              { value: "async_messaging", label: "Async messaging", meta: "Async lane" },
              { value: "hybrid", label: "Hybrid", meta: "In person + video" },
            ];
            let visibleMethods = allowed
              ? allMethods.filter((m) => allowed.has(m.value))
              : allMethods;
            // A tier's deliveryFormats filter (above) is a NEW-selection guardrail, not an
            // editor for an existing row — an already-stored value must always stay visible
            // and selected, or the grid silently falls off it and a no-change save
            // would corrupt the stored delivery_method (the exact T3-2 bug, one layer up).
            if (allowed && !visibleMethods.some((m) => m.value === formData.deliveryMethod)) {
              const current = allMethods.find((m) => m.value === formData.deliveryMethod);
              if (current) visibleMethods = [...visibleMethods, current];
            }
            return (
              <div>
                <Label>How do you deliver this? *</Label>
                <div
                  className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2"
                  role="radiogroup"
                  aria-label="Delivery method"
                  data-testid="grid-delivery-method"
                >
                  {visibleMethods.map((m) => {
                    const pressed = formData.deliveryMethod === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => set("deliveryMethod", m.value)}
                        className={
                          "rounded-md border px-3 py-2.5 text-left transition-colors " +
                          (pressed
                            ? "border-[#35605A] bg-[#EDF2F1] shadow-[inset_0_0_0_1px_#35605A]"
                            : "border-[#E8E8E2] bg-white hover:border-[#7A7A72]")
                        }
                        data-testid={`method-tile-${m.value}`}
                      >
                        <span className="block text-[13px] font-semibold text-[#1A1A18]">{m.label}</span>
                        <span className={"block text-[11.5px] leading-snug " + (pressed ? "text-[#35605A]" : "text-[#7A7A72]")}>
                          {m.meta}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  The rest of the form is built from this answer — the step list updates the moment you change it.
                </p>
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

          {/* ── Mock row2 — Price (one row: $ input + unit select) | "One line about it", a
              two-column pair on large screens. The unit select IS the pricing model (same
              state, same testid, same six values — only the option labels now read as units,
              the way the mock draws them). Branch-specific builders (package tiers, per-event
              guest range) keep rendering below the row inside the price column. ── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start space-y-6 lg:space-y-0">
          <div className="space-y-4">
            <div>
              <Label htmlFor={formData.priceType === "Package tiers" ? "priceType" : "basePrice"}>
                {formData.priceType === "Package tiers"
                  ? "Price (from your tiers) *"
                  : formData.priceType === "Range"
                  ? "Starting price ($) *"
                  : "Price ($) *"}
              </Label>
              <div className="mt-2 flex gap-2">
                {formData.priceType !== "Package tiers" && (
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      id="basePrice"
                      type="number"
                      min="0"
                      value={formData.basePrice || ""}
                      onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="pl-7"
                      data-testid={
                        formData.priceType === "Hourly"
                          ? "input-hourly-rate"
                          : formData.priceType === "Per-event"
                          ? "input-event-rate"
                          : "input-base-price"
                      }
                    />
                  </div>
                )}
                <Select
                  value={formData.priceType}
                  onValueChange={(v: any) => set("priceType", v)}
                >
                  <SelectTrigger
                    id="priceType"
                    className={formData.priceType === "Package tiers" ? "flex-1" : "w-44 shrink-0"}
                    data-testid="select-price-type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">flat price</SelectItem>
                    <SelectItem value="Range">starting at</SelectItem>
                    <SelectItem value="Per-person">per person</SelectItem>
                    <SelectItem value="Hourly">per hour</SelectItem>
                    <SelectItem value="Package tiers">package tiers</SelectItem>
                    <SelectItem value="Per-event">per event (flat fee)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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

            {/* Per-event — the flat rate lives in the shared price row above; the optional
                guest range stays here. */}
            {formData.priceType === "Per-event" && (
              <div className="space-y-3">
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

            {/* Mock ④ — money in one place: creation asks one price; the tune-later drawer
                owns the rest. Stated here, where the provider would otherwise go looking. */}
            <p className="text-xs text-muted-foreground">
              One price is enough here. Surcharges, deposits and cancellation live in{" "}
              <b className="text-foreground">Pricing &amp; fees</b> after you save — none of them
              are required to go live.
            </p>
          </div>

          {/* ── The fifth and last field of the fast path. Moved up from the old step 2 so that
              Basics alone is a complete, resumable draft (mock ②). ── */}
          {/* Description — FP-2 / item 4: the asterisk is GONE, not made to bind. Nothing
              requires a description: `provider_services.description` is nullable, the insert
              schema does not demand it and no publish gate checks it. It IS scored by the owner
              health rail, which is what "recommended" means here. */}
          <div>
            <Label htmlFor="description">One line about it <span className="text-muted-foreground font-normal">(recommended)</span></Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe what your service includes, what makes it special, and what travelers can expect..."
              rows={4}
              className="mt-2"
            />
            {/* Mock's live counter — an honest count naming the checklist's real ask: the 140+
                row (`description140`, service-form-required.ts) now exists and reads this same
                field, so the sentence is true, not aspirational. Same constant, never a second
                literal. */}
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-description-count">
              {formData.description.length} characters — the draft checklist asks for{" "}
              {DESCRIPTION_CHECKLIST_MIN}+ before review, and reads it from this field.
            </p>
          </div>
          </div>{/* /mock row2 pair */}

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

          {/* ── THE BASICS FAST PATH, STATED (mock ②) ────────────────────────────────────────
              Nothing below this screen is required to keep your work: Save Draft is reachable
              from every step and checks nothing (see client/src/lib/service-form-required.ts —
              the required set is consulted by the FINAL action only). Saying so here is the
              difference between a five-field draft and a provider who believes the whole form
              has to be finished in one sitting. ── */}
          <p className="text-sm text-muted-foreground border-t pt-4" data-testid="text-basics-fast-path">
            <strong>This screen is enough.</strong> Name it, say how you deliver it, put a price on
            it — your draft autosaves as you go, so you can leave and come back. The remaining
            steps are built from the delivery method you picked, and none of them are needed to
            keep a draft.
          </p>

        </CardContent>
      </Card>

      </>)}

      {/* ── A1: THE BRANCH'S SECOND STEP ────────────────────────────────────────────────────
          One card, titled by the step the branch is on: "Scheduling" (in-person/hybrid),
          "Session details" (call/video), "What they get" (pdf), "Async delivery details"
          (voice notes / async messaging). The duration question is the same question in all
          four — how long it runs, or how long it takes to arrive — so it is asked once, here,
          and `stepForSection` puts it on whichever of those steps this listing has. ── */}
      {onSection("duration") && (
      <Card data-testid="card-details-step">
        <CardHeader>
          <CardTitle>{STEP_LONG_TITLES[stepKey]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Duration — FP-2: the ONE duration question (Package A item 8). Its asterisk is gone
              for the same reason as Description's: nothing requires it. It writes
              `deliveryTimeframe`, which is the duration/turnaround string every reader uses —
              the traveler detail page, Discover, the storefront and Catalog cards, the admin
              queue, and `envelopeFromProviderService`, which parses minutes out of this very
              text. The second, structured "Duration (minutes)" question that used to sit in the
              Service-logistics card is removed (nothing read that column). */}
          <div>
            <Label htmlFor="duration">How long does it take? <span className="text-muted-foreground font-normal">(recommended)</span></Label>
            <Input
              id="duration"
              value={formData.duration}
              onChange={(e) => set("duration", e.target.value)}
              placeholder={role === "expert" ? "e.g., 2 hours, 3 days, 1 week" : "e.g., 30 minutes, 2 hours, same-day"}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Asked once — travelers see this exactly as you write it.
            </p>
          </div>

          {/* S9 (docs/DECISIONS.md ledger row 102, migration 212): the async lane's promised
              response time + scope statement. Async listings have no slot to book and no session
              to attend, so this branch asks about the PROMISE instead — what these two fields
              feed is the completion machinery's EXISTING 'provider_declared' rule
              (shared/service-fundamentals.ts PROVIDER_DECLARED_METHODS/completionRuleFor,
              server/services/booking-completion.service.ts): descriptive copy about the same
              SLA/disputable window that rule already enforces, not a second completion path. */}
          {isAsyncListing && (
            <div className="space-y-4 pt-2" data-testid="section-async-fields">
              <div>
                <Label htmlFor="responseWindowHours">Response window (hours)</Label>
                <Input
                  id="responseWindowHours" type="number" min={1} placeholder="e.g. 24"
                  value={formData.responseWindowHours}
                  onChange={(e) => set("responseWindowHours", e.target.value)}
                  className="mt-1" data-testid="input-response-window-hours"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How long a traveler waits for your first reply. Shown to travelers before they book.
                </p>
              </div>
              <div>
                <Label htmlFor="scopeStatement">Scope statement</Label>
                <Textarea
                  id="scopeStatement" rows={3}
                  placeholder="What's included in a reply, and what isn't — the promise a traveler can hold you to."
                  value={formData.scopeStatement}
                  onChange={(e) => set("scopeStatement", e.target.value)}
                  className="mt-1" data-testid="input-scope-statement"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is the SLA a completed booking is measured against, not marketing copy — keep it factual.
                </p>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
      )}

      {/* ── The deliverable — the pdf branch's own step ("What they get"). ── */}
      {onSection("deliverable") && formData.deliveryMethod === "pdf" && (
      <Card data-testid="card-deliverable">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            The file they receive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

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
            // FP-1 / B7: "managed" is either a stored objstore: value hydrated from the owner read,
            // or an upload made in this session (whose key the client is deliberately never told).
            const isManaged =
              formData.serviceFile.trim().startsWith("objstore:") ||
              (deliverableUploaded && !formData.serviceFile.trim());
            return (
              <div>
                {/* ── FP-1 / B7 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ─────────────────
                    The protected-upload rail (ruling 58 / R4) had existed since it landed with
                    ZERO client callers — it appeared in this file only inside the comment above,
                    so every provider-authored PDF was necessarily a pasted, unrevokable link.
                    This is that rail's first caller.

                    SHAPE, STATED (the smallest honest one): the endpoint is
                    POST /api/provider/services/:id/deliverable-file and therefore needs a row to
                    hang the file on. In CREATE mode there is no id yet, so the control says so
                    plainly and points at Save Draft — rather than inventing a draft behind the
                    provider's back, or pretending an upload happened. In EDIT mode it uploads the
                    raw bytes (Content-Type: application/pdf, the shape express.raw() expects) and
                    the server validates the %PDF- magic bytes; on success the STORED value becomes
                    `objstore:<key>` and the honest "platform-protected" copy below flips. The
                    pasted-URL fallback is untouched and keeps its `protected: false` labeling. */}
                {isEditMode ? (
                  <div className="mb-3">
                    <Label htmlFor="deliverableUpload">Upload the PDF (platform-protected)</Label>
                    <input
                      id="deliverableUpload"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                      disabled={deliverableUploading}
                      data-testid="input-deliverable-upload"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = ""; // allow re-picking the same file after a failure
                        if (file) uploadDeliverable(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {deliverableUploading
                        ? "Uploading…"
                        : "PDF only, up to 20MB. We store it privately and stream it to buyers — you can replace it any time, and we can revoke access."}
                    </p>
                  </div>
                ) : (
                  <p
                    className="text-xs text-muted-foreground mb-3"
                    data-testid="text-deliverable-upload-after-save"
                  >
                    A protected upload attaches once this listing first saves — finish and submit
                    it, then reopen it to upload the PDF. Or paste a link below now.
                  </p>
                )}
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
      )}

      {/* ── The hybrid branch's extra step (mock: "The online half"). ─────────────────────────
          Hybrid is the only method that gets both halves. The fields this step is ratified to
          collect — where the online half happens, how long it runs, the provider's own join link
          — have NO column on `provider_services` today, and this lane adds no schema (Wave 3 /
          lane S9, Gate G3, owns them). So the step is here, in the shape the mock ratified, and
          it says exactly what it does and does not yet ask (§13) rather than showing controls
          that write nowhere. ── */}
      {onStep("online") && (
      <Card data-testid="card-online-half">
        <CardHeader>
          <CardTitle>{STEP_LONG_TITLES.online}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You picked <strong>Hybrid</strong>, so this listing has an in-person half — the
            Scheduling, Capacity and Logistics steps you just filled in — and an online half.
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-online-half-pending">
            The online half's own questions (where the call happens, how long it runs, and your
            own meeting link — shared with the traveler only after booking) are ratified but not
            built yet. Until they are, describe the online half in your description on{" "}
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => goToStepKey("basics")}
              data-testid="button-online-to-basics"
            >
              Basics
            </button>{" "}
            and in <strong>What&apos;s included</strong> on the last step. We would rather say
            that than show you a field that saves nothing.
          </p>
        </CardContent>
      </Card>
      )}


      {/* ── Category-Specific Dynamic Fields ──
          A1: branch-independent content, so it sits on the last step with the rest of it. The
          asterisks here still bind (FP-2), and "Still needed" links to the step this resolves to,
          whichever branch the listing is on. */}
      {onSection("categoryFields") && categoryFields.length > 0 && (
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

      {/* ── What's Included ── A1: branch-independent, so it lives on the last step. */}
      {onSection("whatIncluded") && (
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
      )}

      {/* ── STEP 4 "LOGISTICS" — WHERE IT HAPPENS (Wave 2 / A1, S3; ruling of Aug 12, 2026) ─────
          Everything spatial, on ONE step: the free-text meeting point, the confirm-gated pin, the
          map canvas with its ordered route stops, the service radius, "Getting there"
          (transport/pickup/drop-off — FP-2 merged those into one block and the block moved here
          whole), and the travel-surcharge zones. Place-anchored and hybrid only; a remote listing
          never sees this step at all (not disabled, absent — see the step-count line).

          NO NEW WRITE RAILS. The pin is the same `LocationPointPicker` writing through the same
          form save (`extractServiceLocation` on POST/PATCH /api/provider/services stays the ONE
          pin writer, L27-P3); the stops are the same owner-gated replace-list
          PUT /api/provider/services/:id/route-points (ruling 22a). What changed is WHERE the
          authoring lives — Catalog's map is a traveler preview from this lane on. ── */}
      {onSection("place") && needsMeetingPoint && (
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

            {/* ── Gap #13 (ledger 2026-08-16-bring-access) ──────────────────────────────────
                The ratified mock drew these two rows in the traveler read-out and NEITHER had a
                field, so the flow never asked and nothing could render them. They live on
                Logistics because both are about attending in person — which is also why they
                never appear on the pdf/async branches: that step does not exist there, and a
                downloadable guide has nothing to bring. Both optional; blank is sent as NULL and
                omitted from every traveler surface rather than becoming a claim (§13). */}
            <div>
              <Label htmlFor="whatToBring">What should travelers bring?</Label>
              <Textarea
                id="whatToBring"
                value={formData.whatToBring}
                onChange={(e) => set("whatToBring", e.target.value)}
                placeholder="e.g. Socks without holes — you will be on tatami"
                rows={2}
                className="mt-2"
                data-testid="input-what-to-bring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional. Leave blank and travelers are told nothing — we never invent a
                &ldquo;nothing needed&rdquo; on your behalf.
              </p>
            </div>

            <div>
              <Label htmlFor="accessNotes">Access notes</Label>
              <Textarea
                id="accessNotes"
                value={formData.accessNotes}
                onChange={(e) => set("accessNotes", e.target.value)}
                placeholder="e.g. One step at the entrance, low seating. A low stool can be provided — say so when you book."
                rows={2}
                className="mt-2"
                data-testid="input-access-notes"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional, and shown to travelers in your own words. We do not claim an
                accessibility standard on your behalf &mdash; describe the space honestly.
              </p>
            </div>

            {/* L27-P3: place/confirm the precise point behind the free-text meeting point.
                Additive — the text above stays the required field and is unchanged; a pin
                is optional, and the picker renders nothing at all when no Maps key is
                configured (the form then behaves exactly as it did before). */}
            {/* Ruling 85: a NEW listing whose pin was seeded from the provider's saved office
                location says so, honestly — the coords are provider-confirmed but this service may
                be offered elsewhere, so the provider is nudged to adjust/remove. */}
            {officePinPrefilled && (
              <p
                className="text-xs flex items-start gap-1.5 rounded-md p-2"
                style={{ color: "var(--console-mid)", background: "var(--console-ground)", border: "1px solid var(--console-line)" }}
                data-testid="office-prefill-note"
              >
                <MapPin className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--console-brand)" }} />
                Pre-filled from your office location — adjust if this service is offered elsewhere.
              </p>
            )}
            <LocationPointPicker
              value={formData.locationPoint}
              precision={formData.locationPrecision}
              addressHint={formData.meetingPoint}
              onChange={(point) => {
                setLocationPointTouched(true);
                setOfficePinPrefilled(false);
                set("locationPoint", point);
              }}
              label="Pin this location on the map (optional)"
              helpText="Confirming a pin shows travelers exactly where to meet and lets this listing appear on planning maps. Without one, only your typed meeting point is shown."
              idPrefix="service-location"
            />

            {/* FP-2 / Package A item 8 (transport): the "Do you provide transport during this
                service?" disclosure MOVED from here into the Service-logistics card's "Getting
                there" block, so both transport questions are asked once, together, in one
                vocabulary. It used to sit here while "Transport provision" sat in another card
                further down the same step — two controls that read as the same question and
                could be answered inconsistently. Nothing about the field or its column changed;
                only where it is asked. */}

            {/* Ruling 112 Q1 — one place question, one vocabulary. The global all-cities
                checkbox wall (Run-2 R12) and the free-text Service Area input are retired:
                the wall pretended to be a multi-select over a scalar column (R7), and the
                free text is what left `location` reading 'Unknown'. One searchable pick;
                it drives the market-page city (server-derived, utils/service-city.ts) and
                the display location. */}
            <div>
              <Label>Neighborhood (where this happens)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Pick the one neighborhood travelers should file this under — it places the
                listing on its city's market page. Search by neighborhood or city.
              </p>
              {allNeighborhoods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No neighborhoods available.</p>
              ) : (
                <>
                  {formData.neighborhood && (() => {
                    const sel = allNeighborhoods.find((n) => n.slug === formData.neighborhood);
                    return (
                      <div className="flex items-center gap-2 mb-2" data-testid="chip-selected-neighborhood">
                        <Badge variant="secondary" className="rounded-full px-3">
                          {sel ? `${sel.name} · ${sel.city}` : formData.neighborhood}
                        </Badge>
                        <button
                          type="button"
                          className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                          onClick={() => set("neighborhood", "")}
                          data-testid="button-clear-neighborhood"
                        >
                          Clear
                        </button>
                      </div>
                    );
                  })()}
                  <Input
                    value={neighborhoodQuery}
                    onChange={(e) => setNeighborhoodQuery(e.target.value)}
                    placeholder="Search neighborhoods or cities…"
                    className="mb-2"
                    data-testid="input-neighborhood-search"
                  />
                  <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                    {(() => {
                      const q = neighborhoodQuery.trim().toLowerCase();
                      const filtered = q
                        ? allNeighborhoods.filter(
                            (n) =>
                              n.name.toLowerCase().includes(q) ||
                              n.city.toLowerCase().includes(q) ||
                              n.country.toLowerCase().includes(q),
                          )
                        : allNeighborhoods;
                      if (filtered.length === 0) {
                        return (
                          <p className="text-xs text-muted-foreground px-1 py-2" data-testid="text-no-neighborhood-match">
                            Nothing matches "{neighborhoodQuery}".
                          </p>
                        );
                      }
                      return Object.entries(
                        filtered.reduce<Record<string, typeof allNeighborhoods>>((acc, n) => {
                          const key = `${n.city}, ${n.country}`;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(n);
                          return acc;
                        }, {}),
                      ).map(([cityLabel, items]) => (
                        <div key={cityLabel}>
                          <p className="text-xs font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wide">
                            {cityLabel}
                          </p>
                          {items.map((n) => {
                            const selected = formData.neighborhood === n.slug;
                            return (
                              <button
                                key={n.slug}
                                type="button"
                                onClick={() => set("neighborhood", selected ? "" : n.slug)}
                                className={`flex w-full items-center gap-2 px-2 py-1 rounded text-left text-sm hover:bg-accent ${selected ? "bg-accent font-medium" : ""}`}
                                data-testid={`option-neighborhood-${n.slug}`}
                                aria-pressed={selected}
                              >
                                <span className="flex-1">{n.name}</span>
                                {selected && (
                                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">selected</Badge>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── A1 / S3: THE MAP, INSIDE THE FLOW ────────────────────────────────────────────────
          The canvas the pin above draws on, plus this listing's ordered route stops. The stop
          editor needs a saved row to hang its replace-list PUT on, so in CREATE mode it says so
          and points at Save Draft — the same honest shape the protected deliverable upload uses,
          rather than inventing a row behind the provider's back. ── */}
      {onSection("map") && needsMeetingPoint && (
        <ServiceMapAuthoring
          serviceId={isEditMode ? (id ?? null) : null}
          pin={formData.locationPoint}
          pinLabel={formData.meetingPoint || formData.name || null}
          radiusKm={formData.serviceRadius > 0 ? formData.serviceRadius : null}
          surchargeZones={((surchargeTierState as any)?.surchargeTiers ?? []).map(
            (t: { radiusKm: string; fee: string }) => ({ radiusKm: Number(t.radiusKm), fee: t.fee }),
          )}
          addressHint={formData.meetingPoint || ""}
          savedStops={(existingService?.routePoints as any) ?? []}
          // D-11 (ledger 119): the canvas's ARMED pin mode proposes a candidate; its explicit
          // confirm lands here — the SAME field the LocationPointPicker's confirm writes, saved
          // by the same form save (extractServiceLocation stays the one pin writer, L27-P3/22b).
          onPinConfirm={(point) => {
            setLocationPointTouched(true);
            setOfficePinPrefilled(false);
            set("locationPoint", point);
          }}
        />
      )}

      {/* ── "Getting there" — the transport / pickup / surcharge block (FP-2 merged the two
          transport questions into one; this lane moves the merged block onto the Logistics step
          where the rest of the spatial questions now live). Place-anchored only: there is
          nothing to get to, and no distance to charge for, on a call or a video session. ── */}
      {onSection("transport") && showLogisticsCapture && (
        <Card data-testid="card-getting-there">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Getting there
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ── D-9 (RATIFIED, ledger row 119): ONE transport question. The mock's whole thesis
                for this step: "one transport question, one vocabulary, one step" — and this block
                had re-expanded to six. Collapsed back to the toggle, with the SPATIAL detail
                (pickup point, drop-off, coverage) revealed under it only when it's ON.

                WHAT THE TOGGLE WRITES: `pickupAvailable` — and nothing else. The two ruling-62
                columns this block used to ask for out loud (`transport_provision` "how does the
                traveler reach the start", `transport_provided` "once you've met, do you drive
                them") are NO LONGER ASKED (the mock's gap-#13 "stop asking for it" rule, ratified
                here) but are NOT derived from the toggle either — ruling 62 forbids collapsing
                the two questions into each other, and §13 forbids inventing the half that is not
                entailed. Both columns stay in form state, hydrate from the row, and round-trip
                UNCHANGED on every save, so no stored answer is lost and every traveler surface
                that reads `transport_provided` keeps rendering exactly what the provider once
                said. A control comes back with its consumer, never before it. ── */}
            <div className="space-y-4" data-testid="logistics-section-transport">
              <div className="flex items-center justify-between">
                <Label htmlFor="pickupAvailable" className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  I collect travelers and drop them back
                </Label>
                <Switch
                  id="pickupAvailable"
                  checked={formData.pickupAvailable}
                  onCheckedChange={(checked) => set("pickupAvailable", checked)}
                  data-testid="switch-collect-travelers"
                />
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Off by default. Pickup is a <strong>spatial</strong> question, so it lives on this
                step. How long the transfer takes is temporal — that stays in Scheduling. One
                transport question, one vocabulary, one step.
              </p>

              {formData.pickupAvailable && (
                <div className="rounded-md border p-3 space-y-4" data-testid="block-pickup-detail">
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
                </div>
              )}
            </div>

            {/* ── D-9 (cont.): the coverage choice is the toggle's SPATIAL sub-detail, not a
                separate question. Gated on the toggle OR a stored pickup provision (a legacy row
                whose provision said "pickup" still sees its coverage — never-clobber, §13). ── */}
            {(formData.pickupAvailable || pickupProvisionChosen) && (
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
                    {/* ── D-9: the ONE radius input, asked WHERE the radius is chosen. It writes
                        `serviceRadius` — the number every consumer reads (the traveler ring in
                        service-detail.tsx, the Catalog map ring, the flat-surcharge containment
                        test). FP-2's history stands: `pickupRadiusKm` stays unasked and
                        round-trips untouched (migration 199 split, nothing reads it). ── */}
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
                    <p className="text-xs text-muted-foreground mt-1" data-testid="text-coverage-radius-source">
                      This is the ring travelers see around your meeting pin.
                    </p>
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
                        ? `${savedRouteStopCount} route ${savedRouteStopCount === 1 ? "stop" : "stops"} saved. Edit them on the map on this step.`
                        : "No route stops saved yet — add them on the map on this step."}
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

            {/* ── WAVE 2 / S4 (ledger row 99): the travel-surcharge MODE + AMOUNTS moved off this
                step into the post-creation "Pricing & fees" drawer (listing home) — moved, not
                duplicated. `formData.surchargeMode`/`surchargeFlatAmount`/`surchargePerKm`/
                `surchargeMaxKm`/`surchargeTiers` stay in this form's state and payload purely for
                never-clobber round-trip fidelity (hydrated, sent unedited on every save); no
                control here writes them any more. `serviceRadius` above is untouched — it is
                coverage/location geometry, not a surcharge amount, and stays authored here. */}
            {(formData.pickupAvailable || pickupProvisionChosen) && (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3" data-testid="note-surcharge-moved">
                Travel surcharges are set in <b>Pricing &amp; fees</b>, on this listing's home page —
                available once this listing first saves. Not required to go live.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SCHEDULING — timing + booking rules (the step formerly called "Logistics"). ─────────
          FP-1 / B5: gated on the SHARED scheduled predicate, so a live call/video session keeps
          every one of these — it is scheduled too. ── */}
      {onSection("timing") && showScheduledLogistics && (
        <Card data-testid="card-service-logistics">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {stepKey === "session" ? "When you are reachable" : "Timing & booking rules"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-xs text-muted-foreground">
              These answers are used: the start window is checked when a traveler tries to book.
              Leave anything you're unsure of blank — blank means "not stated", never a guessed
              default.
            </p>

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
              {/* ── FP-2 / Package A items 3 + 8 — TWO FIELDS REMOVED FROM THIS GRID ─────────
                  "Duration (minutes)" (`durationMinutes`) was the SECOND duration question:
                  "Duration *" on the Details card above asks the same thing in free text and
                  writes `deliveryTimeframe`, which the traveler detail page, Discover, the
                  storefront cards, the admin queue and `envelopeFromProviderService` (which
                  parses minutes out of that very text) all read. `durationMinutes` on
                  `provider_services` is read by NOTHING — the many `durationMinutes` hits
                  elsewhere in the repo are `itinerary_items`, a different row. So the canonical
                  duration question is the one on Details, and this duplicate is no longer asked.
                  "Setup / buffer (minutes)" (`bufferMinutes`) is an unread D7 capture field with
                  no consumer anywhere.
                  BOTH COLUMNS ARE UNTOUCHED and both values still round-trip on an edit (they
                  stay in form state, loaded from the row and sent back unchanged), so this
                  removes the question, never the data (§13 / the FP-5 Settings precedent). A
                  control comes back with its consumer, never before it. ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* ── S9 (docs/DECISIONS.md ledger row 102): the provider's own join link ──────────
                Scheduled REMOTE sessions only (call/video) — an in-person/hybrid meeting has a
                place, not a link, so this is gated narrower than the timing card around it.
                SENSITIVE: shown to the traveler only after their booking is confirmed (never on
                any public/pre-booking read) — the reveal is server-side, not a client concern. */}
            {isRemoteSessionListing && (
              <div data-testid="section-join-link">
                <Label htmlFor="joinLink">Your join link</Label>
                <Input
                  id="joinLink" type="url" placeholder="https://…"
                  value={formData.joinLink}
                  onChange={(e) => set("joinLink", e.target.value)}
                  className="mt-1" data-testid="input-join-link"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Shown to the traveler only after their booking is confirmed — never before.
                </p>
              </div>
            )}
            </div>

            {/* ── Booking rules ── */}
            <div className="space-y-3 pt-4 border-t" data-testid="logistics-section-booking-rules">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Booking rules
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lead time is set under Booking terms on the Review &amp; submit step — this is the
                  change window.
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
                {/* FP-2 / Package A item 3: "Can this anchor a day?" (`canAnchor`) removed —
                    an unread D7 capture field (zero consumers repo-wide) whose label is also
                    planner jargon a seller has no way to interpret. Column untouched; a stored
                    value round-trips on edit. */}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CAPACITY — its own step for a place-anchored listing (the step formerly called
          "Group"); folded into Session details for a remote one, which has no separate step. ── */}
      {onSection("capacityFields") && showScheduledLogistics && (
        <Card data-testid="card-capacity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Capacity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mock fidelity (Aug 17): the mock draws Capacity as ONE inline "Party size [min]
                to [max]" pair, not two separate labelled fields, and drops the redundant inner
                "Capacity" heading (the card title already says it). The gated
                `logistics-section-capacity` testid and both party-size input testids are kept. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start" data-testid="logistics-section-capacity">
              <div>
                <Label htmlFor="partySizeMin">Party size</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="partySizeMin" type="number" min={0} placeholder="1"
                    value={formData.partySizeMin}
                    onChange={(e) => set("partySizeMin", e.target.value)}
                    data-testid="input-party-size-min"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">to</span>
                  <Input
                    id="partySizeMax" type="number" min={0} placeholder="4"
                    value={formData.partySizeMax}
                    onChange={(e) => set("partySizeMax", e.target.value)}
                    data-testid="input-party-size-max"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  One pair of numbers — the party size the checkout refuses a booking against, so a
                  traveler can never book a party you cannot take. Per-person vs per-group is your
                  pricing type, set there, not asked twice here.
                </p>
              </div>
              {/* Seating (migration 239) — the mock's second Capacity column. App-enforced
                  private|shared; "" = not answered (omitted on the traveler page, §13). */}
              <div>
                <Label htmlFor="seating">Seating</Label>
                <Select
                  value={formData.seating || undefined}
                  onValueChange={(v) => set("seating", v)}
                >
                  <SelectTrigger id="seating" className="mt-1" data-testid="select-seating">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private" data-testid="option-seating-private">
                      Private — one party at a time
                    </SelectItem>
                    <SelectItem value="shared" data-testid="option-seating-shared">
                      Shared — I'll seat several parties together
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Asked once, here, and rendered on the traveler's page in these words. Leave
                  unset if it doesn't apply — we won't guess one for you.
                </p>
              </div>
            </div>
            {/* The mock's "why its own step" note. */}
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
              Capacity is its own step because it is the answer most often got wrong when it was
              buried in one long screen.
            </p>
          </CardContent>
        </Card>
      )}


      {onStep("review") && (<>

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
          {/* ── WAVE 2 / S4 (ledger row 99): Cancellation Policy (type + details) and the Deposit
              opt-in moved off this step into the post-creation "Pricing & fees" drawer (listing
              home) — moved, not duplicated. `formData.cancellationPolicy(Type)` and the four
              `deposit*` fields stay in state/payload purely for never-clobber round-trip fidelity
              (hydrated, sent unedited on every save); no control here writes them any more. */}
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3" data-testid="note-cancellation-deposit-moved">
            Cancellation policy and deposit are set in <b>Pricing &amp; fees</b>, on this listing's
            home page — available once you've saved a draft. Not required to go live.
          </p>
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
          Placement: the last step, "Review & submit" (Wave 2 / A1 renamed it) — the C9 precedent
          that puts per-listing
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

      {onSection("photos") && (<>

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
      {onSection("roleExtras") && role === "provider" && (
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

            {/* ── FP-2 / Package A item 8 (capacity) — "Max Concurrent Clients" REMOVED ────────
                It was the SECOND capacity number on this form, three steps and one vocabulary
                away from "Minimum / Maximum party size" in the Service-logistics card. Party
                size is the canonical question: it is the pair the SERVER enforces
                (`booking-eligibility.service.ts` refuses a booking whose party is outside
                `party_size_min`/`party_size_max`), so it is the one that decides anything.
                `maxConcurrentBookings` is a different fact wearing the same clothes — how many
                bookings may run at once — and its only consumer is the Catalog card's "Up to N"
                chip, which renders it beside a Users icon and therefore reads as a group size
                too. Column untouched, value round-trips on edit, and the chip keeps rendering
                for rows that already carry a number. When concurrency is asked again it comes
                back as its own question with its own words (filed for the Wave-2 Capacity
                step). ── */}

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

            {/* ── FP-2 / A2 (Package A item 2; mock fix A2) — THE DEAD PUBLISHED/DRAFT SWITCH ────
                What was here: a `Switch` bound to `formData.active`, labelled "Published" /
                "Draft". `active` was read by NOTHING else — it was never put on the create/update
                payload and no gate consulted it — so flipping it changed no listing state
                anywhere, while reading as the control that puts a listing live. The status a
                listing actually has is decided by the server (`status` from the submit action,
                `approval_status` clamped to `submitted` at birth by F2 / migration 111).
                Per the mock: the control is replaced by a READ-ONLY pill over the real record,
                and the `active` field is deleted from the form state entirely so nothing can
                bind to it again. Edit mode reads `existingService`, the row as stored; a create
                has no record yet and says so. ── */}
            <div>
              <Label className="text-sm font-medium">Current Status</Label>
              <div className="mt-2">
                <Badge
                  variant={listingStatusPill(existingService, isEditMode).tone === "live" ? "default" : "secondary"}
                  data-testid="badge-provider-listing-status"
                >
                  {listingStatusPill(existingService, isEditMode).label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Set by the record, not by this form: a listing goes Draft → In review → Live, and
                only our review moves it to Live.
              </p>
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Expert-Specific Approval Workflow ── */}
      {onSection("roleExtras") && role === "expert" && (
        <Card>
          <CardHeader>
            <CardTitle>Submission & Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* FP-2 / A1: the "within 48 hours" SLA claim is REMOVED, not reworded — the
                execution map's Gate G5 #7 ("review SLA — is '2 business days' real?") is open
                with the disposition "measure first, then commit or drop the number", and this
                page had no measurement behind its 48. The review fact itself now leads the
                form for both roles (the upfront notice above), so this card keeps only what
                is specific to it: the record's real status. */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                Save your service as a draft at any point. Submitting sends it to our team for
                review — it goes live once approved.
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
              onClick={() =>
                // Ruling 113: backing OUT of a provider CREATE flow returns to the Workstation
                // (creation area). Edits — and the expert console — still land on the catalog.
                navigate(!isEditMode && role === "provider" ? "/provider/workstation" : `/${role}/services`)
              }
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>

            {effectiveStep > 1 && (
              <Button
                variant="outline"
                onClick={() => goToStep(effectiveStep - 1)}
                disabled={createMutation.isPending}
                data-testid="button-step-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}

            <div className="flex-1" />

            {/* D-12 AMENDED (mock fidelity, Aug 17 — decision-maker ratified the mock as the
                target): the create-mode Save-draft button is RESTORED. D-12 removed it on the
                premise that "the mock's contract is autosave, no button" — but the ratified mock
                (mock-04-create-basics) draws BOTH the "Draft · autosaved" pill AND a "Save draft"
                CTA whose own copy is "Saving creates the listing. You can leave and come back."
                That is a durable SERVER draft row, which the localStorage checkpoint (ruling 112
                Q4) does not deliver — it keeps work in THIS browser only. The button now shows in
                both modes off the same createMutation("draft") path; the autosave line below stays
                (the mock keeps the pill too). EDIT mode's UNPUBLISH-rail semantics are unchanged —
                only there is the listing ever live, so only there does the label switch. */}
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
                : role === "expert" ? "Save as Draft" : "Save draft"}
            </Button>

            {effectiveStep < TOTAL_STEPS ? (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => goToStep(effectiveStep + 1)}
                disabled={createMutation.isPending}
                data-testid="button-step-next"
              >
                Next: {STEP_SHORT_TITLES[flow[effectiveStep]]}
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
                    ? "Complete identity and business verification in your Provider Status page before submitting this listing"
                    : publishBlocked
                    ? "Complete background verification before submitting a listing in this category"
                    : attestationGateBlocked
                    ? "Tick the confirmations on the Review & submit step before submitting"
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
                  : "Submit for review"}
              </Button>
            )}
          </div>

          {/* D-12 AMENDED: the mock's own Save-draft copy, stated beside the restored button. */}
          {!isEditMode && (
            <p className="text-xs text-muted-foreground sm:text-right" data-testid="text-footer-autosave">
              Saving creates the listing. You can leave and come back — nothing is lost, and review
              has not started.
            </p>
          )}

          {/* Final-step disabled explanation: name WHICH step holds each missing
              required field, with a jump link — mirrors the existing enforcement,
              adds none. */}
          {effectiveStep === TOTAL_STEPS && missingForFinal.length > 0 && (
            <p className="text-xs text-muted-foreground sm:text-right" data-testid="text-missing-required">
              Still needed before you submit for review:{" "}
              {missingForFinal.map((m, i) => (
                <span key={`${m.step}-${m.label}`}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => goToStep(m.step)}
                  >
                    {m.label} ({STEP_SHORT_TITLES[m.stepKey]}, step {m.step})
                  </button>
                </span>
              ))}
              . {isEditMode ? "Or Save Draft and finish later." : "Your draft is autosaved — finish later any time."}
            </p>
          )}

          {/* dispatch v1.3 R2: reinforce "what happens next" right at the submit action —
              submitting for review is never blocked while unverified (only going LIVE is
              gated, ruling 53), so this stays a note, not a disabled button. */}
          {effectiveStep === TOTAL_STEPS && expertVerificationGateBlocked && (
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
          {effectiveStep === TOTAL_STEPS && role === "provider" && (verificationGateBlocked || publishBlocked) && (
            <p className="text-xs text-amber-700 sm:text-right" data-testid="text-provider-publish-verification-note">
              {verificationGateBlocked
                ? "Publishing needs identity and business verification. "
                : "This category needs background verification before it can be published. "}
              <a href="/provider-status" className="underline font-medium">Finish verification on your Provider Status page</a>
              {" "}— your work here is safe{isEditMode ? ", use Save Draft and come back" : " (drafts autosave), come back any time"}.
            </p>
          )}
        </CardContent>
      </Card>

      </div>
      </div>

    </div>
  );
}
