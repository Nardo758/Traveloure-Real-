/**
 * Provider Workstation — the Product Builder (PB, §17 creation ladder).
 *
 * The provider console's Workstation seat: ONE door for building what you sell, growing
 * with the merchant (§17 "creation ladder": single service → bundle → property).
 *
 *   - SINGLE SERVICE: always available — links to the existing ServiceForm create route
 *     (/provider/services/new). The Workstation does not rebuild the form.
 *   - BUNDLE (§17 Product Builder, ratified Jul 28, 2026; migration 151): unlocks at 2+
 *     approved+active services (the server enforces it; the card states the rule honestly
 *     with the provider's REAL current count — §13). A bundle IS a provider_services row
 *     (product_shape='bundle') born `submitted` (D1a) — it must pass the F2 admin queue
 *     before it sells, and the create toast says so. Components must be the provider's own
 *     approved+active non-bundle services (F2: no unapproved service hides inside a
 *     sellable bundle; bundles stay flat). The picker OFFERS only eligible services;
 *     component prices are shown display-only — the platform never auto-sums the bundle
 *     price (the provider prices the bundle).
 *   - PROPERTY (§17 Product Builder — PROPERTY rung, ratified Jul 29, 2026; migration 153):
 *     a property IS a provider_services row (product_shape='property'); each room type is
 *     its own child row (product_shape='property_room', parentServiceId → the property,
 *     price = nightly rate, pricingUnit='per_night'). Multi-room in the first cut. Both the
 *     property and each room are born `submitted` (D1a) and go through F2 review like any
 *     listing. After create, each room needs its night availability published — the range
 *     dialog below calls the EXISTING vendor_availability_slots rail
 *     (POST /api/me/services/:roomId/slots/range), the same table any dated service uses.
 *
 *   - FP-3 (ratified from the service-creation redesign mock): "a property room's Edit opens
 *     its property's editor at the Rooms step — a room has no service checklist/delivery-method
 *     of its own, and sending it into the generic ServiceForm is a dishonest surface." The
 *     property editor below is that surface: Basics (PATCH /api/provider/properties/:id) and
 *     Rooms (PATCH /api/provider/rooms/:id per room), reached from Catalog by the
 *     `?property=<id>&room=<id>` deep link — the same `?param=` convention the provider inbox
 *     and settings seats already use.
 *   - S8 (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102; migration 211): the
 *     property editor gained a third step, Details — check-in/out time, house rules, amenities
 *     (new columns), plus photos and cancellation policy (columns that already existed but had
 *     no builder surface). Details rides the GENERIC PATCH /api/provider/services/:id (a
 *     property/room IS a provider_services row) rather than propertyPatchSchema/roomPatchSchema
 *     — the ratified write-rail decision, so no new endpoint and no allowlist edit was needed.
 *     Per-room guest capacity reuses partySizeMin/partySizeMax (S8-Q2) the same way, scoped per
 *     room. House rules and the pin stay property-level ONLY — absolute inheritance, no
 *     per-room override (S8-Q3/Q4) — so neither field appears on a room's own card.
 *
 * Money-path honesty: the bundle/property/room price entered here is the owner-set listing
 * price like any service create — the checkout charge is server-derived from the stored row
 * (§14; a room's charge is nights × its stored nightly rate). A3 material-change rule: the
 * server drops an APPROVED bundle/property/room back to `submitted` when its price,
 * component set, or room set changes and returns `reenteredReview: true` — surfaced as a
 * toast so the provider knows their change paused sales pending re-review.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader, EmptyState, StatusBadge } from "@/components/backoffice/primitives";
import { LocationPointPicker, type LocationPoint } from "@/components/backoffice/location-point-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Wrench,
  Plus,
  Boxes,
  BedDouble,
  Lock,
  Edit,
  Trash2,
  Pause,
  Play,
  X,
  CalendarRange,
  AlertCircle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Owner-console shapes (GET /api/provider/services + GET /api/provider/bundles —
// session-scoped, intentionally ungated on approval so the owner sees their pipeline).
interface Service {
  id: string;
  serviceName: string;
  name?: string;
  approvalStatus?: string | null;
  status: string;
  price?: string | number | null;
  basePrice?: string | number | null;
  productShape?: string | null;
  serviceOfferingTypeId?: string | null;
}

// Ruling 114: the ideas rail's data shapes — the /earn catalog row and the category name map.
interface IdeasOffering {
  id: string;
  offering_type_key: string;
  category_key: string;
  display_name: string;
  tagline: string | null;
}
interface IdeasCategory { id: string; name: string; categoryKey: string | null }

interface BundleComponent {
  id: string;
  serviceName: string;
  approvalStatus: string | null;
  status: string | null;
  position: number;
}

interface Bundle {
  id: string;
  serviceName: string;
  description?: string | null;
  price?: string | null;
  approvalStatus?: string | null;
  status: string;
  rejectionReason?: string | null;
  components: BundleComponent[];
}

// §17 Product Builder — PROPERTY rung (GET /api/provider/properties — session-scoped,
// intentionally ungated on approval so the owner sees their own pipeline).
interface Room {
  id: string;
  serviceName: string;
  price?: string | number | null;
  approvalStatus?: string | null;
  status: string;
  categoryAttributes?: { units?: number } | null;
  // S8 (Gate G2): per-room guest capacity REUSES partySizeMin/partySizeMax (the ratified S8-Q2
  // reuse decision) — no new "maxGuests" column. Room-level, not property-level (each room type
  // sleeps a different count).
  partySizeMin?: number | null;
  partySizeMax?: number | null;
}

interface Property {
  id: string;
  serviceName: string;
  description?: string | null;
  location?: string | null;
  neighborhood?: string | null;
  approvalStatus?: string | null;
  status: string;
  rejectionReason?: string | null;
  rooms: Room[];
  // S8 (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102) — already-existing
  // columns the property builder never surfaced (photos/cancellation) plus the three genuinely
  // new ones (check-in/out, house rules, amenities — migration 211). Property-level only: a room
  // never carries its own house rules or check-in/out (absolute inheritance, S8-Q3/Q4).
  serviceImage?: string | null;
  galleryImages?: string[] | null;
  cancellationPolicy?: string | null;
  cancellationPolicyType?: string | null;
  checkInTime?: string | null;
  minStayNights?: number | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  amenities?: string[] | null;
}

interface RoomDraft {
  key: string;
  roomName: string;
  price: string;
  units: string;
}

/** apiRequest throws `Error("<status>: <body>")` — surface the server's honest message
 *  (the specific unowned/unapproved/inactive/insufficient 400s) instead of a status code. */
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

function formatPrice(price: string | number | null | undefined): string {
  if (price == null || price === "") return "—";
  const n = Number(price);
  return Number.isFinite(n) ? `$${n.toFixed(2).replace(/\.00$/, "")}` : String(price);
}

// S5 (ruling 74 disp. 1): the category inspiration tiles — the 12 live service categories
// shown on the Workstation page, matching the ratified provider console design. Each tile
// pre-selects the category and jumps into the Basics screen via ?category=.
const inspirationCards: { label: string; slug: string; desc: string }[] = [
  { label: "Tours & Experiences",       slug: "Tours & Experiences",       desc: "Walks, museum tours, cultural sessions" },
  { label: "Food & Culinary",           slug: "Food & Culinary",           desc: "Private chefs, cooking lessons, food tours" },
  { label: "Photography & Videography", slug: "Photography & Videography", desc: "Portrait, event, travel video" },
  { label: "Transportation & Logistics",slug: "Transportation & Logistics", desc: "Transfers, day trips, specialty transport" },
  { label: "Arts & Crafts Instruction", slug: "Arts & Crafts Instruction", desc: "Pottery, calligraphy, ikebana, dance" },
  { label: "Personal Assistance",       slug: "Personal Assistance",       desc: "Trip planning, errands, concierge" },
  { label: "Events & Celebrations",     slug: "Events & Celebrations",     desc: "Proposals, birthdays, small weddings" },
  { label: "Beauty & Styling",          slug: "Beauty & Styling",          desc: "Hair, make-up, kimono dressing" },
  { label: "Restaurants & Dining",      slug: "Restaurants & Dining",      desc: "Private dining, tastings, venue seats" },
  { label: "Lodging & Accommodation",   slug: "Lodging & Accommodation",   desc: "Rooms, homestays, glamping" },
  { label: "Entertainment",             slug: "Entertainment",             desc: "Musicians, performers, hosts" },
  { label: "Rental Services",           slug: "Rental Services",           desc: "Bikes, gear, cameras, kimono" },
];

/**
 * WORKSTATION REBUILD — page-scoped presentation tokens + the "one door" launcher idiom,
 * transcribed from the ratified redesign mock's `panel-door` view
 * (docs/design/service-creation-mock.html: `:root` tokens + `.doortiles`/`.doortile`/
 * `.progressbar`/`.cats`/`.cat`/`.screen`/`.grouplabel`/`.divider` rules). Scoped entirely
 * under `.ws-mock` — this does NOT touch the console's global theme (`.console-scope` in
 * client/src/index.css) or any shared component; the mock's teal `--accent` (#35605A) is
 * this view's own accent, distinct from the console's coral `--console-brand`, exactly as
 * drawn in the mock. Page-local by design (no shared-component extraction) per the
 * coordination note against the sibling Catalog rebuild lane.
 */
