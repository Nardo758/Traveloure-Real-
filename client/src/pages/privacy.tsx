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
        <p className="text-muted-foreground mb-8">Effective Date: January 25, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure LLC ("Traveloure," "we," "us," or "our") operates a three-party marketplace platform connecting travelers with authenticated Local Experts and Service Providers to facilitate personalized travel experiences and life events. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, whether as a Traveler, Local Expert, or Service Provider.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We are committed to protecting your privacy and complying with applicable data protection laws, including the General Data Protection Regulation (GDPR), California Consumer Privacy Act (CCPA), and other international privacy regulations.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Traveloure, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy. If you do not agree with this Privacy Policy, please do not access or use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-medium mb-3">2.1 Information You Provide Directly</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We collect information that you voluntarily provide when you:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Create an account (name, email address, password, phone number, profile photo)</li>
              <li>Complete your user profile (travel preferences, interests, accessibility needs, dietary restrictions)</li>
              <li>Apply as a Local Expert (professional qualifications, certifications, work history, language skills, areas of expertise, government-issued identification for verification)</li>
              <li>Register as a Service Provider (business information, licensing, insurance documentation, service descriptions, pricing)</li>
              <li>Book services or experiences (trip details, dates, participant information, special requests)</li>
              <li>Communicate through our platform (messages, reviews, ratings, feedback)</li>
              <li>Contact customer support (correspondence, support tickets, complaints)</li>
              <li>Participate in surveys, promotions, or contests</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.2 Payment Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Payment processing is handled through Stripe Connect. We do not directly store complete credit card numbers. We collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Billing address and contact information</li>
              <li>Last four digits of credit/debit cards for display purposes</li>
              <li>Payment transaction history and records</li>
              <li>Platform credit balances and usage</li>
              <li>For Experts and Providers: bank account information, tax identification numbers, payout preferences (processed securely through Stripe Connect)</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.3 Automatically Collected Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you access our platform, we automatically collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Device information (IP address, browser type, operating system, device identifiers)</li>
              <li>Usage data (pages viewed, features used, time spent, search queries, click patterns)</li>
              <li>Location information (approximate location based on IP address; precise location if you grant permission)</li>
              <li>Cookies and similar tracking technologies (see Section 11)</li>
              <li>Log files (access times, error logs, performance data)</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.4 Information from Third Parties</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may receive information about you from third-party sources:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Background verification services (for Expert and Provider vetting)</li>
              <li>Social media platforms (if you connect your account or use social login)</li>
              <li>Travel inventory partners (Viator, GetYourGuide, Klook, Fever, Musement, 12Go)</li>
              <li>Payment processors and financial institutions</li>
              <li>Analytics and marketing service providers</li>
              <li>Publicly available sources for identity verification</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.5 Social Media Information (Facebook/Instagram)</h3>
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
              We do not post to your social media accounts without your explicit permission. We comply with Meta's Platform Terms and Developer Policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            
            <h3 className="text-xl font-medium mb-3">3.1 Platform Operations</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Create and manage your account</li>
              <li>Facilitate connections between Travelers, Experts, and Service Providers</li>
              <li>Process bookings, reservations, and transactions</li>
              <li>Enable communication between users through our platform</li>
              <li>Display relevant content, recommendations, and search results</li>
              <li>Manage platform credits and process payments</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.2 Safety and Trust</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Verify identity and credentials of Experts and Service Providers</li>
              <li>Conduct background checks and screening processes</li>
              <li>Monitor and prevent fraud, abuse, and security incidents</li>
              <li>Enforce our Terms of Service and policies</li>
              <li>Investigate and resolve disputes and complaints</li>
              <li>Comply with legal obligations and regulatory requirements</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.3 Customer Service and Support</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Respond to your inquiries and support requests</li>
              <li>Provide customer service and technical assistance</li>
              <li>Send service-related notifications and updates</li>
              <li>Gather feedback to improve our services</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.4 Platform Improvement and Personalization</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Analyze usage patterns and trends</li>
              <li>Conduct research, testing, and development</li>
              <li>Personalize your experience and provide tailored recommendations</li>
              <li>Develop new features and services</li>
              <li>Optimize platform performance and user experience</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.5 Marketing and Communications</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Send promotional materials, newsletters, and special offers (with your consent)</li>
              <li>Conduct marketing campaigns and analytics</li>
              <li>Measure advertising effectiveness</li>
              <li>Manage loyalty and referral programs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Information Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We share your information in the following circumstances:
            </p>

            <h3 className="text-xl font-medium mb-3">4.1 Within the Platform Ecosystem</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Travelers, Experts, and Service Providers:</strong> Information necessary to facilitate bookings and services (names, contact information, trip details, special requirements)</li>
              <li><strong>Public profiles:</strong> Information you choose to make public (profile photos, bios, reviews, ratings, areas of expertise)</li>
              <li><strong>Reviews and ratings:</strong> Public feedback about experiences, experts, and service providers</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.2 Service Providers and Business Partners</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We share information with third-party service providers who perform services on our behalf:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Payment processors (Stripe Connect for transaction processing and payouts)</li>
              <li>Background verification services (for Expert and Provider screening)</li>
              <li>Cloud hosting and data storage providers</li>
              <li>Email and communication service providers</li>
              <li>Analytics and marketing platforms</li>
              <li>Customer support tools and ticketing systems</li>
              <li>Travel inventory partners (Viator, GetYourGuide, Klook, Fever, Musement, 12Go)</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.3 Legal Obligations and Protection</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may disclose your information when required by law or to protect our rights:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Comply with legal process, court orders, or governmental requests</li>
              <li>Enforce our Terms of Service and other agreements</li>
              <li>Protect the safety, rights, or property of Traveloure, our users, or the public</li>
              <li>Detect, prevent, or address fraud, security, or technical issues</li>
              <li>Respond to claims that content violates third-party rights</li>
              <li>Comply with Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.4 Business Transfers</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              In the event of a merger, acquisition, reorganization, bankruptcy, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change and any choices you may have regarding your information.
            </p>

            <h3 className="text-xl font-medium mb-3">4.5 With Your Consent</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may share your information for other purposes with your explicit consent or at your direction. We never sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure operates across eight strategic global markets: Mumbai, Bogotá, Goa, Kyoto, Edinburgh, Cartagena, Jaipur, and Porto. Your information may be transferred to, stored, and processed in the United States and other countries where our service providers operate.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When we transfer personal data from the European Economic Area (EEA), United Kingdom, or Switzerland to other countries, we implement appropriate safeguards:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Standard Contractual Clauses approved by the European Commission</li>
              <li>Adequacy decisions by the European Commission</li>
              <li>Binding Corporate Rules for transfers within our corporate group</li>
              <li>Data Processing Agreements with third-party service providers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. Specific retention periods include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li><strong>Account information:</strong> Retained for the duration of your active account plus 7 years after account closure (for legal, tax, and audit purposes)</li>
              <li><strong>Transaction records:</strong> 7 years from transaction date (for financial reporting and regulatory compliance)</li>
              <li><strong>Verification documents:</strong> 7 years from verification date or account closure</li>
              <li><strong>Communication records:</strong> 3 years from last interaction (for customer service quality and dispute resolution)</li>
              <li><strong>Marketing communications:</strong> Until you opt-out or withdraw consent</li>
              <li><strong>Usage logs and analytics:</strong> 2 years from collection</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              After the retention period expires, we securely delete or anonymize your personal information. Some information may be retained in backup systems for up to 90 days after the retention period.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We implement comprehensive security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li><strong>Encryption:</strong> Data encrypted in transit (TLS 1.2+) and at rest (AES-256)</li>
              <li><strong>Secure payment processing:</strong> PCI DSS compliance through Stripe Connect</li>
              <li><strong>Access controls:</strong> Role-based access with multi-factor authentication for employees</li>
              <li><strong>Network security:</strong> Firewalls, intrusion detection, and regular security audits</li>
              <li><strong>Data segregation:</strong> Customer funds held in FDIC-insured segregated accounts</li>
              <li><strong>Incident response:</strong> Established protocols for security breach detection and response</li>
              <li><strong>Regular testing:</strong> Penetration testing and vulnerability assessments</li>
              <li><strong>Employee training:</strong> Regular security awareness training for staff</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              While we strive to protect your information, no security system is impenetrable. We cannot guarantee absolute security. If you become aware of any security vulnerability or breach, please contact us immediately at admin@traveloure.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights and Choices</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Depending on your location and applicable law, you may have the following rights regarding your personal information:
            </p>

            <h3 className="text-xl font-medium mb-3">8.1 GDPR Rights (EEA, UK, Switzerland)</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Right of access:</strong> Request a copy of your personal data</li>
              <li><strong>Right to rectification:</strong> Correct inaccurate or incomplete data</li>
              <li><strong>Right to erasure (right to be forgotten):</strong> Request deletion of your data</li>
              <li><strong>Right to restriction of processing:</strong> Limit how we use your data</li>
              <li><strong>Right to data portability:</strong> Receive your data in a structured, machine-readable format</li>
              <li><strong>Right to object:</strong> Object to processing based on legitimate interests or for direct marketing</li>
              <li><strong>Right to withdraw consent:</strong> Withdraw consent for processing at any time</li>
              <li><strong>Right to lodge a complaint:</strong> File a complaint with your local data protection authority</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">8.2 CCPA Rights (California Residents)</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Right to know:</strong> Request disclosure of categories and specific pieces of personal information collected</li>
              <li><strong>Right to delete:</strong> Request deletion of personal information</li>
              <li><strong>Right to opt-out:</strong> Opt-out of sale of personal information (Note: We do not sell personal information)</li>
              <li><strong>Right to non-discrimination:</strong> Equal service and pricing regardless of privacy choices</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">8.3 General Rights (All Users)</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Account management:</strong> Update your profile and preferences through account settings</li>
              <li><strong>Communication preferences:</strong> Unsubscribe from marketing emails via links in messages or account settings</li>
              <li><strong>Cookie controls:</strong> Manage cookie preferences through browser settings or our cookie consent tool</li>
              <li><strong>Location services:</strong> Disable location tracking through device settings</li>
              <li><strong>Account closure:</strong> Request account deletion (subject to legal retention requirements)</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">8.4 Exercising Your Rights</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To exercise any of these rights, please:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Email us at admin@traveloure.com</li>
              <li>Submit a request through your account settings</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We will respond to verified requests within 30 days (or as required by applicable law). We may need to verify your identity before processing your request.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Third-Party Services and Links</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Our platform integrates with and may contain links to third-party services, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
              <li>Travel inventory providers (Viator, GetYourGuide, Klook, Fever, Musement, 12Go)</li>
              <li>Payment processors (Stripe)</li>
              <li>Social media platforms (Meta/Facebook/Instagram)</li>
              <li>Analytics and advertising services</li>
              <li>Mapping and location services</li>
              <li>Customer support tools</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              These third-party services have their own privacy policies. We are not responsible for their practices. We encourage you to review their privacy policies before providing information to them. For more information about Meta's data practices, visit{" "}
              <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Facebook's Privacy Policy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure is not directed to individuals under the age of 18. We do not knowingly collect personal information from children under 18. If you are under 18, please do not use our services or provide any personal information.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If we become aware that we have collected personal information from a child under 18 without parental consent, we will take steps to delete that information. If you believe we have collected information from a child under 18, please contact us immediately at admin@traveloure.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Cookies and Tracking Technologies</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use cookies and similar tracking technologies to enhance your experience and gather information about visitors and visits to our platform.
            </p>

            <h3 className="text-xl font-medium mb-3">11.1 Types of Cookies We Use</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Essential cookies:</strong> Required for platform functionality (authentication, security, preferences)</li>
              <li><strong>Performance cookies:</strong> Collect information about how you use our platform (analytics, error tracking)</li>
              <li><strong>Functional cookies:</strong> Remember your preferences and personalization settings</li>
              <li><strong>Marketing cookies:</strong> Track your activity across websites for advertising purposes</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">11.2 Third-Party Tracking</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use third-party analytics and advertising services that may collect information through cookies and similar technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Google Analytics: Website usage analytics</li>
              <li>Facebook Pixel: Advertising and conversion tracking</li>
              <li>Marketing automation platforms: Email campaign tracking</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">11.3 Managing Cookies</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You can control cookies through:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Our cookie consent tool (available on first visit and in settings)</li>
              <li>Browser settings (most browsers allow you to refuse or delete cookies)</li>
              <li>Opt-out tools provided by advertising networks</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Note: Disabling essential cookies may affect platform functionality. Performance, functional, and marketing cookies are optional.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Do Not Track Signals</h2>
            <p className="text-muted-foreground leading-relaxed">
              Some browsers offer a "Do Not Track" (DNT) signal. Because there is no common understanding of how to interpret DNT signals, our platform does not currently respond to DNT browser signals. We continue to monitor developments and may implement DNT signal recognition in the future.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Changes to This Privacy Policy</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make material changes, we will:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Post the updated Privacy Policy on our platform</li>
              <li>Update the "Effective Date" at the top of this document</li>
              <li>Notify you via email or prominent notice on our platform</li>
              <li>For material changes affecting your rights, obtain your consent where required by law</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Your continued use of Traveloure after changes become effective constitutes acceptance of the updated Privacy Policy. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">Traveloure LLC</p>
              <p className="text-muted-foreground">Data Protection Officer</p>
              <p className="text-muted-foreground">Email: admin@traveloure.com</p>
              <p className="text-muted-foreground">Website: www.traveloure.com</p>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We will respond to all legitimate requests within 30 days or as required by applicable law.
            </p>
          </section>

          <div className="p-4 bg-muted/50 rounded-lg mt-8">
            <p className="text-sm text-muted-foreground text-center">
              This Privacy Policy was last updated on January 25, 2026. Thank you for trusting Traveloure with your personal information.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-wrap gap-4">
            <Link href="/terms">
              <Button variant="outline" data-testid="link-terms">Terms of Service</Button>
            </Link>
            <Link href="/">
              <Button variant="outline" data-testid="link-home">Back to Home</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
