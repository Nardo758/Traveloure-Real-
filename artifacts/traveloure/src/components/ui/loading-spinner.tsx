import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-10 h-10",
  xl: "w-16 h-16",
};

export function LoadingSpinner({ size = "md", className, text }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Loader2 className={cn("animate-spin text-primary", sizeClasses[size], className)} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

// Full page loading overlay
export function LoadingOverlay({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <LoadingSpinner size="xl" text={text} />
    </div>
  );
}

// Inline loading state
export function InlineLoading({ text }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  );
}
