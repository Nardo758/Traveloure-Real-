import OpenAI from "openai";

// xAI Grok service using OpenAI-compatible API
// Reference: blueprint:javascript_xai

const GROK_MODEL = "grok-2-1212";
const GROK_VISION_MODEL = "grok-2-vision-1212";

// Lazy initialization to avoid startup errors when API key not configured
let _grokClient: OpenAI | null = null;

function getGrokClient(): OpenAI {
  if (!_grokClient) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is not configured. Please add your xAI API key to secrets.");
    }
    _grokClient = new OpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey,
    });
  }
  return _grokClient;
}

export interface GrokUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface ExpertMatchRequest {
  travelerProfile: {
    destination: string;
    tripDates: { start: string; end: string };
    eventType?: string;
    budget?: number;
    travelers: number;
    interests?: string[];
    preferences?: Record<string, any>;
  };
  expertProfile: {
    id: string;
    name: string;
    destinations: string[];
    specialties: string[];
    experienceTypes: string[];
    languages: string[];
    yearsOfExperience: string;
    bio?: string;
    averageRating?: number;
    reviewCount?: number;
  };
}

export interface ExpertMatchResult {
  expertId: string;
  overallScore: number;
  breakdown: {
    destinationMatch: number;
    specialtyMatch: number;
    experienceTypeMatch: number;
    budgetAlignment: number;
    availabilityScore: number;
  };
  strengths: string[];
  reasoning: string;
}

export interface ContentGenerationRequest {
  type: "bio" | "service_description" | "inquiry_response" | "welcome_message";
  context: Record<string, any>;
  tone?: "professional" | "friendly" | "casual";
  length?: "short" | "medium" | "long";
}

export interface ContentGenerationResult {
  content: string;
  alternativeVersions?: string[];
  suggestions?: string[];
}

export interface RealTimeIntelligenceRequest {
  destination: string;
  dates?: { start: string; end: string };
  topics?: ("events" | "weather" | "safety" | "trending" | "deals")[];
}

export interface RealTimeIntelligenceResult {
  destination: string;
  timestamp: string;
  events: Array<{
    name: string;
    date: string;
    type: string;
    description: string;
    relevance: "high" | "medium" | "low";
  }>;
  weatherForecast?: {
    summary: string;
    temperature: { high: number; low: number };
    conditions: string;
  };
  safetyAlerts?: Array<{
    level: "info" | "warning" | "critical";
    message: string;
    source: string;
  }>;
  trendingExperiences?: Array<{
    name: string;
    reason: string;
    popularity: number;
  }>;
  deals?: Array<{
    title: string;
    discount: string;
    validUntil: string;
  }>;
}

export interface AutonomousItineraryRequest {
  destination: string;
  dates: { start: string; end: string };
  travelers: number;
  budget?: number;
  eventType?: string;
  interests: string[];
  pacePreference?: "relaxed" | "moderate" | "packed";
  mustSeeAttractions?: string[];
  dietaryRestrictions?: string[];
  mobilityConsiderations?: string[];
}

export interface AutonomousItineraryResult {
  title: string;
  summary: string;
  totalEstimatedCost: number;
  dailyItinerary: Array<{
    day: number;
    date: string;
    theme: string;
    activities: Array<{
      time: string;
      name: string;
      type: string;
      duration: string;
      estimatedCost: number;
      location: string;
      description: string;
      tips?: string;
      bookingRequired?: boolean;
    }>;
    meals: Array<{
      time: string;
      type: "breakfast" | "lunch" | "dinner";
      suggestion: string;
      cuisine: string;
      priceRange: string;
    }>;
    transportation: Array<{
      from: string;
      to: string;
      mode: string;
      duration: string;
      cost: number;
    }>;
  }>;
  accommodationSuggestions: Array<{
    name: string;
    type: string;
    pricePerNight: number;
    neighborhood: string;
    whyRecommended: string;
  }>;
  packingList: string[];
  travelTips: string[];
  estimatedSavingsWithExpert?: number;
}

