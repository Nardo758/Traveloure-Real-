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
        <h1 className="text-4xl font-bold mb-2" data-testid="text-terms-title">Terms and Conditions</h1>
        <p className="text-muted-foreground mb-8">Effective Date: January 25, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              These Terms and Conditions ("Terms") constitute a legally binding agreement between you and Traveloure LLC ("Traveloure," "we," "us," or "our") governing your access to and use of the Traveloure platform, website, mobile applications, and related services (collectively, the "Platform").
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4 font-medium">
              BY ACCESSING OR USING THE PLATFORM, YOU AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY. IF YOU DO NOT AGREE TO THESE TERMS, DO NOT ACCESS OR USE THE PLATFORM.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. Material changes will be communicated via email or prominent notice on the Platform. Your continued use after changes become effective constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Platform Description</h2>
            
            <h3 className="text-xl font-medium mb-3">2.1 Three-Party Marketplace</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure operates as a three-party marketplace connecting:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Travelers:</strong> Individuals seeking personalized travel experiences and life event planning services</li>
              <li><strong>Local Experts:</strong> Authenticated professionals providing consultation, cultural interpretation, and personalized planning services</li>
              <li><strong>Service Providers:</strong> Businesses and individuals offering travel services, accommodations, activities, and experiences</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.2 Platform Role</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure acts as an intermediary platform that facilitates connections and transactions between users. We do not:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Directly provide travel services, accommodations, or experiences</li>
              <li>Employ Local Experts or Service Providers as our agents or employees</li>
              <li>Guarantee the quality, safety, or legality of services offered through the Platform</li>
              <li>Control or manage the day-to-day operations of Experts or Providers</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">2.3 Service Areas</h3>
            <p className="text-muted-foreground leading-relaxed">
              Traveloure currently operates in eight strategic global markets: Mumbai, Bogotá, Goa, Kyoto, Edinburgh, Cartagena, Jaipur, and Porto. We may expand to additional markets without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts and Registration</h2>
            
            <h3 className="text-xl font-medium mb-3">3.1 Account Creation</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To use certain features of the Platform, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Notify us immediately of any unauthorized access or security breach</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.2 Eligibility</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You must be at least 18 years old to create an account and use the Platform. By creating an account, you represent and warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>You are at least 18 years of age</li>
              <li>You have the legal capacity to enter into binding contracts</li>
              <li>You are not prohibited from using the Platform under applicable laws</li>
              <li>All information you provide is truthful and accurate</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">3.3 Account Types</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Different account types have different requirements:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Traveler Accounts:</strong> Basic registration with email verification</li>
              <li><strong>Expert Accounts:</strong> Comprehensive verification process (see Section 4)</li>
              <li><strong>Service Provider Accounts:</strong> Business verification and insurance documentation (see Section 5)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Local Expert Requirements and Verification</h2>
            
            <h3 className="text-xl font-medium mb-3">4.1 Expert Application Process</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To become a Local Expert, applicants must complete a comprehensive verification process:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Submit application with detailed profile information</li>
              <li>Provide government-issued identification for identity verification</li>
              <li>Submit professional qualifications and certifications</li>
              <li>Undergo criminal background screening</li>
              <li>Complete platform training and orientation</li>
              <li>Accept and agree to Expert Code of Conduct</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.2 Verification Timeline</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Standard verification: 2-3 weeks</li>
              <li>Expedited verification: 5-7 business days (additional fee applies)</li>
              <li>Provisional approval may be granted during verification for qualified candidates</li>
              <li>Annual re-verification required for all active Experts</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.3 Expert Responsibilities</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Local Experts agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Provide honest, accurate, and unbiased recommendations</li>
              <li>Act as client advocates, prioritizing traveler interests</li>
              <li>Disclose any conflicts of interest or financial relationships</li>
              <li>Maintain professional communication and response times</li>
              <li>Respect cultural differences and provide culturally sensitive guidance</li>
              <li>Maintain confidentiality of client information</li>
              <li>Update availability and service offerings promptly</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.4 Expert Code of Conduct</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All Local Experts must adhere to our Code of Conduct, which includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Professional Communication:</strong> Respond to inquiries within 24 hours; maintain courteous, professional tone</li>
              <li><strong>Cultural Sensitivity:</strong> Demonstrate respect for diverse backgrounds; provide culturally appropriate recommendations</li>
              <li><strong>Safety and Responsibility:</strong> Prioritize client safety; provide accurate risk assessments; maintain emergency protocols</li>
              <li><strong>Platform Integrity:</strong> Provide accurate information; avoid misleading claims; maintain honest representation</li>
              <li><strong>Business Ethics:</strong> Transparent pricing; disclosure of all fees; avoid conflicts of interest</li>
              <li><strong>Continuous Improvement:</strong> Integrate feedback; pursue professional development; maintain expertise</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Service Provider Requirements</h2>
            
            <h3 className="text-xl font-medium mb-3">5.1 Four-Tier Insurance Structure</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Service Providers must maintain insurance coverage based on service risk level:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Tier 1 (Low-Risk):</strong> Photographers, local guides, cultural experiences - $100,000 general liability OR platform group policy participation</li>
              <li><strong>Tier 2 (Moderate-Risk):</strong> Small restaurants, home dining, wellness services - $300,000 general liability + $100,000 professional liability</li>
              <li><strong>Tier 3 (Higher-Risk Commercial):</strong> Adventure activities, transportation, accommodations - $1,000,000+ comprehensive coverage</li>
              <li><strong>Tier 4 (Specialized High-Risk):</strong> Extreme sports, aviation, watercraft, medical treatments - Enhanced coverage determined case-by-case</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">5.2 Licensing and Permits</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Service Providers must maintain all required licenses, permits, and certifications for their services, including business operating licenses, professional certifications, health and safety permits, tourism or hospitality licenses, and any other licenses required by local authorities.
            </p>

            <h3 className="text-xl font-medium mb-3">5.3 Verification and Compliance</h3>
            <p className="text-muted-foreground leading-relaxed">
              Service Providers must submit and maintain: proof of insurance coverage, valid licenses and permits, business registration documentation, tax identification numbers, proof of identity for business owners, and annual renewal documentation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Services and Bookings</h2>
            
            <h3 className="text-xl font-medium mb-3">6.1 Service Descriptions</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Experts and Service Providers are solely responsible for the accuracy of their service descriptions, pricing, availability, and terms. Traveloure does not verify or guarantee the accuracy of service listings.
            </p>

            <h3 className="text-xl font-medium mb-3">6.2 Booking Process</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you book services through the Platform:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>You enter into a direct agreement with the Expert or Service Provider</li>
              <li>Traveloure acts solely as an intermediary facilitating the connection</li>
              <li>You agree to the specific terms and conditions of the Expert or Provider</li>
              <li>Payment is processed through our secure payment system</li>
              <li>You receive booking confirmation via email</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">6.3 Service Fulfillment</h3>
            <p className="text-muted-foreground leading-relaxed">
              Experts and Service Providers are solely responsible for delivering services as described, meeting quality standards and safety requirements, complying with applicable laws and regulations, maintaining appropriate insurance coverage, and handling customer service issues related to their services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Payment Terms</h2>
            
            <h3 className="text-xl font-medium mb-3">7.1 Payment Processing</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All payments are processed through Stripe Connect, our secure payment processor. By using the Platform, you agree to Stripe's terms of service and privacy policy. Payment information is collected and processed by Stripe; Traveloure does not store complete credit card numbers.
            </p>

            <h3 className="text-xl font-medium mb-3">7.2 Platform Credit System</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Users purchase platform credits in advance</li>
              <li>Credits are used to pay for platform fees and Expert consultation services</li>
              <li>Service Provider services may be paid through credits or direct payment</li>
              <li>Credits are non-refundable except as required by law</li>
              <li>Unused credits do not expire but may be subject to inactivity fees after 24 months</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">7.3 Commission Structure</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong>Local Expert Commissions:</strong> Experts receive 75-85% of consultation fees; Traveloure retains 15-25% as platform fee. Exact split determined by Expert tier, performance, and volume.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-6">
              <strong>Service Provider Commissions:</strong> Standard commission of 4-12% of booking value. Rate varies by service category, volume, and partnership level.
            </p>

            <h3 className="text-xl font-medium mb-3">7.4 Payout Terms</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For Experts and Service Providers:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Payouts processed through Stripe Connect</li>
              <li>Standard payout schedule: 2-3 business days after service completion</li>
              <li>Funds may be held for up to 14 days for quality assurance and dispute resolution</li>
              <li>Minimum payout threshold: $25</li>
              <li>Tax reporting required; Forms 1099 issued for US-based users earning $600+ annually</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">7.5 Taxes and Currency</h3>
            <p className="text-muted-foreground leading-relaxed">
              Users are responsible for all applicable taxes. Travelers are responsible for applicable sales tax, VAT, or tourism taxes. Experts and Providers are responsible for income tax, self-employment tax, and business taxes. All transactions are processed in US Dollars (USD) unless otherwise specified. Currency conversion fees may apply for international transactions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Cancellation and Refunds</h2>
            
            <h3 className="text-xl font-medium mb-3">8.1 Cancellation by Travelers</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Cancellation policies are set by individual Experts and Service Providers. Standard platform policies include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li><strong>Expert Consultations:</strong> 24-hour cancellation notice for full credit refund; less than 24 hours may forfeit fees</li>
              <li><strong>Service Bookings:</strong> Varies by provider; typically 48-72 hours for partial refund</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">8.2 Cancellation by Experts or Providers</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If an Expert or Provider cancels: full refund of all fees and charges; Traveloure may assist in finding alternative providers; excessive cancellations may result in account suspension.
            </p>

            <h3 className="text-xl font-medium mb-3">8.3 Refund Processing</h3>
            <p className="text-muted-foreground leading-relaxed">
              Refunds are processed within 5-10 business days to original payment method or as platform credits. Payment processing fees are non-refundable. In cases of force majeure (natural disasters, pandemics, etc.), special cancellation and refund policies may apply.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. User Conduct and Prohibited Activities</h2>
            
            <h3 className="text-xl font-medium mb-3">9.1 Acceptable Use</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree to use the Platform only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Use the Platform for fraudulent or illegal activities</li>
              <li>Impersonate any person or entity</li>
              <li>Interfere with or disrupt the Platform or servers</li>
              <li>Attempt to gain unauthorized access to any systems</li>
              <li>Collect or harvest information about other users</li>
              <li>Transmit viruses, malware, or harmful code</li>
              <li>Use automated systems (bots, scrapers) without permission</li>
              <li>Circumvent payment systems or avoid fees</li>
              <li>Post false, misleading, or defamatory content</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">9.2 Content Standards</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              User-generated content must not contain:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Harassment, hate speech, or discriminatory language</li>
              <li>Explicit sexual content or nudity</li>
              <li>Violence or threats of violence</li>
              <li>Spam, advertising, or solicitations</li>
              <li>Infringement of intellectual property rights</li>
              <li>Private information of others without consent</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">9.3 Off-Platform Transactions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Users may not circumvent the Platform to avoid fees by conducting transactions outside the Platform for services discovered through Traveloure. All transactions for services facilitated by the Platform must be processed through our payment system.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Reviews and Ratings</h2>
            
            <h3 className="text-xl font-medium mb-3">10.1 Review Guidelines</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Reviews and ratings must:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-6">
              <li>Be based on genuine, first-hand experiences</li>
              <li>Be honest, fair, and constructive</li>
              <li>Focus on service quality and experience</li>
              <li>Comply with content standards</li>
              <li>Not contain personal attacks or irrelevant information</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">10.2 Prohibited Review Conduct</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The following are strictly prohibited: fake reviews or ratings, reviews in exchange for compensation, reviews of competitors to harm their business, reviews containing threats or extortion, and manipulation of rating systems.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Traveloure reserves the right to remove reviews that violate these guidelines. We may also suspend or terminate accounts for review abuse.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Intellectual Property</h2>
            
            <h3 className="text-xl font-medium mb-3">11.1 Platform Ownership</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Platform, including all content, features, functionality, software, code, designs, logos, trademarks, and other intellectual property, is owned by Traveloure LLC or our licensors and is protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-xl font-medium mb-3">11.2 User Content License</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              By posting content to the Platform (profiles, reviews, photos, messages), you grant Traveloure a worldwide, non-exclusive, royalty-free, sublicensable license to use, reproduce, modify, distribute, and display such content for the purpose of operating and promoting the Platform. You retain all ownership rights to your content and may remove it at any time, though copies may remain in backups and caches.
            </p>

            <h3 className="text-xl font-medium mb-3">11.3 Trademark Policy</h3>
            <p className="text-muted-foreground leading-relaxed">
              "Traveloure" and associated logos are trademarks of Traveloure LLC. You may not use our trademarks without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Disclaimers and Limitations of Liability</h2>
            
            <h3 className="text-xl font-medium mb-3">12.1 Platform Disclaimers</h3>
            <p className="text-muted-foreground leading-relaxed mb-4 font-medium">
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We do not warrant that the Platform will be uninterrupted, secure, or error-free; that the Platform will meet your requirements; that information on the Platform is accurate or complete; that services provided by third parties meet quality standards; or that defects will be corrected.
            </p>

            <h3 className="text-xl font-medium mb-3">12.2 Third-Party Services</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Traveloure is not responsible for the quality, safety, or legality of services offered by Experts or Providers; the accuracy of Expert recommendations or advice; the actions, conduct, or performance of any users; disputes between users; or losses or damages resulting from user interactions.
            </p>

            <h3 className="text-xl font-medium mb-3">12.3 Limitation of Liability</h3>
            <p className="text-muted-foreground leading-relaxed mb-4 font-medium">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, TRAVELOURE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, WHETHER IN CONTRACT, TORT, OR OTHERWISE, ARISING FROM OR RELATED TO YOUR USE OF THE PLATFORM.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE PLATFORM SHALL NOT EXCEED THE GREATER OF (A) $100 OR (B) THE AMOUNT YOU PAID TO TRAVELOURE IN THE TWELVE MONTHS PRECEDING THE CLAIM. Some jurisdictions do not allow the limitation of certain warranties or damages, so some of these limitations may not apply to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to defend, indemnify, and hold harmless Traveloure LLC, its affiliates, and their respective officers, directors, employees, agents, and contractors from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable attorneys' fees) arising from or related to: your use of the Platform; your violation of these Terms; your violation of any third-party rights; your provision of services as an Expert or Provider; content you post or transmit through the Platform; your interactions with other users; and your negligence or willful misconduct.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Dispute Resolution</h2>
            
            <h3 className="text-xl font-medium mb-3">14.1 Informal Resolution</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Before filing any formal dispute, you agree to contact us at admin@traveloure.com to seek informal resolution. We will attempt to resolve disputes through good faith negotiation within 30 days.
            </p>

            <h3 className="text-xl font-medium mb-3">14.2 Arbitration Agreement</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Any dispute, claim, or controversy arising from or relating to these Terms or the Platform that cannot be resolved informally shall be settled by binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules.
            </p>

            <h3 className="text-xl font-medium mb-3">14.3 Class Action Waiver</h3>
            <p className="text-muted-foreground leading-relaxed mb-4 font-medium">
              YOU AGREE THAT ANY ARBITRATION OR PROCEEDING SHALL BE LIMITED TO THE DISPUTE BETWEEN YOU AND TRAVELOURE INDIVIDUALLY. YOU WAIVE THE RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION, OR OTHER REPRESENTATIVE ACTION.
            </p>

            <h3 className="text-xl font-medium mb-3">14.4 Exceptions to Arbitration</h3>
            <p className="text-muted-foreground leading-relaxed">
              Either party may seek injunctive or equitable relief in court for: intellectual property infringement, unauthorized access to systems, or violation of confidentiality obligations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Governing Law and Jurisdiction</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Florida, United States, without regard to its conflict of law provisions. For disputes not subject to arbitration, you agree to the exclusive jurisdiction of the state and federal courts located in Palm Beach County, Florida.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">16. Termination</h2>
            
            <h3 className="text-xl font-medium mb-3">16.1 Termination by You</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You may terminate your account at any time by using account deletion features in settings or contacting admin@traveloure.com. Termination does not affect outstanding payment obligations, active bookings or services in progress, or our right to retain data per our Privacy Policy.
            </p>

            <h3 className="text-xl font-medium mb-3">16.2 Termination by Traveloure</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may suspend or terminate your account immediately without notice for: violation of these Terms, fraudulent or illegal activity, providing false information, excessive cancellations or poor performance (Experts/Providers), abuse of other users, payment disputes or chargebacks, or any reason if required by law or for platform safety.
            </p>

            <h3 className="text-xl font-medium mb-3">16.3 Effect of Termination</h3>
            <p className="text-muted-foreground leading-relaxed">
              Upon termination: your access to the Platform will cease; your account data may be deleted (subject to retention requirements); unused platform credits may be forfeited (subject to applicable law); sections of these Terms that by nature should survive will remain in effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">17. General Provisions</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and Traveloure regarding the Platform.</li>
              <li><strong>Severability:</strong> If any provision is found invalid or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force.</li>
              <li><strong>Waiver:</strong> No waiver of any provision shall be deemed a further or continuing waiver.</li>
              <li><strong>Assignment:</strong> You may not assign or transfer these Terms without our prior written consent. We may assign these Terms without restriction.</li>
              <li><strong>Force Majeure:</strong> Neither party shall be liable for failure to perform obligations due to causes beyond reasonable control.</li>
              <li><strong>No Agency:</strong> No agency, partnership, joint venture, or employment relationship is created between you and Traveloure. Experts and Service Providers are independent contractors.</li>
              <li><strong>Compliance with Laws:</strong> You agree to comply with all applicable laws and regulations in your use of the Platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">18. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For questions, concerns, or notices regarding these Terms, please contact:
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">Traveloure LLC</p>
              <p className="text-muted-foreground">Email: admin@traveloure.com</p>
              <p className="text-muted-foreground">Website: www.traveloure.com</p>
            </div>
          </section>

          <div className="p-4 bg-muted/50 rounded-lg mt-8">
            <p className="text-sm text-muted-foreground text-center">
              By using Traveloure, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
              <br />Last Updated: January 25, 2026 | Version 1.0
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy">
              <Button variant="outline" data-testid="link-privacy">Privacy Policy</Button>
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
