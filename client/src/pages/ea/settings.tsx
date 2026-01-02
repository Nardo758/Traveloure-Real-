import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  Bot, 
  Bell, 
  Globe, 
  Palette,
  Calendar,
  Mail
} from "lucide-react";

export default function EASettings() {
  const aiSettings = [
    { id: 1, label: "Auto-delegate routine tasks", enabled: true },
    { id: 2, label: "AI draft communications", enabled: true },
    { id: 3, label: "Smart calendar suggestions", enabled: true },
    { id: 4, label: "Proactive travel recommendations", enabled: false },
    { id: 5, label: "Gift reminders", enabled: true },
  ];

  const generalSettings = [
    { id: 1, label: "Show executive photos", enabled: true },
    { id: 2, label: "Compact view mode", enabled: false },
    { id: 3, label: "Show calendar week numbers", enabled: false },
    { id: 4, label: "24-hour time format", enabled: false },
  ];

  return (
    <EALayout title="Settings">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-gray-600">Configure your workspace preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Assistant Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-600" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiSettings.map((setting) => (
                <div 
                  key={setting.id} 
                  className="flex items-center justify-between"
                  data-testid={`ai-setting-${setting.id}`}
                >
                  <span className="text-gray-700">{setting.label}</span>
                  <Switch 
                    defaultChecked={setting.enabled} 
                    data-testid={`switch-ai-${setting.id}`}
                  />
                </div>
              ))}
              <Button variant="outline" className="w-full mt-4" data-testid="button-ai-training">
                AI Training Preferences
              </Button>
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Display
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalSettings.map((setting) => (
                <div 
                  key={setting.id} 
                  className="flex items-center justify-between"
                  data-testid={`display-setting-${setting.id}`}
                >
                  <span className="text-gray-700">{setting.label}</span>
                  <Switch 
                    defaultChecked={setting.enabled} 
                    data-testid={`switch-display-${setting.id}`}
                  />
                </div>
              ))}
              <div className="pt-4 border-t border-gray-100">
                <Label className="mb-2 block">Theme</Label>
                <Select defaultValue="light" data-testid="select-theme">
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Settings */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Calendar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Default Calendar View</Label>
                <Select defaultValue="week" data-testid="select-calendar-view">
                  <SelectTrigger>
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Week Starts On</Label>
                <Select defaultValue="monday" data-testid="select-week-start">
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunday">Sunday</SelectItem>
                    <SelectItem value="monday">Monday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Working Hours</Label>
                <div className="flex gap-2">
                  <Select defaultValue="9" data-testid="select-start-hour">
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(12)].map((_, i) => (
                        <SelectItem key={i} value={String(i + 6)}>{i + 6}:00 AM</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center text-gray-500">to</span>
                  <Select defaultValue="17" data-testid="select-end-hour">
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(12)].map((_, i) => (
                        <SelectItem key={i} value={String(i + 12)}>{i + 12}:00 PM</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Integration */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Outlook Integration</p>
                  <p className="text-sm text-gray-500">Sync calendars and contacts</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-outlook">
                  Connect
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Gmail Integration</p>
                  <p className="text-sm text-gray-500">Sync emails and calendar</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-gmail">
                  Connect
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Slack Integration</p>
                  <p className="text-sm text-gray-500">Receive notifications</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-connect-slack">
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-save-settings">
            Save All Settings
          </Button>
        </div>
      </div>
    </EALayout>
  );
}