class GrokService {
  private calculateCost(promptTokens: number, completionTokens: number): number {
    // Grok-2 pricing: $5 per 1M input tokens, $10 per 1M output tokens
    const inputCost = (promptTokens / 1000000) * 5;
    const outputCost = (completionTokens / 1000000) * 10;
    return inputCost + outputCost;
  }

  private extractUsageStats(response: OpenAI.Chat.Completions.ChatCompletion): GrokUsageStats {
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      estimatedCost: this.calculateCost(usage.prompt_tokens, usage.completion_tokens),
    };
  }

  async matchExpertToTraveler(request: ExpertMatchRequest): Promise<{ result: ExpertMatchResult; usage: GrokUsageStats }> {
    const systemPrompt = `You are an expert matching algorithm for Traveloure, a travel planning platform. Your job is to analyze how well a travel expert matches a traveler's needs.

Score each expert on these dimensions (0-100):
1. Destination Match: Does the expert cover the traveler's destination?
2. Specialty Match: Do the expert's specialties align with the trip type and interests?
3. Experience Type Match: Is the expert experienced with this type of event (wedding, honeymoon, corporate, etc.)?
4. Budget Alignment: Is the expert's typical price range appropriate for the traveler's budget?
5. Availability Score: Based on the expert's capacity and the trip timeline

Calculate an overall weighted score and provide clear reasoning.

Return ONLY valid JSON with this structure:
{
  "expertId": "<expert id>",
  "overallScore": <0-100>,
  "breakdown": {
    "destinationMatch": <0-100>,
    "specialtyMatch": <0-100>,
    "experienceTypeMatch": <0-100>,
    "budgetAlignment": <0-100>,
    "availabilityScore": <0-100>
  },
  "strengths": ["<list of 2-4 key strengths>"],
  "reasoning": "<1-2 sentence explanation of why this expert is or isn't a good match>"
}`;

    const userPrompt = `Match this expert to the traveler's needs:

**Traveler Request:**
- Destination: ${request.travelerProfile.destination}
- Dates: ${request.travelerProfile.tripDates.start} to ${request.travelerProfile.tripDates.end}
- Event Type: ${request.travelerProfile.eventType || "vacation"}
- Budget: ${request.travelerProfile.budget ? `$${request.travelerProfile.budget}` : "Not specified"}
- Travelers: ${request.travelerProfile.travelers}
- Interests: ${request.travelerProfile.interests?.join(", ") || "General sightseeing"}
- Preferences: ${JSON.stringify(request.travelerProfile.preferences || {})}

**Expert Profile:**
- ID: ${request.expertProfile.id}
- Name: ${request.expertProfile.name}
- Destinations: ${request.expertProfile.destinations.join(", ")}
- Specialties: ${request.expertProfile.specialties.join(", ")}
- Experience Types: ${request.expertProfile.experienceTypes.join(", ")}
- Languages: ${request.expertProfile.languages.join(", ")}
- Years of Experience: ${request.expertProfile.yearsOfExperience}
- Bio: ${request.expertProfile.bio || "Not provided"}
- Rating: ${request.expertProfile.averageRating || "No ratings yet"} (${request.expertProfile.reviewCount || 0} reviews)

Analyze and return the match score JSON.`;

    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1024,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok");
      }

      const result = JSON.parse(content) as ExpertMatchResult;
      const usage = this.extractUsageStats(response);

      return { result, usage };
    } catch (error: any) {
      console.error("Grok expert matching error:", error);
      throw new Error(`Expert matching failed: ${error.message}`);
    }
  }

  async generateContent(request: ContentGenerationRequest): Promise<{ result: ContentGenerationResult; usage: GrokUsageStats }> {
    const lengthGuide = {
      short: "50-100 words",
      medium: "150-250 words",
      long: "300-500 words",
    };

    const typePrompts: Record<string, string> = {
      bio: `Write a compelling professional bio for a travel expert/service provider. Highlight their unique value, experience, and personality.`,
      service_description: `Write an engaging service description that clearly explains what's included, the value proposition, and why travelers should book.`,
      inquiry_response: `Draft a warm, helpful response to a traveler inquiry. Be professional yet personable, address their questions, and guide them toward booking.`,
      welcome_message: `Write a welcoming message for a new traveler connection. Make them feel valued and set expectations for the collaboration.`,
    };

    const systemPrompt = `You are a content writing assistant for Traveloure, helping travel experts create compelling content.
${typePrompts[request.type] || "Write helpful content."}

Tone: ${request.tone || "professional"}
Length: ${lengthGuide[request.length || "medium"]}

Return JSON:
{
  "content": "<main content>",
  "alternativeVersions": ["<optional alternative 1>", "<optional alternative 2>"],
  "suggestions": ["<improvement tip 1>", "<improvement tip 2>"]
}`;

    const userPrompt = `Generate ${request.type} content with this context:
${JSON.stringify(request.context, null, 2)}`;

    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2048,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok");
      }

      const result = JSON.parse(content) as ContentGenerationResult;
      const usage = this.extractUsageStats(response);

      return { result, usage };
    } catch (error: any) {
      console.error("Grok content generation error:", error);
      throw new Error(`Content generation failed: ${error.message}`);
    }
  }

  async getRealTimeIntelligence(request: RealTimeIntelligenceRequest): Promise<{ result: RealTimeIntelligenceResult; usage: GrokUsageStats }> {
    const topics = request.topics || ["events", "weather", "trending"];
    
    const systemPrompt = `You are a real-time travel intelligence agent for Traveloure. Provide current, accurate information about destinations to help travelers plan better trips.

You have access to current knowledge about world events, weather patterns, and travel trends. Be specific and actionable in your recommendations.

Return JSON with this structure:
{
  "destination": "<destination>",
  "timestamp": "<ISO timestamp>",
  "events": [
    {
      "name": "<event name>",
      "date": "<date or date range>",
      "type": "<festival|concert|sports|cultural|holiday|convention>",
      "description": "<brief description>",
      "relevance": "<high|medium|low>"
    }
  ],
  "weatherForecast": {
    "summary": "<weather summary>",
    "temperature": { "high": <number>, "low": <number> },
    "conditions": "<conditions>"
  },
  "safetyAlerts": [
    {
      "level": "<info|warning|critical>",
      "message": "<alert message>",
      "source": "<source>"
    }
  ],
  "trendingExperiences": [
    {
      "name": "<experience name>",
      "reason": "<why it's trending>",
      "popularity": <1-100>
    }
  ],
  "deals": [
    {
      "title": "<deal title>",
      "discount": "<discount amount>",
      "validUntil": "<date>"
    }
  ]
}`;

    const userPrompt = `Get real-time intelligence for:
Destination: ${request.destination}
${request.dates ? `Travel Dates: ${request.dates.start} to ${request.dates.end}` : ""}
Topics requested: ${topics.join(", ")}

Provide current, actionable information.`;

    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2048,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok");
      }

      const result = JSON.parse(content) as RealTimeIntelligenceResult;
      const usage = this.extractUsageStats(response);

      return { result, usage };
    } catch (error: any) {
      console.error("Grok real-time intelligence error:", error);
      throw new Error(`Real-time intelligence failed: ${error.message}`);
    }
  }

  async generateAutonomousItinerary(request: AutonomousItineraryRequest): Promise<{ result: AutonomousItineraryResult; usage: GrokUsageStats }> {
    const systemPrompt = `You are an autonomous trip planning AI for Traveloure. Create comprehensive, day-by-day itineraries that travelers can follow or use as a starting point for expert refinement.

Create itineraries that are:
1. Realistic - Consider travel times, opening hours, and fatigue
2. Balanced - Mix popular attractions with hidden gems
3. Budget-aware - Stay within the traveler's budget
4. Personalized - Reflect the traveler's interests and pace preference
5. Practical - Include transportation and meal suggestions

Return JSON with this structure:
{
  "title": "<catchy trip title>",
  "summary": "<1-2 sentence trip overview>",
  "totalEstimatedCost": <USD>,
  "dailyItinerary": [
    {
      "day": <number>,
      "date": "<YYYY-MM-DD>",
      "theme": "<day theme>",
      "activities": [
        {
          "time": "<HH:MM>",
          "name": "<activity name>",
          "type": "<attraction|tour|activity|entertainment>",
          "duration": "<e.g., 2 hours>",
          "estimatedCost": <USD>,
          "location": "<address>",
          "description": "<brief description>",
          "tips": "<optional insider tip>",
          "bookingRequired": <boolean>
        }
      ],
      "meals": [
        {
          "time": "<HH:MM>",
          "type": "<breakfast|lunch|dinner>",
          "suggestion": "<restaurant or food type>",
          "cuisine": "<cuisine type>",
          "priceRange": "<$|$$|$$$>"
        }
      ],
      "transportation": [
        {
          "from": "<origin>",
          "to": "<destination>",
          "mode": "<walk|taxi|metro|bus|train>",
          "duration": "<e.g., 15 min>",
          "cost": <USD>
        }
      ]
    }
  ],
  "accommodationSuggestions": [
    {
      "name": "<hotel name>",
      "type": "<hotel|hostel|boutique|luxury>",
      "pricePerNight": <USD>,
      "neighborhood": "<area>",
      "whyRecommended": "<reason>"
    }
  ],
  "packingList": ["<item 1>", "<item 2>"],
  "travelTips": ["<tip 1>", "<tip 2>"],
  "estimatedSavingsWithExpert": <USD - how much an expert could save them>
}`;

    const userPrompt = `Create a complete travel itinerary:

**Trip Details:**
- Destination: ${request.destination}
- Dates: ${request.dates.start} to ${request.dates.end}
- Travelers: ${request.travelers}
- Budget: ${request.budget ? `$${request.budget}` : "Flexible"}
- Event Type: ${request.eventType || "Vacation"}
- Interests: ${request.interests.join(", ")}
- Pace: ${request.pacePreference || "moderate"}
${request.mustSeeAttractions?.length ? `- Must-See: ${request.mustSeeAttractions.join(", ")}` : ""}
${request.dietaryRestrictions?.length ? `- Dietary: ${request.dietaryRestrictions.join(", ")}` : ""}
${request.mobilityConsiderations?.length ? `- Mobility: ${request.mobilityConsiderations.join(", ")}` : ""}

Create a detailed, actionable itinerary.`;

    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8192,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok");
      }

      const result = JSON.parse(content) as AutonomousItineraryResult;
      const usage = this.extractUsageStats(response);

      return { result, usage };
    } catch (error: any) {
      console.error("Grok autonomous itinerary error:", error);
      throw new Error(`Autonomous itinerary generation failed: ${error.message}`);
    }
  }

  async chat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>, systemContext?: string): Promise<{ response: string; usage: GrokUsageStats }> {
    const systemPrompt = systemContext || `You are a helpful travel planning assistant for Traveloure. Help travelers plan amazing trips with practical, actionable advice.`;

    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        max_tokens: 2048,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok");
      }

      const usage = this.extractUsageStats(response);

      return { response: content, usage };
    } catch (error: any) {
      console.error("Grok chat error:", error);
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  async analyzeImage(base64Image: string, prompt: string): Promise<{ analysis: string; usage: GrokUsageStats }> {
    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from Grok Vision");
      }

      const usage = this.extractUsageStats(response);

      return { analysis: content, usage };
    } catch (error: any) {
      console.error("Grok vision analysis error:", error);
      throw new Error(`Image analysis failed: ${error.message}`);
    }
  }

  // Health check for the service
  async healthCheck(): Promise<boolean> {
    try {
      const response = await getGrokClient().chat.completions.create({
        model: GROK_MODEL,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10,
      });
      return !!response.choices[0].message.content;
    } catch {
      return false;
    }
  }
}

export const grokService = new GrokService();
