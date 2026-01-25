import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MessageSquare, 
  Users, 
  Sparkles, 
  ArrowRight,
  ClipboardList,
  UserCheck,
  PartyPopper,
  Check
} from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Tell Us Your Plans",
    description: "Share your travel dreams, preferences, and requirements. Whether it's a romantic getaway, adventure trip, or corporate retreat, we'll customize everything to your needs.",
    icon: ClipboardList,
    color: "bg-blue-500",
    features: [
      "Choose your event type (Travel, Wedding, Proposal, etc.)",
      "Set your destination and dates",
      "Define your budget and preferences",
      "Select your planning approach"
    ]
  },
  {
    number: "02",
    title: "Get Matched & Plan",
    description: "Our AI analyzes thousands of options to create the perfect itinerary, or we connect you with a local expert who knows your destination inside out.",
    icon: UserCheck,
    color: "bg-primary",
    features: [
      "AI-generated personalized itineraries",
      "Expert recommendations and insider tips",
      "Real-time collaboration on your plan",
      "Flexible adjustments anytime"
    ]
  },
  {
    number: "03",
    title: "Enjoy Your Experience",
    description: "Travel with confidence knowing every detail is handled. From bookings to local recommendations, we're with you every step of the way.",
    icon: PartyPopper,
    color: "bg-green-500",
    features: [
      "All bookings managed in one place",
      "24/7 support during your trip",
      "Real-time updates and notifications",
      "Post-trip memories and reviews"
    ]
  }
];

const planningOptions = [
  {
    title: "AI-Powered Planning",
    description: "Let our advanced AI create personalized itineraries based on your preferences, budget, and travel style.",
    icon: Sparkles,
    price: "Free - 5 Credits",
    features: ["Instant itinerary generation", "Budget optimization", "Multi-destination support", "24/7 AI assistance"]
  },
  {
    title: "Hybrid AI + Expert",
    description: "Combine AI efficiency with human expertise. Get AI suggestions refined by local travel experts.",
    icon: Users,
    price: "10 - 25 Credits",
    features: ["AI-generated base plan", "Expert review and refinement", "Insider local tips", "Priority support"]
  },
  {
    title: "Expert-Led Planning",
    description: "Work directly with a certified local expert who crafts every detail of your trip personally.",
    icon: MessageSquare,
    price: "25 - 50 Credits",
    features: ["Dedicated travel expert", "Fully customized experience", "Real-time chat support", "Concierge-level service"]
  }
];

export default function HowItWorksPage() {
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
              How Traveloure Works
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              From dream to destination in three simple steps. Our AI-powered platform and expert network make travel planning effortless.
            </p>
            <a href="/api/login">
              <Button size="lg" data-testid="button-get-started">
                Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="space-y-16 md:space-y-24">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`grid md:grid-cols-2 gap-8 md:gap-16 items-center ${
                  index % 2 === 1 ? "md:flex-row-reverse" : ""
                }`}
                data-testid={`section-step-${step.number}`}
              >
                <div className={index % 2 === 1 ? "md:order-2" : ""}>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-6xl font-bold text-muted-foreground/20" data-testid={`text-step-number-${step.number}`}>{step.number}</span>
                    <div className={`w-14 h-14 rounded-xl ${step.color} flex items-center justify-center`}>
                      <step.icon className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold text-[#111827] dark:text-white mb-4" data-testid={`text-step-title-${step.number}`}>
                    {step.title}
                  </h2>
                  <p className="text-lg text-muted-foreground mb-6">
                    {step.description}
                  </p>
                  <ul className="space-y-3">
                    {step.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3" data-testid={`text-step-feature-${step.number}-${i}`}>
                        <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`${index % 2 === 1 ? "md:order-1" : ""}`}>
                  <div className="aspect-video rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center" data-testid={`img-step-placeholder-${step.number}`}>
                    <step.icon className="w-24 h-24 text-muted-foreground/30" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Planning Options Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-white mb-4">
              Choose Your Planning Style
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Whether you prefer AI efficiency, expert guidance, or a combination of both, we have the perfect option for you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {planningOptions.map((option, i) => (
              <motion.div
                key={option.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full" data-testid={`card-planning-option-${i}`}>
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <option.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#111827] dark:text-white mb-2">
                      {option.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {option.description}
                    </p>
                    <p className="text-lg font-bold text-primary mb-4">{option.price}</p>
                    <ul className="space-y-2">
                      {option.features.map((feature, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="w-4 h-4 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
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
              Ready to Start Planning?
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
              Join thousands of travelers who have discovered the joy of effortless trip planning.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href="/api/login">
                <Button size="lg" variant="secondary" data-testid="button-create-trip-cta">
                  Create Your First Trip <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
              <Link href="/experts">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" data-testid="button-browse-experts">
                  Browse Experts
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
