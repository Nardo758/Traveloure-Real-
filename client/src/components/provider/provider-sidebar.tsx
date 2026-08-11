import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { initialsFromUser } from "@/lib/initials";
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
  CalendarDays,
  DollarSign,
  Inbox,
  LayoutGrid,
  Settings,
  LogOut,
  TrendingUp,
  Users,
  Wrench,
  BookOpen,
} from "lucide-react";

// Console IA C9 (§17 17→9 collapse): the provider console adopts the SAME nine-module IA the
// expert console reached in PR-Ca/PR-Cb — Today · Calendar · Inbox · Catalog · Money ·
// Customers · Performance · Settings.
// PB: Workstation (the Provider Product Builder) LANDED, completing the provider NINE. Its
// two §17 gates were ratified Jul 28, 2026 ("Product Builder — the two gated calls
// RATIFIED"): ① component linkage = the bundle_components join table (migration 151; a
// bundle IS a provider_services row, product_shape='bundle' — no new service table) and
// ② the bundle money path = ONE booking row at the bundle's own stored price (§14
// server-derived; components re-verified approved+active at booking). The bundle rung is
// live (born-submitted, unlocks at 2+ approved services — the §17 creation ladder); the
// property rung (per-night pricing, room availability) is ALSO live — Workstation's Property
// card opens the real create dialog (openPropertyCreate in workstation.tsx).
//
// Ruling 60 Phase A (chrome i18n): each group/item keeps its ENGLISH `label`/`title` verbatim
// and gains an `i18nKey`. The English string is NOT decoration — it is both the fallback
// rendered when a key is missing AND, critically, the source of this file's `data-testid`
// values (`nav-${item.title.toLowerCase()...}`) and its `key` props. Translating `title` in
// place would have silently renamed every provider nav testid the Playwright suites select on,
// so the display string and the test-selector string are deliberately kept as separate values.
const menuGroups = [
  {
    label: "Work",
    labelKey: "groups.work",
    items: [
      // C9 originally relabeled "Dashboard" → "Today" (module 1, ops home). Renamed back to
      // "Dashboard" (ratified provider back-office wave, Aug 9 2026) — route unchanged; the
      // page still leads with today's bookings + pending action items. A sibling change
      // renames the page's own header to match.
      { title: "Dashboard", i18nKey: "nav.dashboard", href: "/provider/dashboard", icon: Home },
      // C9: /provider/calendar is now the Channel Calendar (the ratified 9th module — the
      // expert C3 pattern on GET /api/me/calendar, provider-real chips only). The old
      // availability-editor sheets there were non-persisting previews; REAL slot editing
      // moved to its ratified Catalog home (/provider/services availability section).
      { title: "Calendar", i18nKey: "nav.calendar", href: "/provider/calendar", icon: CalendarDays },
      // C9 Inbox absorption (mirrors expert C5): "Bookings" and "Messages" retired into ONE
      // "Inbox" entry. Bookings' uniques (pending accept/decline via
      // PATCH /api/provider/bookings/:id/status, the visa-status management dialog, stats,
      // and search/filter) landed on Inbox's Queue + History tabs; Messages' function (a
      // path into /chat) is now Inbox's Messages tab — a real recent-threads queue over
      // GET /api/chats, not a bare link. /provider/bookings redirects to /provider/inbox;
      // /chat itself stays reachable (it's the thread home the Messages tab deep-links into).
      { title: "Inbox", i18nKey: "nav.inbox", href: "/provider/inbox", icon: Inbox },
      // PB: the Product Builder (§17 creation ladder — single service → bundle → property).
      // Placed after Inbox: the expert sidebar carries Workstation in its Work group too;
      // the provider Work group keeps its existing order and appends the new module.
      { title: "Workstation", i18nKey: "nav.workstation", href: "/provider/workstation", icon: Wrench },
    ],
  },
  {
    label: "Business",
    labelKey: "groups.business",
    items: [
      // C9: "My Offerings" relabeled "Catalog" (module 5, "what I sell") — route unchanged.
      // The page absorbed the storefront header (/p/:handle management), availability slot
      // editing (the ratified Catalog placement), and Share & Promote's creation half
      // (per-service share kits + posting opportunities via the shared
      // components/backoffice/share-tools.tsx — the same absorption expert C2 did).
      { title: "Catalog", i18nKey: "nav.catalog", href: "/provider/services", icon: LayoutGrid },
      // C9: "Share & Promote" entry RETIRED — its unique functions live on Catalog (per-
      // service share kit, posting opportunities, storefront share); the measurement half
      // (LinkAnalyticsPanel) already renders on the Analytics tab under Performance.
      // /provider/share-promote redirects to /provider/services.
      // Customers — module 6: honest self-scoped aggregation over this provider's real
      // bookings (GET /api/me/customers); no invented CRM fields.
      { title: "Customers", i18nKey: "nav.customers", href: "/provider/customers", icon: Users },
      { title: "Performance", i18nKey: "nav.performance", href: "/provider/performance", icon: TrendingUp },
      // C9: "Analytics" entry RETIRED — the page (intact) is hosted as Performance's
      // Analytics tab (the expert C6 fold); /provider/analytics redirects to
      // /provider/performance?tab=analytics.
      // C9: module renamed Earnings → Money per §17; /provider/earnings redirects to
      // /provider/money (same page; inbound notification/email links re-pointed).
      { title: "Money", i18nKey: "nav.money", href: "/provider/money", icon: DollarSign },
    ],
  },
  {
    label: "Account",
    labelKey: "groups.account",
    items: [
      // C9: "Profile" entry RETIRED — the profile page lives as Settings' FIRST tab
      // (settings.tsx lazy-mounts it embedded; Settings still defaults to its own content,
      // the actionable verification/preferences surface). /provider/profile redirects to
      // /provider/settings?tab=profile.
      { title: "Settings", i18nKey: "nav.settings", href: "/provider/settings", icon: Settings },
      // Playbook (formerly Resources, /provider/resources → /provider/playbook): rebuilt as
      // real, written-in-the-page content grounded in how approval/booking/payouts/availability
      // actually work in this codebase (no invented guides, videos, or downloads — §13). Now
      // that its content is honest it rejoins the nav; it's still not one of the NINE modules,
      // so it lives here in Account rather than in Work/Business.
      { title: "Playbook", i18nKey: "nav.playbook", href: "/provider/playbook", icon: BookOpen },
    ],
  },
];

export function ProviderSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation("provider");
  const { user, logout } = useAuth();

  const initials = initialsFromUser(user);

  const displayName =
    user?.businessName ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    t("sidebar.defaultDisplayName");

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
              {t(group.labelKey, group.label)}
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
                        tooltip={t(item.i18nKey, item.title)}
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
                          <span className="text-[13px]">{t(item.i18nKey, item.title)}</span>
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
          <span className="group-data-[collapsible=icon]:hidden">{t("sidebar.logout")}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
