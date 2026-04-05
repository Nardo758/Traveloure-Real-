import { useState } from "react";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Lock,
  Globe,
  Zap,
  Trash2,
  Plus,
  Edit,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";

interface NotificationSetting {
  name: string;
  email: boolean;
  push: boolean;
}

interface ResponseTemplate {
  id: string;
  title: string;
  body: string;
}

export default function ExpertSettings() {
  // Notification settings
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { name: "New Message", email: true, push: true },
    { name: "Booking Request", email: true, push: true },
    { name: "Itinerary Update", email: false, push: true },
    { name: "Payment Received", email: true, push: true },
    { name: "Platform Announcements", email: true, push: false },
  ]);

  // Availability status
  const [availabilityStatus, setAvailabilityStatus] = useState<"available" | "busy" | "vacation">(
    "available"
  );

  // Response templates
  const [templates, setTemplates] = useState<ResponseTemplate[]>([
    { id: "1", title: "Standard Greeting", body: "Thank you for reaching out! I'm excited to help plan your trip." },
    { id: "2", title: "Availability Check", body: "I'd love to help! Let me check my availability and get back to you." },
    { id: "3", title: "Follow-up", body: "How are you progressing with the itinerary? Happy to discuss further!" },
  ]);
  const [newTemplate, setNewTemplate] = useState({ title: "", body: "" });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  // Preferences
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC+9");
  const [enableLeaderboard, setEnableLeaderboard] = useState(true);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const toggleNotification = (index: number, type: "email" | "push") => {
    const updated = [...notifications];
    updated[index] = {
      ...updated[index],
      [type]: !updated[index][type],
    };
    setNotifications(updated);
  };

  const addTemplate = () => {
    if (newTemplate.title && newTemplate.body) {
      setTemplates([...templates, { id: String(Date.now()), ...newTemplate }]);
      setNewTemplate({ title: "", body: "" });
    }
  };

  const deleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your preferences and account settings</p>
        </div>

        <Tabs defaultValue="notifications" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="availability" className="flex items-center gap-2">
              <Zap className="w-4 h-4" /> Availability
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <Edit className="w-4 h-4" /> Templates
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Globe className="w-4 h-4" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to be notified</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {notifications.map((notification, index) => (
                  <div key={notification.name} className="flex items-center justify-between pb-4 border-b last:border-0 last:pb-0">
                    <div>
                      <p className="font-semibold text-gray-900">{notification.name}</p>
                      <p className="text-sm text-gray-600 mt-1">Receive via email and push notifications</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-600">Email</Label>
                        <Switch
                          checked={notification.email}
                          onCheckedChange={() => toggleNotification(index, "email")}
                          data-testid={`toggle-email-${index}`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-600">Push</Label>
                        <Switch
                          checked={notification.push}
                          onCheckedChange={() => toggleNotification(index, "push")}
                          data-testid={`toggle-push-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button className="w-full mt-4 bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-save-notifications">
                  <Save className="w-4 h-4 mr-2" /> Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Availability Status Tab */}
          <TabsContent value="availability" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Availability Status</CardTitle>
                <CardDescription>Let clients know your current availability</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      id="available"
                      value="available"
                      checked={availabilityStatus === "available"}
                      onChange={(e) => setAvailabilityStatus(e.target.value as any)}
                      className="w-4 h-4"
                      data-testid="radio-available"
                    />
                    <label htmlFor="available" className="flex-1 cursor-pointer">
                      <p className="font-semibold text-gray-900">Available</p>
                      <p className="text-sm text-gray-600">You're ready to accept new bookings</p>
                    </label>
                  </div>

                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      id="busy"
                      value="busy"
                      checked={availabilityStatus === "busy"}
                      onChange={(e) => setAvailabilityStatus(e.target.value as any)}
                      className="w-4 h-4"
                      data-testid="radio-busy"
                    />
                    <label htmlFor="busy" className="flex-1 cursor-pointer">
                      <p className="font-semibold text-gray-900">Busy</p>
                      <p className="text-sm text-gray-600">You're working on existing projects, new bookings limited</p>
                    </label>
                  </div>

                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      id="vacation"
                      value="vacation"
                      checked={availabilityStatus === "vacation"}
                      onChange={(e) => setAvailabilityStatus(e.target.value as any)}
                      className="w-4 h-4"
                      data-testid="radio-vacation"
                    />
                    <label htmlFor="vacation" className="flex-1 cursor-pointer">
                      <p className="font-semibold text-gray-900">On Vacation</p>
                      <p className="text-sm text-gray-600">You're unavailable for new bookings</p>
                    </label>
                  </div>
                </div>

                <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-save-availability">
                  <Save className="w-4 h-4 mr-2" /> Save Status
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Response Templates Tab */}
          <TabsContent value="templates" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Response Templates</CardTitle>
                <CardDescription>Create canned messages for frequently asked questions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing Templates */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Your Templates</h3>
                  {templates.map((template) => (
                    <div key={template.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{template.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{template.body.substring(0, 100)}...</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTemplate(template.id)}
                            data-testid={`button-edit-${template.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteTemplate(template.id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`button-delete-${template.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Template */}
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Add New Template</h3>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold">Title</Label>
                      <Input
                        placeholder="e.g., Availability Confirmation"
                        value={newTemplate.title}
                        onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                        className="mt-2"
                        data-testid="input-template-title"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">Message</Label>
                      <textarea
                        placeholder="Enter the template message"
                        value={newTemplate.body}
                        onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                        className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        rows={4}
                        data-testid="textarea-template-body"
                      />
                    </div>
                    <Button
                      onClick={addTemplate}
                      className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                      data-testid="button-add-template"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Template
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Language & Timezone</CardTitle>
                <CardDescription>Set your preferred language and timezone</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="mt-2" data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                      <SelectItem value="es">Español (Spanish)</SelectItem>
                      <SelectItem value="fr">Français (French)</SelectItem>
                      <SelectItem value="de">Deutsch (German)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="mt-2" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC-8">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="UTC-5">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="UTC">GMT (UTC+0)</SelectItem>
                      <SelectItem value="UTC+1">Central European Time (UTC+1)</SelectItem>
                      <SelectItem value="UTC+9">Japan Standard Time (UTC+9)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-save-preferences">
                  <Save className="w-4 h-4 mr-2" /> Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="mt-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Update your password to keep your account secure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">Current Password</Label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-2"
                      data-testid="input-current-password"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">New Password</Label>
                    <div className="relative mt-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        data-testid="button-toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-change-password">
                    <Save className="w-4 h-4 mr-2" /> Change Password
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>Add an extra layer of security to your account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {twoFaEnabled ? "2FA Enabled" : "2FA Disabled"}
                      </p>
                      <p className="text-sm text-gray-600">
                        {twoFaEnabled
                          ? "Your account is protected with two-factor authentication"
                          : "Enable 2FA to secure your account"}
                      </p>
                    </div>
                    <Switch
                      checked={twoFaEnabled}
                      onCheckedChange={setTwoFaEnabled}
                      data-testid="toggle-2fa"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Leaderboard Visibility</CardTitle>
                <CardDescription>Control whether you appear on the expert leaderboard</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Show on Leaderboard</p>
                    <p className="text-sm text-gray-600 mt-1">
                      When enabled, your profile and stats will be visible on the expert leaderboard
                    </p>
                  </div>
                  <Switch
                    checked={enableLeaderboard}
                    onCheckedChange={setEnableLeaderboard}
                    data-testid="toggle-leaderboard"
                  />
                </div>

                {enableLeaderboard && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700">
                      ✓ Your profile is visible on the expert leaderboard. Your ranking updates daily based on client ratings and booking activity.
                    </p>
                  </div>
                )}

                <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-save-leaderboard">
                  <Save className="w-4 h-4 mr-2" /> Save Preference
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
