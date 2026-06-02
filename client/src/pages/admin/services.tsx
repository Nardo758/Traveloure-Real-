import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Package,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  PauseCircle,
  Star,
  MoreHorizontal,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Eye,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AdminService {
  id: string;
  trackingNumber?: string;
  serviceName: string;
  shortDescription?: string;
  serviceType?: string;
  categoryId?: string;
  price?: string;
  priceType?: string;
  deliveryMethod?: string;
  deliveryTimeframe?: string;
  location?: string;
  status: string;
  formStatus?: string;
  isFeatured?: boolean;
  bookingsCount?: number;
  totalRevenue?: string;
  averageRating?: string;
  reviewCount?: number;
  revenueShareRate?: string;
  createdAt?: string;
  updatedAt?: string;
  userId: string;
  providerName?: string;
  providerEmail?: string;
}

interface ServicesSummary {
  total: number;
  byStatus: Record<string, number>;
  totalRevenue: number;
  totalBookings: number;
  featuredCount: number;
  averageRating: number;
}

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  active:    { label: "Active",     className: "bg-green-100 text-green-800",  icon: CheckCircle },
  paused:    { label: "Paused",     className: "bg-amber-100 text-amber-800",  icon: PauseCircle },
  draft:     { label: "Draft",      className: "bg-gray-100 text-gray-700",    icon: FileText },
  suspended: { label: "Suspended",  className: "bg-red-100 text-red-800",      icon: XCircle },
};

const deliveryLabels: Record<string, string> = {
  pdf: "PDF", video: "Video", call: "Call", in_person: "In Person",
  voice_notes: "Voice Notes", async_messaging: "Async Messaging",
};

