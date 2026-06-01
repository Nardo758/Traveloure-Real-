import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Bell, 
  CreditCard, 
  Shield, 
  Clock,
  User,
  Building,
  Save
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProviderSettingsData {
  instantBooking: boolean;
  autoResponse: boolean;
  minimumLeadTimeDays: number;
  targetResponseTimeHours: number;
  payoutFrequency: string;
  minimumPayoutAmount: string;
  notificationsJson: Record<string, boolean>;
}

export default function ProviderSettings() {
  const { toast } = useToast();

  const { data: serverSettings } = useQuery<ProviderSettingsData>({
    queryKey: ["/api/provider/settings"],
  });

  const [notifications, setNotifications] = useState({
    newBookings: true,
    bookingUpdates: true,
    messages: true,
    reviews: true,
    payouts: true,
    marketing: false,
  });
  const [autoResponse, setAutoResponse] = useState(true);
  const [instantBooking, setInstantBooking] = useState(false);
  const [leadTime, setLeadTime] = useState("7");
  const [responseTime, setResponseTime] = useState("2");
  const [payoutFrequency, setPayoutFrequency] = useState("monthly");
  const [minPayout, setMinPayout] = useState("100");

  useEffect(() => {
    if (serverSettings) {
      setInstantBooking(serverSettings.instantBooking ?? false);
      setAutoResponse(serverSettings.autoResponse ?? true);
      setLeadTime(String(serverSettings.minimumLeadTimeDays ?? 7));
      setResponseTime(String(serverSettings.targetResponseTimeHours ?? 2));
      setPayoutFrequency(serverSettings.payoutFrequency ?? "monthly");
      setMinPayout(String(serverSettings.minimumPayoutAmount ?? "100"));
      if (serverSettings.notificationsJson) {
        setNotifications(serverSettings.notificationsJson as typeof notifications);
      }
    }
  }, [serverSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/provider/settings", {
        instantBooking,
        autoResponse,
        minimumLeadTimeDays: parseInt(leadTime, 10),
        targetResponseTimeHours: parseInt(responseTime, 10),
        payoutFrequency,
        minimumPayoutAmount: minPayout,
        notificationsJson: notifications,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/settings"] });
      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  return (
    <ProviderLayout title="Settings">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-500" />
              Account Settings
            </CardTitle>
            <CardDescription>Manage your account credentials and security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" data-testid="button-change-password">
                <Shield className="w-4 h-4 mr-2" /> Change Password
              </Button>
              <Button variant="outline" data-testid="button-two-factor">
                Enable Two-Factor Auth
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Business Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-gray-500" />
              Business Preferences
            </CardTitle>
            <CardDescription>Configure how you receive and manage bookings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Instant Booking</Label>
                <p className="text-sm text-gray-500">
                  Allow clients to book without prior approval
                </p>
              </div>
              <Switch
                checked={instantBooking}
                onCheckedChange={setInstantBooking}
                data-testid="switch-instant-booking"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Response</Label>
                <p className="text-sm text-gray-500">
                  Send automatic responses to new inquiries
                </p>
              </div>
              <Switch
                checked={autoResponse}
                onCheckedChange={setAutoResponse}
                data-testid="switch-auto-response"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-time">Minimum Lead Time</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="lead-time" 
                  type="number" 
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  className="w-24"
                  data-testid="input-lead-time"
                />
                <span className="text-gray-600">days before event</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="response-time">
                <Clock className="w-4 h-4 inline mr-1" />
                Target Response Time
              </Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="response-time" 
                  type="number" 
                  value={responseTime}
                  onChange={(e) => setResponseTime(e.target.value)}
                  className="w-24"
                  data-testid="input-response-time"
                />
                <span className="text-gray-600">hours</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-gray-500" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Choose how you want to be notified</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(notifications).map(([key, value]) => {
              const labels: Record<string, { title: string; desc: string }> = {
                newBookings: { title: "New Booking Requests", desc: "Get notified when you receive a new booking request" },
                bookingUpdates: { title: "Booking Updates", desc: "Updates on confirmed bookings and changes" },
                messages: { title: "Messages", desc: "New messages from clients and experts" },
                reviews: { title: "Reviews", desc: "When clients leave reviews" },
                payouts: { title: "Payout Notifications", desc: "Payout processing and completion" },
                marketing: { title: "Marketing & Tips", desc: "Tips to improve your listing and promotions" },
              };
              
              return (
                <div key={key} className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">{labels[key]?.title ?? key}</Label>
                    <p className="text-sm text-gray-500">{labels[key]?.desc ?? ""}</p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) => 
                      setNotifications(prev => ({ ...prev, [key]: checked }))
                    }
                    data-testid={`switch-notification-${key}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gray-500" />
              Payment Settings
            </CardTitle>
            <CardDescription>Manage your payout methods and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payout Frequency</Label>
              <div className="flex gap-2">
                {(["weekly", "biweekly", "monthly"] as const).map((freq) => (
                  <Button
                    key={freq}
                    variant={payoutFrequency === freq ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setPayoutFrequency(freq)}
                    data-testid={`button-payout-${freq}`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1).replace("biweekly", "Bi-weekly")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Minimum Payout Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">$</span>
                <Input 
                  type="number" 
                  value={minPayout}
                  onChange={(e) => setMinPayout(e.target.value)}
                  className="w-32"
                  data-testid="input-min-payout"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => saveSettingsMutation.mutate()}
            disabled={saveSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveSettingsMutation.isPending ? "Saving..." : "Save All Settings"}
          </Button>
        </div>
      </div>
    </ProviderLayout>
  );
}
