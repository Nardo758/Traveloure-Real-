import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  CalendarCheck,
  Package,
  DollarSign,
  TrendingUp,
  Calendar,
  Building,
  Settings,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const navGroups = [
  {
    label: "WORK",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/provider/dashboard" },
      { icon: Calendar, label: "Calendar", href: "/provider/calendar" },
      { icon: CalendarCheck, label: "Bookings", href: "/provider/bookings" },
      { icon: MessageSquare, label: "Messages", href: "/provider/messages" },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { icon: Package, label: "Services", href: "/provider/services" },
      { icon: DollarSign, label: "Earnings", href: "/provider/earnings" },
      { icon: TrendingUp, label: "Performance", href: "/provider/performance" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { icon: Building, label: "Profile", href: "/provider/profile" },
      { icon: Settings, label: "Settings", href: "/provider/settings" },
    ],
  },
];

export function ProviderSidebar() {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  // Get initials for avatar
  const getInitials = () => {
    if (user?.businessName) {
      return user.businessName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    }
    if (user?.firstName && user?.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    return "SP";
  };

  return (
    <aside 
      className={`h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
      data-testid="provider-sidebar"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF385C] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SP</span>
            </div>
            <span className="font-semibold text-gray-900">Provider</span>
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

      {/* Business Info */}
      {!collapsed && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C]">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {user?.businessName || `${user?.firstName} ${user?.lastName}`.trim() || "Service Provider"}
              </p>
              <p className="text-xs text-gray-500">Service Provider</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 mb-2">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? "bg-[#FF385C] text-white"
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
          </div>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-2 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-gray-700 hover:bg-gray-100 ${collapsed ? "justify-center" : ""}`}
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
