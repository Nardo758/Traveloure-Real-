import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Sparkles,
  Users,
  Globe,
  Calendar,
  MessageSquare,
  Shield,
  Clock,
  Star,
  Bot,
  Map,
  CreditCard,
  HeadphonesIcon,
  ArrowRight,
  CheckCircle,
  Zap,
} from "lucide-react";

const mainFeatures = [
  {
    title: "AI-Powered Trip Planning",
    description:
      "Our AI assistant creates personalized itineraries based on your preferences, travel style, and budget. Get recommendations in seconds, not hours.",
    icon: Bot,
    highlights: [
      "Instant itinerary generation",
      "Smart activity suggestions",
      "Budget optimization",
      "Real-time adjustments",
    ],
  },
  {
    title: "Local Expert Network",
    description:
      "Connect with verified local experts who know their destinations inside out. Get insider tips and authentic experiences you won't find in guidebooks.",
    icon: Users,
    highlights: [
      "500+ verified experts",
      "50+ countries covered",
      "Direct messaging",
      "Custom recommendations",
    ],
  },
  {
    title: "Seamless Booking",
    description:
      "Book activities, accommodations, and services all in one place. No more juggling multiple tabs and apps.",
    icon: Calendar,
    highlights: [
      "One-click booking",
      "Secure payments",
      "Instant confirmation",
      "Easy modifications",
    ],
  },
];

const additionalFeatures = [
  {
    title: "Real-Time Chat",
    description: "Message experts directly for quick answers and recommendations",
    icon: MessageSquare,
  },
  {
    title: "Global Coverage",
    description: "Access experts and experiences in 50+ countries worldwide",
    icon: Globe,
  },
  {
    title: "Verified Providers",
    description: "All experts and providers undergo thorough verification",
    icon: Shield,
  },
  {
    title: "24/7 Support",
    description: "Our support team is available around the clock",
    icon: HeadphonesIcon,
  },
  {
    title: "Flexible Payments",
    description: "Pay with credit card, PayPal, or Apple Pay",
    icon: CreditCard,
  },
  {
    title: "Interactive Maps",
    description: "Visualize your itinerary on beautiful interactive maps",
    icon: Map,
  },
];

const stats = [
  { value: "50K+", label: "Trips Planned" },
  { value: "500+", label: "Local Experts" },
  { value: "98%", label: "Satisfaction Rate" },
  { value: "50+", label: "Countries" },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#111827] to-[#1F2937] text-white py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Badge className="bg-[#FF385C] text-white mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              Powerful Features
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Everything You Need for the
              <br />
              Perfect Trip
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
              From AI-powered planning to local expert connections, Traveloure
              gives you all the tools to create unforgettable travel experiences.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/discover">
                <Button
                  size="lg"
                  className="bg-[#FF385C] hover:bg-[#E23350] text-white px-8"
                  data-testid="button-start-planning"
                >
                  Start Planning <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/experts">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 px-8"
                  data-testid="button-find-expert"
                >
                  Find an Expert
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16">
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              Core Features
            </h2>
            <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
              The powerful tools that make Traveloure your complete travel
              planning companion
            </p>
          </div>

          <div className="space-y-16">
            {mainFeatures.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                  idx % 2 === 1 ? "lg:flex-row-reverse" : ""
                }`}
              >
                <div className={idx % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="w-16 h-16 rounded-2xl bg-[#FFE3E8] flex items-center justify-center mb-6">
                    <feature.icon className="w-8 h-8 text-[#FF385C]" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-[#111827] mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-lg text-[#6B7280] mb-6">
                    {feature.description}
                  </p>
                  <ul className="space-y-3">
                    {feature.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-center gap-3 text-[#374151]"
                      >
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={idx % 2 === 1 ? "lg:order-1" : ""}>
                  <Card className="border-[#E5E7EB] bg-gradient-to-br from-[#F9FAFB] to-white">
                    <CardContent className="p-8 h-80 flex items-center justify-center">
                      <feature.icon className="w-32 h-32 text-[#E5E7EB]" />
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              And Much More
            </h2>
            <p className="text-lg text-[#6B7280]">
              Additional features to make your travel planning seamless
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {additionalFeatures.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="border-[#E5E7EB] hover:shadow-lg hover:border-[#FF385C] transition-all h-full">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-lg bg-[#FFE3E8] flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#111827] mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-[#6B7280]">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-[#FF385C] to-[#E23350]">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Zap className="w-12 h-12 text-white mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Experience These Features?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Start planning your perfect trip today. It's free to get started.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/discover">
              <Button
                size="lg"
                className="bg-white text-[#FF385C] hover:bg-gray-100 px-8"
                data-testid="button-start-free"
              >
                Start Free
              </Button>
            </Link>
            <Link href="/discover">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 px-8"
                data-testid="button-browse-packages"
              >
                Browse Packages
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
