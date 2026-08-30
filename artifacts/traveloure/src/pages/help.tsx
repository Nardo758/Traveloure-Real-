import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";
import {
  Search,
  MessageCircle,
  Mail,
  HelpCircle,
} from "lucide-react";

/**
 * §13 (fabrication removal) — what came off this page and why:
 *  - a "Phone Support" card with a fictitious 555-prefix number, and a "Live
 *    Chat" card: there is no phone line and no chat vendor integrated anywhere
 *    in the codebase (no Intercom/Crisp/Zendesk/tawk/Drift). The chat card is
 *    now honestly the contact form it always linked to.
 *  - "Our support team is available 24/7": the same named-open §13 arm round 1
 *    removed from /features. No round-the-clock support exists.
 *  - the entire "Browse by Category" index: five cards listing twenty article
 *    titles as clickable links plus a "View All Articles" button, none of which
 *    had a handler — there is no help-article store, no CMS and no /api/help
 *    endpoint behind any of them. An article index with zero articles is a
 *    fabricated resource, so it is gone rather than dressed up as inert text.
 *    The FAQ accordion below is the page's real content and is kept.
 *  - payment methods: claimed PayPal, Apple Pay and Google Pay. Only Stripe
 *    card payments are integrated (identical claim removed from /features in
 *    round 1, and from /faq in this pass).
 *  - the "5-7 business days" application-review SLA, and the "24-48 hours /
 *    24+ hours for a full refund" cancellation windows: no such commitments
 *    exist. Cancellation terms are per-listing (migration 144
 *    `cancellation_policy_type`), set by the provider and shown before booking.
 *  - "background checks" in the expert-vetting answer: no background-check
 *    vendor is integrated. Kept: the admin review of every application and the
 *    Knowledge-Proof local-knowledge assessment (§12), which are real.
 */

const popularFAQs = [
  {
    question: "How do I book a service?",
    answer: "Browse services on the Discover page, add items to your cart, and proceed to checkout. You can also work with local experts who will help plan and book services for you."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept card payments (Visa, Mastercard, American Express and other major cards), processed by Stripe."
  },
  {
    question: "Can I cancel my booking?",
    answer: "Each listing carries its own cancellation policy, set by the provider and shown on the listing and at checkout before you confirm. There is no single platform-wide window — read the policy on the booking you're making."
  },
  {
    question: "How do I become a local expert?",
    answer: "Visit our 'Become an Expert' page and fill out the application form. An admin reviews every application before you can list anything, and you'll be notified once it's been reviewed."
  },
  {
    question: "Are the local experts verified?",
    answer: "Every expert application is reviewed by an admin before the expert can list anything — nothing an applicant submits publishes itself. The review includes written local-knowledge answers we assess, and identity verification through a third-party provider is available in the earner onboarding flow."
  },
  {
    question: "How does the AI trip planning work?",
    answer: "Our AI analyzes your preferences, budget, and travel style to create personalized itineraries. You can then refine these suggestions with help from local experts."
  },
  {
    question: "What if I have an issue during my trip?",
    answer: "Support is available for active bookings via the app or email. For urgent situations during your trip, contact your expert advisor directly through the app for the fastest response."
  },
  {
    question: "Can I get a refund?",
    answer: "Refunds follow the cancellation policy on the listing you booked, which the provider sets. If something went wrong with a completed booking you can raise it from My Bookings and an admin will review it."
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFAQs = popularFAQs.filter((faq) =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-primary-foreground">
            How can we help you?
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-8">
            Search the answers below, or send us a message
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 bg-white text-foreground text-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="py-8 border-b bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <Link href="/contact">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Send us a message</h3>
                  <p className="text-sm text-muted-foreground">Use the contact form and it reaches the team</p>
                </CardContent>
              </Card>
            </Link>

            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardContent className="p-6 text-center">
                <Mail className="w-8 h-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Email Support</h3>
                <a
                  href="mailto:support@traveloure.com"
                  className="text-sm text-muted-foreground break-words hover:text-primary hover:underline"
                  data-testid="link-help-email"
                >
                  support@traveloure.com
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Popular FAQs */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <HelpCircle className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">
              Quick answers to common questions
            </p>
          </div>

          {filteredFAQs.length > 0 ? (
            <Accordion type="single" collapsible className="w-full">
              {filteredFAQs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No results found for "{searchQuery}"
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setSearchQuery("")}
              >
                Clear Search
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold mb-4">Still need help?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Send us a message and we'll get back to you. If you're already travelling,
            your expert advisor is usually the fastest route — message them in the app.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact">
              <Button size="lg">
                Contact Support
              </Button>
            </Link>
            <Link href="/faq">
              <Button size="lg" variant="outline">
                View All FAQs
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
