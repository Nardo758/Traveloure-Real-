export interface LandingHeroWantedSlot {
  title: string;
  city: string;
}

export interface LandingHeroPayload {
  city: string | null;
  trend: number | null;
  crowd: string | null;
  anchorExpert: {
    name: string;
    handle: string | null;
    fromPriceCents: number | null;
    imageUrl?: string;
  } | null;
  gem: { name: string; score: number | null; imageUrl?: string } | null;
  service: { name: string; priceCents: number | null; imageUrl?: string } | null;
  /** null = coverage unknown; [] = known coverage with no unmet offering types. */
  wanted: LandingHeroWantedSlot[] | null;
}