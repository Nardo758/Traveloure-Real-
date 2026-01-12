import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Target, 
  Heart, 
  Globe, 
  Users,
  ArrowRight,
  Sparkles,
  MapPin,
  Award
} from "lucide-react";

const values = [
  {
    icon: Heart,
    title: "Passion for Travel",
    description: "We believe travel transforms lives. Every feature we build is designed to make your travel dreams a reality."
  },
  {
    icon: Users,
    title: "Community First",
    description: "Our global network of local experts and travelers creates authentic connections and shared experiences."
  },
  {
    icon: Sparkles,
    title: "Innovation",
    description: "We combine cutting-edge AI with human expertise to deliver the best of both worlds in travel planning."
  },
  {
    icon: Globe,
    title: "Global Impact",
    description: "We support sustainable tourism and local communities, ensuring travel benefits everyone involved."
  }
];

const team = [
  {
    name: "Amara Patel",
    role: "Co-Founder & CEO",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
    bio: "Former travel industry executive with 15+ years of experience building travel platforms."
  },
  {
    name: "Marcus Chen",
    role: "Co-Founder & CTO",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
    bio: "AI researcher turned entrepreneur, passionate about using technology to solve real problems."
  },
  {
    name: "Sofia Rodriguez",
    role: "Head of Expert Network",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop",
    bio: "Built our network of 500+ verified local experts across 8 countries."
  },
  {
    name: "James Okonkwo",
    role: "Head of Product",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop",
    bio: "Product leader focused on creating delightful user experiences for travelers."
  }
];

const milestones = [
  { year: "2022", title: "Founded", description: "Traveloure was born from a simple idea: make travel planning effortless." },
  { year: "2023", title: "Beta Launch", description: "Launched beta in 8 cities with our first 100 local experts." },
  { year: "2024", title: "AI Integration", description: "Introduced AI-powered itinerary generation, revolutionizing trip planning." },
  { year: "2025", title: "Global Expansion", description: "Expanding to 25+ countries with 500+ verified experts." }
];

const stats = [
  { value: "8M+", label: "Trips Planned" },
  { value: "500+", label: "Local Experts" },
  { value: "25+", label: "Countries" },
  { value: "4.9", label: "Average Rating" }
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-orange-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl font-bold text-[#111827] dark:text-white mb-6">
                Revolutionizing How the World Plans Travel
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                We're on a mission to make personalized travel planning accessible to everyone, 
                combining the power of AI with the wisdom of local experts.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="/api/login">
                  <Button size="lg" data-testid="button-join-us">
                    Join Our Journey <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <Link href="/explore">
                  <Button size="lg" variant="outline" data-testid="button-meet-experts">
                    Meet Our Experts
                  </Button>
                </Link>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Globe className="w-48 h-48 text-primary/30" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
                data-testid={`stat-${i}`}
              >
                <div className="text-4xl md:text-5xl font-bold text-primary mb-2" data-testid={`text-stat-value-${i}`}>{stat.value}</div>
                <div className="text-gray-400" data-testid={`text-stat-label-${i}`}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Target className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We believe everyone deserves incredible travel experiences, regardless of how much time 
                they have to plan. By combining advanced AI technology with a curated network of local 
                experts, we're making personalized, authentic travel accessible to millions of people worldwide.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Our Values
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The principles that guide everything we do
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {values.map((value, i) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full" data-testid={`card-value-${i}`}>
                  <CardContent className="p-6 text-center">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <value.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#111827] dark:text-white mb-2">
                      {value.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story/Timeline Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Our Story
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From a simple idea to a global platform
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-border md:-translate-x-1/2" />
              {milestones.map((milestone, i) => (
                <motion.div
                  key={milestone.year}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative flex items-center gap-8 mb-8 ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                  data-testid={`milestone-${milestone.year}`}
                >
                  <div className={`flex-1 ${i % 2 === 0 ? "md:text-right" : "md:text-left"} pl-12 md:pl-0`}>
                    <div className="text-primary font-bold text-lg mb-1" data-testid={`text-milestone-year-${milestone.year}`}>{milestone.year}</div>
                    <h3 className="text-xl font-semibold text-[#111827] dark:text-white mb-2" data-testid={`text-milestone-title-${milestone.year}`}>
                      {milestone.title}
                    </h3>
                    <p className="text-muted-foreground text-sm">{milestone.description}</p>
                  </div>
                  <div className="absolute left-4 md:left-1/2 w-4 h-4 rounded-full bg-primary border-4 border-background md:-translate-x-1/2" />
                  <div className="flex-1 hidden md:block" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Meet Our Team
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The passionate people behind Traveloure
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {team.map((member, i) => (
              <motion.div
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full" data-testid={`card-team-${i}`}>
                  <CardContent className="p-6 text-center">
                    <Avatar className="w-24 h-24 mx-auto mb-4 border-4 border-white dark:border-gray-800 shadow-lg">
                      <AvatarImage src={member.image} alt={member.name} />
                      <AvatarFallback className="bg-primary text-white text-xl">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <h3 className="text-lg font-semibold text-[#111827] dark:text-white mb-1">
                      {member.name}
                    </h3>
                    <p className="text-sm text-primary font-medium mb-3">{member.role}</p>
                    <p className="text-sm text-muted-foreground">{member.bio}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Locations Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Where We Operate
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              We're currently in beta across 8 cities, with plans to expand globally
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {["Mumbai, India", "Bogota, Colombia", "Goa, India", "Kyoto, Japan", "Edinburgh, UK", "Barcelona, Spain", "Cape Town, SA", "Bali, Indonesia"].map((city, i) => (
                <span
                  key={city}
                  className="px-4 py-2 bg-muted rounded-full text-sm font-medium text-[#111827] dark:text-white"
                  data-testid={`badge-location-${i}`}
                >
                  {city}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary text-white">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Award className="w-16 h-16 mx-auto mb-6 opacity-80" />
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Join Our Growing Community
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
              Whether you're a traveler seeking adventure or an expert wanting to share your knowledge, 
              there's a place for you at Traveloure.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href="/api/login">
                <Button size="lg" variant="secondary" data-testid="button-start-planning">
                  Start Planning <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <Link href="/partner">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" data-testid="button-become-expert">
                  Become an Expert
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
