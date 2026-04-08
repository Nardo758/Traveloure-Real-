import "./_group.css";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Star, MapPin, MessageCircle, CheckCircle, Award,
  Briefcase, Clock, Heart
} from "lucide-react";

const mockExpert = {
  id: "1",
  firstName: "Sofia",
  lastName: "Chen",
  profileImageUrl: "",
  verified: true,
  superExpert: false,
  reviewsCount: 142,
  tripsCount: 89,
  responseTime: "< 1 hour",
  location: "Los Angeles, United States",
  expertise: ["Cultural Tours", "Food & Wine", "Historical Sites"],
  services: ["Custom Day Tour", "Airport Transfer", "Private Guide"],
  lowestPrice: 120,
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function ExpertCardPreview() {
  const [isFavorite, setIsFavorite] = useState(false);

  const { firstName, lastName, verified, superExpert, reviewsCount, tripsCount,
    responseTime, location, expertise, services, lowestPrice } = mockExpert;

  const fullName = `${firstName} ${lastName}`;
  const initials = `${firstName[0]}${lastName[0]}`;
  const rating = 4.9;

  return (
    <div style={{ width: 380 }}>
      <Card className="overflow-visible" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.10)", borderRadius: 12 }}>
        <CardContent className="p-4">

          {/* Header: Avatar + Name + Location */}
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <Avatar className="w-14 h-14 border border-white shadow-sm">
                <AvatarFallback style={{ background: "linear-gradient(135deg, #FF385C, #E23350)", color: "white", fontWeight: 600, fontSize: 18 }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {superExpert && (
                <div className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: "#F59E0B" }}>
                  <Award className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 style={{ fontWeight: 600, color: "#111827", fontSize: 14, margin: 0 }}>
                      {fullName}
                    </h3>
                    {verified && <CheckCircle className="w-3.5 h-3.5" style={{ color: "#3B82F6", fill: "#3B82F6", flexShrink: 0 }} />}
                  </div>

                  <div className="flex items-center gap-1 mt-0.5" style={{ color: "#6B7280", fontSize: 12 }}>
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{location}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 flex-wrap" style={{ fontSize: 12 }}>
                    <div className="flex items-center gap-0.5" style={{ color: "#F59E0B" }}>
                      <Star className="w-3 h-3" style={{ fill: "#F59E0B" }} />
                      <span style={{ fontWeight: 600 }}>{rating.toFixed(1)}</span>
                      <span style={{ color: "#6B7280" }}>({reviewsCount})</span>
                    </div>
                    <div className="flex items-center gap-0.5" style={{ color: "#6B7280" }}>
                      <Briefcase className="w-3 h-3" />
                      <span>{tripsCount} trips</span>
                    </div>
                    <div className="flex items-center gap-0.5" style={{ color: "#6B7280" }}>
                      <Clock className="w-3 h-3" />
                      <span>{responseTime}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: "50%", flexShrink: 0 }}
                >
                  <Heart
                    className="w-4 h-4"
                    style={{ color: isFavorite ? "#FF385C" : "#D1D5DB", fill: isFavorite ? "#FF385C" : "none", transition: "all 0.15s" }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Expertise */}
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 6px 0" }}>
              Expertise
            </p>
            <div className="flex flex-wrap gap-1">
              {expertise.map((item, i) => (
                <Badge key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#EEF2FF", color: "#4F46E5", border: "none", fontWeight: 500, borderRadius: 6 }}>
                  {item}
                </Badge>
              ))}
            </div>
          </div>

          {/* Services */}
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 6px 0" }}>
              Services
            </p>
            <div className="flex flex-wrap gap-1">
              {services.map((svc, i) => (
                <Badge key={i} variant="outline" style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #E5E7EB", color: "#374151", fontWeight: 400, borderRadius: 6 }}>
                  {svc}
                </Badge>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
            <div style={{ marginRight: "auto" }}>
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>From</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#FF385C", margin: 0, lineHeight: 1 }}>
                ${lowestPrice}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              style={{ height: 32, fontSize: 12 }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Message
            </Button>
            <Button
              size="sm"
              className="flex-1"
              style={{ height: 32, fontSize: 12, background: "#FF385C", border: "none" }}
            >
              View Profile
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
