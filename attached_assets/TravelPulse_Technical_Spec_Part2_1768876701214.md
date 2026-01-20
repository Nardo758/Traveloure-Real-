# TRAVELPULSE TECHNICAL SPEC - PART 2
## Backend Services, Frontend, Data Workers & Deployment

---

## PART III: BACKEND IMPLEMENTATION (CONTINUED)

### 10. EMERGING EXPERIENCE DETECTOR

```typescript
// Emerging Experience Detector Service
// Location: /server/services/pulse/emerging-detector.service.ts

export class EmergingDetectorService {
  /**
   * Detect emerging experiences in a destination
   */
  async detectEmerging(destination: string): Promise<EmergingExperience[]> {
    // Get baseline data (what's normal)
    const baseline = await this.getBaseline(destination);
    
    // Get recent activity (last 7 days)
    const recentActivity = await this.getRecentActivity(destination);
    
    // Calculate velocity (rate of change)
    const emerging = this.identifyEmerging(baseline, recentActivity);
    
    // Use Grok to validate and enrich
    const validated = await this.validateWithGrok(emerging, destination);
    
    // Save to database
    for (const exp of validated) {
      await this.saveEmergingExperience(exp);
    }
    
    return validated;
  }
  
  /**
   * Get baseline mention rates for all experiences
   */
  private async getBaseline(destination: string): Promise<Map<string, number>> {
    // Get historical average mentions per day for each experience
    const baseline = new Map<string, number>();
    
    // Query last 30 days (excluding last 7 days)
    const historicalPosts = await db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.destination, destination),
        gte(socialPosts.posted_at, subDays(new Date(), 30)),
        lt(socialPosts.posted_at, subDays(new Date(), 7))
      )
    });
    
    // Count mentions per experience
    const experienceCounts: Record<string, number> = {};
    
    historicalPosts.forEach(post => {
      post.experiences_mentioned?.forEach(exp => {
        experienceCounts[exp] = (experienceCounts[exp] || 0) + 1;
      });
    });
    
    // Calculate daily average
    const days = 23; // 30 - 7
    Object.entries(experienceCounts).forEach(([exp, count]) => {
      baseline.set(exp, count / days);
    });
    
    return baseline;
  }
  
  /**
   * Get recent activity (last 7 days)
   */
  private async getRecentActivity(destination: string): Promise<Map<string, ActivityData>> {
    const recentPosts = await db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.destination, destination),
        gte(socialPosts.posted_at, subDays(new Date(), 7))
      )
    });
    
    const activity = new Map<string, ActivityData>();
    
    recentPosts.forEach(post => {
      post.experiences_mentioned?.forEach(exp => {
        if (!activity.has(exp)) {
          activity.set(exp, {
            mentions: 0,
            unique_users: new Set(),
            avg_sentiment: 0,
            sentiment_sum: 0,
            post_ids: [],
            first_mention: post.posted_at,
            trigger_post: null
          });
        }
        
        const data = activity.get(exp)!;
        data.mentions++;
        data.unique_users.add(post.author_handle);
        data.sentiment_sum += post.sentiment_score;
        data.post_ids.push(post.post_id);
        
        // Track potential trigger post (viral moment)
        if (!data.trigger_post || post.likes_count > data.trigger_post.likes_count) {
          data.trigger_post = {
            post_id: post.post_id,
            author: post.author_handle,
            likes_count: post.likes_count,
            posted_at: post.posted_at
          };
        }
      });
    });
    
    // Calculate averages
    activity.forEach((data, exp) => {
      data.avg_sentiment = data.sentiment_sum / data.mentions;
      data.unique_user_count = data.unique_users.size;
    });
    
    return activity;
  }
  
  /**
   * Identify emerging experiences by velocity
   */
  private identifyEmerging(
    baseline: Map<string, number>,
    recent: Map<string, ActivityData>
  ): EmergingCandidate[] {
    const emerging: EmergingCandidate[] = [];
    
    recent.forEach((activity, experience) => {
      const baselineRate = baseline.get(experience) || 0.1; // Default tiny baseline
      const recentRate = activity.mentions / 7; // Daily average
      
      // Calculate velocity (percentage change)
      const velocity = ((recentRate - baselineRate) / baselineRate) * 100;
      
      // Threshold: >150% growth = emerging
      if (velocity > 150 && activity.mentions >= 10) { // Minimum 10 mentions
        emerging.push({
          name: experience,
          baseline_rate: baselineRate,
          recent_rate: recentRate,
          velocity,
          mentions: activity.mentions,
          unique_users: activity.unique_user_count,
          sentiment: activity.avg_sentiment,
          post_ids: activity.post_ids,
          trigger_post: activity.trigger_post,
          first_mention: activity.first_mention
        });
      }
    });
    
    // Sort by velocity
    emerging.sort((a, b) => b.velocity - a.velocity);
    
    return emerging.slice(0, 20); // Top 20
  }
  
  /**
   * Validate with Grok and add context
   */
  private async validateWithGrok(
    candidates: EmergingCandidate[],
    destination: string
  ): Promise<EmergingExperience[]> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast',
      tools: [x_search(), web_search()]
    });
    
    chat.append(system(`
      Analyze emerging travel experiences and provide context.
      
      For each experience:
      1. Verify it's a real trend (not noise)
      2. Categorize the type (restaurant, activity, attraction, etc)
      3. Identify the trigger (influencer post, event, organic discovery)
      4. Predict trajectory (when will it peak, when mainstream)
      5. Provide actionable recommendation
      
      Output JSON array with enriched data.
    `));
    
    chat.append(user(`
      Destination: ${destination}
      
      Emerging Candidates:
      ${JSON.stringify(candidates.map(c => ({
        name: c.name,
        velocity: c.velocity,
        mentions: c.mentions,
        sentiment: c.sentiment
      })), null, 2)}
      
      Validate and enrich each. Filter out false positives.
    `));
    
    const response = await chat.sample();
    const enriched = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '[]'
    );
    
    // Merge with original data
    return enriched.map((item: any) => {
      const original = candidates.find(c => 
        c.name.toLowerCase() === item.name.toLowerCase()
      );
      
      if (!original) return null;
      
      return {
        name: item.name,
        destination,
        category: item.category,
        description: item.description,
        trend_score: original.mentions,
        velocity_change: original.velocity,
        baseline_mentions: Math.round(original.baseline_rate * 7),
        current_mentions: original.mentions,
        first_detected: original.first_mention,
        trend_started: this.estimateTrendStart(original),
        peak_predicted: this.predictPeak(original),
        mainstream_predicted: this.predictMainstream(original),
        trend_stage: this.calculateStage(original.velocity, original.mentions),
        confidence: this.calculateConfidence(original),
        trigger_type: item.trigger_type,
        trigger_details: {
          post_id: original.trigger_post?.post_id,
          author: original.trigger_post?.author,
          viral_at: original.trigger_post?.posted_at
        },
        visit_window: item.visit_window || this.generateVisitWindow(original)
      };
    }).filter(Boolean);
  }
  
  /**
   * Estimate when trend started
   */
  private estimateTrendStart(candidate: EmergingCandidate): Date {
    // Assume linear growth, work backwards
    const daysToDouble = 7 / Math.log2(candidate.velocity / 100 + 1);
    return subDays(new Date(), Math.round(daysToDouble));
  }
  
  /**
   * Predict peak
   */
  private predictPeak(candidate: EmergingCandidate): Date {
    // Simple heuristic: Peak happens at 2-3x current growth rate
    const weeksToDouble = 1 / Math.log2(candidate.velocity / 100 + 1);
    const weeksToPeak = weeksToDouble * 2;
    return addWeeks(new Date(), Math.round(weeksToPeak));
  }
  
  /**
   * Predict mainstream
   */
  private predictMainstream(candidate: EmergingCandidate): Date {
    // Mainstream = 5x current mentions
    const weeksToDouble = 1 / Math.log2(candidate.velocity / 100 + 1);
    const weeksToMainstream = weeksToDouble * 3;
    return addWeeks(new Date(), Math.round(weeksToMainstream));
  }
  
  /**
   * Calculate trend stage
   */
  private calculateStage(velocity: number, mentions: number): string {
    if (velocity > 500 && mentions > 100) return 'viral';
    if (velocity > 300) return 'rising';
    if (velocity > 150) return 'emerging';
    return 'stable';
  }
  
  /**
   * Calculate confidence
   */
  private calculateConfidence(candidate: EmergingCandidate): number {
    let confidence = 0;
    
    // Mention volume (0-0.4)
    confidence += Math.min(0.4, candidate.mentions / 50);
    
    // User diversity (0-0.3)
    confidence += Math.min(0.3, candidate.unique_users / 30);
    
    // Velocity (0-0.2)
    confidence += Math.min(0.2, candidate.velocity / 1000);
    
    // Sentiment (0-0.1)
    confidence += candidate.sentiment > 0.5 ? 0.1 : 0;
    
    return parseFloat(confidence.toFixed(3));
  }
  
  /**
   * Generate visit window recommendation
   */
  private generateVisitWindow(candidate: EmergingCandidate): string {
    const peakDate = this.predictPeak(candidate);
    const weeksUntilPeak = Math.round(
      (peakDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    );
    
    if (weeksUntilPeak < 2) {
      return "Visit NOW - will be overcrowded soon";
    } else if (weeksUntilPeak < 4) {
      return `Visit in next ${weeksUntilPeak} weeks before it peaks`;
    } else {
      return "Still relatively unknown - plenty of time";
    }
  }
  
  /**
   * Save to database
   */
  private async saveEmergingExperience(exp: EmergingExperience) {
    // Check if already exists
    const existing = await db.query.emergingExperiences.findFirst({
      where: and(
        eq(emergingExperiences.name, exp.name),
        eq(emergingExperiences.destination, exp.destination)
      )
    });
    
    if (existing) {
      // Update
      await db.update(emergingExperiences)
        .set({
          trend_score: exp.trend_score,
          velocity_change: exp.velocity_change,
          current_mentions: exp.current_mentions,
          peak_predicted: exp.peak_predicted,
          mainstream_predicted: exp.mainstream_predicted,
          trend_stage: exp.trend_stage,
          confidence: exp.confidence,
          updated_at: new Date()
        })
        .where(eq(emergingExperiences.id, existing.id));
    } else {
      // Insert
      await db.insert(emergingExperiences).values(exp);
    }
  }
}
```

