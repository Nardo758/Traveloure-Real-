import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Mail,
  Send,
  HelpCircle,
  Users,
  Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";

/**
 * §13 (fabrication removal): this page previously listed THREE invented office
 * addresses (New York / London / Singapore street addresses that are not ours),
 * a fictitious 555-prefix phone number (twice), a "Live Chat" card with staffed
 * hours behind it when no chat vendor is integrated anywhere in the codebase,
 * and an unbacked same-day response SLA (in the cards, the sidebar, and the
 * success toast).
 *
 * The FORM ITSELF IS REAL and is kept untouched: it posts to the live
 * POST /api/contact, which persists the submission and notifies every admin.
 * So the honest page is the working form plus the one contact fact we can
 * stand behind — the email address. No address, no phone, no chat, no SLA.
 */

const contactReasons = [
  { id: "general", label: "General Inquiry" },
  { id: "support", label: "Customer Support" },
  { id: "partnership", label: "Partnership Inquiry" },
  { id: "press", label: "Press & Media" },
  { id: "feedback", label: "Feedback" },
];

const CONTACT_EMAIL = "hello@traveloure.com";

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    reason: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
          reason: formData.reason || undefined,
          source: "contact_page",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to send message");
      }

      toast({
        title: "Message sent!",
        description: "Thanks — your message reached the team.",
      });

      setFormData({ name: "", email: "", reason: "", subject: "", message: "" });
    } catch (error: any) {
      toast({
        title: "Couldn't send message",
        description: error.message || "Please try again or email us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <SEOHead 
        title="Contact Us"
        description="Get in touch with the Traveloure team. We're here to help with inquiries, support, partnerships, and feedback. Send us a message or email us directly."
        keywords={["contact traveloure", "customer support", "travel help", "partnership inquiry"]}
        url="/contact"
      />
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#111827] to-[#1F2937] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">Get in Touch</h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Have a question, feedback, or want to partner with us? We'd love to
              hear from you. Our team is here to help.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Email us — the one contact fact we can stand behind */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Email Us</h3>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary font-medium break-words hover:underline"
                  data-testid="link-contact-email"
                >
                  {CONTACT_EMAIL}
                </a>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-2xl text-foreground">
                    Send Us a Message
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name" className="text-[#374151]">
                          Your Name
                        </Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => updateFormData("name", e.target.value)}
                          placeholder="John Doe"
                          className="mt-2 h-12 border-border"
                          required
                          data-testid="input-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-[#374151]">
                          Email Address
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => updateFormData("email", e.target.value)}
                          placeholder="john@example.com"
                          className="mt-2 h-12 border-border"
                          required
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="reason" className="text-[#374151]">
                          Reason for Contact
                        </Label>
                        <Select
                          value={formData.reason}
                          onValueChange={(v) => updateFormData("reason", v)}
                        >
                          <SelectTrigger
                            className="mt-2 h-12 border-border"
                            data-testid="select-reason"
                          >
                            <SelectValue placeholder="Select a reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {contactReasons.map((reason) => (
                              <SelectItem key={reason.id} value={reason.id}>
                                {reason.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="subject" className="text-[#374151]">
                          Subject
                        </Label>
                        <Input
                          id="subject"
                          value={formData.subject}
                          onChange={(e) => updateFormData("subject", e.target.value)}
                          placeholder="How can we help?"
                          className="mt-2 h-12 border-border"
                          required
                          data-testid="input-subject"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="message" className="text-[#374151]">
                        Message
                      </Label>
                      <Textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => updateFormData("message", e.target.value)}
                        placeholder="Tell us more about your inquiry..."
                        className="mt-2 border-border"
                        rows={5}
                        required
                        data-testid="textarea-message"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting || !formData.name || !formData.email || !formData.message}
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-white"
                      data-testid="button-submit-contact"
                    >
                      {isSubmitting ? (
                        "Sending..."
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Links */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">
                    Quick Links
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href="/faq"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-faq"
                  >
                    <HelpCircle className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">FAQ</div>
                      <div className="text-sm text-muted-foreground">
                        Find quick answers
                      </div>
                    </div>
                  </a>
                  <a
                    href="/earn"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-partner"
                  >
                    <Users className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">
                        Partner With Us
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Join our network
                      </div>
                    </div>
                  </a>
                  <a
                    href="/about"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-about"
                  >
                    <Briefcase className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">About Us</div>
                      <div className="text-sm text-muted-foreground">
                        Learn our story
                      </div>
                    </div>
                  </a>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
