import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { useUnreadMessageCount } from "@/hooks/use-message-read";
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
  Users,
  User,
  LogOut,
  Compass,
  ShoppingCart,
  Package,
  Crown,
  Inbox,
} from "lucide-react";

// R-G (CONSOLE_REALIGN_BRIEF.md sidebar 13→10): "Plan new" is retired — the intake panel
// (client/src/components/intake-panel.tsx) opens from CTAs elsewhere (dashboard "New
// experience", my-trips "+ New plan"), not from a sidebar destination. "Messages" and
// "Notifications" are retired — Messages folds into the Inbox module's Messages tab (/chat
// itself stays routed as the thread page, just no longer has its own sidebar entry) and
// Notifications' unique functions rehome into Inbox's Updates tab + the bell popover (E4).
// "Experts" is repointed from /chat (an unexamined first-commit artifact) to /experts. Final
// traveler sidebar (10 entries): Home, My plans, AI planner, Discover, Experts, Bookings,
// My events, Trip Cart, Inbox, Profile.
const menuGroups = [
  {
    label: "Plan",
    items: [
      { title: "Home", href: "/dashboard", icon: Home },
      { title: "My plans", href: "/my-trips", icon: Calendar },
      { title: "AI planner", href: "/ai-assistant", icon: Bot },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { title: "Discover", href: "/discover", icon: Users },
      { title: "Experts", href: "/experts", icon: Compass },
      { title: "Bookings", href: "/bookings", icon: Package },
      { title: "My events", href: "/my-events", icon: Crown },
      { title: "Trip Cart", href: "/cart", icon: ShoppingCart },
    ],
  },
  {
    label: "Inbox",
    items: [
      // W5-E: unified Messages + Updates. Badge is the SUM of two real, independently-fetched
      // counts — unread notifications (GET /api/notifications/unread-count, the same source the
      // bell reads) and unread received messages (GET /api/messages/unread/count, the real
      // read-tracking API wired up in this lane) — never a fabricated number.
      { title: "Inbox", href: "/inbox", icon: Inbox },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Profile", href: "/profile", icon: User },
    ],
  },
];

export function DashboardSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "U";

  // W5-E: the SAME real unread-notification count the bell (notification-bell.tsx) reads,
  // summed with the real unread-message count (GET /api/messages/unread/count) — two real
  // sources, never a fabricated total.
  const { data: unreadNotifications } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30000,
  });
  const { data: unreadMessages } = useUnreadMessageCount(!!user);
  const inboxUnreadCount = (unreadNotifications?.count ?? 0) + (unreadMessages?.count ?? 0);

  return (
    <Sidebar collapsible="icon" className="bg-white" style={{ borderRight: "1px solid #E8E8E2" }}>
      <SidebarHeader className="px-5 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3" style={{ borderBottom: "1px solid #E8E8E2", minHeight: 56 }}>
        <Link href="/" className="flex items-center" data-testid="link-sidebar-logo">
          <div className="group-data-[collapsible=icon]:hidden">
            <TraveloureLogo />
          </div>
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
                      location.startsWith("/my-itinerary") ||
                      location.startsWith("/plans")
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
                          <span className="text-[13px] flex-1">{item.title}</span>
                          {item.href === "/inbox" && inboxUnreadCount > 0 && (
                            <span
                              className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0"
                              style={{ background: "#E85D55" }}
                              data-testid="badge-sidebar-inbox-unread"
                            >
                              {inboxUnreadCount > 9 ? "9+" : inboxUnreadCount}
                            </span>
                          )}
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
