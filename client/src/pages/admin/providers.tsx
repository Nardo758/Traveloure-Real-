import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Building2, MapPin, CheckCircle, XCircle, Eye, Clock,
  Loader2, Calendar, Star, ShoppingBag, TrendingUp, Users,
  Camera, ChefHat, Car, Sparkles, Music, Waves, Dumbbell,
  MoreHorizontal, ExternalLink, Package, DollarSign, AlertCircle, PenLine,
  CreditCard, Bell, Filter,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProviderApplication {
  id: string;
  userId: string;
  businessName: string;
  name?: string;
  email: string;
  mobile?: string;
  website?: string;
  country: string;
  address: string;
  businessType: string;
  serviceOffers?: string[];
  description?: string;
  status: string;
  rejectionMessage?: string | null;
  createdAt: string;
}

interface ProviderService {
  id: string;
  serviceName: string;
  serviceType: string;
  price: string | null;
  priceType: string;
  deliveryMethod: string;
  status: string;
  isFeatured: boolean;
  bookingsCount: number;
  totalRevenue: string;
  averageRating: string | null;
  reviewCount: number;
  location: string;
  formStatus: string;
}

interface PlatformProvider {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  country: string;
  address: string;
  serviceOffers: string[];
  description?: string;
  createdAt: string;
  user: { id: string; name: string; email: string; profileImageUrl: string | null } | null;
  services: ProviderService[];
  totalBookings: number;
  totalRevenue: number;
  activeServices: number;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  canReceivePayments: boolean;
}

function stripeStatus(provider: PlatformProvider) {
  if (provider.stripeAccountStatus === "complete") return "complete";
  if (provider.stripeAccountId) return "incomplete";
  return "missing";
}

const SERVICE_TYPE_ICONS: Record<string, any> = {
  photography: Camera,
  chef: ChefHat,
  driver: Car,
  wellness: Waves,
  fitness: Dumbbell,
  music: Music,
  experience: Sparkles,
  planning: Package,
  default: ShoppingBag,
};

function serviceIcon(businessType: string) {
  const t = businessType.toLowerCase();
  if (t.includes("photo")) return Camera;
  if (t.includes("chef") || t.includes("cook") || t.includes("food")) return ChefHat;
  if (t.includes("driv") || t.includes("transport")) return Car;
  if (t.includes("spa") || t.includes("wellness") || t.includes("massage")) return Waves;
  if (t.includes("fit") || t.includes("gym") || t.includes("yoga")) return Dumbbell;
  if (t.includes("music") || t.includes("enter")) return Music;
  return ShoppingBag;
}

function ServiceStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>;
  if (status === "paused") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Paused</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Draft</Badge>;
}

function StripeStatusBadge({ provider }: { provider: PlatformProvider }) {
  const s = stripeStatus(provider);
  if (s === "complete") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
        <CreditCard className="w-3 h-3" /> Payouts Ready
      </Badge>
    );
  }
  if (s === "incomplete") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
        <AlertCircle className="w-3 h-3" /> Setup Incomplete
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1">
      <AlertCircle className="w-3 h-3" /> No Payout Setup
    </Badge>
  );
}

