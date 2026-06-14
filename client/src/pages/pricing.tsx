import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
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
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useAuth } from "@/hooks/use-auth";

// LB-P5a: canonical credit packages — retained for server consumers; no longer displayed on pricing page.
// import { CREDIT_PACKAGES as creditPackages } from "@shared/credit-packages";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out Traveloure",
    icon: Sparkles,
    features: [
      "1 free AI optimize run",
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
    name: "Power Pass",
    price: "$9",
    period: "/month",
    description: "2 optimize runs + 25% pay-per-use discount",
    icon: Users,
    popular: true,
    features: [
      "2 AI optimize runs per month",
      "25% discount on pay-per-use fees",
      "Unlimited trip saves",
      "Expert chat access",
      "Advanced itinerary features",
      "Priority support",
      "Trip collaboration tools"
    ],
    cta: "Upgrade to Power Pass",
    variant: "default" as const
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For travel agencies and large teams",
    icon: Crown,
    features: [
      "Unlimited optimize runs",
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
  { id: "ai-planning", feature: "AI Trip Planning", free: true, power: true, enterprise: true },
  { id: "optimize-runs", feature: "AI Optimize Runs", free: "1 total", power: "2/month", enterprise: "Unlimited" },
  { id: "overage-discount", feature: "Pay-Per-Use Discount", free: false, power: "25% off", enterprise: "Included" },
  { id: "itinerary", feature: "Itinerary Generation", free: "Basic", power: "Advanced", enterprise: "Advanced" },
  { id: "expert-chat", feature: "Expert Chat", free: "Limited", power: "Unlimited", enterprise: "Unlimited" },
  { id: "trip-saves", feature: "Trip Saves", free: "3", power: "Unlimited", enterprise: "Unlimited" },
  { id: "support", feature: "Support", free: "Community", power: "Priority", enterprise: "Dedicated" },
  { id: "collaboration", feature: "Collaboration", free: false, power: true, enterprise: true },
  { id: "api", feature: "API Access", free: false, power: false, enterprise: true },
  { id: "integrations", feature: "Custom Integrations", free: false, power: false, enterprise: true },
];

export default function PricingPage() {
  const { openSignInModal } = useSignInModal();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const handlePricingAction = () => {
    if (user) {
      setLocation("/credits");
    } else {
      openSignInModal();
    }
  };
  
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
                    <Button 
                      variant={plan.variant} 
                      className="w-full mt-6"
                      onClick={handlePricingAction}
                      data-testid={`button-plan-${plan.name.toLowerCase()}`}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pay-Per-Use Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Pay-Per-Use
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No subscription required. Pay only for what you use. Power Pass subscribers get 25% off.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { name: "Trip / Experience", price: "$5.99", desc: "Per AI optimize run" }, // fee-literal-ok: UI display string, fees resolve from config
              { name: "Event", price: "$19.99", desc: "Per AI optimize run (credited toward coordination)" }, // fee-literal-ok: UI display string, fees resolve from config
              { name: "Coordination", price: "8% or $499", desc: "Greater-of: 8% of event budget or $499 flat" },
            ].map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="text-center relative hover-elevate">
                  <CardContent className="p-6 pt-8">
                    <div className="text-sm font-medium text-muted-foreground mb-2">{tier.name}</div>
                    <div className="text-3xl font-bold text-primary mb-1">{tier.price}</div>
                    <div className="text-sm text-muted-foreground">{tier.desc}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Power Pass members save 25% on all pay-per-use fees. Break-even at ~1.5 runs/month.
            </p>
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
                  <th className="text-center py-4 px-4 font-medium text-primary">Power Pass</th>
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
                      {typeof row.power === "boolean" ? (
                        row.power ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className="text-sm font-medium">{row.power}</span>
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
                q: "What are optimize runs and how do they work?",
                a: "An optimize run is a full AI-powered plan generation for your trip, experience, or event. The AI analyzes your preferences, budget, and dates to produce a curated itinerary with bookings and vendor recommendations. Free users get 1 run; Power Pass subscribers get 2 per month."
              },
              {
                q: "Can I upgrade or downgrade my plan anytime?",
                a: "Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll get immediate access to new features. When downgrading, changes take effect at the end of your billing period."
              },
              {
                q: "Do unused optimize runs roll over?",
                a: "Power Pass optimize runs do not roll over — they reset each billing month. This keeps the plan simple and predictable. Pay-per-use fees are always available if you need more."
              },
              {
                q: "What is the 25% overage discount?",
                a: "Power Pass subscribers get 25% off all pay-per-use fees. For example, a $5.99 Trip optimize costs only $4.49 with the discount. The discount applies automatically at checkout." // fee-literal-ok: UI FAQ string, fees resolve from config
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
              Get 1 free AI optimize run when you sign up. No credit card required.
            </p>
            <Button size="lg" variant="secondary" onClick={handlePricingAction} data-testid="button-get-started-free">
              Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
