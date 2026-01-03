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
  Phone,
  MapPin,
  MessageSquare,
  Clock,
  Send,
  HelpCircle,
  Users,
  Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const contactReasons = [
  { id: "general", label: "General Inquiry" },
  { id: "support", label: "Customer Support" },
  { id: "partnership", label: "Partnership Inquiry" },
  { id: "press", label: "Press & Media" },
  { id: "feedback", label: "Feedback" },
];

const contactMethods = [
  {
    icon: Mail,
    title: "Email Us",
    description: "hello@traveloure.com",
    detail: "We'll respond within 24 hours",
  },
  {
    icon: MessageSquare,
    title: "Live Chat",
    description: "Chat with our team",
    detail: "Available 9am-6pm EST",
  },
  {
    icon: Phone,
    title: "Call Us",
    description: "+1 (555) 123-4567",
    detail: "Mon-Fri 9am-6pm EST",
  },
];

const offices = [
  {
    city: "New York",
    address: "123 Travel Lane, NYC 10001",
    phone: "+1 (555) 123-4567",
  },
  {
    city: "London",
    address: "456 Explorer St, London W1 2AB",
    phone: "+44 20 1234 5678",
  },
  {
    city: "Singapore",
    address: "789 Journey Rd, Singapore 018956",
    phone: "+65 6123 4567",
  },
];

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

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: "Message sent!",
      description: "We'll get back to you within 24 hours.",
    });

    setFormData({ name: "", email: "", reason: "", subject: "", message: "" });
    setIsSubmitting(false);
  };

  const updateFormData = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#111827] to-[#1F2937] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Get in Touch</h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Have a question, feedback, or want to partner with us? We'd love to
              hear from you. Our team is here to help.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {contactMethods.map((method, idx) => (
              <motion.div
                key={method.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow h-full">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#FFE3E8] flex items-center justify-center">
                      <method.icon className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <h3 className="font-semibold text-[#111827] mb-1">
                      {method.title}
                    </h3>
                    <p className="text-[#FF385C] font-medium mb-1">
                      {method.description}
                    </p>
                    <p className="text-sm text-[#6B7280]">{method.detail}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card className="border-[#E5E7EB]">
                <CardHeader>
                  <CardTitle className="text-2xl text-[#111827]">
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
                          className="mt-2 h-12 border-[#E5E7EB]"
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
                          className="mt-2 h-12 border-[#E5E7EB]"
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
                            className="mt-2 h-12 border-[#E5E7EB]"
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
                          className="mt-2 h-12 border-[#E5E7EB]"
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
                        className="mt-2 border-[#E5E7EB]"
                        rows={5}
                        required
                        data-testid="textarea-message"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting || !formData.name || !formData.email || !formData.message}
                      className="w-full h-12 bg-[#FF385C] hover:bg-[#E23350] text-white"
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
              <Card className="border-[#E5E7EB]">
                <CardHeader>
                  <CardTitle className="text-lg text-[#111827]">
                    Quick Links
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href="/faq"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-faq"
                  >
                    <HelpCircle className="w-5 h-5 text-[#FF385C]" />
                    <div>
                      <div className="font-medium text-[#111827]">FAQ</div>
                      <div className="text-sm text-[#6B7280]">
                        Find quick answers
                      </div>
                    </div>
                  </a>
                  <a
                    href="/partner-with-us"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-partner"
                  >
                    <Users className="w-5 h-5 text-[#FF385C]" />
                    <div>
                      <div className="font-medium text-[#111827]">
                        Partner With Us
                      </div>
                      <div className="text-sm text-[#6B7280]">
                        Join our network
                      </div>
                    </div>
                  </a>
                  <a
                    href="/about"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3F4F6] transition-colors"
                    data-testid="link-about"
                  >
                    <Briefcase className="w-5 h-5 text-[#FF385C]" />
                    <div>
                      <div className="font-medium text-[#111827]">About Us</div>
                      <div className="text-sm text-[#6B7280]">
                        Learn our story
                      </div>
                    </div>
                  </a>
                </CardContent>
              </Card>

              {/* Office Locations */}
              <Card className="border-[#E5E7EB]">
                <CardHeader>
                  <CardTitle className="text-lg text-[#111827]">
                    Our Offices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {offices.map((office) => (
                    <div
                      key={office.city}
                      className="flex items-start gap-3 p-3 bg-[#F9FAFB] rounded-lg"
                    >
                      <MapPin className="w-5 h-5 text-[#FF385C] mt-0.5" />
                      <div>
                        <div className="font-medium text-[#111827]">
                          {office.city}
                        </div>
                        <div className="text-sm text-[#6B7280]">
                          {office.address}
                        </div>
                        <div className="text-sm text-[#6B7280]">
                          {office.phone}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Response Time */}
              <Card className="border-[#E5E7EB] bg-[#FFE3E8]">
                <CardContent className="p-6 text-center">
                  <Clock className="w-8 h-8 text-[#FF385C] mx-auto mb-3" />
                  <h3 className="font-semibold text-[#111827] mb-1">
                    Quick Response
                  </h3>
                  <p className="text-sm text-[#6B7280]">
                    We typically respond within 24 hours during business days.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
