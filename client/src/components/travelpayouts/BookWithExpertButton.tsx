import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";

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

  const handleClick = () => {
    const params = new URLSearchParams();
    if (destination) params.set("destination", destination);
    if (topic) params.set("topic", topic);
    navigate(`/experts?${params.toString()}`);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      className={`h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5 ${className ?? ""}`}
      data-testid={testId ?? "button-ask-expert"}
    >
      <UserCheck className="h-3 w-3" />
      Ask an Expert
    </Button>
  );
}
