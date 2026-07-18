import { type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { Button } from "@/components/ui/button";
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
  ShoppingCart,
  PartyPopper,
  Baby,
  Gift,
  TreePine,
  Wine,
  Palmtree,
  UsersRound,
  Crown,
  Flower2,
  HandHeart,
  Umbrella,
  User
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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

const navItems = [
  {
    name: "Discover",
    icon: ChevronDown,
    sections: [
      {
        title: "BROWSE",
        items: [
          { name: "By Location", href: "/discover", icon: MapPin, description: "Explore destinations & trending cities" },
          { name: "By Date", href: "/discover?tab=events", icon: Calendar, description: "Upcoming events & activities" },
        ],
      },
    ],
  },
  {
    name: "Experts & Services",
    icon: ChevronDown,
    sections: [
      {
        title: "FIND HELP",
        items: [
          { name: "Local Experts", href: "/experts?role=local_expert", icon: MapPin, description: "City guides & neighbourhood specialists" },
          { name: "Travel Advisors", href: "/experts?role=travel_expert", icon: User, description: "Trip planners who handle every detail" },
          { name: "Service Providers", href: "/discover?tab=services", icon: Building2, description: "Book tours, photography, transport & more" },
        ],
      },
    ],
  },
  {
    name: "Experiences",
    icon: ChevronDown,
    sections: [
      {
        title: "TRAVEL & GETAWAYS",
        items: [
          { name: "Travel Planning", href: "/experiences/travel", icon: Plane, description: "Plan your perfect trip" },
          { name: "Romantic Getaways", href: "/experiences/romance", icon: Sparkles, description: "Special romantic escapes" },
          { name: "Date Night", href: "/experiences/date-night", icon: Wine, description: "Perfect evening plans" },
          { name: "Retreats", href: "/experiences/retreats", icon: Palmtree, description: "Relaxation & wellness" },
        ],
      },
      {
        title: "CELEBRATIONS",
        items: [
          { name: "Birthday Party", href: "/experiences/birthday", icon: Cake, description: "Unforgettable celebrations" },
        ],
      },
      {
        title: "LIFE MILESTONES",
        items: [
          { name: "Wedding", href: "/experiences/wedding", icon: Heart, description: "Dream wedding planning" },
          { name: "Proposal", href: "/experiences/proposal", icon: Gem, description: "Perfect proposal moment" },
          { name: "Engagement Party", href: "/experiences/engagement-party", icon: Flower2, description: "Celebrate your love" },
          { name: "Baby Shower", href: "/experiences/baby-shower", icon: Baby, description: "Welcome the new arrival" },
          { name: "Anniversary", href: "/experiences/wedding-anniversaries", icon: Gift, description: "Celebrate your journey" },
        ],
      },
      {
        title: "GROUP EVENTS",
        items: [
          { name: "Corporate Events", href: "/experiences/corporate-events", icon: Building2, description: "Team events & meetings" },
          { name: "Corporate Retreats", href: "/experiences/corporate", icon: Briefcase, description: "Team building retreats" },
          { name: "Boys Trip", href: "/experiences/boys-trip", icon: Users, description: "Epic adventures" },
          { name: "Girls Trip", href: "/experiences/girls-trip", icon: UsersRound, description: "Getaways with friends" },
          { name: "Reunions", href: "/experiences/reunions", icon: PartyPopper, description: "Reconnect & celebrate" },
        ],
      },
    ],
  },
  {
    name: "Planning Tools",
    icon: ChevronDown,
    sections: [
      {
        title: "TOOLS",
        items: [
          { name: "AI Plan Planner", href: "/ai-assistant", icon: Bot, description: "Instant AI-powered itineraries", requiresAuth: true },
          { name: "Visa Help", href: "/visa-help", icon: FileText, description: "Visa requirements & expert help" },
        ],
      },
      {
        title: "EXPLORE",
        items: [
          { name: "Live Intel", href: "/discover", icon: Sparkles, description: "Real-time local insights" },
          { name: "Today's Deals", href: "/deals", icon: CreditCard, description: "Special offers & discounts" },
        ],
      },
    ],
  },
  { name: "Ways to earn", href: "/earn" },
  { name: "Contact", href: "/contact" },
];

const authNavItems = [
  { href: "/dashboard", label: "My Plans", icon: Map },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/concierge", label: "Concierge", icon: Sparkles },
  { href: "/chat", label: "Expert Chat", icon: MessageSquare },
];

function DesktopDropdown({ item, isActive }: { item: typeof navItems[0], isActive?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [megaStyle, setMegaStyle] = useState<CSSProperties>({});
  const recentCities = useRecentlyViewed();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    computeMegaPosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 300);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const slugify = (str: string) => str.toLowerCase().replace(/\s+/g, '-');

  if (!item.sections) {
    return (
      <Link
        href={item.href || "#"}
        className={cn(
          "text-sm font-medium transition-colors px-3 py-2 relative hover-elevate rounded-md",
          isActive 
            ? "text-primary after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-primary after:rounded-full" 
            : "text-muted-foreground"
        )}
        data-testid={`link-nav-${slugify(item.name)}`}
      >
        {item.name}
      </Link>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="flex items-center text-sm font-medium text-muted-foreground hover-elevate transition-colors px-3 py-2 rounded-md"
        type="button"
        data-testid={`button-nav-dropdown-${slugify(item.name)}`}
      >
        {item.name}
        <ChevronDown className={cn("ml-1 w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
              "absolute top-full mt-0 pt-1 bg-card border border-border rounded-lg shadow-xl z-50",
              item.sections.length > 2
                ? "w-[800px]"
                : "left-0 w-72"
            )}
            style={item.sections.length > 2 ? megaStyle : {}}
          >
            <div className={cn(
              "py-3",
              item.sections.length > 2 ? "grid grid-cols-4 gap-1 px-2" : ""
            )}>
              {item.sections.map((section, sIdx) => (
                <div key={section.title} className={item.sections.length > 2 ? "px-2" : ""}>
                  {sIdx > 0 && item.sections.length <= 2 && <div className="border-t border-border my-2" />}
                  <div className={cn(
                    "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                    item.sections.length > 2 ? "px-2 py-2 border-b border-border mb-1" : "px-4 py-2"
                  )}>
                    {section.title}
                  </div>
                  {section.items.map((child) => {
                    const sharedClass = cn(
                      "flex items-start gap-2 text-sm hover-elevate transition-colors group rounded-md w-full text-left",
                      item.sections.length > 2 ? "px-2 py-2" : "px-4 py-2.5 gap-3"
                    );
                    const inner = (
                      <>
                        {child.icon && <child.icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-foreground font-medium truncate">{child.name}</div>
                          {child.description && item.sections.length <= 2 && (
                            <div className="text-xs text-muted-foreground">{child.description}</div>
                          )}
                        </div>
                      </>
                    );
                    if ((child as any).requiresAuth && !user) {
                      return (
                        <button
                          key={child.name}
                          type="button"
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
                        className={sharedClass}
                        data-testid={`link-nav-${slugify(child.name)}`}
                      >
                        {inner}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {item.name === "Experiences" && recentCities.length > 0 && (
              <div className="border-t border-border mx-4 pt-3 pb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                  <Clock className="w-3 h-3" />
                  Recently Viewed
                </div>
                <div className="flex gap-2">
                  {recentCities.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/discover/location/${encodeURIComponent(c.slug)}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors hover-elevate"
                      data-testid={`link-recent-city-${c.slug}`}
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
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
  const { user, logout } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: cartData } = useQuery<{ itemCount: number }>({
    queryKey: ["/api/cart"],
    staleTime: 30_000,
  });
  const cartCount = cartData?.itemCount ?? 0;

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation */}
      <nav className="bg-card/80 backdrop-blur-lg border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16">
            <div className="flex items-center flex-1 min-w-0">
              <Link href="/" className="flex-shrink-0 flex items-center gap-3" data-testid="link-logo">
                <div className="flex items-center gap-1.5">
                  <Compass className="h-6 w-6 text-primary" />
                  <span className="font-bold text-xl tracking-tight text-foreground uppercase">
                    Traveloure
                  </span>
                </div>
                <span className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-full border border-primary/20">
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
              {/* Cart icon — visible for all users */}
              <Link
                href="/cart"
                className="relative inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover-elevate focus:outline-none"
                data-testid="link-nav-cart"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white leading-none"
                    data-testid="badge-cart-count"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>

              {!user && (
                <div className="hidden lg:flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-become-expert" className="gap-1">
                        Join as Partner
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-2">
                      {[
                        { label: "Trip Planner", desc: "Help travellers design itineraries & craft unforgettable journeys", href: "/become-expert?type=travel_expert", icon: Plane },
                        { label: "Local Expert", desc: "Turn your city knowledge into consultations & local guides", href: "/become-expert?type=local_expert", icon: MapPin },
                        { label: "Event Planner", desc: "Plan your event — weddings, proposals & group celebrations", href: "/become-expert?type=event_planner", icon: Calendar },
                        { label: "Service Provider", desc: "Offer venues, transport & speciality services", href: "/become-provider", icon: Building2 },
                        { label: "Executive Assistant", desc: "Manage travel & events for high-net-worth clients", href: "/become-expert?type=executive_assistant", icon: Briefcase },
                      ].map(({ label, desc, href, icon: Icon }) => (
                        <DropdownMenuItem key={label} asChild className="p-0 focus:bg-transparent">
                          <Link href={href} data-testid={`link-partner-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                            <div className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted w-full cursor-pointer">
                              <div className="mt-0.5 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-3.5 h-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{label}</p>
                                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{desc}</p>
                              </div>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button 
                    size="sm" 
                    onClick={() => openSignInModal()}
                    data-testid="button-sign-in"
                  >
                    Sign In
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

              <div className="flex items-center lg:hidden">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover-elevate focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                  data-testid="button-mobile-menu"
                >
                  {isMobileMenuOpen ? (
                    <X className="block h-6 w-6" />
                  ) : (
                    <Menu className="block h-6 w-6" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-border bg-background max-h-[calc(100svh-64px)] overflow-y-auto"
            >
              {/* Mobile Nav - Same for all users */}
              <div className="pt-2 pb-3 space-y-1 px-4">
                {navItems.map((item) => (
                  item.sections ? (
                    <div key={item.name} className="py-2">
                      <div className="px-3 py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {item.name}
                      </div>
                      {item.sections.map((section) => (
                        <div key={section.title}>
                          <div className="px-6 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                            {section.title}
                          </div>
                          {section.items.map((child) => {
                            const mobileClass = "flex items-center gap-3 px-8 py-2.5 text-base font-medium text-muted-foreground hover-elevate rounded-lg transition-colors w-full text-left";
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
                                  {child.icon && <child.icon className="w-5 h-5" />}
                                  {child.name}
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
                              >
                                {child.icon && <child.icon className="w-5 h-5" />}
                                {child.name}
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-muted-foreground hover-elevate transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`link-mobile-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.name}
                    </Link>
                  )
                ))}
              </div>
              <div className="pt-4 pb-4 border-t border-border px-4">
                {user ? (
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.profileImageUrl || undefined} alt="Profile" />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {user.firstName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="text-base font-medium text-foreground">{user.firstName} {user.lastName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                    <Button 
                      variant="ghost"
                      size="icon"
                      onClick={() => logout()}
                      className="text-destructive hover-elevate"
                      data-testid="button-mobile-logout"
                    >
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">Join as a Partner</p>
                    {[
                      { label: "Trip Planner", href: "/become-expert?type=travel_expert", icon: Plane },
                      { label: "Local Expert", href: "/become-expert?type=local_expert", icon: MapPin },
                      { label: "Event Planner", href: "/become-expert?type=event_planner", icon: Calendar },
                      { label: "Service Provider", href: "/become-provider", icon: Building2 },
                      { label: "Executive Assistant", href: "/become-expert?type=executive_assistant", icon: Briefcase },
                    ].map(({ label, href, icon: Icon }) => (
                      <Link key={label} href={href} onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant="outline" className="w-full justify-start gap-2" data-testid={`button-mobile-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                          <Icon className="w-4 h-4 text-primary" />
                          {label}
                        </Button>
                      </Link>
                    ))}
                    <Button 
                      className="w-full mt-1" 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        openSignInModal();
                      }}
                      data-testid="button-mobile-sign-in"
                    >
                      Sign In
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gradient-to-br from-[#FF385C] to-[#FF8E53] p-2.5 rounded-xl shadow-lg">
                  <Compass className="h-5 w-5 text-white" />
                </div>
                <span className="font-display font-bold text-xl text-foreground">Traveloure</span>
              </div>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm leading-relaxed">
                Experience personalized travel planning with insider knowledge from local experts and trip planners, powered by advanced AI technology.
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-3">
                <a 
                  href="https://www.facebook.com/Traveloure/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover-elevate transition-all text-muted-foreground"
                  data-testid="link-social-facebook"
                >
                  <Facebook className="w-5 h-5" />
                </a>
                <a 
                  href="https://x.com/Traveloure_" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover-elevate transition-all text-muted-foreground"
                  data-testid="link-social-twitter"
                >
                  <Twitter className="w-5 h-5" />
                </a>
                <a 
                  href="https://www.instagram.com/traveloure_" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover-elevate transition-all text-muted-foreground"
                  data-testid="link-social-instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Product Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground text-sm uppercase tracking-wider">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/experiences" className="hover:text-foreground transition-colors" data-testid="link-footer-create-trip">Plan an Experience</Link></li>
                <li><Link href="/discover" className="hover:text-foreground transition-colors" data-testid="link-footer-explore">Discover Services</Link></li>
                <li><Link href="/chat" className="hover:text-foreground transition-colors" data-testid="link-footer-experts">Talk to Experts</Link></li>
                <li><Link href="/how-it-works" className="hover:text-foreground transition-colors" data-testid="link-footer-how-it-works">How It Works</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</Link></li>
                <li><Link href="/features" className="hover:text-foreground transition-colors" data-testid="link-footer-features">Features</Link></li>
                <li><Link href="/global-calendar" className="hover:text-foreground transition-colors" data-testid="link-footer-global-calendar">Global Calendar</Link></li>
                <li><Link href="/executive-assistant" className="hover:text-foreground transition-colors" data-testid="link-footer-executive-assistant">Executive Assistant</Link></li>
              </ul>
            </div>

            {/* Company Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground text-sm uppercase tracking-wider">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors" data-testid="link-footer-about">About Us</Link></li>
                <li><Link href="/earn" className="hover:text-foreground transition-colors" data-testid="link-footer-earn">Ways to earn</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors" data-testid="link-footer-careers">Careers</Link></li>
                <li><Link href="/blog" className="hover:text-foreground transition-colors" data-testid="link-footer-blog">Blog</Link></li>
                <li><Link href="/press" className="hover:text-foreground transition-colors" data-testid="link-footer-press">Press</Link></li>
              </ul>
            </div>

            {/* Support Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground text-sm uppercase tracking-wider">Support</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/help" className="hover:text-foreground transition-colors" data-testid="link-footer-help">Help Center</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors" data-testid="link-footer-contact">Contact Us</Link></li>
                <li><Link href="/visa-help" className="hover:text-foreground transition-colors" data-testid="link-footer-visa-help">Visa Help</Link></li>
                <li><Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms of Service</Link></li>
                <li><Link href="/faq" className="hover:text-foreground transition-colors" data-testid="link-footer-faq">FAQ</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Traveloure. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                English (US)
              </span>
              <span>USD ($)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
