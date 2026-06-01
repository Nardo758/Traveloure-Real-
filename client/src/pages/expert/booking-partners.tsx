import { useState } from "react";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ExternalLink,
  Search,
  Star,
  Zap,
  Shield,
  TrendingUp,
  Plane,
  Hotel,
  MapPin,
  Bus,
  Car,
  Umbrella,
  Package,
  Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PartnerBrand {
  id: string;
  name: string;
  logo: string;
  tagline: string;
  category: string;
  commissionRate: string;
  commissionNote: string;
  affiliateUrl: (destination?: string) => string;
  features: string[];
  recommended?: boolean;
}

const TP_MARKER = "405110";

const PARTNERS: PartnerBrand[] = [
  {
    id: "aviasales",
    name: "Aviasales",
    logo: "✈️",
    tagline: "Cheapest flight search worldwide",
    category: "flights",
    commissionRate: "1.6%",
    commissionNote: "of ticket price per booking",
    affiliateUrl: (dest = "") =>
      `https://www.aviasales.com/?marker=${TP_MARKER}${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["200+ airlines", "Best fare finder", "Multi-city"],
    recommended: true,
  },
  {
    id: "kiwi",
    name: "Kiwi.com",
    logo: "🥝",
    tagline: "Hacker fares & virtual interlining",
    category: "flights",
    commissionRate: "1.5–3%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.kiwi.com/deep?affilid=traveloure${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["Hacker fares", "Mix airlines", "Guaranteed rebooking"],
  },
  {
    id: "booking",
    name: "Booking.com",
    logo: "🏨",
    tagline: "Largest hotel inventory globally",
    category: "hotels",
    commissionRate: "25–40%",
    commissionNote: "of Booking.com commission",
    affiliateUrl: (dest = "") =>
      `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest || "")}&aid=304142&label=traveloure-${TP_MARKER}`,
    features: ["28M+ listings", "Free cancellation", "Instant confirm"],
    recommended: true,
  },
  {
    id: "hotellook",
    name: "HotelLook",
    logo: "🔍",
    tagline: "Price comparison across 70 hotel sites",
    category: "hotels",
    commissionRate: "Up to 70%",
    commissionNote: "of net profit after referral",
    affiliateUrl: (dest = "") =>
      `https://hotellook.com/?marker=${TP_MARKER}${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["Price comparison", "70+ systems", "Best rate guarantee"],
  },
  {
    id: "agoda",
    name: "Agoda",
    logo: "🌏",
    tagline: "Best for Asia-Pacific hotels",
    category: "hotels",
    commissionRate: "6%",
    commissionNote: "of total booking value",
    affiliateUrl: (dest = "") =>
      `https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1923885${dest ? `&city=${encodeURIComponent(dest)}` : ""}`,
    features: ["Asia-Pacific leader", "Local deals", "PointsMAX rewards"],
    recommended: true,
  },
  {
    id: "getyourguide",
    name: "GetYourGuide",
    logo: "🎫",
    tagline: "Top tours and experiences worldwide",
    category: "activities",
    commissionRate: "8%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.getyourguide.com/?partner_id=TRAVELOURE${dest ? `&q=${encodeURIComponent(dest)}` : ""}`,
    features: ["300K+ activities", "Instant booking", "Free cancellation"],
    recommended: true,
  },
  {
    id: "klook",
    name: "Klook",
    logo: "🎡",
    tagline: "Asia-focused experiences & passes",
    category: "activities",
    commissionRate: "6%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.klook.com/en-US/?aid=traveloure${dest ? `&city=${encodeURIComponent(dest)}` : ""}`,
    features: ["Pass bundles", "Skip-the-line", "Mobile tickets"],
  },
  {
    id: "wegotrip",
    name: "WeGoTrip",
    logo: "🗺️",
    tagline: "Self-guided audio tours & city guides",
    category: "activities",
    commissionRate: "15%",
    commissionNote: "of each tour purchased",
    affiliateUrl: (dest = "") =>
      `https://wegotrip.com/?ref=traveloure${dest ? `&q=${encodeURIComponent(dest)}` : ""}`,
    features: ["Audio guides", "Self-paced", "Offline maps"],
  },
  {
    id: "tiqets",
    name: "Tiqets",
    logo: "🎟️",
    tagline: "Museums & attractions, instant tickets",
    category: "activities",
    commissionRate: "8%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.tiqets.com/en/?partner=traveloure${dest ? `&q=${encodeURIComponent(dest)}` : ""}`,
    features: ["60K+ attractions", "QR code entry", "Last-minute"],
  },
  {
    id: "omio",
    name: "Omio",
    logo: "🚂",
    tagline: "Trains, buses, and ferries across Europe",
    category: "ground_transport",
    commissionRate: "3%",
    commissionNote: "of ticket price",
    affiliateUrl: (dest = "") =>
      `https://www.omio.com/?utm_source=traveloure&utm_medium=affiliate${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["Europe rail", "Bus & ferry", "Multi-modal"],
    recommended: true,
  },
  {
    id: "busbud",
    name: "Busbud",
    logo: "🚌",
    tagline: "Intercity bus search globally",
    category: "ground_transport",
    commissionRate: "5%",
    commissionNote: "of ticket price",
    affiliateUrl: (dest = "") =>
      `https://www.busbud.com/?utm_source=traveloure${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["10,000+ routes", "Americas focus", "Budget travel"],
  },
  {
    id: "gettransfer",
    name: "GetTransfer",
    logo: "🚗",
    tagline: "Private airport transfers worldwide",
    category: "ground_transport",
    commissionRate: "10%",
    commissionNote: "of transfer price",
    affiliateUrl: (dest = "") =>
      `https://gettransfer.com/?ref=traveloure${dest ? `&city=${encodeURIComponent(dest)}` : ""}`,
    features: ["Airport transfers", "Private drivers", "Meet & greet"],
  },
  {
    id: "kiwitaxi",
    name: "KiwiTaxi",
    logo: "🛻",
    tagline: "Fixed-price taxi & minivan transfers",
    category: "ground_transport",
    commissionRate: "8%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://kiwitaxi.com/?marker=${TP_MARKER}${dest ? `&city=${encodeURIComponent(dest)}` : ""}`,
    features: ["Fixed prices", "No hidden fees", "Flight tracking"],
  },
  {
    id: "welcomepickups",
    name: "Welcome Pickups",
    logo: "👋",
    tagline: "Premium airport welcome experience",
    category: "ground_transport",
    commissionRate: "10%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.welcomepickups.com/?ref=traveloure${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["Local drivers", "Meet at gate", "24/7 support"],
  },
  {
    id: "discovercars",
    name: "DiscoverCars",
    logo: "🚙",
    tagline: "Car rental price comparison",
    category: "car_rental",
    commissionRate: "Up to 70%",
    commissionNote: "of net profit",
    affiliateUrl: (dest = "") =>
      `https://www.discovercars.com/?a_aid=traveloure${dest ? `&location=${encodeURIComponent(dest)}` : ""}`,
    features: ["500+ suppliers", "Full coverage", "No hidden fees"],
    recommended: true,
  },
  {
    id: "rentalcars",
    name: "Rentalcars.com",
    logo: "🔑",
    tagline: "Powered by Booking.com car rental",
    category: "car_rental",
    commissionRate: "6%",
    commissionNote: "of booking value",
    affiliateUrl: (dest = "") =>
      `https://www.rentalcars.com/?affiliateCode=traveloure${dest ? `&pickUpLocation=${encodeURIComponent(dest)}` : ""}`,
    features: ["Global coverage", "Instant quotes", "IATA standard"],
  },
  {
    id: "airalo",
    name: "Airalo",
    logo: "📶",
    tagline: "eSIM data plans for 200+ countries",
    category: "esim",
    commissionRate: "9%",
    commissionNote: "of each eSIM sold",
    affiliateUrl: (dest = "") =>
      `https://www.airalo.com/?referral_code=traveloure${dest ? `&destination=${encodeURIComponent(dest)}` : ""}`,
    features: ["Instant activation", "No roaming fees", "Multi-country"],
  },
  {
    id: "safetywing",
    name: "SafetyWing",
    logo: "🛡️",
    tagline: "Affordable travel & nomad insurance",
    category: "insurance",
    commissionRate: "10%",
    commissionNote: "recurring monthly",
    affiliateUrl: () =>
      `https://safetywing.com/?referenceID=traveloure&utm_source=traveloure`,
    features: ["Medical cover", "Monthly billing", "Remote workers"],
    recommended: true,
  },
  {
    id: "stasher",
    name: "Stasher",
    logo: "🧳",
    tagline: "Luggage storage at hotels & shops",
    category: "luggage",
    commissionRate: "10%",
    commissionNote: "of storage booking",
    affiliateUrl: (dest = "") =>
      `https://stasher.com/?ref=traveloure${dest ? `&city=${encodeURIComponent(dest)}` : ""}`,
    features: ["City-centre spots", "Hourly rates", "Insurance included"],
  },
];

