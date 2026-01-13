"use client"

import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { ArrowLeft, Shield, Mail, Users, Globe, FileText, Calendar, UserCheck, Database, Eye, Lock, Settings, Key, Bell, AlertTriangle, Scale, Handshake, CreditCard, MapPin, MessageSquare, Phone, Menu, X } from "lucide-react"
import { useRouter } from "next/navigation"

export default function TermsConditionsPage() {
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
      title: "Agreement Between User and TRAVELOURE.COM",
      icon: <Handshake className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            The TRAVELOURE website, www.traveloure-beta.com, (the "Site") is comprised of various web pages operated by TRAVELOURE LLC ("TRAVELOURE," "Company," "we," "us," or "our"). The Site is a travel platform that connects travelers with Travel Experts and Local Experts (collectively referred to as "Travel Experts," "Local Experts," or "Experts") who provide personalized travel recommendations, itineraries, and insider knowledge to enhance travel experiences (the "Services").
          </p>
          <p>
            This Agreement sets forth the legally binding agreement between you as the user(s) of the Site (hereinafter referred to as "you," "your," or "User") and Company. The Site is offered to you conditioned on your acceptance without modification of the terms, conditions, and notices contained in this Agreement (the "Terms"). Each time by viewing, using, accessing, browsing, or submitting any content or material on the Site, including the webpages contained or hyperlinked therein and owned or controlled by the Site and its Services, whether through the Site itself or through such other media or media channels, devices, software, or technologies as the Site may choose from time to time, you are agreeing to abide by these Terms, as amended from time to time with or without your notice. If you do not agree to these Terms, please do not use the Site or book any Services through the Site.
          </p>
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <p className="text-red-900 font-semibold">
              <strong>IMPORTANT:</strong> PLEASE READ THESE TERMS AND CONDITIONS CAREFULLY. THESE TERMS AND CONDITIONS SHALL BE BINDING UPON USERS OF THE TRAVELOURE.COM WEBSITE AND ITS SERVICES.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "privacy",
      title: "Privacy",
      icon: <Shield className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            Your use of the Site is subject to Company's Privacy Policy. Please review our Privacy Policy, which also governs the Site and informs users of our data collection practices. The Privacy Policy and additional provisions in these Terms govern the use of your personal data and use of cookies.
          </p>
          <p>
            Company will also process your personal data to:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Match you with appropriate Travel Experts/Local Experts</li>
            <li>Facilitate communication between travelers and Travel Experts/Local Experts</li>
            <li>Process payments for travel services</li>
            <li>Provide customer service and support</li>
            <li>Send notifications about bookings, matches, and platform updates</li>
            <li>Use your personal data for marketing purposes in accordance with applicable laws</li>
          </ul>
          <p>
            You can read more about the processing of your personal data by Company in its Privacy Policy.
          </p>
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <p className="text-yellow-900">
              <strong>Age Restriction:</strong> Company does not knowingly collect, either online or offline, personal information from persons under the age of 18. If you are under 18, you may not use www.traveloure-beta.com.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "electronic-communications",
      title: "Electronic Communications",
      icon: <MessageSquare className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            You agree to receive communications from Site in electronic form. Such electronic communications may include, but will not be limited to:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Travel Expert/Local Expert matches and recommendations</li>
            <li>Booking confirmations and travel itineraries</li>
            <li>Messages from Travel Experts/Local Experts</li>
            <li>Payment confirmations and receipts</li>
            <li>Platform updates and new feature announcements</li>
            <li>Marketing communications about travel opportunities</li>
            <li>Any and all agreements, notices, disclosures and other communications that various laws or regulations require that we provide to you</li>
          </ul>
          <p>
            You accept that the electronic documents, files and associated records provided via your account with Site are reasonable and proper notice for the purpose of any and all laws, rules, and regulations, and you acknowledge and agree that such electronic form fully satisfies any requirement that such communications be provided to you in writing or in a form that you may keep. We reserve the right to require ink signatures on hard copy documents from the related parties, at any time.
          </p>
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Electronic Signature Consent:</h4>
            <p className="text-blue-800">
              You agree that your "Electronic Signature" is the legal equivalent of your manual signature for this Agreement, thereby indicating your consent to do business electronically.
            </p>
            <p className="text-blue-800 mt-2">
              By clicking on the applicable button in the Site, or by signing up you will be deemed to have executed these Terms electronically via your Electronic Signature with Company; effective on the date you first click to accept these Terms.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "user-responsibility",
      title: "User Responsibility",
      icon: <AlertTriangle className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            You and your Users are solely responsible for all of the transactions conducted on, through or as a result of use of the Site or Services. You agree that the use of the Site and/or the Services is subject to all applicable local, state and federal laws and regulations.
          </p>
          
          <div className="space-y-4">
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <h4 className="font-semibold text-red-900 mb-2">General Prohibitions:</h4>
              <ul className="list-disc list-inside space-y-1 text-red-800">
                <li>Not to access the Site or Services using a third-party's account/registration information</li>
                <li>Not to use the Site for illegal purposes</li>
                <li>Not to commit any acts of infringement through the Services or with respect to content on the Site</li>
                <li>Not to copy any content for republication in print or online</li>
                <li>Not to create reviews or blog entries for or with any purpose or intent that does not in good faith comport with the purpose or spirit of the Site</li>
                <li>Not to attempt to gain unauthorized access to other computer systems from or through the Services</li>
                <li>Not to interfere with another person's use and enjoyment of the Services or use and enjoyment of the Site</li>
                <li>Not to upload or transmit viruses or other harmful, disruptive or destructive files</li>
                <li>Not to disrupt, interfere with, or otherwise harm or violate the security of the Service, or any services, system restores, accounts, passwords, servers or networks connected to or accessible through the Service or the Site</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
              <h4 className="font-semibold text-orange-900 mb-2">Platform-Specific Prohibitions:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>Not to use the Services in any way or take any action that causes, or may cause, damage to the Site or impairment of the performance, availability or accessibility of the Services</li>
                <li>Not to use the Services in any way that is unlawful, illegal, fraudulent or harmful, or in connection with any unlawful, illegal, fraudulent or harmful purpose or activity</li>
                <li>Not to use the Services to copy, store, host, transmit, send, use, publish or distribute any material which consists of (or is linked to) any spyware, computer virus, Trojan horse, worm, keystroke logger, rootkit or other malicious computer software</li>
                <li>Not to conduct any systematic or automated data collection activities (including without limitation scraping, data mining, data extraction and data harvesting) on or in relation to the Service without our express written consent</li>
                <li>Not to access or otherwise interact with the Service or Site using any robot, spider or other automated means</li>
                <li>Not to violate the directives set out in the robots.txt file for the Site</li>
                <li>Not to use data collected from the Site for any direct marketing activity (including without limitation email marketing, SMS marketing, telemarketing and direct mailing)</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
              <h4 className="font-semibold text-purple-900 mb-2">Travel Platform-Specific Prohibitions:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Not to contact Travel Experts/Local Experts outside of the platform to circumvent platform fees or policies</li>
                <li>Not to share false travel information, fake reviews, or misleading destination recommendations</li>
                <li>Not to impersonate a Travel Expert/Local Expert or misrepresent your qualifications or local expertise</li>
                <li>Not to book services with Travel Experts/Local Experts with no intention of following through (no-show bookings)</li>
                <li>Not to use the platform to promote competing travel services or platforms</li>
                <li>Not to collect or misuse personal information of travelers or Travel Experts/Local Experts for purposes outside the intended travel services</li>
                <li>Not to infringe these Terms or allow, encourage or facilitate others to do the same</li>
                <li>Not to plagiarize and/or infringe the intellectual property rights or privacy rights of any third party</li>
                <li>Not to disturb the normal flow of Services provided within the Site</li>
                <li>Not to create a link from the Site to another website or document without Company's prior written consent</li>
                <li>Not to obscure or edit any copyright, trademark or other proprietary rights notice or mark appearing on the Site</li>
                <li>Not to create copies or derivative works of the Site or any part thereof</li>
                <li>Not to reverse engineer, decompile or extract the Site's source code</li>
                <li>Not to remit or otherwise make or cause to deliver unsolicited advertising, email spam or other chain letters</li>
                <li>Not to collect, receive, transfer or disseminate any personally identifiable information of any person without consent from title holder</li>
                <li>Not to pretend to be or misrepresent any affiliation with any legal entity or third party</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <p className="text-red-900 font-semibold">
              <strong>Consequences:</strong> You also acknowledge and accept that any violation of the aforementioned provisions may result in the immediate termination of your access to the Site and use of our Services, without refund, reimbursement, or any other credit on our part. Access to the Site may be terminated or suspended without prior notice from or liability of Company.
            </p>
          </div>
        </div>
      )
    },
    {
      id: "travel-expert-terms",
      title: "Travel Expert/Local Expert Specific Terms",
      icon: <Users className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            For Users Applying to be Travel Experts/Local Experts:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Application and Verification:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>You must provide accurate information about your local expertise, qualifications, and experience</li>
                <li>You agree to verification of your credentials and background where applicable</li>
                <li>You represent that you have the legal right to provide travel services in your jurisdiction</li>
                <li>You must disclose any conflicts of interest with travel vendors or competitors</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Service Standards:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>You agree to provide accurate, up-to-date, and helpful travel information and recommendations</li>
                <li>You must respond to traveler inquiries in a timely and professional manner</li>
                <li>You agree to honor confirmed bookings and arrangements made through the platform</li>
                <li>You will maintain appropriate insurance and legal compliance for your services where required</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Compensation and Payments:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Payment terms and commission structures will be outlined in separate Travel Expert/Local Expert agreements</li>
                <li>You are responsible for any applicable taxes on income earned through the platform</li>
                <li>You agree to platform fee structures and payment processing procedures</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">Professional Conduct:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>You must maintain professional standards in all communications and interactions</li>
                <li>You agree not to discriminate against travelers based on protected characteristics</li>
                <li>You will respect traveler privacy and confidentiality</li>
                <li>You must not solicit travelers to use services outside the platform to avoid fees</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "your-account",
      title: "Your Account",
      icon: <UserCheck className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Account Registration:</h4>
            <p className="text-blue-800 mb-3">
              In order to use some or all of the functionalities and Services provided through the Site, you will be required to register an account with the Site. At the time of registration, you will be asked to complete a registration form which will require you to provide information such as:
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Your name, email address, and contact information</li>
              <li>Travel preferences and interests (for travelers)</li>
              <li>Local expertise and qualifications (for Travel Experts/Local Experts)</li>
              <li>Profile photos and portfolio (for Travel Experts/Local Experts)</li>
              <li>Other personal information relevant to travel services</li>
            </ul>
            <p className="text-blue-800 mt-3">
              Upon verification of details of the User who has applied for Site access, we may or may not grant an account.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-2">Account Types:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li><strong>Traveler Accounts:</strong> For users seeking travel recommendations and services</li>
                <li><strong>Travel Expert/Local Expert Accounts:</strong> For users providing travel expertise and services</li>
                <li><strong>Dual Accounts:</strong> Users may maintain both traveler and Travel Expert/Local Expert functionality</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-2">Account Responsibilities:</h4>
              <p className="text-purple-800 text-sm">
                You represent, warrant and covenant that: (i) you have full power and authority to accept these Terms, to grant any license and authorization and to perform any of your obligations hereunder; (ii) you will use the Site and Services for legitimate travel purposes only; (iii) the address you provide when registering is accurate and current; (iv) for Travel Expert/Local Expert accounts, you possess the local knowledge and expertise claimed in your profile.
              </p>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-2">Account Security:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>You must not allow any other person to use your account to access the Site</li>
                <li>You must notify us in writing immediately if you become aware of any unauthorized use of your account</li>
                <li>You must not use any other person's account to access the Site</li>
                <li>A User may not create more than one (1) account per account type on the Site without express permission</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "travel-services",
      title: "Travel Services and Bookings",
      icon: <MapPin className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Platform Role:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Traveloure acts as a platform connecting travelers with Travel Experts/Local Experts</li>
                <li>We are not a travel agency and do not directly provide travel services</li>
                <li>Travel arrangements are made between travelers and Travel Experts/Local Experts</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Booking and Payment:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Booking confirmations are subject to Travel Expert/Local Expert availability</li>
                <li>Payment processing is handled through secure third-party processors</li>
                <li>Cancellation and refund policies are set by individual Travel Experts/Local Experts</li>
                <li>Platform fees may apply to transactions</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Service Delivery:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Travel Experts/Local Experts are responsible for delivering services as described</li>
                <li>Travelers are responsible for providing accurate information about their needs and preferences</li>
                <li>Both parties must communicate changes or issues promptly through the platform</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-3">Travel Insurance and Liability:</h4>
              <ul className="list-disc list-inside space-y-1 text-orange-800">
                <li>We strongly recommend that travelers obtain appropriate travel insurance</li>
                <li>Travel Experts/Local Experts should maintain appropriate professional liability insurance</li>
                <li>Platform liability is limited as described in the Liability Disclaimer section</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "payment-terms",
      title: "Payment Terms and Pricing",
      icon: <CreditCard className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3">Pricing and Fees:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Travel Expert/Local Expert service prices are set by individual experts</li>
                <li>Platform fees and commission structures are disclosed during booking</li>
                <li>All prices are subject to change without notice</li>
                <li>Currency conversion fees may apply for international transactions</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Payment Processing:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Payments are processed through secure third-party payment processors</li>
                <li>Payment methods may include credit cards, debit cards, and digital payment platforms</li>
                <li>Payment confirmation is required before service delivery begins</li>
              </ul>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 mb-3">Refunds and Cancellations:</h4>
              <ul className="list-disc list-inside space-y-1 text-purple-800">
                <li>Refund policies are determined by individual Travel Experts/Local Experts</li>
                <li>Platform fees may be non-refundable depending on circumstances</li>
                <li>Cancellation policies vary by Travel Expert/Local Expert and service type</li>
                <li>Disputes should be reported through the platform's resolution process</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "liability-disclaimer",
      title: "Liability Disclaimer",
      icon: <Scale className="h-5 w-5" />,
      content: (
        <div className="space-y-6 text-gray-700 leading-relaxed">
          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
            <h4 className="font-semibold text-red-900 mb-2">General Disclaimer:</h4>
            <p className="text-red-800">
              THE INFORMATION, SOFTWARE, PRODUCTS, AND SERVICES INCLUDED IN OR AVAILABLE THROUGH THE SITE MAY INCLUDE INACCURACIES OR TYPOGRAPHICAL ERRORS. CHANGES ARE PERIODICALLY ADDED TO THE INFORMATION HEREIN. COMPANY AND/OR ITS SUPPLIERS MAY MAKE IMPROVEMENTS AND/OR CHANGES IN THE SITE AT ANY TIME.
            </p>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg border-l-4 border-orange-400">
            <h4 className="font-semibold text-orange-900 mb-2">Travel-Specific Disclaimers:</h4>
            <ul className="list-disc list-inside space-y-1 text-orange-800">
              <li>WE DO NOT GUARANTEE THE ACCURACY OF TRAVEL INFORMATION, RECOMMENDATIONS, OR ITINERARIES PROVIDED BY TRAVEL EXPERTS/LOCAL EXPERTS</li>
              <li>WE ARE NOT RESPONSIBLE FOR TRAVEL DELAYS, CANCELLATIONS, OR CHANGES TO TRAVEL PLANS</li>
              <li>WE DO NOT GUARANTEE THE AVAILABILITY OR QUALITY OF ACCOMMODATIONS, TRANSPORTATION, OR ACTIVITIES</li>
              <li>WEATHER CONDITIONS, NATURAL DISASTERS, AND OTHER FORCE MAJEURE EVENTS ARE BEYOND OUR CONTROL</li>
              <li>TRAVEL EXPERTS/LOCAL EXPERTS ARE INDEPENDENT CONTRACTORS, NOT EMPLOYEES OF TRAVELOURE</li>
            </ul>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
            <h4 className="font-semibold text-yellow-900 mb-2">Limitation of Liability:</h4>
            <p className="text-yellow-900">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL COMPANY AND/OR ITS SUPPLIERS BE LIABLE FOR ANY DIRECT, INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER INCLUDING, WITHOUT LIMITATION:
            </p>
            <ul className="list-disc list-inside space-y-1 text-yellow-900 mt-2">
              <li>DAMAGES FOR LOSS OF USE, DATA OR PROFITS ARISING FROM TRAVEL SERVICES</li>
              <li>DAMAGES FROM MISSED FLIGHTS, ACCOMMODATIONS, OR TRAVEL CONNECTIONS</li>
              <li>DAMAGES FROM TRAVEL DELAYS, CANCELLATIONS, OR DISRUPTIONS</li>
              <li>DAMAGES FROM PERSONAL INJURY OR PROPERTY DAMAGE DURING TRAVEL</li>
              <li>DAMAGES FROM THEFT, LOSS, OR DAMAGE TO PERSONAL BELONGINGS WHILE TRAVELING</li>
            </ul>
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
              <h4 className="font-semibold text-blue-900 mb-3">Travel-Related Disputes:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Disputes between travelers and Travel Experts/Local Experts should first be addressed through direct communication</li>
                <li>Unresolved disputes may be escalated to platform mediation services</li>
                <li>Platform mediation decisions are final and binding</li>
                <li>Users may pursue legal remedies after exhausting platform resolution processes</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-3">Platform Disputes:</h4>
              <ul className="list-disc list-inside space-y-1 text-green-800">
                <li>Disputes with the platform regarding fees, account issues, or service provision are subject to binding arbitration</li>
                <li>Arbitration shall be conducted in Miami-Dade County, Florida</li>
                <li>Users waive the right to class action lawsuits against the platform</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "changes-to-terms",
      title: "Changes to Terms",
      icon: <FileText className="h-5 w-5" />,
      content: (
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            Company hereby reserves the right to update, modify, change, amend, terminate or discontinue the Site, the Services, the Terms and/or the Privacy Policy, at any time and at its sole and final discretion. Company may change the Site's functionalities and (any) applicable fees at any time.
          </p>
          
          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
            <h4 className="font-semibold text-blue-900 mb-2">Travel Industry Updates:</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Changes may be made to accommodate new travel regulations, safety requirements, or industry standards</li>
              <li>Travel Expert/Local Expert policies may be updated based on platform performance and user feedback</li>
              <li>Payment processing and fee structures may change with advance notice</li>
            </ul>
          </div>
          
          <p>
            Any changes to these Terms will be posted to the Site, and we may notify you through the Site or by email. Your use of our Services after the effective date of any update– either by an account registration or simple use – thereby indicates your acceptance thereof.
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
            <Scale className="h-10 w-10 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Terms & Conditions</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-2">
            Terms of Use for TRAVELOURE.COM
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
            <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setSidebarOpen(false)} />
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
                    For questions or comments regarding these Terms, please contact us:
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
                        <h4 className="font-semibold text-gray-900">Travel Expert Inquiries</h4>
                      </div>
                      <p className="text-green-600 text-sm">experts@traveloure.com</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-purple-600" />
                        <h4 className="font-semibold text-gray-900">Privacy Concerns</h4>
                      </div>
                      <p className="text-purple-600 text-sm">Admin@traveloure.com</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                    <p className="text-yellow-900 text-sm">
                      <strong>Effective Date:</strong> These Terms are effective as of {new Date().toLocaleDateString('en-US', { 
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