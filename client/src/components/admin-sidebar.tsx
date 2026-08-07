import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
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
  FolderKanban,
  Database,
  Link2,
  FileText,
  Cpu,
  MapPin,
  Banknote,
  Percent,
  Crown,
  PlugZap,
  Package,
  Layers,
  GitBranch,
  LayoutTemplate,
  ImageIcon,
  ShieldCheck,
  ShieldAlert,
  CalendarDays,
  Inbox,
  Sparkles,
  Wrench,
} from "lucide-react";

// D4 (UX audit Jul 29) admin nav regrouping — labels/grouping only, no route changes:
//  - "Reconciliation" (hosts the Chargebacks & Disputes queue) moved SYSTEM → MONEY and
//    relabeled "Reconciliation & Disputes" — disputes are a money queue, but had no nav
//    entry of their own and were buried under a SYSTEM label an admin wouldn't think to
//    check for a money problem.
//  - "QA Checklist" (a raw dev tool) moved out of SYSTEM's business queues into its own
//    "Developer" group at the bottom, so it no longer sits beside Reconciliation/Platform
//    APIs/Data as if it were another operational queue.
const menuGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      // Analytics + Tourism are now tabs on the Analytics page.
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { title: "Search", href: "/admin/search", icon: Search },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Experts", href: "/admin/experts", icon: UserCheck },
      { title: "Providers", href: "/admin/providers", icon: Building2 },
      { title: "Routing Queue", href: "/admin/routing-queue", icon: GitBranch },
      { title: "Concierge", href: "/admin/concierge-requests", icon: Sparkles },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Services", href: "/admin/services", icon: Package },
      { title: "Categories", href: "/admin/categories", icon: FolderKanban },
      { title: "Offering Types", href: "/admin/offering-types", icon: Layers },
      // Ready Made Trips: catalog + approvals are tabs on this page.
      { title: "Ready Made Trips", href: "/admin/expert-templates", icon: LayoutTemplate },
      { title: "Affiliates", href: "/admin/affiliate-partners", icon: Link2 },
      // Content: registry + placement map are tabs on this page.
      { title: "Content", href: "/admin/content-tracking", icon: FileText },
      { title: "Plans", href: "/admin/plans", icon: ClipboardList },
      { title: "Reviews", href: "/admin/review-moderation", icon: ShieldCheck },
      { title: "Event Review", href: "/admin/destination-events", icon: CalendarDays },
      { title: "Service Requests", href: "/admin/service-requests", icon: Inbox },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Revenue", href: "/admin/revenue", icon: DollarSign },
      { title: "Payouts", href: "/admin/payouts", icon: Banknote },
      // Fees points at the LIVE fee-bands editor; Category Fees is a tab there.
      { title: "Fees", href: "/admin/fee-bands", icon: Percent },
      { title: "Event Packages", href: "/admin/event-packages", icon: Crown },
      // D4: moved from System — this page's own headline queue is Chargebacks & Disputes,
      // a money problem, not a system-health one. Relabeled so "Disputes" is discoverable
      // directly in the nav instead of only after opening the page.
      { title: "Reconciliation & Disputes", href: "/admin/reconciliation", icon: ShieldAlert },
    ],
  },
  {
    label: "System",
    items: [
      { title: "AI Costs", href: "/admin/ai-costs", icon: Cpu },
      { title: "Platform APIs", href: "/admin/platform-providers", icon: PlugZap },
      // Data hub links the one-off backfill tools (neighborhoods, gem photos).
      { title: "Data", href: "/admin/data", icon: Database },
      { title: "Neighborhood Backfill", href: "/admin/neighborhood-backfill", icon: MapPin },
      { title: "Gem Photo Backfill", href: "/admin/gem-photo-backfill", icon: ImageIcon },
      { title: "Notifications", href: "/admin/notifications", icon: Bell },
      { title: "Settings", href: "/admin/system", icon: Settings },
    ],
  },
  {
    // D4: QA Checklist is a raw internal dev tool, not a business queue — pulled out of
    // System into its own clearly-labeled group instead of sitting beside Reconciliation/
    // Platform APIs/Data as if it were another operational surface.
    label: "Developer",
    items: [
      { title: "QA Checklist", href: "/admin/qa-checklist", icon: Wrench },
    ],
  },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { data: unreadNotifications = [] } = useQuery<any[]>({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/notifications", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: stripeIncompleteData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/providers/stripe-incomplete-count"],
    refetchInterval: 60_000,
  });

  const unreadCount = unreadNotifications.filter((n) => !n.isRead).length;
  const stripeIncompleteCount = stripeIncompleteData?.count ?? 0;

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "A"
    : "A";

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Admin"
    : "Admin";

  return (
    <Sidebar collapsible="icon" className="bg-white" style={{ borderRight: "1px solid #E8E8E2" }}>
      <SidebarHeader
        className="px-5 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3"
        style={{ borderBottom: "1px solid #E8E8E2", minHeight: 56 }}
      >
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-admin-logo">
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

      {/* D4 (UX audit Jul 29): "long sidebar with no below-fold cue" — the content list scrolls
          (SidebarContent is already overflow-auto) but gave no visual hint that there was more
          below the fold. A soft bottom fade-mask signals "keep scrolling" without changing any
          layout/routing. */}
      <SidebarContent
        className="px-2.5 py-3 group-data-[collapsible=icon]:px-1"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)", maskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)" }}
      >
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
                    (item.href !== "/admin/dashboard" && location.startsWith(item.href));
                  const isNotifications = item.href === "/admin/notifications";
                  const isProviders = item.href === "/admin/providers";
                  const badgeCount = isNotifications ? (unreadCount > 0 ? unreadCount : 0) : isProviders ? stripeIncompleteCount : 0;
                  const showBadge = badgeCount > 0;

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
                          data-testid={`nav-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
                        >
                          <item.icon className="w-4 h-4" style={{ opacity: isActive ? 1 : 0.7 }} />
                          <span className="text-[13px] flex-1">{item.title}</span>
                          {showBadge && (
                            <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none group-data-[collapsible=icon]:hidden">
                              {badgeCount}
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
                {displayName}
              </p>
              <p className="text-[11px] truncate" style={{ color: "#7A7A72" }}>
                {user.email}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-[#7A7A72] hover:text-[#E85D55] hover:bg-[rgba(232,85,85,0.08)] text-[13px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => logout()}
          data-testid="button-admin-logout"
        >
          <LogOut className="w-4 h-4 mr-2 group-data-[collapsible=icon]:mr-0" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
