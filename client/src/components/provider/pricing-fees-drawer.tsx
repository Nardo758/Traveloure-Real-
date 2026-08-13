/**
 * PricingFeesDrawer — Wave 2 / lane S4 ("money out of creation"), ledger row 99.
 *
 * The post-creation home for everything money-shaped that used to sit in the create/edit wizard
 * beyond the one price asked at Basics: travel-surcharge mode + amounts (all four modes, B1/ruling
 * 81), deposit/partial-payment config (Lane 7, ruling 72), and the cancellation policy (type +
 * free-text details). MOVED, not duplicated — `ServiceForm.tsx`'s "Getting there" and "Booking
 * Terms" cards no longer render these controls at all; this drawer is now their only home.
 *
 * Opens from S2's listing home (`/provider/services/:id/edit`, view-mode), a "Pricing & fees" card
 * placed beside the derived checklist — never inside it: none of the three moved fields is in
 * `service-form-required.ts`'s `buildRequiredItems` (verified before this lane moved anything), so
 * nothing here is required-for-final and the checklist's required set is untouched by this lane.
 *
 * WRITES THROUGH THE EXISTING RAILS ONLY (§19 allowlist posture — no new endpoint, no schema
 * change): `PATCH /api/provider/services/:id` (the same `insertProviderServiceSchema.partial()`
 * body the wizard's own save already sent for these fields) and, zones mode only, the existing
 * owner-gated child-row replace-list `PUT /api/provider/services/:id/surcharge-tiers`
 * (ruling 81/B1's own rail — unchanged). No `fee_bands`, no commission/split/rate field is shown or
 * settable here (§18) — `revenueShareRate` stays omitted from the schema and this component never
 * reads or writes it. Platform commission is resolved server-side from the provider's category, not
 * typed into this form — the same posture the ratified mock states verbatim.
 *
 * The pure hydrate/patch-building logic lives in `client/src/lib/pricing-fees.ts` so it can be unit
 * tested without a DOM (same split `service-form-required.ts` uses for the checklist).
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2 } from "lucide-react";
import {
  CANCELLATION_POLICY_TYPE_OPTIONS,
  buildPricingFeesPatch,
  buildSurchargeTiersPayload,
  pricingFeesFromService,
  type PricingFeesState,
} from "@/lib/pricing-fees";

interface PricingFeesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  /** True only for a place-anchored listing that has ALSO chosen a pickup provision — the exact
   *  gate the wizard's own surcharge block used (`showLogisticsCapture && pickupProvisionChosen`).
   *  A method/config with nothing to travel to renders no surcharge section at all (§13: absent,
   *  not shown-and-disabled). */
  surchargeApplicable: boolean;
  /** Read-only display line — set at creation (step 1) and edited on the listing itself, never
   *  here (this drawer never carries a `price` field in its PATCH body). */
  basePriceLabel: string;
  /** The fetched `GET /api/provider/services/:id` row — hydration source. */
  service: Record<string, unknown> | null | undefined;
  /** The fetched `GET /api/provider/services/:id/surcharge-tiers` child rows. */
  surchargeTiers: ReadonlyArray<{ radiusKm: unknown; fee: unknown }> | null | undefined;
}

