import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import {
  Globe,
  FileText,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Star,
  MapPin,
  Loader2,
  Shield,
  BookOpen,
} from "lucide-react";
import { SEOHead } from "@/components/seo-head";
import { motion } from "framer-motion";

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize",
  "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Estonia", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala",
  "Guinea", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia",
  "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco",
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saudi Arabia", "Senegal", "Serbia", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

type VisaRequirements = {
  visaRequired: boolean;
  visaTypes: string[];
  requiredDocuments: string[];
  processingTime: string | null;
  feeRange: string | null;
  disclaimer: string | null;
  fromCache?: boolean;
};

type Service = {
  id: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  price: string;
  averageRating: string;
  reviewCount: number;
  location: string;
  deliveryMethod: string;
  serviceImage: string | null;
  providerName: string;
  providerAvatar: string | null;
};

type DiscoverResult = {
  services: Service[];
  total: number;
};

export default function VisaHelpPage() {
  const [passportCountry, setPassportCountry] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [result, setResult] = useState<VisaRequirements | null>(null);

  const requirementsMutation = useMutation<VisaRequirements, Error, { passportCountry: string; destinationCountry: string }>({
    mutationFn: async (data: { passportCountry: string; destinationCountry: string }) => {
      const res = await apiRequest("POST", "/api/visa/requirements", data);
      return res.json() as Promise<VisaRequirements>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const { data: expertsData, isLoading: expertsLoading } = useQuery<DiscoverResult>({
    queryKey: ["/api/visa/experts"],
    queryFn: async () => {
      const res = await fetch("/api/visa/experts?limit=6");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleLookup = () => {
    if (!passportCountry || !destinationCountry) return;
    requirementsMutation.mutate({ passportCountry, destinationCountry });
  };

  const iVisakUrl = destinationCountry
    ? `https://www.ivisa.com/apply?country=${encodeURIComponent(destinationCountry)}&ref=traveloure`
    : "https://www.ivisa.com/?ref=traveloure";

  return (
    <>
      <SEOHead
        title="Visa Help - Requirements & Expert Assistance | Traveloure"
        description="Look up visa requirements for your destination instantly with AI, then book a certified visa expert to handle your application."
      />

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#FF385C]/10 via-orange-50 to-blue-50 dark:from-[#FF385C]/20 dark:via-gray-900 dark:to-gray-900 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF385C]/10 text-[#FF385C] text-sm font-medium">
            <Shield className="w-4 h-4" />
            AI-Powered Visa Requirements
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Visa Help &amp; Expert Guidance
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Instantly look up visa requirements for any country, then connect with a certified visa expert for hands-on help.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">

        {/* Lookup Form */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Globe className="w-5 h-5 text-[#FF385C]" />
              Visa Requirements Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Your Passport (Nationality)
                </label>
                <Select value={passportCountry} onValueChange={setPassportCountry}>
                  <SelectTrigger data-testid="select-passport-country">
                    <SelectValue placeholder="Select your passport country…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Destination Country
                </label>
                <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                  <SelectTrigger data-testid="select-destination-country">
                    <SelectValue placeholder="Select destination country…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleLookup}
              disabled={!passportCountry || !destinationCountry || requirementsMutation.isPending}
              className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90 text-white"
              data-testid="button-lookup-visa"
            >
              {requirementsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up requirements…
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Check Visa Requirements
                </>
              )}
            </Button>

            {requirementsMutation.isError && (
              <p className="text-sm text-red-500 text-center">
                Failed to fetch requirements. Please try again.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Visa Required Badge */}
            <div className="flex items-center gap-3">
              {result.visaRequired ? (
                <Badge className="flex items-center gap-1.5 px-4 py-2 text-base bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                  <XCircle className="w-4 h-4" />
                  Visa Required
                </Badge>
              ) : (
                <Badge className="flex items-center gap-1.5 px-4 py-2 text-base bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                  <CheckCircle className="w-4 h-4" />
                  No Visa Required
                </Badge>
              )}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {passportCountry} passport → {destinationCountry}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Visa Types */}
              {result.visaTypes && result.visaTypes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#FF385C]" />
                      Visa Types Available
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(result.visaTypes as string[]).map((type, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {type}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Processing Time & Fees */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#FF385C]" />
                    Timing &amp; Fees
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.processingTime && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Processing Time</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{result.processingTime}</p>
                      </div>
                    </div>
                  )}
                  {result.feeRange && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Fee Range</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{result.feeRange}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Required Documents */}
            {result.requiredDocuments && (result.requiredDocuments as string[]).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#FF385C]" />
                    Required Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(result.requiredDocuments as string[]).map((doc, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-[#FF385C] flex-shrink-0 mt-0.5" />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Disclaimer */}
            {result.disclaimer && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">{result.disclaimer}</p>
              </div>
            )}

            {/* iVisa CTA */}
            <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
              <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-lg">Ready to apply?</p>
                  <p className="text-blue-100 text-sm">Start your {destinationCountry} visa application with our partner iVisa</p>
                </div>
                <a
                  href={iVisakUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-ivisa-apply"
                >
                  <Button className="bg-white text-blue-700 hover:bg-blue-50 font-semibold whitespace-nowrap">
                    Apply Now on iVisa
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Visa Experts Grid */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Visa Assistance Experts</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Connect with a certified expert who can handle your entire visa process.
            </p>
          </div>

          {expertsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          ) : expertsData?.services && expertsData.services.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {expertsData.services.map((service) => (
                <VisaExpertCard key={service.id} service={service} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
              <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No visa experts listed yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Check back soon — we're onboarding certified visa specialists.
              </p>
              <Link href="/discover?category=visa-assistance">
                <Button variant="outline" className="mt-4" data-testid="button-browse-experts">
                  Browse All Services
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">How Visa Assistance Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Look up requirements", desc: "Enter your passport and destination above. Our AI surfaces all requirements in seconds.", icon: Globe },
              { step: "2", title: "Book an expert", desc: "Select a certified visa specialist below. They handle document prep, form filling, and embassy appointments.", icon: Shield },
              { step: "3", title: "Travel confidently", desc: "Your expert keeps you updated until your visa is approved and you're ready to go.", icon: CheckCircle },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-[#FF385C] text-white flex items-center justify-center font-bold flex-shrink-0">
                  {step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function VisaExpertCard({ service }: { service: Service }) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const name = service.providerName || "Visa Specialist";
  const avatar = service.providerAvatar || service.serviceImage || null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-all h-full flex flex-col" data-testid={`card-visa-expert-${service.id}`}>
        <div className="p-5 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            {avatar ? (
              <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover border-2 border-[#FF385C]/20" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#FF385C]/10 border-2 border-[#FF385C]/20 flex items-center justify-center text-[#FF385C] font-bold text-lg">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {service.location || "Remote"}
              </p>
            </div>
          </div>

          <p className="font-medium text-gray-800 dark:text-gray-200 text-sm leading-snug">
            {service.serviceName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {service.shortDescription || service.description}
          </p>

          <div className="flex items-center gap-3 text-xs">
            {rating > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                <Star className="w-3.5 h-3.5 fill-amber-500" />
                {rating.toFixed(1)}
                <span className="text-gray-400">({service.reviewCount})</span>
              </span>
            )}
            <span className="text-gray-500 dark:text-gray-400">{service.deliveryMethod || "Remote"}</span>
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">Starting from</p>
            <p className="font-bold text-gray-900 dark:text-white">${price.toFixed(0)}</p>
          </div>
          <Link href={`/services/${service.id}`}>
            <Button size="sm" className="bg-[#FF385C] hover:bg-[#FF385C]/90 text-white" data-testid={`button-book-visa-${service.id}`}>
              Book Visa Help
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
