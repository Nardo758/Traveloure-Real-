import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, Languages, MessageCircle, Clock, CheckCircle, Award, Briefcase, Heart, Home, Plane, PartyPopper, BookOpen, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useState } from "react";

const ROLE_BADGE: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
  local_expert:  { label: "Local Expert",   className: "bg-emerald-500 text-white", Icon: MapPin },
  travel_expert: { label: "Travel Advisor", className: "bg-blue-500 text-white",    Icon: Plane },
  event_planner: { label: "Event Planner",  className: "bg-purple-500 text-white",  Icon: PartyPopper },
};

interface ExpertCardProps {
  expert: {
    id: string;
    role?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
    specialties?: string[];
    reviewsCount?: number;
    tripsCount?: number;
    responseTime?: string;
    verified?: boolean;
    superExpert?: boolean;
    // Storefront metrics — real server aggregates (§13), attached by GET /api/experts.
    // All hidden when 0; sales counts increment only on completed purchase/booking.
    servicesCount?: number;      // approved+active provider_services offered
    serviceBookings?: number;    // SUM(bookingsCount) across those services
    packagesCount?: number;      // approved+published Ready Made Trips
    packagesSold?: number;       // SUM(salesCount) across those trips
    experienceTypes?: Array<{
      experienceType?: {
        id: string;
        name: string;
        slug: string;
        icon?: string;
      };
    }>;
    selectedServices?: Array<{
      offering?: {
        name: string;
        price: string;
      };
      category?: {
        name: string;
      };
    }>;
    specializations?: string[];
    expertForm?: {
      destinations?: string[];
      languages?: string[];
      yearsExperience?: string;
      responseTime?: string;
      city?: string;
      country?: string;
      neighborhoods?: string[];
      localityProof?: string;
      // LB-P4b: identity verification status. Badge renders only when explicitly
      // 'verified' — no negative badge for unverified/pending per spec.
      identityVerificationStatus?: string | null;
    };
  };
  showServices?: boolean;
  experienceTypeFilter?: string;
  onNeighbourhoodClick?: (neighbourhood: string) => void;
}

