"use client"

import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { ArrowLeft, Shield, Mail, Users, Globe, FileText, Calendar, UserCheck, Database, Eye, Lock, Settings, Key, Bell, AlertTriangle, Scale, Handshake, CreditCard, MapPin, MessageSquare, Phone, Building2, CheckCircle, XCircle, Star, Award, BookOpen, Compass, Menu, X } from "lucide-react"
import { useRouter } from "next/navigation"

export default function TravelExpertTermsPage() {
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
      title: "Travel Expert/Local Expert Service Agreement",
      icon: <Handshake className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Agreement Overview:</h4>
            <p className="text-blue-800">
              This Travel Expert/Local Expert Service Agreement (this "Agreement") is entered into as of _________________ (the "Effective Date") by and between TRAVELOURE LLC, a Florida limited liability company ("Traveloure," "Company," "we," "us," or "our"), and _________________________________ ("Travel Expert," "Local Expert," "Expert," or "you").
            </p>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">1. DEFINITIONS</h4>
            <div className="space-y-2 text-red-800">
              <p><strong>1.1 Platform:</strong> The Traveloure website located at www.traveloure-beta.com and related mobile applications and services.</p>
              <p><strong>1.2 Travel Services:</strong> Services provided by Travel Expert through the Platform, including but not limited to travel recommendations, itinerary creation, destination guidance, local expertise, and travel planning assistance.</p>
              <p><strong>1.3 Traveler:</strong> Any user of the Platform who books or requests Travel Services from a Travel Expert.</p>
              <p><strong>1.4 Service Fee:</strong> The total amount paid by a Traveler for Travel Services.</p>
              <p><strong>1.5 Platform Fee:</strong> The commission retained by Traveloure from each Service Fee.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "appointment-relationship",
      title: "Appointment and Relationship",
      icon: <UserCheck className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">2.1 Independent Contractor Status:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>You are an independent contractor providing Travel Services through the Platform</li>
                <li>You are not an employee, agent, partner, or joint venturer of Traveloure</li>
                <li>This Agreement does not create an employment relationship, partnership, franchise, or agency relationship between the parties</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">2.2 Travel Expert Designation:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Subject to your compliance with this Agreement, Traveloure grants you the non-exclusive right to be designated as a "Travel Expert" or "Local Expert" on the Platform</li>
                <li>You may provide Travel Services to Travelers through the Platform</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">2.3 Platform Access:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Traveloure will provide you with access to the Platform's Travel Expert portal</li>
                <li>Includes tools for profile management, traveler communication, booking management, and payment processing</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "qualifications",
      title: "Travel Expert Qualifications and Representations",
      icon: <CheckCircle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">3.1 Required Qualifications:</h4>
            <p className="text-red-800 mb-3">You represent and warrant that you:</p>
            <ul className="list-disc list-inside space-y-1 text-red-800">
              <li>Have substantial local knowledge and expertise in your designated geographic area(s)</li>
              <li>Possess the necessary skills, experience, and knowledge to provide quality Travel Services</li>
              <li>Are legally authorized to provide travel advisory services in your jurisdiction</li>
              <li>Have not been convicted of any felony or crime involving fraud, theft, or moral turpitude</li>
              <li>Are at least 18 years of age</li>
              <li>Have the legal capacity to enter into this Agreement</li>
            </ul>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">3.2 Professional Standards:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Maintain current and accurate knowledge of your local area, including attractions, accommodations, restaurants, transportation, and cultural considerations</li>
                <li>Provide honest, accurate, and up-to-date travel information and recommendations</li>
                <li>Maintain professional conduct in all interactions with Travelers and Traveloure</li>
                <li>Respond to Traveler inquiries promptly and professionally</li>
                <li>Honor all confirmed bookings and arrangements made through the Platform</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">3.3 Ongoing Verification:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>You agree to participate in ongoing verification processes</li>
                <li>Include periodic updates to your qualifications, references, and background information</li>
                <li>As reasonably requested by Traveloure</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "services-standards",
      title: "Travel Services and Performance Standards",
      icon: <Compass className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">4.1 Service Categories:</h4>
            <p className="text-blue-800 mb-3">Travel Services may include, but are not limited to:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Destination recommendations and insider tips</li>
              <li>Custom itinerary creation and planning</li>
              <li>Local activity and attraction guidance</li>
              <li>Restaurant and accommodation recommendations</li>
              <li>Transportation assistance and logistics support</li>
              <li>Cultural orientation and language assistance</li>
              <li>Emergency local support during travel</li>
              <li>Photography services and location scouting</li>
              <li>Group travel coordination</li>
            </ul>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">4.2 Response Time Requirements:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li><strong>Initial Response:</strong> Respond to new Traveler inquiries within 12 hours</li>
                <li><strong>Booking Confirmations:</strong> Confirm or decline booking requests within 6 hours</li>
                <li><strong>Ongoing Communication:</strong> Respond to Traveler messages within 4 hours during your designated available hours</li>
                <li><strong>Emergency Support:</strong> Provide emergency contact information and maintain reasonable availability during active travel periods</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">4.3 Quality Standards:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Maintain a minimum overall rating of 4.0 stars (on a 5-star scale) based on Traveler reviews</li>
                <li>Complete at least 80% of confirmed bookings without cancellation by you</li>
                <li>Provide accurate and reliable information in all communications</li>
                <li>Deliver services as described in your profile and booking confirmations</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">4.4 Availability and Capacity:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>Maintain an updated availability calendar on the Platform</li>
                <li>Only accept bookings that you can reasonably fulfill</li>
                <li>Provide adequate notice (minimum 48 hours when possible) for any changes to availability</li>
                <li>Maintain capacity to serve a reasonable number of Travelers without compromising service quality</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "compensation-payment",
      title: "Compensation and Payment Terms",
      icon: <CreditCard className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">5.1 Commission Structure:</h4>
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">Standard Commission:</h5>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>You will receive 75% of the Service Fee for completed Travel Services</li>
                  <li>Traveloure retains 25% of the Service Fee as the Platform Fee</li>
                </ul>
              </div>
              
              <div className="bg-white p-3 rounded border border-red-200">
                <h5 className="font-semibold text-red-900 mb-2">New Expert Promotion:</h5>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  <li>For the first 90 days after account approval, you will receive 85% of the Service Fee (15% Platform Fee)</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">5.2 Payment Processing:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Service Fees are collected by Traveloure through the Platform's payment processing system</li>
                <li>Your commission will be transferred to your designated bank account within 3-5 business days after service completion</li>
                <li>Payment is contingent upon Traveler confirmation of service completion and absence of valid disputes</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">5.3 Pricing Authority:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>You have the authority to set your own prices for Travel Services, subject to Platform guidelines</li>
                <li>Prices must be clearly displayed in your profile and booking requests</li>
                <li>Price changes apply only to new bookings and cannot be modified for confirmed bookings without mutual agreement</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">5.4 Taxes and Reporting:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>You are responsible for all applicable taxes on income earned through the Platform</li>
                <li>Traveloure will provide annual tax documentation (Form 1099) for US-based Travel Experts earning over $600 annually</li>
                <li>You are responsible for compliance with all local tax obligations in your jurisdiction</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">5.5 Expenses:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>You are responsible for all expenses incurred in providing Travel Services unless specifically agreed otherwise with the Traveler</li>
                <li>Traveloure is not responsible for reimbursing any Travel Expert expenses</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "platform-policies",
      title: "Platform Policies and Procedures",
      icon: <Settings className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">6.1 Profile Requirements:</h4>
              <p className="text-blue-800 mb-3">Maintain an accurate, complete, and professional profile including:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Current professional photo</li>
                <li>Detailed description of local expertise and qualifications</li>
                <li>Accurate geographic coverage areas</li>
                <li>Available service types and specialties</li>
                <li>Current contact information and availability</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">6.2 Communication Guidelines:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>All initial Traveler communications must occur through the Platform messaging system</li>
                <li>You may exchange direct contact information with Travelers after booking confirmation</li>
                <li>Maintain professional, helpful, and respectful communication at all times</li>
                <li>Do not solicit Travelers to book services outside the Platform</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">6.3 Booking Management:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Accept or decline booking requests promptly</li>
                <li>Provide detailed service descriptions and expectations for each booking</li>
                <li>Confirm all logistics and meeting arrangements with Travelers in advance</li>
                <li>Report any issues or disputes through the Platform's resolution system</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">6.4 Review and Rating System:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>Encourage Travelers to provide honest reviews and ratings after service completion</li>
                <li>Respond professionally to all reviews, both positive and negative</li>
                <li>Do not attempt to manipulate the review system through fake reviews or inappropriate incentives</li>
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
              <h4 className="font-semibold text-red-900 mb-3">7.1 Platform Circumvention:</h4>
              <p className="text-red-800 mb-2">You may not:</p>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>Solicit Travelers to book services outside the Platform to avoid Platform Fees</li>
                <li>Share personal payment information to circumvent Platform payment processing</li>
                <li>Direct Travelers to competing platforms or services</li>
                <li>Use Platform-generated leads for non-Platform business purposes</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
              <h4 className="font-semibold text-orange-900 mb-3">7.2 Professional Misconduct:</h4>
              <p className="text-orange-800 mb-2">You may not:</p>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>Provide false, misleading, or inaccurate travel information</li>
                <li>Discriminate against Travelers based on race, religion, gender, sexual orientation, nationality, or other protected characteristics</li>
                <li>Engage in any illegal activities in connection with Travel Services</li>
                <li>Misrepresent your qualifications, experience, or local expertise</li>
                <li>Violate local laws or regulations in the provision of Travel Services</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
              <h4 className="font-semibold text-purple-900 mb-3">7.3 Platform Abuse:</h4>
              <p className="text-purple-800 mb-2">You may not:</p>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Create multiple accounts or profiles</li>
                <li>Manipulate or attempt to game the Platform's algorithms or systems</li>
                <li>Post inappropriate, offensive, or culturally insensitive content</li>
                <li>Interfere with other Travel Experts' business or relationships with Travelers</li>
                <li>Use automated systems or bots to interact with the Platform</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "intellectual-property",
      title: "Intellectual Property",
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">8.1 Travel Expert Content:</h4>
              <p className="text-blue-800 mb-3">You retain ownership of original content you create, including:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Custom itineraries and travel plans</li>
                <li>Original photography and written descriptions</li>
                <li>Proprietary local knowledge and insights</li>
                <li>Personal travel recommendations and tips</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">8.2 Platform License:</h4>
              <p className="text-green-800 mb-3">You grant Traveloure a non-exclusive, worldwide, royalty-free license to:</p>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Display your content on the Platform</li>
                <li>Use your content for marketing and promotional purposes</li>
                <li>Modify and adapt your content for Platform functionality</li>
                <li>Share your content with Travelers who book your services</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">8.3 Platform Property:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>You acknowledge that the Platform, its technology, algorithms, and proprietary systems are the exclusive property of Traveloure</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">8.4 Traveler Information:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>You may not use Traveler personal information for any purpose other than providing the requested Travel Services</li>
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
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">9.1 Professional Liability:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>You are strongly encouraged to maintain professional liability insurance appropriate for travel advisory services in your jurisdiction</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">9.2 General Liability:</h4>
              <p className="text-green-800 mb-3">You assume full responsibility and liability for:</p>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>The accuracy and safety of your travel recommendations</li>
                <li>Any personal injury or property damage that may occur during Travel Services</li>
                <li>Compliance with all applicable local laws and regulations</li>
                <li>The professional quality and delivery of your Travel Services</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">9.3 Platform Limitations:</h4>
              <p className="text-purple-800 mb-3">Traveloure's liability is limited to facilitating connections between Travelers and Travel Experts. Traveloure is not liable for:</p>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>The quality, accuracy, or safety of Travel Services provided by Travel Experts</li>
                <li>Any disputes between Travel Experts and Travelers</li>
                <li>Any personal injury, property damage, or other losses incurred during travel</li>
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
              <h4 className="font-semibold text-blue-900 mb-3">10.1 Termination by You:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>You may terminate this Agreement at any time with 30 days' written notice to Traveloure</li>
                <li>Provided that you complete all confirmed bookings scheduled within the notice period</li>
              </ul>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <h4 className="font-semibold text-red-900 mb-3">10.2 Termination by Traveloure:</h4>
              <p className="text-red-800 mb-2">Traveloure may terminate this Agreement immediately upon written notice for:</p>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>Material breach of this Agreement</li>
                <li>Failure to maintain required quality standards (below 4.0 star rating for 30 consecutive days)</li>
                <li>Fraudulent or illegal activity</li>
                <li>Violation of Platform policies</li>
                <li>Failure to respond to Travelers according to required timeframes</li>
                <li>Providing false information during the application or verification process</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">10.3 Effect of Termination:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Your access to the Platform will be immediately suspended</li>
                <li>You must complete all confirmed bookings scheduled within 48 hours of termination</li>
                <li>Outstanding payments will be processed according to normal payment schedules</li>
                <li>You must cease all use of Traveloure branding and marketing materials</li>
                <li>Confidentiality and intellectual property provisions survive termination</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "confidentiality",
      title: "Confidentiality",
      icon: <Lock className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">11.1 Confidential Information:</h4>
              <p className="text-blue-800 mb-3">You acknowledge that you may have access to confidential information, including:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Traveler personal information and travel preferences</li>
                <li>Platform algorithms, technology, and business processes</li>
                <li>Pricing strategies and commission structures</li>
                <li>Other Travel Expert information and performance data</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">11.2 Non-Disclosure:</h4>
              <p className="text-green-800 mb-3">You agree to:</p>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Maintain strict confidentiality of all confidential information</li>
                <li>Use confidential information solely for providing Travel Services through the Platform</li>
                <li>Not disclose confidential information to any third party without prior written consent</li>
                <li>Return or destroy any confidential information upon termination</li>
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
              <h4 className="font-semibold text-blue-900 mb-3">12.1 Internal Resolution:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>All disputes related to this Agreement or the Platform should first be addressed through Traveloure's internal dispute resolution process</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">12.2 Arbitration:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Any disputes that cannot be resolved through internal processes shall be resolved through binding arbitration in Miami-Dade County, Florida</li>
                <li>In accordance with the rules of the American Arbitration Association</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">12.3 Traveler Disputes:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Disputes between Travel Experts and Travelers should be reported to Traveloure's dispute resolution team for mediation assistance</li>
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
                <li><strong>13.1 Governing Law:</strong> This Agreement is governed by the laws of the State of Florida, without regard to conflict of law principles.</li>
                <li><strong>13.2 Jurisdiction:</strong> Any legal proceedings related to this Agreement shall be brought exclusively in the courts of Miami-Dade County, Florida.</li>
                <li><strong>13.3 Entire Agreement:</strong> This Agreement, together with the Platform Terms of Use and Privacy Policy, constitutes the entire agreement between the parties and supersedes all prior agreements and understandings.</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Agreement Terms:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li><strong>13.4 Amendments:</strong> This Agreement may only be modified by written agreement signed by both parties, or by Traveloure's posting of updated terms on the Platform with reasonable notice.</li>
                <li><strong>13.5 Severability:</strong> If any provision of this Agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.</li>
                <li><strong>13.6 Assignment:</strong> You may not assign this Agreement without Traveloure's prior written consent. Traveloure may assign this Agreement to any successor entity.</li>
                <li><strong>13.7 Force Majeure:</strong> Neither party shall be liable for any failure to perform due to causes beyond their reasonable control, including natural disasters, government actions, or other force majeure events.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "performance-monitoring",
      title: "Performance Monitoring and Improvement",
      icon: <Star className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">14.1 Performance Metrics:</h4>
              <p className="text-blue-800 mb-3">Traveloure may monitor the following performance indicators:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Response time to Traveler inquiries</li>
                <li>Overall rating and review scores</li>
                <li>Booking completion rates</li>
                <li>Traveler satisfaction scores</li>
                <li>Platform engagement and activity levels</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">14.2 Performance Reviews:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Traveloure may conduct periodic performance reviews and provide feedback for improvement</li>
                <li>Consistently poor performance may result in account suspension or termination</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">14.3 Training and Support:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Traveloure may provide optional training resources, best practice guidelines, and support materials</li>
                <li>To help Travel Experts improve their service quality and Platform performance</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "contact-notices",
      title: "Contact and Notices",
      icon: <Mail className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">15.1 Travel Expert Contact Information:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Name: _________________________________</li>
                <li>Address: _______________________________</li>
                <li>Email: _________________________________</li>
                <li>Phone: ________________________________</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">15.2 Traveloure Contact Information:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>TRAVELOURE LLC</li>
                <li>[Address Line 1]</li>
                <li>[Address Line 2]</li>
                <li>[City, State ZIP Code]</li>
                <li>Email: experts@traveloure.com</li>
                <li>Legal Notices: legal@traveloure.com</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">15.3 Notice Requirements:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>All notices must be in writing and delivered via email or certified mail to the addresses listed above</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-a",
      title: "Exhibit A: Service Categories and Pricing Guidelines",
      icon: <Award className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">A.1 SERVICE CATEGORIES</h4>
            <div className="space-y-4 text-red-800">
              <div>
                <h5 className="font-semibold">Tier 1: Basic Advisory Services</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Destination recommendations and tips</li>
                  <li>Restaurant and attraction suggestions</li>
                  <li>General travel advice via messaging</li>
                  <li>Local insights and cultural guidance</li>
                  <li>Transportation recommendations</li>
                </ul>
                <p className="mt-2"><strong>Suggested Pricing Range:</strong> $25 - $75 per consultation</p>
                <p><strong>Duration:</strong> 30-60 minutes of communication/research</p>
              </div>
              
              <div>
                <h5 className="font-semibold">Tier 2: Custom Itinerary Planning</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Detailed day-by-day itinerary creation</li>
                  <li>Personalized recommendations based on traveler preferences</li>
                  <li>Budget-conscious or luxury planning options</li>
                  <li>Activity booking assistance and coordination</li>
                  <li>Restaurant reservation guidance</li>
                </ul>
                <p className="mt-2"><strong>Suggested Pricing Range:</strong> $75 - $200 per itinerary</p>
                <p><strong>Duration:</strong> 2-4 hours of planning and research</p>
              </div>
              
              <div>
                <h5 className="font-semibold">Tier 3: Comprehensive Travel Planning</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Multi-day detailed itinerary with contingency options</li>
                  <li>Accommodation selection and booking assistance</li>
                  <li>Transportation coordination and logistics</li>
                  <li>Special occasion planning (anniversaries, proposals, celebrations)</li>
                  <li>Group travel coordination and planning</li>
                </ul>
                <p className="mt-2"><strong>Suggested Pricing Range:</strong> $200 - $500 per comprehensive plan</p>
                <p><strong>Duration:</strong> 4-8 hours of planning and coordination</p>
              </div>
              
              <div>
                <h5 className="font-semibold">Tier 4: Live Travel Support</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Real-time assistance during travel</li>
                  <li>Meet-and-greet services at airports/stations</li>
                  <li>Guided walking tours or orientation sessions</li>
                  <li>Emergency support and problem-solving</li>
                  <li>Photography services and location guidance</li>
                </ul>
                <p className="mt-2"><strong>Suggested Pricing Range:</strong> $50 - $150 per hour</p>
                <p><strong>Minimum booking:</strong> 2 hours</p>
              </div>
              
              <div>
                <h5 className="font-semibold">Tier 5: Specialized Services</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Business travel and corporate event planning</li>
                  <li>Adventure and outdoor activity coordination</li>
                  <li>Cultural immersion and language support</li>
                  <li>Accessibility-focused travel planning</li>
                  <li>Luxury and VIP experience curation</li>
                </ul>
                <p className="mt-2"><strong>Suggested Pricing Range:</strong> $100 - $300 per hour or project-based</p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">A.2 PRICING GUIDELINES</h4>
            <div className="space-y-4 text-blue-800">
              <div>
                <h5 className="font-semibold">Geographic Pricing Considerations:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Major Metropolitan Areas: Premium pricing (top of range)</li>
                  <li>Popular Tourist Destinations: Standard pricing (mid-range)</li>
                  <li>Emerging/Off-the-beaten-path Destinations: Competitive pricing (lower range)</li>
                  <li>Remote/Hard-to-reach Areas: Premium pricing due to specialized knowledge</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Seasonal Adjustments:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Peak tourist seasons: 10-25% premium</li>
                  <li>Shoulder seasons: Standard pricing</li>
                  <li>Off-peak seasons: 10-15% discount to encourage bookings</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Experience-Based Pricing:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>New Travel Experts (0-6 months): Start at lower end of ranges</li>
                  <li>Established Experts (6+ months, 4.5+ rating): Mid to upper range</li>
                  <li>Premium Experts (12+ months, 4.8+ rating, verified credentials): Upper range to premium</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Add-On Services:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Rush service (&lt; 24 hours): +50% surcharge</li>
                  <li>Multiple destination planning: +$25-50 per additional destination</li>
                  <li>Group planning (5+ people): +25% base fee</li>
                  <li>Multilingual services: +15-25% premium</li>
                  <li>Photography package: +$50-100 per session</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">A.3 PAYMENT TERMS</h4>
            <div className="space-y-4 text-green-800">
              <div>
                <h5 className="font-semibold">Booking Deposits:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Services under $100: Full payment upfront</li>
                  <li>Services $100-$300: 50% deposit, 50% upon completion</li>
                  <li>Services over $300: 25% deposit, 75% upon completion</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Cancellation Policies (Recommended):</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>More than 48 hours: Full refund minus processing fees</li>
                  <li>24-48 hours: 50% refund</li>
                  <li>Less than 24 hours: No refund (except emergencies)</li>
                  <li>Travel Expert cancellation: Full refund plus 25% compensation</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Additional Expense Guidelines:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Transportation costs during service delivery may be charged separately</li>
                  <li>Entrance fees, meal costs during guided services are traveler responsibility</li>
                  <li>Communication costs (international calls/texts) may be charged separately</li>
                  <li>Any third-party booking fees should be disclosed upfront</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-b",
      title: "Exhibit B: Travel Expert Code of Conduct",
      icon: <BookOpen className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">B.1 PROFESSIONAL STANDARDS</h4>
            <div className="space-y-4 text-blue-800">
              <div>
                <h5 className="font-semibold">Communication Excellence:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Respond to all inquiries promptly and professionally</li>
                  <li>Use clear, helpful, and friendly language in all communications</li>
                  <li>Provide detailed explanations and reasoning for recommendations</li>
                  <li>Ask clarifying questions to better understand traveler needs</li>
                  <li>Maintain patience and understanding with travelers of all experience levels</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Cultural Sensitivity:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Respect and celebrate local cultures and traditions</li>
                  <li>Provide culturally appropriate recommendations and guidance</li>
                  <li>Avoid stereotypes or generalizations about destinations or peoples</li>
                  <li>Help travelers understand and respect local customs and etiquette</li>
                  <li>Promote sustainable and responsible tourism practices</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Accuracy and Honesty:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Provide only accurate, up-to-date information based on personal knowledge or verified sources</li>
                  <li>Clearly distinguish between personal recommendations and general information</li>
                  <li>Admit when you don't know something and offer to research or refer to other experts</li>
                  <li>Disclose any personal relationships with recommended businesses (friends, family, partnerships)</li>
                  <li>Update recommendations when circumstances change (closures, renovations, etc.)</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">B.2 TRAVELER INTERACTION GUIDELINES</h4>
            <div className="space-y-4 text-green-800">
              <div>
                <h5 className="font-semibold">Respect and Inclusion:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Treat all travelers with equal respect regardless of background, budget, or travel experience</li>
                  <li>Accommodate diverse needs including dietary restrictions, accessibility requirements, and cultural preferences</li>
                  <li>Maintain patience with travelers who may have different communication styles or expectations</li>
                  <li>Respect privacy and confidentiality of traveler information and travel plans</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Boundary Management:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Maintain professional boundaries in all interactions</li>
                  <li>Avoid sharing excessive personal information or engaging in inappropriate topics</li>
                  <li>Decline requests for services outside your expertise or comfort zone</li>
                  <li>Refer travelers to other specialists when their needs exceed your capabilities</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Safety and Responsibility:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Prioritize traveler safety in all recommendations</li>
                  <li>Provide current safety information and warnings when relevant</li>
                  <li>Recommend appropriate travel insurance and safety precautions</li>
                  <li>Never recommend illegal activities or unsafe practices</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">B.3 PLATFORM INTEGRITY</h4>
            <div className="space-y-4 text-purple-800">
              <div>
                <h5 className="font-semibold">Review System Integrity:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Never offer incentives, payments, or favors in exchange for positive reviews</li>
                  <li>Respond professionally to negative reviews with specific improvements or clarifications</li>
                  <li>Do not create fake accounts or ask friends/family to leave artificial reviews</li>
                  <li>Report suspected review manipulation by other Travel Experts</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Fair Competition:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Compete based on service quality and expertise, not by undermining other Travel Experts</li>
                  <li>Do not disparage other Travel Experts in communications with travelers</li>
                  <li>Refer travelers to other specialists when appropriate, even if they are competitors</li>
                  <li>Share general knowledge and support fellow Travel Experts when possible</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Platform Compliance:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Follow all Platform policies and procedures</li>
                  <li>Report technical issues, policy violations, or safety concerns promptly</li>
                  <li>Participate in Platform training and improvement initiatives</li>
                  <li>Provide feedback to help improve Platform functionality and user experience</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
            <h4 className="font-semibold text-orange-900 mb-2">B.4 BUSINESS ETHICS</h4>
            <div className="space-y-4 text-orange-800">
              <div>
                <h5 className="font-semibold">Transparent Recommendations:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Base recommendations on traveler needs, not personal financial gain</li>
                  <li>Disclose any financial relationships with recommended businesses</li>
                  <li>Avoid recommending businesses solely because they offer kickbacks or commissions</li>
                  <li>Provide multiple options when possible to give travelers choice</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Conflict of Interest Management:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Disclose ownership or financial interest in any recommended businesses</li>
                  <li>Avoid steering travelers to businesses owned by friends or family without disclosure</li>
                  <li>Maintain objectivity in recommendations even when personal relationships exist</li>
                  <li>Recuse yourself from recommendations where you cannot be objective</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Intellectual Property Respect:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Respect copyrights and trademarks in all content creation</li>
                  <li>Credit sources when using information from guidebooks, websites, or other Travel Experts</li>
                  <li>Create original content rather than copying from other sources</li>
                  <li>Respect traveler-created content and obtain permission before sharing photos or stories</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">B.5 CONTINUOUS IMPROVEMENT</h4>
            <div className="space-y-4 text-red-800">
              <div>
                <h5 className="font-semibold">Knowledge Development:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Stay current with changes in your local area (new openings, closures, events)</li>
                  <li>Continuously educate yourself about travel trends and best practices</li>
                  <li>Seek feedback from travelers and use it to improve your services</li>
                  <li>Attend relevant training sessions and professional development opportunities</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Service Quality:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Regularly review and update your profile and service offerings</li>
                  <li>Monitor your performance metrics and work to improve areas of weakness</li>
                  <li>Seek mentorship or guidance when facing challenges</li>
                  <li>Maintain high standards even during busy periods</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Community Contribution:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Share general knowledge and tips that benefit the broader travel community</li>
                  <li>Participate in Platform forums and knowledge-sharing initiatives</li>
                  <li>Mentor new Travel Experts when possible</li>
                  <li>Contribute to the positive reputation of the Traveloure community</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "exhibit-c",
      title: "Exhibit C: Background Check and Verification Requirements",
      icon: <Shield className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">C.1 INITIAL VERIFICATION REQUIREMENTS</h4>
            <div className="space-y-4 text-blue-800">
              <div>
                <h5 className="font-semibold">Identity Verification:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Government-issued photo identification (driver's license, passport, or national ID)</li>
                  <li>Proof of current address (utility bill, bank statement, or lease agreement dated within 60 days)</li>
                  <li>Social Security Number (for US-based Travel Experts) or equivalent tax identification</li>
                  <li>Professional headshot photograph for profile use</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Professional Qualifications:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Detailed resume or CV highlighting travel and hospitality experience</li>
                  <li>Professional references (minimum 2, preferably from travel/hospitality industry)</li>
                  <li>Educational credentials related to travel, hospitality, languages, or relevant fields</li>
                  <li>Professional certifications (travel agent, tour guide, hospitality management, etc.)</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Local Expertise Documentation:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Proof of residence or extensive experience in claimed expertise areas</li>
                  <li>Documentation of local knowledge (photos, testimonials, portfolio of previous work)</li>
                  <li>Language proficiency certificates (if claiming multilingual services)</li>
                  <li>Local business licenses (if required for travel services in your jurisdiction)</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
            <h4 className="font-semibold text-green-900 mb-2">C.2 BACKGROUND CHECK PROCEDURES</h4>
            <div className="space-y-4 text-green-800">
              <div>
                <h5 className="font-semibold">Criminal Background Check:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Scope: Federal, state, and local criminal records search</li>
                  <li>Timeframe: Minimum 7 years (or maximum allowed by local law)</li>
                  <li><strong>Disqualifying Offenses:</strong></li>
                  <li className="ml-8">• Felony convictions involving violence, fraud, theft, or sexual offenses</li>
                  <li className="ml-8">• Convictions for crimes involving minors</li>
                  <li className="ml-8">• Convictions for drug trafficking or serious drug-related offenses</li>
                  <li className="ml-8">• Convictions for identity theft or financial fraud</li>
                  <li className="ml-8">• Any conviction that would prevent legal operation as a travel service provider</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Identity and Address Verification:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Social Security Number verification and validation</li>
                  <li>Address history verification for past 5 years</li>
                  <li>Cross-reference with national databases to confirm identity</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Professional Reference Checks:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Contact with provided professional references</li>
                  <li>Verification of previous travel/hospitality experience</li>
                  <li>Assessment of character and work quality from reference providers</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
            <h4 className="font-semibold text-purple-900 mb-2">C.3 ONGOING VERIFICATION REQUIREMENTS</h4>
            <div className="space-y-4 text-purple-800">
              <div>
                <h5 className="font-semibold">Annual Re-verification:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Updated criminal background check (annually)</li>
                  <li>Confirmation of continued residence/expertise in claimed areas</li>
                  <li>Professional reference check (every 2 years)</li>
                  <li>Updated professional credentials and certifications</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Triggered Re-verification:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Following any reported safety incidents or traveler complaints</li>
                  <li>If quality ratings fall below acceptable standards</li>
                  <li>Upon suspicion of policy violations or fraudulent activity</li>
                  <li>When expanding to new geographic expertise areas</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Continuous Monitoring:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Monthly review of traveler feedback and ratings</li>
                  <li>Monitoring of platform activity for policy compliance</li>
                  <li>Review of any reported incidents or disputes</li>
                  <li>Assessment of continued service quality and professionalism</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
            <h4 className="font-semibold text-orange-900 mb-2">C.4 INTERNATIONAL TRAVEL EXPERTS</h4>
            <div className="space-y-4 text-orange-800">
              <div>
                <h5 className="font-semibold">Additional Requirements for Non-US Experts:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Passport verification and visa status (if applicable)</li>
                  <li>International criminal background check (where available)</li>
                  <li>Local character references and professional verification</li>
                  <li>Compliance with local laws regarding provision of travel services</li>
                  <li>Banking verification for international payment processing</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Documentation Translation:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>All foreign language documents must be translated to English by certified translators</li>
                  <li>Original language documents must be provided alongside translations</li>
                  <li>Translator certification and credentials must be verified</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">C.5 SPECIALIZED VERIFICATION</h4>
            <div className="space-y-4 text-red-800">
              <div>
                <h5 className="font-semibold">Adventure/Outdoor Activity Specialists:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Relevant safety certifications (first aid, CPR, wilderness training)</li>
                  <li>Insurance verification for high-risk activity guidance</li>
                  <li>Professional credentials for specialized activities (climbing, diving, etc.)</li>
                  <li>Safety record and incident history review</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Luxury Travel Specialists:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Verification of relationships with high-end service providers</li>
                  <li>Professional training in luxury hospitality standards</li>
                  <li>References from previous high-end clientele (with permission)</li>
                  <li>Financial background check for handling expensive bookings</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Cultural/Historical Specialists:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Educational credentials in relevant fields (history, anthropology, cultural studies)</li>
                  <li>Professional certifications (licensed tour guide, museum education, etc.)</li>
                  <li>Publications or recognized expertise in cultural/historical topics</li>
                  <li>Verification of institutional affiliations (museums, cultural centers, universities)</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <h4 className="font-semibold text-yellow-900 mb-2">C.6 VERIFICATION TIMELINE AND PROCESS</h4>
            <div className="space-y-4 text-yellow-800">
              <div>
                <h5 className="font-semibold">Application Review Process:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Initial Application: 24-48 hours for completeness review</li>
                  <li>Document Verification: 3-5 business days</li>
                  <li>Background Check: 5-10 business days</li>
                  <li>Reference Checks: 2-3 business days</li>
                  <li>Final Review and Approval: 1-2 business days</li>
                  <li><strong>Total Timeline:</strong> 2-3 weeks from complete application submission to final approval</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Expedited Process:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Available for exceptional candidates with premium credentials</li>
                  <li>Additional fee may apply for expedited background checks</li>
                  <li>Timeline reduced to 5-7 business days</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Provisional Approval:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Limited platform access may be granted pending final verification completion</li>
                  <li>Restricted to lower-risk service categories</li>
                  <li>Full access granted upon complete verification</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-400">
            <h4 className="font-semibold text-indigo-900 mb-2">C.7 VERIFICATION MAINTENANCE</h4>
            <div className="space-y-4 text-indigo-800">
              <div>
                <h5 className="font-semibold">Documentation Management:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>All verification documents stored securely with encryption</li>
                  <li>Access limited to authorized personnel only</li>
                  <li>Regular review and update of stored information</li>
                  <li>Compliance with data retention and privacy regulations</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Appeal Process:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Clear procedures for appealing verification decisions</li>
                  <li>Independent review of disputed background check results</li>
                  <li>Opportunity to provide additional documentation or clarification</li>
                  <li>Fair and timely resolution of verification disputes</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-semibold">Compliance Monitoring:</h5>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Regular audits of verification procedures</li>
                  <li>Updates to requirements based on legal changes</li>
                  <li>Continuous improvement of verification processes</li>
                  <li>Training for staff conducting verification reviews</li>
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
            <Compass className="h-10 w-10 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Travel Expert Terms</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
            Travel Expert/Local Expert Service Agreement
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
                    For questions about becoming a Travel Expert, please contact us:
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <h4 className="font-semibold text-gray-900">Travel Expert Inquiries</h4>
                      </div>
                      <p className="text-blue-600 text-sm">experts@traveloure.com</p>
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