export default function AdminServices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedService, setSelectedService] = useState<AdminService | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("active");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<ServicesSummary>({
    queryKey: ["/api/admin/services/summary"],
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<AdminService[]>({
    queryKey: ["/api/admin/services", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      const res = await fetch(`/api/admin/services?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/services/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Service status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services/summary"] });
      setStatusDialogOpen(false);
      setSelectedService(null);
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const featureMutation = useMutation({
    mutationFn: ({ id, isFeatured }: { id: string; isFeatured: boolean }) =>
      apiRequest("PATCH", `/api/admin/services/${id}/featured`, { isFeatured }),
    onSuccess: (_, vars) => {
      toast({ title: vars.isFeatured ? "Service featured" : "Service unfeatured" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services/summary"] });
    },
    onError: () => toast({ title: "Failed to update featured status", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/services/${id}`),
    onSuccess: () => {
      toast({ title: "Service deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services/summary"] });
      setDeleteDialogOpen(false);
      setSelectedService(null);
    },
    onError: () => toast({ title: "Failed to delete service", variant: "destructive" }),
  });

  const filtered = services.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.serviceName.toLowerCase().includes(q) ||
      (s.providerName ?? "").toLowerCase().includes(q) ||
      (s.trackingNumber ?? "").toLowerCase().includes(q) ||
      (s.location ?? "").toLowerCase().includes(q)
    );
  });

  const stats = [
    { label: "Total Services",  value: summary?.total ?? 0,          icon: Package,      color: "text-blue-600" },
    { label: "Active",          value: summary?.byStatus?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Total Bookings",  value: summary?.totalBookings ?? 0,  icon: ShoppingCart, color: "text-purple-600" },
    { label: "Platform Revenue",
      value: `$${((summary?.totalRevenue ?? 0) * parseFloat(services[0]?.revenueShareRate ?? "0.30")).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      icon: DollarSign, color: "text-[#FF385C]" },
    { label: "Featured",        value: summary?.featuredCount ?? 0,  icon: Star,         color: "text-amber-500" },
    { label: "Paused / Draft",
      value: (summary?.byStatus?.paused ?? 0) + (summary?.byStatus?.draft ?? 0),
      icon: PauseCircle, color: "text-gray-500" },
  ];

  if (summaryLoading) {
    return (
      <AdminLayout title="Services Registry">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Services Registry">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A18]" data-testid="text-services-title">
              Services Registry
            </h1>
            <p className="text-sm text-[#7A7A72] mt-1">
              Central registry for all provider services across the platform
            </p>
          </div>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {summary?.total ?? 0} total services
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-[#E8E8E2]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-[#7A7A72]">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`} data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEAEA6]" />
            <Input
              placeholder="Search by name, provider, tracking #, location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 border-[#E8E8E2]"
              data-testid="input-search-services"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 border-[#E8E8E2]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="border-[#E8E8E2]">
          <CardHeader className="border-b border-[#E8E8E2] pb-4">
            <CardTitle className="text-base font-semibold text-[#1A1A18]">
              All Services
              {filtered.length !== services.length && (
                <span className="ml-2 text-sm text-[#7A7A72] font-normal">
                  {filtered.length} of {services.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {servicesLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16" data-testid="empty-services">
                <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-[#7A7A72] font-medium">No services found</p>
                <p className="text-sm text-[#AEAEA6] mt-1">
                  {search || statusFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Services will appear here once providers create them"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E8E8E2] hover:bg-transparent">
                    <TableHead className="text-[#7A7A72] font-medium pl-6">Service</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium">Provider</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium">Price</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium">Delivery</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium text-center">Bookings</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium text-center">Revenue</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium text-center">Rating</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium text-center">Featured</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium">Status</TableHead>
                    <TableHead className="text-[#7A7A72] font-medium pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((service) => {
                    const statusInfo = statusConfig[service.status] ?? statusConfig.draft;
                    const StatusIcon = statusInfo.icon;
                    return (
                      <TableRow
                        key={service.id}
                        className="border-[#E8E8E2] hover:bg-[#FAFAF8]"
                        data-testid={`row-service-${service.id}`}
                      >
                        {/* Service */}
                        <TableCell className="pl-6 py-4">
                          <div className="max-w-[200px]">
                            <p className="font-medium text-[#1A1A18] truncate">{service.serviceName}</p>
                            {service.trackingNumber && (
                              <p className="text-xs text-[#AEAEA6] font-mono mt-0.5">{service.trackingNumber}</p>
                            )}
                            {service.location && (
                              <p className="text-xs text-[#7A7A72] mt-0.5 truncate">{service.location}</p>
                            )}
                          </div>
                        </TableCell>

                        {/* Provider */}
                        <TableCell className="py-4">
                          <div className="max-w-[140px]">
                            <p className="text-sm text-[#1A1A18] truncate">{service.providerName}</p>
                            {service.providerEmail && (
                              <p className="text-xs text-[#AEAEA6] truncate">{service.providerEmail}</p>
                            )}
                          </div>
                        </TableCell>

                        {/* Price */}
                        <TableCell className="py-4">
                          {service.price ? (
                            <div>
                              <p className="text-sm font-semibold text-[#1A1A18]">
                                ${parseFloat(service.price).toLocaleString()}
                              </p>
                              <p className="text-xs text-[#AEAEA6]">{service.priceType ?? "fixed"}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-[#AEAEA6]">—</span>
                          )}
                        </TableCell>

                        {/* Delivery */}
                        <TableCell className="py-4">
                          <p className="text-sm text-[#1A1A18]">
                            {deliveryLabels[service.deliveryMethod ?? ""] ?? service.deliveryMethod ?? "—"}
                          </p>
                          {service.deliveryTimeframe && (
                            <p className="text-xs text-[#AEAEA6]">{service.deliveryTimeframe}</p>
                          )}
                        </TableCell>

                        {/* Bookings */}
                        <TableCell className="py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ShoppingCart className="w-3.5 h-3.5 text-[#AEAEA6]" />
                            <span className="text-sm font-medium text-[#1A1A18]">{service.bookingsCount ?? 0}</span>
                          </div>
                        </TableCell>

                        {/* Revenue */}
                        <TableCell className="py-4 text-center">
                          <p className="text-sm font-semibold text-[#1A1A18]">
                            ${parseFloat(service.totalRevenue ?? "0").toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                        </TableCell>

                        {/* Rating */}
                        <TableCell className="py-4 text-center">
                          {service.averageRating ? (
                            <div className="flex items-center justify-center gap-1">
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                              <span className="text-sm font-medium text-[#1A1A18]">
                                {parseFloat(service.averageRating).toFixed(1)}
                              </span>
                              <span className="text-xs text-[#AEAEA6]">({service.reviewCount ?? 0})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#AEAEA6]">—</span>
                          )}
                        </TableCell>

                        {/* Featured toggle */}
                        <TableCell className="py-4 text-center">
                          <button
                            onClick={() => featureMutation.mutate({ id: service.id, isFeatured: !service.isFeatured })}
                            disabled={featureMutation.isPending}
                            className="text-amber-500 hover:text-amber-600 disabled:opacity-50 transition-colors"
                            data-testid={`button-feature-${service.id}`}
                            title={service.isFeatured ? "Remove from featured" : "Mark as featured"}
                          >
                            {service.isFeatured ? (
                              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                            ) : (
                              <Star className="w-5 h-5 text-gray-300" />
                            )}
                          </button>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-4">
                          <Badge className={`${statusInfo.className} gap-1 font-medium`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-4 pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-actions-${service.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedService(service);
                                  setNewStatus(service.status);
                                  setStatusDialogOpen(true);
                                }}
                                data-testid={`menu-change-status-${service.id}`}
                              >
                                <TrendingUp className="w-4 h-4 mr-2" /> Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => featureMutation.mutate({ id: service.id, isFeatured: !service.isFeatured })}
                                data-testid={`menu-toggle-featured-${service.id}`}
                              >
                                {service.isFeatured ? (
                                  <><ToggleLeft className="w-4 h-4 mr-2" /> Unfeature</>
                                ) : (
                                  <><ToggleRight className="w-4 h-4 mr-2" /> Feature</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => {
                                  setSelectedService(service);
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`menu-delete-${service.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Change Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Service Status</DialogTitle>
            <DialogDescription>
              Update the status of <strong>{selectedService?.serviceName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger data-testid="select-new-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active — visible to customers</SelectItem>
                <SelectItem value="paused">Paused — hidden, provider can resume</SelectItem>
                <SelectItem value="draft">Draft — incomplete, not live</SelectItem>
                <SelectItem value="suspended">Suspended — admin action required</SelectItem>
              </SelectContent>
            </Select>
            {newStatus === "suspended" && (
              <p className="mt-3 text-sm text-red-600 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Suspending will hide this service immediately and notify the provider.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedService && changeStatusMutation.mutate({ id: selectedService.id, status: newStatus })}
              disabled={changeStatusMutation.isPending || newStatus === selectedService?.status}
              className="bg-[#1A1A18] hover:bg-[#2A2A28] text-white"
              data-testid="button-confirm-status-change"
            >
              {changeStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Apply Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{selectedService?.serviceName}</strong>? This cannot be undone and will remove all associated bookings data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => selectedService && deleteMutation.mutate(selectedService.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
