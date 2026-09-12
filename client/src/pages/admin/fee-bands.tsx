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

import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
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
import {
  FEE_BAND_RATE_TYPES,
  FEE_BAND_RATE_TYPE_DISPLAY,
  isKnownFeeBandRateType,
  type FeeBandRateType,
} from "@shared/fee-band-display";

interface FeeBandDeactivation {
  allowed: boolean;
  declared: boolean;
  reason: "required_no_fallback" | "fallback_declared" | "not_declared";
  consequence: string;
  owner: string | null;
}

interface FeeBand {
  id: string;
  band_key: string;
  /** Five values since migration 258 — see shared/fee-band-display.ts. NOT narrowed to two here:
   *  the old `"percent" | "flat"` type is what let the page silently drop three of them (V-6). */
  rate_type: string;
  default_rate: number;
  min_rate: number | null;
  max_rate: number | null;
  /** V-4: the DOLLAR cap the resolver applies. NOT max_rate, which bounds the rate. */
  max_amount: number | null;
  display_name: string | null;
  description: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string | null;
  /** V-5: the server's own ruling on switching this band off. Read, never restated here. */
  deactivation: FeeBandDeactivation;
  maxAmountClear: { allowed: boolean; refusal: string | null };
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
  // V-4: "" means NO CAP (NULL), which is a different fact from a cap of 0 and is stored as such.
  const [maxAmount, setMaxAmount] = useState(band.max_amount === null ? "" : String(band.max_amount));
  const [isActive, setIsActive] = useState(band.is_active);

  const display = FEE_BAND_RATE_TYPE_DISPLAY[band.rate_type as FeeBandRateType] ?? null;
  const isPercent = band.rate_type === "percent";
  // The cap applies where a resolver CLAMPS a computed amount, which today is the percent path.
  // It is also shown for any band that already carries one, so an existing cap is never editable
  // nowhere — the V-4 failure mode, one column over.
  const showsCap = isPercent || band.max_amount !== null;
  const parsedCap = maxAmount.trim() === "" ? null : Number(maxAmount);
  const capChanged = parsedCap !== band.max_amount;
  // The server refuses this deactivation (no fallback behind the band) — say so before the click.
  const deactivationBlocked = band.is_active && !band.deactivation.allowed;
  const pendingDeactivation = band.is_active && !isActive;

