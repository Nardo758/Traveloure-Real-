import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, Languages, MessageCircle, Clock, CheckCircle, Award, Briefcase, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useState } from "react";

interface ExpertCardProps {
  expert: {
    id: string;
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
    };
  };
  showServices?: boolean;
  experienceTypeFilter?: string;
}

export function ExpertCard({ expert, showServices = true, experienceTypeFilter }: ExpertCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  
  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Travel Expert";
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
  const rating = 4.9; // Default rating when not available
  const verified = expert.verified !== false;
  const superExpert = expert.superExpert || false;
  const hasMetrics = reviewsCount !== null || tripsCount !== null;
  
  const specialties = expert.specialties || expert.specializations?.slice(0, 2) || [];

  return (
    <Card className="hover-elevate transition-all duration-200 overflow-visible group max-w-sm" data-testid={`card-expert-${expert.id}`}>
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
                <span className="ml-0.5 font-semibold">{rating.toFixed(1)}</span>
                {reviewsCount !== null ? (
                  <span className="text-[#6B7280] ml-0.5">({reviewsCount})</span>
                ) : (
                  <span className="text-[#6B7280] ml-0.5">(New)</span>
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
        
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5E7EB] dark:border-gray-700">
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 gap-1 h-7 text-xs"
            data-testid="button-message"
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
