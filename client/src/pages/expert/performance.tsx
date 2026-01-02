import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  Star, 
  Users, 
  Clock, 
  MessageSquare,
  CheckCircle,
  Target,
  Award
} from "lucide-react";

export default function ExpertPerformance() {
  const overallStats = {
    rating: 4.9,
    totalReviews: 156,
    responseRate: 98,
    avgResponseTime: "15 min",
    completionRate: 99,
    repeatClients: 45,
  };

  const monthlyMetrics = [
    { month: "December", clients: 12, revenue: 4850, rating: 4.9 },
    { month: "November", clients: 10, revenue: 3200, rating: 4.8 },
    { month: "October", clients: 14, revenue: 5100, rating: 4.9 },
    { month: "September", clients: 8, revenue: 2800, rating: 5.0 },
  ];

  const recentReviews = [
    {
      id: 1,
      client: "Sarah & Mike",
      rating: 5,
      text: "Yuki was absolutely amazing! She helped us discover hidden gems in Tokyo that we never would have found on our own.",
      date: "Dec 28, 2025",
    },
    {
      id: 2,
      client: "Jennifer",
      rating: 5,
      text: "The proposal planning was perfect. Every detail was taken care of. Highly recommend!",
      date: "Dec 20, 2025",
    },
    {
      id: 3,
      client: "David & Emma",
      rating: 5,
      text: "Our anniversary dinner was unforgettable. Thank you for all the special touches!",
      date: "Dec 15, 2025",
    },
  ];

  const achievements = [
    { title: "Top Rated Expert", description: "Maintained 4.9+ rating for 6 months", icon: Star, earned: true },
    { title: "Quick Responder", description: "Average response time under 30 min", icon: Clock, earned: true },
    { title: "Client Favorite", description: "50+ repeat clients", icon: Users, earned: false, progress: 90 },
    { title: "Perfect Score", description: "100 five-star reviews", icon: Award, earned: false, progress: 78 },
  ];

  return (
    <ExpertLayout title="Performance">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-performance-title">Performance Dashboard</h1>
          <p className="text-gray-600">Track your metrics and client satisfaction</p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border border-gray-200" data-testid="card-stat-rating">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Star className="w-5 h-5 text-yellow-500" />
                <p className="text-2xl font-bold text-gray-900">{overallStats.rating}</p>
              </div>
              <p className="text-xs text-gray-600">Overall Rating</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-stat-reviews">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{overallStats.totalReviews}</p>
              <p className="text-xs text-gray-600">Total Reviews</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-stat-response-rate">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{overallStats.responseRate}%</p>
              <p className="text-xs text-gray-600">Response Rate</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-stat-response-time">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{overallStats.avgResponseTime}</p>
              <p className="text-xs text-gray-600">Avg Response</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-stat-completion">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{overallStats.completionRate}%</p>
              <p className="text-xs text-gray-600">Completion Rate</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="card-stat-repeat">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{overallStats.repeatClients}%</p>
              <p className="text-xs text-gray-600">Repeat Clients</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Performance */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#FF385C]" />
                  Monthly Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthlyMetrics.map((month, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                      data-testid={`month-metric-${index}`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{month.month}</p>
                        <p className="text-sm text-gray-500">{month.clients} clients</p>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="font-medium text-green-600">${month.revenue.toLocaleString()}</span>
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          {month.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Reviews */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#FF385C]" />
                  Recent Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentReviews.map((review) => (
                  <div 
                    key={review.id} 
                    className="p-4 rounded-lg border border-gray-200"
                    data-testid={`review-${review.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-gray-900">{review.client}</p>
                      <div className="flex items-center gap-1">
                        {[...Array(review.rating)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{review.text}</p>
                    <p className="text-xs text-gray-400 mt-2">{review.date}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Achievements */}
          <Card className="border border-gray-200 h-fit">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-[#FF385C]" />
                Achievements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {achievements.map((achievement, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded-lg border ${achievement.earned ? "border-green-200 bg-green-50" : "border-gray-200"}`}
                  data-testid={`achievement-${index}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${achievement.earned ? "bg-green-100" : "bg-gray-100"}`}>
                      <achievement.icon className={`w-5 h-5 ${achievement.earned ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${achievement.earned ? "text-green-800" : "text-gray-700"}`}>
                          {achievement.title}
                        </p>
                        {achievement.earned && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{achievement.description}</p>
                      {!achievement.earned && achievement.progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Progress</span>
                            <span>{achievement.progress}%</span>
                          </div>
                          <Progress value={achievement.progress} className="h-2" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </ExpertLayout>
  );
}
