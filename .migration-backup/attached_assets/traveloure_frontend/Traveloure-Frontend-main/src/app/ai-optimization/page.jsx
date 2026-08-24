"use client";
import React, { useEffect, useState } from "react"
import AiOptimizationResult from "../../components/ai-optimization-result/page"
import { useSelector } from "react-redux"


export default function AiOptimizationPage() {
  const { aiData } = useSelector((state) => ({
    aiData: state?.itinerary?.srvicesDetailData?.itinerary,
  }));
  const [localItinerary, setLocalItinerary] = useState(null);
  const [tripId, setTripId] = useState(null);

  useEffect(() => {
    if (!aiData && typeof window !== 'undefined') {
      const stored = localStorage.getItem("selectedTrip");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.itinerary_data) {
            setLocalItinerary(parsed.itinerary_data);
          }
          // Extract trip ID if available
          if (parsed && (parsed.id || parsed.trip)) {
            setTripId(parsed.id || parsed.trip);
          }
        } catch (e) {
          setLocalItinerary(null);
        }
      }
    }
  }, [aiData]);

  const dataToShow = aiData || localItinerary || {};

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <AiOptimizationResult data={dataToShow} tripId={tripId} />
    </div>
  );
}
