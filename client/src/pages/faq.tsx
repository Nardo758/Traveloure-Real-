import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import {
  Search,
  HelpCircle,
  Users,
  CreditCard,
  Shield,
  Plane,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

/**
 * §13 (fabrication removal) — corrections applied to these answers:
 *  - payment methods: claimed PayPal and Apple Pay. Only Stripe is integrated
 *    (card payment-intents; `payment_method_types: ['card']` /
 *    `automatic_payment_methods`) — there is no PayPal or wallet integration
 *    anywhere in the codebase. Round 1 removed the identical claim from
 *    /features. Now: card payments via Stripe.
 *  - "Help Me Decide": that surface is retired (/help-me-decide redirects to
 *    /discover in App.tsx). Answers now name what actually ships — Discover and
 *    Ready Made Trips (§10).
 *  - vetting: claimed background checks, interviews and reference checks. What
 *    actually exists is the application + admin review, the Knowledge-Proof
 *    essays with advisory AI scoring (§12), and identity verification. No
 *    background-check or reference-check vendor is integrated.
 *  - insurance/licences: provider insurance is a self-attested boolean
 *    (`has_insurance`, §6), NOT submitted documentation.
 *  - cancellation/modification: the invented "free cancellation up to 24-48h"
 *    and "modify up to 48-72h" windows are gone. The real source is the
 *    per-listing cancellation policy (migration 144 `cancellation_policy_type`).
 *  - support hours and PCI-DSS: no staffed-hours commitment exists; card data
 *    is handled by Stripe (the framing the privacy policy already uses).
 * A claim reappears here only when something real backs it.
 */

const faqCategories = [
  { id: "general", label: "General", icon: HelpCircle },
  { id: "booking", label: "Booking", icon: Plane },
  { id: "experts", label: "Experts", icon: Users },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "security", label: "Security", icon: Shield },
];

