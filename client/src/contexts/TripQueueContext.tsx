import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface QueuedCity {
  id: string;
  cityName: string;
  country: string;
  imageUrl?: string | null;
  pulseScore: number;
  vibeTags: string[];
  totalHiddenGems: number;
  avgHotelPrice?: string | null;
}

interface TripQueueContextType {
  queuedCities: QueuedCity[];
  addCity: (city: QueuedCity) => void;
  removeCity: (cityId: string) => void;
  clearQueue: () => void;
  isInQueue: (cityId: string) => boolean;
  queueCount: number;
}

const TripQueueContext = createContext<TripQueueContextType | undefined>(undefined);

export function TripQueueProvider({ children }: { children: ReactNode }) {
  const [queuedCities, setQueuedCities] = useState<QueuedCity[]>([]);

  const addCity = useCallback((city: QueuedCity) => {
    setQueuedCities((prev) => {
      if (prev.some((c) => c.id === city.id)) return prev;
      return [...prev, city];
    });
  }, []);

  const removeCity = useCallback((cityId: string) => {
    setQueuedCities((prev) => prev.filter((c) => c.id !== cityId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueuedCities([]);
  }, []);

  const isInQueue = useCallback(
    (cityId: string) => queuedCities.some((c) => c.id === cityId),
    [queuedCities]
  );

  return (
    <TripQueueContext.Provider
      value={{
        queuedCities,
        addCity,
        removeCity,
        clearQueue,
        isInQueue,
        queueCount: queuedCities.length,
      }}
    >
      {children}
    </TripQueueContext.Provider>
  );
}

export function useTripQueue() {
  const context = useContext(TripQueueContext);
  if (!context) {
    throw new Error("useTripQueue must be used within a TripQueueProvider");
  }
  return context;
}
