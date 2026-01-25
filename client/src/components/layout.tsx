import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
  Linkedin,
  Twitter,
  CreditCard,
  UserCheck,
  HelpCircle,
  FileText,
  ShoppingCart,
  PartyPopper,
  GraduationCap,
  Baby,
  Gift,
  TreePine,
  Wine,
  Palmtree,
  UsersRound,
  Crown,
  Flower2,
  HandHeart,
  Trophy,
  Umbrella
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
          { name: "Holiday Party", href: "/experiences/holiday-party", icon: TreePine, description: "Festive gatherings" },
          { name: "Housewarming", href: "/experiences/housewarming-party", icon: Home, description: "Welcome home events" },
          { name: "Farewell Party", href: "/experiences/farewell-party", icon: HandHeart, description: "Send-off celebrations" },
          { name: "Career Achievement", href: "/experiences/career-achievement-party", icon: Trophy, description: "Celebrate success" },
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
          { name: "Graduation", href: "/experiences/graduation-party", icon: GraduationCap, description: "Honor achievements" },
          { name: "Retirement", href: "/experiences/retirement-party", icon: Crown, description: "New chapter celebration" },
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
    name: "Partner With Us",
    icon: ChevronDown,
    sections: [
      {
        title: "BECOME A PARTNER",
        items: [
          { name: "Travel Expert", href: "/become-expert", icon: Plane, description: "Share your destination expertise" },
          { name: "Local Expert", href: "/become-expert", icon: Globe, description: "Guide travelers in your city" },
          { name: "Event Planner", href: "/become-expert", icon: Calendar, description: "Plan weddings & celebrations" },
          { name: "Executive Assistant", href: "/become-expert", icon: Briefcase, description: "Manage high-end clients" },
          { name: "Service Provider", href: "/become-provider", icon: Building2, description: "Offer venues & services" },
          { name: "Influencer Program", href: "/become-expert?influencer=true", icon: Sparkles, description: "Earn commissions as a creator" },
        ],
      },
      {
        title: "BENEFITS",
        items: [
          { name: "Flexible Schedule", href: "/partner-with-us", icon: Clock, description: "Work on your own terms" },
          { name: "AI-Powered Tools", href: "/partner-with-us", icon: Bot, description: "Cutting-edge planning tools" },
          { name: "Global Clientele", href: "/partner-with-us", icon: Globe, description: "Connect with travelers worldwide" },
        ],
      },
    ],
  },
  { name: "Discover", href: "/discover" },
  {
    name: "Planning Tools",
    icon: ChevronDown,
    sections: [
      {
        title: "AI & EXPERTS",
        items: [
          { name: "AI Trip Planner", href: "/ai-assistant", icon: Bot, description: "Instant AI-powered itineraries" },
          { name: "Find Local Experts", href: "/vendors", icon: Users, description: "Connect with destination experts" },
          { name: "Executive Assistant", href: "/executive-assistant", icon: Briefcase, description: "Premium concierge planning" },
        ],
      },
      {
        title: "EXPLORE",
        items: [
          { name: "Live Intel", href: "/spontaneous", icon: Sparkles, description: "Real-time local insights" },
          { name: "Today's Deals", href: "/deals", icon: CreditCard, description: "Special offers & discounts" },
        ],
      },
    ],
  },
  { name: "Experts", href: "/experts" },
  { name: "Contact", href: "/contact" },
];

const authNavItems = [
  { href: "/dashboard", label: "My Trips", icon: Map },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/chat", label: "Expert Chat", icon: MessageSquare },
];

