import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Filter,
  Users,
  MoreVertical,
  Mail,
  Ban,
  Eye,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isExpertRole, isProviderRole } from "@shared/roles";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  suspensionReason?: string | null;
  joined: string;
  trips: number;
  spent: string;
}

// Audit A6: the previous maps/filter used client-only routing tokens ("provider", "ea") that
// never match a real stored `users.role` value (shared/roles.ts documents this exact
// always-false-comparison class) — badges rendered blank and the Provider/EA filter tabs
// always matched 0 rows. Per-row display now covers every canonical stored role
// (shared/roles.ts EXPERT_ROLES/PROVIDER_ROLES + user/executive_assistant/admin); the filter
// tabs match by ROLE FAMILY (isExpertRole/isProviderRole) client-side, since a single-value
// server `eq()` can't express "any of the 4 expert-family roles" — the same reason `role` is
// no longer sent to the server as a query param (search still is).
const ROLE_DISPLAY: Record<string, { label: string; className: string }> = {
  user: { label: "Traveler", className: "bg-blue-100 text-blue-700 border-blue-200" },
  expert: { label: "Expert", className: "bg-purple-100 text-purple-700 border-purple-200" },
  local_expert: { label: "Local Expert", className: "bg-purple-100 text-purple-700 border-purple-200" },
  travel_expert: { label: "Trip Planner", className: "bg-purple-100 text-purple-700 border-purple-200" },
  event_planner: { label: "Event Planner", className: "bg-purple-100 text-purple-700 border-purple-200" },
  service_provider: { label: "Provider", className: "bg-green-100 text-green-700 border-green-200" },
  executive_assistant: { label: "EA", className: "bg-amber-100 text-amber-700 border-amber-200" },
  admin: { label: "Admin", className: "bg-gray-900 text-white" },
};

function getRoleDisplay(role: string) {
  return ROLE_DISPLAY[role] ?? { label: role || "Unknown", className: "bg-gray-100 text-gray-700 border-gray-200" };
}

interface RoleFilterOption {
  key: string;
  label: string;
  match: (role: string) => boolean;
}

