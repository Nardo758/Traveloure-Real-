import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Users,
  Globe,
  DollarSign,
  Clock,
  Award,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Building2,
  Plane,
  Calendar,
  Briefcase,
  Star,
  TrendingUp,
  Shield,
  Zap,
} from "lucide-react";

const partnerTypes = [
  {
    id: "travel-expert",
    title: "Travel Expert",
    description: "Share your destination knowledge and help travelers discover authentic experiences",
    icon: Plane,
    benefits: [
      "Set your own rates and availability",
      "AI-powered tools to create itineraries",
      "Direct chat with clients",
      "Earn up to $5,000+/month",
    ],
    requirements: [
      "Deep knowledge of your destination",
      "Excellent communication skills",
      "Responsive within 24 hours",
    ],
    cta: "Apply as Travel Expert",
    href: "/travel-experts",
    popular: true,
  },
  {
    id: "local-expert",
    title: "Local Expert",
    description: "Guide travelers through your city with personalized tours and insider tips",
    icon: Globe,
    benefits: [
      "Flexible scheduling",
      "Build your personal brand",
      "Access to global clientele",
      "Earn per tour or consultation",
    ],
    requirements: [
      "Local resident for 2+ years",
      "Passion for your city",
      "Language proficiency",
    ],
    cta: "Apply as Local Expert",
    href: "/travel-experts",
    popular: false,
  },
  {
    id: "event-planner",
    title: "Event Planner",
    description: "Plan weddings, proposals, and celebrations in your destination",
    icon: Calendar,
    benefits: [
      "Premium pricing for events",
      "Long-term client relationships",
      "Vendor network support",
      "Higher commission rates",
    ],
    requirements: [
      "Event planning experience",
      "Vendor relationships",
      "Portfolio of past events",
    ],
    cta: "Apply as Event Planner",
    href: "/travel-experts",
    popular: false,
  },
  {
    id: "service-provider",
    title: "Service Provider",
    description: "List your hotel, restaurant, tour, or experience on our platform",
    icon: Building2,
    benefits: [
      "Access to qualified leads",
      "No upfront costs",
      "Booking management tools",
      "Marketing exposure",
    ],
    requirements: [
      "Licensed business",
      "Quality service standards",
      "Insurance coverage",
    ],
    cta: "Register Your Business",
    href: "/services-provider",
    popular: false,
  },
  {
    id: "executive-assistant",
    title: "Executive Assistant",
    description: "Manage travel and events for high-net-worth clients",
    icon: Briefcase,
    benefits: [
      "Premium client base",
      "Recurring bookings",
      "Dedicated support team",
      "Highest earning potential",
    ],
    requirements: [
      "EA/PA experience preferred",
      "Discretion and professionalism",
      "Multi-tasking ability",
    ],
    cta: "Apply as EA",
    href: "/travel-experts",
    popular: false,
  },
];

const stats = [
  { value: "500+", label: "Active Partners" },
  { value: "$2M+", label: "Partner Earnings" },
  { value: "50+", label: "Countries" },
  { value: "4.9", label: "Partner Rating" },
];

const testimonials = [
  {
    quote: "Traveloure has transformed my passion for Paris into a thriving business. I now help 20+ travelers every month.",
    author: "Marie L.",
    role: "Travel Expert, Paris",
    earnings: "$4,500/month avg",
  },
  {
    quote: "The AI tools make creating custom itineraries so easy. What used to take hours now takes minutes.",
    author: "Kenji T.",
    role: "Local Expert, Tokyo",
    earnings: "$3,200/month avg",
  },
  {
    quote: "As an event planner, the quality of clients from Traveloure is exceptional. They're serious about their celebrations.",
    author: "Sofia R.",
    role: "Event Planner, Barcelona",
    earnings: "$6,000/month avg",
  },
];

const howItWorks = [
  { step: 1, title: "Apply", description: "Submit your application with your expertise and experience", icon: Users },
  { step: 2, title: "Get Verified", description: "Our team reviews your application within 48 hours", icon: Shield },
  { step: 3, title: "Set Up Profile", description: "Create your profile and set your rates", icon: Star },
  { step: 4, title: "Start Earning", description: "Connect with travelers and earn on your terms", icon: DollarSign },
];

export default function PartnerWithUsPage() {
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
              Join 500+ Partners Worldwide
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Turn Your Expertise Into Income
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
              Join our global network of travel experts, local guides, and service
              providers. Help travelers create unforgettable experiences while
              earning on your own terms.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="#partner-types">
                <Button
                  size="lg"
                  className="bg-[#FF385C] hover:bg-[#E23350] text-white px-8"
                  data-testid="button-get-started"
                >
                  Get Started <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 px-8"
                  data-testid="button-learn-more"
                >
                  Learn More
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

      {/* Partner Types */}
      <section id="partner-types" className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              Choose Your Path
            </h2>
            <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
              Whether you're a travel enthusiast, local guide, or business owner,
              there's a place for you on Traveloure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {partnerTypes.map((type, idx) => (
              <motion.div
                key={type.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card
                  className={`h-full border-[#E5E7EB] hover:shadow-lg transition-shadow relative ${
                    type.popular ? "ring-2 ring-[#FF385C]" : ""
                  }`}
                  data-testid={`card-partner-${type.id}`}
                >
                  {type.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-[#FF385C] text-white">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-[#FFE3E8] flex items-center justify-center mb-4">
                      <type.icon className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <CardTitle className="text-xl text-[#111827]">
                      {type.title}
                    </CardTitle>
                    <p className="text-[#6B7280]">{type.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-[#111827] mb-2">
                        Benefits
                      </h4>
                      <ul className="space-y-2">
                        {type.benefits.map((benefit) => (
                          <li
                            key={benefit}
                            className="flex items-start gap-2 text-sm text-[#6B7280]"
                          >
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-[#111827] mb-2">
                        Requirements
                      </h4>
                      <ul className="space-y-1">
                        {type.requirements.map((req) => (
                          <li key={req} className="text-sm text-[#6B7280]">
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Link href={type.id === "service-provider" ? "/services-provider" : "/travel-experts"}>
                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                        data-testid={`button-apply-${type.id}`}
                      >
                        {type.cta}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              How It Works
            </h2>
            <p className="text-lg text-[#6B7280]">
              Getting started is simple. Join our platform in 4 easy steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {howItWorks.map((step, idx) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="text-center"
              >
                <div className="relative mb-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[#FFE3E8] flex items-center justify-center">
                    <step.icon className="w-8 h-8 text-[#FF385C]" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#FF385C] text-white flex items-center justify-center font-bold text-sm">
                    {step.step}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-[#111827] mb-2">
                  {step.title}
                </h3>
                <p className="text-[#6B7280]">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              Partner Success Stories
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, idx) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-[#E5E7EB]">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className="w-4 h-4 text-yellow-500 fill-yellow-500"
                        />
                      ))}
                    </div>
                    <p className="text-[#374151] mb-6 italic">
                      "{testimonial.quote}"
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#111827]">
                          {testimonial.author}
                        </div>
                        <div className="text-sm text-[#6B7280]">
                          {testimonial.role}
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {testimonial.earnings}
                      </Badge>
                    </div>
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
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Start Earning?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of partners who are turning their passion into profit.
            No upfront costs, flexible schedule, unlimited potential.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/travel-experts">
              <Button
                size="lg"
                className="bg-white text-[#FF385C] hover:bg-gray-100 px-8"
                data-testid="button-apply-expert"
              >
                Apply as Expert
              </Button>
            </Link>
            <Link href="/services-provider">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 px-8"
                data-testid="button-register-business"
              >
                Register Business
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
