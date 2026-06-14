import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Percent,
  Sparkles,
  UserCheck,
  DollarSign,
  Save,
  RefreshCw,
  Info,
  Settings2,
  Zap,
  Star,
  Trophy,
  Shield,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FeeConfigData {
  id: string;
  category: string;
  platformFeePercent: number;
  expertSharePercent: number;
  aiKeeps100: boolean;
  minFee: number | null;
  maxFee: number | null;
  isActive: boolean;
  insuranceEnabled: boolean;
  insuranceRatePercent: number;
  insuranceAppliesTo: string[];
}

interface OptimizationFeeData {
  id: string;
  complexity_tier: string;
  event_type: string | null;  // CON-A.P2: null = tier-level default, non-null = per-event-type override
  price_cents: number;
  currency: string;
  is_active: boolean;
  is_disabled: boolean;  // CON-A.P2: $0=off semantic per §4.8
  updated_by: string | null;
  updated_at: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  accommodation: { label: "Accommodation", icon: "🏨" },
  activities: { label: "Activities", icon: "🎫" },
  transportation: { label: "Transportation", icon: "🚆" },
  car_rental: { label: "Car Rental", icon: "🚗" },
  flights: { label: "Flights", icon: "✈️" },
  insurance: { label: "Insurance", icon: "🛡️" },
  dining: { label: "Dining", icon: "🍽️" },
  esim: { label: "eSIM", icon: "📶" },
  luggage: { label: "Luggage Storage", icon: "🧳" },
  default: { label: "Default (All Others)", icon: "⚙️" },
};

const DEFAULT_CONFIGS: FeeConfigData[] = Object.keys(CATEGORY_LABELS).map(cat => ({
  id: cat,
  category: cat,
  platformFeePercent: cat === "accommodation" ? 15 : cat === "activities" ? 12 : cat === "transportation" ? 10 : cat === "flights" ? 8 : cat === "insurance" ? 10 : 12,
  expertSharePercent: 70,
  aiKeeps100: true,
  minFee: null,
  maxFee: null,
  isActive: true,
  insuranceEnabled: false,
  insuranceRatePercent: 0,
  insuranceAppliesTo: [],
}));

