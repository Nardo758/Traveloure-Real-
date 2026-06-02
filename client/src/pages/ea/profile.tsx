import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  Mail,
  Phone,
  Clock,
  Bell,
  Shield,
  Key
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const notifications = [
  { id: 1, label: "Urgent event alerts", enabled: true },
  { id: 2, label: "AI task completions", enabled: true },
  { id: 3, label: "Calendar reminders", enabled: true },
  { id: 4, label: "Executive updates", enabled: true },
  { id: 5, label: "Weekly summary emails", enabled: false },
];

export default function EAProfile() {
  const { user } = useAuth();

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
                  <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C] text-2xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="outline"
                  className="absolute bottom-0 right-0 rounded-full h-8 w-8"
                  data-testid="button-upload-photo"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <h2 className="text-xl font-semibold text-[#1A1A18]">{displayName}</h2>
              <p className="text-[#7A7A72]">Executive Assistant</p>
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
                      defaultValue={user?.firstName ?? ""}
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      defaultValue={user?.lastName ?? ""}
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Job Title</Label>
                  <Input id="title" defaultValue="Executive Assistant" data-testid="input-title" />
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
                      placeholder="Your timezone (e.g. America/New_York)"
                      className="pl-9"
                      data-testid="input-timezone"
                    />
                  </div>
                </div>
                <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-save-profile">
                  Save Changes
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
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-center justify-between"
                    data-testid={`notification-${notification.id}`}
                  >
                    <span className="text-[#1A1A18]">{notification.label}</span>
                    <Switch
                      defaultChecked={notification.enabled}
                      data-testid={`switch-notification-${notification.id}`}
                    />
                  </div>
                ))}
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
                      <p className="text-sm text-[#7A7A72]">Update your password</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-change-password">
                    Change
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E8E8E2]">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-[#AEAEA6]" />
                    <div>
                      <p className="font-medium text-[#1A1A18]">Two-Factor Authentication</p>
                      <p className="text-sm text-[#7A7A72]">Add extra security to your account</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-700">Enabled</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