---

### 11. LOCAL VS TOURIST CONSENSUS

```typescript
// Consensus Service
// Location: /server/services/pulse/consensus.service.ts

export class ConsensusService {
  /**
   * Analyze local vs tourist perspectives for a place
   */
  async analyzeConsensus(placeId: string): Promise<ConsensusData> {
    const place = await db.query.places.findFirst({
      where: eq(places.id, placeId)
    });
    
    if (!place) throw new Error('Place not found');
    
    // Get posts from last 30 days
    const posts = await db.query.socialPosts.findMany({
      where: and(
        arrayContains(socialPosts.places_mentioned, [place.name]),
        gte(socialPosts.posted_at, subDays(new Date(), 30)),
        not(eq(socialPosts.user_type, 'unknown'))
      )
    });
    
    // Separate by user type
    const localPosts = posts.filter(p => p.user_type === 'local');
    const touristPosts = posts.filter(p => p.user_type === 'tourist');
    
    if (localPosts.length < 3 && touristPosts.length < 3) {
      return null; // Not enough data
    }
    
    // Analyze each perspective
    const localPerspective = await this.analyzePerspective(localPosts, 'local', place);
    const touristPerspective = await this.analyzePerspective(touristPosts, 'tourist', place);
    
    // Find consensus and divergence
    const consensus = await this.findConsensus(
      localPerspective,
      touristPerspective,
      place
    );
    
    // Save to database
    await db.insert(consensusData).values({
      place_id: placeId,
      local_rating: localPerspective.rating,
      local_mentions: localPosts.length,
      local_favorite_aspects: localPerspective.favorite_aspects,
      local_avoid: localPerspective.avoid,
      tourist_rating: touristPerspective.rating,
      tourist_mentions: touristPosts.length,
      tourist_favorite_aspects: touristPerspective.favorite_aspects,
      tourist_complaints: touristPerspective.complaints,
      consensus_score: consensus.score,
      divergence_points: consensus.divergence_points,
      universal_praise: consensus.universal_praise,
      local_tips: localPerspective.tips,
      best_for_tourists: consensus.tourist_recommendations,
      period_start: subDays(new Date(), 30),
      period_end: new Date()
    });
    
    return {
      local: localPerspective,
      tourist: touristPerspective,
      consensus
    };
  }
  
  /**
   * Analyze perspective using Grok
   */
  private async analyzePerspective(
    posts: SocialPost[],
    perspective: 'local' | 'tourist',
    place: Place
  ): Promise<PerspectiveData> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast'
    });
    
    chat.append(system(`
      Analyze ${perspective} perspectives on a place.
      
      Extract:
      - What they love most
      - Common complaints or warnings
      - Specific tips and recommendations
      - Overall sentiment
      
      Output JSON:
      {
        "rating": 4.2,
        "favorite_aspects": ["authentic local food", "friendly staff"],
        "complaints": ["touristy prices"],
        "tips": ["Visit during lunch hours", "Try the chef's special"],
        "sentiment": 0.7
      }
    `));
    
    chat.append(user(`
      Place: ${place.name}
      Perspective: ${perspective}
      
      Posts (${posts.length} total):
      ${JSON.stringify(posts.slice(0, 30).map(p => ({
        content: p.content,
        sentiment: p.sentiment_score
      })), null, 2)}
      
      What does the ${perspective} perspective say?
    `));
    
    const response = await chat.sample();
    const result = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '{}'
    );
    
    return {
      rating: result.rating || 0,
      favorite_aspects: result.favorite_aspects || [],
      complaints: result.complaints || [],
      avoid: result.avoid || [],
      tips: result.tips || [],
      sentiment: result.sentiment || 0
    };
  }
  
  /**
   * Find consensus and divergence
   */
  private async findConsensus(
    local: PerspectiveData,
    tourist: PerspectiveData,
    place: Place
  ): Promise<ConsensusAnalysis> {
    // Calculate consensus score (how much they agree)
    const ratingDelta = Math.abs(local.rating - tourist.rating);
    const consensusScore = Math.max(0, 1 - (ratingDelta / 5));
    
    // Find common ground
    const universalPraise = local.favorite_aspects.filter(aspect =>
      tourist.favorite_aspects.some(t => 
        this.similarText(aspect, t)
      )
    );
    
    // Find divergence points
    const divergence: string[] = [];
    
    // What locals love but tourists complain about
    local.favorite_aspects.forEach(aspect => {
      const touristComplaint = tourist.complaints.find(c =>
        this.similarText(aspect, c)
      );
      if (touristComplaint) {
        divergence.push(`Locals love ${aspect}, but tourists find it ${touristComplaint}`);
      }
    });
    
    // Use Grok for strategic recommendations
    const recommendations = await this.generateRecommendations(
      local,
      tourist,
      place
    );
    
    return {
      score: parseFloat(consensusScore.toFixed(3)),
      universal_praise: universalPraise,
      divergence_points: divergence,
      tourist_recommendations: recommendations
    };
  }
  
  /**
   * Generate strategic recommendations
   */
  private async generateRecommendations(
    local: PerspectiveData,
    tourist: PerspectiveData,
    place: Place
  ): Promise<string[]> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast'
    });
    
    chat.append(system(`
      Based on local vs tourist perspectives, provide strategic recommendations.
      
      Format: Bullet points, specific and actionable.
      Examples:
      - "Visit during lunch hours when locals eat (12-1pm) for authentic experience"
      - "Order off-menu items that locals recommend"
      - "Skip the tourist menu, ask for local specialties"
    `));
    
    chat.append(user(`
      Local perspective: ${JSON.stringify(local)}
      Tourist perspective: ${JSON.stringify(tourist)}
      
      How can tourists get the best of both worlds?
      Provide 3-5 specific recommendations.
    `));
    
    const response = await chat.sample();
    const text = response.content.find(c => c.type === 'text')?.text || '';
    
    return text
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map(line => line.replace(/^[•\-]\s*/, '').trim())
      .filter(line => line.length > 10)
      .slice(0, 5);
  }
  
  /**
   * Check if two texts are similar (fuzzy matching)
   */
  private similarText(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const na = normalize(a);
    const nb = normalize(b);
    
    // Simple substring check
    return na.includes(nb) || nb.includes(na);
  }
}
```

