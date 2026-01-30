import { Link } from "wouter";
import { motion } from "framer-motion";
import { LucideIcon, Users, TrendingUp, Gem, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExperienceCardProps {
  label: string;
  description?: string;
  image: string;
  trending: number;
  expertRates: string;
  hiddenGems: number;
  slug: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  categories?: { label: string; color: string; bgColor: string }[];
  status?: "Busy" | "Moderate" | "Quiet";
  tip?: string;
  activeCount?: number;
  isHot?: boolean;
  delay?: number;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Busy': return 'text-orange-500 dark:text-orange-400';
    case 'Moderate': return 'text-yellow-500 dark:text-yellow-400';
    case 'Quiet': return 'text-green-500 dark:text-green-400';
    default: return 'text-gray-500 dark:text-gray-400';
  }
};

const getStatusBg = (status: string) => {
  switch (status) {
    case 'Busy': return 'bg-orange-50 dark:bg-orange-900/20';
    case 'Moderate': return 'bg-yellow-50 dark:bg-yellow-900/20';
    case 'Quiet': return 'bg-green-50 dark:bg-green-900/20';
    default: return 'bg-gray-50 dark:bg-gray-800';
  }
};

export function ExperienceCard({
  label,
  description,
  image,
  trending,
  expertRates,
  hiddenGems,
  slug,
  icon: Icon,
  color,
  bgColor,
  categories,
  status = "Moderate",
  tip,
  activeCount = 0,
  isHot = false,
  delay = 0,
}: ExperienceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group"
    >
      <Link href={`/experiences/${slug}`}>
        <div 
          className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer border border-border"
          data-testid={`card-experience-${slug}`}
        >
          {/* Image Header with Overlay */}
          <div className="relative h-48 overflow-hidden">
            <img
              src={image}
              alt={label}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            
            {/* Trending Score Badge - Top Right */}
            <div 
              className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
              data-testid={`badge-trending-score-${slug}`}
            >
              <span className={cn(
                "text-lg font-bold",
                trending >= 70 ? "text-[#FF385C]" : trending >= 50 ? "text-orange-500 dark:text-orange-400" : "text-amber-500 dark:text-amber-400"
              )}>
                {trending}
              </span>
            </div>
            
            {/* Hot/Trending Badge - Top Left */}
            <div className="absolute top-3 left-3">
              {isHot || trending >= 60 ? (
                <span 
                  className="px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                  data-testid={`badge-hot-${slug}`}
                >
                  <Sparkles className="w-3 h-3 fill-white" />
                  Hot
                </span>
              ) : (
                <span 
                  className="px-2.5 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                  data-testid={`badge-trending-${slug}`}
                >
                  <TrendingUp className="w-3 h-3" />
                  Trending
                </span>
              )}
            </div>

            {/* Title & Icon */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
                bgColor
              )}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{label}</h3>
                {description && (
                  <p className="text-white/80 text-sm">{description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Card Content */}
          <div className="p-4">
            {/* Category Tags */}
            {categories && categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {categories.slice(0, 3).map((cat) => (
                  <span
                    key={cat.label}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      cat.bgColor,
                      cat.color
                    )}
                  >
                    {cat.label}
                  </span>
                ))}
                {categories.length > 3 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted dark:bg-muted text-muted-foreground">
                    +{categories.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Expert Rates with Status */}
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">{expertRates}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center">
                  Expert rates
                </span>
              </div>
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                getStatusColor(status),
                getStatusBg(status)
              )}>
                {status}
              </span>
            </div>

            {/* Tip Section */}
            {tip && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-3">
                    {tip}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Stats Row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border" data-testid={`stats-footer-${slug}`}>
              {activeCount > 0 && (
                <div className="flex items-center gap-1" data-testid={`stat-active-${slug}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  {activeCount} active
                </div>
              )}
              <div className="flex items-center gap-1" data-testid={`stat-trending-${slug}`}>
                <TrendingUp className="w-3 h-3" />
                {trending}
              </div>
              <div className="flex items-center gap-1" data-testid={`stat-gems-${slug}`}>
                <Gem className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                {hiddenGems}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