function DesktopDropdown({ item, isActive }: { item: typeof navItems[0], isActive?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
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
            className={cn(
              "absolute top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-50",
              item.sections.length > 2 
                ? "left-1/2 -translate-x-1/2 w-[800px]" 
                : "left-0 w-72"
            )}
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
                  {section.items.map((child) => (
                    <Link
                      key={child.name}
                      href={child.href || "#"}
                      className={cn(
                        "flex items-start gap-2 text-sm hover-elevate transition-colors group rounded-md",
                        item.sections.length > 2 ? "px-2 py-2" : "px-4 py-2.5 gap-3"
                      )}
                      data-testid={`link-nav-${slugify(child.name)}`}
                    >
                      {child.icon && <child.icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-foreground font-medium truncate">{child.name}</div>
                        {child.description && item.sections.length <= 2 && (
                          <div className="text-xs text-muted-foreground">{child.description}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation */}
      <nav className="bg-background border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              {/* Logo */}
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
              
              {/* Desktop Nav - Same for all users */}
              <div className="hidden md:ml-10 md:flex md:items-center gap-1">
                {navItems.map((item) => (
                  <DesktopDropdown key={item.name} item={item} isActive={item.href === location} />
                ))}
              </div>
            </div>

            {/* User Actions */}
            <div className="hidden md:flex items-center gap-2">
              {!user && (
                <>
                  <Link href="/become-expert">
                    <Button variant="outline" size="sm" data-testid="button-become-expert">
                      Become an Expert
                    </Button>
                  </Link>
                  <a href="/api/login">
                    <Button size="sm" data-testid="button-sign-in">
                      Sign In
                    </Button>
                  </a>
                </>
              )}
              {user && (
                <>
                  <NotificationBell />
                  <UserMenu />
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
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

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border bg-background"
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
                          {section.items.map((child) => (
                            <Link
                              key={child.name}
                              href={child.href || "#"}
                              className="flex items-center gap-3 px-8 py-2.5 text-base font-medium text-muted-foreground hover-elevate rounded-lg transition-colors"
                              onClick={() => setIsMobileMenuOpen(false)}
                              data-testid={`link-mobile-${child.name.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {child.icon && <child.icon className="w-5 h-5" />}
                              {child.name}
                            </Link>
                          ))}
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
                  <div className="flex flex-col gap-3">
                    <Link href="/become-expert" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full" data-testid="button-mobile-become-expert">
                        Become an Expert
                      </Button>
                    </Link>
                    <a href="/api/login" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button className="w-full" data-testid="button-mobile-sign-in">Sign In</Button>
                    </a>
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
      <footer className="bg-background border-t border-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary p-2 rounded-lg">
                  <Compass className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl text-foreground">Traveloure</span>
              </div>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm">
                Experience personalized travel planning with insider knowledge from travel experts, powered by advanced AI technology.
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-4">
                <a 
                  href="https://facebook.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                  data-testid="link-social-facebook"
                >
                  <Facebook className="w-5 h-5" />
                </a>
                <a 
                  href="https://twitter.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                  data-testid="link-social-twitter"
                >
                  <Twitter className="w-5 h-5" />
                </a>
                <a 
                  href="https://instagram.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                  data-testid="link-social-instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a 
                  href="https://linkedin.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors text-muted-foreground"
                  data-testid="link-social-linkedin"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Product Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/experiences" className="hover:text-foreground transition-colors" data-testid="link-footer-create-trip">Plan an Experience</Link></li>
                <li><Link href="/discover" className="hover:text-foreground transition-colors" data-testid="link-footer-explore">Discover Services</Link></li>
                <li><Link href="/chat" className="hover:text-foreground transition-colors" data-testid="link-footer-experts">Talk to Experts</Link></li>
                <li><Link href="/how-it-works" className="hover:text-foreground transition-colors" data-testid="link-footer-how-it-works">How It Works</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</Link></li>
              </ul>
            </div>

            {/* Company Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors" data-testid="link-footer-about">About Us</Link></li>
                <li><Link href="/partner-with-us" className="hover:text-foreground transition-colors" data-testid="link-footer-partner">Partner With Us</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors" data-testid="link-footer-careers">Careers</Link></li>
                <li><Link href="/blog" className="hover:text-foreground transition-colors" data-testid="link-footer-blog">Blog</Link></li>
                <li><Link href="/press" className="hover:text-foreground transition-colors" data-testid="link-footer-press">Press</Link></li>
              </ul>
            </div>

            {/* Support Column */}
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Support</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/help" className="hover:text-foreground transition-colors" data-testid="link-footer-help">Help Center</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors" data-testid="link-footer-contact">Contact Us</Link></li>
                <li><Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms of Service</Link></li>
                <li><Link href="/faq" className="hover:text-foreground transition-colors" data-testid="link-footer-faq">FAQ</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row items-center justify-center">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Traveloure. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
