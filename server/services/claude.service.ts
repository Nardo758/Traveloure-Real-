import Anthropic from '@anthropic-ai/sdk';

// claude-sonnet-4-20250514 is the latest model
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ItineraryOptimizationRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget?: number;
  cartItems: Array<{
    id: string;
    type: string;
    name: string;
    price: number;
    details?: string;
    metadata?: {
      cabin?: string;
      baggage?: string;
      stops?: number;
      duration?: string;
      airline?: string;
      departureTime?: string;
      arrivalTime?: string;
      refundable?: boolean;
      cancellationDeadline?: string;
      boardType?: string;
      nights?: number;
      checkInDate?: string;
      checkOutDate?: string;
      meetingPoint?: string;
      meetingPointCoordinates?: { lat: number; lng: number };
      travelers?: number;
      rawData?: any;
    };
  }>;
  preferences?: {
    pacePreference?: 'relaxed' | 'moderate' | 'packed';
    prioritizeProximity?: boolean;
    prioritizeBudget?: boolean;
    prioritizeRatings?: boolean;
  };
}

export interface ItineraryOptimizationResult {
  score: number;
  insights: string[];
  recommendations: string[];
  schedule: Array<{
    day: number;
    date: string;
    items: Array<{
      time: string;
      type: string;
      name: string;
      location?: string;
      notes?: string;
      travelTimeFromPrevious?: number;
    }>;
  }>;
  transportationSuggestions?: Array<{
    from: string;
    to: string;
    recommendedMode: string;
    estimatedTime: number;
    estimatedCost?: number;
  }>;
  hotelProximityAnalysis?: {
    nearestActivities: string[];
    averageDistanceToActivities?: number;
    recommendation?: string;
  };
}

class ClaudeService {
  async optimizeItinerary(request: ItineraryOptimizationRequest): Promise<ItineraryOptimizationResult> {
    const systemPrompt = `You are an expert travel planner AI for Traveloure. Your job is to analyze a user's travel cart items (flights, hotels, activities, services) and create an optimized itinerary.

You will receive:
- Destination and travel dates
- Number of travelers and budget
- Cart items with full metadata including:
  - Flights: departure/arrival times, airline, cabin class, baggage
  - Hotels: check-in/out dates, board type, refundability
  - Activities: duration, meeting points with coordinates, cancellation policy
  - Services: pricing and details

Your task:
1. Analyze the items for logical sequencing
2. Check for timing conflicts
3. Optimize travel routes between activities based on meeting point locations
4. Suggest transportation between locations
5. Evaluate hotel proximity to activities
6. Provide a day-by-day schedule
7. Give an overall optimization score (0-100)

Return a JSON object with the exact structure specified.`;

    const userPrompt = `Analyze and optimize this travel itinerary:

**Destination:** ${request.destination}
**Dates:** ${request.startDate} to ${request.endDate}
**Travelers:** ${request.travelers}
**Budget:** ${request.budget ? `$${request.budget}` : 'Not specified'}
**Preferences:** ${JSON.stringify(request.preferences || {})}

**Cart Items:**
${JSON.stringify(request.cartItems, null, 2)}

Please analyze this itinerary and return a JSON object with this exact structure:
{
  "score": <number 0-100>,
  "insights": [<array of key observations about the itinerary>],
  "recommendations": [<array of actionable improvements>],
  "schedule": [
    {
      "day": <number>,
      "date": "<YYYY-MM-DD>",
      "items": [
        {
          "time": "<HH:MM>",
          "type": "<flight|hotel|activity|service>",
          "name": "<item name>",
          "location": "<address or location>",
          "notes": "<any relevant notes>",
          "travelTimeFromPrevious": <minutes, optional>
        }
      ]
    }
  ],
  "transportationSuggestions": [
    {
      "from": "<location>",
      "to": "<location>",
      "recommendedMode": "<taxi|uber|metro|walk|bus>",
      "estimatedTime": <minutes>,
      "estimatedCost": <optional, in USD>
    }
  ],
  "hotelProximityAnalysis": {
    "nearestActivities": [<list of nearby activity names>],
    "averageDistanceToActivities": <km, optional>,
    "recommendation": "<optional suggestion about hotel location>"
  }
}

Return ONLY valid JSON, no additional text.`;

    try {
      const message = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in Claude response');
      }

      const result = JSON.parse(jsonMatch[0]) as ItineraryOptimizationResult;
      return result;
    } catch (error: any) {
      console.error('Claude itinerary optimization error:', error);
      throw new Error(`Itinerary optimization failed: ${error.message}`);
    }
  }

  async analyzeTransportationNeeds(
    hotelLocation: { lat: number; lng: number; address: string },
    activityLocations: Array<{ lat: number; lng: number; address: string; name: string }>
  ): Promise<{
    recommendations: Array<{
      activity: string;
      from: string;
      recommendedMode: string;
      estimatedTime: number;
      reason: string;
    }>;
  }> {
    const prompt = `Given a hotel location and activity meeting points, recommend the best transportation options.

Hotel: ${hotelLocation.address} (${hotelLocation.lat}, ${hotelLocation.lng})

Activities:
${activityLocations.map(a => `- ${a.name}: ${a.address} (${a.lat}, ${a.lng})`).join('\n')}

For each activity, recommend transportation from the hotel. Consider:
- Distance and estimated travel time
- Cost-effectiveness
- Convenience for travelers

Return JSON:
{
  "recommendations": [
    {
      "activity": "<activity name>",
      "from": "<hotel address>",
      "recommendedMode": "<taxi|uber|metro|walk|bus|rental car>",
      "estimatedTime": <minutes>,
      "reason": "<brief explanation>"
    }
  ]
}`;

    try {
      const message = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('Claude transportation analysis error:', error);
      throw error;
    }
  }

  async generateTravelRecommendations(
    destination: string,
    dates: { start: string; end: string },
    interests: string[]
  ): Promise<{
    recommendations: Array<{
      type: string;
      name: string;
      description: string;
      estimatedCost: number;
      priority: 'must-do' | 'recommended' | 'optional';
    }>;
  }> {
    const prompt = `As a travel expert, recommend activities and experiences for:

Destination: ${destination}
Dates: ${dates.start} to ${dates.end}
Interests: ${interests.join(', ')}

Provide 5-8 recommendations in JSON format:
{
  "recommendations": [
    {
      "type": "<activity|tour|restaurant|attraction>",
      "name": "<name>",
      "description": "<brief description>",
      "estimatedCost": <USD>,
      "priority": "<must-do|recommended|optional>"
    }
  ]
}`;

    try {
      const message = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('Claude recommendations error:', error);
      throw error;
    }
  }
}

export const claudeService = new ClaudeService();
