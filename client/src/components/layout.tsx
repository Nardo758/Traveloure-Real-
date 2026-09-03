import { type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useLocale } from "@/hooks/use-locale";
import { LanguageMenu } from "@/components/language-menu";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { Button } from "@/components/ui/button";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { 
  Map,
  Compass,
  MessageSquare, 
  LogOut, 
  Menu, 
  X,
  ChevronDown,
  Home,
  Plane,
  MapPin,
  Heart,
  Gem,
  Sparkles,
  Cake,
  Building2,
  Users,
  Briefcase,
  Calendar,
  Clock,
  Globe,
  Bot,
  Facebook,
  Instagram,
  Twitter,
  CreditCard,
  UserCheck,
  HelpCircle,
  FileText,
  PartyPopper,
  Baby,
  Gift,
  TreePine,
  Wine,
  Palmtree,
  Ticket,
  ConciergeBell,
  ShoppingBag,
  Lamp,
  Waypoints,
  UsersRound,
  Crown,
  Flower2,
  HandHeart,
  Umbrella,
  User
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { navGroupsConfig, authNavConfig, footerSectionsConfig } from "@/lib/nav-config";
import { useTripContextSync } from "@/lib/trip-context";
import { TripStrip } from "@/components/trip/trip-strip";

// ── Icon maps ─────────────────────────────────────────────────────────────────
// ONE source object for the earn-grammar nav leaves (ruling 2026-08-25-nav-icons):
// it feeds the desktop dropdown, the mobile sheet, AND the Experts & Services page
// mastheads (experts.tsx / providers-directory.tsx import it — never a restated copy).
// Keys MUST track nav-config.ts's `name` values (the lookup is NAV_LEAF_ICONS[item.name]);
// note the leaf is "Ready-Made Trips" (nav-config), which the ruling shorthands "Ready-Made".
// The 8 earn leaves: Destinations Palmtree · Ready-Made Trips Gem · Events Ticket ·
// Services ConciergeBell · Service Providers ShoppingBag · Local Experts Lamp ·
// Trip Planners Waypoints · Event Planners Wine. No Send/Plane/Navigation/arrow glyph and
// no Compass/Store/MapPin/Calendar reaches an earn masthead. Non-earn Experiences/Planning
// leaves keep their themed icons below; anything unlisted falls back to MapPin.
export const NAV_LEAF_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Destinations":      Palmtree,
  "Events":            Ticket,
  "Local Experts":     Lamp,
  "Trip Planners":     Waypoints,
  "Service Providers": ShoppingBag,
  "Event Planners":    Wine,
  "Services":          ConciergeBell,
  "Ready-Made Trips":  Gem,
  "Travel Planning":   Plane,
  "Romantic Getaways": Sparkles,
  "Date Night":        Wine,
  "Retreats":          Palmtree,
  "Birthday Party":    Cake,
  "Wedding":           Heart,
  "Proposal":          Gem,
  "Engagement Party":  Flower2,
  "Baby Shower":       Baby,
  "Wedding Anniversary": Gift,
  "Corporate Events":  Building2,
  "Corporate Retreats": Briefcase,
  "Boys Trip":         Users,
  "Girls Trip":        UsersRound,
  "Reunions":          PartyPopper,
  "AI Plan Planner":   Bot,
  "Visa Help":         FileText,
  "Live Intel":        Sparkles,
  "Today's Deals":     CreditCard,
};

const AUTH_NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "My Plans":    Map,
  "Marketplace": Compass,
  "Concierge":   Sparkles,
  "Expert Chat": MessageSquare,
};

