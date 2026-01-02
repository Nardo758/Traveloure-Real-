import { AdminLayout } from "@/components/admin-layout";
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
  Download,
  Upload
} from "lucide-react";
import { useState } from "react";

const systemStatus = [
  { service: "Web Server", status: "operational", uptime: "99.98%" },
  { service: "Database", status: "operational", uptime: "99.95%" },
  { service: "AI Processing", status: "operational", uptime: "99.90%" },
  { service: "Payment Gateway", status: "operational", uptime: "99.99%" },
  { service: "Email Service", status: "degraded", uptime: "98.50%" },
  { service: "CDN", status: "operational", uptime: "99.99%" },
];

const apiUsage = {
  openai: { used: 850000, limit: 1000000, cost: "$425" },
  stripe: { transactions: 1247, volume: "$125,600" },
  email: { sent: 15420, bounceRate: "0.8%" },
};

export default function AdminSystem() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newUserRegistration, setNewUserRegistration] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  return (
    <AdminLayout title="System Settings">
      <div className="p-6 space-y-6">
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
              {systemStatus.map((service, index) => (
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
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" data-testid="button-refresh-status">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh Status
              </Button>
              <Button variant="outline" size="sm" data-testid="button-view-logs">
                View System Logs
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
                  checked={maintenanceMode}
                  onCheckedChange={setMaintenanceMode}
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
                  checked={newUserRegistration}
                  onCheckedChange={setNewUserRegistration}
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
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  data-testid="switch-emails"
                />
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
              <div className="p-3 bg-gray-50 rounded-lg" data-testid="card-openai-usage">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">OpenAI API</p>
                  <span className="text-sm text-gray-500">{apiUsage.openai.cost} this month</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${(apiUsage.openai.used / apiUsage.openai.limit) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {apiUsage.openai.used.toLocaleString()} / {apiUsage.openai.limit.toLocaleString()} tokens
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

        {/* Security & Backup */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-500">Required for admin accounts</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium">SSL Certificate</p>
                  <p className="text-sm text-gray-500">Expires in 245 days</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200">Valid</Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Last Security Audit</p>
                  <p className="text-sm text-gray-500">December 15, 2025</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-run-audit">
                  Run Audit
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-600" />
                Backup & Recovery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium">Last Backup</p>
                  <p className="text-sm text-gray-500">Today at 3:00 AM</p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200">Success</Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="font-medium">Backup Frequency</p>
                  <p className="text-sm text-gray-500">Every 6 hours</p>
                </div>
                <Button variant="ghost" size="sm" data-testid="button-change-frequency">
                  Change
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid="button-backup-now">
                  <Download className="w-4 h-4 mr-2" /> Backup Now
                </Button>
                <Button variant="outline" size="sm" data-testid="button-restore">
                  <Upload className="w-4 h-4 mr-2" /> Restore
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
