import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, Languages, MessageCircle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface ExpertCardProps {
  expert: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
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
    };
  };
  showServices?: boolean;
  experienceTypeFilter?: string;
}

const specializationLabels: Record<string, string> = {
  budget_travel: "Budget Travel",
  luxury_experiences: "Luxury",
  adventure_outdoor: "Adventure",
  cultural_immersion: "Cultural",
  family_friendly: "Family",
  solo_travel: "Solo",
  food_wine: "Food & Wine",
  photography_tours: "Photography",
  honeymoon: "Honeymoon",
  wellness_retreat: "Wellness",
  group_travel: "Groups",
  backpacking: "Backpacking",
};

export function ExpertCard({ expert, showServices = true, experienceTypeFilter }: ExpertCardProps) {
  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Travel Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;
  
  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map(s => parseFloat(s.offering?.price || "0")))
    : null;
  
  const experienceNames = expert.experienceTypes
    ?.filter(et => et.experienceType)
    .map(et => et.experienceType!.name)
    .slice(0, 3) || [];
  
  const moreExperienceCount = (expert.experienceTypes?.length || 0) - 3;

  return (
    <Card className="hover-elevate transition-all duration-200 overflow-visible" data-testid={`card-expert-${expert.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="w-14 h-14 border-2 border-[#FF385C]/20">
            <AvatarImage src={expert.profileImageUrl || undefined} alt={fullName} />
            <AvatarFallback className="bg-[#FF385C] text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[#111827] dark:text-white text-lg" data-testid="text-expert-name">
                {fullName}
              </h3>
              <div className="flex items-center text-amber-500">
                <Star className="w-4 h-4 fill-amber-500" />
                <span className="text-sm ml-1 font-medium">4.9</span>
              </div>
            </div>
            
            {expert.expertForm?.destinations && expert.expertForm.destinations.length > 0 && (
              <div className="flex items-center gap-1.5 text-[#6B7280] text-sm mt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{expert.expertForm.destinations.slice(0, 2).join(", ")}</span>
              </div>
            )}
            
            {expert.bio && (
              <p className="text-[#6B7280] text-sm mt-2 line-clamp-2">
                {expert.bio}
              </p>
            )}
          </div>
          
          {lowestPrice && (
            <div className="text-right shrink-0">
              <p className="text-xs text-[#6B7280]">From</p>
              <p className="text-xl font-bold text-[#FF385C]" data-testid="text-price">
                ${lowestPrice}
              </p>
            </div>
          )}
        </div>
        
        {experienceNames.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs text-[#6B7280] mb-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>Experience Types</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {experienceNames.map((name) => (
                <Badge 
                  key={name} 
                  variant="secondary" 
                  className="text-xs px-2 py-0.5 bg-[#FF385C]/10 text-[#FF385C] border-0"
                  data-testid={`badge-experience-${name.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {name}
                </Badge>
              ))}
              {moreExperienceCount > 0 && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  +{moreExperienceCount} more
                </Badge>
              )}
            </div>
          </div>
        )}
        
        {expert.specializations && expert.specializations.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {expert.specializations.slice(0, 4).map((spec) => (
                <Badge 
                  key={spec} 
                  variant="outline" 
                  className="text-xs px-2 py-0.5"
                  data-testid={`badge-spec-${spec}`}
                >
                  {specializationLabels[spec] || spec}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {showServices && expert.selectedServices && expert.selectedServices.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E5E7EB] dark:border-gray-700">
            <p className="text-xs text-[#6B7280] mb-2">Services Offered</p>
            <div className="space-y-1.5">
              {expert.selectedServices.slice(0, 3).map((service, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between text-sm"
                  data-testid={`service-${idx}`}
                >
                  <span className="text-[#374151] dark:text-gray-300 truncate max-w-[200px]">
                    {service.offering?.name}
                  </span>
                  <span className="text-[#FF385C] font-medium shrink-0 ml-2">
                    ${service.offering?.price}
                  </span>
                </div>
              ))}
              {expert.selectedServices.length > 3 && (
                <p className="text-xs text-[#6B7280]">
                  +{expert.selectedServices.length - 3} more services
                </p>
              )}
            </div>
          </div>
        )}
        
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#E5E7EB] dark:border-gray-700">
          {expert.expertForm?.languages && expert.expertForm.languages.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-[#6B7280] flex-1">
              <Languages className="w-3.5 h-3.5" />
              <span>{expert.expertForm.languages.slice(0, 2).join(", ")}</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="gap-1.5"
              data-testid="button-message"
            >
              <MessageCircle className="w-4 h-4" />
              Message
            </Button>
            <Link href={`/experts/${expert.id}`}>
              <Button 
                size="sm" 
                className="bg-[#FF385C] hover:bg-[#E23350]"
                data-testid="button-view-profile"
              >
                View Profile
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