---

### 12. CROWD PREDICTION ENGINE

```typescript
// Crowd Prediction Service
// Location: /server/services/pulse/crowd-prediction.service.ts

export class CrowdPredictionService {
  /**
   * Predict crowd levels for a place
   */
  async predictCrowds(
    placeId: string,
    date: Date
  ): Promise<CrowdForecastData> {
    const place = await db.query.places.findFirst({
      where: eq(places.id, placeId)
    });
    
    if (!place) throw new Error('Place not found');
    
    // Get historical crowd patterns
    const historicalPatterns = await this.getHistoricalPatterns(placeId, date);
    
    // Get real-time signals
    const realTimeSignals = await this.getRealTimeSignals(place, date);
    
    // Apply ML model (or heuristics for MVP)
    const prediction = this.calculatePrediction(
      historicalPatterns,
      realTimeSignals,
      date
    );
    
    return prediction;
  }
  
  /**
   * Get historical crowd patterns
   */
  private async getHistoricalPatterns(
    placeId: string,
    targetDate: Date
  ): Promise<HistoricalPattern> {
    const dayOfWeek = targetDate.getDay();
    const month = targetDate.getMonth();
    
    // Get same day of week, same month from past data
    const patterns = await db.query.crowdPatterns.findMany({
      where: and(
        eq(crowdPatterns.place_id, placeId),
        eq(crowdPatterns.day_of_week, dayOfWeek)
      ),
      orderBy: desc(crowdPatterns.timestamp),
      limit: 100
    });
    
    if (patterns.length === 0) {
      return { hourly_avg: Array(24).fill(50), confidence: 0.3 };
    }
    
    // Calculate hourly averages
    const hourlyData: number[][] = Array(24).fill(null).map(() => []);
    
    patterns.forEach(p => {
      hourlyData[p.hour_of_day].push(p.crowd_level);
    });
    
    const hourly_avg = hourlyData.map(hourData => {
      if (hourData.length === 0) return 50; // Default
      return hourData.reduce((a, b) => a + b, 0) / hourData.length;
    });
    
    return {
      hourly_avg,
      confidence: Math.min(1, patterns.length / 50)
    };
  }
  
  /**
   * Get real-time signals that affect crowds
   */
  private async getRealTimeSignals(
    place: Place,
    date: Date
  ): Promise<RealTimeSignals> {
    // Weather forecast
    const weather = await this.getWeatherForecast(place.coords, date);
    
    // Check for special events
    const events = await this.checkForEvents(place.destination, date);
    
    // Social media buzz (trending?)
    const socialBuzz = await this.getSocialBuzz(place);
    
    // Holiday check
    const isHoliday = await this.isHoliday(date, place.destination);
    
    return {
      weather,
      events,
      social_buzz: socialBuzz,
      is_holiday: isHoliday
    };
  }
  
  /**
   * Calculate prediction
   */
  private calculatePrediction(
    historical: HistoricalPattern,
    signals: RealTimeSignals,
    date: Date
  ): CrowdForecastData {
    const hourly_forecast: HourlyForecast[] = [];
    
    for (let hour = 0; hour < 24; hour++) {
      let base_level = historical.hourly_avg[hour];
      
      // Weather adjustment
      if (signals.weather === 'rainy') base_level *= 0.7;
      else if (signals.weather === 'sunny') base_level *= 1.2;
      
      // Holiday adjustment
      if (signals.is_holiday) base_level *= 1.4;
      
      // Event adjustment
      if (signals.events.length > 0) base_level *= 1.3;
      
      // Social buzz adjustment
      if (signals.social_buzz > 1.5) base_level *= 1.2;
      
      // Cap at 100
      base_level = Math.min(100, base_level);
      
      // Determine label
      let label: string;
      if (base_level < 20) label = 'empty';
      else if (base_level < 40) label = 'quiet';
      else if (base_level < 60) label = 'moderate';
      else if (base_level < 80) label = 'busy';
      else label = 'packed';
      
      hourly_forecast.push({
        hour,
        time: `${hour}:00`,
        crowd_level: Math.round(base_level),
        label,
        confidence: historical.confidence
      });
    }
    
    // Find optimal windows
    const optimal_windows = this.findOptimalWindows(hourly_forecast);
    
    // Generate recommendations
    const recommendations = this.generateCrowdRecommendations(
      hourly_forecast,
      optimal_windows,
      signals
    );
    
    return {
      date,
      hourly_forecast,
      optimal_windows,
      recommendations,
      factors: {
        weather: signals.weather,
        events: signals.events.map(e => e.name),
        social_trend: signals.social_buzz > 1.5 ? 'trending_up' : 'normal',
        holiday: signals.is_holiday
      },
      confidence: historical.confidence,
      last_updated: new Date()
    };
  }
  
  /**
   * Find optimal visit windows (lowest crowds)
   */
  private findOptimalWindows(forecast: HourlyForecast[]): OptimalWindow[] {
    const windows: OptimalWindow[] = [];
    let currentWindow: OptimalWindow | null = null;
    
    forecast.forEach((hour, idx) => {
      if (hour.crowd_level < 50) { // Threshold for "good"
        if (!currentWindow) {
          currentWindow = {
            start_hour: hour.hour,
            end_hour: hour.hour,
            avg_crowd: hour.crowd_level,
            hours: [hour]
          };
        } else {
          currentWindow.end_hour = hour.hour;
          currentWindow.hours.push(hour);
        }
      } else {
        if (currentWindow) {
          currentWindow.avg_crowd = 
            currentWindow.hours.reduce((sum, h) => sum + h.crowd_level, 0) 
            / currentWindow.hours.length;
          windows.push(currentWindow);
          currentWindow = null;
        }
      }
    });
    
    // Add last window if exists
    if (currentWindow) {
      currentWindow.avg_crowd = 
        currentWindow.hours.reduce((sum, h) => sum + h.crowd_level, 0) 
        / currentWindow.hours.length;
      windows.push(currentWindow);
    }
    
    // Sort by avg crowd level
    return windows.sort((a, b) => a.avg_crowd - b.avg_crowd).slice(0, 3);
  }
  
  /**
   * Generate crowd recommendations
   */
  private generateCrowdRecommendations(
    forecast: HourlyForecast[],
    windows: OptimalWindow[],
    signals: RealTimeSignals
  ): string[] {
    const recommendations: string[] = [];
    
    if (windows.length > 0) {
      const best = windows[0];
      recommendations.push(
        `Best time: ${best.start_hour}:00-${best.end_hour + 1}:00 ` +
        `(${Math.round(best.avg_crowd)}% capacity)`
      );
    }
    
    // Peak time warning
    const peakHour = forecast.reduce((max, h) => 
      h.crowd_level > max.crowd_level ? h : max
    );
    if (peakHour.crowd_level > 80) {
      recommendations.push(
        `⚠️ Avoid ${peakHour.time} (${peakHour.crowd_level}% capacity - very crowded)`
      );
    }
    
    // Weather consideration
    if (signals.weather === 'rainy') {
      recommendations.push(
        'Rain forecast may reduce crowds by ~30%'
      );
    }
    
    // Event warning
    if (signals.events.length > 0) {
      recommendations.push(
        `Event nearby: "${signals.events[0].name}" - expect +30% crowds`
      );
    }
    
    return recommendations;
  }
  
  /**
   * Get weather forecast (mock - would use real API)
   */
  private async getWeatherForecast(coords: Point, date: Date): Promise<string> {
    // Would integrate with weather API (OpenWeather, etc)
    // For now, return mock data
    return 'sunny';
  }
  
  /**
   * Check for special events
   */
  private async checkForEvents(destination: string, date: Date): Promise<Event[]> {
    // Query destination intelligence for events on this date
    const events = await db.query.destinationIntelligence.findMany({
      where: and(
        eq(destinationIntelligence.destination, destination),
        eq(destinationIntelligence.intel_type, 'event')
      )
    });
    
    return events
      .map(e => e.data as Event)
      .filter(e => isSameDay(new Date(e.date), date));
  }
  
  /**
   * Get social buzz level
   */
  private async getSocialBuzz(place: Place): Promise<number> {
    const recent = await db.query.socialPosts.findMany({
      where: and(
        arrayContains(socialPosts.places_mentioned, [place.name]),
        gte(socialPosts.posted_at, subDays(new Date(), 7))
      )
    });
    
    const baseline = place.mentions_last_30d / 30 * 7; // Expected for 7 days
    const actual = recent.length;
    
    return baseline > 0 ? actual / baseline : 1;
  }
  
  /**
   * Check if date is a holiday
   */
  private async isHoliday(date: Date, destination: string): Promise<boolean> {
    // Would integrate with holiday API
    // For now, simple weekend check
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }
}
```

