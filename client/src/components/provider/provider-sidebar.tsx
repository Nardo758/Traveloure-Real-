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
  CalendarCheck,
  CalendarDays,
  DollarSign,
  LayoutGrid,
  Settings,
  LogOut,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";

// Console IA C9 (§17 17→9 collapse): the provider console adopts the SAME nine-module IA the
// expert console reached in PR-Ca/PR-Cb — Today · Calendar · Inbox · Catalog · Money ·
// Customers · Performance · Settings — with ONE deliberate exception: Workstation (the
// Provider Product Builder) stays OUT. It is a separately-gated lane awaiting its own
// bundle-schema + money-path ratifications (§17 "GATED separately"); no placeholder entry.
const menuGroups = [
  {
    label: "Work",
    items: [
      // C9: "Dashboard" relabeled "Today" (module 1, ops home) — route unchanged; the page
      // already leads with today's bookings + pending action items.
      { title: "Today", href: "/provider/dashboard", icon: Home },
      // C9: /provider/calendar is now the Channel Calendar (the ratified 9th module — the
      // expert C3 pattern on GET /api/me/calendar, provider-real chips only). The old
      // availability-editor sheets there were non-persisting previews; REAL slot editing
      // moved to its ratified Catalog home (/provider/services availability section).
      { title: "Calendar", href: "/provider/calendar", icon: CalendarDays },
      // C9 KEPT (Inbox seat, honest label): "Bookings" is the provider console's actionable
      // queue — pending accept/decline (PATCH /api/provider/bookings/:id/status), the
      // visa-status management dialog, stats, and per-booking message deep-links into /chat.
      // A provider Inbox page (queue + history + messages tabs, the expert C5 shape) does
      // not exist yet; relabeling this "Inbox" without that absorption would be a costume.
      // KEEP until a real provider Inbox absorbs it.
      { title: "Bookings", href: "/provider/bookings", icon: CalendarCheck },
      // C9 KEPT: Messages points straight at /chat (the thread home — ChatWithRoleLayout
      // applies ProviderLayout for providers; /provider/messages was already a bare
      // redirect there). The expert C5 retirement of this entry relied on Inbox's
      // recent-threads tab, which the provider console doesn't have yet — without this
      // entry the only paths into /chat would be per-booking message buttons. KEEP until
      // the provider Inbox absorption above lands.
      { title: "Messages", href: "/chat", icon: MessageSquare },
    ],
  },
  {
    label: "Business",
    items: [
      // C9: "My Offerings" relabeled "Catalog" (module 5, "what I sell") — route unchanged.
      // The page absorbed the storefront header (/p/:handle management), availability slot
      // editing (the ratified Catalog placement), and Share & Promote's creation half
      // (per-service share kits + posting opportunities via the shared
      // components/backoffice/share-tools.tsx — the same absorption expert C2 did).
      { title: "Catalog", href: "/provider/services", icon: LayoutGrid },
      // C9: "Share & Promote" entry RETIRED — its unique functions live on Catalog (per-
      // service share kit, posting opportunities, storefront share); the measurement half
      // (LinkAnalyticsPanel) already renders on the Analytics tab under Performance.
      // /provider/share-promote redirects to /provider/services.
      // Customers — module 6: honest self-scoped aggregation over this provider's real
      // bookings (GET /api/me/customers); no invented CRM fields.
      { title: "Customers", href: "/provider/customers", icon: Users },
      { title: "Performance", href: "/provider/performance", icon: TrendingUp },
      // C9: "Analytics" entry RETIRED — the page (intact) is hosted as Performance's
      // Analytics tab (the expert C6 fold); /provider/analytics redirects to
      // /provider/performance?tab=analytics.
      // C9: module renamed Earnings → Money per §17; /provider/earnings redirects to
      // /provider/money (same page; inbound notification/email links re-pointed).
      { title: "Money", href: "/provider/money", icon: DollarSign },
    ],
  },
  {
    label: "Account",
    items: [
      // C9: "Profile" entry RETIRED — the profile page lives as Settings' FIRST tab
      // (settings.tsx lazy-mounts it embedded; Settings still defaults to its own content,
      // the actionable verification/preferences surface). /provider/profile redirects to
      // /provider/settings?tab=profile.
      { title: "Settings", href: "/provider/settings", icon: Settings },
      // C9 note — /provider/resources (static onboarding guides) stays ROUTED but keeps its
      // pre-C9 state of having no sidebar entry: it is not one of the NINE, its content is
      // static sample-guide copy with no backing content system, and promoting it to the
      // nav would advertise a surface §13 can't stand behind. Retiring the route outright
      // needs a home (e.g. a help center) that doesn't exist yet.
    ],
  },
];

export function ProviderSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = (() => {
    if (user?.businessName) {
      return user.businessName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    if (user?.firstName && user?.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    return "P";
  })();

  const displayName =
    user?.businessName ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    "Service Provider";

  return (
    <Sidebar collapsible="icon" className="bg-white" style={{ borderRight: "1px solid #E8E8E2" }}>
      <SidebarHeader
        className="px-5 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3"
        style={{ borderBottom: "1px solid #E8E8E2", minHeight: 56 }}
      >
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-provider-logo">
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
                    (item.href !== "/provider/dashboard" && location.startsWith(item.href));

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
                          data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
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
          data-testid="button-provider-logout"
        >
          <LogOut className="w-4 h-4 mr-2 group-data-[collapsible=icon]:mr-0" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
