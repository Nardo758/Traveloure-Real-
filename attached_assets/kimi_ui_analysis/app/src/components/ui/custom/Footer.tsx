import { motion } from 'framer-motion';
import { 
  Compass,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
  ArrowRight,
  CreditCard,
  Shield,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const footerLinks = {
  company: [
    { label: 'About Us', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Press', href: '#' },
    { label: 'Blog', href: '#' },
  ],
  support: [
    { label: 'Help Center', href: '#' },
    { label: 'Contact Us', href: '#' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
  ],
  discover: [
    { label: 'Destinations', href: '#' },
    { label: 'Experiences', href: '#' },
    { label: 'Travel Guides', href: '#' },
    { label: 'Partner with Us', href: '#' },
  ],
};

const socialLinks = [
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Youtube, href: '#', label: 'YouTube' },
];

const paymentMethods = [
  'Visa',
  'Mastercard',
  'Amex',
  'PayPal',
  'Apple Pay',
];

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      {/* Newsletter Section */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="lg:max-w-md">
              <h3 className="text-2xl font-bold mb-2">
                Subscribe to Our Newsletter
              </h3>
              <p className="text-gray-400">
                Get exclusive deals, travel tips, and destination inspiration delivered to your inbox.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 lg:w-auto w-full sm:max-w-md">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className="pl-12 py-3 h-12 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl focus:border-ocean-500 focus:ring-ocean-500"
                />
              </div>
              <Button className="h-12 px-6 gradient-ocean rounded-xl hover:shadow-glow transition-all">
                Subscribe
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <motion.a 
              href="/"
              className="flex items-center gap-2 mb-6"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-10 h-10 rounded-xl gradient-ocean flex items-center justify-center">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Traveloure</span>
            </motion.a>
            <p className="text-gray-400 mb-6 max-w-sm">
              Your AI-powered travel companion. Plan, book, and optimize your perfect journey with personalized recommendations.
            </p>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              <a href="mailto:hello@traveloure.com" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <Mail className="w-4 h-4" />
                hello@traveloure.com
              </a>
              <a href="tel:+1234567890" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <Phone className="w-4 h-4" />
                +1 (234) 567-890
              </a>
              <div className="flex items-center gap-3 text-gray-400">
                <MapPin className="w-4 h-4" />
                San Francisco, CA
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-ocean-500 hover:text-white transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Support</h4>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Discover</h4>
            <ul className="space-y-3">
              {footerLinks.discover.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-center gap-8 mb-8">
            <div className="flex items-center gap-2 text-gray-400">
              <Shield className="w-5 h-5 text-nature-500" />
              <span className="text-sm">Secure Booking</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Award className="w-5 h-5 text-sunset-500" />
              <span className="text-sm">Best Price Guarantee</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <CreditCard className="w-5 h-5 text-ocean-500" />
              <span className="text-sm">Flexible Payment</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="flex flex-wrap justify-center items-center gap-4 mb-8">
            <span className="text-sm text-gray-500">We accept:</span>
            {paymentMethods.map((method) => (
              <div
                key={method}
                className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-400"
              >
                {method}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm text-center sm:text-left">
              © {new Date().getFullYear()} Traveloure. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                Cookies
              </a>
              <div className="flex items-center gap-2">
                <select className="bg-gray-800 text-gray-400 text-sm rounded-lg px-3 py-1.5 border border-gray-700">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
                <select className="bg-gray-800 text-gray-400 text-sm rounded-lg px-3 py-1.5 border border-gray-700">
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                  <option>GBP (£)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
