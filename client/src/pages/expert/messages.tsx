import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ExpertMessages() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to /chat to consolidate messaging interface
    navigate("/chat", { replace: true });
  }, [navigate]);

  return null;
}
