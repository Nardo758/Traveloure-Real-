import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Bell, 
  Mail, 
  CreditCard, 
  Shield, 
  Globe, 
  Clock,
  User,
  Building,
  Save
} from "lucide-react";
import { useState } from "react";

export default function ProviderSettings() {
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  defaultValue="events@grandestatevenue.com"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input 
                  id="phone" 
                  type="tel" 
                  defaultValue="+1 (707) 555-0123"
                  data-testid="input-phone"
                />
              </div>
            </div>
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
                  defaultValue="7"
                  className="w-24"
                  data-testid="input-lead-time"
                />
                <span className="text-gray-600">days before event</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="response-time">Target Response Time</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="response-time" 
                  type="number" 
                  defaultValue="2"
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
                    <Label className="text-base">{labels[key].title}</Label>
                    <p className="text-sm text-gray-500">{labels[key].desc}</p>
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
            <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Chase Bank</p>
                <p className="text-sm text-gray-500">Account ending in ****1234</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid="button-edit-payout">
                  Edit
                </Button>
                <Button variant="ghost" size="sm" data-testid="button-add-payout">
                  Add New
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payout Frequency</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-payout-weekly">
                  Weekly
                </Button>
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-payout-biweekly">
                  Bi-weekly
                </Button>
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-payout-monthly">
                  Monthly
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Minimum Payout Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">$</span>
                <Input 
                  type="number" 
                  defaultValue="100"
                  className="w-32"
                  data-testid="input-min-payout"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button data-testid="button-save-settings">
            <Save className="w-4 h-4 mr-2" /> Save All Settings
          </Button>
        </div>
      </div>
    </ProviderLayout>
  );
}
