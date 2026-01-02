import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Star, 
  TrendingUp, 
  MessageSquare, 
  ThumbsUp, 
  Clock, 
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

const metrics = [
  { label: "Overall Rating", value: "4.9", icon: Star, change: "+0.1", positive: true, suffix: "/5" },
  { label: "Response Rate", value: "98%", icon: MessageSquare, change: "+2%", positive: true, suffix: "" },
  { label: "Booking Rate", value: "85%", icon: TrendingUp, change: "+5%", positive: true, suffix: "" },
  { label: "Repeat Clients", value: "42%", icon: Users, change: "-3%", positive: false, suffix: "" },
];

const reviews = [
  {
    id: 1,
    clientName: "Sarah Johnson",
    date: "Dec 28, 2025",
    rating: 5,
    eventType: "Wedding",
    comment: "Absolutely stunning venue! The team was incredibly professional and made our special day perfect. The garden terrace was breathtaking for our ceremony.",
    response: "Thank you so much for the kind words, Sarah! It was a pleasure hosting your beautiful wedding.",
  },
  {
    id: 2,
    clientName: "David Chen",
    date: "Dec 15, 2025",
    rating: 5,
    eventType: "Corporate Event",
    comment: "Our company gala was a huge success thanks to Grand Estate Venue. The staff was attentive and the food was exceptional.",
    response: null,
  },
  {
    id: 3,
    clientName: "Maria Garcia",
    date: "Dec 10, 2025",
    rating: 4,
    eventType: "Birthday Party",
    comment: "Beautiful venue with great amenities. Minor hiccup with the sound system but it was resolved quickly. Would recommend!",
    response: "Thank you for your feedback, Maria! We've upgraded our sound system since your event.",
  },
  {
    id: 4,
    clientName: "Robert Adams",
    date: "Nov 28, 2025",
    rating: 5,
    eventType: "Anniversary Dinner",
    comment: "Intimate and romantic setting. Perfect for our anniversary celebration. The private dining room was elegant.",
    response: null,
  },
];

const performanceStats = [
  { metric: "Average Response Time", value: "15 min", benchmark: "< 30 min", status: "excellent" },
  { metric: "Quote Acceptance Rate", value: "78%", benchmark: "> 70%", status: "good" },
  { metric: "Cancellation Rate", value: "2%", benchmark: "< 5%", status: "excellent" },
  { metric: "Client Satisfaction", value: "96%", benchmark: "> 90%", status: "excellent" },
];

export default function ProviderPerformance() {
  return (
    <ProviderLayout title="Performance">
      <div className="p-6 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.label} data-testid={`card-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{metric.label}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {metric.value}{metric.suffix}
                    </p>
                    <div className={`flex items-center gap-1 text-sm ${metric.positive ? "text-green-600" : "text-red-600"}`}>
                      {metric.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {metric.change} vs last month
                    </div>
                  </div>
                  <metric.icon className={`w-8 h-8 ${metric.label === "Overall Rating" ? "text-amber-500 fill-amber-500" : "text-[#FF385C]"}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Benchmarks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Performance Benchmarks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {performanceStats.map((stat, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  data-testid={`row-benchmark-${index}`}
                >
                  <div>
                    <p className="font-medium text-gray-900">{stat.metric}</p>
                    <p className="text-sm text-gray-500">Benchmark: {stat.benchmark}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                    <Badge 
                      className={stat.status === "excellent" 
                        ? "bg-green-100 text-green-700 border-green-200" 
                        : "bg-blue-100 text-blue-700 border-blue-200"
                      }
                    >
                      {stat.status === "excellent" ? "Excellent" : "Good"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Rating Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                Rating Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = stars === 5 ? 85 : stars === 4 ? 12 : stars === 3 ? 2 : 1;
                const percentage = count;
                return (
                  <div key={stars} className="flex items-center gap-3" data-testid={`rating-bar-${stars}`}>
                    <div className="flex items-center gap-1 w-12">
                      <span className="text-sm font-medium">{stars}</span>
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-12 text-right">{percentage}%</span>
                  </div>
                );
              })}
              <div className="pt-4 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-500">Based on 127 reviews</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Reviews */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Recent Reviews
            </CardTitle>
            <Button variant="ghost" size="sm" data-testid="button-view-all-reviews">
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviews.map((review) => (
              <div 
                key={review.id}
                className="p-4 border border-gray-200 rounded-lg space-y-3"
                data-testid={`card-review-${review.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C]">
                        {review.clientName.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-gray-900">{review.clientName}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{review.eventType}</span>
                        <span>-</span>
                        <span>{review.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        className={`w-4 h-4 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-gray-700">{review.comment}</p>
                {review.response ? (
                  <div className="ml-4 pl-4 border-l-2 border-[#FF385C]/30">
                    <p className="text-sm font-medium text-[#FF385C]">Your Response:</p>
                    <p className="text-sm text-gray-600">{review.response}</p>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" data-testid={`button-respond-${review.id}`}>
                    <MessageSquare className="w-4 h-4 mr-1" /> Respond
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