export function PricingFeesDrawer({
  open,
  onOpenChange,
  serviceId,
  surchargeApplicable,
  basePriceLabel,
  service,
  surchargeTiers,
}: PricingFeesDrawerProps) {
  const { toast } = useToast();
  const [state, setState] = useState<PricingFeesState>(() => pricingFeesFromService(service, surchargeTiers));

  // Re-hydrate every time the drawer opens — never on background refetches while it's closed, so
  // an in-progress edit is never clobbered by an unrelated query invalidation elsewhere on the page.
  useEffect(() => {
    if (open) setState(pricingFeesFromService(service, surchargeTiers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof PricingFeesState>(key: K, value: PricingFeesState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/provider/services/${serviceId}`, buildPricingFeesPatch(state));
      // The zones-mode rings are CHILD ROWS (service_surcharge_tiers), same as the wizard's own
      // save — a second write, on the SAME existing rail (ruling 81/B1), only when that mode is on.
      if (state.surchargeMode === "zones") {
        await apiRequest(
          "PUT",
          `/api/provider/services/${serviceId}/surcharge-tiers`,
          buildSurchargeTiersPayload(state.surchargeTiers),
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services", serviceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services", serviceId, "surcharge-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Pricing & fees saved" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save",
        description: err?.message || "Unknown error — reopen this drawer and try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !saveMutation.isPending && onOpenChange(v)}>
      <SheetContent className="overflow-y-auto sm:max-w-md" data-testid="drawer-pricing-fees">
        <SheetHeader>
          <SheetTitle>Pricing &amp; fees</SheetTitle>
          <SheetDescription>
            Tune later — none of this is required to go live. Your listing already has a price;
            everything here is an adjustment on top of it.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div>
            <Label>Base price</Label>
            <Input value={basePriceLabel} readOnly disabled className="mt-1 bg-muted" data-testid="input-pf-base-price" />
            <p className="text-xs text-muted-foreground mt-1">Set during creation. Edit it on the listing itself.</p>
          </div>

          {surchargeApplicable ? (
            <div className="rounded-md border p-3 space-y-3" data-testid="block-pf-surcharge">
              <Label>Travel surcharge — charge more for a distant pickup?</Label>
              <p className="text-xs text-muted-foreground">
                Optional. When on, a traveler who books with a pickup location outside your area
                pays a travel fee, shown as its own line at checkout. We only ever charge it from
                the real pickup a traveler confirms — never a guess.
              </p>
              <ToggleGroup
                type="single"
                value={state.surchargeMode || "none"}
                onValueChange={(v) => v && set("surchargeMode", v as PricingFeesState["surchargeMode"])}
                variant="outline"
                className="justify-start gap-2 flex-wrap"
                data-testid="segmented-pf-surcharge-mode"
              >
                <ToggleGroupItem value="none" data-testid="toggle-pf-surcharge-none">None</ToggleGroupItem>
                <ToggleGroupItem value="flat" data-testid="toggle-pf-surcharge-flat">Flat fee</ToggleGroupItem>
                <ToggleGroupItem value="zones" data-testid="toggle-pf-surcharge-zones">Zones</ToggleGroupItem>
                <ToggleGroupItem value="per_km" data-testid="toggle-pf-surcharge-per-km">Per km</ToggleGroupItem>
              </ToggleGroup>

              {state.surchargeMode === "flat" && (
                <div data-testid="block-pf-surcharge-flat">
                  <Label htmlFor="pfSurchargeFlatAmount">Flat travel fee ($)</Label>
                  <Input
                    id="pfSurchargeFlatAmount"
                    type="number" min={0} step="0.01" placeholder="e.g. 20.00"
                    value={state.surchargeFlatAmount}
                    onChange={(e) => set("surchargeFlatAmount", e.target.value)}
                    className="mt-1" data-testid="input-pf-surcharge-flat-amount"
                  />
                </div>
              )}

              {state.surchargeMode === "per_km" && (
                <div data-testid="block-pf-surcharge-per-km">
                  <Label htmlFor="pfSurchargePerKm">Rate per km ($)</Label>
                  <Input
                    id="pfSurchargePerKm"
                    type="number" min={0} step="0.01" placeholder="e.g. 1.50"
                    value={state.surchargePerKm}
                    onChange={(e) => set("surchargePerKm", e.target.value)}
                    className="mt-1" data-testid="input-pf-surcharge-per-km"
                  />
                </div>
              )}

              {state.surchargeMode === "zones" && (
                <div className="space-y-2" data-testid="block-pf-surcharge-zones">
                  <p className="text-xs text-muted-foreground">
                    Draw rings from smallest to largest. A pickup pays the fee of the first ring it
                    falls inside. A pickup beyond the largest ring can't book.
                  </p>
                  {state.surchargeTiers.map((tier, i) => (
                    <div key={i} className="flex items-end gap-2" data-testid={`row-pf-surcharge-tier-${i}`}>
                      <div className="flex-1">
                        <Label htmlFor={`pf-tier-radius-${i}`}>Ring {i + 1} radius (km)</Label>
                        <Input
                          id={`pf-tier-radius-${i}`}
                          type="number" min={0} step="0.1"
                          value={tier.radiusKm}
                          onChange={(e) => {
                            const next = [...state.surchargeTiers];
                            next[i] = { ...next[i], radiusKm: e.target.value };
                            set("surchargeTiers", next);
                          }}
                          className="mt-1" data-testid={`input-pf-tier-radius-${i}`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`pf-tier-fee-${i}`}>Fee ($)</Label>
                        <Input
                          id={`pf-tier-fee-${i}`}
                          type="number" min={0} step="0.01"
                          value={tier.fee}
                          onChange={(e) => {
                            const next = [...state.surchargeTiers];
                            next[i] = { ...next[i], fee: e.target.value };
                            set("surchargeTiers", next);
                          }}
                          className="mt-1" data-testid={`input-pf-tier-fee-${i}`}
                        />
                      </div>
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => set("surchargeTiers", state.surchargeTiers.filter((_, j) => j !== i))}
                        data-testid={`button-pf-remove-tier-${i}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => set("surchargeTiers", [...state.surchargeTiers, { radiusKm: "", fee: "" }])}
                    data-testid="button-pf-add-surcharge-tier"
                  >
                    Add a ring
                  </Button>
                </div>
              )}

              {state.surchargeMode !== "none" && (
                <div data-testid="block-pf-surcharge-max-km">
                  <Label htmlFor="pfSurchargeMaxKm">Won't travel beyond (km) — optional</Label>
                  <Input
                    id="pfSurchargeMaxKm"
                    type="number" min={0} placeholder="No limit"
                    value={state.surchargeMaxKm}
                    onChange={(e) => set("surchargeMaxKm", e.target.value)}
                    className="mt-1" data-testid="input-pf-surcharge-max-km"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="note-pf-no-surcharge">
              No travel surcharges for this listing — it either isn't place-anchored, or you haven't
              offered a pickup on the Logistics step yet. There is no radius to travel beyond, so the
              section is absent rather than shown and disabled.
            </div>
          )}

          <div className="rounded-md border p-4 space-y-3" data-testid="block-pf-deposit">
            <label className="flex items-center gap-2 cursor-pointer" htmlFor="pfDepositEnabled">
              <input
                id="pfDepositEnabled"
                type="checkbox"
                checked={state.depositEnabled}
                onChange={(e) => set("depositEnabled", e.target.checked)}
                data-testid="checkbox-pf-deposit-enabled"
              />
              <span className="font-medium">Take a deposit for this listing</span>
            </label>
            <p className="text-xs text-muted-foreground">
              When on, travelers pay a deposit at checkout and the remaining balance in a second
              checkout before a cutoff. Leave off to collect the full price up front.
            </p>
            {state.depositEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pfDepositType">Deposit type</Label>
                  <Select
                    value={state.depositType || undefined}
                    onValueChange={(v) => set("depositType", v as PricingFeesState["depositType"])}
                  >
                    <SelectTrigger id="pfDepositType" className="mt-2" data-testid="select-pf-deposit-type">
                      <SelectValue placeholder="Choose percentage or flat amount" />
                    </SelectTrigger>
                    {/* z-[110] (important): Radix portals SelectContent to document.body at the
                        base component's z-50, which sits BELOW this Sheet's own z-[100] overlay —
                        found by the headless click-through proof, not a code review. Overridden
                        here only (not in the shared select.tsx, which is fine at z-50 everywhere
                        it isn't nested under a Sheet). */}
                    <SelectContent className="!z-[110]">
                      <SelectItem value="percentage">Percentage of the total</SelectItem>
                      <SelectItem value="flat">Flat amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {state.depositType === "percentage" && (
                  <div>
                    <Label htmlFor="pfDepositPercentage">Deposit percentage (%)</Label>
                    <Input
                      id="pfDepositPercentage"
                      type="number" min={1} max={100} placeholder="e.g. 30"
                      value={state.depositPercentage}
                      onChange={(e) => set("depositPercentage", e.target.value)}
                      className="mt-2" data-testid="input-pf-deposit-percentage"
                    />
                  </div>
                )}
                {state.depositType === "flat" && (
                  <div>
                    <Label htmlFor="pfDepositFlatAmount">Deposit amount</Label>
                    <Input
                      id="pfDepositFlatAmount"
                      type="number" min={0} step="0.01" placeholder="e.g. 50.00"
                      value={state.depositFlatAmount}
                      onChange={(e) => set("depositFlatAmount", e.target.value)}
                      className="mt-2" data-testid="input-pf-deposit-flat-amount"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3" data-testid="block-pf-cancellation">
            <div>
              <Label htmlFor="pfCancellationPolicyType">Cancellation Policy</Label>
              <Select
                value={state.cancellationPolicyType || undefined}
                onValueChange={(v) => set("cancellationPolicyType", v)}
              >
                <SelectTrigger id="pfCancellationPolicyType" className="mt-2" data-testid="select-pf-cancellation-policy-type">
                  <SelectValue placeholder="Not declared — no policy shown to travelers" />
                </SelectTrigger>
                {/* z-[110] (important) — same Sheet-vs-Select z-index fix as the deposit-type
                    Select above; see that comment. */}
                <SelectContent className="!z-[110]">
                  {CANCELLATION_POLICY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Shown to travelers as a real per-offering policy. Leave unset if you haven't decided
                — we never show a fabricated default. These windows are applied automatically when a
                traveler cancels; the refund is calculated from the option you pick here.
              </p>
            </div>
            <div>
              <Label htmlFor="pfCancellationPolicy">Cancellation Policy Details (optional)</Label>
              <Textarea
                id="pfCancellationPolicy"
                value={state.cancellationPolicy}
                onChange={(e) => set("cancellationPolicy", e.target.value)}
                placeholder="e.g., Full refund if cancelled 48 hours before. 50% refund if cancelled 24 hours before. No refund within 12 hours."
                rows={3} className="mt-2" data-testid="textarea-pf-cancellation-policy"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground" data-testid="text-pf-commission-note">
            Platform commission is not shown or set here — it is resolved from your category, not
            typed into a form.
          </p>
        </div>

        <SheetFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
            data-testid="button-pf-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-pf-save"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
