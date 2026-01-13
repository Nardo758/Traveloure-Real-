"use client"

import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { ArrowLeft, Shield, Mail, Users, Globe, FileText, Calendar, UserCheck, Database, Eye, Lock, Settings, Key, Bell, AlertTriangle, Scale, Handshake, CreditCard, MapPin, MessageSquare, Phone, Building2, CheckCircle, XCircle, Menu, X } from "lucide-react"
import { useRouter } from "next/navigation"

export default function ServiceProviderTermsPage() {
  const [activeSection, setActiveSection] = useState("agreement")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()

  const handleGoBack = () => {
    if (sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    window.close();
  }

  const sections = [
    {
      id: "agreement",
      title: "Third-Party Service Provider Agreement",
      icon: <Handshake className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Agreement Overview:</h4>
            <p className="text-blue-800">
              This Third-Party Service Provider Agreement (this "Agreement") is entered into as of _________________ (the "Effective Date") by and between TRAVELOURE LLC, a Florida limited liability company ("Traveloure," "Company," "we," "us," or "our"), and _________________________________ ("Service Provider," "Provider," "you," or "your").
            </p>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">1. DEFINITIONS</h4>
            <div className="space-y-2 text-red-800">
              <p><strong>1.1 Platform:</strong> The Traveloure website located at www.traveloure-beta.com and related mobile applications and services.</p>
              <p><strong>1.2 Travel Services:</strong> Services provided by Service Provider to Travelers through the Platform, including but not limited to accommodations, dining, activities, tours, transportation, and other travel-related services.</p>
              <p><strong>1.3 Traveler:</strong> Any user of the Platform who books Travel Services from Service Provider through Traveloure's Travel Experts/Local Experts.</p>
              <p><strong>1.4 Travel Expert/Local Expert:</strong> Independent contractors who provide travel planning and recommendation services through the Platform and may recommend or book Travel Services on behalf of Travelers.</p>
              <p><strong>1.5 Booking:</strong> A confirmed reservation for Travel Services made through the Platform.</p>
              <p><strong>1.6 Service Fee:</strong> The total amount charged for Travel Services.</p>
              <p><strong>1.7 Commission:</strong> The percentage or fee paid by Service Provider to Traveloure for successful bookings generated through the Platform.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "relationship",
      title: "Service Provider Relationship",
      icon: <Building2 className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Partnership Nature:</h4>
            <p className="text-blue-800">
              This Agreement establishes a business partnership relationship where Service Provider agrees to provide Travel Services to Travelers referred through the Platform.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Platform Integration:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Service Provider agrees to integrate with Traveloure's booking and referral system</li>
                <li>Facilitate seamless reservations and service delivery for Travelers</li>
                <li>Maintain real-time availability and pricing information</li>
                <li>Provide prompt booking confirmations and updates</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Geographic Coverage:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Primary Location: As specified in service provider profile</li>
                <li>Additional Locations: As agreed upon with Traveloure</li>
                <li>Service Radius: Determined by service type and provider capabilities</li>
                <li>Coverage areas must be clearly communicated to travelers</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "qualifications",
      title: "Service Provider Qualifications and Standards",
      icon: <CheckCircle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">3.1 Business Requirements:</h4>
            <p className="text-red-800 mb-3">Service Provider represents and warrants that:</p>
            <ul className="list-disc list-inside space-y-1 text-red-800">
              <li>For Commercial Providers: It is a legally registered business in good standing in its jurisdiction</li>
              <li>For Individual Providers: It is a legal adult with capacity to provide services and enter contracts</li>
              <li>It holds any necessary licenses, permits, and certifications required for its services (may vary by tier)</li>
              <li>Insurance Compliance: It meets the insurance requirements for its assigned risk tier</li>
              <li>It has the capacity and resources to fulfill bookings made through the Platform</li>
              <li>It complies with all applicable local, state, and federal regulations</li>
              <li>Enhanced Verification: Individual providers complete additional verification process including references and background checks</li>
            </ul>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">3.2 Service Categories: [Select applicable categories]</h4>
              <div className="space-y-4 text-blue-800">
                <div>
                  <h5 className="font-semibold">☐ ACCOMMODATION SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Hotels, resorts, vacation rentals, bed & breakfasts</li>
                    <li>Minimum standards: Professional housekeeping, safety compliance, accurate descriptions</li>
                    <li>Required amenities and features as specified in service descriptions</li>
                    <li>Check-in/check-out procedures and guest communication protocols</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">☐ DINING SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Restaurants, cafes, food tours, culinary experiences</li>
                    <li>Minimum standards: Current health department certifications, accurate menu information</li>
                    <li>Accommodation of dietary restrictions and allergies</li>
                    <li>Reservation management and guest communication</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">☐ ACTIVITY AND TOUR SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Guided tours, outdoor activities, cultural experiences, entertainment</li>
                    <li>Minimum standards: Certified guides, safety equipment, insurance coverage</li>
                    <li>Age restrictions and physical requirement disclosures</li>
                    <li>Emergency procedures and contact information</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">☐ TRANSPORTATION SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Car rentals, private transfers, shuttle services, boat charters</li>
                    <li>Minimum standards: Valid commercial licenses, vehicle maintenance records</li>
                    <li>Driver background checks and professional training</li>
                    <li>Vehicle safety inspections and insurance coverage</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">☐ WELLNESS AND SPA SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Spa treatments, fitness facilities, wellness retreats</li>
                    <li>Minimum standards: Licensed practitioners, sanitation protocols</li>
                    <li>Professional certifications and training documentation</li>
                    <li>Health and safety compliance measures</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">☐ SPECIALTY SERVICES</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Photography, event planning, shopping assistance, equipment rental</li>
                    <li>Minimum standards: Professional credentials, portfolio of work</li>
                    <li>Equipment maintenance and safety protocols</li>
                    <li>Service delivery timelines and quality standards</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">3.3 Quality Standards</h4>
              <div className="space-y-3 text-green-800">
                <div>
                  <h5 className="font-semibold">Service Excellence Requirements:</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Maintain a minimum customer satisfaction rating of 4.0 stars (on a 5-star scale)</li>
                    <li>Respond to booking inquiries within 2 hours during business hours</li>
                    <li>Provide accurate service descriptions and pricing information</li>
                    <li>Honor all confirmed reservations without unauthorized changes</li>
                    <li>Maintain professional communication with Travelers and Travel Experts</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold">Facility and Equipment Standards:</h5>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Keep facilities clean, safe, and in good repair</li>
                    <li>Maintain equipment in safe working condition with regular inspections</li>
                    <li>Provide accurate photos and descriptions of facilities/services</li>
                    <li>Meet or exceed industry standards for the service category</li>
                    <li>Comply with accessibility requirements where applicable</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "booking-procedures",
      title: "Booking and Reservation Procedures",
      icon: <Calendar className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Booking Process:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Bookings may be made directly by Travel Experts/Local Experts on behalf of Travelers</li>
                <li>Service Provider agrees to integrate with Platform booking systems where available</li>
                <li>Alternative booking methods: Phone, email, or third-party systems as agreed</li>
                <li>Confirmation requirements and timelines for different service types</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Availability Management:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Service Provider must maintain accurate, real-time availability information</li>
                <li>Update availability calendars within 2 hours of any changes</li>
                <li>Provide advance notice of planned closures or service interruptions</li>
                <li>Honor confirmed bookings even if availability information was not current</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Pricing and Payment:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Service Provider sets its own pricing for Travel Services</li>
                <li>Prices must be clearly communicated and honored for confirmed bookings</li>
                <li>Price changes apply only to new bookings unless mutually agreed</li>
                <li>Payment processing through Platform systems or direct provider arrangements</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">Confirmation and Communication:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>Provide booking confirmations within 2 hours of reservation</li>
                <li>Include all relevant details: dates, times, locations, contact information</li>
                <li>Communicate any special requirements or preparation instructions</li>
                <li>Provide emergency contact information for during-service issues</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "commission-payment",
      title: "Commission and Payment Terms",
      icon: <CreditCard className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">Risk-Adjusted Commission Structure:</h4>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 1 PROVIDERS (Limited Insurance):</h5>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>Standard Rate: 8-12% commission (typically higher due to platform risk)</li>
                  <li>Platform Insurance Participants: Reduced commission rate</li>
                  <li>Enhanced Disclosure Required: Clear traveler notification of insurance limitations</li>
                </ul>
              </div>
              
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 2 PROVIDERS (Moderate Insurance):</h5>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>Standard Rate: 6-10% commission</li>
                  <li>Volume Bonus: Reduced commission for providers with 50+ successful bookings</li>
                  <li>Safety Record Bonus: Rate reduction for providers with excellent safety records</li>
                </ul>
              </div>
              
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 3+ PROVIDERS (Full Commercial Insurance):</h5>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>Preferred Rate: 4-8% commission</li>
                  <li>Premium Partner Rate: Lowest commission for verified premium providers</li>
                  <li>Exclusive Partnership Rate: Special rates for exclusive or high-volume partners</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Payment Terms:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Commission payments due within 30 days of service completion</li>
                <li>Payments made via ACH transfer, check, or other agreed method</li>
                <li>Service Provider responsible for providing necessary tax documentation</li>
                <li>Payment subject to successful service delivery and absence of valid disputes</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Booking Modifications and Cancellations:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>No commission due for cancellations made more than 48 hours in advance</li>
                <li>Partial commission (50%) for cancellations within 48 hours due to Provider fault</li>
                <li>Full commission due for no-show situations or Traveler-initiated cancellations</li>
                <li>Modified bookings subject to commission based on final service value</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "insurance-liability",
      title: "Insurance and Liability",
      icon: <Shield className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">Tiered Insurance Requirements:</h4>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 1: LOW-RISK INDIVIDUAL PROVIDERS</h5>
                <p className="text-red-800 mb-2">Examples: Photography, local guides, cultural experiences, shopping assistance</p>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>Option A: General liability insurance: Minimum $100,000 per occurrence</li>
                  <li>Option B: Professional liability through Platform-sponsored group policy</li>
                  <li>Option C: Personal liability insurance with travel/business rider</li>
                  <li>Signed liability waiver and assumption of risk agreement</li>
                </ul>
              </div>
              
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 2: MODERATE-RISK SMALL BUSINESS PROVIDERS</h5>
                <p className="text-red-800 mb-2">Examples: Small restaurants, home-based dining, wellness services, equipment rental</p>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>General liability insurance: Minimum $300,000 per occurrence</li>
                  <li>Professional liability insurance: Minimum $100,000 (if applicable)</li>
                  <li>Business property insurance for equipment/facilities</li>
                  <li>Signed indemnification agreement</li>
                </ul>
              </div>
              
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">TIER 3: HIGHER-RISK COMMERCIAL PROVIDERS</h5>
                <p className="text-red-800 mb-2">Examples: Adventure activities, transportation, accommodations, marine activities</p>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>General liability insurance: Minimum $1,000,000 per occurrence</li>
                  <li>Professional liability insurance: Minimum $500,000</li>
                  <li>Property insurance for facilities and equipment</li>
                  <li>Workers' compensation insurance as required by law</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Alternative Coverage Options:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li><strong>Platform-Sponsored Insurance Program:</strong> Traveloure may offer group insurance policies for qualifying individual providers</li>
                <li><strong>Bonding and Financial Security:</strong> Performance bonds for higher-value bookings</li>
                <li><strong>Self-Insurance Options:</strong> Personal liability coverage verification for individual providers</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Certificate and Documentation Requirements:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Provide current certificates of insurance before service commencement</li>
                <li>Name Traveloure as additional insured where possible</li>
                <li>Notify Traveloure immediately of any coverage changes or cancellations</li>
                <li>Maintain continuous coverage throughout the term of this Agreement</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "prohibited-activities",
      title: "Prohibited Activities",
      icon: <XCircle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <h4 className="font-semibold text-red-900 mb-3">Platform Circumvention:</h4>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>May not solicit Platform-referred customers for direct bookings to avoid commissions</li>
                <li>May not use Platform-generated leads for non-Platform business</li>
                <li>May not redirect Travelers to competing platforms or services</li>
                <li>Must honor Platform booking terms and conditions</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
              <h4 className="font-semibold text-orange-900 mb-3">Competitive Activities:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>May not disparage Traveloure or competing service providers</li>
                <li>May not engage in predatory pricing to undermine Platform partnerships</li>
                <li>Must maintain fair and ethical business practices</li>
                <li>May not violate exclusive arrangement terms (if applicable)</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
              <h4 className="font-semibold text-purple-900 mb-3">Service Standards Violations:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>May not provide substandard service to Platform-referred guests</li>
                <li>May not discriminate against guests based on referral source</li>
                <li>May not misrepresent services or facilities in marketing materials</li>
                <li>Must maintain consistent pricing and availability information</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "termination",
      title: "Termination",
      icon: <AlertTriangle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Termination for Convenience:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Either party may terminate with 60 days written notice</li>
                <li>All confirmed bookings must be honored through completion</li>
                <li>Commission payments continue for services delivered after termination notice</li>
                <li>Transition period for transferring ongoing reservations</li>
              </ul>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <h4 className="font-semibold text-red-900 mb-3">Termination for Cause:</h4>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>Immediate termination for material breach of Agreement</li>
                <li>Failure to maintain required insurance coverage</li>
                <li>Consistent poor performance or customer complaints</li>
                <li>Violation of legal requirements or safety standards</li>
                <li>Fraudulent activity or misrepresentation</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Effect of Termination:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Cease use of Platform branding and marketing materials</li>
                <li>Complete all confirmed bookings scheduled within 30 days</li>
                <li>Final commission payments processed according to normal schedule</li>
                <li>Return any Platform-provided materials or equipment</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "dispute-resolution",
      title: "Dispute Resolution",
      icon: <Handshake className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Internal Resolution:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Address service delivery issues through direct communication</li>
                <li>Platform mediation available for unresolved disputes</li>
                <li>Escalation procedures for complex problems</li>
                <li>Good faith efforts to resolve issues amicably</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Formal Dispute Resolution:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Binding arbitration in Miami-Dade County, Florida</li>
                <li>American Arbitration Association commercial rules</li>
                <li>Costs shared equally unless arbitrator determines otherwise</li>
                <li>Continued service delivery during dispute resolution when possible</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "marketing-promotional",
      title: "Marketing and Promotional Terms",
      icon: <Globe className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Platform Listing:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Service Provider profile will be featured on the Platform with provided information</li>
                <li>Professional photos, service descriptions, and contact information displayed</li>
                <li>Reviews and ratings from Travelers prominently featured</li>
                <li>Special offers and promotional packages may be highlighted</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Marketing Materials:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Service Provider grants Traveloure license to use provided photos and descriptions</li>
                <li>Traveloure may create additional marketing content featuring Service Provider</li>
                <li>Service Provider may use Traveloure partnership logos in own marketing (with approval)</li>
                <li>Cross-promotional opportunities on social media and marketing channels</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Exclusive Offers:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Service Provider may provide exclusive rates or packages for Platform users</li>
                <li>Special amenities or services for Traveloure-referred guests</li>
                <li>Priority booking or enhanced service levels for Platform referrals</li>
                <li>Seasonal promotions and package deals coordination</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "service-delivery",
      title: "Service Delivery and Customer Experience",
      icon: <Users className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Service Standards:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Deliver services exactly as described in booking confirmations</li>
                <li>Maintain consistent quality across all Platform-referred bookings</li>
                <li>Provide professional, courteous service to all Travelers</li>
                <li>Handle any issues or complaints promptly and professionally</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Travel Expert Coordination:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Coordinate with Travel Experts/Local Experts for complex itineraries</li>
                <li>Provide recommendations and expertise when requested</li>
                <li>Accommodate special requests made through Travel Experts</li>
                <li>Maintain professional relationships with Platform partners</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Guest Recognition:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Identify and acknowledge Traveloure-referred guests appropriately</li>
                <li>Provide any agreed-upon special amenities or recognition</li>
                <li>Collect and report guest feedback to improve service quality</li>
                <li>Participate in Platform loyalty and recognition programs</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "technology-integration",
      title: "Technology Integration",
      icon: <Settings className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">API Integration:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Service Provider agrees to integrate with Platform APIs for booking management</li>
                <li>Real-time availability and pricing synchronization</li>
                <li>Automated confirmation and update processes</li>
                <li>Technical support and maintenance coordination</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Data Sharing:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Share necessary booking and availability data with Platform systems</li>
                <li>Provide performance metrics and analytics as requested</li>
                <li>Maintain data security and privacy standards</li>
                <li>Comply with data protection regulations</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Platform Tools:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Utilize Platform-provided tools for booking management</li>
                <li>Access to analytics and performance dashboards</li>
                <li>Training and support for Platform systems</li>
                <li>Regular updates and system maintenance coordination</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "quality-assurance",
      title: "Quality Assurance and Monitoring",
      icon: <CheckCircle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Performance Metrics:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Customer satisfaction ratings and review scores</li>
                <li>Booking confirmation response times</li>
                <li>Service delivery consistency and reliability</li>
                <li>Resolution time for issues and complaints</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Regular Reviews:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Quarterly performance reviews with Platform team</li>
                <li>Annual contract review and renewal discussions</li>
                <li>Ongoing feedback and improvement opportunities</li>
                <li>Best practice sharing and training sessions</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Mystery Shopping:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Platform may conduct anonymous service evaluations</li>
                <li>Feedback provided for continuous improvement</li>
                <li>Recognition for exceptional service delivery</li>
                <li>Corrective action plans for performance issues</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "confidentiality-data",
      title: "Confidentiality and Data Protection",
      icon: <Lock className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Confidential Information:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Customer personal information and booking details</li>
                <li>Platform pricing, commission structures, and business terms</li>
                <li>Marketing strategies and competitive information</li>
                <li>Technical systems and integration details</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Data Protection:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Comply with all applicable privacy laws and regulations</li>
                <li>Implement appropriate data security measures</li>
                <li>Report any data breaches immediately</li>
                <li>Use customer data only for service delivery purposes</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Record Keeping:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Maintain accurate records of all Platform-related bookings</li>
                <li>Provide booking and performance reports as requested</li>
                <li>Retain records for minimum of 3 years after service completion</li>
                <li>Cooperate with audits and compliance reviews</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "general-provisions",
      title: "General Provisions",
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Legal Framework:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li><strong>15.1 Governing Law:</strong> This Agreement is governed by Florida law without regard to conflict of law principles.</li>
                <li><strong>15.2 Independent Contractors:</strong> The parties are independent contractors with no agency, partnership, or joint venture relationship.</li>
                <li><strong>15.3 Assignment:</strong> Service Provider may not assign this Agreement without written consent. Traveloure may assign to successor entities.</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Agreement Terms:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li><strong>15.4 Force Majeure:</strong> Neither party liable for performance delays due to circumstances beyond reasonable control.</li>
                <li><strong>15.5 Entire Agreement:</strong> This Agreement constitutes the entire agreement and supersedes all prior agreements between the parties.</li>
                <li><strong>15.6 Amendments:</strong> Modifications must be in writing and signed by both parties.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-a",
      title: "Exhibit A: Service-Specific Terms and Requirements",
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
                     <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
             <h4 className="font-semibold text-red-900 mb-2">A.1 ACCOMMODATION SERVICES</h4>
             <div className="space-y-3 text-red-800">
               <div>
                 <h5 className="font-semibold">Facility Requirements:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Hotels/Resorts: Valid business license, health department compliance, fire safety certification</li>
                   <li>Vacation Rentals: Local rental permits, safety inspections, accurate property descriptions</li>
                   <li>Bed & Breakfasts: Food service permits (if applicable), guest safety measures, insurance compliance</li>
                   <li>Hostels: Shared space safety protocols, security measures, cleanliness standards</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Service Standards:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Check-in/check-out procedures clearly communicated</li>
                   <li>24/7 emergency contact availability</li>
                   <li>Guest services and concierge support</li>
                   <li>Housekeeping and maintenance standards</li>
                   <li>WiFi and basic amenities as advertised</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Booking Terms:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Standard cancellation policy: 48 hours for full refund, 24 hours for 50% refund</li>
                   <li>No-show policy: Full charge after 6pm on arrival date (unless otherwise arranged)</li>
                   <li>Modification policy: Subject to availability, fees may apply</li>
                   <li>Payment terms: 50% deposit, 50% upon arrival (or as agreed)</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Quality Metrics:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Minimum 4.0/5.0 guest satisfaction rating</li>
                   <li>Response to guest issues within 2 hours</li>
                   <li>Cleanliness and maintenance standards compliance</li>
                   <li>Accurate facility descriptions and photos</li>
                 </ul>
               </div>
             </div>
           </div>
          
                     <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
             <h4 className="font-semibold text-blue-900 mb-2">A.2 DINING SERVICES</h4>
             <div className="space-y-3 text-blue-800">
               <div>
                 <h5 className="font-semibold">Restaurant Requirements:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Current health department permits and certifications</li>
                   <li>Alcohol license (if applicable)</li>
                   <li>Staff food safety training certifications</li>
                   <li>Menu accuracy and pricing transparency</li>
                   <li>Allergen information and dietary accommodation capabilities</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Service Standards:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Reservation management and confirmation system</li>
                   <li>Special dietary restriction accommodation</li>
                   <li>Professional service staff training</li>
                   <li>Quality food preparation and presentation</li>
                   <li>Clean, safe dining environment</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Home Dining/Private Chef Services:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Personal liability insurance or Platform group coverage</li>
                   <li>Food handler's certification</li>
                   <li>Guest dietary restriction screening</li>
                   <li>Clean, safe food preparation environment</li>
                   <li>Emergency contact and backup plans</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Booking Terms:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Reservation confirmation within 2 hours</li>
                   <li>Cancellation policy: 24 hours notice for parties under 6, 48 hours for larger groups</li>
                   <li>Special requests accommodation where possible</li>
                   <li>Payment terms: Varies by service type</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Quality Metrics:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Food quality and presentation standards</li>
                   <li>Service timing and professionalism</li>
                   <li>Guest satisfaction ratings</li>
                   <li>Health and safety compliance</li>
                 </ul>
               </div>
             </div>
           </div>
          
                     <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
             <h4 className="font-semibold text-green-900 mb-2">A.3 ACTIVITY AND TOUR SERVICES</h4>
             <div className="space-y-3 text-green-800">
               <div>
                 <h5 className="font-semibold">Safety Requirements:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Adventure Activities: Certified guides, safety equipment, emergency procedures</li>
                   <li>Cultural Tours: Licensed tour guides (where required), group size limitations</li>
                   <li>Water Activities: Safety equipment, certified operators, weather protocols</li>
                   <li>Outdoor Adventures: First aid certification, emergency communication devices</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Guide Qualifications:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Professional certification or extensive local knowledge</li>
                   <li>Language proficiency as advertised</li>
                   <li>Customer service and communication skills</li>
                   <li>Safety training and emergency response capability</li>
                   <li>Cultural sensitivity and professional conduct</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Equipment and Facilities:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Regular safety inspections and maintenance</li>
                   <li>Age-appropriate and well-maintained equipment</li>
                   <li>Emergency first aid supplies readily available</li>
                   <li>Communication devices for remote activities</li>
                   <li>Transportation safety compliance</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Booking Terms:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Age restrictions and physical requirements clearly stated</li>
                   <li>Weather-dependent activity policies</li>
                   <li>Group size limitations and private tour options</li>
                   <li>Cancellation policy: 48 hours for weather, 24 hours for other reasons</li>
                   <li>Equipment rental and additional fee disclosure</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Quality Metrics:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Safety record maintenance</li>
                   <li>Guest satisfaction and educational value</li>
                   <li>Guide professionalism and knowledge</li>
                   <li>Equipment condition and safety compliance</li>
                 </ul>
               </div>
             </div>
           </div>
          
                     <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
             <h4 className="font-semibold text-purple-900 mb-2">A.4 TRANSPORTATION SERVICES</h4>
             <div className="space-y-3 text-purple-800">
               <div>
                 <h5 className="font-semibold">Vehicle Requirements:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Car Rentals: Valid fleet registration, comprehensive insurance, maintenance records</li>
                   <li>Private Transfers: Commercial driver's license, vehicle inspections, GPS navigation</li>
                   <li>Specialty Transport: Appropriate licenses for vehicle type (boat, helicopter, etc.)</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Driver Qualifications:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Valid commercial driver's license (where required)</li>
                   <li>Clean driving record (no DUI, reckless driving)</li>
                   <li>Background check clearance</li>
                   <li>Professional appearance and conduct</li>
                   <li>Local area knowledge and navigation skills</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Safety Standards:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Regular vehicle maintenance and safety inspections</li>
                   <li>Comprehensive insurance coverage</li>
                   <li>Emergency contact and breakdown procedures</li>
                   <li>GPS tracking and communication systems (for transfers)</li>
                   <li>Fuel, tolls, and parking fee policies</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Service Standards:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Punctual pickup and delivery</li>
                   <li>Professional, courteous service</li>
                   <li>Vehicle cleanliness and comfort</li>
                   <li>Route optimization and traffic awareness</li>
                   <li>Assistance with luggage and special needs</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Booking Terms:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Confirmation within 1 hour of booking request</li>
                   <li>Flight delay accommodation policies</li>
                   <li>Cancellation policy: 2 hours notice minimum</li>
                   <li>Waiting time policies and additional charges</li>
                   <li>Payment terms and gratuity guidelines</li>
                 </ul>
               </div>
             </div>
           </div>
          
                     <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
             <h4 className="font-semibold text-orange-900 mb-2">A.5 WELLNESS AND SPA SERVICES</h4>
             <div className="space-y-3 text-orange-800">
               <div>
                 <h5 className="font-semibold">Facility Requirements:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Health department compliance and licensing</li>
                   <li>Sanitation and hygiene protocols</li>
                   <li>Equipment maintenance and safety standards</li>
                   <li>Privacy and comfort amenities</li>
                   <li>Emergency procedures and first aid capability</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Practitioner Qualifications:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Professional certifications and licensing</li>
                   <li>Continuing education and training</li>
                   <li>Health screening and safety protocols</li>
                   <li>Professional conduct and boundaries training</li>
                   <li>Insurance coverage for professional services</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Service Standards:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Client consultation and health screening</li>
                   <li>Treatment room cleanliness and preparation</li>
                   <li>Professional equipment and product quality</li>
                   <li>Post-treatment care and recommendations</li>
                   <li>Client privacy and confidentiality</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Booking Terms:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Health screening and intake process</li>
                   <li>Cancellation policy: 24 hours notice for individual treatments</li>
                   <li>Modification and rescheduling policies</li>
                   <li>Payment terms and gratuity guidelines</li>
                   <li>Package deals and multiple treatment discounts</li>
                 </ul>
               </div>
             </div>
           </div>
          
                     <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
             <h4 className="font-semibold text-yellow-900 mb-2">A.6 SPECIALTY SERVICES</h4>
             <div className="space-y-3 text-yellow-800">
               <div>
                 <h5 className="font-semibold">Photography Services:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Professional equipment and backup systems</li>
                   <li>Portfolio demonstrating quality and style</li>
                   <li>Model releases and usage rights agreements</li>
                   <li>Weather contingency plans</li>
                   <li>Delivery timeline and format specifications</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Event Planning Services:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Vendor network and coordination capabilities</li>
                   <li>Timeline management and execution skills</li>
                   <li>Budget management and cost transparency</li>
                   <li>Emergency contingency planning</li>
                   <li>Client communication and update protocols</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Shopping and Personal Services:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Local market knowledge and vendor relationships</li>
                   <li>Budget management and cost tracking</li>
                   <li>Personal shopping preferences assessment</li>
                   <li>Transportation and logistics coordination</li>
                   <li>Package handling and delivery arrangements</li>
                 </ul>
               </div>
               <div>
                 <h5 className="font-semibold">Equipment Rental Services:</h5>
                 <ul className="list-disc list-inside space-y-1 ml-4">
                   <li>Equipment condition and maintenance records</li>
                   <li>User instruction and safety briefing</li>
                   <li>Damage policies and security deposits</li>
                   <li>Pickup and delivery arrangements</li>
                   <li>Emergency contact and support</li>
                 </ul>
               </div>
             </div>
           </div>
        </div>
      )
    },
    {
      id: "exhibit-b",
      title: "Exhibit B: Insurance Requirements by Service Category",
      icon: <Shield className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">B.1 TIER 1: LOW-RISK INDIVIDUAL PROVIDERS</h4>
            <div className="space-y-3 text-red-800">
              <div>
                <h5 className="font-semibold">Qualifying Services:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Photography (non-extreme locations)</li>
                  <li>Local walking tours and cultural experiences</li>
                  <li>Shopping assistance and personal services</li>
                  <li>Language interpretation and cultural guidance</li>
                  <li>Light equipment rental (cameras, phones, etc.)</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Minimum Insurance Requirements:</h5>
                <div className="ml-4 space-y-2">
                  <div>
                    <strong>Option A: Personal Coverage Enhancement</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Personal liability insurance with minimum $100,000 coverage</li>
                      <li>Business use rider or amendment to personal policy</li>
                      <li>Professional liability coverage of $50,000 (if applicable)</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Option B: Platform Group Policy Participation</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Enrollment in Traveloure-sponsored group liability policy</li>
                      <li>Coverage limits: $250,000 per occurrence, $500,000 aggregate</li>
                      <li>Deductible: $500 per claim (shared with Platform)</li>
                      <li>Premium cost: $15-25 per month depending on service type</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">B.2 TIER 2: MODERATE-RISK SMALL BUSINESS PROVIDERS</h4>
            <div className="space-y-3 text-blue-800">
              <div>
                <h5 className="font-semibold">Qualifying Services:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Small restaurants and cafes (under 50 seats)</li>
                  <li>Home-based dining experiences</li>
                  <li>Wellness services (massage, yoga, fitness)</li>
                  <li>Equipment rental (bikes, sports equipment)</li>
                  <li>Indoor activities and workshops</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Minimum Insurance Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>General liability insurance: $300,000 per occurrence, $600,000 aggregate</li>
                  <li>Professional liability insurance: $100,000 per claim (for applicable services)</li>
                  <li>Product liability coverage: $200,000 (for food services)</li>
                  <li>Business property insurance: Actual value of equipment/facilities</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">B.3 TIER 3: HIGHER-RISK COMMERCIAL PROVIDERS</h4>
            <div className="space-y-3 text-green-800">
              <div>
                <h5 className="font-semibold">Qualifying Services:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Adventure activities (hiking, climbing, water sports)</li>
                  <li>Transportation services (private transfers, vehicle rental)</li>
                  <li>Accommodations (hotels, vacation rentals)</li>
                  <li>Marine activities (boat tours, fishing charters)</li>
                  <li>Large group activities and events</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Minimum Insurance Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>General liability insurance: $1,000,000 per occurrence, $2,000,000 aggregate</li>
                  <li>Professional liability insurance: $500,000 per claim</li>
                  <li>Product liability coverage: $500,000 (if applicable)</li>
                  <li>Commercial auto insurance: $1,000,000 (for transportation services)</li>
                  <li>Workers' compensation: As required by state law</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">B.4 TIER 4: SPECIALIZED HIGH-RISK PROVIDERS</h4>
            <div className="space-y-3 text-purple-800">
              <div>
                <h5 className="font-semibold">Qualifying Services:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Extreme sports (skydiving, bungee jumping, rock climbing)</li>
                  <li>Aviation services (helicopter tours, scenic flights)</li>
                  <li>Medical/wellness treatments (spa treatments, alternative medicine)</li>
                  <li>High-value equipment or facility rental</li>
                  <li>Specialized transportation (off-road, marine)</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Enhanced Insurance Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Specialized liability coverage based on activity type</li>
                  <li>Minimum coverage limits determined by industry standards</li>
                  <li>Additional safety certifications and training requirements</li>
                  <li>Enhanced background checks and professional licensing</li>
                  <li>Regular safety audits and compliance reviews</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-c",
      title: "Exhibit C: Technical Integration Specifications",
      icon: <Settings className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">C.1 API INTEGRATION REQUIREMENTS</h4>
            <div className="space-y-3 text-blue-800">
              <div>
                <h5 className="font-semibold">Booking Management API:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Real-time availability calendar synchronization</li>
                  <li>Instant booking confirmation and denial capability</li>
                  <li>Pricing and package information updates</li>
                  <li>Customer communication message relay</li>
                  <li>Cancellation and modification processing</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Required API Endpoints:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>GET /availability - Retrieve real-time availability</li>
                  <li>POST /booking - Create new booking reservation</li>
                  <li>PUT /booking - Modify existing booking</li>
                  <li>DELETE /booking - Cancel booking</li>
                  <li>GET /booking- Retrieve booking details</li>
                  <li>POST /communication - Send message to customer</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Data Format Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>JSON format for all data exchanges</li>
                  <li>UTF-8 encoding for international character support</li>
                  <li>ISO 8601 date/time format standardization</li>
                  <li>Standard currency codes (USD, EUR, etc.)</li>
                  <li>Response time: Maximum 3 seconds for all API calls</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">C.2 PLATFORM DASHBOARD ACCESS</h4>
            <div className="space-y-3 text-green-800">
              <div>
                <h5 className="font-semibold">Provider Portal Features:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Real-time booking management interface</li>
                  <li>Availability calendar management</li>
                  <li>Customer communication center</li>
                  <li>Performance analytics and reporting</li>
                  <li>Financial reporting and commission tracking</li>
                  <li>Review and rating management</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Required Data Synchronization:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Inventory/availability updates within 5 minutes</li>
                  <li>Booking confirmations within 2 minutes</li>
                  <li>Price changes reflected immediately</li>
                  <li>Customer messages delivered instantly</li>
                  <li>Performance metrics updated daily</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">C.3 PAYMENT PROCESSING INTEGRATION</h4>
            <div className="space-y-3 text-purple-800">
              <div>
                <h5 className="font-semibold">Supported Payment Methods:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Credit/debit cards (Visa, MasterCard, American Express)</li>
                  <li>Digital wallets (PayPal, Apple Pay, Google Pay)</li>
                  <li>Bank transfers and ACH payments</li>
                  <li>International payment methods (region-specific)</li>
                  <li>Cryptocurrency (where legally permitted)</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Commission Processing:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Automated commission calculation and deduction</li>
                  <li>Weekly or monthly commission payments</li>
                  <li>Detailed transaction reporting</li>
                  <li>Tax documentation generation (1099s, etc.)</li>
                  <li>Multi-currency support and conversion</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-d",
      title: "Exhibit D: Marketing and Branding Guidelines",
      icon: <Globe className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">D.1 PLATFORM BRANDING USAGE</h4>
            <div className="space-y-3 text-blue-800">
              <div>
                <h5 className="font-semibold">Traveloure Logo and Branding:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Official Traveloure partner logo available for marketing use</li>
                  <li>Specific placement and sizing requirements</li>
                  <li>Color and font specifications for brand consistency</li>
                  <li>Approved marketing language and messaging</li>
                  <li>Co-branding guidelines for joint promotional materials</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Permitted Uses:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Website integration showing Traveloure partnership</li>
                  <li>Business cards and printed marketing materials</li>
                  <li>Social media profile badges and posts</li>
                  <li>Email signature professional partnership designation</li>
                  <li>Physical location signage (with approval)</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Prohibited Uses:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Modification of Traveloure logos or branding elements</li>
                  <li>Implication of exclusive partnership without agreement</li>
                  <li>Use of Traveloure branding on non-platform services</li>
                  <li>Misleading claims about Platform relationship</li>
                  <li>Competing platform promotion using Traveloure materials</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">D.2 SERVICE PROVIDER PROFILE OPTIMIZATION</h4>
            <div className="space-y-3 text-green-800">
              <div>
                <h5 className="font-semibold">Required Profile Elements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Professional high-resolution photos (minimum 1200x800 pixels)</li>
                  <li>Detailed service descriptions with benefits and features</li>
                  <li>Accurate pricing information and package options</li>
                  <li>Contact information and response time commitments</li>
                  <li>Professional certifications and qualification displays</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Recommended Content:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Customer testimonials and success stories</li>
                  <li>Behind-the-scenes photos and process explanations</li>
                  <li>Local area expertise and insider knowledge</li>
                  <li>Seasonal recommendations and special offers</li>
                  <li>Multi-language descriptions for international travelers</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Photo Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Professional quality images representing actual services</li>
                  <li>Accurate representation of facilities and equipment</li>
                  <li>Diverse customer representation when possible</li>
                  <li>Seasonal variety showing year-round capabilities</li>
                  <li>Proper lighting and composition for online display</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Content Guidelines:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Honest, accurate service descriptions</li>
                  <li>Clear pricing and package information</li>
                  <li>Professional, welcoming tone</li>
                  <li>Cultural sensitivity and inclusivity</li>
                  <li>Regular updates to maintain accuracy</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">D.3 PROMOTIONAL OPPORTUNITIES</h4>
            <div className="space-y-3 text-purple-800">
              <div>
                <h5 className="font-semibold">Platform Featured Listings:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Seasonal promotion opportunities</li>
                  <li>New provider spotlight programs</li>
                  <li>Excellence award recognition</li>
                  <li>Special event and holiday promotions</li>
                  <li>Volume booking incentive programs</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Social Media Collaboration:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Content creation partnerships</li>
                  <li>Customer story sharing and features</li>
                  <li>Professional photography sessions</li>
                  <li>Influencer collaboration opportunities</li>
                  <li>User-generated content campaigns</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Marketing Support:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Professional photography services (at cost)</li>
                  <li>Content creation assistance</li>
                  <li>SEO optimization support</li>
                  <li>Translation services for international markets</li>
                  <li>Performance marketing consultation</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Cross-Promotional Opportunities:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Partner with complementary service providers</li>
                  <li>Package deal creation and promotion</li>
                  <li>Referral bonus programs</li>
                  <li>Loyalty program participation</li>
                  <li>Corporate and group booking programs</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
            <h4 className="font-semibold text-orange-900 mb-2">D.4 CUSTOMER COMMUNICATION STANDARDS</h4>
            <div className="space-y-3 text-orange-800">
              <div>
                <h5 className="font-semibold">Professional Communication Requirements:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Prompt response to all customer inquiries (within 2 hours during business hours)</li>
                  <li>Professional, friendly tone in all communications</li>
                  <li>Clear, detailed information about services and expectations</li>
                  <li>Proactive communication about any changes or issues</li>
                  <li>Follow-up after service completion</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Platform Messaging System:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>All initial communications through Platform messaging</li>
                  <li>Professional language and complete sentences</li>
                  <li>Detailed responses to customer questions</li>
                  <li>Timely booking confirmations and instructions</li>
                  <li>Issue resolution and customer service support</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Customer Service Excellence:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Anticipate customer needs and provide helpful suggestions</li>
                  <li>Accommodate special requests when possible</li>
                  <li>Provide local insights and recommendations</li>
                  <li>Handle complaints professionally and promptly</li>
                  <li>Exceed customer expectations consistently</li>
                </ul>
              </div>
              <div>
                <h5 className="font-semibold">Multi-Language Support:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Accurate language proficiency representation</li>
                  <li>Professional translation services when needed</li>
                  <li>Cultural sensitivity in international communications</li>
                  <li>Local customs and etiquette guidance</li>
                  <li>Emergency communication capabilities in multiple languages</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Building2 className="h-10 w-10 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Service Provider Terms</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
            Third-Party Service Provider Agreement
          </p>
          <p className="text-sm text-gray-500">
            Last Updated: {new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        {/* Go Back Button */}
        <div className="max-w-4xl mx-auto mb-6">
          <Button 
            onClick={handleGoBack}
            variant="outline"
            className="flex items-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto relative">
          {/* Mobile Sidebar Toggle */}
          <div className="lg:hidden mb-4">
            <Button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              variant="outline"
              className="flex items-center gap-2"
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              {sidebarOpen ? 'Close Menu' : 'Open Menu'}
            </Button>
          </div>

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="lg:hidden fixed inset-0  z-40" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Mobile Sidebar */}
          <div className={`lg:hidden fixed top-0 left-0 h-full w-80 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Contents</h3>
                <Button
                  onClick={() => setSidebarOpen(false)}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id)
                      setSidebarOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      activeSection === section.id
                        ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {section.icon}
                    <span className="text-sm font-medium">{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Desktop Sidebar Navigation */}
            <div className="hidden lg:block lg:col-span-1">
              <Card className="sticky top-8 bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-gray-900">Contents</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <nav className="space-y-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                          activeSection === section.id
                            ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        {section.icon}
                        <span className="text-sm font-medium">{section.title}</span>
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3 w-full">
              <Card className="bg-white/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  {sections.map((section) => (
                    <div
                      key={section.id}
                      className={activeSection === section.id ? 'block' : 'hidden'}
                    >
                      <div className="flex items-center gap-3 mb-6">
                        {section.icon}
                        <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
                      </div>
                      <div className="prose prose-gray max-w-none">
                        {section.content}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-800">
                    <Users className="h-6 w-6" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 mb-4">
                    For questions about becoming a service provider, please contact us:
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <h4 className="font-semibold text-gray-900">General Inquiries</h4>
                      </div>
                      <p className="text-blue-600 text-sm">support@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-green-600" />
                        <h4 className="font-semibold text-gray-900">Partnerships</h4>
                      </div>
                      <p className="text-green-600 text-sm">Admin@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-purple-600" />
                        <h4 className="font-semibold text-gray-900">Legal</h4>
                      </div>
                      <p className="text-purple-600 text-sm">legal@traveloure.com</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                    <p className="text-yellow-900 text-sm">
                      <strong>Effective Date:</strong> These terms are effective as of {new Date().toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 