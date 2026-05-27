/**
 * Claude Fallback for Grok Tasks
 *
 * When Grok (xAI) credits are exhausted or the API is unavailable,
 * these Claude-based implementations provide equivalent functionality
 * so all AI features keep working.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  ExpertMatchRequest,
  ExpertMatchResult,
  ContentGenerationRequest,
  ContentGenerationResult,
  RealTimeIntelligenceRequest,
  RealTimeIntelligenceResult,
  AutonomousItineraryRequest,
  AutonomousItineraryResult,
} from "./grok.service";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-20250514";

async function askClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Non-text response from Claude");
  return block.text;
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = match ? match[1].trim() : raw.trim();
  return JSON.parse(cleaned) as T;
}

export async function claudeMatchExpert(
  request: ExpertMatchRequest
): Promise<{ result: ExpertMatchResult; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } }> {
  const system = `You are an expert travel advisor matching system. Score how well a travel expert matches a traveler's needs. Return ONLY valid JSON.`;
  const user = `Match this expert to this traveler profile and return a JSON score.

TRAVELER:
- Destination: ${request.travelerProfile.destination}
- Dates: ${request.travelerProfile.tripDates.start} to ${request.travelerProfile.tripDates.end}
- Travelers: ${request.travelerProfile.travelers}
- Interests: ${(request.travelerProfile.interests || []).join(", ")}
- Budget: ${request.travelerProfile.budget || "flexible"}

EXPERT:
- Name: ${request.expertProfile.name}
- Covers: ${request.expertProfile.destinations.join(", ")}
- Specialties: ${request.expertProfile.specialties.join(", ")}
- Experience types: ${request.expertProfile.experienceTypes.join(", ")}
- Languages: ${request.expertProfile.languages.join(", ")}
- Years experience: ${request.expertProfile.yearsOfExperience}
- Bio: ${request.expertProfile.bio || "N/A"}
- Rating: ${request.expertProfile.averageRating || "N/A"} (${request.expertProfile.reviewCount || 0} reviews)

Return JSON:
\`\`\`json
{
  "expertId": "${request.expertProfile.id}",
  "overallScore": <0-100>,
  "breakdown": {
    "destinationMatch": <0-100>,
    "specialtyMatch": <0-100>,
    "experienceTypeMatch": <0-100>,
    "budgetAlignment": <0-100>,
    "availabilityScore": <0-100>
  },
  "strengths": ["<strength1>", "<strength2>"],
  "reasoning": "<brief explanation>"
}
\`\`\``;

  const raw = await askClaude(system, user);
  const result = parseJson<ExpertMatchResult>(raw);
  return {
    result,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0.002 },
  };
}

export async function claudeGenerateContent(
  request: ContentGenerationRequest
): Promise<{ result: ContentGenerationResult; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } }> {
  const toneMap = { professional: "polished and professional", friendly: "warm and friendly", casual: "casual and approachable" };
  const lengthMap = { short: "2-3 sentences", medium: "1-2 paragraphs", long: "3-4 paragraphs" };
  const tone = toneMap[request.tone || "professional"];
  const length = lengthMap[request.length || "medium"];

  const system = `You are an expert travel content writer. Write high-quality content that is ${tone} and ${length} long. Return ONLY valid JSON.`;

  const typeDescriptions: Record<string, string> = {
    bio: "a professional bio for a travel expert",
    service_description: "a compelling service description for a travel offering",
    inquiry_response: "a helpful response to a traveler inquiry",
    welcome_message: "a warm welcome message for a new traveler",
  };

  const user = `Write ${typeDescriptions[request.type] || request.type} using this context: ${JSON.stringify(request.context)}.

Return JSON:
\`\`\`json
{
  "content": "<main generated content>",
  "alternativeVersions": ["<shorter alt>", "<different angle alt>"],
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"]
}
\`\`\``;

  const raw = await askClaude(system, user);
  const result = parseJson<ContentGenerationResult>(raw);
  return {
    result,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0.003 },
  };
}

export async function claudeGetRealTimeIntelligence(
  request: RealTimeIntelligenceRequest
): Promise<{ result: RealTimeIntelligenceResult; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } }> {
  const system = `You are a travel intelligence system with deep knowledge of global destinations. Provide rich, accurate travel intelligence. Return ONLY valid JSON.`;
  const topics = (request.topics || ["events", "weather", "safety", "trending", "deals"]).join(", ");
  const dateRange = request.dates ? `${request.dates.start} to ${request.dates.end}` : "upcoming weeks";

  const user = `Generate real-time travel intelligence for ${request.destination} for dates: ${dateRange}.
Topics requested: ${topics}

Return JSON:
\`\`\`json
{
  "destination": "${request.destination}",
  "timestamp": "${new Date().toISOString()}",
  "events": [
    {"name": "<event>", "date": "<date>", "type": "<cultural|festival|sports|music>", "description": "<desc>", "relevance": "high"}
  ],
  "weatherForecast": {
    "summary": "<summary>",
    "temperature": {"high": <celsius>, "low": <celsius>},
    "conditions": "<sunny|rainy|etc>"
  },
  "safetyAlerts": [
    {"level": "info", "message": "<safety info>", "source": "Local authorities"}
  ],
  "trendingExperiences": [
    {"name": "<experience>", "reason": "<why trending>", "popularity": <0-100>}
  ],
  "deals": [
    {"title": "<deal>", "discount": "<% or amount>", "validUntil": "<date>"}
  ]
}
\`\`\``;

  const raw = await askClaude(system, user);
  const result = parseJson<RealTimeIntelligenceResult>(raw);
  return {
    result,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0.004 },
  };
}

export async function claudeGenerateAutonomousItinerary(
  request: AutonomousItineraryRequest
): Promise<{ result: AutonomousItineraryResult; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number } }> {
  const system = `You are an elite AI travel planner. Create detailed, realistic day-by-day travel itineraries. Be specific with times, places, costs, and local tips. Return ONLY valid JSON.`;

  const nights = Math.max(1, Math.round((new Date(request.dates.end).getTime() - new Date(request.dates.start).getTime()) / 86400000));

  const user = `Create a complete ${nights}-night itinerary for ${request.destination}.

TRIP DETAILS:
- Destination: ${request.destination}
- Dates: ${request.dates.start} to ${request.dates.end} (${nights} nights)
- Travelers: ${request.travelers}
- Budget: ${request.budget ? `$${request.budget} total` : "moderate"}
- Pace: ${request.pacePreference || "moderate"}
- Interests: ${request.interests.join(", ")}
- Must-see: ${(request.mustSeeAttractions || []).join(", ") || "none specified"}
- Dietary restrictions: ${(request.dietaryRestrictions || []).join(", ") || "none"}

Return JSON:
\`\`\`json
{
  "title": "<Trip title>",
  "summary": "<2-3 sentence overview>",
  "totalEstimatedCost": <number in USD>,
  "dailyItinerary": [
    {
      "day": 1,
      "date": "${request.dates.start}",
      "theme": "<day theme>",
      "activities": [
        {
          "time": "09:00",
          "name": "<activity name>",
          "type": "<sightseeing|food|culture|adventure|shopping>",
          "duration": "<2 hours>",
          "estimatedCost": <USD>,
          "location": "<specific place name>",
          "description": "<what to do and see>",
          "tips": "<local tip>",
          "bookingRequired": false
        }
      ],
      "meals": [
        {
          "time": "08:00",
          "type": "breakfast",
          "suggestion": "<restaurant or café name>",
          "cuisine": "<cuisine type>",
          "priceRange": "$10-15 per person"
        }
      ],
      "transportation": [
        {
          "from": "<origin>",
          "to": "<destination>",
          "mode": "<subway|taxi|walk|bus>",
          "duration": "<20 minutes>",
          "cost": <USD>
        }
      ]
    }
  ],
  "accommodationSuggestions": [
    {
      "name": "<hotel/hostel name>",
      "type": "<hotel|hostel|apartment>",
      "pricePerNight": <USD>,
      "neighborhood": "<area name>",
      "whyRecommended": "<reason>"
    }
  ],
  "packingList": ["<item1>", "<item2>"],
  "travelTips": ["<tip1>", "<tip2>"],
  "estimatedSavingsWithExpert": <USD savings estimate>
}
\`\`\`
Generate ${nights} days of activities. Be specific, realistic, and include diverse experiences.`;

  const raw = await askClaude(system, user);
  const result = parseJson<AutonomousItineraryResult>(raw);
  return {
    result,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0.01 },
  };
}
