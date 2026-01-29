import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  ShoppingCart, 
  User, 
  Menu, 
  X, 
  Compass, 
  Hotel, 
  Utensils, 
  Mountain,
  Calendar,
  Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavigationProps {
  cartItemCount?: number;
  onCartClick?: () => void;
}

const navCategories = [
  { icon: Hotel, label: 'Hotels', href: '#hotels' },
  { icon: Mountain, label: 'Activities', href: '#activities' },
  { icon: Utensils, label: 'Dining', href: '#dining' },
  { icon: Compass, label: 'Experiences', href: '#experiences' },
];

export function Navigation({ cartItemCount = 0, onCartClick }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled 
            ? 'bg-white/90 backdrop-blur-xl shadow-soft border-b border-gray-100/50' 
            : 'bg-transparent'
        }`}
      >
        {/* Main Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <motion.a 
              href="/"
              className="flex items-center gap-2 group"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="w-10 h-10 rounded-xl gradient-ocean flex items-center justify-center shadow-glow">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <span className={`text-xl font-bold transition-colors ${
                isScrolled ? 'text-gray-900' : 'text-white'
              }`}>
                Traveloure
              </span>
            </motion.a>

            {/* Search Bar - Desktop */}
            <div className="hidden lg:flex flex-1 max-w-xl mx-8">
              <motion.div 
                className={`relative w-full transition-all duration-300 ${
                  isSearchFocused ? 'scale-105' : ''
                }`}
              >
                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                  isSearchFocused ? 'text-ocean-500' : 'text-gray-400'
                }`} />
                <Input
                  type="text"
                  placeholder="Search destinations, hotels, activities..."
                  className={`w-full pl-12 pr-4 py-3 rounded-full border-2 transition-all duration-300 ${
                    isScrolled 
                      ? 'bg-gray-50 border-gray-200 focus:border-ocean-500 focus:bg-white' 
                      : 'bg-white/20 border-white/30 text-white placeholder:text-white/70 focus:bg-white/30 focus:border-white/50'
                  }`}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
              </motion.div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 lg:gap-4">
              {/* Cart Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onCartClick}
                className={`relative p-2.5 rounded-xl transition-all ${
                  isScrolled 
                    ? 'hover:bg-gray-100 text-gray-700' 
                    : 'hover:bg-white/20 text-white'
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-sunset-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
                  >
                    {cartItemCount}
                  </motion.span>
                )}
              </motion.button>

              {/* User Menu - Desktop */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`hidden lg:flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
                      isScrolled 
                        ? 'hover:bg-gray-100 text-gray-700' 
                        : 'hover:bg-white/20 text-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isScrolled ? 'bg-ocean-100' : 'bg-white/20'
                    }`}>
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-medium">Sign In</span>
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem>
                    <User className="w-4 h-4 mr-2" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Calendar className="w-4 h-4 mr-2" />
                    My Trips
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Heart className="w-4 h-4 mr-2" />
                    Saved
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Menu Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`lg:hidden p-2.5 rounded-xl transition-all ${
                  isScrolled 
                    ? 'hover:bg-gray-100 text-gray-700' 
                    : 'hover:bg-white/20 text-white'
                }`}
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Secondary Navigation - Categories */}
        <div className={`hidden lg:block border-t transition-all duration-300 ${
          isScrolled ? 'border-gray-100 bg-white/50' : 'border-white/10 bg-transparent'
        }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1 py-2">
              {navCategories.map((category) => (
                <motion.a
                  key={category.label}
                  href={category.href}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isScrolled 
                      ? 'text-gray-600 hover:text-ocean-600 hover:bg-ocean-50' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <category.icon className="w-4 h-4" />
                  {category.label}
                </motion.a>
              ))}
            </nav>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-x-0 top-16 z-40 lg:hidden"
          >
            <div className="bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-lg">
              {/* Mobile Search */}
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search destinations..."
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 border-gray-200"
                  />
                </div>
              </div>

              {/* Mobile Categories */}
              <nav className="px-4 pb-4">
                {navCategories.map((category) => (
                  <a
                    key={category.label}
                    href={category.href}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-ocean-50 hover:text-ocean-600 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center">
                      <category.icon className="w-5 h-5 text-ocean-600" />
                    </div>
                    {category.label}
                  </a>
                ))}
              </nav>

              {/* Mobile Auth */}
              <div className="p-4 border-t border-gray-100">
                <Button className="w-full btn-primary">
                  <User className="w-4 h-4 mr-2" />
                  Sign In / Register
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default Navigation;
