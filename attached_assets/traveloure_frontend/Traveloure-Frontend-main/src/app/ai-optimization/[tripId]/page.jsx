"use client";
import React, { useEffect, useState } from "react"
import AiOptimizationResult from "../../../components/ai-optimization-result/page"
import { useSelector } from "react-redux"
import { useParams } from "next/navigation"

export default function AiOptimizationPageWithTripId() {
  const params = useParams();
  const Id = params.tripId;
  const localId = localStorage.getItem("itinerary_id");
  const tripId = Id || localId;
  const { aiData } = useSelector((state) => ({
    aiData: state?.itinerary?.srvicesDetailData?.itinerary,
  }));
  const [localItinerary, setLocalItinerary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSharedTrip = async () => {
      // If we have aiData or localItinerary, don't fetch
      if (aiData || localItinerary) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`https://api.traveloure.com/ai/share/${tripId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.itinerary_data) {
          setLocalItinerary(data.itinerary_data);
        } else {
          setError("No trip data found");
        }
      } catch (err) {
        console.error("Error fetching shared trip:", err);
        setError("Failed to load shared trip");
        
        // Fallback to localStorage if API fails
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem("selectedTrip");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              if (parsed && parsed.itinerary_data) {
                setLocalItinerary(parsed.itinerary_data);
              }
            } catch (e) {
              console.error("Error parsing localStorage data:", e);
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSharedTrip();
  }, [tripId, aiData, localItinerary]);

  const dataToShow = aiData || localItinerary || {};

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#FF385C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shared trip...</p>
        </div>
      </div>
    );
  }

  if (error && !dataToShow) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={() => window.history.back()}
            className="bg-[#FF385C] text-white px-4 py-2 rounded-lg hover:bg-[#e02d50]"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <AiOptimizationResult data={dataToShow} tripId={tripId} />
    </div>
  );
} 