# TRAVELPULSE TECHNICAL SPEC - PART 3
## Frontend, API Documentation, Deployment & Implementation

---

## PART V: FRONTEND IMPLEMENTATION

### 18. TRAVELPULSE DASHBOARD UI

```tsx
// TravelPulse Main Dashboard
// Location: /app/(dashboard)/pulse/[destination]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LiveMap } from '@/components/pulse/live-map';
import { TrendingWidget } from '@/components/pulse/trending-widget';
import { CrowdHeatmap } from '@/components/pulse/crowd-heatmap';
import { AlertsFeed } from '@/components/pulse/alerts-feed';
import { useWebSocket } from '@/hooks/use-websocket';
import { formatDistanceToNow } from 'date-fns';

export default function PulseDashboardPage() {
  const { destination } = useParams();
  const [pulseData, setPulseData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Connect to real-time updates
  const { data: liveUpdates } = useWebSocket(`/pulse/${destination}`);
  
  // Fetch initial data
  useEffect(() => {
    fetch(`/api/pulse/live/${destination}`)
      .then(res => res.json())
      .then(data => {
        setPulseData(data.data);
        setLoading(false);
      });
  }, [destination]);
  
  // Update with live data
  useEffect(() => {
    if (liveUpdates) {
      setPulseData(prev => ({
        ...prev,
        ...liveUpdates
      }));
    }
  }, [liveUpdates]);
  
  if (loading) return <LoadingSkeleton />;
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">🌐 TravelPulse: {destination}</h1>
          <p className="text-muted-foreground">
            Real-time collective intelligence • Updated{' '}
            {formatDistanceToNow(pulseData.last_updated)} ago
          </p>
        </div>
        
        <div className="flex gap-2">
          <Badge variant="outline" className="animate-pulse">
            🔴 LIVE
          </Badge>
          <Badge variant="secondary">
            {pulseData.active_travelers} travelers active now
          </Badge>
        </div>
      </div>
      
      {/* Live Activity Map */}
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Live Activity Map</CardTitle>
        </CardHeader>
        <CardContent>
          <LiveMap
            destination={destination}
            currentActivity={pulseData.current_activity}
            crowdLevels={pulseData.crowd_levels}
          />
        </CardContent>
      </Card>
      
      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Trending */}
        <div className="space-y-6">
          <TrendingWidget data={pulseData.trending} />
          
          <Card>
            <CardHeader>
              <CardTitle>📉 Trending Down</CardTitle>
            </CardHeader>
            <CardContent>
              {pulseData.declining?.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2">
                  <span>{item.name}</span>
                  <Badge variant="destructive">
                    -{item.change}%
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        
        {/* Center Column: Alerts & Recommendations */}
        <div className="space-y-6">
          <AlertsFeed alerts={pulseData.alerts} />
          
          <Card>
            <CardHeader>
              <CardTitle>💡 Personalized Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pulseData.recommendations?.map((rec, idx) => (
                <Alert key={idx}>
                  <AlertDescription>
                    <strong>{rec.title}</strong>
                    <p className="text-sm mt-1">{rec.message}</p>
                    {rec.action_url && (
                      <Button 
                        size="sm" 
                        className="mt-2"
                        onClick={() => window.location.href = rec.action_url}
                      >
                        {rec.action_text}
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        </div>
        
        {/* Right Column: Crowd Forecast */}
        <div className="space-y-6">
          <CrowdHeatmap forecast={pulseData.crowd_forecast} />
          
          <Card>
            <CardHeader>
              <CardTitle>🎯 Quick Decisions</CardTitle>
            </CardHeader>
            <CardContent>
              <QuickDecisionWidget destination={destination} />
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Popular Places with LiveScore */}
      <Card>
        <CardHeader>
          <CardTitle>⭐ Top Places (LiveScore)</CardTitle>
        </CardHeader>
        <CardContent>
          <PlacesList places={pulseData.top_places} />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Trending Widget Component:**

```tsx
// Trending Experiences Widget
// Location: /components/pulse/trending-widget.tsx