---

### 13. DECISION ANALYSIS ENGINE

```typescript
// Decision Engine Service
// Location: /server/services/pulse/decision-engine.service.ts

export class DecisionEngineService {
  /**
   * Should I book this? Analysis
   */
  async analyzeDecision(params: {
    item_type: string;
    item_name: string;
    item_url?: string;
    user_profile?: any;
  }): Promise<DecisionAnalysis> {
    // Search for social proof
    const socialProof = await this.gatherSocialProof(
      params.item_name,
      params.item_type
    );
    
    // Verify authenticity (bot detection)
    const verification = await this.verifyAuthenticity(socialProof);
    
    // Analyze value
    const valueAnalysis = await this.analyzeValue(
      params.item_name,
      socialProof
    );
    
    // Calculate probability of satisfaction
    const probability = this.calculateSatisfactionProbability(
      socialProof,
      verification,
      params.user_profile
    );
    
    // Generate recommendation
    const recommendation = this.generateRecommendation(
      probability,
      verification,
      valueAnalysis
    );
    
    // Save analysis
    const saved = await db.insert(decisionAnalyses).values({
      item_type: params.item_type,
      item_name: params.item_name,
      item_url: params.item_url,
      recommendation: recommendation.verdict,
      confidence: recommendation.confidence,
      probability_satisfaction: probability,
      mentions_30d: socialProof.total_mentions,
      sentiment_avg: socialProof.avg_sentiment,
      positive_rate: socialProof.positive_rate,
      verified_users: verification.verified_count,
      bot_rate: verification.bot_rate,
      spam_detected: verification.spam_detected,
      standout_mentions: socialProof.standout_mentions,
      concerns: socialProof.concerns,
      price_reported: valueAnalysis.reported_price,
      competitor_avg_price: valueAnalysis.competitor_avg,
      value_verdict: valueAnalysis.verdict,
      user_profile: params.user_profile
    }).returning();
    
    return {
      ...recommendation,
      social_proof: socialProof,
      verification,
      value_analysis: valueAnalysis,
      analysis_id: saved[0].id
    };
  }
  
  /**
   * Gather social proof from X and web
   */
  private async gatherSocialProof(
    itemName: string,
    itemType: string
  ): Promise<SocialProofData> {
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast',
      tools: [x_search(), web_search()]
    });
    
    chat.append(system(`
      Search for reviews and mentions of a ${itemType}.
      
      Extract:
      - Total mentions in last 30 days
      - Sentiment breakdown (positive, neutral, negative)
      - Standout praise (best quotes)
      - Common concerns or complaints
      - Specific recommendations (what to order, when to book, etc)
      
      Output JSON.
    `));
    
    chat.append(user(`
      ${itemType}: "${itemName}"
      
      Find all mentions from last 30 days.
      Focus on genuine traveler experiences, not marketing.
    `));
    
    const response = await chat.sample();
    const result = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '{}'
    );
    
    return {
      total_mentions: result.total_mentions || 0,
      positive_count: result.positive_count || 0,
      neutral_count: result.neutral_count || 0,
      negative_count: result.negative_count || 0,
      avg_sentiment: result.avg_sentiment || 0,
      positive_rate: result.positive_count / Math.max(1, result.total_mentions),
      standout_mentions: result.standout_mentions || [],
      concerns: result.concerns || [],
      specific_tips: result.specific_tips || []
    };
  }
  
  /**
   * Verify authenticity (filter bots, spam)
   */
  private async verifyAuthenticity(
    socialProof: SocialProofData
  ): Promise<VerificationData> {
    // In real implementation, would check each post
    // For now, estimate based on patterns
    
    const bot_rate = 0.1; // Assume 10% bots
    const verified_count = Math.round(
      socialProof.total_mentions * (1 - bot_rate)
    );
    
    // Check for spam patterns
    const spam_detected = 
      socialProof.standout_mentions.some(m => 
        m.toLowerCase().includes('click here') ||
        m.toLowerCase().includes('limited time')
      );
    
    return {
      verified_count,
      bot_rate,
      spam_detected,
      authenticity_score: spam_detected ? 0.6 : 0.9
    };
  }
  
  /**
   * Analyze value (price vs quality)
   */
  private async analyzeValue(
    itemName: string,
    socialProof: SocialProofData
  ): Promise<ValueAnalysis> {
    // Extract price mentions from posts
    const priceMentions = socialProof.standout_mentions
      .filter(m => m.match(/\$\d+/))
      .map(m => parseInt(m.match(/\$(\d+)/)?.[1] || '0'));
    
    const reported_price = priceMentions.length > 0
      ? priceMentions.reduce((a, b) => a + b, 0) / priceMentions.length
      : null;
    
    // Would fetch competitor prices via web search
    const competitor_avg = reported_price ? reported_price * 0.85 : null;
    
    // Value verdict
    let verdict = 'unknown';
    if (reported_price && competitor_avg) {
      const premium = (reported_price - competitor_avg) / competitor_avg;
      
      if (premium > 0.3) {
        verdict = socialProof.avg_sentiment > 0.7 
          ? 'Worth the premium' 
          : 'Overpriced';
      } else if (premium < -0.2) {
        verdict = 'Great value';
      } else {
        verdict = 'Fair price';
      }
    }
    
    return {
      reported_price,
      competitor_avg,
      verdict
    };
  }
  
  /**
   * Calculate probability of satisfaction
   */
  private calculateSatisfactionProbability(
    socialProof: SocialProofData,
    verification: VerificationData,
    userProfile?: any
  ): number {
    // Base probability from positive rate
    let probability = socialProof.positive_rate;
    
    // Adjust for authenticity
    probability *= verification.authenticity_score;
    
    // Adjust for volume (more data = higher confidence)
    const volumeAdjustment = Math.min(1, socialProof.total_mentions / 50);
    probability *= (0.7 + 0.3 * volumeAdjustment);
    
    // Would adjust for user profile similarity if available
    // For now, cap at reasonable level
    return Math.min(0.95, Math.max(0.1, probability));
  }
  
  /**
   * Generate final recommendation
   */
  private generateRecommendation(
    probability: number,
    verification: VerificationData,
    valueAnalysis: ValueAnalysis
  ): Recommendation {
    let verdict: string;
    let confidence: number;
    
    if (probability >= 0.8 && verification.authenticity_score > 0.8) {
      verdict = 'highly_recommend';
      confidence = 0.9;
    } else if (probability >= 0.65) {
      verdict = 'recommend';
      confidence = 0.75;
    } else if (probability >= 0.4) {
      verdict = 'neutral';
      confidence = 0.5;
    } else {
      verdict = 'avoid';
      confidence = 0.7;
    }
    
    // Downgrade if spam detected
    if (verification.spam_detected) {
      verdict = 'avoid';
      confidence = 0.9;
    }
    
    return { verdict, confidence };
  }
}
```