const faqs = [
  {
    category: "general",
    question: "What is Traveloure?",
    answer:
      "Traveloure is a travel planning platform that connects travelers with local experts who help create personalized itineraries and experiences. We combine AI-powered tools with human expertise to help you plan the perfect trip.",
  },
  {
    category: "general",
    question: "How does Traveloure work?",
    answer:
      "You can browse and book services directly on Discover, work with a local expert to create a custom itinerary, or buy a Ready Made Trip — a complete itinerary an expert has already built and published.",
  },
  {
    category: "general",
    question: "Is Traveloure free to use?",
    answer:
      "Creating an account and browsing is free. You pay when you book a service, buy a Ready Made Trip, or use one of the paid planning tools — expert consultations are priced by the expert, and the platform's own planning and coordination fees are listed on our Pricing page.",
  },
  {
    category: "booking",
    question: "How do I book a trip?",
    answer:
      "You can book a trip by: 1) using Discover to select activities, stays and services, 2) working with an expert who creates a custom itinerary for you, or 3) buying a Ready Made Trip an expert has already published.",
  },
  {
    category: "booking",
    question: "Can I modify my booking after confirmation?",
    answer:
      "Changes depend on the provider's own terms, which are shown on the listing before you book. Message the provider or your expert through the platform to ask about a change — we can't promise a window that isn't in their policy.",
  },
  {
    category: "booking",
    question: "What is the cancellation policy?",
    answer:
      "There is no single platform-wide cancellation policy. Each listing carries its own, set by the provider and shown on the listing and at checkout before you confirm — read that policy for the booking you're making.",
  },
  {
    category: "experts",
    question: "Who are the local experts and trip planners?",
    answer:
      "Local experts are destination insiders who apply to the platform and are reviewed by our team before they can list anything. The review looks at how long they've lived in the city and at written answers about local judgment — the kind of detail a guidebook doesn't carry. Trip planners are itinerary specialists who help design and refine your plans.",
  },
  {
    category: "experts",
    question: "How do I choose the right expert?",
    answer:
      "Browse expert profiles to see their specialties, languages, and the services they offer, along with any traveler reviews those services have received. You can also use our matching system, which recommends experts based on your trip preferences.",
  },
  {
    category: "experts",
    question: "Can I communicate with experts before booking?",
    answer:
      "Yes! You can send messages to experts through our platform to discuss your trip requirements, ask questions, and ensure they're the right fit before committing to their services.",
  },
  {
    category: "payment",
    question: "What payment methods do you accept?",
    answer:
      "We accept card payments (Visa, Mastercard, American Express and other major cards), processed by Stripe.",
  },
  {
    category: "payment",
    question: "Is my payment information secure?",
    answer:
      "Card details are entered directly into Stripe's payment form and are never stored on our servers. The connection is encrypted end to end (SSL/TLS).",
  },
  {
    category: "payment",
    question: "When am I charged for my booking?",
    answer:
      "For most bookings, you're charged at the time of confirmation. Some services may require a deposit with the balance due closer to your travel date. The payment schedule is always shown before you confirm.",
  },
  {
    category: "security",
    question: "How do you verify experts and service providers?",
    answer:
      "Experts and service providers apply, and an admin reviews every application before the listing can go live — nothing an applicant submits publishes itself. Expert applications include written local-knowledge answers we assess, and identity verification through a third-party provider is available in the earner onboarding flow. Providers state whether they carry insurance, and that answer is shown as their own declaration, not as a document we hold.",
  },
  {
    category: "security",
    question: "What if I have an issue during my trip?",
    answer:
      "Reach us through the contact form or by email and we'll pick it up as soon as we can — we don't staff a round-the-clock line. For something urgent while you're travelling, message your expert advisor directly in the app: they're local and usually fastest.",
  },
  {
    category: "security",
    question: "How is my personal information protected?",
    answer:
      "We take privacy seriously and comply with GDPR and other privacy regulations. Your data is encrypted, stored securely, and never sold to third parties. Read our Privacy Policy for full details.",
  },
];

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("general");

  const filteredFaqs = faqs.filter((faq) => {
    const matchesSearch =
      searchQuery === "" ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      activeCategory === "all" || faq.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#111827] to-[#1F2937] text-white py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">
              How Can We Help?
            </h1>
            <p className="text-lg text-gray-300 mb-8">
              Find answers to common questions about Traveloure
            </p>

            {/* Search Bar */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg border-0 bg-white text-foreground rounded-xl"
                data-testid="input-search-faq"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {faqCategories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className={
                  activeCategory === cat.id
                    ? "bg-primary hover:bg-primary/90 text-white"
                    : "border-border"
                }
                data-testid={`button-category-${cat.id}`}
              >
                <cat.icon className="w-4 h-4 mr-2" />
                {cat.label}
              </Button>
            ))}
          </div>

          {/* FAQ Accordion */}
          <Card className="border-border">
            <CardContent className="p-6">
              {filteredFaqs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((faq, idx) => (
                    <AccordionItem
                      key={idx}
                      value={`item-${idx}`}
                      className="border-b border-border"
                    >
                      <AccordionTrigger
                        className="text-left text-foreground hover:text-primary hover:no-underline py-4"
                        data-testid={`accordion-question-${idx}`}
                      >
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground pb-4">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="text-center py-12">
                  <HelpCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No results found
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or browse by category
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveCategory("general");
                    }}
                    data-testid="button-clear-search"
                  >
                    Clear Search
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Still Need Help */}
      <section className="py-16 bg-white border-t border-border">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Still Have Questions?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Can't find what you're looking for? Our support team is here to help
            you with any questions or concerns.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white"
                data-testid="button-contact-us"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Contact Us
              </Button>
            </Link>
            <Link href="/experts">
              <Button
                size="lg"
                variant="outline"
                className="border-border"
                data-testid="button-talk-to-expert"
              >
                Talk to an Expert
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
