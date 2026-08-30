/**
 * /admin/category-fees — Phase 8.2
 *
 * Editor for the billing-aware attributes of service_categories rows
 * (categoryKey, commissionBandKey, insuranceBand, riskProfile,
 * requiresBackgroundCheck, sourceType, launchTier, affiliatePartnerKey).
 *
 * Lives separate from /admin/categories (which still owns name/slug/icon
 * etc.) so the FEE workstream has a clean surface.
 *
 * Footgun rule (enforced server-side at /api/admin/categories/:id):
 * - commission_band_key must reference an active fee_bands row of
 *   rate_type='percent', OR
 * - explicit NULL is permitted only when platform_settings.default_commission_band_key
 *   is itself set and references an active band.
 * The UI surfaces the same constraint so admins see it before save.
 */

import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Save, Tag, Info } from "lucide-react";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string | null;
  categoryKey: string | null;
  sourceType: string | null;          // 'platform_provider' | 'affiliate' | null
  launchTier: string | null;          // 'core' | 'secondary' | 'segment' | null
  commissionBandKey: string | null;
  insuranceBand: number | null;
  riskProfile: string | null;
  requiresBackgroundCheck: boolean | null;
  affiliatePartnerKey: string | null;
}

interface FeeBand {
  band_key: string;
  rate_type: "percent" | "flat";
  default_rate: number;
  is_active: boolean;
}

interface PlatformSetting {
  setting_key: string;
  setting_value: string;
}

const INHERIT_VALUE = "__inherit__"; // sentinel for explicit inheritance

