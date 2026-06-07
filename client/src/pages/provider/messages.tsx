import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ProviderMessages() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // Redirect to /chat to consolidate messaging interface
    navigate("/chat");
  }, [navigate]);

  return null;
}