---

## PART IV: REAL-TIME PROCESSING

### 14. DATA COLLECTION WORKERS

```typescript
// X Data Collection Worker
// Location: /server/workers/x-collector.worker.ts

import Bull from 'bull';
import { grokClient } from '@/server/config/grok.config';
import { x_search } from 'xai-sdk/tools';

const xCollectorQueue = new Bull('x-collector', process.env.REDIS_URL!);

/**
 * Job: Collect X posts for a destination
 */
interface XCollectorJob {
  destination: string;
  hashtags: string[];
  handles: string[];
  since: Date;
}

/**
 * Process X collection jobs
 */
xCollectorQueue.process(5, async (job: Bull.Job<XCollectorJob>) => {
  const { destination, hashtags, handles, since } = job.data;
  
  console.log(`[X Collector] Processing ${destination}...`);
  
  try {
    // Search X using Grok
    const chat = grokClient.chat.create({
      model: 'grok-4-1-fast',
      tools: [
        x_search({
          handles,
          dateRange: {
            start: since,
            end: new Date()
          }
        })
      ]
    });
    
    chat.append(system(`
      Search X for travel-related posts about ${destination}.
      
      Return posts with:
      - Post ID
      - Author handle and name
      - Content text
      - Posted timestamp
      - Engagement (likes, retweets, replies)
      - Media URLs
      - Location if available
      
      Output JSON array.
    `));
    
    chat.append(user(`
      Find posts about ${destination} using:
      - Hashtags: ${hashtags.join(', ')}
      - From accounts: ${handles.join(', ')}
      - Posted since: ${since.toISOString()}
      
      Focus on travel experiences, recommendations, photos, and reviews.
    `));
    
    const response = await chat.sample();
    const posts = JSON.parse(
      response.content.find(c => c.type === 'text')?.text || '[]'
    );
    
    console.log(`[X Collector] Found ${posts.length} posts`);
    
    // Queue each post for processing
    for (const post of posts) {
      await processingQueue.add('process-post', {
        platform: 'x',
        post_data: post,
        destination
      });
    }
    
    job.progress(100);
    return { collected: posts.length };
    
  } catch (error) {
    console.error(`[X Collector] Error:`, error);
    throw error;
  }
});

/**
 * Schedule collection for all destinations
 */
export async function scheduleXCollection() {
  const destinations = [
    { name: 'Kyoto', hashtags: ['#kyoto', '#kyototravel', '#japantravel'], handles: ['@kyoto_tourism'] },
    { name: 'Mumbai', hashtags: ['#mumbai', '#mumbaitravel', '#india'], handles: ['@MumbaiTourism'] },
    // ... etc for all 8 markets
  ];
  
  for (const dest of destinations) {
    await xCollectorQueue.add(
      'collect',
      {
        destination: dest.name,
        hashtags: dest.hashtags,
        handles: dest.handles,
        since: subMinutes(new Date(), 30) // Last 30 minutes
      },
      {
        repeat: { cron: '*/30 * * * *' }, // Every 30 minutes
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 }
      }
    );
  }
}
```

