import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Award,
  TrendingUp,
  Users,
  Globe
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function formatStat(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M+`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K+`;
  return `${n}+`;
}

const PRESS_EMAIL = "press@traveloure.com";

export default function PressPage() {
  const { data: platformStats } = useQuery<{
    totalTrips: number; totalUsers: number; totalExperts: number; totalReviews: number; totalCountries: number; avgRating: string;
  }>({ queryKey: ["/api/platform/stats"] });

  const stats = [
    { label: "Active Users", value: platformStats ? formatStat(platformStats.totalUsers) : "0+", icon: Users },
    { label: "Countries", value: platformStats ? formatStat(platformStats.totalCountries) : "0+", icon: Globe },
    { label: "Local Experts", value: platformStats ? formatStat(platformStats.totalExperts) : "0+", icon: Award },
    { label: "Trips Planned", value: platformStats ? formatStat(platformStats.totalTrips) : "0+", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Badge className="mb-4 bg-white/20 text-white">Press &amp; Media</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Press Inquiries
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-8">
            Traveloure is an early-stage platform in beta. We don't have a newsroom
            archive yet — for anything you need, reach our team directly.
          </p>
          <Button variant="secondary" size="lg" asChild>
            <a href={`mailto:${PRESS_EMAIL}`} data-testid="link-press-email-hero">
              <Mail className="w-4 h-4 mr-2" />
              Email the press team
            </a>
          </Button>
        </div>
      </section>

      {/* Stats Section — live values from /api/platform/stats */}
      <section className="py-12 border-b bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center">
                  <Icon className="w-8 h-8 mx-auto mb-3 text-primary" />
                  <div className="text-3xl font-bold mb-1">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-8">
            Live platform totals. These are the current numbers, not projections.
          </p>
        </div>
      </section>

      {/* Boilerplate + Contact */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">About Traveloure</h2>
          <p className="text-muted-foreground leading-relaxed mb-10">
            Traveloure is a travel and experience planning platform. It pairs AI
            itinerary tools with a reviewed network of local experts and service
            providers, so travellers can plan a trip, a wedding, a proposal or a
            corporate event in one place. The platform is currently in beta.
          </p>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-1">Media contact</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Interview requests, product questions and fact-checks all go to the
                same inbox.
              </p>
              <a
                href={`mailto:${PRESS_EMAIL}`}
                className="font-medium text-primary underline underline-offset-4"
                data-testid="link-press-email"
              >
                {PRESS_EMAIL}
              </a>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
