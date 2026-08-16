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
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import {
  Home,
  Bot,
  CalendarDays,
  DollarSign,
  LogOut,
  Palette,
  Settings,
  PenSquare,
  Inbox,
  LayoutGrid,
  TrendingUp,
  Users,
} from "lucide-react";

function buildMenuGroups(expertType?: string | null) {
  const isEventPlanner = expertType === "event_planner";
  const isLocalExpert = expertType === "local_expert";

  return [
    {
      label: "Work",
      items: [
        // Sidebar-audit consolidation (ratified 2026-07-25): "Clients" removed — it re-rendered
        // /api/expert/assigned-trips with no data of its own; the grouped-by-client view now lives
        // ON Assigned Trips. "Messages" points straight at /chat (the /expert/messages routes were
        // already bare redirects). "Verification & Payouts" and "Booking Partners" removed below.
        { title: "Today", href: "/expert/today", icon: Home },
        // Channel Calendar — the ratified 9th module (Console IA PR-Ca C3, §17): one
        // channel-filtered timeline; every event links out to its owning module.
        { title: "Calendar", href: "/expert/calendar", icon: CalendarDays },
        { title: "Inbox", href: "/expert/inbox", icon: Inbox },
        // Console IA C5 (§17 17→9): "Bookings" entry RETIRED — the C1 keep-reason is resolved:
        // Inbox's History tab now carries booking history (confirmed/completed + stats), the
        // visa-status management dialog (PATCH /api/service-bookings/:id/visa-status), and the
        // trip-plan snapshot; pending accept/decline was already Inbox's Queue.
        // /expert/bookings redirects to /expert/inbox?tab=history. Note: this entry carried an
        // event-planner conditional label ("Events" when expertType === "event_planner").
        // Console IA C5: "Assigned Trips" entry RETIRED — the assigned-trips list + accept
        // action live on Inbox's Assigned Trips tab; the traveler-approval Suggest flow
        // (POST /api/trips/:id/suggestions + log) moved to the Workstation Distribute→Client
        // card (client-delivery state is its semantic home); the by-client grouped view lives
        // on Customers. /expert/assigned-trips redirects to /expert/inbox?tab=assignments.
        // C1: "Workstation" is the ratified module name (route unchanged — label-only rename).
        { title: "Workstation", href: "/expert/workspace", icon: PenSquare },
        // Console IA C5: "Messages" entry RETIRED — Inbox's Messages tab is the recent-threads
        // queue linking into /chat (which stays the thread home; this entry pointed there).
      ],
    },
    {
      label: "Business",
      items: [
        // Catalog (Backoffice B3): "what I sell" front door — absorbs My Offerings + Store
        // Listings management.
        { title: "Catalog", href: "/expert/catalog", icon: LayoutGrid },
        // Console IA C1: "Store Listings" entry RETIRED — /expert/ready-made now redirects to
        // /expert/catalog (list + approval status live in the MyOfferingsTable ready_made lane;
        // editing lives on the build in the Workstation Distribute panel; creation is
        // ship-to-store from a build).
        // Console IA C2: "My Offerings" entry RETIRED — the C1 keep-reason is resolved:
        // Catalog's table now carries the per-service edit (/expert/services/:id/edit),
        // pause/activate, and duplicate actions, and Catalog's header carries the create
        // entry; /expert/services redirects to /expert/catalog (the ServiceForm /new and
        // /:id/edit routes are untouched).
        // C1: KEPT — "Local Guides" is not a page; it is this entry's local-expert label for
        // Content Studio, a real creation surface (AI content, Instagram, guides) nothing else
        // covers. Its Workstation fold (mockup section 0) pends a later phase.
        { title: isEventPlanner ? "Promo Content" : isLocalExpert ? "Local Guides" : "Content Studio", href: "/expert/content-studio", icon: Palette },
        // Console IA C7: "DMO Library" entry RETIRED — the C1 keep-reason is resolved: the
        // Workstation Add panel's DMO drawer (DmoPickerCore) now carries the review-and-refine
        // flow (expert_dmo_edits) alongside browse/add, so the library's one home is the
        // Add panel. /expert/dmo-library redirects to /expert/workspace.
        // Console IA C2: "Share & Promote" entry RETIRED — the C1 keep-reason is resolved:
        // the offering/storefront-scoped creation half (per-row share kits, posting
        // opportunities, storefront caption) moved onto Catalog via the shared
        // components/backoffice/share-tools.tsx; Performance already carries the measurement
        // half; /expert/share-promote redirects to /expert/catalog. (C9 retired the provider
        // twin the same way — the SharePromote page is gone.)
        // Performance (Backoffice B4): "which channel earns" — absorbs Share & Promote's
        // measurement half (EarningsBySourcePanel + LinkAnalyticsPanel) + per-offering
        // performance, one place before the broader Analytics page.
        // Customers — Console IA C4 (§17 module 6): honest self-scoped aggregation from real
        // bookings / store purchases / assigned trips; no invented CRM fields.
        { title: "Customers", href: "/expert/customers", icon: Users },
        { title: "Performance", href: "/expert/performance", icon: TrendingUp },
        // Console IA C6: "Analytics" entry RETIRED — the C1 keep-reason is resolved: the
        // fold-as-tab landed. The analytics page (its 9 internal tabs intact) is hosted as
        // Performance's Analytics tab (performance.tsx lazy-mounts it embedded; its internal
        // tab picker rides ?sub= so it can't collide with Performance's ?tab=). The two
        // inbound redirects (/expert/revenue-optimization, /expert/leaderboard) are
        // re-pointed at /expert/performance?tab=analytics&sub=…; /expert/analytics itself
        // redirects to /expert/performance?tab=analytics.
        // Console IA C8: module renamed Earnings → Money per §17; /expert/earnings redirects.
        { title: "Money", href: "/expert/money", icon: DollarSign },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "AI Assistant", href: "/expert/ai-assistant", icon: Bot },
        // Console IA C8: "Profile" entry RETIRED — the profile page lives as Settings' FIRST
        // tab (settings.tsx lazy-mounts it embedded; Settings still defaults to Verification,
        // the actionable surface). /expert/profile redirects to /expert/settings?tab=profile.
        // Verification & Payouts merged into Settings — the two pages hit the identical five
        // endpoints, and Settings already opens on its Verification tab.
        { title: "Settings", href: "/expert/settings", icon: Settings },
      ],
    },
  ];
}

const roleLabel: Record<string, string> = {
  travel_expert: "Trip Planner",
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
        <Link href="/" className="flex items-center" data-testid="link-expert-logo">
          <TraveloureLogo className="group-data-[collapsible=icon]:hidden" />
          <TraveloureLogo collapsed className="hidden group-data-[collapsible=icon]:flex" />
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
                    (item.href !== "/expert/today" && location.startsWith(item.href));

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
