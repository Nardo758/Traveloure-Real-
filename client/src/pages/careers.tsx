import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  Briefcase, 
  MapPin, 
  Clock, 
  DollarSign, 
  Heart, 
  Users, 
  TrendingUp,
  Globe,
  Target,
  Zap,
  ArrowRight
} from "lucide-react";

const openPositions = [
  {
    id: 1,
    title: "Senior Full Stack Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    salary: "$120k - $180k",
    description: "Build and scale our travel platform using React, Node.js, and modern cloud technologies."
  },
  {
    id: 2,
    title: "Travel Experience Designer",
    department: "Product",
    location: "San Francisco, CA",
    type: "Full-time",
    salary: "$90k - $130k",
    description: "Design intuitive experiences that help travelers discover and book their perfect trips."
  },
  {
    id: 3,
    title: "Local Expert Partnership Manager",
    department: "Partnerships",
    location: "Remote",
    type: "Full-time",
    salary: "$70k - $100k",
    description: "Build relationships with local experts and service providers worldwide."
  },
  {
    id: 4,
    title: "AI/ML Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    salary: "$140k - $200k",
    description: "Develop AI-powered recommendation engines and travel planning systems."
  },
  {
    id: 5,
    title: "Customer Success Lead",
    department: "Customer Success",
    location: "New York, NY",
    type: "Full-time",
    salary: "$60k - $85k",
    description: "Ensure travelers and experts have exceptional experiences on our platform."
  },
  {
    id: 6,
    title: "Content Marketing Manager",
    department: "Marketing",
    location: "Remote",
    type: "Full-time",
    salary: "$75k - $110k",
    description: "Create compelling content that inspires travel and showcases our platform."
  },
];

const perks = [
  {
    icon: Globe,
    title: "Remote First",
    description: "Work from anywhere in the world"
  },
  {
    icon: Heart,
    title: "Health & Wellness",
    description: "Comprehensive health insurance and wellness programs"
  },
  {
    icon: TrendingUp,
    title: "Growth Opportunities",
    description: "Professional development and learning budget"
  },
  {
    icon: Users,
    title: "Amazing Team",
    description: "Collaborate with talented, passionate people"
  },
  {
    icon: DollarSign,
    title: "Competitive Pay",
    description: "Market-rate salaries and equity options"
  },
  {
    icon: Zap,
    title: "Travel Credits",
    description: "Annual travel credits to explore new destinations"
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Badge className="mb-4 bg-white/20 text-white">We're Hiring!</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Join Our Mission to Transform Travel
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Help us build the future of personalized travel experiences. 
            Work with a passionate team making travel planning effortless and inspiring.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => document.getElementById('positions')?.scrollIntoView({ behavior: 'smooth' })}
          >
            View Open Positions
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Company Values */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Traveloure?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're building a company culture that values innovation, diversity, and work-life balance
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {perks.map((perk) => {
              const Icon = perk.icon;
              return (
                <Card key={perk.title} className="text-center">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{perk.title}</h3>
                    <p className="text-sm text-muted-foreground">{perk.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section id="positions" className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Open Positions</h2>
            <p className="text-muted-foreground">
              Join our growing team and help shape the future of travel
            </p>
          </div>

          <div className="space-y-4">
            {openPositions.map((position) => (
              <Card key={position.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{position.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mb-4">
                        {position.description}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Briefcase className="w-4 h-4" />
                          <span>{position.department}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          <span>{position.location}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{position.type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="w-4 h-4" />
                          <span>{position.salary}</span>
                        </div>
                      </div>
                    </div>
                    <Button className="ml-4">
                      Apply Now
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">Don't See the Right Role?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            We're always looking for talented people. Send us your resume and tell us why you'd be a great fit for Traveloure.
          </p>
          <Link href="/contact">
            <Button size="lg">
              Get in Touch
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
