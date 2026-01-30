import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Phone,
  Book,
  CreditCard,
  MapPin,
  Users,
  Shield,
  HelpCircle,
  ArrowRight,
  ExternalLink
} from "lucide-react";

const helpCategories = [
  {
    title: "Getting Started",
    icon: Book,
    articles: [
      "How to create an account",
      "Planning your first trip",
      "Understanding the platform",
      "Setting up your profile"
    ]
  },
  {
    title: "Booking & Payments",
    icon: CreditCard,
    articles: [
      "How to book services",
      "Payment methods",
      "Refund policy",
      "Cancellation policy"
    ]
  },
  {
    title: "Working with Experts",
    icon: Users,
    articles: [
      "Finding the right expert",
      "Communicating with experts",
      "Expert recommendations",
      "Rating and reviews"
    ]
  },
  {
    title: "Destinations",
    icon: MapPin,
    articles: [
      "Destination guides",
      "Local tips and customs",
      "Safety information",
      "Best time to visit"
    ]
  },
  {
    title: "Account & Privacy",
    icon: Shield,
    articles: [
      "Account security",
      "Privacy settings",
      "Managing notifications",
      "Deleting your account"
    ]
  },
];

const popularFAQs = [
  {
    question: "How do I book a service?",
    answer: "Browse services on the Discover page, add items to your cart, and proceed to checkout. You can also work with local experts who will help plan and book services for you."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and digital wallets like Apple Pay and Google Pay."
  },
  {
    question: "Can I cancel my booking?",
    answer: "Cancellation policies vary by service provider. Generally, you can cancel up to 24-48 hours before your scheduled service for a full refund. Check the specific service details for exact policies."
  },
  {
    question: "How do I become a local expert?",
    answer: "Visit our 'Become an Expert' page and fill out the application form. We review all applications and typically respond within 5-7 business days."
  },
  {
    question: "Are the local experts verified?",
    answer: "Yes! All our local experts go through a verification process including identity verification, background checks, and expertise validation."
  },
  {
    question: "How does the AI trip planning work?",
    answer: "Our AI analyzes your preferences, budget, and travel style to create personalized itineraries. You can then refine these suggestions with help from local experts."
  },
  {
    question: "What if I have an issue during my trip?",
    answer: "We offer 24/7 support for active bookings. You can reach our emergency support team via the app or by calling our hotline."
  },
  {
    question: "Can I get a refund?",
    answer: "Refunds are processed according to our cancellation policy and the specific service provider's terms. Most cancellations made 24+ hours in advance receive full refunds."
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
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            How can we help you?
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-8">
            Search our help center or browse categories below
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
          <div className="grid md:grid-cols-3 gap-4">
            <Link href="/contact">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-6 text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Live Chat</h3>
                  <p className="text-sm text-muted-foreground">Chat with our support team</p>
                </CardContent>
              </Card>
            </Link>
            
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <Mail className="w-8 h-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Email Support</h3>
                <p className="text-sm text-muted-foreground">support@traveloure.com</p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <Phone className="w-8 h-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Phone Support</h3>
                <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Help Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold mb-8">Browse by Category</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {helpCategories.map((category) => {
              const Icon = category.icon;
              return (
                <Card key={category.title} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{category.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {category.articles.map((article, index) => (
                        <li key={index}>
                          <button className="text-sm text-muted-foreground hover:text-primary hover:underline text-left flex items-center gap-2 w-full">
                            <ArrowRight className="w-3 h-3 flex-shrink-0" />
                            {article}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Button variant="ghost" className="w-full mt-4" size="sm">
                      View All Articles
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
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
            Our support team is available 24/7 to assist you with any questions or concerns
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