**Post Processing Worker:**

```typescript
// Post Processing Worker
// Location: /server/workers/post-processor.worker.ts

const processingQueue = new Bull('post-processing', process.env.REDIS_URL!);

processingQueue.process(10, async (job: Bull.Job) => {
  const { platform, post_data, destination } = job.data;
  
  try {
    // 1. Extract entities (places, experiences)
    const entities = await extractEntities(post_data.content, destination);
    
    // 2. Sentiment analysis
    const sentiment = await analyzeSentiment(post_data.content);
    
    // 3. Bot detection
    const isBot = await detectBot(post_data.author);
    
    // 4. User type classification
    const userType = await classifyUser(post_data.author, destination);
    
    // 5. Store in database
    await db.insert(socialPosts).values({
      platform,
      post_id: post_data.id,
      post_url: post_data.url,
      author_handle: post_data.author.handle,
      author_name: post_data.author.name,
      author_verified: post_data.author.verified,
      content: post_data.content,
      language: post_data.language,
      media_urls: post_data.media || [],
      hashtags: post_data.hashtags || [],
      mentions: post_data.mentions || [],
      location_text: post_data.location_text,
      destination,
      places_mentioned: entities.places,
      experiences_mentioned: entities.experiences,
      sentiment_score: sentiment.score,
      sentiment_label: sentiment.label,
      confidence_score: sentiment.confidence,
      is_bot: isBot,
      user_type: userType,
      likes_count: post_data.likes || 0,
      retweets_count: post_data.retweets || 0,
      replies_count: post_data.replies || 0,
      posted_at: new Date(post_data.posted_at),
      collected_at: new Date(),
      processed_at: new Date(),
      processing_version: 'v1.0',
      raw_data: post_data
    });
    
    // 6. Trigger aggregation updates
    await triggerAggregationUpdate(entities.places, destination);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Processor] Error:', error);
    throw error;
  }
});

/**
 * Extract entities using Grok
 */
async function extractEntities(text: string, destination: string) {
  const chat = grokClient.chat.create({
    model: 'grok-4-1-fast'
  });
  
  chat.append(system(`
    Extract travel entities from text.
    
    Return JSON:
    {
      "places": ["Restaurant Name", "Temple Name"],
      "experiences": ["ramen", "temple visit", "photography"]
    }
  `));
  
  chat.append(user(`
    Text: "${text}"
    Destination: ${destination}
    
    Extract mentioned places and experiences.
  `));
  
  const response = await chat.sample();
  return JSON.parse(
    response.content.find(c => c.type === 'text')?.text || '{"places":[],"experiences":[]}'
  );
}

/**
 * Sentiment analysis
 */
async function analyzeSentiment(text: string) {
  const chat = grokClient.chat.create({
    model: 'grok-4-1-fast'
  });
  
  chat.append(system(`
    Analyze sentiment of travel review/post.
    
    Return JSON:
    {
      "score": -1.0 to 1.0,
      "label": "positive|neutral|negative",
      "confidence": 0.0 to 1.0
    }
  `));
  
  chat.append(user(text));
  
  const response = await chat.sample();
  return JSON.parse(
    response.content.find(c => c.type === 'text')?.text || 
    '{"score":0,"label":"neutral","confidence":0.5}'
  );
}

/**
 * Bot detection
 */
async function detectBot(author: any): Promise<boolean> {
  // Simple heuristics (would be more sophisticated in production)
  const botIndicators = [
    author.followers < 10,
    author.following > author.followers * 10,
    !author.verified && author.tweets > 10000,
    author.name.match(/\d{4,}/) // Random numbers in name
  ];
  
  const botScore = botIndicators.filter(Boolean).length / botIndicators.length;
  return botScore > 0.5;
}

/**
 * Classify user type
 */
async function classifyUser(author: any, destination: string): Promise<string> {
  // Check bio and location
  const bio = author.bio?.toLowerCase() || '';
  const location = author.location?.toLowerCase() || '';
  
  if (location.includes(destination.toLowerCase())) {
    return 'local';
  }
  
  if (author.followers > 10000) {
    return 'influencer';
  }
  
  return 'tourist';
}
```

