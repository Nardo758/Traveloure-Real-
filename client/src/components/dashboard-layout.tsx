import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import * as React from "react";
import { Link, useLocation } from "wouter";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { KyotoMarketNotice } from "@/components/KyotoMarketNotice";
import { useAuth } from "@/hooks/use-auth";
import { useR3SurfaceOn, sidebarStartsCollapsed, sidebarStorageKey } from "@/lib/r3-surface";

interface DashboardLayoutProps {
  children: React.ReactNode;
  /**
   * QA round 4 R4-4 (a): drawn sticky directly under the console header — the browse surfaces put the Trip Strip
   * here, so a signed-in traveler keeps the one plan surface the public chrome gives a guest. `--chrome-nav-h` is set
   * to the console header's height on the column, so the strip's own `top` lands under it.
   */
  subheader?: React.ReactNode;
}

/**
 * QA round 4 R4-4 (c): on a phone the console's sidebar button opens the navigation sheet, so it says what the public
 * nav's button says — the existing `nav.openMenu` ("Open navigation menu"), no new string. On a wide screen it
 * collapses the sidebar and keeps the library's own label.
 */
function ConsoleMenuTrigger() {
  const { isMobile } = useSidebar();
  const { t } = useTranslation("nav");
  return (
    <SidebarTrigger
      className="h-8 w-8 rounded-lg text-[var(--console-mid)] hover:bg-[hsl(var(--muted))]"
      style={{ border: "1px solid var(--console-line)" }}
      data-testid="button-dashboard-sidebar-toggle"
      {...(isMobile ? { "aria-label": t("openMenu"), title: t("openMenu") } : {})}
    />
  );
}

export function DashboardLayout({ children, subheader }: DashboardLayoutProps) {
  // U1 item 8 (Leon, Nov 23 2026): a real collapse mode. It starts COLLAPSED on an R3 plan page and EXPANDED on every
  // other page; a toggle the traveler makes is remembered for them alone (localStorage, per user id), so no other page
  // changes and a manual choice survives a reload.
  const [location] = useLocation();
  const r3Page = useR3SurfaceOn(location.includes("?") ? location.slice(location.indexOf("?")) : "");
  const { user } = useAuth();
  const storageKey = sidebarStorageKey((user as any)?.id ?? null);
  const [open, setOpen] = React.useState<boolean>(() => {
    let stored: boolean | null = null;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
      stored = raw === "1" ? true : raw === "0" ? false : null;
    } catch {
      stored = null;
    }
    return !sidebarStartsCollapsed({ r3Page: false, stored }); // the R3 default applies once the flag is read
  });
  React.useEffect(() => {
    if (!r3Page) return;
    let stored: boolean | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      stored = raw === "1" ? true : raw === "0" ? false : null;
    } catch {
      stored = null;
    }
    setOpen(!sidebarStartsCollapsed({ r3Page: true, stored }));
  }, [r3Page, storageKey]);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "0" : "1");
    } catch {
      /* private mode: the state still flips for this page */
    }
  };

  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties} open={open} onOpenChange={onOpenChange}>
      {/* console-scope (LD 45 ruling 7): the traveler console reads the ONE site grammar —
          shadcn primary resolves to coral #E85D55, not the traveler pink of the public
          surfaces. The scope class carries the tokens; the raw console hex literals that
          used to live here are gone (sidebar reads tokens). */}
      <div className="console-scope flex min-h-screen w-full" style={{ background: "var(--console-ground)" }}>
        <DashboardSidebar />
        <div className="flex flex-col flex-1 min-w-0" style={{ "--chrome-nav-h": "52px" } as React.CSSProperties}>
          <header
            className="flex items-center justify-between gap-2 h-[52px] px-3 sm:px-5 sticky top-0 z-40"
            style={{ background: "var(--console-card)", borderBottom: "1px solid var(--console-line)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ConsoleMenuTrigger />
              <Link href="/" data-testid="link-logo" className="flex items-center hover:opacity-80 transition-opacity">
                <TraveloureLogo className="h-6" />
              </Link>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          {subheader}
          <KyotoMarketNotice />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
