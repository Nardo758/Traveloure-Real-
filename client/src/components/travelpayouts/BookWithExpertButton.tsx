import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";
import { useExpertAvailability } from "@/lib/expert-availability";

interface BookWithExpertButtonProps {
  destination?: string;
  topic?: string;
  className?: string;
  "data-testid"?: string;
}

export function BookWithExpertButton({
  destination,
  topic,
  className,
  "data-testid": testId,
}: BookWithExpertButtonProps) {
  const [, navigate] = useLocation();
  // SH-1 item 11: draws only when the server says there is an expert to ask — for the card's
  // destination when it names one, else for any live market (the link then names no city).
  const expertAvailable = useExpertAvailability(destination ? { city: destination } : "any");

  const handleClick = () => {
    const params = new URLSearchParams();
    if (destination) params.set("destination", destination);
    if (topic) params.set("topic", topic);
    params.set("role", "travel_expert");
    navigate(`/experts?${params.toString()}`);
  };

  if (!expertAvailable) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      className={`h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5 ${className ?? ""}`}
      data-testid={testId ?? "button-ask-expert"}
    >
      <UserCheck className="h-3 w-3" />
      Work with a Trip Planner
    </Button>
  );
}
