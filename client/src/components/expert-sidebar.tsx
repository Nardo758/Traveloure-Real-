import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Home,
  Bot,
  MessageSquare,
  Users,
  Calendar,
  Briefcase,
  DollarSign,
  BarChart3,
  User,
  LogOut,
  Compass,
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", href: "/expert/dashboard", icon: Home },
  { title: "AI Assistant", href: "/expert/ai-assistant", icon: Bot },
  { title: "Messages", href: "/expert/messages", icon: MessageSquare },
  { title: "Clients", href: "/expert/clients", icon: Users },
  { title: "Bookings", href: "/expert/bookings", icon: Calendar },
  { title: "Services", href: "/expert/services", icon: Briefcase },
  { title: "Earnings", href: "/expert/earnings", icon: DollarSign },
  { title: "Performance", href: "/expert/performance", icon: BarChart3 },
  { title: "Profile", href: "/expert/profile", icon: User },
];

export function ExpertSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "EX"
    : "EX";

  return (
    <Sidebar className="border-r border-gray-200">
      <SidebarHeader className="p-4 border-b border-gray-200">
        <Link href="/" data-testid="link-expert-logo">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#FF385C] flex items-center justify-center">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-gray-900">Traveloure</span>
              <span className="ml-2 text-xs bg-[#FF385C] text-white px-2 py-0.5 rounded-full">
                EXPERT
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href !== "/expert/dashboard" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        isActive
                          ? "bg-[#FF385C]/10 text-[#FF385C] font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <Link
                        href={item.href}
                        data-testid={`link-expert-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <item.icon className={`w-5 h-5 ${isActive ? "text-[#FF385C]" : "text-gray-500"}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-10 w-10 border-2 border-[#FF385C]/20">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C] font-medium">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-500 truncate">Travel Expert</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-gray-600 hover:text-red-600 hover:bg-red-50"
          onClick={() => logout()}
          data-testid="button-expert-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
