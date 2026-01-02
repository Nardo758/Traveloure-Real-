import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Camera, 
  Mail, 
  Phone, 
  Building,
  Clock,
  Bell,
  Shield,
  Key
} from "lucide-react";

export default function EAProfile() {
  const profile = {
    name: "Rachel Taylor",
    title: "Executive Assistant",
    company: "Global Corp Inc.",
    email: "rachel.taylor@company.com",
    phone: "+1 (555) 123-4567",
    timezone: "America/New_York (EST)",
    executivesManaged: 8,
    yearsExperience: 5,
  };

  const notifications = [
    { id: 1, label: "Urgent event alerts", enabled: true },
    { id: 2, label: "AI task completions", enabled: true },
    { id: 3, label: "Calendar reminders", enabled: true },
    { id: 4, label: "Executive updates", enabled: true },
    { id: 5, label: "Weekly summary emails", enabled: false },
  ];

  return (
    <EALayout title="Profile">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-profile-title">
            Profile Settings
          </h1>
          <p className="text-gray-600">Manage your account and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="border border-gray-200">
            <CardContent className="p-6 text-center">
              <div className="relative inline-block mb-4">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C] text-2xl">
                    RT
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
              <h2 className="text-xl font-semibold text-gray-900">{profile.name}</h2>
              <p className="text-gray-600">{profile.title}</p>
              <p className="text-sm text-gray-500">{profile.company}</p>
              <div className="flex justify-center gap-4 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{profile.executivesManaged}</p>
                  <p className="text-xs text-gray-500">Executives</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{profile.yearsExperience}</p>
                  <p className="text-xs text-gray-500">Years Exp.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" defaultValue="Rachel" data-testid="input-first-name" />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" defaultValue="Taylor" data-testid="input-last-name" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Job Title</Label>
                  <Input id="title" defaultValue="Executive Assistant" data-testid="input-title" />
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" defaultValue="Global Corp Inc." data-testid="input-company" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input id="email" defaultValue={profile.email} className="pl-9" data-testid="input-email" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input id="phone" defaultValue={profile.phone} className="pl-9" data-testid="input-phone" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input id="timezone" defaultValue={profile.timezone} className="pl-9" data-testid="input-timezone" />
                  </div>
                </div>
                <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-save-profile">
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="border border-gray-200">
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
                    <span className="text-gray-700">{notification.label}</span>
                    <Switch 
                      defaultChecked={notification.enabled} 
                      data-testid={`switch-notification-${notification.id}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">Password</p>
                      <p className="text-sm text-gray-500">Last changed 30 days ago</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-change-password">
                    Change
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-500">Add extra security to your account</p>
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
