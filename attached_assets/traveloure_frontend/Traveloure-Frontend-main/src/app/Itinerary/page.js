"use client"

import { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react"
import { Calendar, ChevronDown, ChevronUp, MoreVertical, Edit, Users, Plus, Map, X, SquareStack, Coins, ExternalLink } from "lucide-react"
import { TbContract } from "react-icons/tb"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "../../components/ui/carousel"
import { BiCalendar } from "react-icons/bi"
import { IoIosArrowBack } from "react-icons/io"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { FaCoins, FaRegClock } from "react-icons/fa"
import { Check, Smile, UtensilsCrossed, Umbrella, Sparkles } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { cn } from "../../lib/utils"
import Image from "next/image"
import { Calendar as CalendarComponent } from "../../components/ui/calendar"
import dynamic from "next/dynamic"
import { useMediaQuery } from "../..//hooks/use-media-query"
import { useDispatch, useSelector } from "react-redux"
import { tripDetailData, selectai, selectservices, searchDestinations, clearDestinationSearchResults } from "../redux-features/Itinerary/ItinerarySlice"
import { userProfile } from "../redux-features/auth/auth"
import * as contractActions from "../redux-features/contract/contractSlice"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu"
import { clientRedirect } from "../../components/commonfunctions/page"
import { signOut, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { getlocalexperts, getAllLocalExperts, clearExperts } from "../redux-features/TalktoExpert/TalktoExpert"
import { useWebSocketContext } from "../../components/WebSocketProvider"
import ContractModal from "../../components/ContractModal"
import ContractApprovedModal from "../../components/ContractApprovedModal"
import ContractMessage from "../../components/ContractMessage"
import ItineraryMessage from "../../components/ItineraryMessage"
import { useChat } from "../../hooks/useChat"
import { useContract } from "../../hooks/useContract"
import { useItinerary } from "../../hooks/useItinerary"
import { AttachmentDisplay } from "../../components/AttachmentDisplay"

// Dynamically import the map component to avoid SSR issues
const MapComponent = dynamic(() => import("../../components/map-component").catch(() => {
  // If chunk fails to load, reload the page
  if (typeof window !== "undefined") {
    window.location.reload()
  }
  return { default: () => <div>Loading map...</div> }
}), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 border-4 border-[#FF385C] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-gray-600">Loading map....</p>
      </div>
    </div>
  ),
})

// Loading component for lazy loaded content
const LoadingHotels = () => (
  <div className="space-y-6">
    {[1, 2, 3].map((i) => (
      <div key={i} className="border rounded-lg overflow-hidden animate-pulse">
        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-64 h-48 md:h-auto bg-gray-200"></div>
          <div className="flex-1 p-4">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
            <div className="flex flex-wrap gap-2 mt-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-6 bg-gray-200 rounded-full w-20"></div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-6">
              <div className="h-8 bg-gray-200 rounded-full w-24"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
)

// Lazy load the hotels content
const HotelsContent = dynamic(() => import("../../components/hotels-content").catch(() => {
  // If chunk fails to load, reload the page
  if (typeof window !== "undefined") {
    window.location.reload()
  }
  return { default: () => <LoadingHotels /> }
}), {
  loading: () => <LoadingHotels />,
  ssr: false,
})

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// Component that uses useSearchParams
function BookingPageContent() {
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
 
  // Add client-side rendering check
  const [isClient, setIsClient] = useState(false)
 
  // Initialize activeTab - always start with default to avoid hydration mismatch
  const [activeTab, setActiveTab] = useState("activities")
  
  // Set client-side flag and initialize activeTab from URL
  useEffect(() => {
    setIsClient(true)
    
    // Now safely read URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    if (tabParam && ['activities', 'travel-experts', 'hotels', 'flights', 'car-rental', 'notes'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [])
  
  // Debug logging for activeTab changes
  useEffect(() => {
    if (isClient) {
    }
  }, [activeTab, isClient])
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const carouselRef = useRef(null)
  const [showMobileMap, setShowMobileMap] = useState(false)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(true)
  const [isPlacesOpen, setIsPlacesOpen] = useState(true)
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(true)
  const [isNotesOpen, setIsNotesOpen] = useState(true)
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false)
  const [destination, setDestination] = useState("")
  const [mapDestination, setMapDestination] = useState("")
  // Destination search autocomplete state
  const [selectedDestinationData, setSelectedDestinationData] = useState(null) // { name, destination_id }
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false)
  const destinationSearchTimeoutRef = useRef(null)

  // Handle credits modal
  const handleAddCredits = () => {
    setShowCreditsModal(true)
  }

  const handleConfirmAddCredits = () => {
    setShowCreditsModal(false)
    router.push('/payment')
  }

  const handleCancelAddCredits = () => {
    setShowCreditsModal(false)
  }

  // Handle out of credits modal
  const handleRechargeNow = () => {
    setShowOutOfCreditsModal(false)
    router.push('/payment')
  }


  const [isHotelsLoaded, setIsHotelsLoaded] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [selectedPlaces, setSelectedPlaces] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [isCarRentalView, setIsCarRentalView] = useState(false)
  const [loadingServiceId, setLoadingServiceId] = useState(null)
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [selectedServiceCategory, setSelectedServiceCategory] = useState(null)
  const [selectedServices, setSelectedServices] = useState([])
  const [selectAll, setSelectAll] = useState(false)
  const [canCreateItinerary, setCanCreateItinerary] = useState(false)
  const [creatingItinerary, setCreatingItinerary] = useState(false)
  const [dataCleared, setDataCleared] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!isClient) return // Only run on client side
    
    const tab = searchParams.get("tab")

    if (pathname === "/Itinerary" && tab === "travel-experts") {
      dispatch(getAllLocalExperts({ token }))
    }
  }, [pathname, searchParams, token, dispatch, isClient])


  // Get user profile data for credits
  const userProfileData = useSelector((state) => {
    const profile = state?.auth?.profile
    // Handle different possible structures
    if (Array.isArray(profile) && profile.length > 0) {
      return profile[0]
    } else if (profile && typeof profile === 'object' && profile.data && Array.isArray(profile.data) && profile.data.length > 0) {
      return profile.data[0]
    } else if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
      return profile
    }
    return {}
  })

  const userCredits = userProfileData?.credits || 0
  // Combine Redux selectors into one to reduce re-renders
  const { aiData, activitiesHotel, HotelData, serviceData, destinationSearchResults, destinationSearchLoading } = useSelector((state) => ({
    aiData: state?.itinerary?.srvicesDetailData?.itinerary,
    activitiesHotel: state?.itinerary?.tripDetailData,
    HotelData: state?.itinerary?.tripDetailData,
    serviceData: state?.itinerary?.tripDetailData,
    destinationSearchResults: state?.itinerary?.destinationSearchResults || [],
    destinationSearchLoading: state?.itinerary?.destinationSearchLoading || false,
  }))
    const credit = useSelector((state) =>  state?.itinerary?.paymentData)
  const { Expertlist, loading: expertsLoading, error: expertsError } = useSelector((state) => state.talkexpert)
  
  // Debug logging for expert data
  useEffect(() => {
    
  }, [Expertlist, expertsLoading, expertsError, activeTab])
  const serviceCategories = useMemo(
    () => {
      const categories = [];

      // Add Car Rental category if cars data exists (old structure) or services array (new structure)
      if (serviceData?.cars?.length > 0) {
        categories.push({
          id: 'car',
          name: 'Car Rental',
          type: 'car',
          icon: '/caricon.png',
          data: serviceData.cars
        });
      } else if (serviceData?.services?.length > 0) {
        // New structure: services array contains car rental and other services
        // Filter car rental services (check if title/snippet contains "car" or "rental")
        const carRentals = serviceData.services.filter(service => 
          service.title?.toLowerCase().includes('car') || 
          service.title?.toLowerCase().includes('rental') ||
          service.snippet?.toLowerCase().includes('car') ||
          service.snippet?.toLowerCase().includes('rental')
        );
        
        if (carRentals.length > 0) {
          categories.push({
            id: 'car',
            name: 'Car Rental',
            type: 'car',
            icon: '/caricon.png',
            data: carRentals
          });
        }

        // Filter flight services
        const flights = serviceData.services.filter(service => 
          service.title?.toLowerCase().includes('flight') || 
          service.title?.toLowerCase().includes('airline') ||
          service.snippet?.toLowerCase().includes('flight') ||
          service.snippet?.toLowerCase().includes('airline')
        );
        
        if (flights.length > 0) {
          categories.push({
            id: 'flight',
            name: 'Flight ',
            type: 'flight',
            icon: '/plane-icon.png',
            data: flights
          });
        }
      }

      // Add Flight Booking category if flights data exists (old structure)
      if (serviceData?.flights?.length > 0) {
        categories.push({
          id: 'flight',
          name: 'Flight ',
          type: 'flight',
          icon: '/plane-icon.png',
          data: serviceData.flights
        });
      }

      // Add Other Services category if other_services data exists
      if (serviceData?.other_services?.length > 0) {
        categories.push({
          id: 'other_services',
          name: 'Other Services',
          type: 'other_services',
          icon: '/service-icon3 (1).png',
          data: serviceData.other_services
        });
      }

      return categories;
    },
    [serviceData],
  )

  // Initialize dates
  useEffect(() => {
    setStartDate(new Date())
    setEndDate(new Date(new Date().setDate(new Date().getDate() + 7)))
  }, [])

  // Handle URL parameter for active tab
  useEffect(() => {
    if (!isClient) return // Only run on client side
    
    const tabParam = searchParams.get('tab')
    const currentUrl = window.location.href
  
    if (tabParam && ['activities', 'travel-experts', 'hotels', 'flights', 'car-rental', 'notes'].includes(tabParam)) {
      setActiveTab(tabParam)
      // Set isFromChatExperts if it's travel-experts tab
      if (tabParam === 'travel-experts') {
        setIsFromChatExperts(true)
      }
    } else {
      console.log('🔍 No valid tab parameter found or tab not in allowed list')
    }
  }, [searchParams, isClient])

  // Fetch user profile data when user is logged in
  useEffect(() => {
    if (token) {
      dispatch(userProfile({ token }))
        .then((result) => {
        })
        .catch((error) => {
          console.error("UserProfile dispatch error:", error)
        })
    }
  }, [token, dispatch])
  useEffect(() => {
    if (!isClient) return // Only run on client side
    
   
    if (activeTab === 'travel-experts' && token) {
      
      if (destination && destination.trim()) {
        // Search for experts by destination
        dispatch(getlocalexperts({ 
          token, 
          query: destination.trim() 
        }))
      } else {
        // Get all experts if no destination specified
        dispatch(getAllLocalExperts({ token }))
      }
    } else {
      
    }
  }, [activeTab, token, destination, dispatch, isClient])


  useEffect(() => {
    if (activeTab !== 'travel-experts') {
      dispatch(clearExperts())
    }
  }, [activeTab, dispatch])

  // Force API call on component mount if we're on travel-experts tab
  useEffect(() => {
    if (!isClient) return // Only run on client side
    
    
    // Small delay to ensure all state is initialized
    const timer = setTimeout(() => {
      if (activeTab === 'travel-experts' && token) {
        if (destination && destination.trim()) {
          dispatch(getlocalexperts({ 
            token, 
            query: destination.trim() 
          }))
        } else {
          dispatch(getAllLocalExperts({ token }))
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [isClient]) // Run when client-side flag is set

  const [isFromChatExperts, setIsFromChatExperts] = useState(false)
  const [hiredExperts, setHiredExperts] = useState([])

  // Use shared hooks
  const chat = useChat()
  const contract = useContract()
  const itinerary = useItinerary()

  // Get contract status data from Redux store
  const { contractStatusData, showContract } = useSelector((state) => state.contract)
  
  // Debug contract status data
  useEffect(() => {
    if (contractStatusData) {
      console.log('🔌 Contract status data:', contractStatusData)
    }
  }, [contractStatusData])

  // Check contract status when component mounts and user is logged in
  useEffect(() => {
    if (isClient && token) {
      const chatId = chat?.selectedExpert?.id || chat?.selectedExpert?.user_id || chat?.selectedExpert?.user?.id
      // Only call API if chatId is valid
      if (chatId && chatId !== 'undefined' && chatId !== undefined) {
        dispatch(contractActions.checkContractStatus({ token, withChat: chatId }))
          .catch(error => {
            console.error('Failed to check contract status on mount:', error)
          })
      }
    }
  }, [isClient, token, chat?.selectedExpert, dispatch])

  // Chat state is now handled by the chat hook

  // Contract modal state
  // Contract state is now handled by the contract hook

  // WebSocket and Chat Management
  const { isConnected, joinChat, sendChatMessage, leaveChat, addMessageListener } = useWebSocketContext()

  // WebSocket message handling for contract and itinerary messages
  useEffect(() => {
    const handleIncomingMessage = (data) => {
      // Skip processing if we're on the experts page (to avoid conflicts)
      if (window.location.pathname.includes('/experts')) {
        return
      }
      
     // Handle contract messages
      if (data.type === 'contract_message' && data.contract) {
        chat.setMessages(prev => {
          const contractExists = prev.some(msg => msg.id === data.contract.id && msg.isContract)
          if (contractExists) return prev

          const currentUserName = session?.user?.name || session?.user?.username
          const currentUserId = session?.user?.id
          const currentUserIdentifiers = [
            session?.user?.username,
            session?.user?.name,
            session?.user?.email,
            session?.user?.first_name,
            session?.user?.last_name
          ].filter(Boolean)

          const senderName = data.contract.sender?.username || data.contract.sender_name || 'Unknown'
          
          // More robust sender detection (same as experts page fix)
          const isFromCurrentUser = 
            senderName === currentUserName ||
            data.contract.sender_id === currentUserId ||
            currentUserIdentifiers.includes(senderName) ||
            // Check if the contract was created very recently (within last 5 seconds) and we're in the same chat
            (data.contract.created_at && 
             new Date(data.contract.created_at).getTime() > Date.now() - 5000 &&
             chat.currentChatId === chat.selectedExpert?.id)

          const newContractMessage = {
            id: data.contract.id || Date.now().toString(),
            type: isFromCurrentUser ? 'sent' : 'received',
            content: 'Contract received',
            contract: data.contract,
            timestamp: new Date(data.contract.created_at || Date.now()),
            sender: isFromCurrentUser ? 'user' : 'expert',
            isContract: true
          }
          return [...prev, newContractMessage]
        })
        if (!chat.showChatInterface) {
          toast.success(`New contract from ${chat.selectedExpert ? chat.getDisplayName(chat.selectedExpert) : 'Expert'}`)
        }
      }

      // Handle new contract messages
      if (data.type === 'new_contract' && data.message) {
        let contractData = null
        if (data.message.contract) {
          contractData = data.message.contract
        } else if (data.message.contract_data) {
          contractData = data.message.contract_data
        } else if (data.message.data) {
          contractData = data.message.data
        } else {
          contractData = data.message
        }

        chat.setMessages(prev => {
          const contractExists = prev.some(msg => msg.id === data.message.id && msg.isContract)
          if (contractExists) return prev

        // Determine if this contract is from current user (enhanced detection)
        const currentUserName = session?.user?.name || session?.user?.username
        const currentUserId = session?.user?.id
        const currentUserIdentifiers = [
          session?.user?.username,
          session?.user?.name,
          session?.user?.email,
          session?.user?.first_name,
          session?.user?.last_name
        ].filter(Boolean)
        
        const isFromCurrentUser = 
          data.message.sender?.id === session?.user?.id ||
          data.message.sender_id === session?.user?.id ||
          currentUserIdentifiers.includes(data.message.sender?.username) ||
          // Additional fallback: check if contract was created very recently (within last 10 seconds)
          (contractData.created_at && 
           new Date(contractData.created_at).getTime() > Date.now() - 10000 &&
           chat.currentChatId === chat.selectedExpert?.id)

          const newContractMessage = {
            id: data.message.id || Date.now().toString(),
            type: isFromCurrentUser ? 'sent' : 'received',
            content: 'Contract received',
            contract: contractData,
            timestamp: new Date(data.message.created_at || Date.now()),
            sender: isFromCurrentUser ? 'user' : 'expert',
            isContract: true
          }

          return [...prev, newContractMessage]
        })

        if (!chat.showChatInterface) {
          toast.success(`New contract from ${chat.selectedExpert ? chat.getDisplayName(chat.selectedExpert) : 'Expert'}`)
        }
      }

      // Handle contract status updates
      if (data.type === 'contract_rejected' && data.message) {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          chat.setMessages(prev => {
            let found = false
            const updatedMessages = prev.map(msg => {
              if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                found = true
              return {
                ...msg,
                  contract: {
                    ...msg.contract,
                    status: 'rejected',
                    is_accepted: false
                  }
              }
            }
            return msg
            })
            if (!found) {
              return prev.map(msg => {
                if (msg.isContract && msg.contract && (
                  msg.contract.contract_title === data.message.title ||
                  msg.contract.title === data.message.title ||
                  msg.contract.amount === data.message.amount
                )) {
                  return {
                    ...msg,
                    contract: {
                      ...msg.contract,
                      status: 'rejected',
                      is_accepted: false
                    }
                  }
                }
                return msg
              })
            }
            return updatedMessages
          })
        }
      }

      if (data.type === 'contract_accepted' && data.message) {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          chat.setMessages(prev => {
            let found = false
            const updatedMessages = prev.map(msg => {
              if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                found = true
                return {
                  ...msg,
                  contract: {
                    ...msg.contract,
                    status: 'accepted',
                    is_accepted: true,
                    payment_url: data.message?.payment_url || msg.contract.payment_url
                  }
                }
              }
              return msg
            })

            if (!found) {
              return prev.map(msg => {
                if (msg.isContract && msg.contract && (
                  msg.contract.contract_title === data.message.title ||
                  msg.contract.title === data.message.title ||
                  msg.contract.amount === data.message.amount
                )) {
                  return {
                    ...msg,
                    contract: {
                      ...msg.contract,
                      status: 'accepted',
                      is_accepted: true
                    }
                  }
                }
                return msg
              })
            }

            return updatedMessages
          })
        }
      }

      // Handle itinerary status updates
      if (data.type === 'submit_itinerary_accepted' && data.message) {
        const itineraryId = data.message.id

        setMessages(prev => prev.map(msg => {
          if (msg.isItinerary && (msg.itinerary?.id === itineraryId || msg.itinerary_submit?.id === itineraryId)) {
            return {
              ...msg,
              itinerary: {
                ...msg.itinerary,
                status: 'approved'
              },
              itinerary_submit: {
                ...msg.itinerary_submit,
                status: 'approved'
              }
            }
          }
          return msg
        }))

        // Show contract approved modal
        contract.setApprovedItineraryData({
          itineraryId: data.message.id,
          title: data.message.title || 'Itinerary',
          expertName: selectedExpert?.first_name || selectedExpert?.username || 'Expert',
          contractId: data.message.contract_id,
          expertId: data.message.expert_id
        })
        contract.setShowContractApprovedModal(true)
      }

      if (data.type === 'submit_itinerary_rejected' && data.message) {
        const itineraryId = data.message.id
        chat.setMessages(prev => {
          const updatedMessages = prev.map(msg => {
            if (msg.isItinerary && (msg.itinerary?.id === itineraryId || msg.itinerary_submit?.id === itineraryId)) {
              return {
                ...msg,
                itinerary: {
                  ...msg.itinerary,
                  status: 'rejected'
                },
                itinerary_submit: {
                  ...msg.itinerary_submit,
                  status: 'rejected'
                }
              }
            }
            return msg
          })
          return updatedMessages
        })
      }

      // Handle new itinerary submissions
      if (data.type === 'new_submit_itinerary' && data.message) {
        const itineraryData = data.message.itinerary_submit
        const itineraryId = itineraryData.id || data.message.id

        const uniqueItineraryMessageId = `${itineraryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        const itineraryMessage = {
          id: uniqueItineraryMessageId,
            type: 'received',
          content: `Itinerary Submitted: ${itineraryData.title || 'New Itinerary'}`,
          timestamp: new Date(data.message.created_at || new Date().toISOString()),
          isItinerary: true,
          itinerary: {
            id: itineraryId,
            title: itineraryData.title || 'New Itinerary',
            description: itineraryData.description || '',
            location: itineraryData.location || '',
            status: itineraryData.status || 'pending',
            attachment: itineraryData.attachment,
            created_at: itineraryData.created_at,
            receiver: data.message.receiver,
            sender: data.message.sender
          }
        }

        chat.setMessages(prev => {
          const messageExists = prev.some(msg => msg.id === uniqueItineraryMessageId ||
            (msg.isItinerary && msg.itinerary?.id === itineraryId))
          if (messageExists) return prev

          return [...prev, itineraryMessage]
        })

        if (!chat.showChatInterface) {
          toast.success(`New itinerary from ${chat.selectedExpert ? chat.getDisplayName(chat.selectedExpert) : 'Expert'}`)
        }
      }
      
      if (data.type === 'error') {
        toast.error(`WebSocket error: ${data.error}`)
      }
    }

    // Set up WebSocket message listener
    const cleanup = addMessageListener(handleIncomingMessage)
    return cleanup
  }, [addMessageListener, session, chat, contract])

  // Helper functions for expert data
  const getDisplayName = useCallback((expert) => {
    if (expert.first_name && expert.last_name) {
      return `${expert.first_name} ${expert.last_name}`
    } else if (expert.first_name) {
      return expert.first_name
    } else if (expert.username) {
      return expert.username
    }
    return "Unknown Expert"
  }, [])

  // Consolidated helper functions
  const getExpertData = useCallback((expert) => {
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)
    
    return {
      rating: expert.average_rating > 0 ? `${expert.average_rating.toFixed(1)}/5.0` : "4.8/5.0",
      reviews: expert.reviews?.length || 650,
      countries: expert.country ? [expert.country] : ["Italy", "France", "Spain", "Britain"],
      specialization: expert.travel_style?.length 
        ? `Specializing in ${expert.travel_style.map(capitalize).join(", ")}`
        : "Specializing in Coastal Adventures and Hidden Gems",
      image: expert.image || expert.cover_image || "/dealperson.png",
      preferredMonths: expert.preferred_months?.length 
        ? `Preferred: ${expert.preferred_months.map(capitalize).join(", ")}`
        : ""
    }
  }, [])

  // Handle opening chat with expert - use chat hook method
  const handleOpenChat = (expert) => {
    chat.handleOpenChat(expert)
  }

  // Handle closing chat - use chat hook method
  const handleCloseChat = () => {
    chat.handleCloseChat()
  }

  // Message sending is now handled by the chat hook

  // Handle file selection
  const handleFileSelect = (e) => {
    try {
      const file = e.target.files[0]
      if (file) {
        
        // Validate file size (max 60MB)
        const maxSize = 60 * 1024 * 1024 // 60MB
        if (file.size > maxSize) {
          toast.error("File size too large. Please select a file smaller than 60MB.")
          return
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm']
        if (!allowedTypes.includes(file.type)) {
          toast.error("File type not supported. Please select an image, PDF, Word document, or video file.")
          return
        }
        
        setSelectedFile(file)
        toast.success(`File selected: ${file.name}`)
      } else {
        toast.error("No file selected")
      }
    } catch (error) {
      toast.error("Error selecting file. Please try again.")
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Voice message functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []

      recorder.ondataavailable = (e) => {
        chunks.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      setRecordingTimer(timer)

    } catch (error) {
      toast.error('Failed to start recording. Please check microphone permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      setIsRecording(false)
      if (recordingTimer) {
        clearInterval(recordingTimer)
        setRecordingTimer(null)
      }
    }
  }

  const sendVoiceMessage = async () => {
    if (!audioBlob) {
      toast.error('No voice message to send')
      return
    }

    if (!isConnected) {
      toast.error('WebSocket not connected. Please try again.')
      return
    }

    if (!currentChatId) {
      toast.error('No active chat. Please try again.')
      return
    }

    
    // Generate a unique message ID for this message
    const localMessageId = Date.now().toString()
    
    // Add message to local state immediately (optimistic update)
    const newMessage = {
      id: localMessageId,
      type: 'sent',
      content: `Voice message (${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, '0')})`,
      attachment: audioBlob,
      isVoiceMessage: true,
      duration: recordingTime,
      timestamp: new Date(),
      sender: 'user'
    }
    
    chat.setMessages(prev => [...prev, newMessage])
    
    try {
      // Convert audio blob to file
      const audioFile = new File([audioBlob], `voice_message_${Date.now()}.wav`, { type: 'audio/wav' })
      
      // Send via POST API for voice messages
      const formData = new FormData()
      formData.append('message', `Voice message (${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, '0')})`)
      formData.append('attachment', audioFile)
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/ai/chats/${currentChatId}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken}`,
        },
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      
      // Clear the audio blob
      setAudioBlob(null)
      setRecordingTime(0)
      
    } catch (error) {
      
      // Remove the message if send failed
      chat.setMessages(prev => prev.filter(msg => msg.id !== localMessageId))
      
      toast.error('Failed to send voice message. Please try again.')
    }
  }

  const cancelVoiceMessage = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      setIsRecording(false)
      if (recordingTimer) {
        clearInterval(recordingTimer)
        setRecordingTimer(null)
      }
    }
    setAudioBlob(null)
    setRecordingTime(0)
    toast.info('Voice message cancelled')
  }



  // Cleanup effect
  useEffect(() => {
    // Check if data exists before cleaning up
    const hasPlaces = localStorage.getItem("places")
    const hasServices = localStorage.getItem("services")
    const hasHotels = localStorage.getItem("hotels")
    
    // Only clean up if this is a fresh session without stored data
    if (!hasPlaces && !hasServices && !hasHotels) {
      localStorage.removeItem("trip_id")
      localStorage.removeItem("services")
      localStorage.removeItem("hotels")
      localStorage.removeItem("places")
      localStorage.removeItem("selectedServices")

      // Reset selected services state
      setSelectedServiceIds([])
      setSelectAll(false)
      setSelectedPlaces([])
      setSelectedServices([])
    }
  }, [])

  // Reset selections when serviceData changes
  useEffect(() => {
    if (serviceData) {
      setSelectedServiceIds([])
      setSelectAll(false)
      localStorage.setItem("services", JSON.stringify([]))
    }
  }, [serviceData])

  // Load from localStorage on mount
  useEffect(() => {
    // Don't load data if it was just cleared
    if (dataCleared) return;
    
    const stored = localStorage.getItem("services")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          // Extract service_ids from stored services
          setSelectedServiceIds(parsed.map((s) => s.service_id))
        }
      } catch (error) {
        console.error("Error parsing selectedServices from localStorage:", error)
      }
    }

    // Load selected services from localStorage
    const storedSelectedServices = localStorage.getItem("selectedServices")
    if (storedSelectedServices) {
      try {
        const parsed = JSON.parse(storedSelectedServices)
        if (Array.isArray(parsed)) {
          setSelectedServices(parsed)
        }
      } catch (error) {
        console.error("Error parsing selectedServices from localStorage:", error)
      }
    }

    // Load selected places from localStorage
    const storedPlaces = localStorage.getItem("places")
    if (storedPlaces) {
      try {
        const parsed = JSON.parse(storedPlaces)
        if (Array.isArray(parsed)) {
          setSelectedPlaces(parsed)
        }
      } catch (error) {
        console.error("Error parsing selectedPlaces from localStorage:", error)
      }
    }
  }, [dataCleared])

  // Handle checkbox change for individual services
  const handleCheckboxChange = (serviceId) => {
    setSelectedServiceIds((prev) => {
      const isSelected = prev.includes(serviceId)
      const updatedIds = isSelected ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]

      // Find the full service objects for the updated IDs
      const selectedServices = serviceData?.filter((s) => updatedIds.includes(s.service_id)) || []

      // Save to localStorage
      localStorage.setItem("services", JSON.stringify(selectedServices))

      // Find the toggled service for toast notification
      const toggledService = serviceData?.find((s) => s.service_id === serviceId)
      toast[isSelected ? "info" : "success"](`${isSelected ? "Removed" : "Added"} ${toggledService?.name || "service"}`)

      return updatedIds
    })
  }

  // Handle "Select All" checkbox
  const handleSelectAll = () => {
    if (!selectAll) {
      // Select all service IDs
      const allIds = serviceData?.map((service) => service.service_id) || []
      setSelectedServiceIds(allIds)

      // Save all selected services to localStorage
      const allServices = serviceData || []
      localStorage.setItem("services", JSON.stringify(allServices))
      toast.success("Selected all services")
    } else {
      // Deselect all
      setSelectedServiceIds([])
      localStorage.setItem("services", JSON.stringify([]))
      toast.info("Deselected all services")
    }
    setSelectAll(!selectAll)
  }

  // Add Custom Notes logic
  const defaultNotes = [
    "I want to have fun in Tokyo so suggest me those places",
    "The Places must be cool and filled with adventures",
    "I want to try local food and culture",
    "Please include some relaxing activities"
  ];
  const [selectedNotes, setSelectedNotes] = useState([defaultNotes[0], defaultNotes[1]]);
  const [customNotes, setCustomNotes] = useState("");

  // Handle form submission
  const handleSubmit = async () => {
    setCreatingItinerary(true)
    try {
      const tripId = (localStorage.getItem("trip_id")) || 1
      const placesRaw = JSON.parse(localStorage.getItem("places")) || []
      const hotels = JSON.parse(localStorage.getItem("hotels")) || []
      const services = JSON.parse(localStorage.getItem("services")) || []

      // Helper function to get first image URL from array or string
      const getFirstImageUrl = (imageUrl) => {
        if (!imageUrl) return null
        if (Array.isArray(imageUrl)) {
          const validUrl = imageUrl.find(url => url && typeof url === 'string' && url.trim() !== '')
          return validUrl || null
        }
        if (typeof imageUrl === 'string' && imageUrl.trim() !== '') {
          return imageUrl
        }
        return null
      }

      // Process places to include only first image_url
      const places = placesRaw.map(place => {
        const processedPlace = { ...place }
        if (place.image_url) {
          const firstImage = getFirstImageUrl(place.image_url)
          processedPlace.image_url = firstImage || null
        }
        return processedPlace
      })

      // Combine old services with new selected services
      const allServices = [...services, ...selectedServices]

      // Build notes array: checked defaults + all non-empty lines from textarea
      const notes = [
        ...selectedNotes,
        ...customNotes
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      ];

      const payload = { trip_id: tripId, places, hotels, services: allServices, notes };

      const result = await dispatch(
        selectservices({
          token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
          payload: payload,
        }),
      )

      // Check if the API call was successful
      if (result.type.endsWith('/fulfilled')) {
        setCanCreateItinerary(true)
        toast.success("Services submitted successfully!")

        // Clear all data after successful submission
        localStorage.removeItem("places")
        localStorage.removeItem("hotels")  
        localStorage.removeItem("services")
        localStorage.removeItem("selectedServices")
        
        // Reset state variables
        setSelectedPlaces([])
        setSelectedServices([])
        setSelectedServiceIds([])
        setSelectAll(false)
        setCustomNotes("")
        setSelectedNotes([defaultNotes[0], defaultNotes[1]])
        
        // Reset activity preferences
        setActivityPreferences(prev => prev.map(item => ({ ...item, selected: false })))
        
        // Set flag to prevent data reload
        setDataCleared(true)

        // Redirect based on login status after successful service selection
        if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
          // User is logged in, redirect to AI optimization page
          router.push("/ai-optimization")
        } else {
          // User is not logged in, redirect to login page
          localStorage.setItem("redirect", "true")
          clientRedirect("/login")
        }
      } else {
        // API call failed
        toast.error("Failed to submit services. Please try again.")
      }
    } catch (error) {
      toast.error("Failed to submit services. Please try again.")
    } finally {
      setCreatingItinerary(false)
    }
  }

  const handleCarRentalClick = () => {
    setIsCarRentalView(true)
  }

  const handleBackClick = () => {
    setIsCarRentalView(false)
  }

  // Handle service selection for the new service categories
  const handleServiceSelection = (service, categoryType = null) => {
    setSelectedServices(prev => {
      // Use provided categoryType or fallback to selectedServiceCategory or determine from service
      const type = categoryType || selectedServiceCategory?.type || (service.service_name ? 'other_services' : 'car');
      
      // Use different identifiers based on service type
      const serviceIdentifier = type === 'other_services' 
        ? service.service_name 
        : service.title;
      
      const isSelected = prev.some(s => {
        const sIdentifier = s.service_type === 'other_services' ? s.service_name : s.title;
        return sIdentifier === serviceIdentifier && s.service_type === type;
      });
      
      let newServices;
      if (isSelected) {
        toast.info(`Removed ${serviceIdentifier} from selection`);
        newServices = prev.filter(s => {
          const sIdentifier = s.service_type === 'other_services' ? s.service_name : s.title;
          return !(sIdentifier === serviceIdentifier && s.service_type === type);
        });
      } else {
        toast.success(`Added ${serviceIdentifier} to selection`);
        newServices = [...prev, { ...service, service_type: type }];
      }

      // Save to localStorage
      localStorage.setItem("selectedServices", JSON.stringify(newServices));
      return newServices;
    });
  }

  const isServiceSelected = (service, categoryType = null) => {
    // Use provided categoryType or fallback to selectedServiceCategory
    const type = categoryType || selectedServiceCategory?.type;
    
    if (!type) {
      // If no type available, check by title/service_name only
      const serviceIdentifier = service.service_name || service.title;
      return selectedServices.some(s => {
        const sIdentifier = s.service_name || s.title;
        return sIdentifier === serviceIdentifier;
      });
    }
    
    const serviceIdentifier = type === 'other_services' 
      ? service.service_name 
      : service.title;
    
    return selectedServices.some(s => {
      const sIdentifier = s.service_type === 'other_services' ? s.service_name : s.title;
      return sIdentifier === serviceIdentifier && s.service_type === type;
    });
  }

  // Chat functions
 


  // Handle carousel scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!carouselRef.current) return
      const el = carouselRef.current
      setCanScrollPrev(el.scrollLeft > 0)
      setCanScrollNext(el.scrollLeft + el.offsetWidth < el.scrollWidth)
    }

    const el = carouselRef.current
    if (el) {
      el.addEventListener("scroll", handleScroll)
      handleScroll() // initial state
    }

    return () => {
      if (el) el.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // Lazy load hotels data when tab is selected
  useEffect(() => {
    if (activeTab === "hotels" && !isHotelsLoaded && destination) {
      setIsHotelsLoaded(true)
    }
  }, [])

  const [activityPreferences, setActivityPreferences] = useState([
    { name: "Beach", selected: false },
    { name: "Adventure", selected: false },
    { name: "Culture", selected: false },
    { name: "Food", selected: false },
    { name: "Nightlife", selected: false },
    { name: "Wildlife", selected: false },
    { name: "Cruise", selected: false },
    { name: "Sightseeing", selected: false },
    { name: "Wellness", selected: false },
  ])

  // Memoize expensive computations and callbacks
  const handleToggleActivity = useCallback((index) => {
    setActivityPreferences((prev) => {
      const updated = prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
      return updated
    })
  }, [])

  const handleTogglePlace = useCallback(
    (index) => {
      if (activitiesHotel?.places && activitiesHotel?.trip_id) {
        const place = activitiesHotel.places[index]
        setSelectedPlaces((prev) => {
          const isSelected = prev.some((p) => p.place_id === place.place_id)
          let updatedPlaces
          if (isSelected) {
            toast.info(`Removed ${place.name} from selection`)
            updatedPlaces = prev.filter((p) => p.place_id !== place.place_id)
          } else {
            toast.success(`Added ${place.name} to selection`)
            updatedPlaces = [...prev, place]
          }
          localStorage.setItem("places", JSON.stringify(updatedPlaces))
          return updatedPlaces
        })
      }
    },
    [activitiesHotel],
  )

  const isPlaceSelected = useCallback(
    (placeId) => {
      return selectedPlaces.some((place) => place.place_id === placeId)
    },
    [selectedPlaces],
  )

  // Submit selected places

  const handleServiceSelect = async (service) => {
    setSelectedService(service)
    setLoadingServiceId(service.id) // start loader for clicked service

    const payload = {
      trip_id: localStorage.getItem("trip_id"),
      service: service,
    }

    try {
      // If your dispatch returns a promise (thunk), await it here
      await dispatch(
        selectai({
          token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
          payload: payload,
        })
      );

      toast.success(`Selected service: ${service.name}`)
    } catch (error) {
      toast.error("Failed to select service.")
    } finally {
      setLoadingServiceId(null) // stop loader when done
    }
  }

  // Define the form schema with zod
  const formSchema = z.object({
    destination: z.string().min(2, "Destination must be at least 2 characters"),
  })

  // Initialize the form
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      destination: destination,
    },
  })

  // Update the destination state when form values change
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.destination !== undefined) {
        setDestination(value.destination)
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  // Function to search destinations via API (using Redux)
  const handleDestinationSearch = useCallback((searchQuery) => {
    // Clear previous timeout
    if (destinationSearchTimeoutRef.current) {
      clearTimeout(destinationSearchTimeoutRef.current)
    }

    // If search query is empty or too short, clear results
    if (!searchQuery || searchQuery.trim().length < 2) {
      dispatch(clearDestinationSearchResults())
      setShowDestinationDropdown(false)
      setSelectedDestinationData(null)
      return
    }

    // Debounce the API call
    destinationSearchTimeoutRef.current = setTimeout(() => {
      dispatch(searchDestinations({ token, searchQuery: searchQuery.trim() })).then((result) => {
        if (result.type.endsWith('/fulfilled')) {
          const results = result.payload?.data || []
          setShowDestinationDropdown(results.length > 0)
        } else {
          setShowDestinationDropdown(false)
        }
      })
    }, 300) // 300ms debounce
  }, [token, dispatch])

  // Handle destination selection from dropdown
  const handleDestinationSelect = useCallback((destinationItem) => {
    setSelectedDestinationData({
      name: destinationItem.name,
      destination_id: destinationItem.destination_id
    })
    setDestination(destinationItem.name)
    form.setValue('destination', destinationItem.name)
    setShowDestinationDropdown(false)
    dispatch(clearDestinationSearchResults())
  }, [form, dispatch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const destinationInput = document.getElementById('destination-input')
      const dropdown = document.getElementById('destination-dropdown')
      if (destinationInput && dropdown && 
          !destinationInput.contains(event.target) && 
          !dropdown.contains(event.target)) {
        setShowDestinationDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (destinationSearchTimeoutRef.current) {
        clearTimeout(destinationSearchTimeoutRef.current)
      }
    }
  }, [])

  // Handle form submission
  const [loading, setLoading] = useState(false)

  const onSubmit = form.handleSubmit(async (data) => {
    // Validate dates before proceeding
    if (!validateDates(startDate, endDate)) {
      toast.error(dateError || "Please fix the date errors before submitting.")
      setLoading(false)
      return
    }
    setLoading(true)

    // Remove notes from tripDetails payload
    const tripDetails = {
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      destination: data.destination,
      interests: activityPreferences.filter((a) => a.selected).map((a) => a.name),
      // Include destination_id only if a destination was selected from search results
      ...(selectedDestinationData?.destination_id && { destination_id: selectedDestinationData.destination_id }),
    };

    try {
      // Dispatch to Redux with unwrap() to handle rejected promises
      const res = await dispatch(
        tripDetailData({
          token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
          payload: tripDetails,
        }),
      ).unwrap()

      // Extract data from response (new structure has data wrapper)
      const responseData = res?.data || res

      // Check if the response contains remaining_credits and it's 0
      const walletInfo = responseData?.wallet_info || res?.wallet_info
      if (walletInfo && walletInfo.remaining_credits === 0) {
        setShowOutOfCreditsModal(true)
        setLoading(false)
        return
      }

      // Set trip_id in localStorage from API response if available
      if (responseData?.trip_id) {
        localStorage.setItem("trip_id", responseData.trip_id)
      } else if (res?.trip_id) {
        localStorage.setItem("trip_id", res.trip_id)
      } else {
        // fallback: use 1 or another default if not present
        localStorage.setItem("trip_id", "1")
      }
      setCanCreateItinerary(true)

      // Update destination state for the map ONLY after API succeeds
      setMapDestination(data.destination)

      // Call profile API to update credits
      if (token) {
        await dispatch(userProfile({ token }))
      }

      // Reset loading state on success
      setLoading(false)

    } catch (error) {
      setLoading(false)
      console.log(error,"jiji")
      
      // Check if it's a 429 error (rate limit / IP restriction)
      if (error?.status === 429) {
        const errorMessage = error?.error || error?.message || "This API has already been used from your IP address. Please login to continue using our services."
        toast.error(errorMessage)
        return
      }
      
      // Check if it's a 402 error with insufficient credits
      const errorWalletInfo = error?.data?.wallet_info || error?.data
      if (error?.status === 402 || errorWalletInfo?.remaining_credits === 0 || error?.data?.remaining_credits === 0) {
        setShowOutOfCreditsModal(true)
        return
      }
      
      // Show dynamic error message from API if available
      const errorMessage = error?.error || error?.message || error?.data?.error || error?.data?.message || "Failed to submit trip details. Please try again."
      toast.error(errorMessage)
      // Don't update mapDestination on error - keep it as is
    }

    // Load hotels data if on hotels tab
    if (activeTab === "hotels") {
      setIsHotelsLoaded(true)
    }
  })
  const handleLogout = () => {
    toast("Logged out successfully!")

    signOut({ callbackUrl: "/" })
  }

  // Contract modal handlers - use contract hook methods like expert page
  const handleSendContract = (expert) => {
    contract.handleContractModal(expert)
  }

  const handleContractSubmit = async (contractData) => {
    try {
      await contract.handleContractSubmit(contractData)
    } catch (error) {
      console.error('Contract submission error:', error)
    }
  }

  const handleContractClose = () => {
    contract.handleContractClose()
  }

  // Remove trip_id, services, places, hotels from localStorage if not on /Itinerary
  useEffect(() => {
    if (pathname !== "/Itinerary") {
      localStorage.removeItem("trip_id")
      localStorage.removeItem("services")
      localStorage.removeItem("hotels")
      localStorage.removeItem("places")
    }
  }, [pathname])

  const [startPopoverOpen, setStartPopoverOpen] = useState(false)
  const [endPopoverOpen, setEndPopoverOpen] = useState(false)
  const [dateError, setDateError] = useState("")

  const minDays = 3;

  const validateDates = (start, end) => {
    if (!start || !end) {
      setDateError("")
      return true
    }
    const diff = (end - start) / (1000 * 60 * 60 * 24)
    if (end < start) {
      setDateError("End date cannot be before start date.")
      return false
    }
    if (diff < 3) {
      setDateError("Trip must be at least 3 days.")
      return false
    }
    setDateError("")
    return true
  }

  const [teammatesModalOpen, setTeammatesModalOpen] = useState(false);
  const [teammateEmail, setTeammateEmail] = useState("");
  const [teammates, setTeammates] = useState([
    { name: "Brooklyn Simmons", email: "brooklynsimmons@gmail.com", avatar: "/avatar1.png" },
    { name: "Jerome Bell", email: "jeromebell@gmail.com", avatar: "/avatar2.png" },
    { name: "Guy Hawkins", email: "guyhawkins@gmail.com", avatar: "/avatar3.png" },
  ]);

  useEffect(() => {
    // Only redirect if we're not on the travel-experts tab and aiData is missing
    if (!aiData && activeTab !== 'travel-experts') {
      // Add a small delay to ensure URL parameter processing happens first
      const timer = setTimeout(() => {
      router.replace("/Itinerary");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [aiData, router, activeTab]);

  // Show loading state during hydration to prevent mismatch
  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[#FF385C] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading itinerary...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Mobile Map Overlay */}
      {isMobile && showMobileMap && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="h-full flex flex-col">
            <div className="p-4 flex items-center justify-between border-b">
              <h2 className="font-semibold">Map View - {mapDestination || "No destination selected"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMobileMap(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1">
              <MapComponent destination={mapDestination} apiKey={GOOGLE_MAPS_API_KEY} />
            </div>
          </div>
        </div>
      )}

      {/* Beta Banner */}
      <div className="w-full bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500 text-white py-2 px-4 text-center relative overflow-hidden border-b border-orange-300">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10 container mx-auto flex items-center justify-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold animate-pulse">
            🚀 BETA
          </span>
          <span className="text-xs md:text-sm font-medium">
            Testing new features • Your feedback helps us improve
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-screen">
        {/* Main Content - 50% width on desktop */}
        <div className="flex-1 lg:w-[60%] overflow-y-auto pb-20 lg:pb-0">
          {/* Header - Only spans the left 50% */}
          <header className="sticky top-0 z-40 bg-white border-b">
            <div className="flex justify-between items-center h-16 px-4 gap-4">
              {/* Logo */}
              <div className="flex items-center cursor-pointer flex-shrink-0">
                <Link href="/" className="flex items-center gap-2">
                  <Image src="/Main-logo.png" alt="Main Logo" width={150} height={50} />
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500 text-white shadow-md border border-orange-300">
                    🚀 BETA
                  </span>
                </Link>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* View Map Button for Mobile - Top Right */}
                {isMobile && mapDestination && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="lg:hidden rounded-full shadow-sm bg-transparent border-gray-300 h-9 px-3"
                    onClick={() => setShowMobileMap(true)}
                  >
                    <Map className="h-4 w-4 mr-1" />
                    <span className="text-xs">Map</span>
                  </Button>
                )}


                {/* Credits Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-[22px] border-none bg-[#fdeef4] px-3 flex items-center gap-2 h-[42px] flex-shrink-0 hidden lg:flex cursor-not-allowed"
                  onClick={() => {
                    // Handle credits click - you can add your logic here
                    console.log('Credits clicked')
                  }}
                >
                  <Image 
                    src="/coins-icon.png" 
                    alt="Credits" 
                    width={16} 
                    height={16} 
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <span className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] bg-clip-text text-transparent font-medium whitespace-nowrap">{userCredits} Credits</span>
                  <div
                    className="h-6 w-6 p-0 rounded-full bg-white hover:bg-pink-100 border border-pink-200 flex-shrink-0 ml-1 cursor-pointer flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddCredits()
                    }}
                  >
                    <svg 
                      className="h-3 w-3" 
                      fill="url(#plusGradient)" 
                      viewBox="0 0 24 24"
                    >
                      <defs>
                        <linearGradient id="plusGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#F30131" />
                          <stop offset="100%" stopColor="#BE35EB" />
                        </linearGradient>
                      </defs>
                      <path d="M12 4v16m8-8H4" stroke="url(#plusGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </div>
                </Button>

                {/* Generate Itinerary Button */}
                {!isFromChatExperts && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-[7px] bg-[#FF385C] px-3 flex items-center hidden lg:flex"
                  disabled={!canCreateItinerary || creatingItinerary}
                  onClick={handleSubmit}
                >
                  {creatingItinerary ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 mr-2 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <span className="hidden sm:inline">Generate Itinerary</span>
                  )}
                </Button>
                )}

                {/* More Options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More</span>
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="bg-white p-2 shadow-md">
                    {session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken ? (
                      <>
                    <DropdownMenuItem
                      onClick={() => clientRedirect("/dashboard/profile")}
                      className="cursor-pointer hover:bg-gray-100"
                    >
                      User Profile
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer hover:bg-gray-100">
                      Logout
                    </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => clientRedirect("/login")}
                        className="cursor-pointer hover:bg-gray-100"
                      >
                        Login
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <div className="relative h-56 md:h-72 lg:h-80 rounded overflow-hidden">
            <Image src="/arial-bg.png" alt="Trip cover" fill className="object-cover" />

            {activeTab !== "services" && activeTab !== "activities" && (
              <div className="absolute inset-0 flex flex-col justify-between p-4 md:p-6 text-white">
                {/* Top: Back + Teammates */}
                <div className="flex justify-between items-start">
                  <Button variant="ghost" size="sm" className="text-white text-[16px] p-0 h-auto">
                    <IoIosArrowBack style={{ height: "21px", width: "12px", marginRight: "12px" }} />
                    Back to My Trips
                  </Button>

                  {/* Right top corner teammates section */}
                  <div
                    style={{ border: "1px solid white" }}
                    className="flex items-center  space-x-2 px-3 py-1 bg-white/2 rounded-[8px] backdrop-blur-[2px]"
                  >
                    <Button
                      variant="ghost"
                      className="ml-2 text-white hover:bg-white/10"
                      onClick={() => setTeammatesModalOpen(true)}
                    >

                      Add Teammates
                    </Button>
                  </div>
                </div>

                {/* Center: Left (trip info) and Right (meals) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center flex-grow">
                  {/* Left section */}
                  <div className="mt-6 md:mt-0 ">
                    <div className="flex items-center gap-2">
                      <h1 className="text-[22px] md:text-[28px] font-[700]">
                        {isFromChatExperts ? "Recommended Travel Experts" : (destination ? `Trip to ${destination}` : "Plan Your Trip")}
                      </h1>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-white/20 text-white">
                        <Edit style={{ height: "18px", width: "18px" }} />
                      </Button>
                    </div>

                    <div className="mt-1 text-[14px] md:text-[18px] space-x-4 flex">
                      <div>
                        <span className="font-medium">From:</span>{" "}
                        {startDate ? startDate.toLocaleDateString() : "Select date"}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>
                          <span className="font-medium">To:</span>{" "}
                          {endDate ? endDate.toLocaleDateString() : "Select date"}
                        </span>
                        <BiCalendar style={{ height: "18px", width: "18px" }} />
                      </div>
                    </div>
                  </div>

                  {/* Right section */}
                  <div className="mt-4 md:mt-0 text-sm md:text-base text-right flex gap-[12px]">
                    <div>
                      <span className="font-medium">Breakfast:</span> 9:00 AM
                    </div>
                    <div className="flex items-center gap-1">
                      <span>
                        <span className="font-medium">Dinner:</span> 7:00 PM
                      </span>
                      <FaRegClock className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>


          {/* Tabs */}
          <Tabs
            defaultValue="activities"
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value)
              // Update URL when tab changes
              const url = new URL(window.location.href)
              if (value === 'activities') {
                url.searchParams.delete('tab')
              } else {
                url.searchParams.set('tab', value)
              }
              window.history.replaceState({}, '', url.toString())
            }}
            className="w-full"
          >
            {activeTab !== "hotels" && !isFromChatExperts && (
              <div className="bg-white rounded-xl shadow-md border p-4 sm:p-6 w-full max-w-xl mx-auto mt-[-204px] z-[20] relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Trip Details</h3>
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Users className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <label className="text-sm font-medium">Trip to:</label>
                    <div className="relative">
                      <Input
                        id="destination-input"
                        className={`mt-1 ${form.formState.errors.destination ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                        placeholder="Eg: Paris, New York, Japan"
                        {...form.register("destination")}
                        onChange={(e) => {
                          form.setValue("destination", e.target.value)
                          setDestination(e.target.value)
                          handleDestinationSearch(e.target.value)
                          // Clear selected destination if user manually types
                          if (selectedDestinationData && e.target.value !== selectedDestinationData.name) {
                            setSelectedDestinationData(null)
                          }
                        }}
                        onFocus={() => {
                          if (destinationSearchResults.length > 0) {
                            setShowDestinationDropdown(true)
                          }
                        }}
                      />
                      {destinationSearchLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                    
                    {/* Destination Dropdown */}
                    {showDestinationDropdown && destinationSearchResults.length > 0 && (
                      <div
                        id="destination-dropdown"
                        className="absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                      >
                        {destinationSearchResults.map((item, index) => (
                          <button
                            key={`${item.destination_id}-${index}`}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors"
                            onClick={() => handleDestinationSelect(item)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{item.name}</span>
                              <span className="text-xs text-gray-500 capitalize">{item.type}</span>
                            </div>
                            {item.time_zone && (
                              <p className="text-xs text-gray-400 mt-1">
                                {item.time_zone}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {form.formState.errors.destination && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.destination.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">Travel Dates:</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div>
                        <span className="text-sm">From</span>
                        <Popover open={startPopoverOpen} onOpenChange={setStartPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full mt-1 justify-start bg-transparent">
                              <Calendar className="h-4 w-4 mr-2" />
                              {startDate ? startDate.toLocaleDateString() : "Start Date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={startDate || undefined}
                              onSelect={(date) => {
                                setStartDate(date)
                                setStartPopoverOpen(false)
                                // Always set end date to start date + 3 days
                                if (date) {
                                  const newEnd = new Date(date)
                                  newEnd.setDate(newEnd.getDate() + 3)
                                  setEndDate(newEnd)
                                }
                                validateDates(date, endDate)
                              }}
                              initialFocus
                              disabled={(date) => date < new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <span className="text-sm">To</span>
                        <Popover open={endPopoverOpen} onOpenChange={setEndPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full mt-1 justify-start bg-transparent">
                              <Calendar className="h-4 w-4 mr-2" />
                              {endDate ? endDate.toLocaleDateString() : "End Date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={endDate || undefined}
                              onSelect={(date) => {
                                if (startDate && date) {
                                  const diff = (date - startDate) / (1000 * 60 * 60 * 24);
                                  if (diff < 3) {
                                    const forcedEnd = new Date(startDate);
                                    forcedEnd.setDate(forcedEnd.getDate() + 3);
                                    setEndDate(forcedEnd);
                                    setEndPopoverOpen(false);
                                    validateDates(startDate, forcedEnd);
                                    return;
                                  }
                                }
                                setEndDate(date);
                                setEndPopoverOpen(false);
                                validateDates(startDate, date);
                              }}
                              initialFocus
                              disabled={(date) => !startDate || date <= startDate}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {dateError && <p className="text-red-500 text-xs mt-1">{dateError}</p>}
                  </div>
                  <div className="mt-4">
                    <Button
                      variant="default"
                      className="w-full bg-[#FF385C] hover:bg-[#E02D50] text-white rounded-[8px]"
                      onClick={onSubmit}
                      disabled={form.formState.isSubmitting || loading}
                    >
                      {loading ? (
                        <div className="flex items-center">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          Submitting...
                        </div>
                      ) : (
                        "Submit Trip Details"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {!isFromChatExperts ? (
            <div className="border-b px-4 sticky top-16 z-30 bg-white">
              <div className="py-3 overflow-x-auto scrollbar-hide">
                <TabsList className="h-12 bg-transparent gap-3 border-b-0 p-0 w-auto">
                  <TabsTrigger
                    value="activities"
                    className={cn(
                      "rounded-[8px] h-10 bg-[#D5D9E547] px-4 data-[state=active]:bg-[#FF385C] data-[state=active]:text-white data-[state=active]:shadow-none whitespace-nowrap",
                      activeTab === "activities" ? "bg-[#FF385C] text-white" : "",
                    )}
                  >
                    Activities
                  </TabsTrigger>
                  <TabsTrigger
                    value="hotels"
                    className={cn(
                      "rounded-[8px] h-10 px-4 bg-[#D5D9E547] data-[state=active]:bg-[#FF385C] data-[state=active]:text-white data-[state=active]:shadow-none whitespace-nowrap",
                      activeTab === "hotels" ? "bg-[#FF385C] text-white" : "",
                    )}
                  >
                    Hotels
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className={cn(
                      "rounded-[8px] h-10 px-4 bg-[#D5D9E547] data-[state=active]:bg-[#FF385C] data-[state=active]:text-white data-[state=active]:shadow-none whitespace-nowrap",
                      activeTab === "services" ? "bg-[#FF385C] text-white" : "",
                    )}
                  >
                    Services
                  </TabsTrigger>
                                    <TabsTrigger
                    value="ai-optimization"
                    className={cn(
                      "rounded-[8px] h-10 px-4 bg-[#D5D9E547] data-[state=active]:bg-[#FF385C] data-[state=active]:text-white data-[state=active]:shadow-none whitespace-nowrap",
                      activeTab === "ai-optimization" ? "bg-[#FF385C] text-white" : "",
                    )}
                  >
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M12 2L2 7L12 12L22 7L12 2Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 17L12 22L22 17"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 12L12 17L22 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      AI Optimization
                    </span>
                  </TabsTrigger>

                  
                  </TabsList>
              </div>
            </div>
            ) : null}

            <div className="px-4 py-6">
              <TabsContent value="hotels" className="m-0">
                {activitiesHotel?.hotels?.length > 0 || mapDestination ? (
                    <Suspense fallback={<LoadingHotels />}>
                      {activeTab === "hotels" && <HotelsContent hotelData={HotelData} />}
                    </Suspense>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 p-10 bg-white rounded-xl shadow-md border border-gray-200">
                    <p className="text-lg font-semibold text-gray-700">
                      Please fill trip details first to get hotel recommendations.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activities" className="m-0">
                <div className="flex flex-col gap-6">
                  {/* Activity Preferences - Collapsible (always show) */}
                  <Collapsible open={isActivitiesOpen} onOpenChange={setIsActivitiesOpen} className="border-t pt-6">
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        {isActivitiesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        <h3 className="text-lg font-medium ml-2">Select Your Activity Preferences</h3>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4">
                      <div className="flex flex-wrap gap-2">
                        {activityPreferences.map((activity, index) => (
                          <Button
                            key={index}
                            type="button"
                            onClick={() => handleToggleActivity(index)}
                            variant={activity.selected ? "default" : "outline"}
                            className={`rounded-full px-4 py-1 text-sm cursor-pointer border transition ${activity.selected
                                ? "bg-green-100 text-green-700 border-green-400"
                                : "text-gray-700 border-white-300 hover:bg-gray-100 bg-white"
                              }`}
                            style={{ userSelect: "none" }}
                          >
                            <div className="flex items-center gap-1">
                              {activity.selected && <Check className="w-4 h-4 text-green-600" />}
                              <span>{activity.name}</span>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Only show Places to Visit and Add Custom Notes if trip details are filled */}
                  {activitiesHotel?.places?.length > 0 && (
                    <>
                      {/* Places to Visit - Collapsible */}
                      <Collapsible open={isPlacesOpen} onOpenChange={setIsPlacesOpen} className="border-t pt-6">
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                          <div className="flex items-center">
                            {isPlacesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            <h3 className="text-lg font-medium ml-2">Places to Visit</h3>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4">

                          <div className="relative">
                            <Carousel className="w-full">
                              <CarouselContent className="-ml-2 md:-ml-4">
                                {activitiesHotel?.places?.length > 0 ? (
                                  activitiesHotel.places.map((place, index) => (
                                    <CarouselItem
                                      key={place.place_id}
                                      className="pl-2 md:pl-4 basis-full sm:basis-1/2 md:basis-1/3"
                                    >
                                      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-3 flex flex-col gap-3 relative h-full">
                                        <div className="w-full h-40 sm:h-32 rounded-xl overflow-hidden relative bg-gray-100">
                                          {(() => {
                                            // Helper function to safely get image URL
                                            const getPlaceImageUrl = (imageUrl) => {
                                              if (!imageUrl) return null
                                              // If it's an array, get the first valid URL
                                              if (Array.isArray(imageUrl)) {
                                                const validUrl = imageUrl.find(url => url && typeof url === 'string' && url.trim() !== '')
                                                return validUrl || null
                                              }
                                              // If it's a string, return it if not empty
                                              if (typeof imageUrl === 'string' && imageUrl.trim() !== '') {
                                                return imageUrl
                                              }
                                              return null
                                            }
                                            
                                            const imageUrl = getPlaceImageUrl(place.image_url)
                                            
                                            return imageUrl ? (
                                              <Image
                                                src={imageUrl}
                                                alt={place.name || 'Place image'}
                                                fill
                                                className="object-cover"
                                                unoptimized={imageUrl.startsWith('http')}
                                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                                onError={(e) => {
                                                  // Fallback to placeholder if image fails to load
                                                  e.target.style.display = 'none'
                                                }}
                                              />
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                                                <Map className="h-12 w-12 text-gray-400" />
                                              </div>
                                            )
                                          })()}
                                        </div>
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-base sm:text-sm">{place.name}</h4>
                                          <p className="text-sm sm:text-xs text-gray-500 mt-1 line-clamp-2">
                                            {(() => {
                                              // Handle address - can be string, array, or object
                                              if (!place.address) return 'Address not available'
                                              if (typeof place.address === 'string') return place.address
                                              if (Array.isArray(place.address)) {
                                                // If array of objects, get name property
                                                return place.address.map(addr => addr?.name || addr).join(', ') || 'Address not available'
                                              }
                                              if (typeof place.address === 'object') {
                                                return place.address.name || place.address.address || 'Address not available'
                                              }
                                              return 'Address not available'
                                            })()}
                                          </p>
                                        </div>
                                        <div className="flex justify-between items-center mt-2 gap-2">
                                          <button
                                            onClick={() => handleTogglePlace(index)}
                                            className={`rounded-full w-8 h-8 flex items-center justify-center border cursor-pointer ${isPlaceSelected(place.place_id)
                                                ? "bg-green-100 border-green-400 text-green-600"
                                                : "border-gray-300 hover:bg-gray-100 text-gray-700"
                                              }`}
                                          >
                                            {isPlaceSelected(place.place_id) ? (
                                              <Check className="w-4 h-4" />
                                            ) : (
                                              <Plus className="w-4 h-4" />
                                            )}
                                          </button>
                                          {place.website_url && (
                                            <button
                                              onClick={() => window.open(place.website_url, '_blank', 'noopener,noreferrer')}
                                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#FF385C] hover:bg-[#E02D50] rounded-full transition-colors cursor-pointer"
                                              title={`Visit ${place.name}`}
                                            >
                                              <ExternalLink className="w-3 h-3" />
                                              Visit
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </CarouselItem>
                                  ))
                                ) : (
                                  <div className="w-full py-8 text-center text-gray-500">
                                    No places found. Try adjusting your search criteria.
                                  </div>
                                )}
                              </CarouselContent>

                              {/* Left Arrow - Previous Button */}
                              <CarouselPrevious className="absolute left-[-20px] top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg border border-gray-200 hover:bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center" />

                              {/* Right Arrow - Next Button */}
                              <CarouselNext className="absolute right-[-16px] top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg border border-gray-200 hover:bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center" />
                            </Carousel>
                          </div>

                        </CollapsibleContent>
                      </Collapsible>
                      {/* Add Custom Notes - Collapsible */}
                      <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen} className="border-t pt-6">
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                          <div className="flex items-center">
                            {isNotesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            <h3 className="text-lg font-medium ml-2">Add Custom Notes</h3>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4">
                          <div className="flex flex-wrap gap-2 mb-2">
                            {defaultNotes.map((note, idx) => {
                              // Pick an icon for each note (customize as needed)
                              let icon = null;
                              if (note.toLowerCase().includes("fun") || note.toLowerCase().includes("adventures")) icon = <Smile className="w-4 h-4" />;
                              else if (note.toLowerCase().includes("food")) icon = <UtensilsCrossed className="w-4 h-4" />;
                              else if (note.toLowerCase().includes("relax")) icon = <Umbrella className="w-4 h-4" />;
                              else icon = <Sparkles className="w-4 h-4" />;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setSelectedNotes((prev) =>
                                      prev.includes(note)
                                        ? prev.filter((n) => n !== note)
                                        : [...prev, note]
                                    );
                                  }}
                                  className={`rounded-full px-4 py-2 text-sm border transition flex items-center gap-2
                                    ${selectedNotes.includes(note)
                                      ? "bg-green-100 text-green-700 border-green-400"
                                      : "text-gray-700 border-gray-300 hover:bg-gray-100 bg-white"}
                                  `}
                                  style={{ userSelect: "none" }}
                                >
                                  {icon}
                                  <span>{note}</span>
                                  {selectedNotes.includes(note) && <Check className="w-4 h-4 text-green-600 ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                          <textarea
                            placeholder="Write your custom preferences, requirements and suggestions (one per line)"
                            className="w-full border rounded-lg p-3 text-sm min-h-[100px] resize-none"
                            value={customNotes}
                            onChange={(e) => setCustomNotes(e.target.value)}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="services" className="m-0">
                {activitiesHotel?.places?.length > 0 || serviceData?.services?.length > 0 || serviceData?.other_services?.length > 0 ? (
                  <div className="flex flex-col gap-6">
                    {/* Loading state */}
                    {servicesLoading && (
                      <div className="flex items-center justify-center p-8">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 border-4 border-[#FF385C] border-t-transparent rounded-full animate-spin"></div>
                          <p className="mt-4 text-gray-600">Loading services...</p>
                        </div>
                      </div>
                    )}

                    {/* Show trip detail prompt if no services */}
                    {!servicesLoading && serviceCategories?.length === 0 && (!serviceData?.services?.length && !serviceData?.other_services?.length) && (
                      <div className="flex flex-col items-center justify-center gap-4 p-10 bg-white rounded-xl shadow-md border border-gray-200">
                        <p className="text-lg font-semibold text-gray-700">
                          Please fill trip details first to get services.
                        </p>
                      </div>
                    )}

                    {/* Display all services directly */}
                    {!servicesLoading && serviceCategories?.length > 0 && (
                      <>
                        <h2 className="text-2xl font-bold">Book Your Services</h2>
                        <div className="flex flex-col gap-6">
                          {serviceCategories.map((category) => (
                            <div key={category.id} className="flex flex-col gap-6">
                              <h3 className="text-xl font-semibold text-gray-800">{category.name}</h3>
                              <div className="grid grid-cols-1 gap-4">
                                {category.data?.length > 0 ? (
                                  category.data.map((service, idx) => {
                                    const serviceName = service.title || service.service_name || 'Service';
                                    // Use category icon as fallback if no image_url
                                    const getDefaultImage = () => {
                                      if (category.type === 'car') return '/caricon.png';
                                      if (category.type === 'flight') return '/plane-icon.png';
                                      if (category.type === 'hotel') return '/hotelsimg.png';
                                      return '/service-icon2.png'; // Default service icon
                                    };
                                    const serviceImage = service.image_url || service.image || (service.user?.image) || getDefaultImage();
                                    const serviceSnippet = service.snippet || service.description || '';
                                    const serviceLink = service.affiliate_link || service.link || service.booking_url || '';
                                    const isSelected = isServiceSelected(service, category.type);
                                    
                                    return (
                                      <div key={service.title || service.service_name || idx} className="border rounded-lg overflow-hidden bg-white">
                                        <div className="flex flex-col md:flex-row">
                                          <div className="w-full md:w-64 h-48 md:h-auto relative bg-gray-100 flex items-center justify-center">
                                            {service.image_url || service.image ? (
                                              <Image
                                                src={serviceImage}
                                                alt={serviceName}
                                                fill
                                                className="object-cover"
                                                unoptimized={serviceImage.startsWith('http')}
                                              />
                                            ) : (
                                              // Show category icon as placeholder when no image
                                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                                                <Image
                                                  src={getDefaultImage()}
                                                  alt={category.name}
                                                  width={80}
                                                  height={80}
                                                  className="opacity-40"
                                                  unoptimized
                                                />
                                              </div>
                                            )}
                                            </div>
                                          <div className="flex-1 p-4">
                                            <div className="flex flex-col md:flex-row justify-between">
                                              <div className="flex-1">
                                                <h3 className="text-xl font-bold">{serviceName}</h3>
                                                {category.type === 'other_services' ? (
                                                  <>
                                                    {service.user && (
                                                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                                                        <span>@{service.user?.username || service.user?.first_name}</span>
                                            </div>
                                                    )}
                                                    {service.location && (
                                                      <div className="text-sm text-gray-500 mt-1">
                                                        📍 {service.location}
                            </div>
                          )}
                                                    {service.price && (
                                                      <div className="text-sm font-medium text-green-600 mt-1">
                                                        💰 {service.price} / {service.price_based_on || 'per unit'}
                        </div>
                                                    )}
                                                    {service.description && (
                                                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{service.description}</p>
                                                    )}
                                    </>
                                  ) : (
                                    <>
                                                    {service.displayed_link && (
                                                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                                                        {service.displayed_link}
                                                  </div>
                                                )}
                                                    {serviceSnippet && (
                                                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{serviceSnippet}</p>
                                                    )}
                                                  </>
                                                )}
                                              </div>
                                              </div>
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4">
                                            <div className="flex gap-2">
                                              <Button
                                                size="sm"
                                                  className={`${isSelected
                                                      ? "bg-green-600 hover:bg-green-700"
                                                      : "bg-[#FF385C] hover:bg-red-600"
                                                    } text-white rounded-full px-6`}
                                                  onClick={() => handleServiceSelection(service, category.type)}
                                                >
                                                  {isSelected ? (
                                                    <span className="flex items-center">
                                                      <Check className="h-4 w-4 mr-1" /> Added
                                                    </span>
                                                  ) : (
                                                    <>
                                                      <Plus className="h-4 w-4 mr-1" /> Add
                                                    </>
                                                  )}
                                              </Button>
                                                {serviceLink && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                    className="text-[#FF385C] border-[#FF385C] hover:bg-red-100 rounded-full px-6"
                                                    onClick={() => window.open(serviceLink, "_blank")}
                                                  >
                                                    <ExternalLink className="h-4 w-4 mr-1" />
                                                Visit
                                              </Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-center py-8 text-gray-500">
                                    No {category.name.toLowerCase()} available.
                                  </div>
                                )}
                          </div>
                        </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 p-10 bg-white rounded-xl shadow-md border border-gray-200">
                    <p className="text-lg font-semibold text-gray-700">
                      Please fill trip details first to get services.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ai-optimization" className="m-0">
                {typeof window !== "undefined" && !(session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) ? (
                  <div className="flex flex-col items-center justify-center bg-[#FF385C] text-white rounded-lg p-4 max-w-[400px] mx-auto mt-4 shadow-lg space-x-3">
                    <p className="font-semibold text-lg mb-4">You have to login to see AI optimization</p>
                    <Button
                      className="bg-white text-[#FF385C] hover:bg-gray-100 font-semibold"
                      onClick={() => {
                        localStorage.setItem("redirect", "true")
                        clientRedirect("/login")
                      }}
                    >
                      Login
                    </Button>
                  </div>
                ) : aiData ? (
                  <div className="flex flex-col gap-6 p-4">
                    {/* Main Details */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                      <h2 className="text-2xl font-bold mb-4">{aiData?.title || "No Title Available"}</h2>
                      <p className="text-gray-700 mb-2">{aiData?.description || "No Description Available"}</p>
                      <p className="text-gray-700 mb-2">
                        <strong>City:</strong> {aiData?.city || "Not Specified"}
                      </p>
                      <p className="text-gray-700 mb-2">
                        <strong>Price:</strong> {aiData?.price || "Not Specified"}
                      </p>
                      <p className="text-gray-700 mb-4">
                        <strong>Highlights:</strong> {aiData?.highlights || "Not Specified"}
                      </p>
                      {/* Start and End Points */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <strong>Start Point:</strong> {aiData?.start_point || "Not Available"}
                        </div>
                        <div>
                          <strong>End Point:</strong> {aiData?.end_point || "Not Available"}
                        </div>
                      </div>
                    </div>
                    {/* Inclusions and Exclusions */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                      <h3 className="text-xl font-semibold mb-4">What's Included</h3>
                      <ul className="list-disc pl-6 text-gray-700">
                        {aiData?.inclusive?.length > 0 ? (
                          aiData.inclusive.map((item, i) => <li key={i}>{item || "No Details Available"}</li>)
                        ) : (
                          <li>No Inclusions Available</li>
                        )}
                      </ul>
                      <h3 className="text-xl font-semibold mt-6 mb-4">What's Not Included</h3>
                      <ul className="list-disc pl-6 text-gray-700">
                        {aiData?.exclusive?.length > 0 ? (
                          aiData.exclusive.map((item, i) => <li key={i}>{item || "No Details Available"}</li>)
                        ) : (
                          <li>No Exclusions Available</li>
                        )}
                      </ul>
                    </div>
                    {/* Day-wise Itinerary */}
                    {aiData?.itinerary?.length > 0 ? (
                      aiData.itinerary.map((day, index) => (
                        <div key={index} className="bg-white p-6 rounded-lg shadow-md">
                          <h3 className="text-xl font-semibold mb-4">
                            Day {day?.day_number || index + 1}: {day?.title || "No Title"}
                          </h3>
                          <p className="text-gray-700 mb-4">{day?.description || "No Description Provided"}</p>
                          <ul className="space-y-4">
                            {day?.activities?.length > 0 ? (
                              day.activities.map((activity, i) => (
                                <li key={i} className="p-4 bg-gray-50 rounded-lg shadow-sm">
                                  <h4 className="text-lg font-semibold">{activity?.activity || "No Activity Name"}</h4>
                                  <p className="text-gray-600">
                                    <strong>Location:</strong> {activity?.location || "Not Specified"}
                                  </p>
                                  <p className="text-gray-600">
                                    <strong>Time:</strong> {activity?.time || "Not Specified"} (
                                    {activity?.duration || "Duration Not Available"})
                                  </p>
                                  <p className="text-gray-600">
                                    <strong>Notes:</strong> {activity?.notes || "No Notes Provided"}
                                  </p>
                                  <p className="text-gray-600">
                                    <strong>Estimated Cost:</strong>{" "}
                                    {activity?.metadata?.estimated_cost || "Not Available"}
                                  </p>
                                  {activity?.metadata?.website_url ? (
                                    <a
                                      href={activity.metadata.website_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-500 underline"
                                    >
                                      Visit Website
                                    </a>
                                  ) : (
                                    <span>No Website Available</span>
                                  )}
                                </li>
                              ))
                            ) : (
                              <li>No Activities Available</li>
                            )}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <div className="bg-white p-6 rounded-lg shadow-md">
                        <p>No Itinerary Available</p>
                      </div>
                    )}
                    {/* Summary */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                      <h3 className="text-xl font-semibold mb-4">Summary</h3>
                      <ul className="list-disc pl-6 text-gray-700">
                        <li>
                          <strong>Total Places:</strong> {aiData?.summary?.total_places || "Not Specified"}
                        </li>
                        <li>
                          <strong>Total Hotels:</strong> {aiData?.summary?.total_hotels || "Not Specified"}
                        </li>
                        <li>
                          <strong>Total Services:</strong> {aiData?.summary?.total_services || "Not Specified"}
                        </li>
                        <li>
                          <strong>Hotel Coverage:</strong> {aiData?.summary?.hotel_coverage || "Not Specified"}
                        </li>
                        <li>
                          <strong>Service Coverage:</strong> {aiData?.summary?.service_coverage || "Not Specified"}
                        </li>
                      </ul>
                      {/* Recommendations */}
                      <h4 className="text-lg font-semibold mt-4">Recommendations</h4>
                      <ul className="list-disc pl-6 text-gray-700">
                        {aiData?.summary?.recommendations?.length > 0 ? (
                          aiData.summary.recommendations.map((rec, i) => <li key={i}>{rec}</li>)
                        ) : (
                          <li>No Recommendations Available</li>
                        )}
                      </ul>
                      {/* Notes */}
                      <h4 className="text-lg font-semibold mt-4">Important Notes</h4>
                      <ul className="list-disc pl-6 text-gray-700">
                        {aiData?.summary?.important_notes?.length > 0 ? (
                          aiData.summary.important_notes.map((note, i) => <li key={i}>{note}</li>)
                        ) : (
                          <li>No Important Notes Available</li>
                        )}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center bg-yellow-100 text-yellow-800 rounded-lg p-8 max-w-[400px] mx-auto mt-4 shadow-lg">
                    <h2 className="text-2xl font-bold mb-2">Page under construction</h2>
                    <p className="text-lg">AI Optimization is coming soon!</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="travel-experts" className="m-0">
                <div className="flex flex-col gap-6">
                  {/* Back to AI Itinerary Button */}
                  <div className="mb-4">
                    <button 
                      onClick={() => router.back()}
                      className="text-[#FF385C] hover:text-red-600 flex items-center gap-2 text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to AI Itinerary
                    </button>
                  </div>

                  {/* Travel Experts Header */}
                  <div className="mb-3">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      Recommended Travel Experts For Your 'Trip to {destination || "Tokyo"}'
                    </h2>
                    <p className="text-gray-600 mb-2">
                      Based on your trip details and Preferences, Here are the best matches
                    </p>
                    <p className="text-sm text-gray-500 text-end">
                      <i>"24 Results found based on your AI Itinerary"</i>
                    </p>
                  </div>

                
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {expertsLoading ? (
                      // Loading state
                      Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse">
                          <div className="text-center">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-200"></div>
                            <div className="h-6 bg-gray-200 rounded mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded mb-4 w-3/4 mx-auto"></div>
                            <div className="space-y-2">
                              <div className="h-8 bg-gray-200 rounded"></div>
                              <div className="h-8 bg-gray-200 rounded"></div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : Expertlist && Expertlist.length > 0 ? (
                      // Dynamic experts data from API
                      Expertlist.map((expert, index) => (
                        <div key={expert.id || index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-center">
                            {/* Expert Avatar */}
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4 border-gray-100">
                              <Image
                                src={expert.image || expert.cover_image || "https://randomuser.me/api/portraits/men/1.jpg"}
                                alt={expert.first_name || expert.username || "Expert"}
                                width={80}
                                height={80}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            
                            {/* Expert Name */}
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {expert.first_name && expert.last_name 
                                ? `${expert.first_name} ${expert.last_name}` 
                                : expert.username || "Travel Expert"
                              }
                            </h3>
                            
                            {/* Rating */}
                            <div className="flex items-center justify-center gap-1 mb-4">
                              <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span className="text-sm font-medium text-gray-700">
                                {expert.average_rating ? `${expert.average_rating.toFixed(1)}/5.0` : "4.8/5.0"} 
                                ({expert.reviews ? expert.reviews.length : "0"} Reviews)
                              </span>
                            </div>
                            
                            {/* Location */}
                            {expert.city && expert.country && (
                              <div className="text-sm text-gray-500 mb-4">
                                📍 {expert.city}, {expert.country}
                              </div>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                className="bg-[#FF385C] hover:bg-red-600 py-2 text-white font-semibold"
                                onClick={() => {
                                  if (hiredExperts.includes(expert.id)) {
                                    setHiredExperts(hiredExperts.filter(id => id !== expert.id));
                                    toast.success(`Unhired ${expert.first_name || expert.username}`);
                                  } else {
                                    setHiredExperts([...hiredExperts, expert.id]);
                                    toast.success(`Hired ${expert.first_name || expert.username} as your travel expert!`);
                                  }
                                }}
                              >
                                {hiredExperts.includes(expert.id) ? "Expert is hired for now" : "Hire Expert"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[#FF385C] text-[#FF385C] py-2 hover:bg-red-50 font-semibold"
                                onClick={() => handleOpenChat(expert)}
                                disabled={!isConnected}
                              >
                                Send Message
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      // No experts found
                      <div className="col-span-full text-center py-12">
                        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Experts Found</h3>
                          <p className="text-gray-500 mb-4">
                            No travel experts found for "{destination}". Try searching for a different destination.
                          </p>
                          {expertsError && (
                            <p className="text-red-500 text-sm">
                              Error: {expertsError}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
        {/* Map Section - Fixed 50% width on desktop */}
        <div className="hidden lg:block lg:w-[40%] relative">
          <MapComponent destination={mapDestination} apiKey={GOOGLE_MAPS_API_KEY} />
        </div>
      </div>
      {/* Sticky Create AI Itinerary button for mobile */}
      {isMobile && !isFromChatExperts && (
        <div className="fixed bottom-0 left-0 w-full z-50 bg-white p-3 border-t flex flex-col items-center gap-2 lg:hidden">
          {/* Credits Button for Mobile - Above Generate Button */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-[22px] border-none bg-[#fdeef4] px-3 flex items-center gap-2 h-[42px] flex-shrink-0 cursor-not-allowed"
            onClick={() => {
              console.log('Credits clicked (mobile)')
            }}
          >
            <Image 
              src="/coins-icon.png" 
              alt="Credits" 
              width={16} 
              height={16} 
              className="h-4 w-4 flex-shrink-0"
            />
                            <span className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] bg-clip-text text-transparent font-medium text-sm whitespace-nowrap">{userCredits} Credits</span>
            <div
              className="h-6 w-6 p-0 rounded-full bg-white hover:bg-pink-100 border border-pink-200 flex-shrink-0 ml-1 cursor-pointer flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation()
                handleAddCredits()
              }}
            >
              <svg 
                className="h-3 w-3" 
                fill="url(#plusGradientMobile)" 
                viewBox="0 0 24 24"
              >
                <defs>
                  <linearGradient id="plusGradientMobile" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F30131" />
                    <stop offset="100%" stopColor="#BE35EB" />
                  </linearGradient>
                </defs>
                <path d="M12 4v16m8-8H4" stroke="url(#plusGradientMobile)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
          </Button>

          {/* Generate Itinerary Button for Mobile */}
          <Button
            variant="destructive"
            size="lg"
            className="rounded-[7px] bg-[#FF385C] px-6 flex items-center w-full max-w-xs"
            disabled={!canCreateItinerary || creatingItinerary}
            onClick={handleSubmit}
          >
            {creatingItinerary ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 mr-2 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                Creating...
              </>
            ) : (
              <span>Generate Itinerary</span>
            )}
          </Button>
        </div>
      )}
      {teammatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative p-0">
            <button
              className="absolute top-4 right-5 text-gray-400 hover:text-gray-700 text-2xl"
              onClick={() => setTeammatesModalOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-2xl font-bold px-8 pt-8 pb-2">Add Teammates</h2>
            <form
              className="px-8"
              onSubmit={e => {
                e.preventDefault();
                // Optionally add teammate to the list here
              }}
            >
              <label className="block text-sm font-semibold mb-2">Email Address</label>
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Add Email Address Here"
                  value={teammateEmail}
                  onChange={e => setTeammateEmail(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="bg-[#FF385C] text-white px-5 py-2 rounded-lg font-semibold hover:bg-[#E02D50]"
                >
                  Invite
                </button>
              </div>
              <button
                type="button"
                className="text-[#FF385C] text-sm font-semibold mb-4 flex items-center gap-1 hover:underline"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
              >
                <SquareStack className="w-4 h-4" />
                Copy Link
              </button>
              <div className="mb-2 font-semibold text-gray-900">Current Teammates</div>
              <div className="mb-8">
                {teammates.map((tm, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#fafbfc] rounded-lg px-4 py-3 mb-2">
                    <div className="flex items-center gap-3">
                      <img src={tm.avatar} alt={tm.name} className="w-8 h-8 rounded-full object-cover" />
                      <div>
                        <div className="font-medium text-gray-900">{tm.name}</div>
                        <div className="text-xs text-gray-500">{tm.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-[#FF385C] text-sm font-semibold hover:underline"
                      onClick={() => setTeammates(teammates.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chat Interface - Full Screen */}
      {chat.showChatInterface && chat.selectedExpert && (
        <div className="fixed inset-0 z-50 bg-white flex">
          {/* Chat Section - Same width as main content */}
          <div className="lg:w-[60%] w-full flex flex-col bg-white">
            {/* Chat Interface - Direct Message Rendering (same as experts page) */}
            <div className="flex flex-col h-full bg-gray-50">
              {/* Header */}
              <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={chat.handleCloseChat}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0">
                    <img 
                      src={chat.selectedExpert?.image || "/dummypic.png"} 
                      alt="Expert" 
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {chat.getDisplayName(chat.selectedExpert)}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {chat.isConnected ? "Online" : "Offline"}
                    </p>
                  </div>
                </div>
                {showContract && (
                  <button
                    onClick={() => contract.handleContractModal(chat.selectedExpert)}
                    className="px-4 py-2 bg-[#FF385C] text-white rounded-lg hover:bg-[#FF385C] transition-colors"
                  >
                    Create Contract
                  </button>
                )}
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chat.messages && chat.messages.length > 0 ? (
                  chat.messages.map((message, index) => {
                    const messageId = message.id || message.chat?.id
                    const messageText = message.message || message.chat?.message || message.content || "No message content"
                    const createdAt = message.created_at || message.chat?.created_at || message.timestamp
                    const attachment = message.attachment || message.chat?.attachment

                    // Determine if this is a contract message
                    const isContractMessage = message.isContract || message.contract || message.chat?.contract

                    // Determine if this is an itinerary message
                    const isItineraryMessage = message.isItinerary || message.itinerary || message.itinerary_submit || message.chat?.itinerary_submit

                    // Determine message direction (same logic as experts page)
                    let finalIsOutgoing = false
                    if (isContractMessage) {
                      // For contract messages, check if the contract sender is the current user
                      const contractSenderId = message.contract?.sender?.id || message.contract?.sender_id
                      const currentUserId = session?.user?.id
                      finalIsOutgoing = contractSenderId === currentUserId
                    } else if (isItineraryMessage) {
                      // For itinerary messages, check if sender is current user
                      finalIsOutgoing = message.sender?.id === session?.user?.id || message.sender === 'user'
                    } else {
                      // For regular messages, check various sender indicators
                      finalIsOutgoing = 
                        message.sender?.id === session?.user?.id ||
                        message.sender === 'user' ||
                        message.type === 'sent' ||
                        (message.chat?.sender && message.chat.sender.id === session?.user?.id)
                    }

                    return (
                      <div key={messageId || `msg-${index}`}>
                        {isContractMessage ? (
                          <ContractMessage
                            contract={{
                              ...(message.contract || message.chat?.contract || message),
                              title:
                                message.contract?.contract_title ||
                                message.chat?.contract?.contract_title ||
                                message.contract_title,
                              status: message.contract?.status || null,
                              is_accepted: message.contract?.is_accepted || false,
                              is_paid: message.contract?.is_paid || false,
                              payment_url: message.contract?.payment_url || null,
                            }}
                            onAccept={(id) => contract.handleContractAction(id, 'accept', chat.setMessages)}
                            onReject={(id) => contract.handleContractAction(id, 'reject')}
                            onPay={(id) => contract.handleContractPay(id, chat.messages)}
                            isOwnMessage={finalIsOutgoing}
                          />
                        ) : isItineraryMessage ? (
                          (() => {
                            const itineraryData = message.itinerary_submit || message.itinerary || message

                            const processedItinerary = {
                              id: itineraryData.id,
                              title: itineraryData.title,
                              description: itineraryData.description,
                              location: itineraryData.location,
                              status: itineraryData.status || "pending",
                              attachment: itineraryData.attachment,
                              created_at: itineraryData.created_at || message.created_at,
                              receiver: message.receiver,
                              sender: message.sender,
                            }

                            return (
                              <ItineraryMessage
                                key={messageId || `msg-${index}`}
                                itinerary={processedItinerary}
                                onApprove={(id) => itinerary.handleItineraryAction(id, 'approve')}
                                onRequestEdit={(id) => itinerary.handleItineraryAction(id, 'requestEdit')}
                                isOwnMessage={finalIsOutgoing}
                              />
                            )
                          })()
                        ) : (
                          <div
                            className={`flex ${finalIsOutgoing ? "justify-end" : "justify-start"} mb-3 sm:mb-4`}
                          >
                            <div
                              className={`max-w-[85%] sm:max-w-[70%] ${finalIsOutgoing ? "text-right" : "text-left"}`}
                            >
                              <div
                                className={`rounded-lg px-3 py-2 shadow-sm ${
                                  finalIsOutgoing
                                    ? "bg-gradient-to-r from-[#F30131] to-[#BE35EB] text-white"
                                    : "bg-white border border-gray-200"
                                }`}
                              >
                                <p className="text-sm break-words">{messageText}</p>

                                {/* Display attachment using common component */}
                                <AttachmentDisplay
                                  message={message}
                                  attachment={attachment}
                                  messageId={messageId}
                                  index={index}
                                  isOutgoing={finalIsOutgoing}
                                />
                              </div>

                              <p
                                className={`text-xs text-gray-500 mt-1 ${
                                  finalIsOutgoing ? "text-right" : "text-left"
                                }`}
                              >
                                {chat.formatTime(new Date(createdAt || Date.now()))}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No messages yet. Start a conversation!</p>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="bg-white border-t border-gray-200 p-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    id="file-input"
                    onChange={chat.handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                  />
                  <button
                    onClick={() => document.getElementById('file-input').click()}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={chat.chatMessage}
                      onChange={(e) => chat.setChatMessage(e.target.value)}
                      onKeyPress={chat.handleKeyPress}
                      placeholder="Type your message here"
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {/* Microphone Button */}
                    <button
                      onClick={chat.startRecording}
                      disabled={chat.recordingState.isRecording}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Voice message"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                  </div>

                  <button
                    onClick={chat.handleSendMessage}
                    disabled={!chat.chatMessage.trim() && !chat.selectedFile}
                    className="p-2 bg-[#FF385C] text-white rounded-full  disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>

                {/* Voice Message Controls */}
                {chat.recordingState.isRecording && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs sm:text-sm text-red-700">
                          Recording... {Math.floor(chat.recordingState.time / 60)}:{(chat.recordingState.time % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={chat.stopRecording}
                          className="px-2 sm:px-3 py-1 bg-red-500 text-white rounded-lg text-xs sm:text-sm hover:bg-red-600"
                        >
                          Stop
                        </button>
                        <button
                          onClick={chat.cancelVoiceMessage}
                          className="px-2 sm:px-3 py-1 bg-gray-500 text-white rounded-lg text-xs sm:text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Voice Message Preview */}
                {chat.recordingState.blob && !chat.recordingState.isRecording && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span className="text-xs sm:text-sm text-blue-700">
                          Voice message ({Math.floor(chat.recordingState.time / 60)}:{(chat.recordingState.time % 60).toString().padStart(2, '0')})
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={chat.sendVoiceMessage}
                          className="px-2 sm:px-3 py-1 bg-blue-500 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-600"
                        >
                          Send
                        </button>
                        <button
                          onClick={chat.cancelVoiceMessage}
                          className="px-2 sm:px-3 py-1 bg-gray-500 text-white rounded-lg text-xs sm:text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Selected File Display */}
                {chat.selectedFile && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="text-sm text-blue-800">{chat.selectedFile.name}</span>
                        <span className="text-xs text-blue-600">({(chat.selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </div>
                      <button
                        onClick={() => chat.setSelectedFile(null)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Map Section - Same width as sidebar */}
          <div className="hidden lg:block lg:w-[40%] h-full">
            <MapComponent destination={mapDestination} apiKey={GOOGLE_MAPS_API_KEY} />
          </div>
        </div>
      )}

      {/* Credits Modal */}
      <Dialog open={showCreditsModal} onOpenChange={setShowCreditsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">Add Credits</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Are you sure you want to add more credits to your account?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-center p-4 bg-gradient-to-r from-[#F30131] to-[#BE35EB] rounded-lg mb-4">
              <FaCoins className="w-8 h-8 text-white mr-3" />
                              <span className="text-white font-semibold text-lg">{userCredits} Credits</span>
            </div>
            <p className="text-sm text-gray-600 text-center">
              Adding credits will allow you to generate more itineraries and access premium features.
            </p>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleCancelAddCredits}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddCredits}
              className="flex-1 bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:from-[#D4002A] hover:to-[#A82FD8] text-white"
            >
              Add Credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Out of Credits Modal */}
      <Dialog open={showOutOfCreditsModal} onOpenChange={setShowOutOfCreditsModal}>
        <DialogContent className="sm:max-w-md mx-auto">
          <div className="relative">
            
            {/* Warning Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center ">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            
            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 text-center mb-4">
              Out of Credits
            </h2>
            
            {/* Description */}
            <p className="text-gray-600 text-center mb-8 leading-relaxed">
              You've used all your travel credits! Recharge now to continue booking amazing trips and experiences around the world.
            </p>
            
            {/* Recharge Button */}
            <div className="flex justify-center mb-4">
              <Button
                onClick={handleRechargeNow}
                className="w-48 h-11 bg-gradient-to-b from-[#F30131] to-[#BE35EB] hover:from-[#D4002A] hover:to-[#A82FD8] text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105"
                style={{ 
                  width: '193px', 
                  height: '44px',
                  borderRadius: '8px'
                }}
              >
                Recharge Now
              </Button>
            </div>
            
            {/* Footer Text */}
            <p className="text-sm text-gray-500 text-center mb-6">
              Quick and Secure Payment Options Available
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract Modal */}
      <ContractModal
        isOpen={contract.showContractModal}
        onClose={contract.handleContractClose}
        expert={contract.contractExpert}
        onSubmit={contract.handleContractSubmit}
        userRole={session?.user?.roles || session?.backendData?.roles || []}
      />

      {/* Contract Approved Modal */}
      <ContractApprovedModal
        isOpen={contract.showContractApprovedModal}
        onClose={() => contract.setShowContractApprovedModal(false)}
        expertName={contract.approvedItineraryData?.expertName}
        itineraryTitle={contract.approvedItineraryData?.title}
        onSubmitFeedback={contract.handleSubmitFeedback}
      />
    </div>
  )
}

// Default services if none are available from API
export default function BookingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[#FF385C] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading itinerary...</p>
        </div>
      </div>
    }>
      <BookingPageContent />
    </Suspense>
  )
}

