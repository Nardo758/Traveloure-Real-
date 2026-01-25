import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
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
        <h1 className="text-4xl font-bold mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: January 25, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Traveloure ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, including when you sign in using social media accounts like Facebook and Instagram.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-medium mb-3">2.1 Personal Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Name, email address, and phone number</li>
              <li>Profile information (bio, profile picture, location)</li>
              <li>Travel preferences and interests</li>
              <li>Payment and billing information</li>
              <li>Communications with our support team</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">2.2 Social Media Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you connect your Facebook or Instagram account, we may collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Your public profile information (name, email, profile picture)</li>
              <li>Instagram username and follower count (for influencer verification)</li>
              <li>Account type (personal, business, or creator)</li>
              <li>Linked Facebook Pages (if applicable)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do not post to your social media accounts without your explicit permission.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">2.3 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Device information (browser type, operating system)</li>
              <li>IP address and location data</li>
              <li>Usage data (pages visited, features used)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Provide and maintain our travel planning services</li>
              <li>Process bookings and transactions</li>
              <li>Verify influencer and expert accounts</li>
              <li>Personalize your experience with AI-powered recommendations</li>
              <li>Communicate with you about your account and bookings</li>
              <li>Send marketing communications (with your consent)</li>
              <li>Improve our platform and develop new features</li>
              <li>Ensure platform security and prevent fraud</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Sharing Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may share your information with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Service Providers:</strong> Travel experts, tour operators, and accommodation providers you book with</li>
              <li><strong>Payment Processors:</strong> To process your transactions securely</li>
              <li><strong>Analytics Partners:</strong> To help us understand platform usage</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We never sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as your account is active or as needed to provide you services. You can request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Depending on your location, you may have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access the personal information we hold about you</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your personal information, including encryption, secure servers, and regular security assessments. However, no method of transmission over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our platform integrates with third-party services including Meta (Facebook/Instagram), Google, and various travel service providers. These services have their own privacy policies, and we encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="font-medium">Traveloure</p>
              <p className="text-muted-foreground">Email: privacy@traveloure.com</p>
              <p className="text-muted-foreground">
                <Link href="/contact" className="text-primary hover:underline">Contact Form</Link>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Facebook/Instagram Data Usage</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you connect your Facebook or Instagram account to Traveloure:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>We only access data you explicitly authorize during login</li>
              <li>Instagram data is used solely for influencer verification purposes</li>
              <li>You can disconnect your social accounts at any time in your account settings</li>
              <li>We comply with Meta's Platform Terms and Developer Policies</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              For more information about Meta's data practices, visit{" "}
              <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Facebook's Privacy Policy
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-wrap gap-4">
            <Link href="/terms">
              <Button variant="outline" data-testid="link-terms">Terms of Service</Button>
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
