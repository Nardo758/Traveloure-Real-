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
  Bot,
  MessageSquare,
  Users,
  Calendar,
  Briefcase,
  DollarSign,
  BarChart3,
  User,
  LogOut,
  Palette,
  Settings,
  Link2,
} from "lucide-react";

function buildMenuGroups(expertType?: string | null) {
  const isEventPlanner = expertType === "event_planner";
  const isEA = expertType === "executive_assistant";

  return [
    {
      label: "Work",
      items: [
        { title: "Dashboard", href: "/expert/dashboard", icon: Home },
        { title: isEventPlanner ? "Events" : "Bookings", href: "/expert/bookings", icon: Calendar },
        { title: isEA ? "Executives" : "Clients", href: "/expert/clients", icon: Users },
        { title: "Messages", href: "/expert/messages", icon: MessageSquare },
      ],
    },
    {
      label: "Business",
      items: [
        { title: isEventPlanner ? "Packages" : "Services", href: "/expert/services", icon: Briefcase },
        { title: "Booking Partners", href: "/expert/booking-partners", icon: Link2 },
        { title: isEventPlanner ? "Promo Content" : "Content Studio", href: "/expert/content-studio", icon: Palette },
        { title: "Analytics", href: "/expert/analytics", icon: BarChart3 },
        { title: "Earnings", href: "/expert/earnings", icon: DollarSign },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "AI Assistant", href: "/expert/ai-assistant", icon: Bot },
        { title: "Profile", href: "/expert/profile", icon: User },
        { title: "Settings", href: "/expert/settings", icon: Settings },
      ],
    },
  ];
}

const roleLabel: Record<string, string> = {
  travel_expert: "Travel Expert",
  local_expert: "Local Expert",
  event_planner: "Event Planner",
  executive_assistant: "Executive Assistant",
  expert: "Expert",
};

export function ExpertSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const menuGroups = buildMenuGroups(user?.role);

  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "E";

  return (
    <Sidebar collapsible="icon" className="bg-white" style={{ borderRight: "1px solid #E8E8E2" }}>
      <SidebarHeader
        className="px-5 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3"
        style={{ borderBottom: "1px solid #E8E8E2", minHeight: 56 }}
      >
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-expert-logo">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{ background: "#E85D55" }}
          >
            <span className="text-white text-[16px] font-bold">T</span>
          </div>
          <span
            className="text-[16px] font-semibold group-data-[collapsible=icon]:hidden"
            style={{ color: "#1A1A18", letterSpacing: -0.3 }}
          >
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
                  const isActive =
                    location === item.href ||
                    (item.href !== "/expert/dashboard" && location.startsWith(item.href));

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
                        <Link
                          href={item.href}
                          data-testid={`link-expert-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
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

      <SidebarFooter
        className="px-3.5 py-3 group-data-[collapsible=icon]:px-1.5"
        style={{ borderTop: "1px solid #E8E8E2" }}
      >
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
              <p className="text-[11px] truncate" style={{ color: "#E85D55" }}>
                {roleLabel[user.role ?? ""] ?? "Expert"}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-[#7A7A72] hover:text-[#E85D55] hover:bg-[rgba(232,85,85,0.08)] text-[13px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => logout()}
          data-testid="button-expert-logout"
        >
          <LogOut className="w-4 h-4 mr-2 group-data-[collapsible=icon]:mr-0" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
