import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Percent,
  Zap,
  Info,
} from "lucide-react";

export default function AdminSettings() {
  return (
    <AdminLayout title="Platform Settings">
      <div className="p-6 space-y-6">
        {/* Info Banner */}
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">Beta Mode</AlertTitle>
          <AlertDescription className="text-blue-800">
            Settings configuration is read-only during beta.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                General
              </CardTitle>
              <CardDescription>
                Platform name, default currency, timezone, support email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="platform-name" className="text-sm">
                  Platform Name
                </Label>
                <Input
                  id="platform-name"
                  placeholder="Traveloure"
                  disabled
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="default-currency" className="text-sm">
                  Default Currency
                </Label>
                <Input
                  id="default-currency"
                  placeholder="USD"
                  disabled
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="timezone" className="text-sm">
                  Timezone
                </Label>
                <Input
                  id="timezone"
                  placeholder="UTC"
                  disabled
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="support-email" className="text-sm">
                  Support Email
                </Label>
                <Input
                  id="support-email"
                  placeholder="support@traveloure.com"
                  disabled
                  type="email"
                  className="mt-1"
                />
              </div>
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
                Expert commission: 75-85%, Provider commission: 4-12%
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900">Expert Commission</p>
                  <p className="text-sm text-gray-600">Platform payout to experts</p>
                </div>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  75-85%
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div>
                  <p className="font-medium text-gray-900">Provider Commission</p>
                  <p className="text-sm text-gray-600">Platform fee from providers</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200">
                  4-12%
                </Badge>
              </div>
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
              Toggle platform features (currently read-only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">AI Trip Planner</Label>
                  <p className="text-sm text-gray-500">
                    Enable AI-powered itinerary generation
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">TravelPulse Live Intel</Label>
                  <p className="text-sm text-gray-500">
                    Enable real-time travel intelligence
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Credit System</Label>
                  <p className="text-sm text-gray-500">
                    Enable user credits and wallet system
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Affiliate Bookings</Label>
                  <p className="text-sm text-gray-500">
                    Enable affiliate commission tracking
                  </p>
                </div>
                <Switch checked={true} disabled />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
