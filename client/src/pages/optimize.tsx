import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Check,
  Clock,
  DollarSign,
  Star,
  ArrowLeft,
  Gem,
  TrendingDown,
  MapPin,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanOption {
  id: string;
  name: string;
  tagline: string;
  totalCost: number;
  perPerson: number;
  savings?: number;
  timeSaved?: number;
  hiddenGems?: number;
  highlight?: string;
  recommended?: boolean;
  popular?: boolean;
  activities: { name: string; price: number }[];
  hotel: { name: string; price: number; note?: string };
  services: { name: string; price: number }[];
  whyDifferent: string[];
}

const plans: PlanOption[] = [
  {
    id: "your-cart",
    name: "Your Cart",
    tagline: "Original selections",
    totalCost: 2112,
    perPerson: 1056,
    activities: [
      { name: "Eiffel Tower", price: 178 },
      { name: "Louvre", price: 130 },
      { name: "Food tour", price: 238 },
    ],
    hotel: { name: "Hotel Monge (Latin Q.)", price: 1330 },
    services: [
      { name: "Airport transfer", price: 75 },
      { name: "Metro pass", price: 108 },
      { name: "Museum pass", price: 134 },
    ],
    whyDifferent: [],
  },
  {
    id: "cost-saver",
    name: "Cost Saver",
    tagline: "Maximum savings",
    totalCost: 1785,
    perPerson: 893,
    savings: 327,
    popular: true,
    activities: [
      { name: "Paris Pass (includes all)", price: 145 },
      { name: "Free museums (4+ with pass)", price: 0 },
      { name: "Local food walk (free)", price: 0 },
      { name: "Walking tour", price: 45 },
    ],
    hotel: { name: "Same hotel (Sun-Thur dates)", price: 1050, note: "Shifted to cheaper days" },
    services: [
      { name: "RER train ticket", price: 15 },
      { name: "Metro pass", price: 108 },
      { name: "Paris Pass (included)", price: 0 },
    ],
    whyDifferent: [
      "Shifted hotel dates (Sun-Thurs cheaper than Fri-Sat)",
      "Paris Pass bundles multiple attractions at discount",
      "Public transport vs private (saves $60)",
      "Free self-guided food walk vs paid tour",
    ],
  },
  {
    id: "time-saver",
    name: "Time Saver",
    tagline: "Maximum efficiency",
    totalCost: 2240,
    perPerson: 1120,
    timeSaved: 8,
    activities: [
      { name: "Skip-lines bundled", price: 420 },
      { name: "VIP combo tour", price: 195 },
      { name: "Private food tour", price: 280 },
    ],
    hotel: { name: "Upgraded to Marais (central)", price: 1540 },
    services: [
      { name: "Private driver entire trip", price: 380 },
      { name: "Skip metro (driver handles)", price: 0 },
    ],
    whyDifferent: [
      "Hotel in Marais (center of action, less commute)",
      "Skip-the-line bundled with VIP tour",
      "Private driver eliminates metro waits",
      "All activities within 15 min of hotel",
    ],
  },
  {
    id: "local-expert",
    name: "Local Expert",
    tagline: "Authentic experience",
    totalCost: 1950,
    perPerson: 975,
    hiddenGems: 5,
    recommended: true,
    activities: [
      { name: "Eiffel @ sunrise", price: 178 },
      { name: "Secret Louvre entrance", price: 95 },
      { name: "Market food tour", price: 85 },
      { name: "Hidden bistro (free rec)", price: 0 },
    ],
    hotel: { name: "Local B&B in Marais", price: 980, note: "+ breakfast included" },
    services: [
      { name: "Airport transfer", price: 75 },
      { name: "Metro pass", price: 108 },
      { name: "Museum pass", price: 134 },
    ],
    whyDifferent: [
      "Local B&B run by Parisian family (authentic + breakfast)",
      "Sunrise Eiffel Tower (no crowds, better photos)",
      "Secret Louvre entrance (locals' tip, faster)",
      "Market food tour (where Parisians actually eat)",
      "Hidden bistro recommendation (not in guidebooks)",
    ],
  },
];

