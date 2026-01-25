import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  UserCheck, 
  Building2, 
  ClipboardList, 
  DollarSign, 
  BarChart3, 
  Search, 
  Bell, 
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  FolderKanban,
  Database,
  Link2,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
  { icon: Users, label: "Users", href: "/admin/users" },
  { icon: UserCheck, label: "Experts", href: "/admin/experts" },
  { icon: Building2, label: "Providers", href: "/admin/providers" },
  { icon: Link2, label: "Affiliates", href: "/admin/affiliate-partners" },
  { icon: FileText, label: "Content", href: "/admin/content-tracking" },
  { icon: FolderKanban, label: "Categories", href: "/admin/categories" },
  { icon: ClipboardList, label: "Plans", href: "/admin/plans" },
  { icon: DollarSign, label: "Revenue", href: "/admin/revenue" },
  { icon: BarChart3, label: "Analytics", href: "/admin/analytics" },
  { icon: Database, label: "Data", href: "/admin/data" },
  { icon: Search, label: "Search", href: "/admin/search" },
  { icon: Bell, label: "Notifications", href: "/admin/notifications" },
];

const bottomNavItems = [
  { icon: Settings, label: "System", href: "/admin/system" },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <aside 
      className={`h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
      data-testid="admin-sidebar"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Admin</span>
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setCollapsed(!collapsed)}
          className={collapsed ? "mx-auto" : ""}
          data-testid="button-toggle-sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Admin Info */}
      {!collapsed && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-gray-900 text-white">AD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">Admin User</p>
              <p className="text-xs text-gray-500">Platform Administrator</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive 
                      ? "bg-gray-900 text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  } ${collapsed ? "justify-center" : ""}`}
                  data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="p-2 border-t border-gray-200">
        <div className="space-y-1">
          {bottomNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive 
                      ? "bg-gray-900 text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  } ${collapsed ? "justify-center" : ""}`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </div>
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-gray-700 hover:bg-gray-100 ${collapsed ? "justify-center" : ""}`}
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
