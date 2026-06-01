import { useState } from "react";
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
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FeeConfigData {
  id: string;
  category: string;
  platformFeePercent: number;
  expertSharePercent: number;
  aiKeeps100: boolean;
  minFee: number | null;
  maxFee: number | null;
  isActive: boolean;
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
}));

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
        {/* Platform fee % */}
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

        {/* AI booking rule */}
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

        {/* Expert split */}
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

        {/* Min / Max fee caps */}
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

export default function AdminFeeConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: serverConfigs, isLoading } = useQuery<FeeConfigData[]>({
    queryKey: ["/api/admin/fee-config"],
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

  function handleChange(category: string, field: keyof FeeConfigData, value: any) {
    setLocalConfigs(prev => prev.map(c => c.category === category ? { ...c, [field]: value } : c));
  }

  function handleSave(config: FeeConfigData) {
    saveMutation.mutate(config);
  }

  const globalExpertShare = configs[0]?.expertSharePercent ?? 70;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-fee-config">
            <Settings2 className="w-6 h-6 text-primary" />
            Booking Fee Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control platform fees and expert/AI splits per booking category. Changes take effect immediately.
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
  );
}
