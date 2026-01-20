/**
 * Content Enrichment Service
 * Merges xAI-generated recommendations with actionable affiliate/SERP data
 * Creates bookable, saveable content for users
 */

import { serpService, EnrichedVenue } from './serp.service';
import { travelPulseService } from './travelpulse.service';

export interface AIRecommendation {
  name: string;
  type: string;
  reason: string;
  priceRange?: string;
  source: 'grok' | 'claude';
}

export interface EnrichedRecommendation extends EnrichedVenue {
  aiReason: string;
  aiPriceRange?: string;
  matchConfidence: 'high' | 'medium' | 'low';
  actionType: 'book' | 'visit' | 'explore' | 'reserve';
  bookingOptions?: {
    platform: string;
    url: string;
    type: 'reservation' | 'tickets' | 'tour' | 'website';
  }[];
}

export interface CityEnrichedContent {
  cityName: string;
  country: string;
  lastUpdated: Date;
  restaurants: EnrichedRecommendation[];
  attractions: EnrichedRecommendation[];
  nightlife: EnrichedRecommendation[];
  hiddenGems: EnrichedRecommendation[];
  trendingNow: EnrichedRecommendation[];
}

class ContentEnrichmentService {
  
  async enrichCityRecommendations(
    cityName: string,
    country: string,
    aiRecommendations: {
      hiddenGems: Array<{ name: string; type: string; whySpecial: string; priceRange: string }>;
      mustSeeAttractions: string[];
      whatsHotNow?: string;
    }
  ): Promise<CityEnrichedContent> {
    console.log(`[ContentEnrichment] Enriching recommendations for ${cityName}, ${country}`);
    
    const [restaurants, attractions, nightlife] = await Promise.all([
      this.enrichCategory(cityName, country, aiRecommendations.hiddenGems.filter(g => 
        ['restaurant', 'cafe', 'food'].includes(g.type.toLowerCase())
      ), 'restaurant'),
      this.enrichAttractions(cityName, country, aiRecommendations.mustSeeAttractions),
      serpService.searchNightlife(cityName, country),
    ]);

    const hiddenGems = await this.enrichHiddenGems(
      cityName, 
      country, 
      aiRecommendations.hiddenGems.filter(g => 
        !['restaurant', 'cafe', 'food'].includes(g.type.toLowerCase())
      )
    );

    const trendingNow: EnrichedRecommendation[] = [];
    if (aiRecommendations.whatsHotNow) {
      const trending = await serpService.searchVenueByName(
        aiRecommendations.whatsHotNow, 
        cityName, 
        country
      );
      if (trending) {
        trendingNow.push(this.toEnrichedRecommendation(trending, {
          name: aiRecommendations.whatsHotNow,
          type: 'trending',
          reason: 'Currently trending in the city',
          source: 'grok'
        }));
      }
    }

    return {
      cityName,
      country,
      lastUpdated: new Date(),
      restaurants: restaurants.map(r => this.addBookingOptions(r, 'restaurant')),
      attractions: attractions.map(a => this.addBookingOptions(a, 'attraction')),
      nightlife: nightlife.map(n => this.toEnrichedRecommendation(n, {
        name: n.name,
        type: 'nightlife',
        reason: 'Popular nightlife spot',
        source: 'grok'
      })),
      hiddenGems,
      trendingNow,
    };
  }

