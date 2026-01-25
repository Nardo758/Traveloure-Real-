import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Trophy, 
  Medal, 
  Star, 
  TrendingUp,
  Crown,
  Flame,
  Target,
  Award,
  Zap,
  Clock,
  Users,
  DollarSign,
  CheckCircle,
  ChevronUp,
  ChevronDown,
  Minus
} from "lucide-react";

export default function ExpertLeaderboard() {
  const userRanking = {
    rank: 7,
    previousRank: 9,
    points: 4850,
    nextRankPoints: 5200,
    percentToNext: 93,
    region: "Kyoto, Japan",
    globalRank: 156,
  };

  const topExperts = [
    { rank: 1, name: "Sakura Tanaka", region: "Tokyo", avatar: "", points: 8920, badge: "Elite", rating: 5.0, clients: 89, change: 0 },
    { rank: 2, name: "Marco Silva", region: "Lisbon", avatar: "", points: 7650, badge: "Elite", rating: 4.9, clients: 72, change: 1 },
    { rank: 3, name: "Emma Chen", region: "Singapore", avatar: "", points: 7120, badge: "Elite", rating: 4.9, clients: 68, change: -1 },
    { rank: 4, name: "Carlos Mendez", region: "Barcelona", avatar: "", points: 6840, badge: "Pro", rating: 4.8, clients: 61, change: 2 },
    { rank: 5, name: "Sophie Laurent", region: "Paris", avatar: "", points: 6200, badge: "Pro", rating: 4.9, clients: 54, change: 0 },
    { rank: 6, name: "Yuki Yamamoto", region: "Osaka", avatar: "", points: 5450, badge: "Pro", rating: 4.8, clients: 48, change: -2 },
    { rank: 7, name: "You", region: "Kyoto", avatar: "", points: 4850, badge: "Rising Star", rating: 4.9, clients: 42, change: 2, isUser: true },
    { rank: 8, name: "David Kim", region: "Seoul", avatar: "", points: 4620, badge: "Rising Star", rating: 4.7, clients: 38, change: -1 },
    { rank: 9, name: "Maria Garcia", region: "Madrid", avatar: "", points: 4380, badge: "Rising Star", rating: 4.8, clients: 35, change: 1 },
    { rank: 10, name: "Hans Mueller", region: "Berlin", avatar: "", points: 4100, badge: "Rising Star", rating: 4.7, clients: 32, change: 0 },
  ];

  const badges = [
    { name: "Top Rated", description: "Maintained 4.9+ rating for 6 months", icon: Star, earned: true, tier: "gold" },
    { name: "Quick Responder", description: "Average response time under 30 min", icon: Clock, earned: true, tier: "gold" },
    { name: "Client Favorite", description: "50+ repeat clients", icon: Users, earned: false, progress: 84, tier: "silver" },
    { name: "Revenue Champion", description: "Top 10% monthly earnings", icon: DollarSign, earned: false, progress: 72, tier: "bronze" },
    { name: "Perfect Score", description: "100 five-star reviews", icon: Award, earned: false, progress: 78, tier: "bronze" },
    { name: "Rising Star", description: "Fastest growing in your region", icon: Flame, earned: true, tier: "silver" },
  ];

  const monthlyCompetitions = [
    {
      title: "January Top Performer",
      description: "Highest client satisfaction this month",
      prize: "$500 bonus",
      yourPosition: 4,
      totalParticipants: 156,
      endsIn: "6 days",
      status: "active",
    },
    {
      title: "Response Champion",
      description: "Fastest average response time",
      prize: "Featured placement for 1 week",
      yourPosition: 2,
      totalParticipants: 156,
      endsIn: "6 days",
      status: "active",
    },
    {
      title: "New Client Leader",
      description: "Most new clients acquired",
      prize: "Premium profile badge",
      yourPosition: 8,
      totalParticipants: 156,
      endsIn: "6 days",
      status: "active",
    },
  ];

  const getBadgeTierColor = (tier: string) => {
    switch (tier) {
      case "gold": return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "silver": return "bg-gray-100 text-gray-700 border-gray-300";
      case "bronze": return "bg-amber-100 text-amber-700 border-amber-300";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2: return <Medal className="w-5 h-5 text-gray-400" />;
      case 3: return <Medal className="w-5 h-5 text-amber-600" />;
      default: return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getChangeIndicator = (change: number) => {
    if (change > 0) return <span className="flex items-center text-green-600 text-xs"><ChevronUp className="w-3 h-3" />{change}</span>;
    if (change < 0) return <span className="flex items-center text-red-600 text-xs"><ChevronDown className="w-3 h-3" />{Math.abs(change)}</span>;
    return <span className="flex items-center text-muted-foreground text-xs"><Minus className="w-3 h-3" /></span>;
  };

  return (
    <ExpertLayout title="Leaderboard">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-leaderboard-title">
            Expert Leaderboard
          </h1>
          <p className="text-muted-foreground">Compete with top experts and earn recognition</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border bg-primary/5 border-primary/20" data-testid="card-your-rank">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Your Regional Rank</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-foreground">#{userRanking.rank}</p>
                    <span className="flex items-center text-green-600 text-sm">
                      <ChevronUp className="w-4 h-4" />2 from last month
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border" data-testid="card-global-rank">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Global Rank</p>
                  <p className="text-2xl font-bold text-foreground">#{userRanking.globalRank}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border" data-testid="card-points">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Points</p>
                  <p className="text-2xl font-bold text-foreground">{userRanking.points.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border" data-testid="card-badges-earned">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Award className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Badges Earned</p>
                  <p className="text-2xl font-bold text-foreground">{badges.filter(b => b.earned).length}/{badges.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Progress to Top 5</p>
              <p className="text-sm text-muted-foreground">{userRanking.points} / {userRanking.nextRankPoints} points</p>
            </div>
            <Progress value={userRanking.percentToNext} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              Earn {userRanking.nextRankPoints - userRanking.points} more points to reach #6
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="rankings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="rankings" data-testid="tab-rankings">Rankings</TabsTrigger>
            <TabsTrigger value="badges" data-testid="tab-badges">Badges</TabsTrigger>
            <TabsTrigger value="competitions" data-testid="tab-competitions">Competitions</TabsTrigger>
          </TabsList>

          <TabsContent value="rankings" className="space-y-4">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Top 10 Experts - {userRanking.region}
                </CardTitle>
                <CardDescription>Regional leaderboard updated weekly</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topExperts.map((expert, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg border hover-elevate ${expert.isUser ? 'bg-primary/5 border-primary/20' : ''}`}
                      data-testid={`expert-rank-${expert.rank}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 flex justify-center">
                          {getRankIcon(expert.rank)}
                        </div>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={expert.avatar} />
                          <AvatarFallback className={expert.isUser ? 'bg-primary/20 text-primary' : 'bg-muted'}>
                            {expert.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${expert.isUser ? 'text-primary' : 'text-foreground'}`}>
                              {expert.name}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {expert.badge}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{expert.region}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="font-medium text-foreground">{expert.points.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500" />
                            <span className="font-medium">{expert.rating}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">rating</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-foreground">{expert.clients}</p>
                          <p className="text-xs text-muted-foreground">clients</p>
                        </div>
                        <div className="w-8">
                          {getChangeIndicator(expert.change)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="badges" className="space-y-4">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary" />
                  Achievement Badges
                </CardTitle>
                <CardDescription>Collect badges to boost your profile visibility</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {badges.map((badge, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${badge.earned ? getBadgeTierColor(badge.tier) : 'bg-muted/30'}`}
                      data-testid={`badge-${index}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${badge.earned ? 'bg-white/50' : 'bg-muted'}`}>
                          <badge.icon className={`w-6 h-6 ${badge.earned ? '' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${badge.earned ? '' : 'text-muted-foreground'}`}>
                              {badge.name}
                            </p>
                            {badge.earned && <CheckCircle className="w-4 h-4 text-green-600" />}
                          </div>
                          <p className="text-sm text-muted-foreground">{badge.description}</p>
                          {!badge.earned && badge.progress && (
                            <div className="mt-2">
                              <Progress value={badge.progress} className="h-2" />
                              <p className="text-xs text-muted-foreground mt-1">{badge.progress}% complete</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="competitions" className="space-y-4">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Monthly Competitions
                </CardTitle>
                <CardDescription>Compete for prizes and recognition</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthlyCompetitions.map((comp, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg border"
                    data-testid={`competition-${index}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-foreground">{comp.title}</p>
                          <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{comp.description}</p>
                        <div className="flex items-center gap-4 mt-3 text-sm">
                          <span className="flex items-center gap-1">
                            <Trophy className="w-4 h-4 text-amber-500" />
                            <span className="text-foreground font-medium">{comp.prize}</span>
                          </span>
                          <span className="text-muted-foreground">
                            {comp.totalParticipants} participants
                          </span>
                          <span className="text-muted-foreground">
                            Ends in {comp.endsIn}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Your Position</p>
                        <p className="text-2xl font-bold text-primary">#{comp.yourPosition}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