const ROLE_FILTER_OPTIONS: RoleFilterOption[] = [
  { key: "user", label: "Traveler", match: (r) => r === "user" },
  { key: "expert", label: "Expert", match: (r) => isExpertRole(r) },
  { key: "provider", label: "Provider", match: (r) => isProviderRole(r) },
  { key: "ea", label: "EA", match: (r) => r === "executive_assistant" },
  { key: "admin", label: "Admin", match: (r) => r === "admin" },
];

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewUser, setViewUser] = useState<AdminUserRow | null>(null);
  const [suspendUser, setSuspendUser] = useState<AdminUserRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: usersData, isLoading } = useQuery<{
    users: AdminUserRow[];
    total: number;
    stats?: { active: number; suspended: number; newToday: number };
    page: number;
    limit: number;
  }>({
    // Send the browser's IANA timezone so the server computes "New Today"
    // against the admin's local day boundary instead of server UTC.
    queryKey: ["/api/admin/users", {
      search: searchQuery,
      page,
      role: roleFilter ?? undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }],
    placeholderData: (prev) => prev,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/suspend`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Account suspended", description: "The user's sessions were terminated and they can no longer sign in." });
      setSuspendUser(null);
      setSuspendReason("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to suspend account", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/unsuspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Account reactivated", description: "The user can sign in again." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to reactivate account", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout title="User Management">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  const users = usersData?.users ?? [];

  const activeRoleFilter = ROLE_FILTER_OPTIONS.find((o) => o.key === roleFilter) ?? null;

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !activeRoleFilter || activeRoleFilter.match(user.role);
    return matchesSearch && matchesRole;
  });

  const pageLimit = usersData?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil((usersData?.total ?? 0) / pageLimit));
  const currentPage = usersData?.page ?? page;

  // Active/Suspended/New Today come from server-side aggregates over the WHOLE
  // filtered set, so the numbers stay stable across pages (previously they were
  // computed from just the visible 50-row page).
  const stats = {
    total: usersData?.total ?? users.length,
    active: usersData?.stats?.active ?? 0,
    suspended: usersData?.stats?.suspended ?? 0,
    newToday: usersData?.stats?.newToday ?? 0,
  };

  return (
    <AdminLayout title="User Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Users</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-suspended">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.suspended}</p>
              <p className="text-sm text-gray-500">Suspended</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-new">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.newToday}</p>
              <p className="text-sm text-gray-500">New Today</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={roleFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setRoleFilter(null); setPage(1); }}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                {ROLE_FILTER_OPTIONS.map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={roleFilter === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setRoleFilter(key); setPage(1); }}
                    data-testid={`button-filter-${key}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              All Users ({filteredUsers.length})
            </CardTitle>
            {/* "Add User" button removed (task #1004 audit): it had no functional
                wire-up (no onClick / dialog / route) — a dead write-affordance an
                admin could click with zero effect. Re-add alongside a real
                user-creation flow if/when one is built. */}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">User</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Role</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Joined</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Trips</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Spent</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 last:border-0" data-testid={`row-user-${user.id}`}>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-gray-100 text-gray-600 text-xs">
                              {user.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge className={getRoleDisplay(user.role).className}>
                          {getRoleDisplay(user.role).label}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          className={user.status === "active"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-red-100 text-red-700 border-red-200"
                          }
                        >
                          {user.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-gray-600">{user.joined}</td>
                      <td className="py-3 px-2 text-gray-600">{user.trips}</td>
                      <td className="py-3 px-2 text-gray-600">{user.spent}</td>
                      <td className="py-3 px-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewUser(user)}
                            data-testid={`button-view-${user.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-email-${user.id}`}
                          >
                            <a href={`mailto:${user.email}`} aria-label={`Email ${user.name}`}>
                              <Mail className="w-4 h-4" />
                            </a>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-more-${user.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {user.status === "suspended" ? (
                                <DropdownMenuItem
                                  onClick={() => unsuspendMutation.mutate(user.id)}
                                  disabled={unsuspendMutation.isPending}
                                  data-testid={`menu-reactivate-${user.id}`}
                                >
                                  Reactivate account
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => { setSuspendReason(""); setSuspendUser(user); }}
                                  disabled={user.role === "admin"}
                                  className="text-red-600 focus:text-red-600"
                                  data-testid={`menu-suspend-${user.id}`}
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  Suspend account
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination: server pages at `limit` (default 50); without controls,
                only the newest page of users is ever reachable in the UI. */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-500" data-testid="text-page-info">
                  Page {currentPage} of {totalPages} · {usersData?.total ?? 0} users
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User detail dialog */}
      <Dialog open={!!viewUser} onOpenChange={(open) => { if (!open) setViewUser(null); }}>
        <DialogContent data-testid="dialog-user-detail">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Account overview for {viewUser?.name}</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-gray-100 text-gray-600">
                    {viewUser.name.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900" data-testid="text-detail-name">{viewUser.name}</p>
                  <p className="text-sm text-gray-500" data-testid="text-detail-email">{viewUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Role</p>
                  <Badge className={getRoleDisplay(viewUser.role).className}>
                    {getRoleDisplay(viewUser.role).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <Badge
                    className={viewUser.status === "active"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-red-100 text-red-700 border-red-200"}
                    data-testid="badge-detail-status"
                  >
                    {viewUser.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-gray-500">Joined</p>
                  <p className="text-gray-900">{viewUser.joined}</p>
                </div>
                <div>
                  <p className="text-gray-500">Trips</p>
                  <p className="text-gray-900">{viewUser.trips}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Spent</p>
                  <p className="text-gray-900">{viewUser.spent}</p>
                </div>
              </div>
              {viewUser.status === "suspended" && viewUser.suspensionReason && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm">
                  <p className="font-medium text-red-700">Suspension reason</p>
                  <p className="text-red-600" data-testid="text-detail-suspension-reason">{viewUser.suspensionReason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)} data-testid="button-detail-close">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend confirmation dialog */}
      <Dialog open={!!suspendUser} onOpenChange={(open) => { if (!open) { setSuspendUser(null); setSuspendReason(""); } }}>
        <DialogContent data-testid="dialog-suspend-user">
          <DialogHeader>
            <DialogTitle>Suspend account</DialogTitle>
            <DialogDescription>
              {suspendUser?.name} ({suspendUser?.email}) will be signed out immediately and blocked
              from signing in until reactivated. Their data is not deleted.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for suspension (required)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            maxLength={500}
            data-testid="input-suspend-reason"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setSuspendUser(null); setSuspendReason(""); }}
              data-testid="button-suspend-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!suspendReason.trim() || suspendMutation.isPending}
              onClick={() => suspendUser && suspendMutation.mutate({ id: suspendUser.id, reason: suspendReason.trim() })}
              data-testid="button-suspend-confirm"
            >
              {suspendMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Suspend account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
