import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  Calendar,
  Bot,
  MessageSquare,
  Users,
  CreditCard,
  User,
  Bell,
  LogOut,
  Compass,
} from "lucide-react";

const menuItems = [
  { title: "Home", href: "/dashboard", icon: Home },
  { title: "All Events", href: "/my-trips", icon: Calendar },
  { title: "AI Planner", href: "/ai-assistant", icon: Bot },
  { title: "Messages", href: "/chat", icon: MessageSquare },
  { title: "Experts", href: "/explore", icon: Users },
  { title: "Credits", href: "/credits", icon: CreditCard },
  { title: "Profile", href: "/profile", icon: User },
  { title: "Notifications", href: "/notifications", icon: Bell },
];

export function DashboardSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar className="border-r border-[#E5E7EB]">
      <SidebarHeader className="p-4 border-b border-[#E5E7EB]">
        <Link href="/" className="flex items-center gap-2" data-testid="link-sidebar-logo">
          <div className="bg-[#FF385C] p-1.5 rounded-lg">
            <Compass className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-[#111827] dark:text-white">Traveloure</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide px-4">
            User Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href === "/dashboard" && location === "/dashboard") ||
                  (item.href !== "/dashboard" && location.startsWith(item.href));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? "bg-[#FFE3E8] text-[#FF385C]" : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]"}
                    >
                      <Link href={item.href} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="w-5 h-5" />
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

      <SidebarFooter className="p-4 border-t border-[#E5E7EB]">
        {user && (
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10 border-2 border-[#E5E7EB]">
              <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
              <AvatarFallback className="bg-[#FFE3E8] text-[#FF385C] font-semibold">
                {user.firstName?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#111827] dark:text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-[#6B7280] truncate">{user.email}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-[#6B7280] hover:text-[#FF385C] hover:bg-[#FFE3E8]"
          onClick={() => logout()}
          data-testid="button-sidebar-logout"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
