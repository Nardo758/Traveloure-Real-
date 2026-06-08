/**
 * /admin/fee-bands — Phase 8.1
 *
 * Live source of truth for the resolver (Phase 1.3+). Replaces /admin/fee-config
 * for runtime billing decisions; that page still exists but writes to the dormant
 * booking_fee_configs table (banner explains the gap).
 *
 * Edits here propagate to live billing within the resolver's 60 s cache TTL.
 * Audit-logged to access_audit_logs on every save.
 *
 * Footgun guards (server-side):
 * - default_rate validated against min/max if either is set.
 * - active_provider_commission_policy must be 'beta_flat' | 'tiered'.
 * - default_commission_band_key must reference an active fee_bands row.
 */

import { useState } from "react";
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
import { AlertTriangle, Save, Settings2, Layers, DollarSign, Activity } from "lucide-react";

interface FeeBand {
  id: string;
  band_key: string;
  rate_type: "percent" | "flat";
  default_rate: number;
  min_rate: number | null;
  max_rate: number | null;
  display_name: string | null;
  description: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

interface PlatformSetting {
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

function BandRow({ band }: { band: FeeBand }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [defaultRate, setDefaultRate] = useState(String(band.default_rate));
  const [isActive, setIsActive] = useState(band.is_active);

  const isPercent = band.rate_type === "percent";
  const dirty =
    parseFloat(defaultRate) !== band.default_rate ||
    isActive !== band.is_active;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { defaultRate: parseFloat(defaultRate), isActive };
      return apiRequest("PATCH", `/api/admin/fee-bands/${band.band_key}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-bands"] });
      toast({ title: "Band saved", description: `${band.band_key} updated. Live within 60 s.` });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
      // Revert UI to server state on failure.
      setDefaultRate(String(band.default_rate));
      setIsActive(band.is_active);
    },
  });

  return (
    <div
      className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      data-testid={`fee-band-row-${band.band_key}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{band.band_key}</code>
          <Badge variant={isPercent ? "default" : "secondary"} className="text-[10px]">
            {band.rate_type}
          </Badge>
          {!band.is_active && <Badge variant="outline" className="text-[10px] text-gray-500">inactive</Badge>}
        </div>
        {band.display_name && (
          <p className="text-sm font-medium text-gray-900">{band.display_name}</p>
        )}
        {band.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{band.description}</p>
        )}
        {(band.min_rate !== null || band.max_rate !== null) && (
          <p className="text-[10px] text-gray-500 mt-1">
            Bounds: {band.min_rate ?? "—"} … {band.max_rate ?? "—"}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Label htmlFor={`rate-${band.band_key}`} className="text-xs text-gray-600">
            {isPercent ? "Rate" : "USD"}
          </Label>
          <Input
            id={`rate-${band.band_key}`}
            type="number"
            step={isPercent ? "0.0001" : "0.01"}
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
            className="w-24 text-sm"
            data-testid={`fee-band-rate-${band.band_key}`}
          />
        </div>

        <div className="flex items-center gap-1">
          <Switch
            id={`active-${band.band_key}`}
            checked={isActive}
            onCheckedChange={setIsActive}
            data-testid={`fee-band-active-${band.band_key}`}
          />
          <Label htmlFor={`active-${band.band_key}`} className="text-xs">
            Active
          </Label>
        </div>

        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          data-testid={`fee-band-save-${band.band_key}`}
        >
          <Save className="w-3 h-3 mr-1" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PolicyToggle({ setting }: { setting: PlatformSetting }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState(setting.setting_value);
  const dirty = value !== setting.setting_value;

  const saveMutation = useMutation({
    mutationFn: async (newValue: string) => {
      return apiRequest("PATCH", `/api/admin/platform-settings/${setting.setting_key}`, {
        settingValue: newValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-settings"] });
      toast({
        title: "Policy updated",
        description: `${setting.setting_key} = ${value}. Live within 60 s.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
      setValue(setting.setting_value);
    },
  });

  const isPolicy = setting.setting_key === "active_provider_commission_policy";

  return (
    <div
      className="border border-gray-200 rounded-lg p-4"
      data-testid={`platform-setting-${setting.setting_key}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{setting.setting_key}</code>
          {setting.description && (
            <p className="text-xs text-gray-500 mt-1.5 max-w-xl">{setting.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {isPolicy ? (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-48" data-testid={`platform-setting-value-${setting.setting_key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beta_flat">beta_flat (current default)</SelectItem>
              <SelectItem value="tiered">tiered (post-beta)</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-72 text-sm"
            data-testid={`platform-setting-value-${setting.setting_key}`}
          />
        )}

        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate(value)}
          data-testid={`platform-setting-save-${setting.setting_key}`}
        >
          <Save className="w-3 h-3 mr-1" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {isPolicy && value === "tiered" && setting.setting_value === "beta_flat" && (
        <div className="mt-3 border border-amber-300 bg-amber-50 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            <strong>Flipping to tiered.</strong> Every provider line item will start
            reading <code>service_categories.commission_band_key</code> instead of the flat
            10 % beta band. Run the prod-snapshot neutrality check first
            (<code>docs/planning/phase1-prod-neutrality-protocol.md</code>) to confirm zero drift.
          </p>
        </div>
      )}
    </div>
  );
}

export default function FeeBandsAdminPage() {
  const { data: bands, isLoading: bandsLoading } = useQuery<FeeBand[]>({
    queryKey: ["/api/admin/fee-bands"],
  });
  const { data: settings, isLoading: settingsLoading } = useQuery<PlatformSetting[]>({
    queryKey: ["/api/admin/platform-settings"],
  });

  if (bandsLoading || settingsLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading fee bands…</div>;
  }

  const percentBands = (bands ?? []).filter((b) => b.rate_type === "percent");
  const flatBands = (bands ?? []).filter((b) => b.rate_type === "flat");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-fee-bands">
          <Layers className="w-6 h-6 text-primary" />
          Fee Bands
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live source of truth for the resolver. Percent bands store the platform
          take as a fraction (0.25 = 25 %). Flat bands store USD. Edits are
          audit-logged and take effect within 60 s.
        </p>
      </div>

      {/* Platform policy settings */}
      <Card className="border-gray-200" data-testid="card-platform-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="w-4 h-4" />
            Platform settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(settings ?? []).map((s) => (
            <PolicyToggle key={s.setting_key} setting={s} />
          ))}
        </CardContent>
      </Card>

      {/* Percent bands */}
      <Card className="border-gray-200" data-testid="card-percent-bands">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" />
            Percent bands ({percentBands.length})
          </CardTitle>
          <p className="text-xs text-gray-500">Platform take as a fraction. expert_standard = 0.25 means platform keeps 25 %.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {percentBands.map((b) => <BandRow key={b.band_key} band={b} />)}
        </CardContent>
      </Card>

      {/* Flat bands */}
      <Card className="border-gray-200" data-testid="card-flat-bands">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4" />
            Flat USD bands ({flatBands.length})
          </CardTitle>
          <p className="text-xs text-gray-500">Stored as dollars. 49.99 = $49.99.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {flatBands.map((b) => <BandRow key={b.band_key} band={b} />)}
        </CardContent>
      </Card>
    </div>
  );
}
