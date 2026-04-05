import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import {
  Settings,
  Percent,
  Zap,
  Save,
  Loader2,
} from "lucide-react";

interface PlatformSettings {
  platform_name: string;
  default_currency: string;
  timezone: string;
  support_email: string;
  expert_commission_min: string;
  expert_commission_max: string;
  provider_commission_min: string;
  provider_commission_max: string;
  ai_recommendations_enabled: string;
  new_registrations_enabled: string;
  travelpulse_enabled: string;
  credit_system_enabled: string;
  affiliate_bookings_enabled: string;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const [general, setGeneral] = useState({
    platform_name: "",
    default_currency: "",
    timezone: "",
    support_email: "",
  });

  const [commissions, setCommissions] = useState({
    expert_commission_min: "",
    expert_commission_max: "",
    provider_commission_min: "",
    provider_commission_max: "",
  });

  const [flags, setFlags] = useState({
    ai_recommendations_enabled: true,
    new_registrations_enabled: true,
    travelpulse_enabled: true,
    credit_system_enabled: true,
    affiliate_bookings_enabled: true,
  });

  useEffect(() => {
    if (!settings) return;
    setGeneral({
      platform_name: settings.platform_name ?? "",
      default_currency: settings.default_currency ?? "",
      timezone: settings.timezone ?? "",
      support_email: settings.support_email ?? "",
    });
    setCommissions({
      expert_commission_min: settings.expert_commission_min ?? "",
      expert_commission_max: settings.expert_commission_max ?? "",
      provider_commission_min: settings.provider_commission_min ?? "",
      provider_commission_max: settings.provider_commission_max ?? "",
    });
    setFlags({
      ai_recommendations_enabled: settings.ai_recommendations_enabled !== "false",
      new_registrations_enabled: settings.new_registrations_enabled !== "false",
      travelpulse_enabled: settings.travelpulse_enabled !== "false",
      credit_system_enabled: settings.credit_system_enabled !== "false",
      affiliate_bookings_enabled: settings.affiliate_bookings_enabled !== "false",
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiRequest("PATCH", "/api/admin/settings", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Settings saved", description: "Platform settings updated successfully." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save settings. Please try again.", variant: "destructive" });
    },
  });

  const handleSaveGeneral = () => {
    saveMutation.mutate({ ...general });
  };