const OPTIMIZATION_TIER_META: Record<string, { label: string; description: string; Icon: any; color: string }> = {
  simple: {
    label: "Simple",
    description: "Standard vacation, birthday, adventure, or cultural trips",
    Icon: Zap,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  standard: {
    label: "Standard",
    description: "Honeymoon, anniversary, proposal, or multi-city trips",
    Icon: Star,
    color: "text-amber-600 dark:text-amber-400",
  },
  complex: {
    label: "Complex",
    description: "Weddings or corporate events requiring deep logistics",
    Icon: Trophy,
    color: "text-violet-600 dark:text-violet-400",
  },
};

function FeeConfigCard({
  config,
  onChange,
  onSave,
  isSaving,
}: {
  config: FeeConfigData;
  onChange: (field: keyof FeeConfigData, value: any) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const meta = CATEGORY_LABELS[config.category] || { label: config.category, icon: "⚙️" };
  const expertCut = Math.round((config.platformFeePercent * config.expertSharePercent) / 100 * 10) / 10;
  const platformCut = Math.round(config.platformFeePercent * (100 - config.expertSharePercent) / 100 * 10) / 10;

  return (
    <Card className="border-border" data-testid={`card-fee-config-${config.category}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            {meta.label}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.isActive}
              onCheckedChange={v => onChange("isActive", v)}
              data-testid={`switch-active-${config.category}`}
            />
            <span className="text-xs text-muted-foreground">{config.isActive ? "Active" : "Disabled"}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-primary" />
            Platform Booking Fee (% of item cost)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={config.platformFeePercent}
              onChange={e => onChange("platformFeePercent", parseFloat(e.target.value) || 0)}
              className="w-24"
              data-testid={`input-platform-fee-${config.category}`}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-xs font-semibold text-violet-800 dark:text-violet-200">AI books → Platform keeps 100%</span>
            </div>
            <Switch
              checked={config.aiKeeps100}
              onCheckedChange={v => onChange("aiKeeps100", v)}
              data-testid={`switch-ai-keeps-100-${config.category}`}
            />
          </div>
          {config.aiKeeps100 && (
            <p className="text-xs text-violet-700 dark:text-violet-300">
              When AI completes a booking, the full {config.platformFeePercent}% fee stays with Traveloure.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Expert books → Split fee</span>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expert's share of the booking fee (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={config.expertSharePercent}
                onChange={e => onChange("expertSharePercent", parseFloat(e.target.value) || 0)}
                className="w-24"
                data-testid={`input-expert-share-${config.category}`}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="text-center rounded bg-amber-100 dark:bg-amber-900/30 p-2">
              <p className="text-xs text-amber-700 dark:text-amber-300">Expert earns</p>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{expertCut}%</p>
              <p className="text-[10px] text-muted-foreground">of item cost</p>
            </div>
            <div className="text-center rounded bg-amber-100 dark:bg-amber-900/30 p-2">
              <p className="text-xs text-amber-700 dark:text-amber-300">Platform keeps</p>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{platformCut}%</p>
              <p className="text-[10px] text-muted-foreground">of item cost</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Min fee ($)</Label>
            <Input
              type="number"
              min={0}
              placeholder="None"
              value={config.minFee ?? ""}
              onChange={e => onChange("minFee", e.target.value ? parseFloat(e.target.value) : null)}
              data-testid={`input-min-fee-${config.category}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max fee ($)</Label>
            <Input
              type="number"
              min={0}
              placeholder="None"
              value={config.maxFee ?? ""}
              onChange={e => onChange("maxFee", e.target.value ? parseFloat(e.target.value) : null)}
              data-testid={`input-max-fee-${config.category}`}
            />
          </div>
        </div>

        {/* Insurance Tier */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 p-3 space-y-3" data-testid={`card-insurance-tier-${config.category}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">Insurance Tier</span>
            </div>
            <Switch
              checked={config.insuranceEnabled}
              onCheckedChange={v => onChange("insuranceEnabled", v)}
              data-testid={`switch-insurance-enabled-${config.category}`}
            />
          </div>
          {config.insuranceEnabled && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Insurance rate (% of item cost)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={25}
                    step={0.5}
                    value={config.insuranceRatePercent}
                    onChange={e => onChange("insuranceRatePercent", parseFloat(e.target.value) || 0)}
                    className="w-24"
                    data-testid={`input-insurance-rate-${config.category}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="rounded bg-blue-100 dark:bg-blue-900/30 p-2 text-center">
                <p className="text-[10px] text-blue-700 dark:text-blue-300">
                  Added on top of platform fee. Applies to all bookings in this category unless restricted below.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Restrict to booking types (comma-separated, blank = all)</Label>
                <Input
                  type="text"
                  placeholder="e.g. hotel,flight"
                  value={config.insuranceAppliesTo.join(",")}
                  onChange={e => onChange("insuranceAppliesTo", e.target.value ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : [])}
                  data-testid={`input-insurance-applies-to-${config.category}`}
                />
              </div>
            </div>
          )}
          {!config.insuranceEnabled && (
            <p className="text-xs text-blue-600 dark:text-blue-400">Enable to add an insurance component to the platform fee for this category.</p>
          )}
        </div>

        <Button
          size="sm"
          className="w-full gap-2"
          onClick={onSave}
          disabled={isSaving}
          data-testid={`button-save-fee-${config.category}`}
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

function OptimizationFeeCard({
  fee,
  onSave,
  isSaving,
}: {
  fee: OptimizationFeeData;
  onSave: (params: { complexityTier: string; eventType: string | null; priceCents: number; isActive: boolean; isDisabled: boolean }) => void;
  isSaving: boolean;
}) {
  // CON-A.P2: event-type rows show the event-type label; tier rows show the tier meta.
  const isEventRow = fee.event_type !== null;
  const tierMeta = OPTIMIZATION_TIER_META[fee.complexity_tier] || {
    label: fee.complexity_tier,
    description: "",
    Icon: Sparkles,
    color: "text-primary",
  };
  const label = isEventRow ? fee.event_type! : tierMeta.label;
  const description = isEventRow
    ? `Override for ${fee.event_type} (resolves to ${fee.complexity_tier} tier if unset)`
    : tierMeta.description;
  const Icon = tierMeta.Icon;
  const testKey = fee.event_type ?? fee.complexity_tier;
  const [localCents, setLocalCents] = useState(fee.price_cents);
  const [localActive, setLocalActive] = useState(fee.is_active);
  const [localDisabled, setLocalDisabled] = useState(fee.is_disabled);
  const displayPrice = (localCents / 100).toFixed(2);

  return (
    <Card className="border-border" data-testid={`card-optimization-fee-${testKey}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className={`w-5 h-5 ${tierMeta.color}`} />
            {label}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              checked={localActive}
              onCheckedChange={setLocalActive}
              data-testid={`switch-opt-active-${testKey}`}
            />
            <span className="text-xs text-muted-foreground">{localActive ? "Active" : "Hidden"}</span>
          </div>
        </div>
        <CardDescription className="text-xs mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            One-time Optimization Fee
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={displayPrice}
              onChange={e => {
                const dollars = parseFloat(e.target.value) || 0;
                setLocalCents(Math.round(dollars * 100));
              }}
              className="w-28"
              disabled={localDisabled}
              data-testid={`input-opt-fee-${testKey}`}
            />
            <span className="text-xs text-muted-foreground">USD ({localCents}¢)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={localDisabled}
            onCheckedChange={setLocalDisabled}
            data-testid={`switch-opt-disabled-${testKey}`}
          />
          <span className="text-xs text-muted-foreground">
            {localDisabled ? "AI Concierge disabled for this type ($0=off)" : "Charged at the price above"}
          </span>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
          Users pay this once to unlock the full AI optimizer for their itinerary.
          Free re-run within 24 hours of last optimization.
        </div>

        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => onSave({
            complexityTier: fee.complexity_tier,
            eventType: fee.event_type,
            priceCents: localCents,
            isActive: localActive,
            isDisabled: localDisabled,
          })}
          disabled={isSaving}
          data-testid={`button-save-opt-fee-${testKey}`}
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminFeeConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: serverConfigs, isLoading } = useQuery<FeeConfigData[]>({
    queryKey: ["/api/admin/fee-config"],
  });

  const { data: optimizationFees, isLoading: optLoading } = useQuery<OptimizationFeeData[]>({
    queryKey: ["/api/admin/optimization-fees"],
  });

  const [localConfigs, setLocalConfigs] = useState<FeeConfigData[]>(DEFAULT_CONFIGS);
  const configs = serverConfigs || localConfigs;

  const saveMutation = useMutation({
    mutationFn: (config: FeeConfigData) =>
      apiRequest("POST", `/api/admin/fee-config`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-config"] });
      toast({ title: "Saved", description: "Fee configuration updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not update fee config.", variant: "destructive" });
    },
  });

  const saveOptMutation = useMutation({
    mutationFn: (params: { complexityTier: string; eventType: string | null; priceCents: number; isActive: boolean; isDisabled: boolean }) =>
      apiRequest("POST", `/api/admin/optimization-fees`, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/optimization-fees"] });
      toast({ title: "Saved", description: "Optimization fee updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not update optimization fee.", variant: "destructive" });
    },
  });

  function handleChange(category: string, field: keyof FeeConfigData, value: any) {
    setLocalConfigs(prev => prev.map(c => c.category === category ? { ...c, [field]: value } : c));
  }

  function handleSave(config: FeeConfigData) {
    saveMutation.mutate(config);
  }

  const globalExpertShare = configs[0]?.expertSharePercent ?? 70;

  // CON-A.P2: fallback rows match §4.8 defaults — $9.99 standard tier; $49.99 event-type overrides.
  // These are display-only fallbacks; the DB is seeded with the same values by migration 017.
  const defaultOptFees: OptimizationFeeData[] = [
    { id: "simple", complexity_tier: "simple", event_type: null, price_cents: 999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
    { id: "standard", complexity_tier: "standard", event_type: null, price_cents: 999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
    { id: "complex", complexity_tier: "complex", event_type: null, price_cents: 999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
    { id: "wedding", complexity_tier: "complex", event_type: "wedding", price_cents: 4999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
    { id: "proposal", complexity_tier: "standard", event_type: "proposal", price_cents: 4999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
    { id: "corporate", complexity_tier: "complex", event_type: "corporate", price_cents: 4999, currency: "USD", is_active: true, is_disabled: false, updated_by: null, updated_at: null },
  ];
  const displayOptFees = optimizationFees && optimizationFees.length > 0 ? optimizationFees : defaultOptFees;
  const tierDefaults = displayOptFees.filter(f => f.event_type === null);
  const eventOverrides = displayOptFees.filter(f => f.event_type !== null);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Phase 8.1 update: the live editor is now at /admin/fee-bands. This page
          still exists for transitional reasons (and the booking_fee_configs table
          remains as the legacy backing source until Phase 1.3's resolver flip is
          verified in prod), but admin edits made here are no-ops at runtime. */}
      <div
        className="border border-amber-400 bg-amber-50 text-amber-900 rounded-lg p-4 flex items-start gap-3"
        data-testid="banner-fee-config-deprecated"
      >
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
        <div className="text-sm">
          <p className="font-semibold mb-1">Edits on this page are currently inactive.</p>
          <p>
            Phase 1 of the fee architecture migration moved rate resolution to the new{" "}
            <code className="font-mono text-xs bg-amber-100 px-1 rounded">fee_bands</code> table. Saves here write to the legacy{" "}
            <code className="font-mono text-xs bg-amber-100 px-1 rounded">booking_fee_configs</code> table — which the resolver no longer reads.
            To change a live rate, use the new editor at{" "}
            <a
              href="/admin/fee-bands"
              className="font-semibold underline hover:no-underline"
              data-testid="link-to-fee-bands"
            >
              /admin/fee-bands
            </a>.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-fee-config">
            <Settings2 className="w-6 h-6 text-primary" />
            Fee Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control platform fees, expert/AI splits, and AI optimization pricing. Changes take effect immediately.
          </p>
        </div>
        <Badge className="bg-primary/10 text-primary gap-1.5 text-sm px-3 py-1.5" data-testid="badge-global-split">
          <DollarSign className="w-3.5 h-3.5" />
          Default split: Platform {100 - globalExpertShare}% / Expert {globalExpertShare}%
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-xs text-muted-foreground">AI Booking</p>
              <p className="text-lg font-bold text-violet-700 dark:text-violet-300">100% Platform</p>
              <p className="text-xs text-muted-foreground">Platform keeps full fee</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Expert Booking</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">70% Expert</p>
              <p className="text-xs text-muted-foreground">30% stays with platform</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-8 h-8 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Stripe Connect handles the actual payout splits. Platform fee is added on top of the item cost and shown to users in the itinerary fee breakdown.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div>
              <p className="text-xs text-muted-foreground">Stripe Integration</p>
              <p className="text-sm font-semibold text-foreground">Automatic Transfers</p>
              <p className="text-xs text-muted-foreground">via Stripe Connect payouts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Booking Fees */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Booking Fees by Category</h2>
        <p className="text-sm text-muted-foreground mb-4">Per-category platform fee and expert split for regular bookings.</p>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
            <p>Loading fee configuration...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="grid-fee-configs">
            {configs.map(config => (
              <FeeConfigCard
                key={config.category}
                config={config}
                onChange={(field, value) => handleChange(config.category, field, value)}
                onSave={() => handleSave(config)}
                isSaving={saveMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* AI Optimization Fees */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">AI Optimization Fees</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          One-time fee users pay to unlock the full AI itinerary optimizer. Tier is determined by trip complexity.
          Users get a free re-run within 24 hours of their last optimization.
        </p>
        {optLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p>Loading optimization fees...</p>
          </div>
        ) : (
          <div className="space-y-6" data-testid="grid-optimization-fees">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Tier defaults
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tierDefaults.map(fee => (
                  <OptimizationFeeCard
                    key={`tier-${fee.complexity_tier}`}
                    fee={fee}
                    onSave={params => saveOptMutation.mutate(params)}
                    isSaving={saveOptMutation.isPending}
                  />
                ))}
              </div>
            </div>
            {eventOverrides.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Per-event-type overrides ($49.99 default per §4.8)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {eventOverrides.map(fee => (
                    <OptimizationFeeCard
                      key={`event-${fee.event_type}`}
                      fee={fee}
                      onSave={params => saveOptMutation.mutate(params)}
                      isSaving={saveOptMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