---

### 15. STREAM PROCESSING PIPELINE

```typescript
// Aggregation Worker (5-minute windows)
// Location: /server/workers/aggregator.worker.ts

const aggregatorQueue = new Bull('aggregation', process.env.REDIS_URL!);

/**
 * Aggregate live scores every 5 minutes
 */
aggregatorQueue.add(
  'aggregate-livescores',
  {},
  {
    repeat: { cron: '*/5 * * * *' } // Every 5 minutes
  }
);

aggregatorQueue.process('aggregate-livescores', async (job) => {
  console.log('[Aggregator] Running LiveScore aggregation...');
  
  const windowStart = subMinutes(new Date(), 5);
  const windowEnd = new Date();
  
  // Get all active places
  const places = await db.query.places.findMany({
    where: eq(places.status, 'active')
  });
  
  let processed = 0;
  
  for (const place of places) {
    // Get posts in this 5-minute window
    const posts = await db.query.socialPosts.findMany({
      where: and(
        arrayContains(socialPosts.places_mentioned, [place.name]),
        gte(socialPosts.posted_at, windowStart),
        lt(socialPosts.posted_at, windowEnd)
      )
    });
    
    if (posts.length === 0) continue;
    
    // Calculate aggregate metrics
    const positive = posts.filter(p => p.sentiment_score > 0.3).length;
    const neutral = posts.filter(p => 
      p.sentiment_score >= -0.3 && p.sentiment_score <= 0.3
    ).length;
    const negative = posts.filter(p => p.sentiment_score < -0.3).length;
    
    const avgSentiment = posts.reduce((sum, p) => sum + p.sentiment_score, 0) 
      / posts.length;
    
    const score = 3 + (avgSentiment * 2); // Convert to 0-5 scale
    
    const uniqueUsers = new Set(posts.map(p => p.author_handle)).size;
    const totalEngagement = posts.reduce((sum, p) => 
      sum + p.likes_count + p.retweets_count + p.replies_count, 0
    );
    
    // Store aggregation
    await db.insert(liveScores).values({
      place_id: place.id,
      score: parseFloat(score.toFixed(2)),
      mentions_count: posts.length,
      positive_count: positive,
      neutral_count: neutral,
      negative_count: negative,
      avg_sentiment: avgSentiment,
      unique_users: uniqueUsers,
      total_engagement: totalEngagement,
      window_start: windowStart,
      window_end: windowEnd,
      window_size: '5min'
    });
    
    processed++;
  }
  
  console.log(`[Aggregator] Processed ${processed} places`);
  return { processed };
});
```

---

*[This document continues in Part 3 with Frontend Implementation, API Documentation, and Deployment...]*

I've created the second major section. Should I continue with Part 3 covering the frontend implementation, API documentation, and deployment guide?

