import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  Map, 
  Compass, 
  MessageSquare, 
  LogOut, 
  User, 
  Menu, 
  X 
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location === path;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: Map },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/chat", label: "Expert Chat", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0 flex items-center gap-2">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Compass className="h-6 w-6 text-primary" />
                </div>
                <span className="font-display font-bold text-2xl text-slate-900 tracking-tight">Traveloure</span>
              </Link>
              
              {/* Desktop Nav */}
              <div className="hidden md:ml-10 md:flex md:space-x-8">
                {user && navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`
                      inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200
                      ${isActive(link.href) 
                        ? "border-primary text-slate-900" 
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}
                    `}
                  >
                    <link.icon className="w-4 h-4 mr-2" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* User Actions */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {user.profileImageUrl ? (
                      <img 
                        src={user.profileImageUrl} 
                        alt={user.firstName || "User"} 
                        className="h-8 w-8 rounded-full border border-gray-200"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {user.firstName?.[0] || "U"}
                      </div>
                    )}
                    <span className="text-sm font-medium text-slate-700">
                      {user.firstName} {user.lastName}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => logout()}
                    className="text-slate-500 hover:text-destructive hover:bg-destructive/5"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              ) : (
                <Link href="/api/login">
                  <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-slate-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
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

        {/* Mobile menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-gray-200 bg-white"
            >
              <div className="pt-2 pb-3 space-y-1">
                {user && navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`
                      block pl-3 pr-4 py-2 border-l-4 text-base font-medium
                      ${isActive(link.href)
                        ? "bg-primary/5 border-primary text-primary"
                        : "border-transparent text-slate-600 hover:bg-gray-50 hover:border-gray-300 hover:text-slate-800"}
                    `}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="flex items-center">
                      <link.icon className="w-5 h-5 mr-3" />
                      {link.label}
                    </div>
                  </Link>
                ))}
              </div>
              <div className="pt-4 pb-4 border-t border-gray-200">
                {user ? (
                  <div className="flex items-center px-4">
                    <div className="flex-shrink-0">
                      {user.profileImageUrl ? (
                        <img 
                          src={user.profileImageUrl} 
                          alt="Profile" 
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {user.firstName?.[0]}
                        </div>
                      )}
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium text-slate-800">{user.firstName} {user.lastName}</div>
                      <div className="text-sm font-medium text-slate-500">{user.email}</div>
                    </div>
                    <button 
                      onClick={() => logout()}
                      className="ml-auto bg-white flex-shrink-0 p-1 rounded-full text-slate-400 hover:text-slate-500"
                    >
                      <LogOut className="h-6 w-6" />
                    </button>
                  </div>
                ) : (
                  <div className="px-4">
                    <Link href="/api/login" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button className="w-full">Sign In</Button>
                    </Link>
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

      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">© 2024 Traveloure. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-primary">Privacy Policy</a>
            <a href="#" className="hover:text-primary">Terms of Service</a>
            <a href="#" className="hover:text-primary">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
