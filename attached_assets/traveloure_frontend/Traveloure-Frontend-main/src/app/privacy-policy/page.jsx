"use client"

import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { ArrowLeft, Shield, Mail, Users, Globe, FileText, Calendar, UserCheck, Database, Eye, Lock, Settings, Key, Bell, Menu, X } from "lucide-react"
import { useRouter } from "next/navigation"

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState("introduction")
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
      id: "introduction",
      title: "Introduction",
      icon: <Shield className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            TRAVELOURE LLC ("Traveloure," "Company," "we," or "us") respects your privacy and is committed to protecting it through our compliance with this policy.
          </p>
          <p>
            This policy describes the types of information we may collect from you or that you may provide when you visit the website www.traveloure-beta.com (the "Site") and our practices for collecting, using, maintaining, protecting, and disclosing that information.
          </p>
          <p>
            <strong>About Traveloure:</strong> We are a travel platform that connects travelers with Travel Experts and Local Experts (collectively referred to as "Travel Experts," "Local Experts," or "Experts") who provide personalized travel recommendations, itineraries, and insider knowledge to enhance your travel experiences.
          </p>
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">This policy applies to information we collect:</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>On the Site and through our Travel Expert/Local Expert matching services</li>
              <li>In email, text, and other electronic messages between you, the Site, and our Travel Experts/Local Experts</li>
              <li>Through mobile and desktop applications you download from the Site</li>
              <li>When you interact with our advertising and applications on third-party websites and services</li>
              <li>Through your interactions with Travel Experts/Local Experts facilitated through our platform</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "age-requirements",
      title: "Age Requirements",
      icon: <UserCheck className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            Our Site is intended for users 18 years of age and older. No one under age 18 may provide any information to or on the Site. We do not knowingly collect personal information from children under 18.
          </p>
          <p>
            If you are under 18, do not use or provide any information on the Site or through any of its features, register on the Site, make any purchases through the Site, use any of the interactive or public comment features of the Site, or provide any information about yourself to us, including your name, address, telephone number, email address, or any screen name or user name you may use.
          </p>
          <p>
            If we learn we have collected or received personal information from a child under 18 without verification of parental consent, we will delete that information. If you believe we might have any information from or about a child under 18, please contact us at <span className="text-blue-600">privacy@traveloure.com</span>.
          </p>
        </div>
      )
    },
    {
      id: "information-collection",
      title: "Information We Collect",
      icon: <Database className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">We collect several types of information from and about users of our Site, including information:</h4>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Personal Information:</strong> By which you may be personally identified, such as name, postal address, email address, telephone number</li>
              <li><strong>Travel-specific information:</strong> Such as travel preferences, destination interests, budget ranges, travel dates, group size, and accommodation preferences</li>
              <li><strong>Location information:</strong> To match you with relevant Travel Experts/Local Experts</li>
              <li><strong>Usage data:</strong> That is about you but individually does not identify you, such as travel booking history, platform usage patterns, and Travel Expert/Local Expert interaction history</li>
              <li><strong>Technical information:</strong> About your internet connection, the equipment you use to access our Site, and usage details</li>
            </ul>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">Information You Provide to Us:</h4>
            <div className="space-y-3 text-green-800">
              <div>
                <strong>Account and Profile Information:</strong>
                <ul className="list-disc list-inside mt-1 ml-4 space-y-1">
                  <li>Information that you provide by filling in forms on our Site, including registration information, profile creation, and Travel Expert/Local Expert applications</li>
                  <li>Travel preferences and interests including preferred destinations, travel style, budget ranges, and accessibility needs</li>
                  <li>Travel Expert/Local Expert profiles including expertise areas, certifications, languages spoken, and destination specialties</li>
                </ul>
              </div>
              <div>
                <strong>Communication and Interaction Data:</strong>
                <ul className="list-disc list-inside mt-1 ml-4 space-y-1">
                  <li>Records and copies of your correspondence (including email addresses) with us and with Travel Experts/Local Experts</li>
                  <li>Messages, reviews, and ratings exchanged through our platform</li>
                  <li>Your responses to surveys about travel experiences and platform satisfaction</li>
                </ul>
              </div>
              <div>
                <strong>Transaction Information:</strong>
                <ul className="list-disc list-inside mt-1 ml-4 space-y-1">
                  <li>Details of transactions you carry out through our Site, including payments to Travel Experts/Local Experts</li>
                  <li>Travel itinerary requests and customizations</li>
                  <li>Financial information required for payments (processed securely through third-party payment processors)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "information-use",
      title: "How We Use Your Information",
      icon: <Eye className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            We use information that we collect about you or that you provide to us, including any personal information:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Core Platform Services:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>To match you with appropriate Travel Experts/Local Experts based on your travel preferences and location</li>
                <li>To facilitate communication between travelers and Travel Experts/Local Experts</li>
                <li>To process payments and transactions for Travel Expert/Local Expert services</li>
                <li>To provide you with personalized travel recommendations and content</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Account and Service Management:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>To create and manage your account and Travel Expert/Local Expert profiles</li>
                <li>To provide customer support and respond to your inquiries</li>
                <li>To send important notifications about bookings, matches, and platform updates</li>
                <li>To verify the credentials and expertise of Travel Experts/Local Experts</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Platform Improvement:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>To improve our Travel Expert/Local Expert matching algorithms</li>
                <li>To analyze platform usage and optimize user experience</li>
                <li>To develop new features and services based on user feedback</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">Marketing and Communication:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>To send you promotional materials about new Travel Experts/Local Experts and destinations (with your consent)</li>
                <li>To display targeted travel content and recommendations</li>
                <li>To showcase user reviews and travel experiences (with permission)</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">Legal and Safety:</h4>
            <ul className="list-disc list-inside space-y-1 text-red-800">
              <li>To ensure platform safety and prevent fraud</li>
              <li>To enforce our Terms of Service and Travel Expert/Local Expert agreements</li>
              <li>To comply with legal obligations and protect our rights</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "information-disclosure",
      title: "Disclosure of Your Information",
      icon: <Globe className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            We may disclose aggregated information about our users, and information that does not identify any individual, without restriction.
          </p>
          <p>
            We may disclose personal information that we collect or you provide as described in this privacy policy:
          </p>
          
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
              <h4 className="font-semibold text-blue-900 mb-2">Platform Operations:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>To Travel Experts/Local Experts when you request their services or match with them through our platform</li>
                <li>To travelers when you serve as a Travel Expert/Local Expert (limited to information necessary for the travel service)</li>
                <li>To payment processors and financial institutions to process transactions</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
              <h4 className="font-semibold text-green-900 mb-2">Business Operations:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>To our subsidiaries and affiliates</li>
                <li>To contractors, service providers, and other third parties we use to support our business</li>
                <li>To a buyer or other successor in the event of a merger, divestiture, restructuring, reorganization, dissolution, or other sale or transfer of some or all of the Company's assets</li>
              </ul>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <h4 className="font-semibold text-red-900 mb-2">Legal and Safety:</h4>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>To comply with any court order, law, or legal process, including to respond to any government or regulatory request</li>
                <li>To enforce or apply our Terms and Conditions and Travel Expert/Local Expert agreements</li>
                <li>If we believe disclosure is necessary or appropriate to protect the rights, property, or safety of the Company, our users, Travel Experts/Local Experts, or others</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
              <h4 className="font-semibold text-purple-900 mb-2">With Your Consent:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>To third parties to market travel-related products or services to you if you have opted in to these disclosures</li>
                <li>For any other purpose disclosed by us when you provide the information</li>
                <li>With your explicit consent for specific uses</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <p className="text-yellow-900 font-semibold">
              <strong>Important Note for Travel Expert/Local Expert Interactions:</strong> When you are matched with or book services from a Travel Expert/Local Expert, certain personal information (such as your name, contact information, and travel preferences) will be shared with that Travel Expert/Local Expert to facilitate the travel service. Travel Experts/Local Experts are bound by their own privacy obligations under their agreements with us.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "choices",
      title: "Your Choices and Rights",
      icon: <Settings className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            We strive to provide you with choices regarding the personal information you provide to us:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Privacy Controls:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Travel Expert/Local Expert Matching Preferences: You can control what information is shared with Travel Experts/Local Experts and adjust your matching preferences</li>
                <li>Communication Preferences: Choose which types of emails and notifications you receive</li>
                <li>Profile Visibility: Control whether your reviews and contributions are displayed publicly</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Tracking and Advertising:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>You can set your browser to refuse all or some browser cookies, or to alert you when cookies are being sent</li>
                <li>Location Services: You can disable location sharing while still using other platform features</li>
                <li>Behavioral Tracking: Opt out of behavioral tracking in your account settings</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">Marketing Communications:</h4>
            <ul className="list-disc list-inside space-y-1 text-purple-800">
              <li>Travel Promotions: Opt out of promotional emails about new destinations and Travel Experts/Local Experts</li>
              <li>Partner Offers: Choose whether to receive offers from our travel industry partners</li>
              <li>You can always unsubscribe from marketing emails using the link provided in each email</li>
            </ul>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <h4 className="font-semibold text-yellow-900 mb-2">Accessing and Correcting Your Information:</h4>
            <ul className="list-disc list-inside space-y-1 text-yellow-800">
              <li>You can review and change your personal information by logging into the Site and visiting your account profile page</li>
              <li>You may send us an email to request access to, correct, or delete any personal information that you have provided to us</li>
              <li>Download your data: Request a copy of your personal information in a portable format</li>
            </ul>
            <p className="text-yellow-900 mt-3">
              To exercise any of these rights, please email us at <span className="text-blue-600">privacy@traveloure.com</span>.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "data-security",
      title: "Data Security",
      icon: <Lock className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            We have implemented measures designed to secure your personal information from accidental loss and from unauthorized access, use, alteration, and disclosure:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Technical Safeguards:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>All information you provide to us is stored on our secure servers behind firewalls</li>
                <li>Payment transactions are encrypted and processed through secure third-party payment processors</li>
                <li>Travel Expert/Local Expert-traveler communications are facilitated through secure messaging systems</li>
                <li>Regular security audits and updates to protect against emerging threats</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Operational Safeguards:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Travel Expert/Local Expert verification: We verify the credentials and backgrounds of Travel Experts/Local Experts before approving them</li>
                <li>Limited access to personal information on a need-to-know basis</li>
                <li>Regular training for staff on privacy and security practices</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <h4 className="font-semibold text-yellow-900 mb-2">Your Responsibilities:</h4>
            <ul className="list-disc list-inside space-y-1 text-yellow-800">
              <li>Keep your password confidential and do not share it with anyone</li>
              <li>Be careful about giving out information in public areas of the Site like reviews and forums</li>
              <li>When communicating with Travel Experts/Local Experts, be mindful of what personal information you choose to share</li>
            </ul>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <p className="text-red-900">
              <strong>Important:</strong> Unfortunately, the transmission of information via the internet is not completely secure. Although we do our best to protect your personal information, we cannot guarantee the security of your personal information transmitted to our Site. Any transmission of personal information is at your own risk.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "international-transfers",
      title: "International Data Transfers",
      icon: <Globe className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Travel Expert/Local Expert Network:</h4>
            <p className="text-blue-800">
              Our platform connects users with Travel Experts/Local Experts worldwide. When you request services from a Travel Expert/Local Expert in another country, your information may be transferred to and processed in that country. We ensure that such transfers comply with applicable privacy laws and that Travel Experts/Local Experts agree to protect your information.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "data-retention",
      title: "Data Retention",
      icon: <Calendar className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            We retain your personal information for as long as necessary to provide our services and fulfill the purposes outlined in this Privacy Policy:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Account information:</strong> Retained while your account is active and for a reasonable period after deletion</li>
            <li><strong>Transaction records:</strong> Retained for financial and legal compliance purposes</li>
            <li><strong>Travel Expert/Local Expert credentials:</strong> Retained for verification and platform safety purposes</li>
            <li><strong>Reviews and ratings:</strong> May be retained (anonymized) for platform integrity</li>
          </ul>
        </div>
      )
    },
    {
      id: "changes-policy",
      title: "Changes to Our Privacy Policy",
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            It is our policy to post any changes we make to our privacy policy on this page. If we make material changes to how we treat our users' personal information, we will notify you by email to the primary email address specified in your account and through a notice on the Site home page.
          </p>
          <p>
            The date the privacy policy was last revised is identified at the top of the page. You are responsible for ensuring we have an up-to-date active and deliverable email address for you, and for periodically visiting our Site and this privacy policy to check for any changes.
          </p>
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
            <Shield className="h-10 w-10 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
            How we collect, use, and protect your personal information
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
                    To ask questions or comment about this privacy policy and our privacy practices, contact us at:
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <h4 className="font-semibold text-gray-900">General Inquiries</h4>
                      </div>
                      <p className="text-blue-600 text-sm">Admin@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-green-600" />
                        <h4 className="font-semibold text-gray-900">Privacy Concerns</h4>
                      </div>
                      <p className="text-green-600 text-sm">privacy@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-purple-600" />
                        <h4 className="font-semibold text-gray-900">Travel Expert Inquiries</h4>
                      </div>
                      <p className="text-purple-600 text-sm">experts@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Bell className="h-4 w-4 text-orange-600" />
                        <h4 className="font-semibold text-gray-900">General Support</h4>
                      </div>
                      <p className="text-orange-600 text-sm">support@traveloure.com</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                    <p className="text-yellow-900 text-sm">
                      <strong>To register a complaint or concern:</strong> Please email privacy@traveloure.com with "Privacy Concern" in the subject line.
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