const pricingTiers = [
  {
    id: "ai-only",
    name: "AI Optimization Only",
    price: 19.99,
    description: "Get 2-3 optimized plans, choose one, book yourself",
  },
  {
    id: "ai-expert",
    name: "AI Optimization + Expert Review",
    price: 49.99,
    description: "Get optimized plans PLUS have a Paris expert review and customize based on your preferences",
    recommended: true,
  },
  {
    id: "full-service",
    name: "Full Expert Service",
    price: 199,
    description: "Expert handles everything: planning, booking, coordination",
  },
];

export default function OptimizePage() {
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState("ai-expert");
  const [showComparison, setShowComparison] = useState(false);

  if (!showComparison) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="container mx-auto px-4 max-w-3xl">
            <Button
              variant="ghost"
              className="mb-6"
              onClick={() => setLocation("/browse")}
              data-testid="button-back-browse"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Browse
            </Button>

            <Card className="border-gray-200">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-purple-600" />
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Optimize Your Paris Trip with AI
                </CardTitle>
                <p className="text-gray-600 mt-2">
                  Our AI has analyzed your selections and can create 2-3 optimized
                  alternatives that could save you money, time, and surface hidden gems.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-2">Your Current Cart:</p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>Total Cost: $2,112</li>
                    <li>Activities: 3 major attractions</li>
                    <li>Hotel: Boutique hotel in Latin Quarter</li>
                    <li>Travel Time Between Activities: ~18 hours total</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <p className="font-semibold text-gray-900 mb-4">What AI Optimization Includes:</p>
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">2-3 Alternative Itineraries</p>
                        <p className="text-sm text-gray-500">Compare different approaches to your trip</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Cost Optimization</p>
                        <p className="text-sm text-gray-500">Find package deals, combo tickets, off-peak savings. Estimated savings: $200-400</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Time Efficiency</p>
                        <p className="text-sm text-gray-500">Minimize travel time, group by neighborhood. Estimated time saved: 6-10 hours</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Gem className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Hidden Gems</p>
                        <p className="text-sm text-gray-500">Local spots tourists don't know about, authentic experiences</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Star className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Expert Insights</p>
                        <p className="text-sm text-gray-500">Cultural context, insider tips, best times to visit</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="font-semibold text-gray-900 mb-4">Choose Your Plan:</p>
                  <RadioGroup value={selectedTier} onValueChange={setSelectedTier} className="space-y-3">
                    {pricingTiers.map((tier) => (
                      <div
                        key={tier.id}
                        className={cn(
                          "relative flex items-start gap-3 p-4 rounded-lg border transition-colors cursor-pointer",
                          selectedTier === tier.id
                            ? "border-[#FF385C] bg-pink-50"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                        onClick={() => setSelectedTier(tier.id)}
                        data-testid={`radio-tier-${tier.id}`}
                      >
                        <RadioGroupItem value={tier.id} id={tier.id} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={tier.id} className="font-medium text-gray-900 cursor-pointer">
                              {tier.name}
                            </Label>
                            {tier.recommended && (
                              <Badge className="bg-[#FF385C] text-white">Recommended</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
                        </div>
                        <p className="font-semibold text-gray-900">${tier.price}</p>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">Money-Back Guarantee</p>
                    <p className="text-sm text-green-700">
                      If our optimized plan doesn't save you at least $100 or show meaningful
                      time/value improvements, get a full refund.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-[#FF385C] hover:bg-[#E23350] text-white h-12 text-lg font-semibold"
                    onClick={() => setShowComparison(true)}
                    data-testid="button-unlock-optimization"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Unlock AI Optimization - ${pricingTiers.find(t => t.id === selectedTier)?.price}
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full text-gray-500"
                  onClick={() => setLocation("/browse")}
                  data-testid="button-no-thanks"
                >
                  No Thanks, I'll Book As-Is
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setShowComparison(false)}
              data-testid="button-back-pricing"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              AI-Optimized Plans for Your Paris Trip
            </h1>
            <p className="text-gray-600">
              We analyzed your cart and created 3 optimized alternatives.
              Compare and choose the one that works best for you!
            </p>
          </div>

          {/* Plan Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative cursor-pointer transition-all",
                  selectedPlan === plan.id
                    ? "ring-2 ring-[#FF385C] border-[#FF385C]"
                    : "border-gray-200 hover:border-gray-300"
                )}
                onClick={() => setSelectedPlan(plan.id)}
                data-testid={`card-plan-${plan.id}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white">
                      <Gem className="w-3 h-3 mr-1" /> Recommended
                    </Badge>
                  </div>
                )}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-amber-500 text-white">
                      <Star className="w-3 h-3 mr-1" /> Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-4 pt-6">
                  <div className="text-center mb-4">
                    <h3 className="font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-500">{plan.tagline}</p>
                  </div>

                  <div className="text-center mb-4">
                    <p className="text-2xl font-bold text-gray-900">${plan.totalCost.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">(~${plan.perPerson}/pp)</p>
                    {plan.savings && (
                      <Badge className="bg-green-100 text-green-700 mt-2">
                        <TrendingDown className="w-3 h-3 mr-1" /> Save ${plan.savings}
                      </Badge>
                    )}
                    {plan.timeSaved && (
                      <Badge className="bg-blue-100 text-blue-700 mt-2">
                        <Zap className="w-3 h-3 mr-1" /> Save {plan.timeSaved}hrs
                      </Badge>
                    )}
                    {plan.hiddenGems && (
                      <Badge className="bg-purple-100 text-purple-700 mt-2">
                        <Gem className="w-3 h-3 mr-1" /> +{plan.hiddenGems} Gems
                      </Badge>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="font-medium text-gray-700 mb-2">Activities</p>
                      <ul className="space-y-1">
                        {plan.activities.map((a, i) => (
                          <li key={i} className="flex justify-between text-gray-600">
                            <span className="truncate mr-2">{a.name}</span>
                            <span className="text-gray-900">{a.price > 0 ? `$${a.price}` : "Free"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="font-medium text-gray-700 mb-2">Hotel</p>
                      <div className="flex justify-between text-gray-600">
                        <span className="truncate mr-2">{plan.hotel.name}</span>
                        <span className="text-gray-900">${plan.hotel.price.toLocaleString()}</span>
                      </div>
                      {plan.hotel.note && (
                        <p className="text-xs text-gray-500 mt-1">{plan.hotel.note}</p>
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-gray-700 mb-2">Services</p>
                      <ul className="space-y-1">
                        {plan.services.map((s, i) => (
                          <li key={i} className="flex justify-between text-gray-600">
                            <span className="truncate mr-2">{s.name}</span>
                            <span className="text-gray-900">{s.price > 0 ? `$${s.price}` : "Incl."}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Button
                    className={cn(
                      "w-full mt-4",
                      selectedPlan === plan.id
                        ? "bg-[#FF385C] hover:bg-[#E23350] text-white"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                    )}
                    data-testid={`button-select-${plan.id}`}
                  >
                    {selectedPlan === plan.id ? "Selected" : "Book This"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Why Different Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.slice(1).map((plan) => (
              <Card key={plan.id} className="border-gray-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {plan.id === "cost-saver" && <DollarSign className="w-5 h-5 text-green-600" />}
                    {plan.id === "time-saver" && <Clock className="w-5 h-5 text-blue-600" />}
                    {plan.id === "local-expert" && <Gem className="w-5 h-5 text-purple-600" />}
                    {plan.name} Plan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-gray-600">
                    {plan.whyDifferent.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {plan.savings && (
                    <p className="mt-4 font-medium text-green-600">
                      Savings: ${plan.savings} (15% less)
                    </p>
                  )}
                  {plan.timeSaved && (
                    <p className="mt-4 font-medium text-blue-600">
                      Time Saved: {plan.timeSaved} hours (44% less travel)
                    </p>
                  )}
                  {plan.hiddenGems && (
                    <p className="mt-4 font-medium text-purple-600">
                      Bonus: {plan.hiddenGems} hidden gems, authentic experience
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedPlan && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
              <div className="container mx-auto flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">
                    Selected: {plans.find(p => p.id === selectedPlan)?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    Total: ${plans.find(p => p.id === selectedPlan)?.totalCost.toLocaleString()}
                  </p>
                </div>
                <Button
                  className="bg-[#FF385C] hover:bg-[#E23350] text-white px-8"
                  data-testid="button-proceed-booking"
                >
                  Proceed to Booking
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
