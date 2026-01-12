import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  Sparkles, 
  Users, 
  Crown,
  ArrowRight,
  HelpCircle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const creditPackages = [
  {
    credits: 10,
    price: 9.99,
    bonus: 0,
    popular: false
  },
  {
    credits: 25,
    price: 19.99,
    bonus: 5,
    popular: false
  },
  {
    credits: 50,
    price: 34.99,
    bonus: 15,
    popular: true
  },
  {
    credits: 100,
    price: 59.99,
    bonus: 40,
    popular: false
  },
  {
    credits: 250,
    price: 129.99,
    bonus: 125,
    popular: false
  }
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out Traveloure",
    icon: Sparkles,
    features: [
      "5 free credits on signup",
      "AI-powered trip planning",
      "Basic itinerary generation",
      "Community support",
      "Save up to 3 trips"
    ],
    limitations: [
      "Limited expert access",
      "Basic customization"
    ],
    cta: "Get Started",
    variant: "outline" as const
  },
  {
    name: "Pro",
    price: "$14.99",
    period: "/month",
    description: "For frequent travelers who want more",
    icon: Users,
    popular: true,
    features: [
      "25 credits per month",
      "Priority AI processing",
      "Unlimited trip saves",
      "Expert chat access",
      "Advanced itinerary features",
      "Priority support",
      "Trip collaboration tools"
    ],
    cta: "Upgrade to Pro",
    variant: "default" as const
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For travel agencies and large teams",
    icon: Crown,
    features: [
      "Unlimited credits",
      "Dedicated account manager",
      "Custom integrations",
      "Team management",
      "White-label options",
      "API access",
      "SLA guarantees",
      "Priority everything"
    ],
    cta: "Contact Sales",
    variant: "outline" as const
  }
];

const featureComparison = [
  { id: "ai-planning", feature: "AI Trip Planning", free: true, pro: true, enterprise: true },
  { id: "itinerary", feature: "Itinerary Generation", free: "Basic", pro: "Advanced", enterprise: "Advanced" },
  { id: "expert-chat", feature: "Expert Chat", free: "Limited", pro: "Unlimited", enterprise: "Unlimited" },
  { id: "trip-saves", feature: "Trip Saves", free: "3", pro: "Unlimited", enterprise: "Unlimited" },
  { id: "credits", feature: "Monthly Credits", free: "5 one-time", pro: "25/month", enterprise: "Unlimited" },
  { id: "support", feature: "Support", free: "Community", pro: "Priority", enterprise: "Dedicated" },
  { id: "collaboration", feature: "Collaboration", free: false, pro: true, enterprise: true },
  { id: "api", feature: "API Access", free: false, pro: false, enterprise: true },
  { id: "integrations", feature: "Custom Integrations", free: false, pro: false, enterprise: true },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-orange-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-[#111827] dark:text-white mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your travel style. Start free and upgrade as you grow.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Plans Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card 
                  className={`h-full relative ${plan.popular ? "border-primary shadow-lg" : ""}`}
                  data-testid={`card-plan-${plan.name.toLowerCase()}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-white">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <plan.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-[#111827] dark:text-white">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <CardDescription className="mt-2">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-3">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                      {plan.limitations?.map((limitation, j) => (
                        <li key={`lim-${j}`} className="flex items-start gap-3 opacity-50">
                          <Check className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{limitation}</span>
                        </li>
                      ))}
                    </ul>
                    <a href="/api/login">
                      <Button 
                        variant={plan.variant} 
                        className="w-full mt-6"
                        data-testid={`button-plan-${plan.name.toLowerCase()}`}
                      >
                        {plan.cta}
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit Packages Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Buy Credits
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Need more credits? Purchase additional credits anytime. Bigger packages come with bonus credits!
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
            {creditPackages.map((pkg, i) => (
              <motion.div
                key={pkg.credits}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card 
                  className={`text-center relative cursor-pointer hover-elevate ${pkg.popular ? "border-primary" : ""}`}
                  data-testid={`card-credits-${pkg.credits}`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                      <Badge variant="secondary" className="text-xs">Best Value</Badge>
                    </div>
                  )}
                  <CardContent className="p-4 pt-6">
                    <div className="text-3xl font-bold text-primary mb-1">{pkg.credits}</div>
                    <div className="text-sm text-muted-foreground mb-2">credits</div>
                    {pkg.bonus > 0 && (
                      <Badge variant="outline" className="text-xs mb-2">
                        +{pkg.bonus} bonus
                      </Badge>
                    )}
                    <div className="text-xl font-semibold text-[#111827] dark:text-white">
                      ${pkg.price}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Compare Plans
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              See what's included in each plan
            </p>
          </div>

          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full" data-testid="table-feature-comparison">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center py-4 px-4 font-medium">Free</th>
                  <th className="text-center py-4 px-4 font-medium text-primary">Pro</th>
                  <th className="text-center py-4 px-4 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {featureComparison.map((row) => (
                  <tr key={row.id} className="border-b" data-testid={`row-feature-${row.id}`}>
                    <td className="py-4 px-4 text-sm" data-testid={`text-feature-${row.id}`}>{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.free === "boolean" ? (
                        row.free ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.free}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center bg-primary/5">
                      {typeof row.pro === "boolean" ? (
                        row.pro ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className="text-sm font-medium">{row.pro}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.enterprise === "boolean" ? (
                        row.enterprise ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                q: "What are credits and how do they work?",
                a: "Credits are the currency used on Traveloure. You spend credits to access features like AI trip planning, expert consultations, and premium services. Different features cost different amounts of credits."
              },
              {
                q: "Can I upgrade or downgrade my plan anytime?",
                a: "Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll get immediate access to new features. When downgrading, changes take effect at the end of your billing period."
              },
              {
                q: "Do unused credits roll over?",
                a: "For Pro subscribers, unused monthly credits roll over for up to 3 months. Purchased credit packages never expire."
              },
              {
                q: "Is there a refund policy?",
                a: "We offer a 14-day money-back guarantee for all paid plans. If you're not satisfied, contact our support team for a full refund."
              }
            ].map((faq, i) => (
              <Card key={i} data-testid={`card-faq-${i}`}>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-[#111827] dark:text-white mb-2 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-primary" />
                    {faq.q}
                  </h3>
                  <p className="text-muted-foreground text-sm pl-7">{faq.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Start Planning for Free
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
              Get 5 free credits when you sign up. No credit card required.
            </p>
            <a href="/api/login">
              <Button size="lg" variant="secondary" data-testid="button-get-started-free">
                Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
