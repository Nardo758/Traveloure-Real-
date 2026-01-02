import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Gift, 
  Calendar,
  User,
  Plus,
  Bot,
  Star,
  Clock,
  ShoppingCart
} from "lucide-react";

export default function EAGifts() {
  const upcomingOccasions = [
    { id: 1, executive: "Michael Torres", occasion: "10th Anniversary", date: "This Friday", giftNeeded: true },
    { id: 2, executive: "James Anderson", occasion: "Spouse Birthday", date: "Apr 22", giftNeeded: false },
    { id: 3, executive: "Lisa Parker", occasion: "Work Anniversary", date: "Apr 28", giftNeeded: true },
  ];

  const aiSuggestions = [
    {
      id: 1,
      for: "Michael Torres - Anniversary",
      options: [
        { name: "Cartier Love Bracelet", price: "$6,900", matchScore: 95 },
        { name: "Weekend at The Ritz-Carlton", price: "$3,500", matchScore: 92 },
        { name: "Tiffany & Co. Necklace", price: "$4,200", matchScore: 88 },
      ],
    },
  ];

  const giftHistory = [
    {
      id: 1,
      executive: "James Anderson",
      occasion: "Anniversary 2024",
      gift: "Weekend at Napa Valley resort",
      amount: "$2,500",
      date: "Jun 15, 2024",
      rating: 5,
    },
    {
      id: 2,
      executive: "James Anderson",
      occasion: "Birthday 2024",
      gift: "Luxury watch",
      amount: "$1,200",
      date: "Mar 8, 2024",
      rating: 5,
    },
    {
      id: 3,
      executive: "Sarah Chen",
      occasion: "Promotion",
      gift: "Spa Day Package",
      amount: "$800",
      date: "Feb 14, 2024",
      rating: 4,
    },
  ];

  return (
    <EALayout title="Gifts">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-gifts-title">
              Gift Management
            </h1>
            <p className="text-gray-600">Track occasions and manage gift giving</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-testid="button-browse-catalog">
              <ShoppingCart className="w-4 h-4 mr-2" /> Browse Catalog
            </Button>
            <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-order-gift">
              <Plus className="w-4 h-4 mr-2" /> Order Gift
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-pending-gifts">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-yellow-600">3</p>
              <p className="text-sm text-gray-600">Gifts Needed</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-upcoming">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">8</p>
              <p className="text-sm text-gray-600">Upcoming Occasions</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-this-year">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">24</p>
              <p className="text-sm text-gray-600">Gifts This Year</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-budget">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">$18.5k</p>
              <p className="text-sm text-gray-600">YTD Spent</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upcoming Occasions */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#FF385C]" />
                  <CardTitle className="text-lg">Upcoming Occasions</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingOccasions.map((occasion) => (
                  <div 
                    key={occasion.id} 
                    className={`p-4 rounded-lg border ${occasion.giftNeeded ? "border-yellow-200 bg-yellow-50/50" : "border-gray-200"}`}
                    data-testid={`occasion-${occasion.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900">{occasion.executive}</p>
                          {occasion.giftNeeded && (
                            <Badge className="bg-yellow-100 text-yellow-700">Gift Needed</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{occasion.occasion}</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" /> {occasion.date}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {occasion.giftNeeded && (
                          <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-select-gift-${occasion.id}`}>
                            <Gift className="w-3 h-3 mr-1" /> Select Gift
                          </Button>
                        )}
                        <Button size="sm" variant="outline" data-testid={`button-ai-suggest-${occasion.id}`}>
                          <Bot className="w-3 h-3 mr-1" /> AI Suggest
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Gift Suggestions</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {aiSuggestions.map((suggestion) => (
                  <div key={suggestion.id} data-testid={`suggestion-${suggestion.id}`}>
                    <p className="font-medium text-gray-900 mb-3">{suggestion.for}</p>
                    <div className="space-y-2">
                      {suggestion.options.map((option, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{option.name}</p>
                            <p className="text-sm text-gray-500">{option.price}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">Match: {option.matchScore}%</Badge>
                            <Button size="sm" variant="outline" data-testid={`button-order-${suggestion.id}-${idx}`}>
                              Order
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Gift History */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Recent Gift History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {giftHistory.map((gift) => (
                <div 
                  key={gift.id} 
                  className="p-3 rounded-lg border border-gray-100"
                  data-testid={`gift-history-${gift.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{gift.executive}</span>
                  </div>
                  <p className="text-sm text-gray-600">{gift.occasion}</p>
                  <p className="text-sm text-gray-900 font-medium mt-1">{gift.gift}</p>
                  <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                    <span>{gift.amount}</span>
                    <div className="flex items-center gap-1">
                      {[...Array(gift.rating)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{gift.date}</p>
                </div>
              ))}
              <Button variant="ghost" className="w-full text-[#FF385C]" data-testid="button-view-all-history">
                View All History
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </EALayout>
  );
}
