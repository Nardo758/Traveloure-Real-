import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  Users, 
  Building2, 
  Route, 
  Wallet,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  Clock,
  DollarSign,
  Calendar,
  CheckCircle,
  Info,
  Zap
} from "lucide-react";

export interface LogisticsIntelligenceConfig {
  paymentFlowType: "group_split" | "joint" | "single_payer" | "multi_stakeholder" | "individual_with_discount";
  paymentComplexity: "low" | "medium" | "high" | "very_high";
  timingComplexity: "low" | "medium" | "high" | "very_high" | "extreme";
  contingencyLevel: "flexible" | "important" | "critical";
  typicalGroupSizeMin: number;
  typicalGroupSizeMax: number;
  typicalDurationMinDays: number;
  typicalDurationMaxDays: number;
}

interface LogisticsModule {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  relevanceScore: number;
  recommended: boolean;
  features: string[];
}

interface LogisticsIntelligencePanelProps {
  experienceType: string;
  experienceName: string;
  config: LogisticsIntelligenceConfig;
  groupSize?: number;
  durationDays?: number;
  onModuleSelect?: (moduleId: string) => void;
  activeModule?: string;
}

export function LogisticsIntelligencePanel({
  experienceType,
  experienceName,
  config,
  groupSize = 2,
  durationDays = 3,
  onModuleSelect,
  activeModule
}: LogisticsIntelligencePanelProps) {
  const [showAllModules, setShowAllModules] = useState(false);

  const getPaymentFlowLabel = (type: string) => {
    switch (type) {
      case "group_split": return "Group Cost Splitting";
      case "joint": return "Joint/Shared Payment";
      case "single_payer": return "Single Payer";
      case "multi_stakeholder": return "Multiple Stakeholders";
      case "individual_with_discount": return "Individual with Group Discount";
      default: return type;
    }
  };

  const getComplexityColor = (level: string) => {
    switch (level) {
      case "low": return "text-green-600";
      case "medium": return "text-amber-500";
      case "high": return "text-orange-500";
      case "very_high": return "text-red-500";
      case "extreme": return "text-red-700";
      default: return "text-muted-foreground";
    }
  };

  const getComplexityScore = (level: string) => {
    switch (level) {
      case "low": return 20;
      case "medium": return 40;
      case "high": return 60;
      case "very_high": return 80;
      case "extreme": return 100;
      default: return 0;
    }
  };

  const getContingencyBadge = (level: string) => {
    switch (level) {
      case "critical": return <Badge variant="destructive">Critical Planning Required</Badge>;
      case "important": return <Badge variant="secondary" className="bg-amber-500">Important</Badge>;
      default: return <Badge variant="outline">Flexible</Badge>;
    }
  };

  const calculateModuleRelevance = (moduleId: string): number => {
    let score = 50;

    switch (moduleId) {
      case "coordination":
        if (groupSize > 4) score += 30;
        if (config.paymentFlowType === "group_split") score += 20;
        if (groupSize <= 2) score -= 40;
        break;
      case "vendor":
        if (config.timingComplexity === "very_high" || config.timingComplexity === "extreme") score += 30;
        if (config.paymentComplexity === "high" || config.paymentComplexity === "very_high") score += 20;
        if (durationDays > 5) score += 10;
        break;
      case "itinerary":
        if (durationDays > 3) score += 25;
        if (config.timingComplexity !== "low") score += 20;
        if (groupSize > 6) score += 15;
        break;
      case "budget":
        if (config.paymentComplexity !== "low") score += 30;
        if (config.paymentFlowType === "group_split" || config.paymentFlowType === "multi_stakeholder") score += 25;
        break;
      case "emergency":
        if (config.contingencyLevel === "critical") score += 40;
        if (config.contingencyLevel === "important") score += 20;
        if (durationDays > 7) score += 15;
        break;
    }

    return Math.min(100, Math.max(0, score));
  };

  const modules: LogisticsModule[] = [
    {
      id: "coordination",
      name: "Multi-Person Coordination",
      icon: Users,
      description: "RSVP tracking, payment collection, dietary requirements, and group communication",
      relevanceScore: calculateModuleRelevance("coordination"),
      recommended: groupSize > 4 || config.paymentFlowType === "group_split",
      features: ["RSVP Management", "Payment Tracking", "Dietary Restrictions", "Group Messaging"]
    },
    {
      id: "vendor",
      name: "Vendor Management",
      icon: Building2,
      description: "Contract tracking, deposit schedules, payment reminders, and vendor communication",
      relevanceScore: calculateModuleRelevance("vendor"),
      recommended: config.timingComplexity === "very_high" || config.timingComplexity === "extreme",
      features: ["Contract Tracking", "Payment Schedules", "Communication Log", "Deadline Alerts"]
    },
    {
      id: "itinerary",
      name: "Itinerary Optimization",
      icon: Route,
      description: "AI-powered scheduling, energy balancing, weather contingencies, and route optimization",
      relevanceScore: calculateModuleRelevance("itinerary"),
      recommended: durationDays > 3 || config.timingComplexity !== "low",
      features: ["Travel Time Analysis", "Energy Balancing", "Weather Alerts", "Route Optimization"]
    },
    {
      id: "budget",
      name: "Budget Intelligence",
      icon: Wallet,
      description: "Real-time spend tracking, cost splitting, currency conversion, and tip calculation",
      relevanceScore: calculateModuleRelevance("budget"),
      recommended: config.paymentComplexity !== "low" || config.paymentFlowType === "group_split",
      features: ["Spend Tracking", "Cost Splitting", "Currency Converter", "Tip Calculator"]
    },
    {
      id: "emergency",
      name: "Emergency Response",
      icon: ShieldAlert,
      description: "24/7 expert contact, medical facilities, embassy info, weather alerts, rebooking assistance",
      relevanceScore: calculateModuleRelevance("emergency"),
      recommended: config.contingencyLevel === "critical",
      features: ["24/7 Support", "Medical Facilities", "Embassy Contacts", "Rebooking Help"]
    }
  ];

  const sortedModules = [...modules].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const recommendedModules = sortedModules.filter(m => m.recommended);
  const displayModules = showAllModules ? sortedModules : recommendedModules.length > 0 ? recommendedModules : sortedModules.slice(0, 3);

  const overallComplexity = Math.round(
    (getComplexityScore(config.paymentComplexity) + getComplexityScore(config.timingComplexity)) / 2
  );

  return (
    <Card className="w-full" data-testid="card-logistics-intelligence">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2" data-testid="text-logistics-title">
              <Brain className="h-5 w-5 text-primary" />
              Logistics Intelligence
            </CardTitle>
            <CardDescription data-testid="text-logistics-description">
              Context-aware planning guidance for {experienceName}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-base px-3 py-1" data-testid="badge-experience-type">
            <Sparkles className="w-4 h-4 mr-2" />
            {experienceType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Card data-testid="card-complexity-overview">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Planning Complexity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Overall</span>
                    <span className={getComplexityColor(overallComplexity > 60 ? "high" : overallComplexity > 30 ? "medium" : "low")}>
                      {overallComplexity}%
                    </span>
                  </div>
                  <Progress value={overallComplexity} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment</span>
                    <span className={`font-medium capitalize ${getComplexityColor(config.paymentComplexity)}`}>
                      {config.paymentComplexity.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Timing</span>
                    <span className={`font-medium capitalize ${getComplexityColor(config.timingComplexity)}`}>
                      {config.timingComplexity.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-experience-profile">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Info className="w-4 h-4" />
                Experience Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Payment Flow
                  </span>
                  <span className="font-medium">{getPaymentFlowLabel(config.paymentFlowType)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Typical Group
                  </span>
                  <span className="font-medium">{config.typicalGroupSizeMin}-{config.typicalGroupSizeMax} people</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Duration
                  </span>
                  <span className="font-medium">{config.typicalDurationMinDays}-{config.typicalDurationMaxDays} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Contingency
                  </span>
                  {getContingencyBadge(config.contingencyLevel)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {config.contingencyLevel === "critical" && (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20" data-testid="card-critical-notice">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">Critical Planning Required</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    This experience type requires careful contingency planning. We recommend activating the Emergency Response 
                    module and establishing backup plans for key activities.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">
              {recommendedModules.length > 0 ? "Recommended Modules" : "Available Modules"}
            </h3>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowAllModules(!showAllModules)}
              data-testid="button-toggle-modules"
            >
              {showAllModules ? "Show Recommended" : "Show All"}
            </Button>
          </div>
          
          <div className="grid gap-3">
            {displayModules.map(module => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              
              return (
                <Card 
                  key={module.id}
                  className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : 'hover-elevate'}`}
                  onClick={() => onModuleSelect?.(module.id)}
                  data-testid={`card-module-${module.id}`}
                  role="button"
                  tabIndex={0}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10'}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{module.name}</h4>
                          {module.recommended && (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{module.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {module.features.map(feature => (
                            <Badge key={feature} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{module.relevanceScore}%</div>
                        <div className="text-xs text-muted-foreground">relevance</div>
                        <Progress value={module.relevanceScore} className="h-1 w-16 mt-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="bg-muted/30" data-testid="card-ai-insights">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Planning Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {config.paymentFlowType === "group_split" && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <p>Set up cost splitting early - collecting payments in advance reduces day-of stress</p>
                </div>
              )}
              {config.timingComplexity !== "low" && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <p>Consider building 15-30 minute buffers between activities for unexpected delays</p>
                </div>
              )}
              {groupSize > 6 && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <p>With larger groups, confirm dietary restrictions and accessibility needs early</p>
                </div>
              )}
              {config.contingencyLevel !== "flexible" && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <p>Identify backup options for weather-dependent or high-priority activities</p>
                </div>
              )}
              {durationDays > 5 && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <p>For extended trips, balance high-energy days with rest periods to avoid burnout</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
