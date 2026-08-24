import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Mail,
  Phone,
  Clock,
  Bell,
  Shield,
  Key,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaPreferences {
  contact?: { phone?: string; jobTitle?: string; timezone?: string };
  notifications?: {
    urgentEventAlerts?: boolean;
    aiTaskCompletions?: boolean;
    calendarReminders?: boolean;
    executiveUpdates?: boolean;
    weeklySummaryEmails?: boolean;
  };
}

const NOTIFICATION_ROWS: { key: keyof NonNullable<EaPreferences["notifications"]>; label: string }[] = [
  { key: "urgentEventAlerts", label: "Urgent event alerts" },
  { key: "aiTaskCompletions", label: "AI task completions" },
  { key: "calendarReminders", label: "Calendar reminders" },
  { key: "executiveUpdates", label: "Executive updates" },
  { key: "weeklySummaryEmails", label: "Weekly summary emails" },
];

const DEFAULT_NOTIFICATIONS = {
  urgentEventAlerts: true,
  aiTaskCompletions: true,
  calendarReminders: true,
  executiveUpdates: true,
  weeklySummaryEmails: false,
};

export default function EAProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery<EaPreferences>({ queryKey: ["/api/ea/preferences"] });

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [timezone, setTimezone] = useState("");
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (prefs) {
      setPhone(prefs.contact?.phone ?? "");
      setJobTitle(prefs.contact?.jobTitle ?? "");
      setTimezone(prefs.contact?.timezone ?? "");
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(prefs.notifications ?? {}) });
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // firstName/lastName ride the existing generic self-profile endpoint
      // (server/replit_integrations/auth/routes.ts, already session-scoped).
      await apiRequest("PATCH", "/api/profile", { firstName, lastName });
      // EA-specific fields (no home on the generic endpoint) persist via the
      // EA preferences endpoint into users.preferences.ea (existing jsonb column).
      return apiRequest("PATCH", "/api/ea/preferences", {
        contact: { phone, jobTitle, timezone },
        notifications,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ea/preferences"] });
      toast({ title: "Profile saved" });
    },
    onError: (e: any) => toast({ title: "Could not save profile", description: e.message, variant: "destructive" }),
  });

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "EA"
    : "EA";

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Executive Assistant"
    : "Executive Assistant";

  return (
    <EALayout title="Profile">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A18]" data-testid="text-profile-title">
            Profile Settings
          </h1>
          <p className="text-[#7A7A72]">Manage your account and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="border border-[#E8E8E2]">
            <CardContent className="p-6 text-center">
              <div className="relative inline-block mb-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <h2 className="text-xl font-semibold text-[#1A1A18]">{displayName}</h2>
              <p className="text-[#7A7A72]">{jobTitle || "Executive Assistant"}</p>
              {user?.email && (
                <p className="text-sm text-[#AEAEA6] mt-1">{user.email}</p>
              )}
            </CardContent>
          </Card>

          {/* Personal Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-[#E8E8E2]">
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Job Title</Label>
                  <Input id="title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Executive Assistant" data-testid="input-title" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="email"
                        defaultValue={user?.email ?? ""}
                        className="pl-9"
                        disabled
                        title="Email changes aren't supported from this page yet"
                        data-testid="input-email"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Your phone number"
                        className="pl-9"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="Your timezone (e.g. America/New_York)"
                      className="pl-9"
                      data-testid="input-timezone"
                    />
                  </div>
                </div>
                <Button
                  className="bg-primary hover:bg-primary/90"
                  disabled={saveMutation.isPending || !firstName}
                  onClick={() => saveMutation.mutate()}
                  data-testid="button-save-profile"
                >
                  {saveMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {NOTIFICATION_ROWS.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between"
                    data-testid={`notification-${row.key}`}
                  >
                    <span className="text-[#1A1A18]">{row.label}</span>
                    <Switch
                      checked={!!notifications[row.key]}
                      onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, [row.key]: v }))}
                      data-testid={`switch-notification-${row.key}`}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  data-testid="button-save-notifications"
                >
                  {saveMutation.isPending ? "Saving…" : "Save Notification Preferences"}
                </Button>
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border border-[#E8E8E2]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E8E8E2]">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-[#AEAEA6]" />
                    <div>
                      <p className="font-medium text-[#1A1A18]">Password</p>
                      <p className="text-sm text-[#7A7A72]">Change your password from the account security page</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-gray-500">Coming soon</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E8E8E2]">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-[#AEAEA6]" />
                    <div>
                      <p className="font-medium text-[#1A1A18]">Two-Factor Authentication</p>
                      <p className="text-sm text-[#7A7A72]">Add extra security to your account</p>
                    </div>
                  </div>
                  <Badge className="bg-gray-100 text-gray-600">Not set up</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