export function ExpertCard({ expert, showServices = true, experienceTypeFilter, onNeighbourhoodClick }: ExpertCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [, setLocation] = useLocation();
  
  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;
  
  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map(s => parseFloat(s.offering?.price || "0")))
    : null;
  
  const location = expert.expertForm?.city && expert.expertForm?.country
    ? `${expert.expertForm.city}, ${expert.expertForm.country}`
    : expert.expertForm?.destinations?.[0] || null;
  
  const languages = expert.expertForm?.languages || [];
  const responseTime = expert.responseTime || expert.expertForm?.responseTime || null;
  const reviewsCount = expert.reviewsCount || null;
  const tripsCount = expert.tripsCount || null;
  // LB-P4b: badge resolves from identityVerificationStatus (set by Stripe Identity /
  // Persona KYB flow). No fallback default — only render the checkmark when the
  // expert has actually completed verification. Legacy expert.verified retained as
  // a transition fallback for seeded data, but new card consumers should populate
  // expertForm.identityVerificationStatus.
  const verified = expert.expertForm?.identityVerificationStatus === "verified"
    || expert.verified === true;
  const superExpert = expert.superExpert || false;
  const hasMetrics = reviewsCount !== null || tripsCount !== null;
  
  const specialties = expert.specialties || expert.specializations?.slice(0, 2) || [];
  const neighbourhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
  const showNeighbourhoods = neighbourhoods.length > 0;

  const roleBadge = expert.role ? ROLE_BADGE[expert.role] : null;

  // Storefront metrics — what this expert has to sell + real sales volume (§13: hidden
  // when 0, never fabricated). Applies to every role incl. trip advisors + event planners.
  const servicesCount = expert.servicesCount ?? 0;
  const packagesCount = expert.packagesCount ?? 0;
  const packagesSold = expert.packagesSold ?? 0;
  const serviceBookings = expert.serviceBookings ?? 0;
  const totalSales = packagesSold + serviceBookings;
  const hasStorefront = servicesCount > 0 || packagesCount > 0;

  return (
    <Card className="relative hover-elevate transition-all duration-200 overflow-visible group" data-testid={`card-expert-${expert.id}`}>
      {roleBadge && (
        <span
          className={cn("absolute -top-2.5 left-3 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm", roleBadge.className)}
          data-testid="badge-expert-role"
        >
          <roleBadge.Icon className="w-2.5 h-2.5 shrink-0" />
          {roleBadge.label}
        </span>
      )}
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="relative shrink-0">
            <Avatar className="w-12 h-12 border border-white shadow-sm">
              <AvatarImage src={expert.profileImageUrl || undefined} alt={fullName} />
              <AvatarFallback className="bg-gradient-to-br from-[#FF385C] to-[#E23350] text-white font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            {superExpert && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
                <Award className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-[#111827] dark:text-white text-sm truncate" data-testid="text-expert-name">
                    {fullName}
                  </h3>
                  {verified && (
                    <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500 shrink-0" />
                  )}
                  {superExpert && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1 py-0 border-0 shrink-0">
                      Super
                    </Badge>
                  )}
                </div>
                
                {location && (
                  <div className="flex items-center gap-1 text-[#6B7280] text-xs">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{location}</span>
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => setIsFavorite(!isFavorite)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                data-testid="button-favorite"
              >
                <Heart className={cn(
                  "w-4 h-4 transition-colors",
                  isFavorite ? "fill-[#FF385C] text-[#FF385C]" : "text-gray-400"
                )} />
              </button>
            </div>
            
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
              <div className="flex items-center text-amber-500">
                <Star className="w-3 h-3 fill-amber-500" />
                <span className="ml-0.5 font-semibold text-[#6B7280]">New</span>
                {reviewsCount !== null && (
                  <span className="text-[#6B7280] ml-0.5">({reviewsCount})</span>
                )}
              </div>
              
              {tripsCount !== null && (
                <div className="flex items-center gap-0.5 text-[#6B7280]">
                  <Briefcase className="w-3 h-3" />
                  <span>{tripsCount} trips</span>
                </div>
              )}
              
              {responseTime && (
                <div className="flex items-center gap-0.5 text-[#6B7280]">
                  <Clock className="w-3 h-3" />
                  <span>{responseTime}</span>
                </div>
              )}
            </div>
          </div>
          
          {lowestPrice && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-[#6B7280]">From</p>
              <p className="text-lg font-bold text-[#FF385C]" data-testid="text-price">
                ${lowestPrice}
              </p>
            </div>
          )}
        </div>
        
        {(specialties.length > 0 || languages.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {specialties.slice(0, 3).map((specialty, idx) => (
              <Badge 
                key={idx} 
                variant="secondary" 
                className="text-[10px] px-1.5 py-0 bg-[#F3F4F6] dark:bg-gray-800 text-[#374151] dark:text-gray-300 border-0"
                data-testid={`badge-specialty-${idx}`}
              >
                {specialty}
              </Badge>
            ))}
            {languages.length > 0 && (
              <span className="text-[10px] text-[#6B7280] flex items-center gap-0.5">
                <Languages className="w-3 h-3" />
                {languages.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        )}

        {showNeighbourhoods && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5" data-testid="neighbourhood-chips" title="Neighbourhoods covered by this expert">
            <Home className="w-3 h-3 text-emerald-500 shrink-0" />
            {neighbourhoods.slice(0, 3).map((n, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
                  onNeighbourhoodClick && "cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors"
                )}
                data-testid={`badge-neighbourhood-${idx}`}
                onClick={onNeighbourhoodClick ? (e) => { e.preventDefault(); e.stopPropagation(); onNeighbourhoodClick(n); } : undefined}
              >
                {n}
              </Badge>
            ))}
            {neighbourhoods.length > 3 && (
              <span className="text-[10px] text-[#9CA3AF]">+{neighbourhoods.length - 3}</span>
            )}
          </div>
        )}
        
        {/* Storefront — what this expert sells + real sales volume (§13: hidden at 0). */}
        {hasStorefront && (
          <div
            className="flex flex-wrap items-center gap-1.5 mt-2"
            data-testid="expert-storefront"
          >
            {servicesCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                data-testid="storefront-services"
              >
                <Briefcase className="w-2.5 h-2.5" />
                {servicesCount} {servicesCount === 1 ? "service" : "services"}
              </span>
            )}
            {packagesCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
                data-testid="storefront-trips"
              >
                <BookOpen className="w-2.5 h-2.5" />
                {packagesCount} {packagesCount === 1 ? "trip" : "trips"}
              </span>
            )}
            {totalSales > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[var(--earn-gold-wash)] text-[color:var(--earn-gold-ink)]"
                data-testid="storefront-sales"
                title={`${serviceBookings} bookings · ${packagesSold} trips sold`}
              >
                <TrendingUp className="w-2.5 h-2.5" />
                {totalSales} sold
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5E7EB] dark:border-gray-700">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1 h-7 text-xs"
            data-testid="button-message"
            onClick={() => setLocation(`/chat?expertId=${expert.id}`)}
          >
            <MessageCircle className="w-3 h-3" />
            Message
          </Button>
          <Link href={`/experts/${expert.id}`} className="flex-1">
            <Button 
              size="sm" 
              className="w-full bg-[#FF385C] hover:bg-[#E23350] h-7 text-xs"
              data-testid="button-view-profile"
            >
              View Profile
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
