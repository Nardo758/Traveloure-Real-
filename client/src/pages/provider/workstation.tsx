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
 *   - PROPERTY: the honest next rung — per §17 it is a LATER, separately-designed phase
 *     (per-night pricing, room availability, its own money brief). Rendered as a muted,
 *     non-interactive card that says exactly that; no dead button.
 *
 * Money-path honesty: the bundle price entered here is the owner-set listing price like
 * any service create — the checkout charge is server-derived from the stored row (§14).
 * A3 material-change rule: the server drops an APPROVED bundle back to `submitted` when
 * its price or component set changes and returns `reenteredReview: true` — surfaced as a
 * toast so the provider knows their change paused sales pending re-review.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader, EmptyState, StatusBadge } from "@/components/backoffice/primitives";
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

  return (
    <ProviderLayout title="Workstation">
      <div className="p-6 space-y-6">
        <PageHeader
          icon={Wrench}
          title="Workstation"
          subtitle="One door for building what you sell — start with a service, grow into bundles."
          testId="text-workstation-title"
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

          {/* Rung 3 — property: the honest next rung. NOT a dead button — per §17 the
              property shape (per-night pricing, room availability) is a later,
              separately-designed phase with its own money brief. */}
          <Card
            className="border border-dashed border-console-light bg-console-bg/50 opacity-70"
            aria-disabled="true"
            data-testid="card-ladder-property"
          >
            <CardContent className="p-5 flex flex-col h-full">
              <div className="w-10 h-10 rounded-lg bg-console-bg text-console-mid flex items-center justify-center mb-3">
                <BedDouble className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-console-mid">Property</h3>
                <Badge variant="outline" className="text-[10px] text-console-mid">
                  Not yet available
                </Badge>
              </div>
              <p className="text-sm text-console-mid mt-1 flex-1">
                The next rung of the ladder — accommodation with photos, per-night pricing,
                and room availability. It's a later phase and isn't built yet; nothing to
                click here today.
              </p>
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
