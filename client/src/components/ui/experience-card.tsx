import { Link } from "wouter";
import { motion } from "framer-motion";
import { LucideIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExperienceCardProps {
  label: string;
  description?: string;
  image: string;
  slug: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  categories?: { label: string; color: string; bgColor: string }[];
  tip?: string;
  delay?: number;
}

export function ExperienceCard({
  label,
  description,
  image,
  slug,
  icon: Icon,
  color,
  bgColor,
  categories,
  tip,
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

            {/* Tip Section */}
            {tip && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-3">
                    {tip}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
