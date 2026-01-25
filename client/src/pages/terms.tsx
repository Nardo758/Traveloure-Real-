import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white dark:bg-gray-900 border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <Button variant="ghost" className="gap-2" data-testid="link-back-home">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
            <span className="font-semibold text-lg">Traveloure</span>
            <div className="w-24" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2" data-testid="text-terms-title">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 25, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Traveloure ("the Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Traveloure is an AI-powered travel and experience planning platform that connects users with travel experts, local guides, and service providers. We facilitate bookings, provide personalized recommendations, and offer tools for planning various life experiences including travel, weddings, events, and more.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <h3 className="text-xl font-medium mb-3">3.1 Registration</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To access certain features, you must create an account. You may register using email or through social media accounts (Facebook, Instagram, Google). You are responsible for maintaining the confidentiality of your account credentials.
            </p>
            
            <h3 className="text-xl font-medium mb-3">3.2 Account Responsibilities</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide accurate and complete information</li>
              <li>Keep your login credentials secure</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Be responsible for all activities under your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Expert and Influencer Program</h2>
            <h3 className="text-xl font-medium mb-3">4.1 Expert Applications</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Individuals may apply to become travel experts or local guides. Applications are subject to review and approval at our discretion.
            </p>
            
            <h3 className="text-xl font-medium mb-3">4.2 Influencer Program</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Content creators may apply to join our influencer program. Verified influencers may earn referral commissions. By connecting your social media accounts, you authorize us to verify your follower count and account status.
            </p>
            
            <h3 className="text-xl font-medium mb-3">4.3 Referral Commissions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Commission rates, payment schedules, and terms are subject to the separate Influencer Agreement provided upon approval.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Bookings and Payments</h2>
            <h3 className="text-xl font-medium mb-3">5.1 Service Bookings</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you book services through Traveloure, you enter into a separate agreement with the service provider. We act as an intermediary and are not a party to this agreement.
            </p>
            
            <h3 className="text-xl font-medium mb-3">5.2 Payments</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All payments are processed securely through our payment partners. By making a purchase, you authorize us to charge your selected payment method.
            </p>
            
            <h3 className="text-xl font-medium mb-3">5.3 Refunds and Cancellations</h3>
            <p className="text-muted-foreground leading-relaxed">
              Refund and cancellation policies vary by service provider. Please review the specific terms before booking.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. User Conduct</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Use the platform for any unlawful purpose</li>
              <li>Impersonate others or provide false information</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Post spam, malware, or malicious content</li>
              <li>Attempt to access other users' accounts</li>
              <li>Scrape, copy, or redistribute platform content without permission</li>
              <li>Circumvent any platform security measures</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All content, features, and functionality on Traveloure, including text, graphics, logos, and software, are the exclusive property of Traveloure or its licensors and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. User Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              By posting content on Traveloure (reviews, photos, itineraries), you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute that content in connection with our services.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You represent that you own or have the right to share any content you post.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Traveloure integrates with third-party services including Meta (Facebook/Instagram), travel providers, and payment processors. Your use of these services is subject to their respective terms and policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The platform is provided "as is" without warranties of any kind. We do not guarantee the accuracy, completeness, or reliability of any content or services. We are not responsible for the actions of third-party service providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Traveloure shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify and hold harmless Traveloure and its affiliates from any claims, damages, or expenses arising from your use of the platform or violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your account at any time for violations of these terms. You may delete your account at any time through your account settings or by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of significant changes via email or platform notification. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Traveloure operates, without regard to conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">16. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="font-medium">Traveloure</p>
              <p className="text-muted-foreground">Email: legal@traveloure.com</p>
              <p className="text-muted-foreground">
                <Link href="/contact" className="text-primary hover:underline">Contact Form</Link>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy">
              <Button variant="outline" data-testid="link-privacy">Privacy Policy</Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" data-testid="link-contact">Contact Us</Button>
            </Link>
            <Link href="/faq">
              <Button variant="outline" data-testid="link-faq">FAQ</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