const WORKSTATION_MOCK_CSS = `
.ws-mock{
  --ws-ink:#1A1A18;--ws-muted:#7A7A72;--ws-hair:#E8E8E2;--ws-ground:#FAFAF8;--ws-paper:#FFFFFF;
  --ws-accent:#35605A;--ws-accent-soft:#EDF2F1;--ws-warn-bg:#FBF6EC;--ws-warn-line:#D9C79A;--ws-warn-ink:#6B551F;
  --ws-radius:7px;color:var(--ws-ink);
}
.ws-mock a{color:inherit;text-decoration:none;}
.ws-mock .ws-screen{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:0 0 4px;color:var(--ws-ink);}
.ws-mock .ws-screen-sub{color:var(--ws-muted);font-size:13px;margin:0 0 18px;max-width:70ch;}
.ws-mock .ws-grouplabel{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ws-muted);font-weight:600;margin:0 0 10px;}
.ws-mock .ws-doortiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
@media (max-width:56.25rem){.ws-mock .ws-doortiles{grid-template-columns:1fr;}}
.ws-mock .ws-doortiles>a{display:contents;}
.ws-mock .ws-doortile{
  border:1px solid var(--ws-hair);border-radius:var(--ws-radius);background:var(--ws-paper);padding:20px;
  text-align:left;min-height:172px;display:flex;flex-direction:column;transition:border-color .15s;
}
.ws-mock button.ws-doortile-btn{font:inherit;-webkit-appearance:none;appearance:none;width:100%;cursor:pointer;}
.ws-mock .ws-doortile:not(.ws-locked):hover{border-color:var(--ws-accent);}
.ws-mock .ws-doortile h4{font-size:15px;font-weight:650;margin:12px 0 5px;color:var(--ws-ink);}
.ws-mock .ws-doortile p{font-size:12.5px;color:var(--ws-muted);line-height:1.5;margin:0;}
.ws-mock .ws-doortile-icon{width:24px;height:24px;color:var(--ws-accent);}
.ws-mock .ws-cta{margin-top:auto;padding-top:14px;font-size:12.5px;color:var(--ws-accent);font-weight:550;}
.ws-mock .ws-doortile.ws-locked{background:var(--ws-ground);border-style:dashed;cursor:not-allowed;opacity:.92;}
.ws-mock .ws-doortile.ws-locked h4{color:var(--ws-muted);}
.ws-mock .ws-doortile.ws-locked .ws-cta{color:var(--ws-muted);}
.ws-mock .ws-doortile.ws-locked .ws-doortile-icon{color:var(--ws-muted);}
.ws-mock .ws-warnbox{margin-top:8px;color:var(--ws-warn-ink);background:var(--ws-warn-bg);border:1px solid var(--ws-warn-line);border-radius:5px;padding:7px 9px;font-size:12.5px;line-height:1.5;}
.ws-mock .ws-warnbox a{color:var(--ws-warn-ink);text-decoration:underline;font-weight:600;}
.ws-mock .ws-progressbar{height:5px;border-radius:100px;background:var(--ws-hair);overflow:hidden;margin-top:10px;}
.ws-mock .ws-progressbar i{display:block;height:100%;background:var(--ws-muted);}
.ws-mock .ws-divider{height:1px;background:var(--ws-hair);margin:26px 0;}
.ws-mock .ws-cats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}
@media (max-width:1100px){.ws-mock .ws-cats{grid-template-columns:repeat(3,1fr);}}
@media (max-width:760px){.ws-mock .ws-cats{grid-template-columns:repeat(2,1fr);}}
.ws-mock .ws-cat{
  border:1px solid var(--ws-hair);border-radius:6px;background:var(--ws-paper);padding:12px 13px;
  display:block;transition:border-color .15s,background .15s;
}
.ws-mock .ws-cat:hover{border-color:var(--ws-accent);background:var(--ws-accent-soft);}
.ws-mock .ws-cat b{display:block;font-size:13px;font-weight:600;color:var(--ws-ink);}
`;

