import React from "react";
import { AdminLayout } from "@/components/admin-layout";
import { SlowQueryWidget } from "@/components/admin/SlowQueryWidget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Server,
  Shield,
  Database,
  Mail,
  CreditCard,
  Bot,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Send
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PlatformSettingRow {
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

// Keys + defaults must match the server-side enforcement in
// server/services/platform-flags.ts (missing row = default).
const FLAG_DEFAULTS: Record<string, boolean> = {
  maintenance_mode: false,
  new_user_registration_enabled: true,
  email_notifications_enabled: true,
};

interface TestEmailResult {
  ok: boolean;
  id?: string;
  to?: string;
  error?: string;
}

export default function AdminSystem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settingsRows, isLoading: settingsLoading } = useQuery<PlatformSettingRow[]>({
    queryKey: ["/api/admin/platform-settings"],
  });

  const flagValue = (key: string): boolean => {
    const row = settingsRows?.find((r) => r.setting_key === key);
    if (!row) return FLAG_DEFAULTS[key] ?? false;
    return row.setting_value === "true";
  };

  const [testEmailResult, setTestEmailResult] = React.useState<TestEmailResult | null>(null);
  const sendTestEmail = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/system/test-email");
      return await res.json() as TestEmailResult;
    },
    onSuccess: (data) => {
      setTestEmailResult(data);
    },
    onError: (err: Error) => {
      setTestEmailResult({ ok: false, error: err.message });
    },
  });

  const updateFlag = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      await apiRequest("PATCH", `/api/admin/platform-settings/${key}`, {
        settingValue: value ? "true" : "false",
      });
      return { key, value };
    },
    onSuccess: ({ key, value }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-settings"] });
      const labels: Record<string, string> = {
        maintenance_mode: "Maintenance mode",
        new_user_registration_enabled: "New user registration",
        email_notifications_enabled: "Email notifications",
      };
      toast({
        title: `${labels[key] ?? key} ${value ? "enabled" : "disabled"}`,
        description:
          key === "maintenance_mode" && value
            ? "Non-admin API access is now blocked. Toggle off to restore access."
            : undefined,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update setting",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { data: healthData, isLoading } = useQuery<{
    services: Array<{ service: string; status: string; uptime: string }>;
    apiUsage: {
      claude: { used: number; limit: number; cost: string };
      stripe: { transactions: number; volume: string };
      email: { sent: number; bounceRate: string };
    };
  }>({ queryKey: ["/api/admin/system/health"] });

  if (isLoading || settingsLoading) {
    return (
      <AdminLayout title="System Settings">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      </AdminLayout>
    );
  }

  const services = healthData?.services ?? [];
  const apiUsage = healthData?.apiUsage ?? {
    claude: { used: 0, limit: 1, cost: "$0" },
    stripe: { transactions: 0, volume: "$0" },
    email: { sent: 0, bounceRate: "0%" },
  };

  return (
    <AdminLayout title="System Settings">
      <div className="p-6 space-y-6">
        {/* Slow query monitor (relocated from Dashboard) */}
        <SlowQueryWidget />

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-green-600" />
              System Status
            </CardTitle>
            <CardDescription>Current status of all platform services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service, index) => (
                <div
                  key={service.service}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  data-testid={`service-${index}`}
                >
                  <div className="flex items-center gap-3">
                    {service.status === "operational" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{service.service}</p>
                      <p className="text-xs text-gray-500">Uptime: {service.uptime}</p>
                    </div>
                  </div>
                  <Badge
                    className={service.status === "operational"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-amber-100 text-amber-700 border-amber-200"
                    }
                  >
                    {service.status}
                  </Badge>
                </div>
              ))}
            </div>
            {/* "View System Logs" was removed — there is no admin logs page to
                link to yet, and a dead button is worse than no button. */}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/system/health"] })
                }
                data-testid="button-refresh-status"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh Status
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Platform Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                Platform Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Maintenance Mode</Label>
                  <p className="text-sm text-gray-500">
                    Temporarily disable public access
                  </p>
                </div>
                <Switch
                  checked={flagValue("maintenance_mode")}
                  disabled={updateFlag.isPending}
                  onCheckedChange={(v) => updateFlag.mutate({ key: "maintenance_mode", value: v })}
                  data-testid="switch-maintenance"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">New User Registration</Label>
                  <p className="text-sm text-gray-500">
                    Allow new users to sign up
                  </p>
                </div>
                <Switch
                  checked={flagValue("new_user_registration_enabled")}
                  disabled={updateFlag.isPending}
                  onCheckedChange={(v) => updateFlag.mutate({ key: "new_user_registration_enabled", value: v })}
                  data-testid="switch-registration"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Send system email notifications
                  </p>
                </div>
                <Switch
                  checked={flagValue("email_notifications_enabled")}
                  disabled={updateFlag.isPending}
                  onCheckedChange={(v) => updateFlag.mutate({ key: "email_notifications_enabled", value: v })}
                  data-testid="switch-emails"
                />
              </div>

              {/* Test email delivery */}
              <div className="pt-2 border-t border-gray-100">
                <div className="space-y-0.5 mb-3">
                  <Label className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    Verify Email Delivery
                  </Label>
                  <p className="text-sm text-gray-500">
                    Send a test email to your admin address to confirm Resend is configured correctly.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTestEmailResult(null); sendTestEmail.mutate(); }}
                  disabled={sendTestEmail.isPending}
                  data-testid="button-send-test-email"
                >
                  {sendTestEmail.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send test email
                </Button>
                {testEmailResult && (
                  <div
                    className={`mt-3 flex items-start gap-2 rounded-md p-3 text-sm ${
                      testEmailResult.ok
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-red-50 border border-red-200 text-red-800"
                    }`}
                    data-testid="test-email-result"
                  >
                    {testEmailResult.ok ? (
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                    )}
                    <div>
                      {testEmailResult.ok ? (
                        <>
                          <p className="font-medium">Delivered successfully</p>
                          <p className="text-xs mt-0.5 opacity-80">
                            Sent to {testEmailResult.to}
                            {testEmailResult.id ? ` · Resend ID: ${testEmailResult.id}` : ""}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">Delivery failed</p>
                          <p className="text-xs mt-0.5 opacity-80">{testEmailResult.error}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* API Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-600" />
                API Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg" data-testid="card-claude-usage">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">Claude API</p>
                  <span className="text-sm text-gray-500">{apiUsage.claude.cost} this month</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${(apiUsage.claude.used / apiUsage.claude.limit) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {apiUsage.claude.used.toLocaleString()} / {apiUsage.claude.limit.toLocaleString()} tokens
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg" data-testid="card-stripe-usage">
                <p className="font-medium">Stripe</p>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">Transactions</span>
                  <span className="font-medium">{apiUsage.stripe.transactions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Volume</span>
                  <span className="font-medium text-green-600">{apiUsage.stripe.volume}</span>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg" data-testid="card-email-usage">
                <p className="font-medium">Email Service</p>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">Emails Sent</span>
                  <span className="font-medium">{apiUsage.email.sent.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Bounce Rate</span>
                  <span className="font-medium">{apiUsage.email.bounceRate}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security & Backup — infrastructure monitoring is not wired to live data yet.
            The previous cards asserted fabricated status (2FA "Enabled", SSL "245 days",
            "Last backup Today 3AM") that an admin could dangerously act on. Gated honestly
            until backed by a real infra-status source. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Security &amp; Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 py-2">
              <Database className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium">Infrastructure monitoring is coming soon</p>
                <p className="text-sm text-gray-500 mt-1 max-w-xl">
                  Live security posture (2FA enforcement, SSL expiry, last audit) and
                  backup/restore status will appear here once wired to the platform's
                  infrastructure sources. Until then, check these directly in your hosting
                  and database dashboards — this page won't assert a status it can't verify.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