// Ruling 60 Phase A (chrome i18n): `i18nKey` rides through from nav-config. Every English
// `name`/`title` is KEPT, because it is both the translation fallback and the source of this
// file's data-testid values (`link-nav-*`, `link-mobile-*`, `nav-dropdown-*`) — translating a
// name in place would have renamed selectors the Playwright suites depend on.
const navItems = navGroupsConfig.map((group) => ({
  name: group.name,
  i18nKey: group.i18nKey,
  href: group.href,
  icon: ChevronDown,
  sections: group.sections?.map((section) => ({
    title: section.title,
    i18nKey: section.i18nKey,
    items: section.items.map((item) => ({
      ...item,
      icon: NAV_LEAF_ICONS[item.name] ?? MapPin,
    })),
  })),
}));

const authNavItems = authNavConfig.map((item) => ({
  ...item,
  icon: AUTH_NAV_ICONS[item.label] ?? User,
}));

// ── WCAG 2.1 AA: focus-ring helper shared by all interactive nav elements ──
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:rounded";

// ── Chrome earn grammar (ruling 2026-08-28-chrome-alignment, Variant A) ──
// Chrome sits on --earn-ground; white is reserved for cards; hairlines do all
// separation. Geist Mono for nav links/eyebrows/counts, Inter for buttons and
// trip name, Fraunces nowhere in chrome. Reskin only: every testid, href,
// handler and open/close behavior below is unchanged.
const CHROME_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const CHROME_LINK_REST = "text-[color:var(--earn-ink)] hover:text-[color:var(--earn-teal-ink)] hover:underline underline-offset-2";
const CHROME_LINK_ACTIVE = "text-[color:var(--earn-teal-ink)] underline underline-offset-2";
const CHROME_EYEBROW = "text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]";