  private async enrichCategory(
    city: string,
    country: string,
    aiItems: Array<{ name: string; type: string; whySpecial: string; priceRange: string }>,
    category: string
  ): Promise<EnrichedRecommendation[]> {
    const enriched: EnrichedRecommendation[] = [];

    for (const item of aiItems.slice(0, 5)) {
      const venue = await serpService.searchVenueByName(item.name, city, country);
      if (venue) {
        enriched.push(this.toEnrichedRecommendation(venue, {
          name: item.name,
          type: item.type,
          reason: item.whySpecial,
          priceRange: item.priceRange,
          source: 'grok'
        }));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (enriched.length < 5) {
      const searchResults = category === 'restaurant' 
        ? await serpService.searchRestaurants(city, country)
        : await serpService.searchAttractions(city, country);
      
      for (const result of searchResults.slice(0, 5 - enriched.length)) {
        enriched.push(this.toEnrichedRecommendation(result, {
          name: result.name,
          type: category,
          reason: 'Highly rated locally',
          source: 'grok'
        }));
      }
    }

    return enriched;
  }

  private async enrichAttractions(
    city: string,
    country: string,
    attractionNames: string[]
  ): Promise<EnrichedRecommendation[]> {
    const enriched: EnrichedRecommendation[] = [];

    for (const name of attractionNames.slice(0, 5)) {
      const venue = await serpService.searchVenueByName(name, city, country);
      if (venue) {
        enriched.push(this.toEnrichedRecommendation(venue, {
          name,
          type: 'attraction',
          reason: 'Must-see attraction recommended by AI',
          source: 'grok'
        }));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return enriched;
  }

  private async enrichHiddenGems(
    city: string,
    country: string,
    gems: Array<{ name: string; type: string; whySpecial: string; priceRange: string }>
  ): Promise<EnrichedRecommendation[]> {
    const enriched: EnrichedRecommendation[] = [];

    for (const gem of gems.slice(0, 5)) {
      const venue = await serpService.searchVenueByName(gem.name, city, country);
      if (venue) {
        enriched.push(this.toEnrichedRecommendation(venue, {
          name: gem.name,
          type: gem.type,
          reason: gem.whySpecial,
          priceRange: gem.priceRange,
          source: 'grok'
        }));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return enriched;
  }

  private toEnrichedRecommendation(
    venue: EnrichedVenue,
    aiRec: AIRecommendation
  ): EnrichedRecommendation {
    const nameMatch = venue.name.toLowerCase().includes(aiRec.name.toLowerCase().split(' ')[0]);
    
    return {
      ...venue,
      aiReason: aiRec.reason,
      aiPriceRange: aiRec.priceRange,
      matchConfidence: nameMatch ? 'high' : 'medium',
      actionType: this.inferActionType(venue.type),
      bookingOptions: [],
    };
  }

  private inferActionType(type: string): 'book' | 'visit' | 'explore' | 'reserve' {
    switch (type) {
      case 'restaurant':
        return 'reserve';
      case 'hotel':
        return 'book';
      case 'activity':
        return 'book';
      case 'attraction':
        return 'visit';
      case 'nightlife':
        return 'explore';
      default:
        return 'explore';
    }
  }

  private addBookingOptions(
    rec: EnrichedRecommendation,
    type: string
  ): EnrichedRecommendation {
    const options: EnrichedRecommendation['bookingOptions'] = [];

    if (rec.website) {
      options.push({
        platform: 'Official Website',
        url: rec.website,
        type: 'website',
      });
    }

    if (type === 'restaurant') {
      options.push({
        platform: 'OpenTable',
        url: `https://www.opentable.com/s?term=${encodeURIComponent(rec.name)}`,
        type: 'reservation',
      });
    }

    if (type === 'attraction') {
      options.push({
        platform: 'Viator',
        url: `https://www.viator.com/searchResults/all?text=${encodeURIComponent(rec.name)}`,
        type: 'tickets',
      });
      options.push({
        platform: 'GetYourGuide',
        url: `https://www.getyourguide.com/s/?q=${encodeURIComponent(rec.name)}`,
        type: 'tour',
      });
    }

    return { ...rec, bookingOptions: options };
  }

  async getEnrichedContentForCity(cityName: string): Promise<CityEnrichedContent | null> {
    try {
      const city = await travelPulseService.getCityByName(cityName);
      if (!city) return null;

      // Fetch hidden gems from separate table and transform to expected format
      const hiddenGems = await travelPulseService.getHiddenGems(cityName);
      const hiddenGemsData = hiddenGems.map(gem => ({
        name: gem.placeName,
        type: gem.placeType || 'attraction',
        whySpecial: gem.whyLocalsLoveIt || gem.description || 'Local favorite',
        priceRange: gem.priceRange || '$$',
      }));

      const aiRecommendations = {
        hiddenGems: hiddenGemsData,
        mustSeeAttractions: (city.aiMustSeeAttractions as string[]) || [],
        whatsHotNow: city.currentHighlight || undefined,
      };

      return this.enrichCityRecommendations(
        city.cityName,
        city.country,
        aiRecommendations
      );
    } catch (error) {
      console.error('[ContentEnrichment] Error:', error);
      return null;
    }
  }
}

export const contentEnrichmentService = new ContentEnrichmentService();