const CATEGORIES = [
  { id: "all", label: "All Partners", icon: Package, count: PARTNERS.length },
  { id: "flights", label: "Flights", icon: Plane, count: PARTNERS.filter(p => p.category === "flights").length },
  { id: "hotels", label: "Hotels", icon: Hotel, count: PARTNERS.filter(p => p.category === "hotels").length },
  { id: "activities", label: "Activities", icon: MapPin, count: PARTNERS.filter(p => p.category === "activities").length },
  { id: "ground_transport", label: "Ground Transport", icon: Bus, count: PARTNERS.filter(p => p.category === "ground_transport").length },
  { id: "car_rental", label: "Car Rental", icon: Car, count: PARTNERS.filter(p => p.category === "car_rental").length },
  { id: "insurance", label: "Insurance", icon: Umbrella, count: PARTNERS.filter(p => p.category === "insurance").length },
  { id: "esim", label: "eSIM", icon: Zap, count: PARTNERS.filter(p => p.category === "esim").length },
  { id: "luggage", label: "Luggage", icon: Package, count: PARTNERS.filter(p => p.category === "luggage").length },
];

export default function ExpertBookingPartnersPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState("");

  const filtered = PARTNERS.filter(p => {
    const matchesCat = selectedCategory === "all" || p.category === selectedCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tagline.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <ExpertLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="heading-booking-partners">Booking Partners</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            All platform-approved affiliate providers. Booking through these earns you a commission <em>and</em> keeps the platform fee structure active.
          </p>
        </div>

        {/* Commission Banner */}
        <div className="rounded-xl border bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3" data-testid="banner-commission-info">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
            <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">You earn when clients book through your affiliate links</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              When you book through these partners, your commission is tracked automatically through Travelpayouts (marker: {TP_MARKER}). Revenue splits: <strong>Platform 30%</strong> · <strong>You 70%</strong> of the booking fee.
            </p>
          </div>
          <Badge className="bg-amber-500 text-white text-xs whitespace-nowrap" data-testid="badge-tp-marker">
            TP Marker: {TP_MARKER}
          </Badge>
        </div>

        {/* Destination pre-fill for affiliate links */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search partners..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-partner-search"
            />
          </div>
          <div className="relative sm:w-56">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pre-fill destination..."
              value={destination}
              onChange={e => setDestination(e.target.value)}
              className="pl-9"
              data-testid="input-partner-destination"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2" data-testid="filter-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                selectedCategory === cat.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
              data-testid={`filter-category-${cat.id}`}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
              <span className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                selectedCategory === cat.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Partner Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-partners">
          {filtered.map(partner => (
            <Card
              key={partner.id}
              className="relative border-border bg-card hover:border-primary/30 hover:shadow-md transition-all"
              data-testid={`card-partner-${partner.id}`}
            >
              {partner.recommended && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary/10 text-primary text-[10px] flex items-center gap-1">
                    <Star className="w-2.5 h-2.5" /> Top Pick
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl" role="img" aria-label={partner.name}>{partner.logo}</span>
                  <div>
                    <CardTitle className="text-sm font-semibold">{partner.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{partner.tagline}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Commission */}
                <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    <span className="text-xs font-medium text-green-800 dark:text-green-300">Your commission</span>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 cursor-help">
                          <span className="text-sm font-bold text-green-700 dark:text-green-300" data-testid={`text-commission-${partner.id}`}>
                            {partner.commissionRate}
                          </span>
                          <Info className="w-3 h-3 text-green-600/60" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-[180px]">
                        {partner.commissionNote}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Features */}
                <div className="flex flex-wrap gap-1">
                  {partner.features.map(f => (
                    <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  className="w-full gap-2 text-xs"
                  size="sm"
                  asChild
                  data-testid={`button-book-partner-${partner.id}`}
                >
                  <a href={partner.affiliateUrl(destination)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Book for Client
                    <Shield className="w-3 h-3 ml-auto opacity-60" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground" data-testid="empty-state-partners">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No partners match your search.</p>
            </div>
          )}
        </div>

        {/* How commissions work */}
        <Card className="border-border" data-testid="card-how-commissions-work">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              How your commissions work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">1.</span>Click <strong>"Book for Client"</strong> above — the link includes your Travelpayouts marker automatically.</li>
              <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">2.</span>Your client completes the booking on the partner's site.</li>
              <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">3.</span>Travelpayouts tracks the sale and credits the platform account with the affiliate commission.</li>
              <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">4.</span>The platform booking fee applies: <strong>you keep 70%, Traveloure keeps 30%</strong> of the fee — paid out monthly via Stripe Connect.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
