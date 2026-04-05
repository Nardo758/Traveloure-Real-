import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ExpertMessages() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to /chat to consolidate messaging interface
    setLocation("/chat");
  }, [setLocation]);

  return null;
}
