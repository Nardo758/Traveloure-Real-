import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Star,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Lightbulb,
  Clock,
  Users,
  Camera,
  MapPin,
  Zap
} from "lucide-react";

interface CrowdForecastItem {
  hour: number;
  level: string;
  percent: number;
}

interface TipItem {
  tip: string;
  mentionCount: number;
}

export interface TravelPulseTrendingData {
  id: string;
  city: string;
  country?: string | null;
  destinationName: string;
  destinationType?: string | null;
  trendScore?: number | null;
  growthPercent?: number | null;
  mentionCount?: number | null;
  trendStatus?: string | null;
  triggerEvent?: string | null;
  liveScore?: string | null;
  liveScoreChange?: string | null;
  sentimentScore?: string | null;
  sentimentTrend?: string | null;
  worthItPercent?: number | null;
  mehPercent?: number | null;
  avoidPercent?: number | null;
  overallVerdict?: string | null;
  realityScore?: number | null;
  topHighlights?: string[] | null;
  topWarnings?: string[] | null;
  crowdsourcedTips?: TipItem[] | null;
  bestTimeToVisit?: string | null;
  worstTimeToVisit?: string | null;
  crowdForecast?: CrowdForecastItem[] | null;
  imageUrl?: string | null;
}

interface TravelPulseCardProps {
  data: TravelPulseTrendingData;
  compact?: boolean;
  onClick?: () => void;
}

function getSentimentIcon(trend: string | null | undefined) {
  switch (trend) {
    case "up": return <TrendingUp className="h-3 w-3 text-green-500" />;
    case "down": return <TrendingDown className="h-3 w-3 text-red-500" />;
    default: return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

function getVerdictColor(verdict: string | null | undefined) {
  switch (verdict) {
    case "highly_recommended": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "recommended": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "mixed": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "skip": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "";
  }
}

function getTrendStatusBadge(status: string | null | undefined) {
  switch (status) {
    case "viral": return <Badge variant="destructive" className="text-xs"><Zap className="h-3 w-3 mr-1" />Viral</Badge>;
    case "emerging": return <Badge variant="secondary" className="text-xs"><TrendingUp className="h-3 w-3 mr-1" />Emerging</Badge>;
    case "mainstream": return <Badge variant="outline" className="text-xs">Mainstream</Badge>;
    case "declining": return <Badge variant="outline" className="text-xs opacity-60">Declining</Badge>;
    default: return null;
  }
}

export function TravelPulseCard({ data, compact = false, onClick }: TravelPulseCardProps) {
  const liveScore = parseFloat(data.liveScore || "0");
  const liveScoreChange = parseFloat(data.liveScoreChange || "0");
  const worthIt = data.worthItPercent || 0;
  const meh = data.mehPercent || 0;
  const avoid = data.avoidPercent || 0;

  if (compact) {
    return (
      <Card 
        className="cursor-pointer hover-elevate transition-all" 
        onClick={onClick}
        data-testid={`card-travelpulse-${data.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{data.destinationName}</h3>
                {getTrendStatusBadge(data.trendStatus)}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{data.city}</span>
                {data.destinationType && (
                  <Badge variant="outline" className="ml-2 text-xs capitalize">{data.destinationType}</Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-lg font-bold">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {liveScore.toFixed(1)}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {getSentimentIcon(data.sentimentTrend)}
                <span className={liveScoreChange >= 0 ? "text-green-600" : "text-red-600"}>
                  {liveScoreChange >= 0 ? "+" : ""}{liveScoreChange.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
          
          {data.overallVerdict && (
            <Badge className={`mt-2 ${getVerdictColor(data.overallVerdict)}`}>
              {worthIt}% say worth it
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="overflow-hidden hover-elevate transition-all" 
      onClick={onClick}
      data-testid={`card-travelpulse-${data.id}`}
    >
      {data.imageUrl && (
        <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5">
          <img 
            src={data.imageUrl} 
            alt={data.destinationName} 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CardTitle className="text-lg">{data.destinationName}</CardTitle>
              {getTrendStatusBadge(data.trendStatus)}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{data.city}{data.country && `, ${data.country}`}</span>
              {data.destinationType && (
                <Badge variant="outline" className="text-xs capitalize">{data.destinationType}</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="flex items-center gap-1 text-2xl font-bold">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              {liveScore.toFixed(1)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground justify-center">
              {getSentimentIcon(data.sentimentTrend)}
              <span className={liveScoreChange >= 0 ? "text-green-600" : "text-red-600"}>
                {liveScoreChange >= 0 ? "+" : ""}{liveScoreChange.toFixed(1)} 24h
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">LiveScore</p>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{worthIt}%</div>
            <p className="text-xs text-muted-foreground">Worth It</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center gap-1 text-2xl font-bold">
              <Camera className="h-5 w-5 text-blue-500" />
              {data.realityScore || "?"}
            </div>
            <p className="text-xs text-muted-foreground">Reality Score</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Truth Check</p>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-green-500 transition-all cursor-help" 
                  style={{ width: `${worthIt}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{worthIt}% say it's worth it</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-yellow-500 transition-all cursor-help" 
                  style={{ width: `${meh}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{meh}% say it's okay</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-red-500 transition-all cursor-help" 
                  style={{ width: `${avoid}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{avoid}% say to avoid</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Worth it</span>
            <span>Meh</span>
            <span className="flex items-center gap-1">Avoid <ThumbsDown className="h-3 w-3" /></span>
          </div>
        </div>

        {data.topHighlights && data.topHighlights.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <ThumbsUp className="h-3 w-3 text-green-500" /> Highlights
            </p>
            <div className="flex flex-wrap gap-1">
              {data.topHighlights.slice(0, 3).map((highlight, i) => (
                <Badge key={i} variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {highlight}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.topWarnings && data.topWarnings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Warnings
            </p>
            <div className="flex flex-wrap gap-1">
              {data.topWarnings.slice(0, 2).map((warning, i) => (
                <Badge key={i} variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  {warning}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.crowdsourcedTips && data.crowdsourcedTips.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-blue-500" /> Top Tips
            </p>
            <ul className="space-y-1">
              {data.crowdsourcedTips.slice(0, 2).map((tip, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{tip.tip}</span>
                  <Badge variant="outline" className="text-xs ml-auto shrink-0">{tip.mentionCount}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(data.bestTimeToVisit || data.worstTimeToVisit) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Crowd Forecast
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {data.bestTimeToVisit && (
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-green-800 dark:text-green-400">
                  <span className="text-xs block text-green-600 dark:text-green-500">Best time</span>
                  {data.bestTimeToVisit}
                </div>
              )}
              {data.worstTimeToVisit && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-800 dark:text-red-400">
                  <span className="text-xs block text-red-600 dark:text-red-500">Avoid</span>
                  {data.worstTimeToVisit}
                </div>
              )}
            </div>
          </div>
        )}

        {data.triggerEvent && (
          <div className="p-2 bg-primary/5 rounded text-sm">
            <span className="text-xs text-muted-foreground">Why it's trending: </span>
            <span>{data.triggerEvent}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
