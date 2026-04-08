import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MapPin, MessageCircle, CheckCircle, Award, Briefcase, Clock, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
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

const RESPONSE_TIME_MAP: Record<string, string> = {
  under_1_hour: "< 1 hour",
  under_2_hours: "< 2 hours",
  under_4_hours: "< 4 hours",
  under_8_hours: "< 8 hours",
  under_24_hours: "< 24 hours",
  under_48_hours: "< 48 hours",
  same_day: "Same day",
  within_a_day: "Within a day",
};

function formatResponseTime(raw?: string | null): string | null {
  if (!raw) return null;
  return RESPONSE_TIME_MAP[raw] ?? raw;
}

export function ExpertCard({ expert, showServices = true }: ExpertCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [, setLocation] = useLocation();

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Travel Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;

  const location = expert.expertForm?.city && expert.expertForm?.country
    ? `${expert.expertForm.city}, ${expert.expertForm.country}`
    : expert.expertForm?.destinations?.[0] || null;

  const rawResponseTime = expert.responseTime || expert.expertForm?.responseTime || null;
  const responseTime = formatResponseTime(rawResponseTime);

  const reviewsCount = expert.reviewsCount ?? null;
  const tripsCount = expert.tripsCount ?? null;
  const rating = 4.9;
  const verified = expert.verified !== false;
  const superExpert = expert.superExpert || false;

  const expertise = [
    ...(expert.specialties || []),
    ...(expert.specializations || []),
    ...(expert.experienceTypes?.map(e => e.experienceType?.name).filter(Boolean) as string[] || []),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);

  const services = expert.selectedServices
    ?.map(s => s.offering?.name || s.category?.name)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3) as string[] | undefined;

  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map(s => parseFloat(s.offering?.price || "0")).filter(p => p > 0))
    : null;

  return (
    <Card className="hover-elevate transition-all duration-200 overflow-visible group" data-testid={`card-expert-${expert.id}`}>
      <CardContent className="p-4">

        {/* Header: Avatar + Name + Location */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar className="w-14 h-14 border border-white shadow-sm">
              <AvatarImage src={expert.profileImageUrl || undefined} alt={fullName} />
              <AvatarFallback className="bg-gradient-to-br from-[#FF385C] to-[#E23350] text-white font-semibold text-base">
                {initials}
              </AvatarFallback>
            </Avatar>
            {superExpert && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
                <Award className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-semibold text-[#111827] text-sm" data-testid="text-expert-name">
                    {fullName}
                  </h3>
                  {verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500 shrink-0" />}
                  {superExpert && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 border-0 shrink-0">
                      Super
                    </Badge>
                  )}
                </div>

                {location && (
                  <div className="flex items-center gap-1 text-[#6B7280] text-xs mt-0.5" data-testid="text-expert-location">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{location}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                  <div className="flex items-center gap-0.5 text-amber-500">
                    <Star className="w-3 h-3 fill-amber-500" />
                    <span className="font-semibold">{rating.toFixed(1)}</span>
                    <span className="text-[#6B7280]">
                      ({reviewsCount !== null ? reviewsCount : "New"})
                    </span>
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

              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors shrink-0"
                data-testid="button-favorite"
              >
                <Heart className={cn("w-4 h-4 transition-colors", isFavorite ? "fill-[#FF385C] text-[#FF385C]" : "text-gray-400")} />
              </button>
            </div>
          </div>
        </div>

        {/* Expertise */}
        {expertise.length > 0 && (
          <div className="mt-3" data-testid="section-expertise">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1.5">Expertise</p>
            <div className="flex flex-wrap gap-1">
              {expertise.map((item, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-[11px] px-2 py-0.5 bg-[#EEF2FF] text-[#4F46E5] border-0 font-medium"
                  data-testid={`badge-expertise-${idx}`}
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Services */}
        {showServices && services && services.length > 0 && (
          <div className="mt-3" data-testid="section-services">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1.5">Services</p>
            <div className="flex flex-wrap gap-1">
              {services.map((service, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 border-[#E5E7EB] text-[#374151] font-normal"
                  data-testid={`badge-service-${idx}`}
                >
                  {service}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F3F4F6]">
          {lowestPrice !== null && lowestPrice > 0 && (
            <div className="mr-auto">
              <p className="text-[10px] text-[#9CA3AF]">From</p>
              <p className="text-base font-bold text-[#FF385C] leading-none" data-testid="text-price">
                ${lowestPrice}
              </p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1 h-8 text-xs"
            data-testid="button-message"
            onClick={() => setLocation(`/chat?expertId=${expert.id}`)}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Message
          </Button>
          <Link href={`/experts/${expert.id}`} className="flex-1">
            <Button
              size="sm"
              className="w-full bg-[#FF385C] hover:bg-[#E23350] h-8 text-xs"
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