function DesktopDropdown({ item, isActive }: { item: typeof navItems[0], isActive?: boolean }) {
  const { t } = useTranslation("nav");
  // A config entry with no i18nKey renders English in every locale — the documented migration
  // path for anything added to nav-config later. Never passes an empty key to t().
  const tr = (key: string | undefined, fallback: string) => (key ? t(key, fallback) : fallback);
  const [isOpen, setIsOpen] = useState(false);
  const [megaStyle, setMegaStyle] = useState<CSSProperties>({});
  const recentCities = useRecentlyViewed();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [location] = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const dropdownId = `nav-dropdown-${item.name.toLowerCase().replace(/\s+/g, "-")}`;

  const computeMegaPosition = () => {
    if (!item.sections || item.sections.length <= 2 || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const dropdownWidth = Math.min(800, window.innerWidth - 16);
    const buttonCenter = rect.left + rect.width / 2;
    const idealLeft = buttonCenter - dropdownWidth / 2;
    const clampedPageLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - dropdownWidth - 8));
    const offsetFromWrapper = clampedPageLeft - rect.left;
    setMegaStyle({ left: `${offsetFromWrapper}px`, transform: "none", width: `${dropdownWidth}px` });
  };

  const open = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    computeMegaPosition();
    setIsOpen(true);
  };

  const scheduleClose = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 300);
  };

  const handleMouseEnter = open;
  const handleMouseLeave = scheduleClose;

  // TEST 1 — Keyboard: open on focus, close when focus leaves wrapper entirely
  const handleFocusIn = open;
  const handleFocusOut = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
      scheduleClose();
    }
  };

  // TEST 1 — Keyboard: Enter/Space toggle, Escape close, ArrowDown open
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isOpen) { setIsOpen(false); } else { open(); }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      open();
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // A wouter navigation preserves this component instance, so close the menu
  // explicitly when a child link changes the route. Without this, the old
  // Marketplace menu can remain painted over the newly selected surface.
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const slugify = (str: string) => str.toLowerCase().replace(/\s+/g, '-');

  // TEST 8 — Reduced motion: skip animations when user prefers reduced motion
  const motionProps = shouldReduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: { duration: 0.15 } };

  if (!item.sections) {
    return (
      <Link
        href={item.href || "#"}
        className={cn(
          "text-[12.5px] font-medium tracking-[.05em] transition-colors px-3 py-2 relative rounded-md",
          FOCUS_RING,
          isActive ? CHROME_LINK_ACTIVE : CHROME_LINK_REST
        )}
        style={{ fontFamily: CHROME_MONO }}
        // TEST 5 — aria-current for active page
        aria-current={isActive ? "page" : undefined}
        data-testid={`link-nav-${slugify(item.name)}`}
      >
        {tr(item.i18nKey, item.name)}
      </Link>
    );
  }

  const sections = item.sections;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusIn}
      onBlurCapture={handleFocusOut}
    >
      {/* TEST 1+5: aria-expanded + aria-haspopup + aria-controls for keyboard/SR */}
      <button
        ref={triggerRef}
        className={cn(
          "flex items-center text-[12.5px] font-medium tracking-[.05em] transition-colors px-3 py-2 rounded-md",
          CHROME_LINK_REST,
          FOCUS_RING
        )}
        style={{ fontFamily: CHROME_MONO }}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={dropdownId}
        onKeyDown={handleKeyDown}
        data-testid={`button-nav-dropdown-${slugify(item.name)}`}
      >
        {tr(item.i18nKey, item.name)}
        <ChevronDown className={cn("ml-1 w-4 h-4 transition-transform text-[color:var(--earn-faint)]", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={dropdownId}
            role="menu"
            aria-label={`${tr(item.i18nKey, item.name)} ${t("mainNavigation")}`}
            {...motionProps}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
              "absolute top-full mt-0 pt-1 rounded-lg border shadow-xl z-50 bg-[color:var(--earn-card)] border-[color:var(--earn-border)]",
              sections.length > 2
                ? "w-[800px]"
                : "left-0 w-72"
            )}
            style={sections.length > 2 ? megaStyle : {}}
            onPointerDown={() => setIsOpen(false)}
            onClickCapture={() => setIsOpen(false)}
          >
            <div className={cn(
              "py-3",
              sections.length > 2 ? "grid grid-cols-4 gap-1 px-2" : ""
            )}>
              {sections.map((section, sIdx) => (
                <div key={section.title} className={sections.length > 2 ? "px-2" : ""}>
                  {sIdx > 0 && sections.length <= 2 && <div className="border-t border-[color:var(--earn-border)] my-2" />}
                  {/* TEST 5 — section titles are decorative, hide from SR */}
                  <div
                    className={cn(
                      CHROME_EYEBROW,
                      sections.length > 2 ? "px-2 py-2 border-b border-[color:var(--earn-border)] mb-1" : "px-4 py-2"
                    )}
                    style={{ fontFamily: CHROME_MONO }}
                    aria-hidden="true"
                  >
                    {tr(section.i18nKey, section.title)}
                  </div>
                  {section.items.map((child) => {
                    const sharedClass = cn(
                      "flex items-start gap-2 text-sm transition-colors group rounded-md w-full text-left hover:bg-[color:var(--earn-teal-wash)]",
                      FOCUS_RING,
                      sections.length > 2 ? "px-2 py-2" : "px-4 py-2.5 gap-3"
                    );
                    const inner = (
                      <>
                        {child.icon && (
                          <span
                            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--earn-teal-wash)]"
                            aria-hidden="true"
                          >
                            <child.icon className="w-3.5 h-3.5 text-[color:var(--earn-teal-ink)]" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-[color:var(--earn-ink)] font-medium truncate">
                            {tr(child.i18nKey, child.name)}
                          </div>
                          {child.description && sections.length <= 2 && (
                            <div className="text-xs text-[color:var(--earn-muted)]">{child.description}</div>
                          )}
                        </div>
                      </>
                    );
                    if ((child as any).requiresAuth && !user) {
                      return (
                        <button
                          key={child.name}
                          type="button"
                          role="menuitem"
                          className={sharedClass}
                          data-testid={`link-nav-${slugify(child.name)}`}
                          onClick={() => { setIsOpen(false); openSignInModal({ returnTo: child.href }); }}
                        >
                          {inner}
                        </button>
                      );
                    }
                    return (
                      <Link
                        key={child.name}
                        href={child.href || "#"}
                        role="menuitem"
                        className={sharedClass}
                        data-testid={`link-nav-${slugify(child.name)}`}
                        onClick={() => setIsOpen(false)}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {item.name === "Experiences" && recentCities.length > 0 && (
              <div className="border-t border-[color:var(--earn-border)] mx-4 pt-3 pb-3">
                <div className={cn("flex items-center gap-1.5 mb-2 px-1", CHROME_EYEBROW)} style={{ fontFamily: CHROME_MONO }}>
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  Recently Viewed
                </div>
                <div className="flex gap-2">
                  {recentCities.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/discover/location/${encodeURIComponent(c.slug)}`}
                      role="menuitem"
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[color:var(--earn-chip)] text-[color:var(--earn-muted)] hover:bg-[color:var(--earn-teal-wash)] hover:text-[color:var(--earn-teal-ink)] transition-colors",
                        FOCUS_RING
                      )}
                      data-testid={`link-recent-city-${c.slug}`}
                        onClick={() => setIsOpen(false)}
                    >
                      <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("nav");
  const { t: tCommon } = useTranslation("common");
  const { locale } = useLocale();
  const tr = (key: string | undefined, fallback: string) => (key ? t(key, fallback) : fallback);
  const { user, logout } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  useTripContextSync();

  // Escape key + click-outside close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, []);

  // TEST 7 — Focus trap: when mobile menu is open, keep Tab inside it
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const getFocusable = (): HTMLElement[] => {
      if (!mobileMenuRef.current) return [];
      return Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    };

    const trapTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", trapTab);

    // Move focus into the menu when it opens
    const focusable = getFocusable();
    if (focusable.length > 0) {
      requestAnimationFrame(() => focusable[0].focus());
    }

    return () => document.removeEventListener("keydown", trapTab);
  }, [isMobileMenuOpen]);

  // TEST 7 — Return focus to hamburger button when menu closes
  useEffect(() => {
    if (!isMobileMenuOpen && wasOpenRef.current) {
      hamburgerRef.current?.focus();
    }
    wasOpenRef.current = isMobileMenuOpen;
  }, [isMobileMenuOpen]);

  const isActive = (path: string) => location === path;

  // TEST 8 — Reduced motion props for Framer Motion
  const slideMotion = shouldReduceMotion
    ? {}
    : { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* TEST 6 — Skip navigation link (visible on focus, hidden otherwise) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-primary focus:rounded-md focus:outline-none focus:shadow-lg"
      >
        {t("skipToContent")}
      </a>

      {/* TEST 5 — aria-label="Main navigation" announces the landmark to screen readers */}
      <nav
        ref={navRef}
        aria-label={t("mainNavigation")}
        className="border-b border-[color:var(--earn-border)] sticky top-0 z-50"
        style={{ background: "var(--earn-ground)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-[60px]">
            <div className="flex items-center flex-1 min-w-0">
              {/* TEST 3 — Logo link: aria-label describes destination for screen readers */}
              <Link
                href="/"
                className={cn("flex-shrink-0 flex items-center gap-3", FOCUS_RING)}
                aria-label={t("homeAria")}
                data-testid="link-logo"
              >
                <TraveloureLogo className="h-[26px]" />
                <span
                  className="px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] rounded-full border"
                  style={{
                    fontFamily: CHROME_MONO,
                    background: "var(--earn-coral-bg)",
                    borderColor: "var(--earn-coral-border)",
                    color: "var(--earn-coral-ink)",
                  }}
                  aria-hidden="true"
                >
                  BETA
                </span>
              </Link>

              <div className="hidden lg:ml-8 lg:flex lg:items-center gap-1">
                {navItems.map((item) => (
                  <DesktopDropdown key={item.name} item={item} isActive={item.href === location} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Ruling 60 Phase A — the ONE selector, entry point (b). Rendered for guests AND
                  signed-in travelers: a guest's choice persists to localStorage, which the
                  resolution order honors ahead of Accept-Language on the next visit. */}
              <LanguageMenu />

              {!user && (
                <div className="hidden lg:flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-become-expert-nav"
                        className="gap-1 text-sm border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] bg-transparent hover:bg-[color:var(--earn-navy)] hover:text-white"
                      >
                        {t("joinAsPartner")}
                        <ChevronDown className="w-3.5 h-3.5 text-[color:var(--earn-faint)]" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-72 p-2 bg-[color:var(--earn-card)] border-[color:var(--earn-border)]"
                    >
                      {[
                        // `label` stays English: it is the React key AND the source of the
                        // `link-partner-*` testid. Only `k` drives what the user reads.
                        { label: "Trip Planner", k: "tripPlanner", href: "/become-expert?type=travel_expert", icon: Plane },
                        { label: "Local Expert", k: "localExpert", href: "/become-expert?type=local_expert", icon: MapPin },
                        { label: "Event Planner", k: "eventPlanner", href: "/start/events", icon: Calendar },
                        { label: "Service Provider", k: "serviceProvider", href: "/become-provider", icon: Building2 },
                        { label: "Executive Assistant", k: "executiveAssistant", href: "/become-expert?type=executive_assistant", icon: Briefcase },
                      ].map(({ label, k, href, icon: Icon }) => (
                        <DropdownMenuItem key={label} asChild className="p-0 focus:bg-transparent">
                          <Link href={href} data-testid={`link-partner-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                            <div className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-[color:var(--earn-teal-wash)] w-full cursor-pointer">
                              <div className="mt-0.5 w-7 h-7 rounded-lg bg-[color:var(--earn-teal-wash)] flex items-center justify-center flex-shrink-0">
                                <Icon className="w-3.5 h-3.5 text-[color:var(--earn-teal-ink)]" aria-hidden="true" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[color:var(--earn-ink)]">{t(`partner.${k}`)}</p>
                                <p className="text-xs text-[color:var(--earn-muted)] leading-snug mt-0.5">{t(`partner.${k}Desc`)}</p>
                              </div>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    className="text-sm text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90"
                    onClick={() => openSignInModal()}
                    data-testid="button-sign-in"
                  >
                    {t("signIn")}
                  </Button>
                </div>
              )}

              {user && (
                <>
                  <NotificationBell />
                  <div className="hidden lg:block">
                    <UserMenu />
                  </div>
                </>
              )}

              {/* TEST 3 + 9 — Hamburger: aria-label, aria-expanded, aria-controls; min 44×44px */}
              <div className="flex items-center lg:hidden">
                <button
                  ref={hamburgerRef}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={cn(
                    "inline-flex items-center justify-center p-2 min-w-[44px] min-h-[44px] rounded-md text-muted-foreground hover-elevate",
                    FOCUS_RING
                  )}
                  aria-label={isMobileMenuOpen ? t("closeMenu") : t("openMenu")}
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="mobile-menu"
                  data-testid="button-mobile-menu"
                >
                  {isMobileMenuOpen ? (
                    <X className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* TEST 7 — Mobile menu: id for aria-controls, role=dialog, aria-modal, focus-trapped */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              id="mobile-menu"
              ref={mobileMenuRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("navigationMenu")}
              {...slideMotion}
              className="lg:hidden border-t border-[color:var(--earn-border)] max-h-[calc(100svh-60px)] overflow-y-auto"
              style={{ background: "var(--earn-ground)" }}
            >
              {/* Mobile Nav */}
              <div className="pt-2 pb-3 space-y-1 px-4">
                {navItems.map((item) => (
                  item.sections ? (
                    <div key={item.name} className="py-2">
                      <div className="px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-muted)]" style={{ fontFamily: CHROME_MONO }} aria-hidden="true">
                        {tr(item.i18nKey, item.name)}
                      </div>
                      {item.sections.map((section) => (
                        <div key={section.title}>
                          <div className="px-6 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-faint)]" style={{ fontFamily: CHROME_MONO }} aria-hidden="true">
                            {tr(section.i18nKey, section.title)}
                          </div>
                          {section.items.map((child) => {
                            const mobileClass = cn(
                              "flex items-center gap-3 px-8 py-2.5 text-[13px] font-medium tracking-[.05em] rounded-lg transition-colors w-full text-left",
                              CHROME_LINK_REST,
                              "hover:no-underline hover:bg-[color:var(--earn-teal-wash)]",
                              FOCUS_RING
                            );
                            const testId = `link-mobile-${child.name.toLowerCase().replace(/\s+/g, '-')}`;
                            if ((child as any).requiresAuth && !user) {
                              return (
                                <button
                                  key={child.name}
                                  type="button"
                                  className={mobileClass}
                                  data-testid={testId}
                                  onClick={() => { setIsMobileMenuOpen(false); openSignInModal({ returnTo: child.href }); }}
                                >
                                  {child.icon && <child.icon className="w-5 h-5" aria-hidden="true" />}
                                  {tr(child.i18nKey, child.name)}
                                </button>
                              );
                            }
                            return (
                              <Link
                                key={child.name}
                                href={child.href || "#"}
                                className={mobileClass}
                                onClick={() => setIsMobileMenuOpen(false)}
                                data-testid={testId}
                                aria-current={isActive(child.href) ? "page" : undefined}
                              >
                                {child.icon && <child.icon className="w-5 h-5" aria-hidden="true" />}
                                {tr(child.i18nKey, child.name)}
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Link
                      key={item.name}
                      href={item.href || "#"}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium tracking-[.05em] transition-colors",
                        CHROME_LINK_REST,
                        "hover:no-underline hover:bg-[color:var(--earn-teal-wash)]",
                        FOCUS_RING
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`link-mobile-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                      aria-current={item.href && isActive(item.href) ? "page" : undefined}
                    >
                      {tr(item.i18nKey, item.name)}
                    </Link>
                  )
                ))}
              </div>
              <div className="pt-4 pb-4 border-t border-[color:var(--earn-border)] px-4">
                {user ? (
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Profile"} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {user.firstName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-base font-medium text-foreground">{user.firstName} {user.lastName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                    {/* TEST 3 + 9 — Icon-only logout: aria-label; min 44×44px */}
                    <Button
                      variant="ghost"
                      onClick={() => logout()}
                      className={cn("text-destructive hover-elevate min-w-[44px] min-h-[44px] px-3", FOCUS_RING)}
                      aria-label={t("signOut")}
                      data-testid="button-mobile-logout"
                    >
                      <LogOut className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-muted)] px-1 mb-1" style={{ fontFamily: CHROME_MONO }}>{t("joinAsPartnerMobile")}</p>
                    {[
                      // `label` stays English — React key + `button-mobile-*` testid source.
                      { label: "Trip Planner", k: "tripPlanner", href: "/become-expert?type=travel_expert", icon: Plane },
                      { label: "Local Expert", k: "localExpert", href: "/become-expert?type=local_expert", icon: MapPin },
                      { label: "Event Planner", k: "eventPlanner", href: "/start/events", icon: Calendar },
                      { label: "Service Provider", k: "serviceProvider", href: "/become-provider", icon: Building2 },
                      { label: "Executive Assistant", k: "executiveAssistant", href: "/become-expert?type=executive_assistant", icon: Briefcase },
                    ].map(({ label, k, href, icon: Icon }) => (
                      <Link key={label} href={href} onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant="outline" className="w-full justify-start gap-2 border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] bg-transparent hover:bg-[color:var(--earn-navy)] hover:text-white" data-testid={`button-mobile-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                          <Icon className="w-4 h-4" aria-hidden="true" />
                          {t(`partner.${k}`)}
                        </Button>
                      </Link>
                    ))}
                    <Button
                      className="w-full mt-1 text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openSignInModal();
                      }}
                      data-testid="button-mobile-sign-in"
                    >
                      {t("signIn")}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Global trip strip */}
      <TripStrip />

      {/* TEST 6 — id="main-content" is the skip-link target */}
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>

      {/* Footer — the white card closing the page (ruling 2026-08-28-chrome-alignment):
          white is reserved for cards, the page sits on ground, a hairline separates. */}
      <footer className="border-t border-[color:var(--earn-border)] py-16" style={{ background: "var(--earn-card)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center mb-4" aria-hidden="true">
                <TraveloureLogo mono className="h-8" />
              </div>
              <p className="text-[color:var(--earn-muted)] text-sm mb-6 max-w-sm leading-relaxed">
                {t("footer.tagline")}
              </p>
              {/* TEST 3 — Social links: aria-label for icon-only anchors */}
              <div className="flex items-center gap-3">
                <a
                  href="https://www.facebook.com/Traveloure/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("w-10 h-10 rounded-xl bg-[color:var(--earn-chip)] flex items-center justify-center transition-colors text-[color:var(--earn-muted)] hover:bg-[color:var(--earn-teal-wash)] hover:text-[color:var(--earn-teal-ink)]", FOCUS_RING)}
                  aria-label="Traveloure on Facebook (opens in new tab)"
                  data-testid="link-social-facebook"
                >
                  <Facebook className="w-5 h-5" aria-hidden="true" />
                </a>
                <a
                  href="https://x.com/Traveloure_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("w-10 h-10 rounded-xl bg-[color:var(--earn-chip)] flex items-center justify-center transition-colors text-[color:var(--earn-muted)] hover:bg-[color:var(--earn-teal-wash)] hover:text-[color:var(--earn-teal-ink)]", FOCUS_RING)}
                  aria-label="Traveloure on X / Twitter (opens in new tab)"
                  data-testid="link-social-twitter"
                >
                  <Twitter className="w-5 h-5" aria-hidden="true" />
                </a>
                <a
                  href="https://www.instagram.com/traveloure_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("w-10 h-10 rounded-xl bg-[color:var(--earn-chip)] flex items-center justify-center transition-colors text-[color:var(--earn-muted)] hover:bg-[color:var(--earn-teal-wash)] hover:text-[color:var(--earn-teal-ink)]", FOCUS_RING)}
                  aria-label="Traveloure on Instagram (opens in new tab)"
                  data-testid="link-social-instagram"
                >
                  <Instagram className="w-5 h-5" aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Footer columns */}
            {footerSectionsConfig.map((section) => (
              <div key={section.title}>
                <h3
                  className="mb-4 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-muted)]"
                  style={{ fontFamily: CHROME_MONO }}
                >
                  {tr(section.i18nKey, section.title)}
                </h3>
                <ul className="space-y-3 text-sm text-[color:var(--earn-muted)]">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn("transition-colors hover:text-[color:var(--earn-teal-ink)] hover:underline underline-offset-2", FOCUS_RING)}
                        data-testid={`link-footer-${link.href.replace(/^\//, '').replace(/\//g, '-')}`}
                      >
                        {tr(link.i18nKey, link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-[color:var(--earn-border)] mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[color:var(--earn-faint)]" style={{ fontFamily: CHROME_MONO }}>
              {t("footer.rights", { year: new Date().getFullYear() })}
            </p>
            <div className="flex items-center gap-6 text-xs text-[color:var(--earn-faint)]" style={{ fontFamily: CHROME_MONO }}>
              {/* Ruling 60 Phase A: this pill read a hardcoded "English (US)" and would have
                  stayed English while the whole footer above it rendered Japanese. It now shows
                  the LIVE locale's endonym. The currency pill beside it is deliberately
                  untouched — currency display is explicitly OUT of ruling 60's scope. */}
              <span className="flex items-center gap-1.5" data-testid="text-footer-locale">
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                {tCommon(`language.${locale}`, { lng: locale })}
              </span>
              <span>USD ($)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
