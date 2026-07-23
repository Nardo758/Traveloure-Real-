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
      "You can either browse and book experiences directly, work with a local expert to create a custom itinerary, or use our Help Me Decide feature to explore pre-researched trip packages. Our experts handle all the details so you can enjoy your trip.",
  },
  {
    category: "general",
    question: "Is Traveloure free to use?",
    answer:
      "Creating an account and browsing is completely free. You only pay when you book experiences or services. Expert consultations may have a fee depending on the expert's rates.",
  },
  {
    category: "booking",
    question: "How do I book a trip?",
    answer:
      "You can book a trip by: 1) Using our Browse feature to select activities, hotels, and services, 2) Working with an expert who will create a custom itinerary for you, or 3) Choosing a pre-made package from Help Me Decide.",
  },
  {
    category: "booking",
    question: "Can I modify my booking after confirmation?",
    answer:
      "Yes, most bookings can be modified up to 48-72 hours before the scheduled date, depending on the service provider's policy. Contact your expert or our support team for assistance with modifications.",
  },
  {
    category: "booking",
    question: "What is the cancellation policy?",
    answer:
      "Cancellation policies vary by service provider and are clearly displayed before you confirm your booking. Generally, free cancellation is available up to 24-48 hours before the experience. Check the specific terms for each booking.",
  },
  {
    category: "experts",
    question: "Who are the local experts and trip planners?",
    answer:
      "Our local experts are verified destination insiders with deep knowledge of their city. Our trip planners are itinerary specialists who help design and refine your travel plans. Both undergo a thorough vetting process including background checks, interview, and verification of their expertise.",
  },
  {
    category: "experts",
    question: "How do I choose the right expert?",
    answer:
      "Browse expert profiles to see their specialties, languages, ratings, and reviews from other travelers. You can also use our matching system which recommends experts based on your trip preferences.",
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
      "We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and Apple Pay. All payments are processed securely through our platform.",
  },
  {
    category: "payment",
    question: "Is my payment information secure?",
    answer:
      "Absolutely. We use industry-standard encryption (SSL/TLS) and are PCI-DSS compliant. We never store your full credit card details on our servers.",
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
      "All experts undergo a multi-step verification process including identity verification, background checks, expertise validation, and reference checks. Service providers must provide business licenses and insurance documentation.",
  },
  {
    category: "security",
    question: "What if I have an issue during my trip?",
    answer:
      "Our support team is available to help with issues during business hours. You can reach us through the app or by email. For urgent situations during your trip, contact your expert advisor directly through the app for the fastest response.",
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
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
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