  const handleSaveCommissions = () => {
    const min = parseFloat(commissions.expert_commission_min);
    const max = parseFloat(commissions.expert_commission_max);
    const pMin = parseFloat(commissions.provider_commission_min);
    const pMax = parseFloat(commissions.provider_commission_max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      toast({ title: "Invalid input", description: "Expert commission values must be valid numbers.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
      toast({ title: "Invalid input", description: "Provider commission values must be valid numbers.", variant: "destructive" });
      return;
    }
    if (min < 0 || max > 100 || min > max) {
      toast({ title: "Invalid range", description: "Expert commission min must be ≤ max and between 0–100.", variant: "destructive" });
      return;
    }
    if (pMin < 0 || pMax > 100 || pMin > pMax) {
      toast({ title: "Invalid range", description: "Provider commission min must be ≤ max and between 0–100.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...commissions });
  };

  const handleToggleFlag = (key: keyof typeof flags, value: boolean) => {
    const updated = { ...flags, [key]: value };
    setFlags(updated);
    saveMutation.mutate({ [key]: String(value) });
  };

  if (isLoading) {
    return (
      <AdminLayout title="Platform Settings">
        <div className="p-6 space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Platform Settings">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                General
              </CardTitle>
              <CardDescription>
                Platform name, currency, timezone and support email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="platform-name" className="text-sm">Platform Name</Label>
                <Input
                  id="platform-name"
                  data-testid="input-platform-name"
                  value={general.platform_name}
                  onChange={e => setGeneral(g => ({ ...g, platform_name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="default-currency" className="text-sm">Default Currency</Label>
                <Input
                  id="default-currency"
                  data-testid="input-default-currency"
                  value={general.default_currency}
                  onChange={e => setGeneral(g => ({ ...g, default_currency: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="timezone" className="text-sm">Timezone</Label>
                <Input
                  id="timezone"
                  data-testid="input-timezone"
                  value={general.timezone}
                  onChange={e => setGeneral(g => ({ ...g, timezone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="support-email" className="text-sm">Support Email</Label>
                <Input
                  id="support-email"
                  data-testid="input-support-email"
                  type="email"
                  value={general.support_email}
                  onChange={e => setGeneral(g => ({ ...g, support_email: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handleSaveGeneral}
                disabled={saveMutation.isPending}
                data-testid="button-save-general"
                className="w-full"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save General Settings
              </Button>
            </CardContent>
          </Card>

          {/* Commission Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-purple-600" />
                Commission Rates
              </CardTitle>
              <CardDescription>
                Payout percentages for experts and platform fees from providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="expert-min" className="text-sm">Expert Min %</Label>
                  <Input
                    id="expert-min"
                    data-testid="input-expert-commission-min"
                    type="number"
                    min={0}
                    max={100}
                    value={commissions.expert_commission_min}
                    onChange={e => setCommissions(c => ({ ...c, expert_commission_min: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="expert-max" className="text-sm">Expert Max %</Label>
                  <Input
                    id="expert-max"
                    data-testid="input-expert-commission-max"
                    type="number"
                    min={0}
                    max={100}
                    value={commissions.expert_commission_max}
                    onChange={e => setCommissions(c => ({ ...c, expert_commission_max: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="provider-min" className="text-sm">Provider Min %</Label>
                  <Input
                    id="provider-min"
                    data-testid="input-provider-commission-min"
                    type="number"
                    min={0}
                    max={100}
                    value={commissions.provider_commission_min}
                    onChange={e => setCommissions(c => ({ ...c, provider_commission_min: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="provider-max" className="text-sm">Provider Max %</Label>
                  <Input
                    id="provider-max"
                    data-testid="input-provider-commission-max"
                    type="number"
                    min={0}
                    max={100}
                    value={commissions.provider_commission_max}
                    onChange={e => setCommissions(c => ({ ...c, provider_commission_max: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Expert commission: {commissions.expert_commission_min}–{commissions.expert_commission_max}% payout to experts.
                Provider commission: {commissions.provider_commission_min}–{commissions.provider_commission_max}% platform fee.
              </p>
              <Button
                onClick={handleSaveCommissions}
                disabled={saveMutation.isPending}
                data-testid="button-save-commissions"
                className="w-full"
                variant="outline"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Commission Rates
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Feature Flags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Feature Flags
            </CardTitle>
            <CardDescription>
              Toggle platform features on or off — changes take effect immediately
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { key: "ai_recommendations_enabled" as const, label: "AI Trip Planner", description: "Enable AI-powered itinerary generation" },
                { key: "travelpulse_enabled" as const, label: "TravelPulse Live Intel", description: "Enable real-time travel intelligence" },
                { key: "credit_system_enabled" as const, label: "Credit System", description: "Enable user credits and wallet system" },
                { key: "affiliate_bookings_enabled" as const, label: "Affiliate Bookings", description: "Enable affiliate commission tracking" },
                { key: "new_registrations_enabled" as const, label: "New Registrations", description: "Allow new users to create accounts" },
              ].map(({ key, label, description }) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  data-testid={`row-flag-${key}`}
                >
                  <div className="space-y-0.5">
                    <Label className="text-base">{label}</Label>
                    <p className="text-sm text-gray-500">{description}</p>
                  </div>
                  <Switch
                    checked={flags[key]}
                    onCheckedChange={v => handleToggleFlag(key, v)}
                    disabled={saveMutation.isPending}
                    data-testid={`switch-flag-${key}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
