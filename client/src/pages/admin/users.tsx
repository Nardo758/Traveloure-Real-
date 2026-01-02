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
  UserPlus,
  MoreVertical,
  Mail,
  Ban,
  Eye
} from "lucide-react";
import { useState } from "react";

const users = [
  {
    id: 1,
    name: "Sarah Mitchell",
    email: "sarah.m@email.com",
    role: "user",
    status: "active",
    joined: "Jan 2, 2026",
    trips: 5,
    spent: "$2,450",
  },
  {
    id: 2,
    name: "John Davidson",
    email: "john.d@email.com",
    role: "user",
    status: "active",
    joined: "Jan 1, 2026",
    trips: 2,
    spent: "$850",
  },
  {
    id: 3,
    name: "Emily Chen",
    email: "emily.c@email.com",
    role: "expert",
    status: "active",
    joined: "Dec 15, 2025",
    trips: 0,
    spent: "$0",
  },
  {
    id: 4,
    name: "Michael Torres",
    email: "michael.t@email.com",
    role: "user",
    status: "suspended",
    joined: "Nov 20, 2025",
    trips: 8,
    spent: "$4,200",
  },
  {
    id: 5,
    name: "Lisa Parker",
    email: "lisa.p@email.com",
    role: "ea",
    status: "active",
    joined: "Oct 10, 2025",
    trips: 0,
    spent: "$0",
  },
  {
    id: 6,
    name: "Grand Estate Venue",
    email: "events@grandestate.com",
    role: "provider",
    status: "active",
    joined: "Mar 5, 2022",
    trips: 0,
    spent: "$0",
  },
];

const roleColors: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 border-blue-200",
  expert: "bg-purple-100 text-purple-700 border-purple-200",
  ea: "bg-amber-100 text-amber-700 border-amber-200",
  provider: "bg-green-100 text-green-700 border-green-200",
  admin: "bg-gray-900 text-white",
};

const roleLabels: Record<string, string> = {
  user: "User",
  expert: "Expert",
  ea: "EA",
  provider: "Provider",
  admin: "Admin",
};

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === "active").length,
    suspended: users.filter(u => u.status === "suspended").length,
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
                        <Badge className={roleColors[user.role]}>
                          {roleLabels[user.role]}
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
                          <Button variant="ghost" size="icon" data-testid={`button-view-${user.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-email-${user.id}`}>
                            <Mail className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-more-${user.id}`}>
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
    </AdminLayout>
  );
}
