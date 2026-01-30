import { motion } from "framer-motion";
import { Star, MapPin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TestimonialCardProps {
  text: string;
  author: string;
  location: string;
  rating: number;
  avatar: string;
  destination: string;
  tripType: string;
  expertName: string;
  expertHeatScore: number;
  valueSaved: string;
  expertRate: string;
  tripImage: string;
  delay?: number;
}

export function TestimonialCard({
  text,
  author,
  location,
  rating,
  avatar,
  destination,
  tripType,
  expertName,
  expertHeatScore,
  valueSaved,
  expertRate,
  tripImage,
  delay = 0,
}: TestimonialCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <div 
        className="h-full border border-border bg-background dark:bg-muted/50 shadow-card hover:shadow-card-hover transition-all duration-300 relative overflow-hidden rounded-2xl"
        data-testid={`card-testimonial-${author.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {/* Trip Image Header with Gradient Overlay */}
        <div className="relative h-32 overflow-hidden">
          <img 
            src={tripImage} 
            alt={destination}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          {/* Trip Type Badge - Top Left */}
          <div className="absolute top-2 left-3">
            <span className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-semibold shadow-sm">
              {tripType}
            </span>
          </div>
          
          {/* Destination */}
          <div className="absolute bottom-2 left-3 right-3">
            <div className="flex items-center gap-1 text-white/90 text-sm font-semibold">
              <MapPin className="w-3 h-3" />
              {destination}
            </div>
          </div>
        </div>
        
        <div className="p-5 relative">
          {/* Star Rating */}
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star 
                key={star} 
                className={cn(
                  "w-4 h-4",
                  star <= rating 
                    ? "text-amber-400 fill-amber-400" 
                    : "text-muted-foreground/30"
                )} 
              />
            ))}
          </div>
          
          {/* Testimonial Text */}
          <p className="text-sm text-foreground leading-relaxed mb-4 line-clamp-4">
            "{text}"
          </p>
          
          {/* Expert & Heat Score Info */}
          <div className="bg-muted dark:bg-muted/50 rounded-xl p-3 mb-4" data-testid="expert-info">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Expert consulted</span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Verified
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground" data-testid="expert-name">{expertName}</span>
                <span className="px-1.5 py-0.5 rounded bg-[#FF385C]/10 text-[#FF385C] text-xs font-bold" data-testid="expert-score">
                  {expertHeatScore}
                </span>
              </div>
              <span className="text-xs text-muted-foreground" data-testid="expert-rate">{expertRate}</span>
            </div>
          </div>
          
          {/* Value Saved Badge */}
          <div className="flex items-center justify-between mb-4 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg" data-testid="value-saved">
            <span className="text-xs text-emerald-700 dark:text-emerald-300">Value gained</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{valueSaved}</span>
          </div>
          
          {/* Author */}
          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF385C] to-[#FF8E53] flex items-center justify-center text-white font-semibold text-sm shadow-lg">
              {avatar}
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{author}</p>
              <p className="text-xs text-muted-foreground">{location}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
