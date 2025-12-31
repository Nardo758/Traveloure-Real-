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
  HelpCircle,
  Users,
  Briefcase,
  Mail,
  Facebook,
  Instagram,
  Linkedin,
  Twitter
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

const navItems = [
  { name: "Home", href: "/" },
  {
    name: "Features",
    icon: ChevronDown,
    children: [
      { name: "For Travelers", href: "/how-it-works", icon: Plane, description: "Plan trips with AI and experts" },
      { name: "For Life Events", href: "/create-trip", icon: Users, description: "Weddings, proposals, celebrations" },
      { name: "AI Trip Planner", href: "/explore", icon: HelpCircle, description: "Let AI create your itinerary" },
    ],
  },
  { name: "Deals", href: "/pricing" },
  {
    name: "Partner With Us",
    icon: ChevronDown,
    children: [
      { name: "Become a Partner", href: "/partner", icon: Briefcase, description: "Join our expert network" },
      { name: "Partner Benefits", href: "/about", icon: Users, description: "Learn about perks & earnings" },
    ],
  },
  { name: "Contact Us", href: "/contact" },
];

const authNavItems = [
  { href: "/dashboard", label: "My Trips", icon: Map },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/chat", label: "Expert Chat", icon: MessageSquare },
];

function DesktopDropdown({ item }: { item: typeof navItems[0] }) {
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

  if (!item.children) {
    return (
      <Link
        href={item.href || "#"}
        className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-2"
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
        className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-3 py-2"
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
            className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-border rounded-lg shadow-xl z-50"
          >
            <div className="py-2">
              {item.children.map((child) => (
                <Link
                  key={child.name}
                  href={child.href || "#"}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  data-testid={`link-nav-${slugify(child.name)}`}
                >
                  {child.icon && <child.icon className="w-4 h-4" />}
                  {child.name}
                </Link>
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
      <nav className="bg-white dark:bg-slate-900 border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              {/* Logo */}
              <Link href="/" className="flex-shrink-0 flex items-center gap-2" data-testid="link-logo">
                <div className="bg-primary p-2 rounded-lg">
                  <Compass className="h-5 w-5 text-white" />
                </div>
                <span className="font-display font-bold text-xl text-slate-900 dark:text-white tracking-tight">
                  Traveloure
                </span>
              </Link>
              
              {/* Desktop Nav */}
              <div className="hidden md:ml-10 md:flex md:items-center gap-1">
                {user ? (
                  authNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                        isActive(item.href) 
                          ? "bg-primary/10 text-primary" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      data-testid={`link-nav-auth-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  ))
                ) : (
                  navItems.map((item) => (
                    <DesktopDropdown key={item.name} item={item} />
                  ))
                )}
              </div>
            </div>

            {/* User Actions */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="button-user-menu">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                          {user.firstName?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {user.firstName}
                      </span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
                        <Map className="w-4 h-4 mr-2" />
                        My Trips
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => logout()}
                      className="text-destructive cursor-pointer"
                      data-testid="button-logout"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/api/login">
                  <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25" data-testid="button-sign-in">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
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
              className="md:hidden border-t border-border bg-white dark:bg-slate-900"
            >
              <div className="pt-2 pb-3 space-y-1 px-4">
                {user ? (
                  authNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`link-mobile-auth-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  ))
                ) : (
                  <>
                    {navItems.map((item) => (
                      item.children ? (
                        <div key={item.name} className="py-2">
                          <div className="px-3 py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {item.name}
                          </div>
                          {item.children.map((child) => (
                            <Link
                              key={child.name}
                              href={child.href || "#"}
                              className="flex items-center gap-3 px-6 py-2.5 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                              onClick={() => setIsMobileMenuOpen(false)}
                              data-testid={`link-mobile-${child.name.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {child.icon && <child.icon className="w-5 h-5" />}
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <Link
                          key={item.name}
                          href={item.href || "#"}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={() => setIsMobileMenuOpen(false)}
                          data-testid={`link-mobile-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {item.name}
                        </Link>
                      )
                    ))}
                  </>
                )}
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
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      data-testid="button-mobile-logout"
                    >
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <Link href="/api/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button className="w-full" data-testid="button-mobile-sign-in">Sign In</Button>
                  </Link>
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
      <footer className="bg-slate-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary p-2 rounded-lg">
                  <Compass className="h-5 w-5 text-white" />
                </div>
                <span className="font-display font-bold text-xl">Traveloure</span>
              </div>
              <p className="text-slate-400 text-sm mb-6 max-w-sm">
                Experience personalized travel planning with insider knowledge from travel experts, powered by advanced AI technology.
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-4">
                <a 
                  href="https://facebook.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors"
                  data-testid="link-social-facebook"
                >
                  <Facebook className="w-5 h-5" />
                </a>
                <a 
                  href="https://twitter.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors"
                  data-testid="link-social-twitter"
                >
                  <Twitter className="w-5 h-5" />
                </a>
                <a 
                  href="https://instagram.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors"
                  data-testid="link-social-instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a 
                  href="https://linkedin.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors"
                  data-testid="link-social-linkedin"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Product Column */}
            <div>
              <h4 className="font-semibold mb-4 text-white">Product</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><Link href="/create-trip" className="hover:text-white transition-colors" data-testid="link-footer-create-trip">Create a Trip</Link></li>
                <li><Link href="/explore" className="hover:text-white transition-colors" data-testid="link-footer-explore">Explore Destinations</Link></li>
                <li><Link href="/chat" className="hover:text-white transition-colors" data-testid="link-footer-experts">Talk to Experts</Link></li>
                <li><Link href="/how-it-works" className="hover:text-white transition-colors" data-testid="link-footer-how-it-works">How It Works</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors" data-testid="link-footer-pricing">Pricing</Link></li>
              </ul>
            </div>

            {/* Company Column */}
            <div>
              <h4 className="font-semibold mb-4 text-white">Company</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><Link href="/about" className="hover:text-white transition-colors" data-testid="link-footer-about">About Us</Link></li>
                <li><Link href="/partner" className="hover:text-white transition-colors" data-testid="link-footer-partner">Partner With Us</Link></li>
                <li><Link href="/careers" className="hover:text-white transition-colors" data-testid="link-footer-careers">Careers</Link></li>
                <li><Link href="/blog" className="hover:text-white transition-colors" data-testid="link-footer-blog">Blog</Link></li>
                <li><Link href="/press" className="hover:text-white transition-colors" data-testid="link-footer-press">Press</Link></li>
              </ul>
            </div>

            {/* Support Column */}
            <div>
              <h4 className="font-semibold mb-4 text-white">Support</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><Link href="/help" className="hover:text-white transition-colors" data-testid="link-footer-help">Help Center</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors" data-testid="link-footer-contact">Contact Us</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors" data-testid="link-footer-privacy">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors" data-testid="link-footer-terms">Terms of Service</Link></li>
                <li><Link href="/faq" className="hover:text-white transition-colors" data-testid="link-footer-faq">FAQ</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} Traveloure. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="/privacy" className="hover:text-white transition-colors" data-testid="link-footer-bottom-privacy">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors" data-testid="link-footer-bottom-terms">Terms</Link>
              <Link href="/cookies" className="hover:text-white transition-colors" data-testid="link-footer-bottom-cookies">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