export default function AdminProviders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"platform" | "applications">("platform");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<{ appId: string; current: string } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [stripeFilter, setStripeFilter] = useState<"all" | "incomplete">("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading: appsLoading } = useQuery<ProviderApplication[]>({
    queryKey: ["/api/admin/provider-applications"],
  });

  const { data: platformProviders = [], isLoading: providersLoading } = useQuery<PlatformProvider[]>({
    queryKey: ["/api/admin/platform-service-providers"],
  });

  const pendingApps = applications.filter(a => a.status === "pending");
  const approvedApps = applications.filter(a => a.status === "approved");
  const rejectedApps = applications.filter(a => a.status === "rejected");

  const stripeIncompleteProviders = platformProviders.filter(p => stripeStatus(p) !== "complete");

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, rejectionMessage }: { id: string; status: string; rejectionMessage?: string }) => {
      return apiRequest("PATCH", `/api/admin/provider-applications/${id}/status`, { status, rejectionMessage });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-service-providers"] });
      toast({
        title: variables.status === "approved" ? "Provider Approved" : "Application Rejected",
        description: variables.status === "approved"
          ? "The provider is now active on the platform."
          : "The application has been rejected.",
      });
    },
  });

  const updateRejectionReasonMutation = useMutation({
    mutationFn: async ({ id, rejectionMessage }: { id: string; rejectionMessage: string }) => {
      return apiRequest("PATCH", `/api/admin/provider-applications/${id}/rejection-reason`, { rejectionMessage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-applications"] });
      setFeedbackDialog(null);
      setFeedbackText("");
      toast({ title: "Feedback Updated", description: "The provider has been notified of the updated rejection feedback." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to update feedback", description: error?.message ?? "Try again." });
    },
  });

  const verificationMutation = useMutation({
    mutationFn: async ({ userId, status, reason }: { userId: string; status: "verified" | "pending" | "rejected"; reason?: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/verification`, {
        providerVerificationStatus: status,
        backgroundCheckConfirmed: status === "verified",
        ...(reason ? { reason } : {}),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-service-providers"] });
      const titles: Record<string, { title: string; description: string }> = {
        verified: { title: "Provider verified", description: "Provider can now publish gated service categories." },
        pending: { title: "Verification cleared", description: "Provider's verification has been reset to pending." },
        rejected: { title: "Verification rejected", description: "The provider has been notified with your reason." },
      };
      const t = titles[variables.status] ?? titles.pending;
      toast(t);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to update verification", description: error?.message ?? "Try again." });
    },
  });

  const remindStripeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/providers/${userId}/remind-stripe`, {});
    },
    onSuccess: () => {
      toast({ title: "Reminder Sent", description: "The provider has been notified to complete their Stripe Connect setup." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to send reminder", description: error?.message ?? "Try again." });
    },
  });

  const filteredPlatformProviders = platformProviders.filter(p => {
    const matchesStripe = stripeFilter === "all" || stripeStatus(p) !== "complete";
    if (!matchesStripe) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.businessName.toLowerCase().includes(q)
      || p.businessType.toLowerCase().includes(q)
      || p.country.toLowerCase().includes(q)
      || (p.user?.name ?? "").toLowerCase().includes(q);
  });

  const filteredPending = pendingApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return app.businessName.toLowerCase().includes(q) || app.email.toLowerCase().includes(q) || app.country.toLowerCase().includes(q);
  });

  const isLoading = appsLoading || providersLoading;

  if (isLoading) {
    return (
      <AdminLayout title="Service Providers">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  const totalRevenue = platformProviders.reduce((s, p) => s + p.totalRevenue, 0);
  const totalBookings = platformProviders.reduce((s, p) => s + p.totalBookings, 0);

  return (
    <AdminLayout title="Service Providers">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Service Providers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage providers who offer services that travel experts can book for their clients.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{platformProviders.length}</div>
                <div className="text-xs text-gray-500">Active Providers</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">
                  {platformProviders.reduce((s, p) => s + p.activeServices, 0)}
                </div>
                <div className="text-xs text-gray-500">Active Services</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <div className="text-xl font-bold text-gray-900">{totalBookings}</div>
                <div className="text-xs text-gray-500">Total Bookings</div>
              </div>
            </CardContent>
          </Card>
          <Card className={stripeIncompleteProviders.length > 0 ? "border-red-200 bg-red-50/40" : ""}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stripeIncompleteProviders.length > 0 ? "bg-red-100" : "bg-amber-50"}`}>
                <CreditCard className={`w-5 h-5 ${stripeIncompleteProviders.length > 0 ? "text-red-600" : "text-amber-600"}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${stripeIncompleteProviders.length > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {stripeIncompleteProviders.length}
                </div>
                <div className="text-xs text-gray-500">Missing Payout Setup</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Required Banner */}
        {stripeIncompleteProviders.length > 0 && activeTab === "platform" && (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800">
                      {stripeIncompleteProviders.length} provider{stripeIncompleteProviders.length !== 1 ? "s" : ""} haven't completed Stripe Connect
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      These providers can't receive payouts until they finish setup. You can filter to see them or send reminders individually.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStripeFilter(stripeFilter === "incomplete" ? "all" : "incomplete")}
                  className={stripeFilter === "incomplete"
                    ? "border-red-400 bg-red-100 text-red-800 hover:bg-red-200"
                    : "border-red-300 text-red-700 hover:bg-red-100"}
                  data-testid="button-filter-stripe-incomplete"
                >
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                  {stripeFilter === "incomplete" ? "Show All Providers" : "Show Incomplete Only"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab Navigation + Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button
              variant={activeTab === "platform" ? "default" : "outline"}
              onClick={() => setActiveTab("platform")}
              className={activeTab === "platform" ? "bg-gray-900 hover:bg-gray-800" : ""}
              data-testid="button-tab-platform"
            >
              <Building2 className="w-4 h-4 mr-2" /> Service Providers ({platformProviders.length})
            </Button>
            <Button
              variant={activeTab === "applications" ? "default" : "outline"}
              onClick={() => setActiveTab("applications")}
              className={activeTab === "applications" ? "bg-gray-900 hover:bg-gray-800" : ""}
              data-testid="button-tab-applications"
            >
              <Clock className="w-4 h-4 mr-2" />
              Applications
              {pendingApps.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingApps.length}
                </span>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {stripeFilter === "incomplete" && (
              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1">
                <Filter className="w-3 h-3" /> Payout incomplete
              </Badge>
            )}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-providers"
              />
            </div>
          </div>
        </div>

        {/* ── Platform Service Providers Tab ── */}
        {activeTab === "platform" && (
          <div className="space-y-3">
            {filteredPlatformProviders.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">
                    {stripeFilter === "incomplete" ? "All providers have completed Stripe Connect" : "No active service providers yet"}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {stripeFilter === "incomplete" ? "Great! Everyone can receive payouts." : "Approve applications to see providers here."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPlatformProviders.map((provider) => {
                const Icon = serviceIcon(provider.businessType);
                const isExpanded = expandedProvider === provider.id;
                const initials = (provider.user?.name ?? provider.businessName)
                  .split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                const ss = stripeStatus(provider);

                return (
                  <Card
                    key={provider.id}
                    className={`overflow-hidden ${ss !== "complete" ? "border-red-200" : ""}`}
                    data-testid={`card-provider-${provider.id}`}
                  >
                    <CardContent className="p-0">
                      {/* Provider header row */}
                      <div className="p-4 flex items-center gap-4">
                        {/* Avatar */}
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          {provider.user?.profileImageUrl && (
                            <AvatarImage src={provider.user.profileImageUrl} />
                          )}
                          <AvatarFallback className="bg-gray-100 text-gray-700 font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        {/* Name & type */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-semibold text-gray-900">{provider.businessName}</span>
                            <Badge variant="outline" className="text-xs">{provider.businessType}</Badge>
                            {provider.activeServices === 0 && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
                                <AlertCircle className="w-3 h-3" /> No active services
                              </Badge>
                            )}
                            <StripeStatusBadge provider={provider} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {provider.address}, {provider.country}
                            </span>
                            {provider.user && (
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" /> {provider.user.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-6 flex-shrink-0">
                          <div className="text-center">
                            <div className="text-sm font-bold text-gray-900">{provider.activeServices}</div>
                            <div className="text-xs text-gray-400">Services</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-gray-900">{provider.totalBookings}</div>
                            <div className="text-xs text-gray-400">Bookings</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-bold text-green-700">
                              ${provider.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-gray-400">Revenue</div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Remind stripe if incomplete */}
                          {ss !== "complete" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => remindStripeMutation.mutate(provider.userId)}
                              disabled={remindStripeMutation.isPending}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                              data-testid={`button-remind-stripe-${provider.id}`}
                              title="Send an in-app notification reminding this provider to complete Stripe Connect"
                            >
                              <Bell className="w-3.5 h-3.5 mr-1" />
                              Remind
                            </Button>
                          )}
                          {/* Earnings page link */}
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            data-testid={`button-earnings-${provider.id}`}
                            title="View provider earnings page"
                          >
                            <a href={`/provider/earnings`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              Earnings
                            </a>
                          </Button>
                          {/* Verification toggle + reject */}
                          {(() => {
                            const vStatus = (provider as any).providerVerificationStatus;
                            const isVerified = vStatus === "verified";
                            const isRejected = vStatus === "rejected";
                            return (
                              <>
                                <Button
                                  variant={isVerified ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => verificationMutation.mutate({ userId: provider.userId, status: isVerified ? "pending" : "verified" })}
                                  disabled={verificationMutation.isPending}
                                  data-testid={`button-verify-${provider.id}`}
                                  title={isVerified ? "Click to clear verification" : "Mark provider as background-check verified"}
                                  className={isVerified ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
                                >
                                  {isVerified ? "✓ Verified" : "Mark Verified"}
                                </Button>
                                {!isVerified && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const reason = window.prompt("Reason for rejecting this provider's verification (shown to the provider):")?.trim();
                                      if (reason === undefined || reason === null) return;
                                      verificationMutation.mutate({ userId: provider.userId, status: "rejected", reason: reason || undefined });
                                    }}
                                    disabled={verificationMutation.isPending}
                                    data-testid={`button-reject-verification-${provider.id}`}
                                    title="Reject verification and notify the provider"
                                    className={isRejected ? "border-red-300 text-red-700" : "text-red-600 hover:bg-red-50"}
                                  >
                                    {isRejected ? "✕ Rejected" : "Reject"}
                                  </Button>
                                )}
                              </>
                            );
                          })()}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                            data-testid={`button-expand-${provider.id}`}
                          >
                            {isExpanded ? "Hide" : "View Services"}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded: service listings */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                          {provider.services.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">No service listings yet</p>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Service Listings ({provider.services.length})
                              </div>
                              {provider.services.map((svc) => (
                                <div
                                  key={svc.id}
                                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
                                  data-testid={`row-service-${svc.id}`}
                                >
                                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                    <Icon className="w-4 h-4 text-gray-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-900 truncate">{svc.serviceName}</span>
                                      <ServiceStatusBadge status={svc.status} />
                                      {svc.isFeatured && (
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Featured</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                                      <span>{svc.serviceType}</span>
                                      <span>·</span>
                                      <span>{svc.deliveryMethod}</span>
                                      {svc.location && <><span>·</span><span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{svc.location}</span></>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                                    {svc.price && (
                                      <div>
                                        <div className="text-sm font-semibold text-gray-900">${parseFloat(svc.price).toFixed(0)}</div>
                                        <div className="text-xs text-gray-400">{svc.priceType}</div>
                                      </div>
                                    )}
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">{svc.bookingsCount}</div>
                                      <div className="text-xs text-gray-400">bookings</div>
                                    </div>
                                    {svc.averageRating && (
                                      <div className="flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                        <span className="text-sm font-semibold text-gray-900">{parseFloat(svc.averageRating).toFixed(1)}</span>
                                        <span className="text-xs text-gray-400">({svc.reviewCount})</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {provider.description && (
                            <p className="text-xs text-gray-500 mt-3 italic border-t border-gray-200 pt-3">
                              "{provider.description.slice(0, 200)}{provider.description.length > 200 ? "..." : ""}"
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ── Applications Tab ── */}
        {activeTab === "applications" && (
          <div className="space-y-4">
            {/* Pending */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Pending Applications ({filteredPending.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredPending.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No pending applications</p>
                ) : (
                  filteredPending.map((app) => (
                    <div
                      key={app.id}
                      className="p-4 border border-gray-200 rounded-lg space-y-3"
                      data-testid={`card-application-${app.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarFallback className="bg-green-100 text-green-700">
                              {app.businessName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-gray-900">{app.businessName}</h3>
                            <p className="text-sm text-gray-500">{app.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(app.createdAt).toLocaleDateString()}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Business Type</p>
                          <p className="font-medium">{app.businessType}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Location</p>
                          <p className="font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {app.address}, {app.country}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Services Offered</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(Array.isArray(app.serviceOffers) ? app.serviceOffers : []).slice(0, 3).map((s: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                            ))}
                            {(Array.isArray(app.serviceOffers) ? app.serviceOffers : []).length > 3 && (
                              <Badge variant="outline" className="text-xs">+{(app.serviceOffers as string[]).length - 3}</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {app.description && (
                        <p className="text-sm text-gray-600 italic">
                          "{app.description.slice(0, 150)}{app.description.length > 150 ? "..." : ""}"
                        </p>
                      )}

                      <div className="space-y-2 pt-2">
                        {/* Verification status badges */}
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const idStatus = (app as any).identityVerificationStatus ?? "pending";
                            if (idStatus === "verified") return <Badge className="bg-green-100 text-green-700 text-xs">✓ ID Verified</Badge>;
                            if (idStatus === "processing") return <Badge className="bg-blue-100 text-blue-700 text-xs">⏳ ID Processing</Badge>;
                            if (idStatus === "failed") return <Badge className="bg-red-100 text-red-700 text-xs">✗ ID Failed</Badge>;
                            return <Badge variant="outline" className="text-gray-500 text-xs">ID Not Submitted</Badge>;
                          })()}
                          {(() => {
                            const bizStatus = (app as any).businessVerificationStatus ?? "pending";
                            if (bizStatus === "verified") return <Badge className="bg-green-100 text-green-700 text-xs">✓ Biz Verified</Badge>;
                            if (bizStatus === "submitted") return <Badge className="bg-amber-100 text-amber-700 text-xs">⏳ Biz Submitted</Badge>;
                            if (bizStatus === "failed") return <Badge className="bg-red-100 text-red-700 text-xs">✗ Biz Failed</Badge>;
                            return <Badge variant="outline" className="text-gray-500 text-xs">Biz Not Submitted</Badge>;
                          })()}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              const idStatus = (app as any).identityVerificationStatus;
                              const bizStatus = (app as any).businessVerificationStatus;
                              let overrideNote: string | undefined;
                              if (idStatus !== "verified" || bizStatus !== "verified") {
                                const details = [`ID: ${idStatus || "not started"}`, `Business: ${bizStatus || "not started"}`].join(", ");
                                const note = window.prompt(
                                  `Verifications incomplete (${details}).\n\nEnter an override reason to approve anyway (required):`,
                                  ""
                                );
                                if (note === null) return;
                                if (!note.trim()) {
                                  alert("An override reason is required when approving without completed verification.");
                                  return;
                                }
                                overrideNote = `[Admin override] ${note.trim()}`;
                              }
                              updateStatusMutation.mutate({ id: app.id, status: "approved", rejectionMessage: overrideNote });
                            }}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-approve-${app.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: app.id, status: "rejected", rejectionMessage: "Does not meet requirements at this time." })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-reject-${app.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Previously approved (summary) */}
            {approvedApps.length > 0 && (
              <div className="text-sm text-gray-500 text-center py-2">
                {approvedApps.length} approved provider{approvedApps.length !== 1 ? "s" : ""} — switch to <button className="text-gray-900 font-medium underline" onClick={() => setActiveTab("platform")}>Service Providers</button> to see their listings.
              </div>
            )}

            {/* Rejected applications */}
            {rejectedApps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <XCircle className="w-4 h-4 text-red-500" />
                    Rejected Applications ({rejectedApps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rejectedApps.map((app) => (
                    <div
                      key={app.id}
                      className="p-4 border border-red-100 rounded-lg space-y-3 bg-red-50/30"
                      data-testid={`card-rejected-${app.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-red-100 text-red-700 text-sm">
                              {app.businessName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{app.businessName}</h3>
                            <p className="text-xs text-gray-500">{app.email} · {app.country}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Rejected</Badge>
                          <Badge variant="outline" className="text-xs">
                            <Calendar className="w-3 h-3 mr-1" />
                            {new Date(app.createdAt).toLocaleDateString()}
                          </Badge>
                        </div>
                      </div>

                      {app.rejectionMessage && (
                        <div className="bg-white border border-red-100 rounded p-3">
                          <p className="text-xs text-gray-500 font-medium mb-1">Current feedback</p>
                          <p className="text-sm text-gray-700">{app.rejectionMessage}</p>
                        </div>
                      )}
                      {!app.rejectionMessage && (
                        <p className="text-xs text-gray-400 italic">No feedback message provided.</p>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFeedbackText(app.rejectionMessage ?? "");
                          setFeedbackDialog({ appId: app.id, current: app.rejectionMessage ?? "" });
                        }}
                        data-testid={`button-update-feedback-${app.id}`}
                      >
                        <PenLine className="w-4 h-4 mr-1" /> Update Feedback
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Update Feedback Dialog */}
      <Dialog open={!!feedbackDialog} onOpenChange={(open) => { if (!open) { setFeedbackDialog(null); setFeedbackText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Rejection Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-500">
              Update the feedback message sent to the provider. They will be notified when you save.
            </p>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Explain why the application was rejected and what the provider can improve..."
              rows={5}
              maxLength={2000}
              data-testid="textarea-rejection-feedback"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setFeedbackDialog(null); setFeedbackText(""); }}
              data-testid="button-cancel-feedback"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!feedbackDialog || !feedbackText.trim()) return;
                updateRejectionReasonMutation.mutate({ id: feedbackDialog.appId, rejectionMessage: feedbackText.trim() });
              }}
              disabled={updateRejectionReasonMutation.isPending || !feedbackText.trim()}
              data-testid="button-save-feedback"
            >
              {updateRejectionReasonMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</>
              ) : (
                "Save Feedback"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