export function TrendingWidget({ data }: { data: TrendingData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔥 Trending Now
          <Badge variant="outline">Last 6 hours</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((trend, idx) => (
          <div 
            key={idx}
            className="border-l-4 border-orange-500 pl-4 hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-semibold">{trend.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {trend.description}
                </p>
              </div>
              <Badge className="ml-2">
                +{trend.velocity}%
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>📈 {trend.mentions} mentions</span>
              <span>😊 {Math.round(trend.sentiment * 100)}% positive</span>
            </div>
            
            {trend.visit_window && (
              <Alert className="mt-2">
                <AlertDescription className="text-xs">
                  💡 {trend.visit_window}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Live Map Component:**

```tsx
// Live Activity Map
// Location: /components/pulse/live-map.tsx

import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

export function LiveMap({ 
  destination, 
  currentActivity, 
  crowdLevels 
}: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  useEffect(() => {
    if (!mapContainer.current) return;
    
    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: getDestinationCoords(destination),
      zoom: 12
    });
    
    // Add markers for active locations
    currentActivity.forEach(activity => {
      const el = document.createElement('div');
      el.className = 'crowd-marker';
      el.style.backgroundColor = getCrowdColor(activity.crowd_level);
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      
      // Pulse animation for high activity
      if (activity.recent_posts > 10) {
        el.classList.add('pulse-animation');
      }
      
      new mapboxgl.Marker(el)
        .setLngLat(activity.coords)
        .setPopup(
          new mapboxgl.Popup().setHTML(`
            <strong>${activity.place_name}</strong><br/>
            ${activity.recent_posts} posts (last hour)<br/>
            Crowd: ${activity.crowd_label}
          `)
        )
        .addTo(map.current);
    });
    
    return () => map.current?.remove();
  }, [destination, currentActivity]);
  
  return (
    <div>
      <div 
        ref={mapContainer} 
        className="w-full h-[500px] rounded-lg"
      />
      
      {/* Legend */}
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500" />
          <span className="text-sm">Quiet</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-yellow-500" />
          <span className="text-sm">Moderate</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500" />
          <span className="text-sm">Crowded</span>
        </div>
      </div>
    </div>
  );
}

function getCrowdColor(level: number): string {
  if (level < 40) return '#22c55e'; // Green
  if (level < 70) return '#eab308'; // Yellow
  return '#ef4444'; // Red
}
```

**Crowd Forecast Component:**

```tsx
// Crowd Forecast Heatmap
// Location: /components/pulse/crowd-heatmap.tsx

export function CrowdHeatmap({ forecast }: { forecast: CrowdForecastData }) {
  const maxCrowd = Math.max(...forecast.hourly_forecast.map(h => h.crowd_level));
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 Crowd Forecast (Next 24 Hours)</CardTitle>
        <CardDescription>
          Best times highlighted in green
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {forecast.hourly_forecast.map((hour, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-sm font-mono w-16">
                {hour.time}
              </span>
              
              <div className="flex-1 h-8 relative">
                {/* Bar */}
                <div 
                  className="absolute top-0 left-0 h-full rounded transition-all"
                  style={{
                    width: `${(hour.crowd_level / 100) * 100}%`,
                    backgroundColor: getCrowdColorFromLevel(hour.crowd_level)
                  }}
                />
                
                {/* Percentage */}
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white mix-blend-difference">
                  {hour.crowd_level}%
                </span>
              </div>
              
              <Badge 
                variant={hour.crowd_level < 50 ? 'default' : 'secondary'}
                className="w-20 justify-center"
              >
                {hour.label}
              </Badge>
            </div>
          ))}
        </div>
        
        {/* Optimal Windows */}
        {forecast.optimal_windows.length > 0 && (
          <Alert className="mt-4">
            <AlertDescription>
              <strong>💡 Best Times:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {forecast.optimal_windows.map((window, idx) => (
                  <li key={idx} className="text-sm">
                    {window.start_hour}:00 - {window.end_hour + 1}:00 
                    ({Math.round(window.avg_crowd)}% avg)
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Recommendations */}
        {forecast.recommendations.length > 0 && (
          <div className="mt-4 space-y-2">
            {forecast.recommendations.map((rec, idx) => (
              <p key={idx} className="text-sm text-muted-foreground">
                • {rec}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### 19. MOBILE EXPERIENCE

```tsx
// Mobile TravelPulse View
// Location: /app/(mobile)/pulse/[destination]/page.tsx

export default function MobilePulsePage() {
  const { destination } = useParams();
  const [activeTab, setActiveTab] = useState<'live' | 'trending' | 'forecast'>('live');
  
  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">🌐 {destination}</h1>
          <Badge className="animate-pulse">🔴 LIVE</Badge>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={activeTab === 'live' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('live')}
          >
            Live Now
          </Button>
          <Button
            variant={activeTab === 'trending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('trending')}
          >
            Trending
          </Button>
          <Button
            variant={activeTab === 'forecast' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('forecast')}
          >
            Forecast
          </Button>
        </div>
      </header>
      
      {/* Content */}
      <div className="p-4">
        {activeTab === 'live' && <LiveNowView destination={destination} />}
        {activeTab === 'trending' && <TrendingView destination={destination} />}
        {activeTab === 'forecast' && <ForecastView destination={destination} />}
      </div>
      
      {/* Quick Action Button */}
      <div className="fixed bottom-4 right-4 z-20">
        <QuickDecisionButton />
      </div>
    </div>
  );
}

// Quick Decision Floating Button
function QuickDecisionButton() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button
        size="lg"
        className="rounded-full w-14 h-14 shadow-lg"
        onClick={() => setOpen(true)}
      >
        🎯
      </Button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Should I Book This?</DialogTitle>
          </DialogHeader>
          
          <QuickDecisionForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

### 20. WIDGET COMPONENTS

**LiveScore Badge Widget:**

```tsx
// Embeddable LiveScore Badge
// Location: /components/pulse/livescore-badge.tsx

export function LiveScoreBadge({ placeId }: { placeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['livescore', placeId],
    queryFn: () => fetch(`/api/pulse/livescore/${placeId}`).then(r => r.json()),
    refetchInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  });
  
  if (isLoading) return <Skeleton className="h-12 w-32" />;
  
  const score = data?.data;
  
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className="text-2xl font-bold">{score.current.toFixed(1)}</span>
          <span className="text-lg text-muted-foreground">/5</span>
        </div>
        <span className="text-xs text-muted-foreground">
          LiveScore™
        </span>
      </div>
      
      {score.trend !== 'stable' && (
        <Badge variant={score.trend === 'up' ? 'default' : 'destructive'}>
          {score.trend === 'up' ? '↗' : '↘'}
        </Badge>
      )}
      
      <div className="text-xs text-muted-foreground">
        {score.mentions} mentions<br />
        {formatDistanceToNow(score.last_updated)} ago
      </div>
    </div>
  );
}
```

**Truth Check Widget:**

```tsx
// Truth Verification Widget
// Location: /components/pulse/truth-check-widget.tsx

export function TruthCheckWidget() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TruthVerificationData | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleCheck = async () => {
    setLoading(true);
    
    const response = await fetch('/api/pulse/verify-truth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    setResult(data.data);
    setLoading(false);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 Truth Check</CardTitle>
        <CardDescription>
          Verify any travel claim with real social proof
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder="Is Bamboo Forest worth it?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          />
          <Button onClick={handleCheck} disabled={loading || !query}>
            {loading ? 'Checking...' : 'Verify'}
          </Button>
        </div>
        
        {result && (
          <div className="mt-4 space-y-4">
            {/* Verdict */}
            <Alert variant={
              result.verdict === 'true' ? 'default' :
              result.verdict === 'false' ? 'destructive' : 'default'
            }>
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <strong className="text-lg">
                    {result.verdict.toUpperCase().replace('_', ' ')}
                  </strong>
                  <Badge>
                    {Math.round(result.confidence * 100)}% confidence
                  </Badge>
                </div>
              </AlertDescription>
            </Alert>
            
            {/* Evidence */}
            <div>
              <h4 className="font-semibold mb-2">Evidence:</h4>
              <div className="text-sm space-y-1">
                <p>✅ Supporting: {result.supporting_posts.length} posts</p>
                <p>❌ Contradicting: {result.contradicting_posts.length} posts</p>
                <p>📊 Total mentions: {result.total_mentions}</p>
              </div>
            </div>
            
            {/* Key Insights */}
            {result.common_themes.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Key Insights:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {result.common_themes.map((theme, idx) => (
                    <li key={idx}>{theme}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Warnings */}
            {result.warnings.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <strong>⚠️ Warnings:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {result.warnings.map((warning, idx) => (
                      <li key={idx} className="text-sm">{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Tips */}
            {result.tips.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">💡 Tips:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {result.tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## PART VI: API DOCUMENTATION

### 21. REST API ENDPOINTS

```typescript
/**
 * TravelPulse API Endpoints
 * Base URL: /api/pulse
 */

// ============================================
// LIVE INTELLIGENCE
// ============================================

/**
 * GET /api/pulse/live/:destination
 * Get comprehensive live intelligence for a destination
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     destination: "Kyoto",
 *     current_activity: ActivityData[],
 *     trending: TrendingData[],
 *     declining: DecliningData[],
 *     crowd_forecast: CrowdForecastData,
 *     alerts: Alert[],
 *     recommendations: Recommendation[],
 *     top_places: PlaceWithLiveScore[],
 *     active_travelers: number,
 *     last_updated: string
 *   }
 * }
 */

/**
 * GET /api/pulse/livescore/:placeId
 * Get LiveScore for a specific place
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     current: 4.7,
 *     trend: "up",
 *     mentions: 47,
 *     sentiment_avg: 0.8,
 *     confidence: 0.85,
 *     hourly_breakdown: HourlyScore[],
 *     insights: string[],
 *     anomaly: AnomalyData | null,
 *     last_updated: string
 *   }
 * }
 */

// ============================================
// TRUTH VERIFICATION
// ============================================

/**
 * POST /api/pulse/verify-truth
 * Verify a travel claim or question
 * 
 * Request:
 * {
 *   query: "Is Bamboo Forest worth it?",
 *   destination?: "Kyoto"
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     verdict: "mostly_true",
 *     confidence: 0.75,
 *     total_mentions: 147,
 *     supporting_posts: string[],
 *     contradicting_posts: string[],
 *     common_themes: string[],
 *     warnings: string[],
 *     tips: string[],
 *     photo_reality_gap: -15
 *   }
 * }
 */

// ============================================
// EMERGING EXPERIENCES
// ============================================

/**
 * GET /api/pulse/emerging/:destination
 * Get emerging experiences in a destination
 * 
 * Query params:
 * - min_velocity?: number (default: 150)
 * - limit?: number (default: 10)
 * 
 * Response:
 * {
 *   success: true,
 *   data: EmergingExperience[]
 * }
 */

// ============================================
// CROWD PREDICTION
// ============================================

/**
 * GET /api/pulse/crowd-forecast/:placeId
 * Get crowd forecast for a place
 * 
 * Query params:
 * - date?: string (ISO format, default: tomorrow)
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     date: string,
 *     hourly_forecast: HourlyForecast[],
 *     optimal_windows: OptimalWindow[],
 *     recommendations: string[],
 *     factors: {
 *       weather: string,
 *       events: string[],
 *       social_trend: string,
 *       holiday: boolean
 *     },
 *     confidence: number
 *   }
 * }
 */

// ============================================
// DECISION ANALYSIS
// ============================================

/**
 * POST /api/pulse/should-i-book
 * Analyze whether to book something
 * 
 * Request:
 * {
 *   item_type: "tour" | "restaurant" | "hotel" | "activity",
 *   item_name: string,
 *   item_url?: string,
 *   user_profile?: object
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     recommendation: "highly_recommend" | "recommend" | "neutral" | "avoid",
 *     confidence: 0.87,
 *     probability_satisfaction: 0.82,
 *     social_proof: {
 *       total_mentions: 47,
 *       positive_rate: 0.89,
 *       standout_mentions: string[]
 *     },
 *     verification: {
 *       verified_users: 42,
 *       bot_rate: 0.11,
 *       spam_detected: false
 *     },
 *     value_analysis: {
 *       reported_price: 120,
 *       competitor_avg: 95,
 *       verdict: "Worth the premium"
 *     }
 *   }
 * }
 */

// ============================================
// CONSENSUS
// ============================================

/**
 * GET /api/pulse/consensus/:placeId
 * Get local vs tourist consensus for a place
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     local: {
 *       rating: 4.5,
 *       favorite_aspects: string[],
 *       tips: string[]
 *     },
 *     tourist: {
 *       rating: 4.2,
 *       favorite_aspects: string[],
 *       complaints: string[]
 *     },
 *     consensus: {
 *       score: 0.8,
 *       universal_praise: string[],
 *       divergence_points: string[],
 *       tourist_recommendations: string[]
 *     }
 *   }
 * }
 */
```

---

### 22. WEBSOCKET EVENTS

```typescript
/**
 * WebSocket Real-Time Updates
 * Connect to: ws://api.traveloure.com/pulse/:destination
 */

// Client Connection
const socket = io('/pulse/kyoto', {
  auth: { token: userToken }
});

// ============================================
// EVENTS FROM SERVER
// ============================================

// New trending experience detected
socket.on('trending:new', (data: {
  experience: EmergingExperience,
  destination: string
}) => {
  // Show notification
});

// LiveScore update for subscribed places
socket.on('livescore:update', (data: {
  place_id: string,
  score: LiveScoreData
}) => {
  // Update UI
});

// Crowd alert (sudden spike)
socket.on('crowd:alert', (data: {
  place_id: string,
  place_name: string,
  crowd_level: number,
  message: string
}) => {
  // Show alert
});

// Real-time activity update
socket.on('activity:update', (data: {
  destination: string,
  active_count: number,
  recent_posts: Post[]
}) => {
  // Update live map
});

// New alert created
socket.on('alert:new', (data: Alert) => {
  // Add to alerts feed
});

// ============================================
// EVENTS FROM CLIENT
// ============================================

// Subscribe to place updates
socket.emit('subscribe:place', { place_id: '...' });

// Unsubscribe
socket.emit('unsubscribe:place', { place_id: '...' });

// Track user location (for live map)
socket.emit('location:update', {
  place_id: '...',
  coords: { lat: 35.0116, lng: 135.7681 }
});
```

---

### 23. RATE LIMITING & AUTHENTICATION

```typescript
// Rate Limiting Configuration
// Location: /server/middleware/rate-limit.middleware.ts

export const rateLimitPulse = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, IP otherwise
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for premium users
    return req.user?.subscription === 'premium';
  }
});

// Different limits for different tiers
export const getRateLimit = (tier: 'free' | 'basic' | 'premium') => {
  const limits = {
    free: { windowMs: 60000, max: 20 },
    basic: { windowMs: 60000, max: 60 },
    premium: { windowMs: 60000, max: 300 }
  };
  
  return rateLimit(limits[tier]);
};
```

---

## PART VII: DEPLOYMENT & OPERATIONS

### 24. INFRASTRUCTURE SETUP

**Architecture Overview:**

```yaml
Production Infrastructure:

Frontend:
  - Cloudflare Pages
  - Global CDN
  - Edge caching
  - DDoS protection

Backend API:
  - Railway (2 instances, load balanced)
  - Auto-scaling: 2-10 instances
  - Health checks every 30s
  - Region: US-East

Worker Services:
  - Railway (separate service)
  - 5 worker instances
  - Bull queue processing
  - Redis: Upstash

Databases:
  - PostgreSQL: Neon (Serverless)
  - Redis: Upstash (Global)
  - TimescaleDB: Neon extension

Monitoring:
  - Sentry: Error tracking
  - LogRocket: Session replay
  - PostHog: Analytics
  - Custom metrics: Prometheus

CDN & Assets:
  - Cloudflare R2: Image storage
  - Mapbox: Map tiles
  - External APIs cached via Redis
```

**Environment Variables (Production):**

```bash
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# AI Services
XAI_API_KEY=xai-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx

# External Services
MAPBOX_ACCESS_TOKEN=pk.xxxxx
WEATHER_API_KEY=xxxxx

# Authentication
JWT_SECRET=xxxxx
SESSION_SECRET=xxxxx

# Monitoring
SENTRY_DSN=https://...
LOGROCKET_APP_ID=xxxxx
POSTHOG_API_KEY=xxxxx

# Feature Flags
ENABLE_TRAVELPULSE=true
ENABLE_REALTIME_UPDATES=true
ENABLE_CROWD_PREDICTION=true

# Performance
ENABLE_CACHE=true
CACHE_TTL_SECONDS=300
MAX_CONCURRENT_AI_REQUESTS=50
```

**Docker Compose (Development):**

```yaml
# docker-compose.yml

version: '3.8'

services:
  # Backend API
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/traveloure
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - ./server:/app/server
    command: npm run dev

  # Worker Service
  worker:
    build: .
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/traveloure
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    command: npm run worker

  # PostgreSQL
  db:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_DB: traveloure
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

### 25. MONITORING & ALERTS

**Health Check Endpoint:**

```typescript
// Health Check
// Location: /server/routes/health.route.ts

router.get('/health', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    grok_api: false,
    queue: false
  };
  
  try {
    // Database
    await db.execute(sql`SELECT 1`);
    checks.database = true;
    
    // Redis
    await redis.ping();
    checks.redis = true;
    
    // Grok API (cached check)
    const grokStatus = await redis.get('health:grok');
    checks.grok_api = grokStatus === 'ok';
    
    // Queue
    const queueHealth = await xCollectorQueue.getJobCounts();
    checks.queue = queueHealth.active < 100; // Not overwhelmed
    
    const healthy = Object.values(checks).every(Boolean);
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      checks,
      error: error.message
    });
  }
});
```

**Monitoring Dashboard:**

```typescript
// Metrics Endpoint
// Location: /server/routes/metrics.route.ts

router.get('/metrics', async (req, res) => {
  const metrics = {
    // System
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    
    // Database
    db_connections: await getActiveConnections(),
    
    // Queue
    queue_stats: {
      waiting: await xCollectorQueue.getWaitingCount(),
      active: await xCollectorQueue.getActiveCount(),
      completed: await xCollectorQueue.getCompletedCount(),
      failed: await xCollectorQueue.getFailedCount()
    },
    
    // AI Usage
    ai_requests_today: await getAIRequestCount(new Date()),
    ai_cost_today: await getAICostToday(),
    
    // TravelPulse
    live_updates_sent: await redis.get('metrics:live_updates'),
    active_destinations: await redis.scard('active:destinations'),
    
    // Performance
    avg_response_time: await getAvgResponseTime(),
    error_rate: await getErrorRate()
  };
  
  res.json(metrics);
});
```

**Alert Configuration:**

```typescript
// Alert Thresholds
const ALERTS = {
  // System
  cpu_usage_percent: 80,
  memory_usage_percent: 85,
  disk_usage_percent: 90,
  
  // Database
  db_connections_max: 90,
  slow_query_ms: 5000,
  
  // Queue
  queue_backlog_max: 1000,
  failed_jobs_percent: 10,
  
  // AI
  daily_cost_usd: 100,
  request_latency_ms: 10000,
  error_rate_percent: 5,
  
  // Business
  zero_data_collection_minutes: 60,
  stale_livescores_minutes: 15
};

// Send alert via Slack
async function sendAlert(alert: Alert) {
  await slackService.send({
    channel: '#pulse-alerts',
    text: `🚨 ${alert.severity.toUpperCase()}: ${alert.message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.title}*\n${alert.message}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Triggered: ${new Date().toISOString()}\nSeverity: ${alert.severity}`
          }
        ]
      }
    ]
  });
}
```

---

### 26. COST ANALYSIS & OPTIMIZATION

**Monthly Cost Breakdown (At Scale - 10K users):**

```
INFRASTRUCTURE:
├─ Cloudflare Pages: $0 (free tier)
├─ Railway API (2 instances): $20/mo
├─ Railway Workers (5 instances): $50/mo
├─ Neon PostgreSQL: $19/mo (Pro plan)
├─ Upstash Redis: $10/mo
└─ SUBTOTAL: $99/mo

AI SERVICES:
├─ Grok API (estimated):
│   ├─ Data Collection: 500K tokens/day × $2/1M = $1/day = $30/mo
│   ├─ Processing: 1M tokens/day × $2/1M = $2/day = $60/mo
│   ├─ User Queries: 300K tokens/day × $2/1M = $0.60/day = $18/mo
│   └─ SUBTOTAL: $108/mo
└─ Total AI: $108/mo

EXTERNAL SERVICES:
├─ Mapbox: $10/mo (pay-as-you-go)
├─ Weather API: $15/mo
├─ Twilio (SMS alerts): $25/mo
├─ SendGrid (emails): $15/mo
└─ SUBTOTAL: $65/mo

MONITORING:
├─ Sentry: $26/mo (Team plan)
├─ LogRocket: $99/mo (Pro plan)
├─ PostHog: $20/mo (estimated)
└─ SUBTOTAL: $145/mo

────────────────────────────
TOTAL MONTHLY COST: ~$417/mo
COST PER USER: $0.042/mo
────────────────────────────

REVENUE (if $9.99/mo premium @ 15% conversion):
10,000 users × 15% × $9.99 = $14,985/mo
NET PROFIT: $14,568/mo (ROI: 3,492%)
```

**Cost Optimization Strategies:**

1. **Aggressive Caching** - 70% cache hit rate = 70% cost reduction
2. **Smart Batch Processing** - Collect data every 30 min vs real-time
3. **Tiered Access** - Free users get 5-min delayed data, premium gets real-time
4. **CDN Everything** - Cloudflare caching for all static API responses
5. **Optimize Prompts** - Reduce token usage by 30% through prompt engineering

---

### 27. IMPLEMENTATION ROADMAP

**Week 1-2: Foundation**
```
✓ Set up database schemas
✓ Deploy infrastructure (Railway, Neon, Upstash)
✓ Implement Grok data collection workers
✓ Build post processing pipeline
✓ Test end-to-end data flow
```

**Week 3-4: Core Features**
```
✓ LiveScore engine
✓ Truth verification API
✓ Basic frontend dashboard
✓ WebSocket real-time updates
✓ Initial testing with 1 destination (Kyoto)
```

**Week 5-6: Advanced Features**
```
✓ Emerging experience detector
✓ Crowd prediction engine
✓ Decision analysis engine
✓ Mobile experience
✓ Expand to 3 destinations
```

**Week 7-8: Polish & Launch**
```
✓ Performance optimization
✓ Monitoring & alerts setup
✓ Documentation
✓ Beta testing
✓ Public launch (all 8 destinations)
```

**Post-Launch (Ongoing):**
```
✓ Monitor costs and optimize
✓ Gather user feedback
✓ Improve ML models
✓ Add more features based on usage
✓ Scale to more destinations
```

---

## CONCLUSION

TravelPulse transforms Traveloure from a simple expert marketplace into **the truth layer for travel**. By leveraging Grok's unique X integration and real-time capabilities, you create an unfair advantage that competitors cannot easily replicate.

### Key Differentiators:
1. **Real-Time Intelligence** - Minutes old, not months
2. **Crowd-Sourced Truth** - Thousands of real experiences, not paid reviews
3. **Predictive Insights** - Know what will happen before it does
4. **Social Proof at Scale** - Verify any claim instantly
5. **Live Activity Tracking** - See what's happening right now

### Business Impact:
- **Premium Feature** - $9.99/mo subscription tier
- **Higher Conversions** - Better recommendations = more bookings
- **Viral Growth** - "You won't believe what this app showed me..."
- **Data Moat** - More users = better predictions = more users

### Implementation Priority:
1. **Month 1**: LiveScore + Truth Verification (core value)
2. **Month 2**: Emerging Detector + Real-time Map (virality)
3. **Month 3**: Crowd Prediction + Decision Engine (stickiness)

This spec provides everything needed for production deployment. Ready to build?

