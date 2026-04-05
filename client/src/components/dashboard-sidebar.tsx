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
  ShoppingCart,
  Package,
  Sparkles,
} from "lucide-react";

const menuGroups = [
  {
    label: "Plan",
    items: [
      { title: "Home", href: "/dashboard", icon: Home },
      { title: "My plans", href: "/my-trips", icon: Calendar },
      { title: "Plan new", href: "/experiences", icon: Sparkles },
      { title: "AI planner", href: "/ai-assistant", icon: Bot },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { title: "Discover", href: "/discover", icon: Users },
      { title: "Experts", href: "/chat", icon: Compass },
      { title: "Bookings", href: "/bookings", icon: Package },
      { title: "Cart", href: "/cart", icon: ShoppingCart },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Messages", href: "/chat", icon: MessageSquare, badge: true },
      { title: "Notifications", href: "/notifications", icon: Bell, badge: true },
      { title: "Credits", href: "/credits", icon: CreditCard },
      { title: "Profile", href: "/profile", icon: User },
    ],
  },
];

export function DashboardSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "U";

  return (
    <Sidebar collapsible="icon" className="bg-white" style={{ borderRight: "1px solid #E8E8E2" }}>
      <SidebarHeader className="px-5 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3" style={{ borderBottom: "1px solid #E8E8E2", minHeight: 56 }}>
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-sidebar-logo">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: "#E85D55" }}
          >
            <span className="text-white text-[16px] font-bold">T</span>
          </div>
          <span className="text-[16px] font-semibold group-data-[collapsible=icon]:hidden" style={{ color: "#1A1A18", letterSpacing: -0.3 }}>
            Traveloure
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-3 group-data-[collapsible=icon]:px-1">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label} className="mb-3 p-0">
            <SidebarGroupLabel
              className="text-[10px] font-semibold uppercase tracking-[1.2px] px-2.5 mb-1 h-auto group-data-[collapsible=icon]:hidden"
              style={{ color: "#AEAEA6" }}
            >
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location === item.href ||
                    (item.href === "/dashboard" && location === "/dashboard") ||
                    (item.href === "/my-trips" && (
                      location.startsWith("/my-trips") ||
                      location.startsWith("/itinerary") ||
                      location.startsWith("/my-itinerary")
                    )) ||
                    (item.href !== "/dashboard" && item.href !== "/my-trips" && location.startsWith(item.href));

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={
                          isActive
                            ? "bg-[rgba(232,85,85,0.08)] text-[#E85D55] font-semibold"
                            : "text-[#7A7A72] hover:text-[#1A1A18] hover:bg-[#F3F3EE]"
                        }
                      >
                        <Link href={item.href} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                          <item.icon className="w-4 h-4" style={{ opacity: isActive ? 1 : 0.7 }} />
                          <span className="text-[13px]">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3.5 py-3 group-data-[collapsible=icon]:px-1.5" style={{ borderTop: "1px solid #E8E8E2" }}>
        {user && (
          <div className="flex items-center gap-2.5 mb-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mb-0">
            <div
              className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #E85D55, #1E3A5F)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[13px] font-medium truncate" style={{ color: "#1A1A18" }}>
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[11px] truncate" style={{ color: "#7A7A72" }}>{user.email}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-[#7A7A72] hover:text-[#E85D55] hover:bg-[rgba(232,85,85,0.08)] text-[13px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => logout()}
          data-testid="button-sidebar-logout"
        >
          <LogOut className="w-4 h-4 mr-2 group-data-[collapsible=icon]:mr-0" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
