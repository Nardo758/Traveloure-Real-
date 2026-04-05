import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Filter,
  Users,
  UserPlus,
  MoreVertical,
  Mail,
  Ban,
  Eye,
  Loader2,
  Shield,
  AlertTriangle,
  X,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joined: string;
  trips: number;
  spent: string;
}

const roleColors: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 border-blue-200",
  travel_expert: "bg-purple-100 text-purple-700 border-purple-200",
  local_expert: "bg-indigo-100 text-indigo-700 border-indigo-200",
  expert: "bg-purple-100 text-purple-700 border-purple-200",
  event_planner: "bg-pink-100 text-pink-700 border-pink-200",
  service_provider: "bg-green-100 text-green-700 border-green-200",
  executive_assistant: "bg-amber-100 text-amber-700 border-amber-200",
  ea: "bg-amber-100 text-amber-700 border-amber-200",
  admin: "bg-gray-900 text-white",
};

const roleLabels: Record<string, string> = {
  user: "User",
  travel_expert: "Travel Expert",
  local_expert: "Local Expert",
  expert: "Expert",
  event_planner: "Event Planner",
  service_provider: "Service Provider",
  executive_assistant: "Executive Assistant",
  ea: "EA",
  admin: "Admin",
};

const roleOptions = [
  { value: "user", label: "User" },
  { value: "travel_expert", label: "Travel Expert" },
  { value: "local_expert", label: "Local Expert" },
  { value: "event_planner", label: "Event Planner" },
  { value: "service_provider", label: "Service Provider" },
  { value: "executive_assistant", label: "Executive Assistant" },
  { value: "admin", label: "Admin" },
];

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState<User | null>(null);
  const [suspendAction, setSuspendAction] = useState<"suspend" | "unsuspend" | null>(null);
  const queryClient = useQueryClient();

  const { data: usersData, isLoading } = useQuery<{
    users: User[];
    total: number;
  }>({ queryKey: ["/api/admin/users", { search: searchQuery, role: roleFilter }] });

  // Suspend/Unsuspend mutation
  const suspendMutation = useMutation({
    mutationFn: async (params: { userId: string; suspended: boolean }) => {
      const response = await fetch(`/api/admin/users/${params.userId}/suspend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: params.suspended }),
      });
      if (!response.ok) throw new Error("Failed to update suspension status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSuspendDialogOpen(false);
      setSelectedUserForAction(null);
    },
  });

  // Role change mutation
  const roleMutation = useMutation({
    mutationFn: async (params: { userId: string; role: string }) => {
      const response = await fetch(`/api/admin/users/${params.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: params.role }),
      });
      if (!response.ok) throw new Error("Failed to change role");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (selectedUser) {
        setDetailPanelOpen(false);
        setSelectedUser(null);
      }
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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: usersData?.total ?? users.length,
    active: users.filter((u) => u.status === "active").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  };

  const handleViewUser = (user: User) => {
    setSelectedUser(user);
    setDetailPanelOpen(true);
  };

  const handleSuspendClick = (user: User, action: "suspend" | "unsuspend") => {
    setSelectedUserForAction(user);
    setSuspendAction(action);
    setSuspendDialogOpen(true);
  };

  const handleConfirmSuspend = () => {
    if (selectedUserForAction && suspendAction) {
      suspendMutation.mutate({
        userId: selectedUserForAction.id,
        suspended: suspendAction === "suspend",
      });
    }
  };

  const handleRoleChange = (newRole: string) => {
    if (selectedUser) {
      roleMutation.mutate({
        userId: selectedUser.id,
        role: newRole,
      });
    }
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
              <p className="text-2xl font-bold text-blue-600">28</p>
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={roleFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRoleFilter(null)}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                {Object.entries(roleLabels).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={roleFilter === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRoleFilter(key)}
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
            <Button size="sm" data-testid="button-add-user">
              <UserPlus className="w-4 h-4 mr-2" /> Add User
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      User
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      Role
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      Joined
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      Trips
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">
                      Spent
                    </th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-b border-gray-100 last:border-0 ${
                        user.status === "suspended" ? "opacity-50" : ""
                      }`}
                      data-testid={`row-user-${user.id}`}
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-gray-100 text-gray-600 text-xs">
                              {user.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge className={roleColors[user.role]}>
                          {roleLabels[user.role]}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          className={
                            user.status === "active"
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
                            onClick={() => handleViewUser(user)}
                            data-testid={`button-view-${user.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleSuspendClick(
                                user,
                                user.status === "active" ? "suspend" : "unsuspend"
                              )
                            }
                            data-testid={`button-suspend-${user.id}`}
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-more-${user.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Detail Panel */}
      <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
        <SheetContent side="right" className="w-full sm:w-96">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
          </SheetHeader>

          {selectedUser && (
            <div className="space-y-6 py-6">
              {/* User Info */}
              <div className="text-center">
                <Avatar className="h-16 w-16 mx-auto mb-4">
                  <AvatarFallback className="bg-gray-900 text-white text-lg">
                    {selectedUser.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedUser.name}
                </h3>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>

              {/* Details Grid */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Role
                  </label>
                  <Badge className={`mt-1 ${roleColors[selectedUser.role]}`}>
                    {roleLabels[selectedUser.role]}
                  </Badge>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Status
                  </label>
                  <Badge
                    className={`mt-1 ${
                      selectedUser.status === "active"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-red-100 text-red-700 border-red-200"
                    }`}
                  >
                    {selectedUser.status}
                  </Badge>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Joined
                  </label>
                  <p className="text-sm text-gray-900 mt-1">{selectedUser.joined}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      Trips
                    </label>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {selectedUser.trips}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">
                      Spent
                    </label>
                    <p className="text-lg font-bold text-gray-900 mt-1">
                      {selectedUser.spent}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-2">
                    Change Role
                  </label>
                  <Select
                    value={selectedUser.role}
                    onValueChange={handleRoleChange}
                    disabled={roleMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant={
                    selectedUser.status === "active" ? "destructive" : "default"
                  }
                  className="w-full"
                  onClick={() =>
                    handleSuspendClick(
                      selectedUser,
                      selectedUser.status === "active" ? "suspend" : "unsuspend"
                    )
                  }
                  disabled={suspendMutation.isPending}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedUser.status === "active" ? "Suspend User" : "Unsuspend User"}
                </Button>
              </div>
            </div>
          )}

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setDetailPanelOpen(false)}
            >
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            {suspendAction === "suspend" ? "Suspend User" : "Unsuspend User"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {suspendAction === "suspend"
              ? `Are you sure you want to suspend ${selectedUserForAction?.name}? They will no longer be able to access their account.`
              : `Are you sure you want to unsuspend ${selectedUserForAction?.name}? They will regain access to their account.`}
          </AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmSuspend}
            disabled={suspendMutation.isPending}
            className={
              suspendAction === "suspend"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            }
          >
            {suspendMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : suspendAction === "suspend" ? (
              "Suspend"
            ) : (
              "Unsuspend"
            )}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
