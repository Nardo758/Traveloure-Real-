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
 *     and settings seats already use. It edits exactly the fields those two ALREADY-EXISTING
 *     endpoints accept; it adds no field an innkeeper still cannot state (that is the
 *     redesign-gated B9 property-builder scope, deliberately untouched here).
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
  Share2,
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
}

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

export default function ProviderWorkstation() {
  const { toast } = useToast();

  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
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
  type PropertyEditorStep = "basics" | "rooms";
  interface RoomEditDraft { roomName: string; price: string; units: string }

  const [propertyEditorTarget, setPropertyEditorTarget] = useState<Property | null>(null);
  const [propertyEditorStep, setPropertyEditorStep] = useState<PropertyEditorStep>("basics");
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [editPropName, setEditPropName] = useState("");
  const [editPropLocation, setEditPropLocation] = useState("");
  const [editPropDescription, setEditPropDescription] = useState("");
  const [roomEdits, setRoomEdits] = useState<Record<string, RoomEditDraft>>({});
  // §13: a deep link that names a property this account does not have (deleted, or never owned)
  // is SAID so, never silently ignored and never resolved to some other property.
  const [deepLinkMiss, setDeepLinkMiss] = useState<string | null>(null);

  function openPropertyEditor(property: Property, step: PropertyEditorStep, roomId?: string | null) {
    setPropertyEditorTarget(property);
    setPropertyEditorStep(step);
    setFocusRoomId(roomId ?? null);
    setEditPropName(property.serviceName ?? "");
    setEditPropLocation(property.location ?? "");
    setEditPropDescription(property.description ?? "");
    setRoomEdits(
      Object.fromEntries(
        property.rooms.map((r) => [
          r.id,
          {
            roomName: r.serviceName ?? "",
            price: r.price == null ? "" : String(r.price),
            units: r.categoryAttributes?.units != null ? String(r.categoryAttributes.units) : "",
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
        <PageHeader
          icon={Wrench}
          title="Workstation"
          subtitle="One door for building what you sell — start with a service, grow into bundles."
          testId="text-workstation-title"
          actions={
            // Catalog+Distribute (ruling 74, lane D1): the on-ramp into the distribution hub.
            <Link href="/provider/distribute">
              <Button size="sm" variant="outline" data-testid="button-goto-distribute">
                <Share2 className="w-4 h-4 mr-1.5" /> Distribute
              </Button>
            </Link>
          }
        />

        {/* ── The creation ladder (§17): single service → bundle → property ─────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="grid-product-ladder">
          {/* Rung 1 — single service: always available, the existing ServiceForm. */}
          <Card className="border border-console-light" data-testid="card-ladder-service">
            <CardContent className="p-5 flex flex-col h-full">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Plus className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-console-darkest">Single service</h3>
              <p className="text-sm text-console-mid mt-1 flex-1">
                One offering with its own price and availability. Every new service is
                reviewed before it goes live.
              </p>
              <div className="mt-4">
                <Link href="/provider/services/new">
                  <Button size="sm" data-testid="button-ladder-new-service">
                    <Plus className="w-4 h-4 mr-1.5" /> New service
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Rung 2 — bundle: unlocks at 2+ approved+active services (real count, §13). */}
          <Card className="border border-console-light" data-testid="card-ladder-bundle">
            <CardContent className="p-5 flex flex-col h-full">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                  bundleUnlocked ? "bg-primary/10 text-primary" : "bg-console-bg text-console-mid"
                }`}
              >
                <Boxes className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-console-darkest">Bundle</h3>
              <p className="text-sm text-console-mid mt-1 flex-1">
                Compose two or more of your approved services under one price. Bundles are
                reviewed before they sell, like any listing.
              </p>
              <div className="mt-4">
                {servicesLoading ? (
                  <Skeleton className="h-9 w-32" />
                ) : bundleUnlocked ? (
                  <Button size="sm" onClick={openCreate} data-testid="button-ladder-new-bundle">
                    <Plus className="w-4 h-4 mr-1.5" /> New bundle
                  </Button>
                ) : (
                  <div data-testid="text-bundle-locked">
                    <p className="text-xs text-console-mid flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        You have {eligibleComponents.length} approved active service
                        {eligibleComponents.length === 1 ? "" : "s"} — bundles unlock at 2.{" "}
                        <Link href="/provider/services">
                          <span className="underline cursor-pointer text-primary font-medium">
                            Go to Catalog →
                          </span>
                        </Link>
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rung 3 — property (§17 Product Builder, PROPERTY rung): an accommodation
              listing with one or more room types, each priced per night. */}
          <Card className="border border-console-light" data-testid="card-ladder-property">
            <CardContent className="p-5 flex flex-col h-full">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <BedDouble className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-console-darkest">Property</h3>
              <p className="text-sm text-console-mid mt-1 flex-1">
                Accommodation with one or more room types, each priced per night. Properties
                and rooms are reviewed before they sell, like any listing.
              </p>
              <div className="mt-4">
                <Button size="sm" onClick={openPropertyCreate} data-testid="button-ladder-new-property">
                  <Plus className="w-4 h-4 mr-1.5" /> New property
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Your bundles ──────────────────────────────────────────────────────── */}
        <section data-testid="section-workstation-bundles">
          <h2 className="text-sm font-semibold text-console-mid uppercase tracking-wide mb-2">
            Your bundles
          </h2>
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

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!propertyFormValid || createPropertyMutation.isPending) return;
                createPropertyMutation.mutate();
              }}
            >
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

              <div>
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

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPropertyBuilderOpen(false)}
                  data-testid="button-property-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!propertyFormValid || createPropertyMutation.isPending}
                  data-testid="button-property-submit"
                >
                  {createPropertyMutation.isPending ? "Saving…" : "Submit for review"}
                </Button>
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

            {/* The two steps. A room's Edit lands directly on "Rooms". */}
            <div className="inline-flex rounded-md border border-console-light overflow-hidden" role="group">
              {(["basics", "rooms"] as const).map((step) => (
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
                  {step === "basics" ? "The property" : `Rooms (${propertyEditorTarget?.rooms.length ?? 0})`}
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
            ) : (
              <div className="space-y-3" data-testid="panel-property-editor-rooms">
                {(propertyEditorTarget?.rooms.length ?? 0) === 0 ? (
                  <p className="text-xs text-console-mid">No room types yet.</p>
                ) : (
                  propertyEditorTarget!.rooms.map((room) => {
                    const draft = roomEdits[room.id] ?? { roomName: "", price: "", units: "" };
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