function CategoryRow({
  cat,
  percentBands,
  defaultBandKey,
}: {
  cat: ServiceCategory;
  percentBands: FeeBand[];
  defaultBandKey: string | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [bandKeyValue, setBandKeyValue] = useState<string>(cat.commissionBandKey ?? INHERIT_VALUE);
  const [insuranceBand, setInsuranceBand] = useState<string>(cat.insuranceBand?.toString() ?? "");
  const [riskProfile, setRiskProfile] = useState<string>(cat.riskProfile ?? "");
  const [requiresBgCheck, setRequiresBgCheck] = useState<boolean>(!!cat.requiresBackgroundCheck);
  const [sourceType, setSourceType] = useState<string>(cat.sourceType ?? "");
  const [launchTier, setLaunchTier] = useState<string>(cat.launchTier ?? "");
  const [categoryKey, setCategoryKey] = useState<string>(cat.categoryKey ?? "");

  const inherit = bandKeyValue === INHERIT_VALUE;
  const effectiveBandKey = inherit ? defaultBandKey : bandKeyValue;
  const effectiveBand = percentBands.find(b => b.band_key === effectiveBandKey);

  const dirty =
    (cat.commissionBandKey ?? INHERIT_VALUE) !== bandKeyValue ||
    (cat.insuranceBand?.toString() ?? "") !== insuranceBand ||
    (cat.riskProfile ?? "") !== riskProfile ||
    !!cat.requiresBackgroundCheck !== requiresBgCheck ||
    (cat.sourceType ?? "") !== sourceType ||
    (cat.launchTier ?? "") !== launchTier ||
    (cat.categoryKey ?? "") !== categoryKey;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        commissionBandKey: inherit ? null : bandKeyValue,
        insuranceBand: insuranceBand === "" ? null : parseInt(insuranceBand, 10),
        riskProfile: riskProfile || null,
        requiresBackgroundCheck: requiresBgCheck,
        sourceType: sourceType || null,
        launchTier: launchTier || null,
        categoryKey: categoryKey || null,
      };
      return apiRequest("PATCH", `/api/admin/categories/${cat.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      toast({ title: "Saved", description: `${cat.name} updated.` });
    },
    onError: (err: any) => {
      // Server validation errors (footgun guards) come back as JSON with { error, message }.
      toast({
        title: "Save failed",
        description: err?.message ?? "Validation failed",
        variant: "destructive",
      });
    },
  });

  // Footgun surface: warn before save if inheritance is selected but the
  // platform default is missing/inactive. Server enforces this too, but
  // showing it in the UI is part of the carry-forward the user flagged.
  const inheritanceBroken = inherit && !defaultBandKey;
  const inheritanceTargetMissing = inherit && defaultBandKey && !percentBands.some(b => b.band_key === defaultBandKey && b.is_active);

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3" data-testid={`category-fee-row-${cat.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{cat.name}</p>
            {cat.slug && (
              <code className="font-mono text-[10px] bg-gray-100 px-1 rounded">{cat.slug}</code>
            )}
            {cat.sourceType && (
              <Badge variant="outline" className="text-[10px]">{cat.sourceType}</Badge>
            )}
            {cat.launchTier && (
              <Badge variant="secondary" className="text-[10px]">{cat.launchTier}</Badge>
            )}
          </div>
        </div>
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          data-testid={`category-fee-save-${cat.id}`}
        >
          <Save className="w-3 h-3 mr-1" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Category key (brief join key)</Label>
          <Input
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
            placeholder="e.g. private_transportation"
            className="text-sm font-mono mt-1"
            data-testid={`category-key-${cat.id}`}
          />
        </div>

        <div>
          <Label className="text-xs">Commission band</Label>
          <Select value={bandKeyValue} onValueChange={setBandKeyValue}>
            <SelectTrigger className="mt-1" data-testid={`commission-band-${cat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT_VALUE}>
                Inherit platform default {defaultBandKey ? `(${defaultBandKey})` : "(unset)"}
              </SelectItem>
              {percentBands.filter(b => b.is_active).map(b => (
                <SelectItem key={b.band_key} value={b.band_key}>
                  {b.band_key} ({(b.default_rate * 100).toFixed(1)}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {effectiveBand && (
            <p className="text-[10px] text-gray-500 mt-1">
              Effective: {effectiveBand.band_key} → {(effectiveBand.default_rate * 100).toFixed(2)}% platform take
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs">Insurance band (1–4)</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={insuranceBand}
            onChange={(e) => setInsuranceBand(e.target.value)}
            placeholder="—"
            className="text-sm mt-1"
            data-testid={`insurance-band-${cat.id}`}
          />
        </div>

        <div>
          <Label className="text-xs">Risk profile</Label>
          <Select value={riskProfile || "__unset__"} onValueChange={(v) => setRiskProfile(v === "__unset__" ? "" : v)}>
            <SelectTrigger className="mt-1" data-testid={`risk-profile-${cat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">— unset —</SelectItem>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="moderate">moderate</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Source type</Label>
          <Select value={sourceType || "__unset__"} onValueChange={(v) => setSourceType(v === "__unset__" ? "" : v)}>
            <SelectTrigger className="mt-1" data-testid={`source-type-${cat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">— unset —</SelectItem>
              <SelectItem value="platform_provider">platform_provider</SelectItem>
              <SelectItem value="affiliate">affiliate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Launch tier</Label>
          <Select value={launchTier || "__unset__"} onValueChange={(v) => setLaunchTier(v === "__unset__" ? "" : v)}>
            <SelectTrigger className="mt-1" data-testid={`launch-tier-${cat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">— unset —</SelectItem>
              <SelectItem value="core">core</SelectItem>
              <SelectItem value="secondary">secondary</SelectItem>
              <SelectItem value="segment">segment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-5">
          <Switch
            id={`bg-check-${cat.id}`}
            checked={requiresBgCheck}
            onCheckedChange={setRequiresBgCheck}
            data-testid={`bg-check-${cat.id}`}
          />
          <Label htmlFor={`bg-check-${cat.id}`} className="text-xs">Requires background check</Label>
        </div>
      </div>

      {(inheritanceBroken || inheritanceTargetMissing) && (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            {inheritanceBroken
              ? "Inheritance selected but platform_settings.default_commission_band_key is unset. This save will be rejected. Pick an explicit band or set a platform default first."
              : `Inheritance selected, but the platform default ("${defaultBandKey}") is not an active percent band. This save will be rejected.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CategoryFeesAdminPage() {
  const { data: categories, isLoading: catsLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/admin/categories"],
  });
  const { data: bands, isLoading: bandsLoading } = useQuery<FeeBand[]>({
    queryKey: ["/api/admin/fee-bands"],
  });
  const { data: settings, isLoading: settingsLoading } = useQuery<PlatformSetting[]>({
    queryKey: ["/api/admin/platform-settings"],
  });

  const percentBands = useMemo(() => (bands ?? []).filter(b => b.rate_type === "percent"), [bands]);
  const defaultBandKey = useMemo(() => {
    const row = (settings ?? []).find(s => s.setting_key === "default_commission_band_key");
    return row?.setting_value ?? null;
  }, [settings]);

  if (catsLoading || bandsLoading || settingsLoading) {
    return (
      <AdminLayout title="Category Fees">
        <div className="p-6 text-sm text-gray-500">Loading…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Category Fees">
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <AdminTabNav tabs={[{ label: "Fee Bands", href: "/admin/fee-bands" }, { label: "Category Fees", href: "/admin/category-fees" }]} />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-category-fees">
          <Tag className="w-6 h-6 text-primary" />
          Category Fee Attributes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Edit the billing-aware fields per service category: commission band,
          insurance tier, risk profile. Resolver picks these up via the tiered
          provider-commission policy. Edits are audit-logged.
        </p>
      </div>

      <div className="border border-blue-300 bg-blue-50 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-900">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Footgun guard.</strong> Every category must resolve to a real band:
          either an explicit <code>commission_band_key</code> or inheritance from
          <code> platform_settings.default_commission_band_key</code> (currently{" "}
          <code>{defaultBandKey ?? "unset"}</code>). Saves that would leave a category
          unpriced are rejected at the server.
        </p>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-base">{categories?.length ?? 0} categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(categories ?? []).map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              percentBands={percentBands}
              defaultBandKey={defaultBandKey}
            />
          ))}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
