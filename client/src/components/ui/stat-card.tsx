import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  delay?: number;
}

export function StatCard({
  value,
  label,
  description,
  icon: Icon,
  color,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <div 
        className="h-full border border-border bg-card dark:bg-card shadow-card hover:shadow-card-hover transition-all duration-300 rounded-2xl overflow-hidden group"
        data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="p-6">
          {/* Icon with Color Accent */}
          <div className="relative mb-4">
            <div className={cn("w-12 h-12 rounded-xl bg-muted dark:bg-muted flex items-center justify-center transition-transform duration-300 group-hover:scale-110", color)}>
              <Icon className="w-6 h-6" />
            </div>
            {/* Decorative Background Circle */}
            <div className={cn("absolute top-0 left-0 w-12 h-12 rounded-xl opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40", color.replace('text-', 'bg-'))} />
          </div>
          
          {/* Value */}
          <p className={cn("text-4xl font-bold mb-1 transition-colors duration-300", color)}>{value}</p>
          
          {/* Label */}
          <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
          
          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        
        {/* Decorative Gradient Bar at Bottom */}
        <div className="h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-50" style={{ color: color.includes('[#FF385C]') ? '#FF385C' : undefined }} />
      </div>
    </motion.div>
  );
}