export default function ProviderWorkstation() {
  const { toast } = useToast();

  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });
  // ── Ruling 114: "Ideas for your business" — offerings from the categories this provider
  // REGISTERED for that they have NOT listed yet. Real data only: the application's own
  // serviceOffers, the live /earn catalog (taglines come from it — nothing invented, §13),
  // and the provider's actual listings. Empty ⇒ the rail does not render at all.
  const { data: providerApplication } = useQuery<{ serviceOffers?: string[] | null } | null>({
    queryKey: ["/api/provider-application"],
  });
  const { data: ideasCatalog = [] } = useQuery<IdeasOffering[]>({
    queryKey: ["/api/offering-types/services"],
    staleTime: 5 * 60_000,
  });
  const { data: ideasCategories = [] } = useQuery<IdeasCategory[]>({
    queryKey: ["/api/service-categories"],
    staleTime: 5 * 60_000,
  });

  const { data: bundles, isLoading: bundlesLoading } = useQuery<Bundle[]>({
    queryKey: ["/api/provider/bundles"],
  });

  // Bundle-eligible components = the provider's own approved+active NON-bundle services —
  // exactly the set the server accepts (validateBundleComponents: F2 + flat-bundles rule).
  const serviceList = Array.isArray(services) ? services : [];
  const eligibleComponents = serviceList.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active" && s.productShape !== "bundle",
  );
  const bundleUnlocked = eligibleComponents.length >= 2;

  // ── Builder dialog state (create + edit share the one builder) ──────────────
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Honest edit note: current components that are no longer approved+active can't be
  // re-offered by the picker (the server would reject them on save anyway).
  const [droppedOnPrefill, setDroppedOnPrefill] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);

  function openCreate() {
    setEditingBundle(null);
    setBundleName("");
    setBundleDescription("");
    setBundlePrice("");
    setSelectedIds([]);
    setDroppedOnPrefill([]);
    setBuilderOpen(true);
  }

  function openEdit(bundle: Bundle) {
    setEditingBundle(bundle);
    setBundleName(bundle.serviceName ?? "");
    setBundleDescription(bundle.description ?? "");
    setBundlePrice(bundle.price != null ? String(bundle.price) : "");
    const eligibleIdSet = new Set(eligibleComponents.map((s) => s.id));
    const keep = bundle.components.filter((c) => eligibleIdSet.has(c.id)).map((c) => c.id);
    setSelectedIds(keep);
    setDroppedOnPrefill(
      bundle.components.filter((c) => !eligibleIdSet.has(c.id)).map((c) => c.serviceName),
    );
    setBuilderOpen(true);
  }

  function toggleComponent(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const priceNumber = parseFloat(bundlePrice);
  const formValid =
    bundleName.trim().length > 0 &&
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    selectedIds.length >= 2;

  const invalidateBundleQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/provider/bundles"] });
    // A bundle IS a provider_services row — it also appears in the Catalog list.
    queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/bundles", {
        serviceName: bundleName.trim(),
        description: bundleDescription.trim() || undefined,
        price: bundlePrice,
        componentServiceIds: selectedIds,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateBundleQueries();
      setBuilderOpen(false);
      // D1a honesty: born `submitted`, not live.
      toast({
        title: "Bundle submitted for review",
        description: "It appears in your Catalog and goes live once approved.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not create bundle",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/provider/bundles/${editingBundle!.id}`, {
        serviceName: bundleName.trim(),
        description: bundleDescription.trim() || undefined,
        price: bundlePrice,
        componentServiceIds: selectedIds,
      });
      return res.json();
    },
    onSuccess: (data: Bundle & { reenteredReview?: boolean }) => {
      invalidateBundleQueries();
      setBuilderOpen(false);
      if (data.reenteredReview) {
        // A3 material-change rule — the server dropped it back to `submitted`.
        toast({
          title: "Bundle updated — back in review",
          description:
            "Changing the price or components of an approved bundle sends it back for review. It won't sell until re-approved.",
        });
      } else {
        toast({ title: "Bundle updated" });
      }
    },
    onError: (err) => {
      toast({
        title: "Could not update bundle",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const res = await apiRequest("PATCH", `/api/provider/bundles/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: Bundle) => {
      invalidateBundleQueries();
      toast({ title: data.status === "paused" ? "Bundle paused" : "Bundle activated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update bundle",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 204 — no body to parse.
      await apiRequest("DELETE", `/api/provider/bundles/${id}`);
    },
    onSuccess: () => {
      invalidateBundleQueries();
      setDeleteTarget(null);
      toast({ title: "Bundle deleted" });
    },
    onError: (err) => {
      setDeleteTarget(null);
      toast({
        title: "Could not delete bundle",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const mutationBusy = createMutation.isPending || updateMutation.isPending;
  const bundleList = Array.isArray(bundles) ? bundles : [];

  // ── §17 Product Builder — PROPERTY rung ──────────────────────────────────────
  const { data: properties, isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/provider/properties"],
  });
  const propertyList = Array.isArray(properties) ? properties : [];

  const invalidatePropertyQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/provider/properties"] });
    // A property/room IS a provider_services row — it also appears in the Catalog list.
    queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
  };

  const [propertyBuilderOpen, setPropertyBuilderOpen] = useState(false);
  // S-2 (ledger 2026-08-16-console-sweep): the mock's property builder is a step ladder that
  // ENDS in Review — "1. The property · 2. Rooms · 3. Review" — where the service lane already
  // ends in "Review & submit". Same fields, same one POST; the steps only sequence them and put
  // a read-back between the provider and Submit.
  type PropertyBuilderStep = "property" | "rooms" | "review";
  const [propertyBuilderStep, setPropertyBuilderStep] = useState<PropertyBuilderStep>("property");
  const [propName, setPropName] = useState("");
  const [propDescription, setPropDescription] = useState("");
  const [propLocation, setPropLocation] = useState("");
  // L27-P3: the confirmed map point for the property (null = no pin placed). Sent only
  // when set; the server derives `location_precision='exact'` from a confirmed point and
  // never from a typed address (§13).
  const [propPoint, setPropPoint] = useState<LocationPoint | null>(null);
  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>([
    { key: "r0", roomName: "", price: "", units: "" },
  ]);
  const [propertyDeleteTarget, setPropertyDeleteTarget] = useState<Property | null>(null);

  function openPropertyCreate() {
    setPropName("");
    setPropDescription("");
    setPropLocation("");
    setPropPoint(null);
    setRoomDrafts([{ key: `r${Date.now()}`, roomName: "", price: "", units: "" }]);
    setPropertyBuilderStep("property");
    setPropertyBuilderOpen(true);
  }
  function addRoomDraft() {
    setRoomDrafts((prev) => [...prev, { key: `r${Date.now()}-${prev.length}`, roomName: "", price: "", units: "" }]);
  }
  function removeRoomDraft(key: string) {
    setRoomDrafts((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function updateRoomDraft(key: string, patch: Partial<RoomDraft>) {
    setRoomDrafts((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const roomDraftsValid =
    roomDrafts.length > 0 &&
    roomDrafts.every((r) => {
      const p = parseFloat(r.price);
      return r.roomName.trim().length > 0 && Number.isFinite(p) && p > 0;
    });
  const propertyFormValid = propName.trim().length > 0 && roomDraftsValid;

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/provider/properties", {
        serviceName: propName.trim(),
        description: propDescription.trim() || undefined,
        location: propLocation.trim() || undefined,
        // Only a confirmed pin travels; omitted otherwise (no coordinates written).
        ...(propPoint ? { locationPoint: propPoint } : {}),
        rooms: roomDrafts.map((r) => ({
          roomName: r.roomName.trim(),
          price: r.price,
          ...(r.units.trim() ? { units: parseInt(r.units, 10) } : {}),
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      invalidatePropertyQueries();
      setPropertyBuilderOpen(false);
      // D1a honesty: born `submitted`, not live.
      toast({
        title: "Property submitted for review",
        description:
          "It appears in your Catalog and goes live once approved. Publish night availability on each room next.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not create property",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  const propertyStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const res = await apiRequest("PATCH", `/api/provider/properties/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: Property) => {
      invalidatePropertyQueries();
      toast({ title: data.status === "paused" ? "Property paused" : "Property activated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update property",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/provider/properties/${id}`);
    },
    onSuccess: () => {
      invalidatePropertyQueries();
      setPropertyDeleteTarget(null);
      toast({ title: "Property deleted" });
    },
    onError: (err) => {
      setPropertyDeleteTarget(null);
      toast({
        title: "Could not delete property",
        description: parseApiErrorMessage(
          err,
          // Mirrors the server's 409 (parent_service_id ON DELETE RESTRICT) — the common case
          // when this fails is "rooms still exist", so give that as the fallback guess too.
          "Remove its room types first, then delete the property.",
        ),
        variant: "destructive",
      });
    },
  });

  // ── FP-3: the PROPERTY EDITOR (Basics + Rooms), and the Catalog deep link into it ──────────
  //
  // Ratified design: a property room's Edit opens its property's editor at the Rooms step. This
  // is that editor. It writes ONLY through the two owner-gated endpoints that already exist —
  // PATCH /api/provider/properties/:id (name / location / description) and
  // PATCH /api/provider/rooms/:id (room name / nightly price / units) — so no new write rail is
  // introduced and the A3 material-change rule (a price change on an APPROVED room re-enters
  // review) keeps its ONE server-side author. It deliberately adds NO new field: the missing
  // innkeeper fields (photos, cancellation, check-in, house rules, amenities, capacity) are the
  // redesign-gated B9 scope, and inventing half of them here would be the dishonest surface
  // this lane exists to remove.
  // S8 (Gate G2): "details" is the new step — check-in/out, house rules, amenities, photos,
  // cancellation. It rides PATCH /api/provider/services/:id (the generic listing editor's
  // endpoint) rather than propertyPatchSchema, per the ratified write-rail decision (all four new
  // columns + the previously-unsurfaced-here-but-already-existing photos/cancellation fields ride
  // the EXISTING POST/PATCH /api/provider/services + insertProviderServiceSchema — no new
  // endpoint, no propertyPatchSchema allowlist edit needed).
  type PropertyEditorStep = "basics" | "details" | "rooms";
  interface RoomEditDraft { roomName: string; price: string; units: string; partySizeMin: string; partySizeMax: string }

  const [propertyEditorTarget, setPropertyEditorTarget] = useState<Property | null>(null);
  const [propertyEditorStep, setPropertyEditorStep] = useState<PropertyEditorStep>("basics");
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [editPropName, setEditPropName] = useState("");
  const [editPropLocation, setEditPropLocation] = useState("");
  const [editPropDescription, setEditPropDescription] = useState("");
  const [editPropServiceImage, setEditPropServiceImage] = useState("");
  const [editPropGalleryImages, setEditPropGalleryImages] = useState(""); // newline-separated URLs
  const [editPropCheckInTime, setEditPropCheckInTime] = useState("");
  const [editPropCheckOutTime, setEditPropCheckOutTime] = useState("");
  const [editPropHouseRules, setEditPropHouseRules] = useState("");
  const [editPropCancellationPolicy, setEditPropCancellationPolicy] = useState("");
  const [editPropCancellationPolicyType, setEditPropCancellationPolicyType] = useState("");
  // Ruling 112 Q6 (migration 214): minimum stay in nights — "" = never captured, no guessed 1.
  const [editPropMinStay, setEditPropMinStay] = useState("");
  const [editPropAmenities, setEditPropAmenities] = useState<string[]>([]);
  const [amenityDraft, setAmenityDraft] = useState("");
  const [roomEdits, setRoomEdits] = useState<Record<string, RoomEditDraft>>({});
  // §13: a deep link that names a property this account does not have (deleted, or never owned)
  // is SAID so, never silently ignored and never resolved to some other property.
  const [deepLinkMiss, setDeepLinkMiss] = useState<string | null>(null);
  // FP-2 item 7: the bundle deep link gets its OWN miss state so the notice renders in the
  // bundles section, beside the list it is talking about, rather than under "Your properties".
  const [bundleLinkMiss, setBundleLinkMiss] = useState<string | null>(null);

  // Ruling 114: ideas = registered categories ∩ catalog, minus already-listed offerings,
  // round-robined across categories (max 2 per category, 6 tiles) so one category never
  // monopolises the rail. custom_other_offering is a door, not an idea.
  const ideasForBusiness = (() => {
    // NOTE: plain objects, not Map — `Map` is shadowed in this module by the lucide icon import.
    const registered = new Set((providerApplication?.serviceOffers ?? []).filter(Boolean));
    if (registered.size === 0) return [];
    const nameByKey: Record<string, string> = {};
    for (const c of ideasCategories) if (c.categoryKey) nameByKey[c.categoryKey] = c.name;
    const listedOfferingIds = new Set(
      (services ?? []).map((s) => s.serviceOfferingTypeId).filter(Boolean) as string[],
    );
    const eligible = ideasCatalog.filter((o) => {
      if (!o.category_key || o.offering_type_key === "custom_other_offering") return false;
      const catName = nameByKey[o.category_key];
      return !!catName && registered.has(catName) && !listedOfferingIds.has(o.id);
    });
    const byCat: Record<string, IdeasOffering[]> = {};
    for (const o of eligible) (byCat[o.category_key] ??= []).push(o);
    const picked: (IdeasOffering & { categoryName: string })[] = [];
    for (let round = 0; round < 2 && picked.length < 6; round++) {
      for (const key of Object.keys(byCat)) {
        if (picked.length >= 6) break;
        const o = byCat[key][round];
        if (o) picked.push({ ...o, categoryName: nameByKey[key] });
      }
    }
    return picked;
  })();

  function openPropertyEditor(property: Property, step: PropertyEditorStep, roomId?: string | null) {
    setPropertyEditorTarget(property);
    setPropertyEditorStep(step);
    setFocusRoomId(roomId ?? null);
    setEditPropName(property.serviceName ?? "");
    setEditPropLocation(property.location ?? "");
    setEditPropDescription(property.description ?? "");
    setEditPropServiceImage(property.serviceImage ?? "");
    setEditPropGalleryImages((property.galleryImages ?? []).join("\n"));
    setEditPropCheckInTime(property.checkInTime ?? "");
    setEditPropCheckOutTime(property.checkOutTime ?? "");
    setEditPropHouseRules(property.houseRules ?? "");
    setEditPropCancellationPolicy(property.cancellationPolicy ?? "");
    setEditPropCancellationPolicyType(property.cancellationPolicyType ?? "");
    setEditPropMinStay(property.minStayNights == null ? "" : String(property.minStayNights));
    setEditPropAmenities(Array.isArray(property.amenities) ? property.amenities : []);
    setAmenityDraft("");
    setRoomEdits(
      Object.fromEntries(
        property.rooms.map((r) => [
          r.id,
          {
            roomName: r.serviceName ?? "",
            price: r.price == null ? "" : String(r.price),
            units: r.categoryAttributes?.units != null ? String(r.categoryAttributes.units) : "",
            partySizeMin: r.partySizeMin != null ? String(r.partySizeMin) : "",
            partySizeMax: r.partySizeMax != null ? String(r.partySizeMax) : "",
          },
        ]),
      ),
    );
  }

  // Catalog's room/property Edit lands here: /provider/workstation?property=<id>[&room=<id>].
  // The room id only FOCUSES a row — every write is still owner-gated server-side against the
  // session, so a hand-edited query string can open nothing it does not own.
  const search = useSearch();
  const deepLinkProperty = new URLSearchParams(search).get("property");
  const deepLinkRoom = new URLSearchParams(search).get("room");
  // FP-2 / Package A item 7: and Catalog's bundle Edit lands here as ?bundle=<id>. Same
  // convention, same owner gating (the id only picks a row out of THIS account's own bundle
  // read — a bundle that is not in it opens nothing and is said out loud, never guessed at).
  const deepLinkBundle = new URLSearchParams(search).get("bundle");
  const consumedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (propertiesLoading) return;
    const key = `${deepLinkProperty ?? ""}|${deepLinkRoom ?? ""}`;
    if (key === "|" || consumedDeepLink.current === key) return;
    consumedDeepLink.current = key;
    const list = Array.isArray(properties) ? properties : [];
    const target = list.find(
      (p) =>
        (deepLinkProperty != null && p.id === deepLinkProperty) ||
        (deepLinkRoom != null && p.rooms.some((r) => r.id === deepLinkRoom)),
    );
    if (!target) {
      setDeepLinkMiss(
        deepLinkRoom
          ? "That room type is no longer in your properties — it may have been deleted."
          : "That property is no longer in your list — it may have been deleted.",
      );
      return;
    }
    setDeepLinkMiss(null);
    openPropertyEditor(target, deepLinkRoom ? "rooms" : "basics", deepLinkRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertiesLoading, properties, deepLinkProperty, deepLinkRoom]);

  // FP-2 / Package A item 7 — the bundle twin of the deep link above. `openEdit` prefills the
  // builder from the bundle row AND from `eligibleComponents`, so this waits for BOTH reads
  // (bundles + services); opening earlier would prefill a component list that is still empty and
  // silently drop every component (the same class of bug as the FP-3 room re-route). §13: a
  // bundle id this account does not own resolves to nothing and SAYS so.
  const consumedBundleLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkBundle || bundlesLoading || servicesLoading) return;
    if (consumedBundleLink.current === deepLinkBundle) return;
    consumedBundleLink.current = deepLinkBundle;
    const target = (Array.isArray(bundles) ? bundles : []).find((b) => b.id === deepLinkBundle);
    if (!target) {
      setBundleLinkMiss("That bundle is no longer in your list — it may have been deleted.");
      return;
    }
    setBundleLinkMiss(null);
    openEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundlesLoading, servicesLoading, bundles, services, deepLinkBundle]);

  const updatePropertyBasicsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/provider/properties/${propertyEditorTarget!.id}`, {
        serviceName: editPropName.trim(),
        location: editPropLocation.trim(),
        description: editPropDescription.trim(),
      });
      return res.json();
    },
    onSuccess: (data: Property) => {
      invalidatePropertyQueries();
      setPropertyEditorTarget((prev) => (prev ? { ...prev, ...data, rooms: prev.rooms } : prev));
      toast({ title: "Property updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update property",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  // S8 (Gate G2): the property's Details step (check-in/out, house rules, amenities, photos,
  // cancellation). Rides the GENERIC PATCH /api/provider/services/:id — a property IS a
  // provider_services row, so its own general editor endpoint accepts every field
  // insertProviderServiceSchema exposes, including the four migration-211 columns and the
  // previously-unsurfaced-here photos/cancellation columns. Amenities: an EMPTY array is a
  // real "cleared" state and is sent as such — the NULL-vs-[] distinction (§13) is preserved by
  // always sending the array, never omitting it once this form has been opened.
  const updatePropertyDetailsMutation = useMutation({
    mutationFn: async () => {
      const galleryImages = editPropGalleryImages
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiRequest("PATCH", `/api/provider/services/${propertyEditorTarget!.id}`, {
        serviceImage: editPropServiceImage.trim() || null,
        galleryImages,
        checkInTime: editPropCheckInTime.trim() || null,
        checkOutTime: editPropCheckOutTime.trim() || null,
        houseRules: editPropHouseRules.trim() || null,
        amenities: editPropAmenities,
        cancellationPolicy: editPropCancellationPolicy.trim() || null,
        cancellationPolicyType: editPropCancellationPolicyType || null,
        // Ruling 112 Q6: NULL = never captured; a typed value is clamped to >=1 by the shared schema.
        minStayNights: editPropMinStay.trim() === "" ? null : Number(editPropMinStay),
      });
      return res.json();
    },
    onSuccess: (data: Property) => {
      invalidatePropertyQueries();
      setPropertyEditorTarget((prev) => (prev ? { ...prev, ...data, rooms: prev.rooms } : prev));
      toast({ title: "Property details updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update property details",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  function addAmenity() {
    const value = amenityDraft.trim();
    if (!value || editPropAmenities.includes(value)) {
      setAmenityDraft("");
      return;
    }
    setEditPropAmenities((prev) => [...prev, value]);
    setAmenityDraft("");
  }
  function removeAmenity(value: string) {
    setEditPropAmenities((prev) => prev.filter((a) => a !== value));
  }

  const updateRoomDetailsMutation = useMutation({
    mutationFn: async (roomId: string): Promise<{ reenteredReview?: boolean }> => {
      const draft = roomEdits[roomId];
      const units = parseInt(draft.units, 10);
      const res = await apiRequest("PATCH", `/api/provider/rooms/${roomId}`, {
        roomName: draft.roomName.trim(),
        price: draft.price.trim(),
        ...(Number.isFinite(units) && units > 0 ? { units } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      invalidatePropertyQueries();
      toast({
        title: "Room updated",
        // A3, surfaced honestly: a price change on an APPROVED room pauses its sales pending
        // re-review. The server decides this — the client only reports what it returned.
        description: data?.reenteredReview
          ? "Changing an approved room's price sends it back for review. It won't sell until re-approved."
          : undefined,
      });
    },
    onError: (err) => {
      toast({
        title: "Could not update room",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  // S8 (Gate G2, S8-Q2): per-room guest capacity REUSES partySizeMin/partySizeMax — not on
  // roomPatchSchema, so this rides the generic PATCH /api/provider/services/:id like the
  // property Details step above, scoped to the one room row (never a property row — the room's
  // own id is the target).
  const updateRoomCapacityMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const draft = roomEdits[roomId];
      const min = parseInt(draft.partySizeMin, 10);
      const max = parseInt(draft.partySizeMax, 10);
      const res = await apiRequest("PATCH", `/api/provider/services/${roomId}`, {
        partySizeMin: Number.isFinite(min) ? min : null,
        partySizeMax: Number.isFinite(max) ? max : null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidatePropertyQueries();
      toast({ title: "Room capacity updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update room capacity",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  // Keep the open editor in step with the server after an add/delete room round trip.
  useEffect(() => {
    if (!propertyEditorTarget) return;
    const list = Array.isArray(properties) ? properties : [];
    const fresh = list.find((p) => p.id === propertyEditorTarget.id);
    if (!fresh) return;
    setPropertyEditorTarget((prev) => (prev && prev !== fresh ? { ...prev, rooms: fresh.rooms } : prev));
    setRoomEdits((prev) => {
      const next = { ...prev };
      for (const r of fresh.rooms) {
        if (next[r.id]) continue;
        next[r.id] = {
          roomName: r.serviceName ?? "",
          price: r.price == null ? "" : String(r.price),
          units: r.categoryAttributes?.units != null ? String(r.categoryAttributes.units) : "",
          partySizeMin: r.partySizeMin != null ? String(r.partySizeMin) : "",
          partySizeMax: r.partySizeMax != null ? String(r.partySizeMax) : "",
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  // ── Add a room to an existing (already-created) property ────────────────────
  const [addRoomTarget, setAddRoomTarget] = useState<Property | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPrice, setNewRoomPrice] = useState("");
  const [newRoomUnits, setNewRoomUnits] = useState("");
  const newRoomValid = newRoomName.trim().length > 0 && Number.isFinite(parseFloat(newRoomPrice)) && parseFloat(newRoomPrice) > 0;

  const addRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/provider/properties/${addRoomTarget!.id}/rooms`, {
        roomName: newRoomName.trim(),
        price: newRoomPrice,
        ...(newRoomUnits.trim() ? { units: parseInt(newRoomUnits, 10) } : {}),
      });
      return res.json();
    },
    onSuccess: (data: { propertyReenteredReview?: boolean }) => {
      invalidatePropertyQueries();
      setAddRoomTarget(null);
      toast({
        title: "Room type added — submitted for review",
        description: data.propertyReenteredReview
          ? "Adding a room to an approved property sends it back for review. It won't sell until re-approved."
          : "Publish night availability for this room next.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not add room",
        description: parseApiErrorMessage(err, "Please check the fields and try again."),
        variant: "destructive",
      });
    },
  });

  const roomStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const res = await apiRequest("PATCH", `/api/provider/rooms/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      invalidatePropertyQueries();
      toast({ title: "Room updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update room",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const [roomDeleteTarget, setRoomDeleteTarget] = useState<Room | null>(null);
  const deleteRoomMutation = useMutation({
    mutationFn: async (id: string): Promise<{ propertyReenteredReview?: boolean }> => {
      const res = await apiRequest("DELETE", `/api/provider/rooms/${id}`);
      return res.json();
    },
    onSuccess: (data: { propertyReenteredReview?: boolean }) => {
      invalidatePropertyQueries();
      setRoomDeleteTarget(null);
      toast({
        title: "Room deleted",
        description: data?.propertyReenteredReview
          ? "Removing a room from an approved property sends it back for review."
          : undefined,
      });
    },
    onError: (err) => {
      setRoomDeleteTarget(null);
      toast({
        title: "Could not delete room",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  // ── Night-availability range setup for one room (existing vendor_availability_slots rail) ──
  const [availabilityTarget, setAvailabilityTarget] = useState<Room | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeCapacity, setRangeCapacity] = useState("1");
  const rangeValid = !!rangeStart && !!rangeEnd && rangeEnd > rangeStart;

  const publishRangeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/me/services/${availabilityTarget!.id}/slots/range`, {
        startDate: rangeStart,
        endDate: rangeEnd,
        ...(rangeCapacity.trim() ? { capacity: parseInt(rangeCapacity, 10) } : {}),
      });
      return res.json();
    },
    onSuccess: (data: { created: number; skipped: number }) => {
      setAvailabilityTarget(null);
      toast({
        title: "Availability published",
        description: `${data.created} night${data.created === 1 ? "" : "s"} added${data.skipped > 0 ? `, ${data.skipped} already existed` : ""}.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Could not publish availability",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return (
    <ProviderLayout title="Workstation">
      <div className="p-6 space-y-6">
        {/* ── One-door launcher — transcribed from the ratified provider console design.
            Every "Add New Service" affordance routes here first; this is the only place
            a new listing is born. Page-local teal tokens via .ws-mock. */}
        <div className="ws-mock" data-testid="text-launcher-headline-block">
          <style>{WORKSTATION_MOCK_CSS}</style>

          {/* Heading row — no mock-only callout dots or "Preview as unlocked" button */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 className="ws-screen" data-testid="text-launcher-headline">
                What are you building?
              </h2>
              <p className="ws-screen-sub" style={{ marginBottom: 0 }}>
                Workstation · the single entry point for anything you sell. Pick a shape to
                start; you can change most of it later.
              </p>
            </div>
          </div>

          {/* ── Creation ladder (§17): single service → bundle → property ── */}
          <div className="ws-doortiles" data-testid="grid-product-ladder">
            {/* Rung 1 — single service */}
            <Link href="/provider/services/new">
              <div className="ws-doortile" data-testid="card-ladder-service">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ws-doortile-icon">
                  <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M7 9h10M7 13h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
                <h4>Single service</h4>
                <p>One thing you offer — a session, a walk, a guide, a transfer. Five fields to a saved draft.</p>
                <span className="ws-cta" data-testid="button-ladder-new-service">Start a service →</span>
              </div>
            </Link>

            {/* Rung 2 — bundle: locked until 2+ approved active services */}
            {servicesLoading ? (
              <div className="ws-doortile" data-testid="card-ladder-bundle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ws-doortile-icon">
                  <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M8.5 10V7.5a3.5 3.5 0 017 0V10" stroke="currentColor" strokeWidth="1.7"/>
                </svg>
                <h4>Bundle</h4>
                <p>Two or more of your approved services sold together at one price.</p>
                <Skeleton className="h-4 w-32 mt-3" />
              </div>
            ) : bundleUnlocked ? (
              <button type="button" onClick={openCreate} className="ws-doortile ws-doortile-btn" data-testid="card-ladder-bundle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ws-doortile-icon">
                  <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M8.5 10V7.5a3.5 3.5 0 017 0V10" stroke="currentColor" strokeWidth="1.7"/>
                </svg>
                <h4>Bundle</h4>
                <p>Two or more of your approved services sold together at one price.</p>
                <span className="ws-cta" data-testid="button-ladder-new-bundle">New bundle →</span>
              </button>
            ) : (
              <div className="ws-doortile ws-locked" data-testid="card-ladder-bundle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ws-doortile-icon">
                  <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M8.5 10V7.5a3.5 3.5 0 017 0V10" stroke="currentColor" strokeWidth="1.7"/>
                </svg>
                <h4>Bundle</h4>
                <p>Two or more of your approved services sold together at one price.</p>
                <p className="ws-warnbox" data-testid="text-bundle-locked">
                  Locked. Unlocks when you have 2 approved services — you have{" "}
                  {eligibleComponents.length} approved, {Math.max(0, serviceList.filter(s => s.approvalStatus === "submitted" || s.approvalStatus === "in_review").length)} in review.
                </p>
                <div className="ws-progressbar">
                  <i style={{ width: `${Math.min(100, (eligibleComponents.length / 2) * 100)}%` }} />
                </div>
                <span className="ws-cta" data-testid="text-bundle-progress">
                  {eligibleComponents.length} of 2 approved
                </span>
              </div>
            )}

            {/* Rung 3 — property: fully live (S8/FP-3 closed the spec gap) */}
            <button type="button" onClick={openPropertyCreate} className="ws-doortile ws-doortile-btn" data-testid="card-ladder-property">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ws-doortile-icon">
                <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                <path d="M10 21v-6h4v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
              </svg>
              <h4>Property</h4>
              <p>A room, apartment or house with per-night pricing and room availability.</p>
              <span className="ws-cta" data-testid="button-ladder-new-property">Start a property →</span>
            </button>
          </div>

          <div className="ws-divider" />

          {/* Category tiles — 12 live service categories, each pre-selects and jumps to Basics */}
          <h5 className="ws-grouplabel">Or start from what you do</h5>
          <p className="ws-screen-sub" style={{ marginBottom: 14 }}>
            These are the live service categories. Picking one pre-selects the category and
            jumps straight into the Basics screen.
          </p>
          <div className="ws-cats" data-testid="grid-workstation-categories">
            {inspirationCards.map((card) => (
              <Link
                key={card.slug}
                href={`/provider/services/new?category=${encodeURIComponent(card.slug)}`}
                className="ws-cat"
                data-testid={`card-inspiration-${card.slug.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >
                <b>{card.label}</b>
                <span style={{ fontSize: 11.5, color: "var(--ws-muted)", lineHeight: 1.35, display: "block", marginTop: 2 }}>
                  {card.desc}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Your bundles ──────────────────────────────────────────────────────── */}
        {/* ── Ruling 114: "Ideas for your business" — the standing inspiration surface, on the
            creation area (ruling 113). Personalized: only offerings from the categories this
            provider registered for that they haven't listed; taglines come from the /earn
            catalog rows themselves (nothing invented, §13). Hidden entirely when there is
            nothing honest to suggest. ── */}
        {ideasForBusiness.length > 0 && (
          <section className="mb-8" data-testid="section-ideas-for-business">
            <div className="rounded-lg border bg-white" style={{ borderColor: "var(--console-brand-soft, #CBDAD7)" }}>
              <div className="px-4 py-3 border-b border-console-light flex items-baseline gap-3 flex-wrap">
                <h2 className="text-[15px] font-semibold text-console-darkest">Ideas for your business</h2>
                <span className="text-xs text-console-mid">
                  From the categories you registered — offerings you haven't listed yet.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-4">
                {ideasForBusiness.map((idea) => (
                  <Link
                    key={idea.id}
                    href={`/provider/services/new?offeringTypeKey=${encodeURIComponent(idea.offering_type_key)}`}
                    className="block rounded-md border border-console-light bg-white px-3 py-2.5 hover:border-console-brand transition-colors"
                    data-testid={`idea-${idea.offering_type_key}`}
                  >
                    <p className="text-[10.5px] uppercase tracking-wider font-semibold text-console-mid">
                      {idea.categoryName}
                    </p>
                    <p className="text-[13.5px] font-semibold text-console-darkest mt-0.5">{idea.display_name}</p>
                    {idea.tagline && <p className="text-xs text-console-mid mt-0.5">{idea.tagline}</p>}
                    <p className="text-xs font-medium mt-1.5" style={{ color: "var(--console-brand, #35605A)" }}>
                      Start this →
                    </p>
                  </Link>
                ))}
              </div>
              <p className="px-4 pb-3 text-[11.5px] text-console-mid">
                Suggestions come only from your registered categories and hide once listed — this
                rail disappears when you've listed everything.
              </p>
            </div>
          </section>
        )}

        <section data-testid="section-workstation-bundles">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Your bundles
          </h2>
          {/* FP-2 §13: a ?bundle= deep link naming a bundle this account no longer has says so,
              instead of opening some other bundle or silently doing nothing. */}
          {bundleLinkMiss && (
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              data-testid="notice-bundle-deeplink-miss"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{bundleLinkMiss}</span>
            </div>
          )}
          {bundlesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : bundleList.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No bundles yet"
              body={
                bundleUnlocked
                  ? "Compose two or more of your approved services into one offer — it goes through review before it sells."
                  : `Bundles unlock once you have 2 approved active services (you have ${eligibleComponents.length}).`
              }
              cta={
                bundleUnlocked ? (
                  <Button size="sm" onClick={openCreate} data-testid="button-empty-new-bundle">
                    <Plus className="w-4 h-4 mr-1.5" /> New bundle
                  </Button>
                ) : undefined
              }
              testId="empty-workstation-bundles"
            />
          ) : (
            <div className="space-y-3">
              {bundleList.map((bundle) => {
                const isActive = bundle.status === "active";
                return (
                  <Card
                    key={bundle.id}
                    className={`border border-console-light ${!isActive ? "opacity-60" : ""}`}
                    data-testid={`card-bundle-${bundle.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-console-darkest truncate">
                              {bundle.serviceName}
                            </h3>
                            <Badge variant="outline" className="text-[10px]">
                              Bundle
                            </Badge>
                            {bundle.approvalStatus && <StatusBadge status={bundle.approvalStatus} />}
                            <StatusBadge status={isActive ? "active" : "paused"} />
                          </div>
                          {bundle.description && (
                            <p className="text-sm text-console-mid mt-1 line-clamp-2">
                              {bundle.description}
                            </p>
                          )}
                          {bundle.approvalStatus === "rejected" && bundle.rejectionReason && (
                            <p
                              className="text-xs text-red-600 mt-1"
                              data-testid={`text-bundle-rejection-${bundle.id}`}
                            >
                              Rejected: {bundle.rejectionReason}
                            </p>
                          )}
                          <p className="text-sm font-semibold text-green-600 mt-2">
                            {formatPrice(bundle.price)}
                          </p>
                          <div className="mt-2">
                            <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide mb-1">
                              Includes
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {bundle.components.map((c) => (
                                <Badge
                                  key={c.id}
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1.5"
                                  data-testid={`chip-bundle-component-${bundle.id}-${c.id}`}
                                >
                                  {c.serviceName}
                                  {/* Owner honesty: flag a component that has since left
                                      the sellable state (the server re-verifies at booking). */}
                                  {(c.approvalStatus !== "approved" || c.status !== "active") && (
                                    <span className="ml-1 text-amber-600">
                                      ({c.approvalStatus !== "approved" ? c.approvalStatus : c.status})
                                    </span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(bundle)}
                            data-testid={`button-edit-bundle-${bundle.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                id: bundle.id,
                                status: isActive ? "paused" : "active",
                              })
                            }
                            data-testid={`button-toggle-bundle-${bundle.id}`}
                          >
                            {isActive ? (
                              <>
                                <Pause className="w-4 h-4 mr-1" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-1" /> Activate
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeleteTarget(bundle)}
                            data-testid={`button-delete-bundle-${bundle.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Your properties ───────────────────────────────────────────────────── */}
        <section data-testid="section-workstation-properties">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Your properties
          </h2>
          {/* FP-3 §13: a deep link that names a property/room this account no longer has says so,
              instead of opening some other property or silently doing nothing. */}
          {deepLinkMiss && (
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              data-testid="notice-property-deeplink-miss"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{deepLinkMiss}</span>
            </div>
          )}
          {propertiesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : propertyList.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="No properties yet"
              body="Add an accommodation with one or more room types, each priced per night — it goes through review before it sells."
              cta={
                <Button size="sm" onClick={openPropertyCreate} data-testid="button-empty-new-property">
                  <Plus className="w-4 h-4 mr-1.5" /> New property
                </Button>
              }
              testId="empty-workstation-properties"
            />
          ) : (
            <div className="space-y-3">
              {propertyList.map((property) => {
                const isActive = property.status === "active";
                return (
                  <Card
                    key={property.id}
                    className={`border border-console-light ${!isActive ? "opacity-60" : ""}`}
                    data-testid={`card-property-${property.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-console-darkest truncate">
                              {property.serviceName}
                            </h3>
                            <Badge variant="outline" className="text-[10px]">
                              Property
                            </Badge>
                            {property.approvalStatus && <StatusBadge status={property.approvalStatus} />}
                            <StatusBadge status={isActive ? "active" : "paused"} />
                          </div>
                          {property.location && (
                            <p className="text-xs text-console-mid mt-1">{property.location}</p>
                          )}
                          {property.approvalStatus === "rejected" && property.rejectionReason && (
                            <p
                              className="text-xs text-red-600 mt-1"
                              data-testid={`text-property-rejection-${property.id}`}
                            >
                              Rejected: {property.rejectionReason}
                            </p>
                          )}

                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide">
                                Room types
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => {
                                  setAddRoomTarget(property);
                                  setNewRoomName("");
                                  setNewRoomPrice("");
                                  setNewRoomUnits("");
                                }}
                                data-testid={`button-add-room-${property.id}`}
                              >
                                <Plus className="w-3 h-3 mr-1" /> Add room
                              </Button>
                            </div>
                            {property.rooms.length === 0 ? (
                              <p className="text-xs text-console-mid">No room types yet.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {property.rooms.map((room) => (
                                  <div
                                    key={room.id}
                                    className="flex items-center justify-between gap-2 rounded-md border border-console-light px-2.5 py-1.5"
                                    data-testid={`row-room-${room.id}`}
                                  >
                                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm text-console-darkest truncate">
                                        {room.serviceName}
                                      </span>
                                      <span className="text-xs text-console-mid">
                                        {formatPrice(room.price)} / night
                                      </span>
                                      {room.approvalStatus && <StatusBadge status={room.approvalStatus} />}
                                      <StatusBadge status={room.status === "active" ? "active" : "paused"} />
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {/* FP-3: the room's Edit — the property's editor, Rooms step. */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => openPropertyEditor(property, "rooms", room.id)}
                                        data-testid={`button-edit-room-${room.id}`}
                                      >
                                        <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setAvailabilityTarget(room);
                                          setRangeStart("");
                                          setRangeEnd("");
                                          setRangeCapacity(
                                            room.categoryAttributes?.units
                                              ? String(room.categoryAttributes.units)
                                              : "1",
                                          );
                                        }}
                                        data-testid={`button-room-availability-${room.id}`}
                                      >
                                        <CalendarRange className="w-3.5 h-3.5 mr-1" /> Availability
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        disabled={roomStatusMutation.isPending}
                                        onClick={() =>
                                          roomStatusMutation.mutate({
                                            id: room.id,
                                            status: room.status === "active" ? "paused" : "active",
                                          })
                                        }
                                        data-testid={`button-toggle-room-${room.id}`}
                                      >
                                        {room.status === "active" ? (
                                          <Pause className="w-3.5 h-3.5" />
                                        ) : (
                                          <Play className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                                        onClick={() => setRoomDeleteTarget(room)}
                                        data-testid={`button-delete-room-${room.id}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                          {/* FP-3: the property's own Edit — Catalog's property card links to
                              this same surface at its Basics step. */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPropertyEditor(property, "basics")}
                            data-testid={`button-edit-property-${property.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={propertyStatusMutation.isPending}
                            onClick={() =>
                              propertyStatusMutation.mutate({
                                id: property.id,
                                status: isActive ? "paused" : "active",
                              })
                            }
                            data-testid={`button-toggle-property-${property.id}`}
                          >
                            {isActive ? (
                              <>
                                <Pause className="w-4 h-4 mr-1" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-1" /> Activate
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            disabled={deletePropertyMutation.isPending}
                            onClick={() => setPropertyDeleteTarget(property)}
                            data-testid={`button-delete-property-${property.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Property builder dialog (create) ──────────────────────────────────── */}
        <Dialog open={propertyBuilderOpen} onOpenChange={(open) => !open && setPropertyBuilderOpen(false)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-property-builder">
            <DialogHeader>
              <DialogTitle>New property</DialogTitle>
              <DialogDescription>
                Add the property and at least one room type. Both are reviewed before they sell;
                night availability is set up separately once the property is created.
              </DialogDescription>
            </DialogHeader>

            {/* S-2: the mock's step ladder — 1. The property · 2. Rooms · 3. Review. Forward
                tabs gate on the same validity the footer buttons use; every field keeps its
                testid (the steps sequence the form, they don't change it). */}
            <div className="inline-flex rounded-md border border-console-light overflow-hidden" role="group">
              {(
                [
                  { key: "property", label: "1. The property", enabled: true },
                  { key: "rooms", label: "2. Rooms", enabled: propName.trim().length > 0 },
                  { key: "review", label: "3. Review", enabled: propertyFormValid },
                ] as const
              ).map((step) => (
                <button
                  key={step.key}
                  type="button"
                  disabled={!step.enabled}
                  onClick={() => setPropertyBuilderStep(step.key)}
                  aria-pressed={propertyBuilderStep === step.key}
                  className={
                    "px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed " +
                    (propertyBuilderStep === step.key
                      ? "bg-console-dark text-white"
                      : "bg-white text-console-mid hover:bg-console-light/40")
                  }
                  data-testid={`tab-property-builder-${step.key}`}
                >
                  {step.label}
                </button>
              ))}
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (propertyBuilderStep !== "review" || !propertyFormValid || createPropertyMutation.isPending) return;
                createPropertyMutation.mutate();
              }}
            >
              <div className="space-y-4" hidden={propertyBuilderStep !== "property"}>
              <div>
                <Label htmlFor="property-name" className="text-sm">
                  Property name
                </Label>
                <Input
                  id="property-name"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  maxLength={255}
                  required
                  placeholder="e.g. Machiya Guesthouse Kyoto"
                  data-testid="input-property-name"
                />
              </div>
              <div>
                <Label htmlFor="property-location" className="text-sm">
                  Location (optional)
                </Label>
                <Input
                  id="property-location"
                  value={propLocation}
                  onChange={(e) => setPropLocation(e.target.value)}
                  maxLength={255}
                  placeholder="e.g. Higashiyama, Kyoto"
                  data-testid="input-property-location"
                />
              </div>

              {/* L27-P3: optional precise pin for the property. Rooms inherit it (they sit
                  at the same address). Renders nothing when no Maps key is configured. */}
              <LocationPointPicker
                value={propPoint}
                // Create dialog: nothing is stored yet, so there is no row precision to
                // report — the picker labels a fresh confirm as "Pin placed", not
                // "confirmed on the listing" (§13: don't claim saved state before saving).
                precision={null}
                addressHint={propLocation}
                onChange={setPropPoint}
                label="Pin the property on the map (optional)"
                helpText="Confirming a pin places this property — and its rooms — accurately on planning maps."
                idPrefix="property-location"
              />

              <div>
                <Label htmlFor="property-description" className="text-sm">
                  Description (optional)
                </Label>
                <Textarea
                  id="property-description"
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  rows={3}
                  placeholder="What makes this property worth staying at."
                  data-testid="input-property-description"
                />
              </div>
              </div>

              <div hidden={propertyBuilderStep !== "rooms"}>
                <Label className="text-sm">Room types (at least 1)</Label>
                <div className="mt-2 space-y-3">
                  {roomDrafts.map((draft, idx) => (
                    <div
                      key={draft.key}
                      className="rounded-lg border border-console-light p-3 space-y-2"
                      data-testid={`row-room-draft-${idx}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-console-mid">Room {idx + 1}</span>
                        {roomDrafts.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeRoomDraft(draft.key)}
                            data-testid={`button-remove-room-draft-${idx}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <Input
                        value={draft.roomName}
                        onChange={(e) => updateRoomDraft(draft.key, { roomName: e.target.value })}
                        maxLength={255}
                        placeholder="Room name, e.g. Garden View Double"
                        data-testid={`input-room-draft-name-${idx}`}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draft.price}
                          onChange={(e) => updateRoomDraft(draft.key, { price: e.target.value })}
                          placeholder="Price / night"
                          data-testid={`input-room-draft-price-${idx}`}
                        />
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={draft.units}
                          onChange={(e) => updateRoomDraft(draft.key, { units: e.target.value })}
                          placeholder="Units (optional)"
                          data-testid={`input-room-draft-units-${idx}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={addRoomDraft}
                  data-testid="button-add-room-draft"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add another room type
                </Button>
                <p className="text-xs text-console-mid mt-1">
                  Units is descriptive only — the real per-night capacity is set when you
                  publish night availability after creating the property.
                </p>
              </div>

              {/* S-2: the Review step — a read-back of exactly what one Submit will send,
                  before it is sent. Derived from the same draft state, nothing re-asked. */}
              {propertyBuilderStep === "review" && (
                <div className="space-y-3" data-testid="property-builder-review">
                  <div className="rounded-lg border border-console-light divide-y divide-console-light text-sm">
                    <div className="flex gap-3 px-3 py-2">
                      <span className="w-28 flex-shrink-0 text-console-mid text-xs pt-0.5">Property</span>
                      <span className="font-medium" data-testid="text-review-property-name">{propName.trim() || "—"}</span>
                    </div>
                    <div className="flex gap-3 px-3 py-2">
                      <span className="w-28 flex-shrink-0 text-console-mid text-xs pt-0.5">Location</span>
                      <span data-testid="text-review-property-location">{propLocation.trim() || "Not set"}</span>
                    </div>
                    <div className="flex gap-3 px-3 py-2">
                      <span className="w-28 flex-shrink-0 text-console-mid text-xs pt-0.5">Map pin</span>
                      <span data-testid="text-review-property-pin">
                        {propPoint ? "Pin placed" : "Not placed — optional"}
                      </span>
                    </div>
                    <div className="flex gap-3 px-3 py-2">
                      <span className="w-28 flex-shrink-0 text-console-mid text-xs pt-0.5">Description</span>
                      <span className="min-w-0 break-words" data-testid="text-review-property-description">
                        {propDescription.trim() || "Not set"}
                      </span>
                    </div>
                    <div className="flex gap-3 px-3 py-2">
                      <span className="w-28 flex-shrink-0 text-console-mid text-xs pt-0.5">
                        Rooms ({roomDrafts.length})
                      </span>
                      <span className="min-w-0 flex-1">
                        {roomDrafts.map((r, idx) => (
                          <span key={r.key} className="block" data-testid={`text-review-room-${idx}`}>
                            {r.roomName.trim() || `Room ${idx + 1}`} · ${r.price || "?"} / night
                            {r.units.trim() ? ` · ${r.units} unit${r.units.trim() === "1" ? "" : "s"}` : ""}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-console-mid">
                    The property and each room are reviewed before they sell (born submitted, never
                    live on save). Night availability is published afterwards on Catalog →
                    Availability — nothing is bookable until it exists.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPropertyBuilderOpen(false)}
                  data-testid="button-property-cancel"
                >
                  Cancel
                </Button>
                {propertyBuilderStep !== "property" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setPropertyBuilderStep(propertyBuilderStep === "review" ? "rooms" : "property")
                    }
                    data-testid="button-property-back"
                  >
                    ← Back
                  </Button>
                )}
                {propertyBuilderStep === "property" && (
                  <Button
                    type="button"
                    disabled={propName.trim().length === 0}
                    onClick={() => setPropertyBuilderStep("rooms")}
                    data-testid="button-property-next"
                  >
                    Next: Rooms →
                  </Button>
                )}
                {propertyBuilderStep === "rooms" && (
                  <Button
                    type="button"
                    disabled={!propertyFormValid}
                    onClick={() => setPropertyBuilderStep("review")}
                    data-testid="button-property-next"
                  >
                    Next: Review →
                  </Button>
                )}
                {propertyBuilderStep === "review" && (
                  <Button
                    type="submit"
                    disabled={!propertyFormValid || createPropertyMutation.isPending}
                    data-testid="button-property-submit"
                  >
                    {createPropertyMutation.isPending ? "Saving…" : "Submit for review"}
                  </Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── FP-3: property editor (Basics + Rooms) ────────────────────────────── */}
        <Dialog
          open={!!propertyEditorTarget}
          onOpenChange={(open) => {
            if (!open) {
              setPropertyEditorTarget(null);
              setFocusRoomId(null);
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-property-editor">
            <DialogHeader>
              <DialogTitle>Edit property</DialogTitle>
              <DialogDescription>
                {propertyEditorTarget?.serviceName} — a property and its room types are edited
                together here. Rooms have no delivery method or service checklist of their own:
                they inherit the property's location and are priced per night.
              </DialogDescription>
            </DialogHeader>

            {/* The three steps. A room's Edit lands directly on "Rooms". */}
            <div className="inline-flex rounded-md border border-console-light overflow-hidden" role="group">
              {(["basics", "details", "rooms"] as const).map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setPropertyEditorStep(step)}
                  aria-pressed={propertyEditorStep === step}
                  className={
                    "px-3 py-1.5 text-xs font-medium transition-colors " +
                    (propertyEditorStep === step
                      ? "bg-console-dark text-white"
                      : "bg-white text-console-mid hover:bg-console-light/40")
                  }
                  data-testid={`tab-property-editor-${step}`}
                >
                  {/* Same vocabulary as the ratified mock's property builder steps. */}
                  {step === "basics" ? "The property" : step === "details" ? "Details" : `Rooms (${propertyEditorTarget?.rooms.length ?? 0})`}
                </button>
              ))}
            </div>

            {propertyEditorStep === "basics" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editPropName.trim() || updatePropertyBasicsMutation.isPending) return;
                  updatePropertyBasicsMutation.mutate();
                }}
                data-testid="form-property-editor-basics"
              >
                <div>
                  <Label htmlFor="edit-property-name" className="text-sm">Property name</Label>
                  <Input
                    id="edit-property-name"
                    value={editPropName}
                    onChange={(e) => setEditPropName(e.target.value)}
                    maxLength={255}
                    required
                    data-testid="input-edit-property-name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-property-location" className="text-sm">Location</Label>
                  <Input
                    id="edit-property-location"
                    value={editPropLocation}
                    onChange={(e) => setEditPropLocation(e.target.value)}
                    maxLength={255}
                    data-testid="input-edit-property-location"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-property-description" className="text-sm">Description</Label>
                  <Textarea
                    id="edit-property-description"
                    value={editPropDescription}
                    onChange={(e) => setEditPropDescription(e.target.value)}
                    rows={3}
                    data-testid="input-edit-property-description"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!editPropName.trim() || updatePropertyBasicsMutation.isPending}
                    data-testid="button-save-property-basics"
                  >
                    {updatePropertyBasicsMutation.isPending ? "Saving…" : "Save basics"}
                  </Button>
                </div>
              </form>
            ) : propertyEditorStep === "details" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (updatePropertyDetailsMutation.isPending) return;
                  updatePropertyDetailsMutation.mutate();
                }}
                data-testid="form-property-editor-details"
              >
                <div>
                  <Label htmlFor="edit-property-cover-image" className="text-sm">Cover photo URL</Label>
                  <Input
                    id="edit-property-cover-image"
                    value={editPropServiceImage}
                    onChange={(e) => setEditPropServiceImage(e.target.value)}
                    placeholder="https://…"
                    data-testid="input-edit-property-cover-image"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-property-gallery" className="text-sm">Gallery photo URLs (one per line)</Label>
                  <Textarea
                    id="edit-property-gallery"
                    value={editPropGalleryImages}
                    onChange={(e) => setEditPropGalleryImages(e.target.value)}
                    rows={3}
                    placeholder={"https://…\nhttps://…"}
                    data-testid="input-edit-property-gallery"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="edit-property-checkin" className="text-sm">Check-in time</Label>
                    <Input
                      id="edit-property-checkin"
                      type="time"
                      value={editPropCheckInTime}
                      onChange={(e) => setEditPropCheckInTime(e.target.value)}
                      data-testid="input-edit-property-checkin"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-property-checkout" className="text-sm">Check-out time</Label>
                    <Input
                      id="edit-property-checkout"
                      type="time"
                      value={editPropCheckOutTime}
                      onChange={(e) => setEditPropCheckOutTime(e.target.value)}
                      data-testid="input-edit-property-checkout"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-property-min-stay" className="text-sm">Minimum stay</Label>
                    <Input
                      id="edit-property-min-stay"
                      type="number"
                      min={1}
                      max={365}
                      value={editPropMinStay}
                      onChange={(e) => setEditPropMinStay(e.target.value)}
                      placeholder="nights"
                      data-testid="input-edit-property-min-stay"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-property-house-rules" className="text-sm">House rules</Label>
                  <Textarea
                    id="edit-property-house-rules"
                    value={editPropHouseRules}
                    onChange={(e) => setEditPropHouseRules(e.target.value)}
                    rows={3}
                    placeholder="No smoking, quiet hours after 22:00…"
                    data-testid="input-edit-property-house-rules"
                  />
                  <p className="text-xs text-console-mid mt-1">
                    Property-level only — rooms inherit these, there is no per-room override.
                  </p>
                </div>
                <div>
                  <Label className="text-sm">Amenities</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2" data-testid="list-edit-property-amenities">
                    {editPropAmenities.map((a) => (
                      <Badge key={a} variant="secondary" className="text-xs gap-1" data-testid={`badge-edit-amenity-${a}`}>
                        {a}
                        <button
                          type="button"
                          onClick={() => removeAmenity(a)}
                          aria-label={`Remove ${a}`}
                          data-testid={`button-remove-amenity-${a}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={amenityDraft}
                      onChange={(e) => setAmenityDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAmenity();
                        }
                      }}
                      placeholder="WiFi, Kitchen, Parking…"
                      data-testid="input-add-amenity"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addAmenity} data-testid="button-add-amenity">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="edit-property-cancellation-type" className="text-sm">Cancellation policy</Label>
                    <select
                      id="edit-property-cancellation-type"
                      value={editPropCancellationPolicyType}
                      onChange={(e) => setEditPropCancellationPolicyType(e.target.value)}
                      className="w-full h-9 rounded-md border border-console-light bg-white px-2 text-sm"
                      data-testid="select-edit-property-cancellation-type"
                    >
                      <option value="">Not declared — no policy shown to travelers</option>
                      {/* Ruling 112 Q6: the windows below are the ENFORCED schedule
                          (cancellation-policy.service.ts), phrased for a stay — never the
                          mock's illustrative numbers (§13). */}
                      <option value="flexible">Flexible — full refund until 24 h before check-in</option>
                      <option value="moderate">Moderate — full refund up to 5 days before check-in; 50% up to 48 h</option>
                      <option value="strict">Strict — 50% refund up to 7 days before check-in; none after</option>
                      <option value="non_refundable">Non-refundable — no automatic refund</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="edit-property-cancellation-detail" className="text-sm">Detail (optional)</Label>
                    <Input
                      id="edit-property-cancellation-detail"
                      value={editPropCancellationPolicy}
                      onChange={(e) => setEditPropCancellationPolicy(e.target.value)}
                      placeholder="Full refund if cancelled 48h before"
                      data-testid="input-edit-property-cancellation-detail"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updatePropertyDetailsMutation.isPending}
                    data-testid="button-save-property-details"
                  >
                    {updatePropertyDetailsMutation.isPending ? "Saving…" : "Save details"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3" data-testid="panel-property-editor-rooms">
                {(propertyEditorTarget?.rooms.length ?? 0) === 0 ? (
                  <p className="text-xs text-console-mid">No room types yet.</p>
                ) : (
                  propertyEditorTarget!.rooms.map((room) => {
                    const draft = roomEdits[room.id] ?? { roomName: "", price: "", units: "", partySizeMin: "", partySizeMax: "" };
                    const priceValue = parseFloat(draft.price);
                    const draftValid = draft.roomName.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0;
                    return (
                      <div
                        key={room.id}
                        className={
                          "rounded-lg border p-3 space-y-2 " +
                          (focusRoomId === room.id
                            ? "border-primary ring-1 ring-primary/30"
                            : "border-console-light")
                        }
                        data-testid={`editor-room-${room.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-console-mid">Room type</span>
                          {room.approvalStatus && <StatusBadge status={room.approvalStatus} />}
                          <StatusBadge status={room.status === "active" ? "active" : "paused"} />
                        </div>
                        <Input
                          value={draft.roomName}
                          onChange={(e) =>
                            setRoomEdits((prev) => ({ ...prev, [room.id]: { ...draft, roomName: e.target.value } }))
                          }
                          maxLength={255}
                          placeholder="Room name"
                          data-testid={`input-edit-room-name-${room.id}`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={draft.price}
                            onChange={(e) =>
                              setRoomEdits((prev) => ({ ...prev, [room.id]: { ...draft, price: e.target.value } }))
                            }
                            placeholder="Price / night"
                            data-testid={`input-edit-room-price-${room.id}`}
                          />
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={draft.units}
                            onChange={(e) =>
                              setRoomEdits((prev) => ({ ...prev, [room.id]: { ...draft, units: e.target.value } }))
                            }
                            placeholder="Units (optional)"
                            data-testid={`input-edit-room-units-${room.id}`}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!draftValid || updateRoomDetailsMutation.isPending}
                            onClick={() => updateRoomDetailsMutation.mutate(room.id)}
                            data-testid={`button-save-room-${room.id}`}
                          >
                            {updateRoomDetailsMutation.isPending ? "Saving…" : "Save room"}
                          </Button>
                        </div>
                        {/* S8-Q2: per-room guest capacity REUSES partySizeMin/partySizeMax —
                            a separate save, since these ride the generic services PATCH rather
                            than roomPatchSchema (§14/§18/§19 don't apply; ordinary listing fact). */}
                        <div className="pt-2 border-t border-console-light/60">
                          <span className="text-xs font-medium text-console-mid">Sleeps</span>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.partySizeMin}
                              onChange={(e) =>
                                setRoomEdits((prev) => ({ ...prev, [room.id]: { ...draft, partySizeMin: e.target.value } }))
                              }
                              placeholder="Min guests"
                              data-testid={`input-edit-room-party-min-${room.id}`}
                            />
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.partySizeMax}
                              onChange={(e) =>
                                setRoomEdits((prev) => ({ ...prev, [room.id]: { ...draft, partySizeMax: e.target.value } }))
                              }
                              placeholder="Max guests"
                              data-testid={`input-edit-room-party-max-${room.id}`}
                            />
                          </div>
                          <div className="flex justify-end mt-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={updateRoomCapacityMutation.isPending}
                              onClick={() => updateRoomCapacityMutation.mutate(room.id)}
                              data-testid={`button-save-room-capacity-${room.id}`}
                            >
                              {updateRoomCapacityMutation.isPending ? "Saving…" : "Save capacity"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <p className="text-xs text-console-mid">
                  Changing an approved room's price sends that room back for review. Night
                  availability and adding or removing room types are on the property card.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Add-room dialog (existing property) ───────────────────────────────── */}
        <Dialog open={!!addRoomTarget} onOpenChange={(open) => !open && setAddRoomTarget(null)}>
          <DialogContent className="max-w-md" data-testid="dialog-add-room">
            <DialogHeader>
              <DialogTitle>Add a room type</DialogTitle>
              <DialogDescription>
                {addRoomTarget?.serviceName} — the new room is reviewed before it sells. If the
                property is already approved, adding a room sends it back for review too.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newRoomValid || addRoomMutation.isPending) return;
                addRoomMutation.mutate();
              }}
            >
              <Input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                maxLength={255}
                placeholder="Room name"
                data-testid="input-new-room-name"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={newRoomPrice}
                  onChange={(e) => setNewRoomPrice(e.target.value)}
                  placeholder="Price / night"
                  data-testid="input-new-room-price"
                />
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={newRoomUnits}
                  onChange={(e) => setNewRoomUnits(e.target.value)}
                  placeholder="Units (optional)"
                  data-testid="input-new-room-units"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAddRoomTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!newRoomValid || addRoomMutation.isPending} data-testid="button-add-room-submit">
                  {addRoomMutation.isPending ? "Saving…" : "Add room"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Night-availability range dialog (one room) ────────────────────────── */}
        <Dialog open={!!availabilityTarget} onOpenChange={(open) => !open && setAvailabilityTarget(null)}>
          <DialogContent className="max-w-md" data-testid="dialog-room-availability">
            <DialogHeader>
              <DialogTitle>Publish night availability</DialogTitle>
              <DialogDescription>
                {availabilityTarget?.serviceName} — every night in this range becomes bookable
                with the capacity below. Dates already published are left untouched.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!rangeValid || publishRangeMutation.isPending) return;
                publishRangeMutation.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="range-start" className="text-xs">
                    Check-in from
                  </Label>
                  <Input
                    id="range-start"
                    type="date"
                    value={rangeStart}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setRangeStart(e.target.value)}
                    data-testid="input-range-start"
                  />
                </div>
                <div>
                  <Label htmlFor="range-end" className="text-xs">
                    Through
                  </Label>
                  <Input
                    id="range-end"
                    type="date"
                    value={rangeEnd}
                    min={rangeStart || new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    data-testid="input-range-end"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="range-capacity" className="text-xs">
                  Units available each night
                </Label>
                <Input
                  id="range-capacity"
                  type="number"
                  min="1"
                  step="1"
                  value={rangeCapacity}
                  onChange={(e) => setRangeCapacity(e.target.value)}
                  data-testid="input-range-capacity"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAvailabilityTarget(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!rangeValid || publishRangeMutation.isPending}
                  data-testid="button-publish-range"
                >
                  {publishRangeMutation.isPending ? "Publishing…" : "Publish"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Property delete confirm ────────────────────────────────────────────── */}
        <AlertDialog open={!!propertyDeleteTarget} onOpenChange={(open) => !open && setPropertyDeleteTarget(null)}>
          <AlertDialogContent data-testid="dialog-delete-property">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this property?</AlertDialogTitle>
              <AlertDialogDescription>
                "{propertyDeleteTarget?.serviceName}" will be removed from your catalog. You
                must remove its room types first — a property with rooms can't be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => propertyDeleteTarget && deletePropertyMutation.mutate(propertyDeleteTarget.id)}
                data-testid="button-delete-property-confirm"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Room delete confirm ────────────────────────────────────────────────── */}
        <AlertDialog open={!!roomDeleteTarget} onOpenChange={(open) => !open && setRoomDeleteTarget(null)}>
          <AlertDialogContent data-testid="dialog-delete-room">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this room type?</AlertDialogTitle>
              <AlertDialogDescription>
                "{roomDeleteTarget?.serviceName}" and its published availability will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => roomDeleteTarget && deleteRoomMutation.mutate(roomDeleteTarget.id)}
                data-testid="button-delete-room-confirm"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Bundle builder dialog (create + edit) ─────────────────────────────── */}
        <Dialog open={builderOpen} onOpenChange={(open) => !open && setBuilderOpen(false)}>
          <DialogContent
            className="max-w-lg max-h-[85vh] overflow-y-auto"
            data-testid="dialog-bundle-builder"
          >
            <DialogHeader>
              <DialogTitle>{editingBundle ? "Edit bundle" : "New bundle"}</DialogTitle>
              <DialogDescription>
                {editingBundle
                  ? "Price or component changes to an approved bundle send it back for review."
                  : "Pick at least 2 of your approved services and set one price. New bundles are reviewed before they sell."}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!formValid || mutationBusy) return;
                if (editingBundle) updateMutation.mutate();
                else createMutation.mutate();
              }}
            >
              <div>
                <Label htmlFor="bundle-name" className="text-sm">
                  Bundle name
                </Label>
                <Input
                  id="bundle-name"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  maxLength={255}
                  required
                  placeholder="e.g. Photo shoot + private tour"
                  data-testid="input-bundle-name"
                />
              </div>

              <div>
                <Label htmlFor="bundle-description" className="text-sm">
                  Description (optional)
                </Label>
                <Textarea
                  id="bundle-description"
                  value={bundleDescription}
                  onChange={(e) => setBundleDescription(e.target.value)}
                  rows={3}
                  placeholder="What the traveler gets when they book this bundle."
                  data-testid="input-bundle-description"
                />
              </div>

              <div>
                <Label htmlFor="bundle-price" className="text-sm">
                  Price (USD)
                </Label>
                <Input
                  id="bundle-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  required
                  placeholder="0.00"
                  data-testid="input-bundle-price"
                />
                <p className="text-xs text-console-mid mt-1">
                  You set the bundle's price — component prices below are shown for
                  reference only, nothing is auto-summed.
                </p>
              </div>

              <div>
                <Label className="text-sm">Components (pick at least 2)</Label>
                {droppedOnPrefill.length > 0 && (
                  <p
                    className="text-xs text-amber-700 mt-1"
                    data-testid="text-bundle-prefill-dropped"
                  >
                    No longer approved + active, so not selectable here:{" "}
                    {droppedOnPrefill.join(", ")}. Saving updates the bundle to the
                    services checked below.
                  </p>
                )}
                <div className="mt-2 space-y-2 max-h-56 overflow-y-auto rounded-lg border border-console-light p-3">
                  {eligibleComponents.map((s) => {
                    const price = s.price ?? s.basePrice;
                    const checked = selectedIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2.5 cursor-pointer"
                        data-testid={`row-component-${s.id}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleComponent(s.id, v === true)}
                          data-testid={`checkbox-component-${s.id}`}
                        />
                        <span className="text-sm text-console-darkest flex-1 min-w-0 truncate">
                          {s.serviceName || s.name || "Untitled service"}
                        </span>
                        <span className="text-xs text-console-mid flex-shrink-0">
                          {formatPrice(price)}
                        </span>
                      </label>
                    );
                  })}
                  {/* Only approved+active services are offered — the server enforces the
                      same rule, so the picker never shows an option that would 400. */}
                  {eligibleComponents.length < 2 && (
                    <p className="text-xs text-console-mid" data-testid="text-picker-insufficient">
                      Only {eligibleComponents.length} approved active service
                      {eligibleComponents.length === 1 ? "" : "s"} available — a bundle needs 2.
                    </p>
                  )}
                </div>
                <p className="text-xs text-console-mid mt-1">
                  {selectedIds.length} selected · minimum 2
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBuilderOpen(false)}
                  data-testid="button-bundle-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!formValid || mutationBusy}
                  data-testid="button-bundle-submit"
                >
                  {mutationBusy
                    ? "Saving…"
                    : editingBundle
                      ? "Save changes"
                      : "Submit for review"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ────────────────────────────────────────────────────── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent data-testid="dialog-delete-bundle">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this bundle?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.serviceName}" will be removed from your catalog. The services
                inside it are not deleted — only the bundle listing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                data-testid="button-delete-confirm"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProviderLayout>
  );
}