  const dirty =
    parseFloat(defaultRate) !== band.default_rate ||
    (showsCap && capChanged) ||
    isActive !== band.is_active;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { defaultRate: parseFloat(defaultRate), isActive };
      // Only send the cap when it CHANGED: an omitted field means "leave unchanged", and sending
      // an unchanged null would ask the server to clear a cap the operator never touched.
      if (showsCap && capChanged) body.maxAmount = parsedCap;
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
      setMaxAmount(band.max_amount === null ? "" : String(band.max_amount));
      setIsActive(band.is_active);
    },
  });

  return (
    <div
      className="border border-gray-200 rounded-lg p-4 space-y-3"
      data-testid={`fee-band-row-${band.band_key}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{band.band_key}</code>
          <Badge variant={isPercent ? "default" : "secondary"} className="text-[10px]">
            {band.rate_type}
          </Badge>
          {!band.is_active && <Badge variant="outline" className="text-[10px] text-gray-500">inactive</Badge>}
          {deactivationBlocked && (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300" data-testid={`fee-band-locked-${band.band_key}`}>
              required
            </Badge>
          )}
        </div>
        {band.display_name && (
          <p className="text-sm font-medium text-gray-900">{band.display_name}</p>
        )}
        {band.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{band.description}</p>
        )}
        {(band.min_rate !== null || band.max_rate !== null) && (
          <p className="text-[10px] text-gray-500 mt-1">
            Rate bounds: {band.min_rate ?? "—"} … {band.max_rate ?? "—"}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <Label htmlFor={`rate-${band.band_key}`} className="text-xs text-gray-600">
            {display?.inputLabel ?? "Value"}
          </Label>
          <Input
            id={`rate-${band.band_key}`}
            type="number"
            step={display?.step ?? "0.01"}
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
            className="w-24 text-sm"
            data-testid={`fee-band-rate-${band.band_key}`}
          />
        </div>

        {showsCap && (
          <div className="flex items-center gap-1">
            <Label htmlFor={`cap-${band.band_key}`} className="text-xs text-gray-600">
              Cap $
            </Label>
            <Input
              id={`cap-${band.band_key}`}
              type="number"
              step="0.01"
              min="0"
              placeholder="uncapped"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="w-24 text-sm"
              data-testid={`fee-band-cap-${band.band_key}`}
            />
          </div>
        )}

        <div className="flex items-center gap-1">
          <Switch
            id={`active-${band.band_key}`}
            checked={isActive}
            disabled={deactivationBlocked}
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

      {/* V-5 — the consequence, stated by the SERVER and only rendered here. A band that cannot be
          switched off says so with its reason permanently visible; a band that can says what takes
          over the moment the operator flips the switch, before they press Save. */}
      {(deactivationBlocked || pendingDeactivation) && (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-2.5 flex items-start gap-2" data-testid={`fee-band-consequence-${band.band_key}`}>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900">{band.deactivation.consequence}</p>
        </div>
      )}
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
          <code id={`setting-label-${setting.setting_key}`} className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{setting.setting_key}</code>
          {setting.description && (
            <p id={`setting-desc-${setting.setting_key}`} className="text-xs text-gray-500 mt-1.5 max-w-xl">{setting.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {isPolicy ? (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger
              className="w-48"
              aria-labelledby={`setting-label-${setting.setting_key}`}
              aria-describedby={setting.description ? `setting-desc-${setting.setting_key}` : undefined}
              data-testid={`platform-setting-value-${setting.setting_key}`}
            >
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
            aria-labelledby={`setting-label-${setting.setting_key}`}
            aria-describedby={setting.description ? `setting-desc-${setting.setting_key}` : undefined}
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

  // 3.5 Item 3 — demand suppression floors (R27), READ-ONLY from config (no literals on the client).
  const { data: floors } = useQuery<{
    editable: boolean;
    source: string;
    windowDays: number;
    tiers: { audience: string; floor: number; label: string; scope: string }[];
  }>({ queryKey: ["/api/admin/demand-floors"] });

  // Phase 4 R32 — the recruitment one-pager control (R18 lifted; generation is live). One row per
  // operating market with its qualification + approval state.
  const { toast } = useToast();
  const qc = useQueryClient();
  type OnepagerRow = {
    slug: string; name: string; qualifies: boolean;
    variant: "property-led" | "service-led" | null;
    approved: boolean; approvalKept: boolean; approvedAt: string | null;
  };
  const { data: onePager } = useQuery<{ markets: OnepagerRow[]; templateVersion: number }>({
    queryKey: ["/api/admin/demand/onepager"],
  });
  // Fetch a PDF (POST draft / GET approved) as a blob and open it in a new tab.
  const openOnePagerPdf = async (url: string, method: "GET" | "POST") => {
    try {
      const res = await apiRequest(method, url, method === "POST" ? {} : undefined);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({ title: "One-pager", description: j?.message ?? "Failed to generate", variant: "destructive" });
        return;
      }
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch {
      toast({ title: "One-pager", description: "Failed to generate", variant: "destructive" });
    }
  };
  const approveOnePager = useMutation({
    mutationFn: async (slug: string) => (await apiRequest("POST", `/api/admin/demand/onepager/${slug}/approve`, {})).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/demand/onepager"] }); toast({ title: "One-pager", description: "Approved." }); },
    onError: () => toast({ title: "One-pager", description: "Could not approve.", variant: "destructive" }),
  });
  const withdrawOnePager = useMutation({
    mutationFn: async (slug: string) => (await apiRequest("POST", `/api/admin/demand/onepager/${slug}/withdraw`, {})).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/demand/onepager"] }); toast({ title: "One-pager", description: "Approval withdrawn." }); },
  });

  if (bandsLoading || settingsLoading) {
    return (
      <AdminLayout title="Fee Bands">
        <div className="p-6 text-sm text-gray-500">Loading fee bands…</div>
      </AdminLayout>
    );
  }

  // V-6 — EVERY band renders. The page used to keep two hand-written filters (percent, flat), so
  // the three rate_types migration 258 added — `flat_cents`, `count`, `rule` — appeared NOWHERE,
  // and `concierge:ai_task`, a price the platform charges, was invisible and uneditable. Groups
  // are built from the shared value set (pinned to the DB CHECK), and any row whose rate_type this
  // build does not recognise still renders, in its own honestly-labelled group (§13) — never
  // dropped, which is the exact failure being fixed.
  const allBands = bands ?? [];
  const knownGroups = FEE_BAND_RATE_TYPES.map((rateType) => ({
    rateType: rateType as string,
    display: FEE_BAND_RATE_TYPE_DISPLAY[rateType],
    rows: allBands.filter((b) => b.rate_type === rateType),
  })).filter((g) => g.rows.length > 0);
  const unknownRateTypes = Array.from(
    new Set(allBands.filter((b) => !isKnownFeeBandRateType(b.rate_type)).map((b) => b.rate_type)),
  );

  return (
    <AdminLayout title="Fee Bands">
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <AdminTabNav tabs={[{ label: "Fee Bands", href: "/admin/fee-bands" }, { label: "Category Fees", href: "/admin/category-fees" }]} />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-fee-bands">
          <Layers className="w-6 h-6 text-primary" />
          Fee Bands
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live source of truth for the resolver. Each group below says what its stored number
          means — the unit differs by rate type. "Cap $" is the DOLLAR ceiling the resolver applies
          to a computed amount; blank means uncapped, which is a different setting from a cap of 0.
          A band a charge path cannot survive without cannot be switched off here, and one that can
          says what takes over. Edits are audit-logged and take effect within 60 s.
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

      {/* One card per rate_type the platform actually holds rows for. */}
      {knownGroups.map((group) => (
        <Card className="border-gray-200" key={group.rateType} data-testid={`card-${group.rateType}-bands`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {group.rateType === "percent" ? <Activity className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
              {group.display.groupLabel} ({group.rows.length})
            </CardTitle>
            <p className="text-xs text-gray-500">{group.display.unitNote}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.rows.map((b) => <BandRow key={b.band_key} band={b} />)}
          </CardContent>
        </Card>
      ))}

      {/* A rate_type this build has no label for. It is still SHOWN — the whole point of V-6 is
          that a band the page cannot categorise must not vanish from it. */}
      {unknownRateTypes.map((rateType) => (
        <Card className="border-amber-300" key={`unknown-${rateType}`} data-testid={`card-unknown-bands-${rateType}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Unrecognised rate type: <code className="font-mono text-sm">{rateType}</code>
            </CardTitle>
            <p className="text-xs text-amber-800">
              This build has no unit label for <code>{rateType}</code>, so nothing is claimed about what the
              stored number means. The rows are shown anyway — add the type to
              <code> shared/fee-band-display.ts</code> to label them.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {allBands.filter((b) => b.rate_type === rateType).map((b) => <BandRow key={b.band_key} band={b} />)}
          </CardContent>
        </Card>
      ))}

      {/* 3.5 Item 3 — demand suppression floors (R27). NOT fees — small-sample thresholds, keyed by
          WHO reads the figure. Read-only: config-set, moved only by the decision-maker in code. */}
      {floors && (
        <Card className="border-gray-200" data-testid="card-demand-floors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4" />
              Demand suppression floors (R27)
            </CardTitle>
            <p className="text-xs text-gray-500">
              A demand figure whose sample is below its audience's floor renders as no-data (§13). These
              are NOT fees — they key on WHO reads the figure, not the cell's grain. Config-set
              (<code className="bg-gray-100 px-1 rounded">{floors.source}</code>), moved only by the
              decision-maker; window ±{floors.windowDays} days.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {floors.tiers.map((t) => (
              <div key={t.audience} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2" data-testid={`row-floor-${t.audience}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.scope}</p>
                </div>
                <Badge variant="outline" className="flex-shrink-0" data-testid={`badge-floor-${t.audience}`}>≥ {t.floor}</Badge>
              </div>
            ))}
            <p className="text-[11px] text-gray-400 pt-1">Read-only here — changing a floor is a config change, escalated to the decision-maker (no DB override).</p>
          </CardContent>
        </Card>
      )}

      {/* Phase 4 R32 — recruitment one-pager control. One row per operating market. */}
      <Card data-testid="card-one-pager">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4" />
            Recruitment one-pager
          </CardTitle>
          <p className="text-xs text-gray-500">
            Partner-recruitment one-pager built from cross-partner demand (public floor{" "}
            {floors?.tiers.find((t) => t.audience === "cross_partner")?.floor ?? "—"}). Generate a DRAFT to preview;
            Approve to keep an artifact retrievable. Approval is withdrawn automatically if a market drops below floor or
            the layout changes. Distribution is out of scope — this ends at "an approved PDF exists".
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {(onePager?.markets ?? []).map((m) => (
            <div key={m.slug} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0" data-testid={`onepager-row-${m.slug}`}>
              <div className="w-32 text-sm font-medium">{m.name}</div>
              {!m.qualifies ? (
                <div className="text-xs text-gray-400 flex-1" data-testid={`onepager-nofloor-${m.slug}`}>
                  No figure clears the public floor yet.
                </div>
              ) : (
                <>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{m.variant}</span>
                    {m.approved && m.approvalKept && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-700" data-testid={`onepager-status-${m.slug}`}>Approved</span>
                    )}
                    {m.approved && !m.approvalKept && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" data-testid={`onepager-status-${m.slug}`}>Approval invalid — re-approve</span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openOnePagerPdf(`/api/admin/demand/onepager/${m.slug}/generate`, "POST")} data-testid={`onepager-draft-${m.slug}`}>
                    Draft
                  </Button>
                  {m.approved && m.approvalKept && (
                    <Button variant="outline" size="sm" onClick={() => openOnePagerPdf(`/api/admin/demand/onepager/${m.slug}/pdf`, "GET")} data-testid={`onepager-view-${m.slug}`}>
                      View approved
                    </Button>
                  )}
                  {m.approved ? (
                    <Button variant="ghost" size="sm" onClick={() => withdrawOnePager.mutate(m.slug)} disabled={withdrawOnePager.isPending} data-testid={`onepager-withdraw-${m.slug}`}>
                      Withdraw
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" onClick={() => approveOnePager.mutate(m.slug)} disabled={approveOnePager.isPending} data-testid={`onepager-approve-${m.slug}`}>
                      Approve
                    </Button>
                  )}
                  {m.approved && !m.approvalKept && (
                    <Button variant="default" size="sm" onClick={() => approveOnePager.mutate(m.slug)} disabled={approveOnePager.isPending} data-testid={`onepager-reapprove-${m.slug}`}>
                      Re-approve
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
          {(onePager?.markets ?? []).length === 0 && (
            <p className="text-[11px] text-gray-400">Loading markets…</p>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
