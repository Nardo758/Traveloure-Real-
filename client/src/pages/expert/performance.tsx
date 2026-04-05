import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useQuery } from "@tanstack/react-query";

interface AnalyticsDashboard {
  summary?: {
    avgRating: number;
    totalReviews: number;
    responseRate: number;
    avgResponseTime: string;
    completionRate: number;
    repeatClients: number;
  };
  monthlyMetrics?: Array<{ month: string; clients: number; revenue: number; rating: number }>;
  recentReviews?: Array<{ id: string; client: string; rating: number; text: string; date: string }>;
}

export default function ExpertPerformance() {
  const { data: analytics, isLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ["/api/expert/analytics/dashboard"],
  });

  const overallStats = analytics?.summary || {
    avgRating: 0,
    totalReviews: 0,
    responseRate: 0,
    avgResponseTime: "--",
    completionRate: 0,
    repeatClients: 0,
  };

  const monthlyMetrics = analytics?.monthlyMetrics || [];

  const recentReviews = analytics?.recentReviews || [];

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
          {isLoading ? (
            <>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <Card className="border border-gray-200" data-testid="card-stat-rating">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <p className="text-2xl font-bold text-gray-900">{overallStats.avgRating || "--"}</p>
                  </div>
                  <p className="text-xs text-gray-600">Overall Rating</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200" data-testid="card-stat-reviews">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{overallStats.totalReviews || 0}</p>
                  <p className="text-xs text-gray-600">Total Reviews</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200" data-testid="card-stat-response-rate">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{overallStats.responseRate || 0}%</p>
                  <p className="text-xs text-gray-600">Response Rate</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200" data-testid="card-stat-response-time">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{overallStats.avgResponseTime || "--"}</p>
                  <p className="text-xs text-gray-600">Avg Response</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200" data-testid="card-stat-completion">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{overallStats.completionRate || 0}%</p>
                  <p className="text-xs text-gray-600">Completion Rate</p>
                </CardContent>
              </Card>
              <Card className="border border-gray-200" data-testid="card-stat-repeat">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{overallStats.repeatClients || 0}%</p>
                  <p className="text-xs text-gray-600">Repeat Clients</p>
                </CardContent>
              </Card>
            </>
          )}
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
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                  </div>
                ) : monthlyMetrics.length > 0 ? (
                  <div className="space-y-4">
                    {monthlyMetrics.map((month, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover-elevate"
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
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No monthly data available</p>
                )}
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
                {isLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 rounded-lg" />
                    ))}
                  </>
                ) : recentReviews.length > 0 ? (
                  recentReviews.map((review) => (
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
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No reviews yet</p>
                )}
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
