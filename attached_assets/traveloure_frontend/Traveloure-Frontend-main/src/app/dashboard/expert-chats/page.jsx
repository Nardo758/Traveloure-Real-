"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { MoreHorizontal, Bell, Paperclip, Mic, Send, Menu, X, ChevronLeft, Search } from "lucide-react"
import { TbContract } from "react-icons/tb"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { useDispatch, useSelector } from "react-redux"
import { useSession } from "next-auth/react"
import { useWebSocketContext } from "../../../components/WebSocketProvider"
import { toast } from "sonner"
import ContractModal from "../../../components/ContractModal"
import ContractApprovedModal from "../../../components/ContractApprovedModal"
import { useChat } from "../../../hooks/useChat"
import { useContract } from "../../../hooks/useContract"
import { useItinerary } from "../../../hooks/useItinerary"
import { ChatInterface } from "../../../components/ChatInterface"
import * as contractActions from "../../redux-features/contract/contractSlice"

import { AttachmentDisplay } from "../../../components/AttachmentDisplay"
import { StickerPicker } from "../../../components/StickerPicker"
import {
  getChatHistory,
  getChatMessages,
  addIncomingMessage,
  updateExistingMessage,
  clearCurrentChat,
} from "../../../app/redux-features/chat/chatSlice"
import { updateContractStatus } from "../../../app/redux-features/contract/contractSlice"
import ContractMessage from "../../../components/ContractMessage"
import ItineraryMessage from "../../../components/ItineraryMessage"
import soundNotification from "../../../utils/soundNotification"
import { useIsMobile } from "../../../hooks/use-mobile"
import { AppSidebar } from "../../../components/app-sidebar"

export default function ExpertChatsPage() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isConnected, joinChat, sendChatMessage, leaveChat, addMessageListener } = useWebSocketContext()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [selectedExpert, setSelectedExpert] = useState(null)
  const [chatMessage, setChatMessage] = useState("")
  const [selectedFile, setSelectedFile] = useState(null)
  const [showStickers, setShowStickers] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)

  // Initialize hooks for chat, contract, and itinerary functionality
  const chat = useChat()
  const contract = useContract()
  const itinerary = useItinerary()

  const chatHistory = useSelector((state) => state.chat?.chatHistory || [])
  const chatHistoryLoading = useSelector((state) => state.chat?.chatHistoryLoading || false)
  const chatHistoryError = useSelector((state) => state.chat?.chatHistoryError || null)
  const selectedChat = useSelector((state) => state.chat?.selectedChat || {})
  const currentChatMessages = useSelector((state) => state.chat?.currentChatMessages || [])
  const currentChatLoading = useSelector((state) => state.chat?.currentChatLoading || false)
  const currentChatError = useSelector((state) => state.chat?.currentChatError || null)


  // Get contract status data from Redux
  const { contractStatusData, showContract } = useSelector((state) => state.contract)
  // Check contract status when component mounts and user is logged in
  useEffect(() => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    
    // Only make API call if we have both token and a valid chatId
    if (token && chatId) {
      dispatch(contractActions.checkContractStatus({ token, withChat: chatId }))
        .then(result => {
        })
        .catch(error => {
          console.error('🔌 Dashboard expert-chats - Failed to check contract status:', error)
        })
    }
  }, [session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken, selectedChat, dispatch])

  const messagesEndRef = useRef(null)
  const joinedChatRef = useRef(null)
  const fileInputRef = useRef(null)

  // Mock experts data
  const experts = [
    {
      id: 1,
      name: "Kathryn Murphy",
      trip: "Tokyo, Japan 🇯🇵",
      avatar: "https://randomuser.me/api/portraits/women/1.jpg",
      isOnline: true,
      lastMessage: "Just now",
    },
    {
      id: 2,
      name: "Arlene McCoy",
      trip: "New York, USA 🇺🇸",
      avatar: "https://randomuser.me/api/portraits/women/2.jpg",
      isOnline: false,
      lastMessage: "2 hours ago",
    },
    {
      id: 3,
      name: "Kristin Watson",
      trip: "Paris, France 🇫🇷",
      avatar: "https://randomuser.me/api/portraits/women/3.jpg",
      isOnline: true,
      lastMessage: "1 day ago",
    },
    {
      id: 4,
      name: "Arlene McCoy",
      trip: "Manali, India 🇮🇳",
      avatar: "https://randomuser.me/api/portraits/women/4.jpg",
      isOnline: false,
      lastMessage: "3 days ago",
    },
  ]

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      const chunks = []

      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" })
        setAudioBlob(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      const timer = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)

      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop()
          setIsRecording(false)
          clearInterval(timer)
        }
      }, 60000) // Max 1 minute
    } catch (error) {
      console.error("Error starting recording:", error)
      toast.error("Could not start recording")
    }
  }

  const stopRecording = () => {
    setIsRecording(false)
  }

  const sendVoiceMessage = async () => {
    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (audioBlob && chatId) {
      try {
        // Implementation for sending voice message
        setAudioBlob(null)
        setRecordingTime(0)
      } catch (error) {
        console.error("Error sending voice message:", error)
        toast.error("Failed to send voice message")
      }
    }
  }

  const cancelVoiceMessage = () => {
    setAudioBlob(null)
    setRecordingTime(0)
    setIsRecording(false)
  }

  // Helper functions
  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60))

    if (diffInHours < 1) return "Just now"
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`

    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`
  }

  // Group messages by date
  const groupMessagesByDate = (messages) => {
    const groups = {}
    messages.forEach((message) => {
      // Handle both Redux message structure (created_at) and chat hook structure (timestamp)
      const date = new Date(message.created_at || message.timestamp || message.chat?.created_at).toDateString()
      if (!groups[date]) groups[date] = []
      groups[date].push(message)
    })
    return groups
  }

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return "Today"
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const handleSendMessage = async () => {
    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if ((!chatMessage.trim() && !selectedFile) || !chatId) return

    try {
      const messageData = {
        message: chatMessage,
        receiverId: chatId,
        attachment: selectedFile,
      }

      // Send message logic here

      setChatMessage("")
      setSelectedFile(null)
    } catch (error) {
      console.error("Error sending message:", error)
      toast.error("Failed to send message")
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleStickerSelect = (sticker) => {
    setChatMessage((prev) => prev + sticker)
    setShowStickers(false)
  }

  // Initialize with first expert selected
  useEffect(() => {
    if (experts.length > 0) {
      setSelectedExpert(experts[0])
    }
  }, [])

  // Load chat history on component mount
  useEffect(() => {
    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (accessToken) {
      dispatch(getChatHistory({ token: accessToken }))
    }
  }, [session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken, dispatch])

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // Scroll to bottom is now handled by the chat hook

  // Client-side only state to prevent hydration issues
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // WebSocket message handling is now done by the chat hook
  useEffect(() => {
    const handleIncomingMessage = (data) => {
   
      // Process chat_message, notification, and new_submit_itinerary types
      if (
        (data.type === "chat_message" || data.type === "notification" || data.type === "new_submit_itinerary") &&
        data.message
      ) {
        const messageObj = data.message

        // Extract sender information
        const senderName = messageObj.sender?.username || messageObj.sender_name || "Unknown"
        const receiverName = messageObj.receiver?.username || messageObj.receiver_name || "Unknown"


        // AGGRESSIVE FILTERING: Skip ALL messages that could be from current user
        const currentUserIdentifiers = [
          session?.user?.username,
          session?.user?.name,
          session?.user?.email,
          session?.user?.first_name,
          session?.user?.last_name,
        ].filter(Boolean) // Remove undefined values

        const isFromCurrentUser = currentUserIdentifiers.some(
          (name) => senderName === name || senderName.toLowerCase().includes(name.toLowerCase()),
        )

        // Also check if this looks like a message you just sent
        const recentMessageContent = messageObj.message
        const looksLikeRecentMessage =
          recentMessageContent.length <= 10 &&
          (recentMessageContent.toLowerCase().includes("uh8uh") ||
            recentMessageContent.toLowerCase().includes("ijj") ||
            recentMessageContent.toLowerCase().includes("huhu") ||
            recentMessageContent.toLowerCase().includes("we") ||
            recentMessageContent.toLowerCase().includes("fe") ||
            recentMessageContent.toLowerCase().includes("fds"))

       

        // Process messages from experts AND not from current user AND not recent messages
        if (!isFromCurrentUser && !looksLikeRecentMessage) {
          const messageData = {
            id: messageObj.id || `msg_${Date.now()}_${Math.random()}`,
            message: messageObj.message,
            attachment: messageObj.attachment || null,
            created_at: messageObj.created_at || new Date().toISOString(),
            sender_name: senderName,
            receiver_name: receiverName,
          }

          dispatch(addIncomingMessage(messageData))
        } else {
        
        }
      }

      // Contract messages are now handled by the useChat hook
      // This prevents duplicate processing and conflicts

      // Handle new_submit_itinerary message type
      if (data.type === "new_submit_itinerary" && data.message) {
       
        const itineraryData = data.message.itinerary_submit
        const itineraryId = itineraryData.id || data.message.id

        // Generate unique message ID to prevent Redux duplicate prevention
        const uniqueItineraryMessageId = `${itineraryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        // Create itinerary message object
        const itineraryMessage = {
          id: uniqueItineraryMessageId,
          message: `Itinerary Submitted: ${itineraryData.title || "New Itinerary"}`,
          sender_name: data.message.sender?.username || data.message.sender_name || "Local Expert",
          receiver_name: data.message.receiver?.username || data.message.receiver_name || "Traveler",
          timestamp: data.message.timestamp || new Date().toISOString(),
          created_at: data.message.created_at || new Date().toISOString(),
          attachment: data.message.attachment,
          isItinerary: true,
          itinerary: {
            id: itineraryId,
            title: itineraryData.title || "New Itinerary",
            description: itineraryData.description || "",
            location: itineraryData.location || "",
            status: itineraryData.status || "pending",
            attachment: itineraryData.attachment,
            created_at: itineraryData.created_at,
          },
          sender: {
            username: data.message.sender?.username || data.message.sender_name,
            id: data.message.sender?.id,
            first_name: data.message.sender?.first_name,
            last_name: data.message.sender?.last_name,
            image: data.message.sender?.image,
          },
          receiver: {
            username: data.message.receiver?.username || data.message.receiver_name,
            id: data.message.receiver?.id,
            first_name: data.message.receiver?.first_name,
            last_name: data.message.receiver?.last_name,
            image: data.message.receiver?.image,
          },
        }

        dispatch(addIncomingMessage(itineraryMessage))

        // Play sound notification for new itinerary
        soundNotification.play()
      }

      // Handle contract_rejected message type
      if (data.type === "contract_rejected" && data.message) {
      
        // Extract contract ID from the message
        const contractId = data.message.contract_id || data.message.id

        if (contractId) {

          // Update the contract status in Redux
          dispatch(
            updateContractStatus({
              contractId: contractId,
              status: "rejected",
            }),
          )

          // Play sound notification for contract rejection
          soundNotification.play()

          // Also update the chat message if it exists
          const existingMessage = currentChatMessages.find(
            (msg) => msg.isContract && msg.contract && msg.contract.id === contractId,
          )

          if (existingMessage) {
            // Update the existing message with rejected status
            dispatch(
              updateExistingMessage({
                messageId: existingMessage.id,
                updates: {
                  contract: {
                    ...existingMessage.contract,
                    status: "rejected",
                    is_accepted: false,
                  },
                },
              }),
            )
          }
        }
      }

      // Handle contract_accepted message type
      if (data.type === "contract_accepted" && data.message) {
       
        // Extract contract ID from the message
        const contractId = data.message.contract_id || data.message.id

        if (contractId) {

          // Update the contract status in Redux
          dispatch(
            updateContractStatus({
              contractId: contractId,
              status: "accepted",
              payment_url: data.message.payment_url,
            }),
          )

          // Play sound notification for contract acceptance
          soundNotification.play()

          // Also update the chat message if it exists
          const existingMessage = currentChatMessages.find(
            (msg) => msg.isContract && msg.contract && msg.contract.id === contractId,
          )

          if (existingMessage) {
           // Update the existing message with accepted status and payment URL
            dispatch(
              updateExistingMessage({
                messageId: existingMessage.id,
                updates: {
                  contract: {
                    ...existingMessage.contract,
                    status: "accepted",
                    is_accepted: true,
                    payment_url: data.message.payment_url || existingMessage.contract.payment_url,
                  },
                },
              }),
            )
          }
        }
      }

      // Handle contract payment success
      if (data.type === 'contract_payment_success' && data.message) {
       
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          // Update the contract status in Redux
          dispatch(
            updateContractStatus({
              contractId: contractId,
              status: "paid",
              payment_url: data.message.payment_url,
            }),
          )

          // Play sound notification for payment success
          soundNotification.play()

          // Also update the chat message if it exists
          const existingMessage = currentChatMessages.find(
            (msg) => msg.isContract && msg.contract && msg.contract.id === contractId,
          )

          if (existingMessage) {
            // Update the existing message with paid status
            dispatch(
              updateExistingMessage({
                messageId: existingMessage.id,
                updates: {
                  contract: {
                    ...existingMessage.contract,
                    status: "paid",
                    is_accepted: true,
                    is_paid: true,
                    payment_url: data.message.payment_url || existingMessage.contract.payment_url,
                  },
                },
              }),
            )
          }

          // Trigger checkContractStatus API to refresh contract data
          const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
          if (accessToken) {
            const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
            if (chatId) {
              dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
              .then(() => {
                console.log("🔌 Dashboard Expert Chats - Contract status refreshed successfully")
              })
              .catch(error => {
                console.error("🔌 Dashboard Expert Chats - Error refreshing contract status:", error)
              })
            } else {
              console.log("🔌 Dashboard Expert Chats - No chat ID available for checkContractStatus")
            }
          } else {
            console.log("🔌 Dashboard Expert Chats - No access token available for checkContractStatus")
          }
        }
      }

      // Handle itinerary approval
      if (data.type === 'submit_itinerary_accepted' && data.message) {
        const itineraryId = data.message.id

        // Update the itinerary status in Redux
        const existingMessage = currentChatMessages.find(
          (msg) => msg.isItinerary && (msg.itinerary?.id === itineraryId || msg.itinerary_submit?.id === itineraryId),
        )

        if (existingMessage) {
          // Update the existing message with accepted status
          dispatch(
            updateExistingMessage({
              messageId: existingMessage.id,
              updates: {
                itinerary: {
                  ...existingMessage.itinerary,
                  status: 'accepted'
                },
                itinerary_submit: {
                  ...existingMessage.itinerary_submit,
                  status: 'accepted'
                }
              },
            }),
          )
        }

        // Trigger checkContractStatus API to refresh contract data after itinerary acceptance
        const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
        if (accessToken) {
          const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
          if (chatId) {
            dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
            .then(() => {
              console.log("🔌 Dashboard Expert Chats - Contract status refreshed successfully after itinerary acceptance")
            })
            .catch(error => {
              console.error("🔌 Dashboard Expert Chats - Error refreshing contract status after itinerary acceptance:", error)
            })
          } else {
            console.log("🔌 Dashboard Expert Chats - No chat ID available for checkContractStatus after itinerary acceptance")
          }
        } else {
          console.log("🔌 Dashboard Expert Chats - No access token available for checkContractStatus after itinerary acceptance")
        }
      }
    }

    // Set up WebSocket message listener
    const cleanup = addMessageListener(handleIncomingMessage)
    return cleanup
  }, [addMessageListener, dispatch, session])

  // Debug logging
 

  // Voice message functions are now handled by the chat hook

  // Contract modal handlers - now use contract hook methods
  const handleSendContract = (expert) => {
    contract.handleContractModal(expert)
  }

  const handleContractSubmit = async (contractData) => {
    try {
      await contract.handleContractSubmit(contractData)
    } catch (error) {
      console.error("Contract submission error:", error)
    }
  }

  const handleContractClose = () => {
    contract.handleContractClose()
  }

  // Contract action handlers - now use contract hook methods directly (same as experts page)

  const handleContractPay = async (contractId) => {
    try {
      await contract.handleContractPay(contractId, chat.messages)
    } catch (error) {
      console.error("Error processing payment:", error)
    }
  }

  // Itinerary action handlers - now use itinerary hook methods
  const handleItineraryApprove = async (itineraryId) => {
    try {
      await itinerary.handleItineraryAction(itineraryId, "approve")
    } catch (error) {
      console.error("Error approving itinerary:", error)
    }
  }

  const handleItineraryRequestEdit = async (itineraryId) => {
    try {
      await itinerary.handleItineraryAction(itineraryId, "requestEdit")
    } catch (error) {
      console.error("Error requesting itinerary edit:", error)
    }
  }

  // Message sending is now handled by the chat hook

  // Key press handling is now done by the chat hook

  // File selection is now handled by the chat hook

  // Sticker selection is now handled by the chat hook

  // Expert selection is now handled by the chat hook
  const handleExpertSelect = (expert) => {
   
    // Try multiple possible ID locations - prioritize user.id for API calls (person you're chatting with)
    const chatId = expert.user?.id || expert.chat?.id || expert.id
    
    // Set mobile chat to show when expert is selected
    setShowChatOnMobile(true)
    
    chat.handleOpenChat(expert)
  }

  // Back to list is now handled by the chat hook
  const handleBackToList = () => {
   
    dispatch(getChatHistory({ token: accessToken }))
    // Leave WebSocket chat if connected
    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (chatId && isConnected) {
      leaveChat(chatId)
    }
    
    // Set mobile chat to hide when going back to list
    setShowChatOnMobile(false)
    
    // Clear the current chat from Redux state
    dispatch(clearCurrentChat())
    
    // Fetch chat history again to refresh the list
    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (accessToken) {
      console.log('🔍 Dashboard Expert Chats - Fetching chat history on back button')
      
    } else {
      console.log('🔍 Dashboard Expert Chats - No access token available')
    }
    
    chat.handleCloseChat()
  }

  // Helper function for expert data
  const getExpertData = useCallback((expert) => {
    return {
      id: expert.id,
      name:
        expert.first_name && expert.last_name
          ? `${expert.first_name} ${expert.last_name}`
          : expert.first_name || expert.username,
      image: expert.image || expert.user?.image,
      username: expert.username || expert.user?.username,
      email: expert.email || expert.user?.email,
      about: expert.about_me || expert.about,
      location: expert.location,
      rating: expert.rating,
      price_per_hour: expert.price_per_hour,
      preferred_months: expert.preferred_months,
      specialties: expert.specialties,
      languages: expert.languages,
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AppSidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Show loading until client is ready to prevent hydration issues */}
      {!isClient && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
        </div>
      )}

      {/* Main Layout */}
      {isClient && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-screen">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
            <AppSidebar />
          </div>

          {/* Main Content - Chat Interface */}
          <div className="lg:col-span-10 ">
            {/* Mobile Menu Button */}
            <div className="lg:hidden p-4 border-b border-gray-200">
              <Button
                variant="ghost"
                size="icon"
                className="border border-gray-300"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            {/* Page Header */}
            <div className="p-6 ">
              <h1 className="text-2xl font-bold text-gray-900">Expert Chats</h1>
              {/* Debug Info */}
             
            </div>

            {/* Chat Interface */}
            <div className="flex h-screen bg-gray-50 p-2 sm:p-3">
              {/* Chat List - Hidden on mobile when chat is open */}
              <div
                className={`${isMobile && showChatOnMobile ? "hidden" : "flex"} w-full sm:w-80 lg:w-96 bg-white border mr-2 sm:mr-3 rounded-lg border-gray-200 flex-col`}
              >
                {/* Header */}
                <div className="p-4 border-b border-gray-200">
                  <h1 className="text-xl font-semibold text-gray-900">Chat History</h1>
                </div>

                {/* Search Bar */}
                <div className="p-3 border-b border-gray-200">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 text-sm"
                    />
                  </div>
                </div>

                {/* Chat History Section */}
                <div className="flex-1 overflow-y-auto">
                  {chatHistoryLoading ? (
                    <div className="flex justify-center items-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                    </div>
                  ) : chatHistoryError ? (
                    <div className="text-center py-8">
                      <p className="text-red-500 mb-4">{chatHistoryError}</p>
                      <Button
                        onClick={() => {
                          const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
                          if (accessToken) {
                            dispatch(getChatHistory({ token: accessToken }))
                          }
                        }}
                        className="bg-[#FF385C] hover:bg-[#e23350] text-white"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="space-y-3">
                        {chatHistory
                          .filter((chat) => {
                            const userName = chat.user?.username || chat.user?.first_name || "Unknown User"
                            const lastMessage = chat.chat?.message || ""
                            return (
                              userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
                            )
                          })
                          .map((chat) => (
                            <div
                              key={chat.user?.id || chat.chat?.id}
                              onClick={() => handleExpertSelect(chat)}
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedChat?.user?.id === chat.user?.id
                                  ? "bg-pink-50 border border-pink-200"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="relative">
                                <Image
                                  src={chat.user?.image || "https://randomuser.me/api/portraits/women/1.jpg"}
                                  alt={chat.user?.username || chat.user?.first_name || "Expert"}
                                  width={40}
                                  height={40}
                                  className="rounded-full object-cover"
                                />
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-900 text-sm truncate">
                                  {chat.user?.first_name && chat.user?.last_name
                                    ? `${chat.user.first_name} ${chat.user.last_name}`
                                    : chat.user?.first_name || chat.user?.username || "Unknown Expert"}
                                </h3>
                                <p className="text-xs text-gray-500 truncate">
                                  {chat.chat?.message || "No messages yet"}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {formatRelativeTime(chat.chat?.created_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side - Chat Interface */}
              <div className={`${isMobile && !showChatOnMobile ? "hidden" : "flex"} flex-1 flex-col`}>
                {chat?.showChatInterface && chat?.selectedExpert ? (
                  <ChatInterface
                    selectedExpert={chat.selectedExpert}
                    isConnected={chat.isConnected}
                    messages={chat.messages}
                    chatMessage={chat.chatMessage}
                    selectedFile={chat.selectedFile}
                    showStickers={chat.showStickers}
                    recordingState={chat.recordingState}
                    contractStatusData={contractStatusData}
                    showContract={showContract}
                    onCloseChat={chat.handleCloseChat}
                    onSendMessage={chat.handleSendMessage}
                    onFileSelect={chat.handleFileSelect}
                    onKeyPress={chat.handleKeyPress}
                    onStickerSelect={chat.handleStickerSelect}
                    onStartRecording={chat.startRecording}
                    onStopRecording={chat.stopRecording}
                    onSendVoiceMessage={chat.sendVoiceMessage}
                    onCancelVoiceMessage={chat.cancelVoiceMessage}
                    onContractModal={contract.handleContractModal}
                    onContractAccept={(id) => contract.handleContractAction(id, "accept")}
                    onContractReject={(id) => contract.handleContractAction(id, "reject")}
                    onContractPay={(id) => contract.handleContractPay(id, chat.messages)}
                    onItineraryApprove={(id) => itinerary.handleItineraryAction(id, "approve")}
                    onItineraryRequestEdit={(id) => itinerary.handleItineraryAction(id, "requestEdit")}
                    onChatMessageChange={chat.setChatMessage}
                    formatTime={chat.formatTime}
                    getDisplayName={chat.getDisplayName}
                    getExpertData={getExpertData}
                  />
                ) : selectedChat?.user ? (
                  <>
                    {/* Chat Header */}
                    <div className="bg-white border-b border-gray-200 p-3 sm:p-4 flex items-center justify-between">
                    sadas  <div className="flex items-center gap-2 sm:gap-3">
                        {/* Back Button - Only visible on mobile */}
                        {isMobile && (
                          <Button variant="ghost" size="sm" onClick={handleBackToList} className="mr-1 sm:mr-2">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="relative">
                          <Image
                            src={selectedChat.user?.image || "https://randomuser.me/api/portraits/women/1.jpg"}
                            alt={selectedChat.user?.first_name || "Expert"}
                            width={40}
                            height={40}
                            className="rounded-full object-cover sm:w-12 sm:h-12"
                          />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 sm:w-3 sm:h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                            {selectedChat.user?.first_name && selectedChat.user?.last_name
                              ? `${selectedChat.user.first_name} ${selectedChat.user.last_name}`
                              : selectedChat.user?.first_name || selectedChat.user?.username || "Unknown Expert"}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 truncate">Local Travel Expert</p>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 ml-4">
                          <div className="flex items-center gap-1">
                            <div
                              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
                            ></div>
                            <span className="text-sm text-gray-600">{isConnected ? "Connected" : "Disconnected"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="hidden sm:flex">
                          <Bell className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {/* Desktop: Full button, Mobile: Icon only - Show only if contract is allowed */}
                        {showContract && (
                          <>
                            <div className="hidden sm:block">
                              <Button
                                onClick={() => handleSendContract(selectedChat.user)}
                                className="bg-[#FF385C] hover:bg-[#e23350] text-white px-3 py-2 rounded-lg text-sm font-medium"
                              >
                                Send Contract
                              </Button>
                            </div>
                            <div className="sm:hidden">
                              <Button
                                onClick={() => handleSendContract(selectedChat.user)}
                                className="bg-[#FF385C] hover:bg-[#e23350] text-white p-2 rounded-lg"
                                title="Send Contract"
                              >
                                <TbContract className="w-4 h-4" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50">
                      {currentChatLoading ? (
                        <div className="flex justify-center items-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                        </div>
                      ) : currentChatError ? (
                        <div className="text-center py-8">
                          <p className="text-red-500 mb-4">{currentChatError}</p>
                          <Button
                            onClick={() => {
                              const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
                              const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
                              if (accessToken && chatId) {
                                dispatch(getChatMessages({ token: accessToken, chatId: chatId }))
                              }
                            }}
                            className="bg-[#FF385C] hover:bg-[#e23350] text-white"
                          >
                            Try Again
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {chat.messages.length > 0 ? (
                            Object.entries(groupMessagesByDate(chat.messages)).map(([date, messages]) => (
                              <div key={date}>
                                {/* Date Separator */}
                                <div className="flex justify-center mb-4">
                                  <span className="text-sm text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm">
                                    {formatDate(date)}
                                  </span>
                                </div>

                                {/* Messages for this date */}
                                {messages.map((message, index) => {
                                  // ... existing message rendering logic ...
                                  let messageText = "No message content"
                                  let senderName = "Unknown"
                                  let attachment = null
                                  let createdAt = null
                                  let messageId = null

                                  if (message.chat && typeof message.chat === "object") {
                                    messageText = message.chat.message || "No message content"
                                    senderName = message.chat.sender_name || message.chat.sender?.username || "Unknown"
                                    attachment = message.chat.attachment || null
                                    createdAt = message.chat.created_at || null
                                    messageId = message.chat.id || message.id
                                  } else {
                                    // Handle chat hook message structure
                                    messageText =
                                      message.content || message.message ||
                                      (message.itinerary_submit
                                        ? `Itinerary: ${message.itinerary_submit.title}`
                                        : "No message content")
                                    senderName = message.sender_name || message.sender?.username || "Unknown"
                                    attachment = message.attachment || null
                                    createdAt = message.timestamp || message.created_at || null
                                    messageId = message.id
                                  }

                                  const currentUserNames = [
                                    session?.user?.username,
                                    session?.user?.name,
                                    session?.user?.email,
                                    session?.user?.first_name,
                                    session?.user?.last_name,
                                  ].filter(Boolean)

                                  const isFromCurrentUser = currentUserNames.some(
                                    (name) =>
                                      name &&
                                      (senderName === name || senderName.toLowerCase().includes(name.toLowerCase())),
                                  )

                                  const finalIsOutgoing = isFromCurrentUser

                                  const isContractMessage =
                                    message.isContract ||
                                    message.contract ||
                                    (message.chat && message.chat.contract) ||
                                    (messageText && messageText.includes("Contract"))

                                  const isItineraryMessage =
                                    message.isItinerary ||
                                    message.itinerary ||
                                    message.itinerary_submit ||
                                    (messageText && messageText.includes("Itinerary"))

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
                                            // Use payment URL from stored contract payment URLs if available
                                            payment_url: contract.contractPaymentUrls?.[message.contract?.id || message.id] || 
                                                        message.contract?.payment_url || 
                                                        message.chat?.contract?.payment_url || 
                                                        null,
                                          }}
                                          onAccept={(id) => contract.handleContractAction(id, 'accept', chat.setMessages, chat.refreshChatMessages)}
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
                                              onApprove={handleItineraryApprove}
                                              onRequestEdit={handleItineraryRequestEdit}
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
                                              {formatTime(new Date(createdAt || (isClient ? Date.now() : 0)))}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8">
                              <p className="text-gray-500">No messages yet. Start a conversation!</p>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>

                    {/* Message Input */}
                    <div className="bg-white border-t border-gray-200 p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        {/* File Upload Button */}
                        <label
                          className={`p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                            selectedFile ? "text-pink-500 bg-pink-50" : "text-gray-400"
                          }`}
                        >
                          <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                          <input
                            key={selectedFile ? "file-selected" : "file-empty"}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="image/*,.pdf,.doc,.docx,video/*"
                            onClick={(e) => {
                              e.target.value = ""
                            }}
                          />
                        </label>

                        {/* Sticker Button */}
                        <button
                          onClick={() => setShowStickers(!showStickers)}
                          className={`p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 ${
                            showStickers ? "text-pink-500 bg-pink-50" : "text-gray-400"
                          }`}
                          title="Stickers"
                        >
                          <span className="text-sm sm:text-base">😀</span>
                        </button>

                        <div className="flex-1 relative">
                          <Input
                            type="text"
                            placeholder="Type a message"
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            className="w-full border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 pr-10 sm:pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white"
                          />
                          {/* Microphone Button */}
                          <button
                            onClick={startRecording}
                            disabled={isRecording}
                            className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Voice message"
                          >
                            <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>

                        {/* Send Button */}
                        <button
                          onClick={handleSendMessage}
                          disabled={(!chatMessage.trim() && !selectedFile) || !isConnected}
                          className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:opacity-90 text-white p-2 sm:p-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Send message"
                        >
                          <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>

                      {/* Voice Message Controls */}
                      {isRecording && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                              <span className="text-sm text-red-700">
                                Recording... {Math.floor(recordingTime / 60)}:
                                {(recordingTime % 60).toString().padStart(2, "0")}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={stopRecording}
                                className="px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
                              >
                                Stop
                              </button>
                              <button
                                onClick={cancelVoiceMessage}
                                className="px-3 py-1 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Voice Message Preview */}
                      {audioBlob && !isRecording && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Mic className="w-5 h-5 text-blue-600" />
                              <span className="text-sm text-blue-700">
                                Voice message ({Math.floor(recordingTime / 60)}:
                                {(recordingTime % 60).toString().padStart(2, "0")})
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={sendVoiceMessage}
                                className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                              >
                                Send
                              </button>
                              <button
                                onClick={cancelVoiceMessage}
                                className="px-3 py-1 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sticker Picker */}
                      {showStickers && (
                        <StickerPicker onStickerSelect={handleStickerSelect} onClose={() => setShowStickers(false)} />
                      )}

                      {/* Selected file indicator */}
                      {selectedFile && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                          <Paperclip className="w-4 h-4" />
                          <span>{selectedFile.name}</span>
                          <button onClick={() => setSelectedFile(null)} className="text-red-500 hover:text-red-700">
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500">Select an expert to start chatting</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
        onClose={contract.handleContractClose}
        itineraryData={contract.approvedItineraryData}
        onSubmitFeedback={contract.handleSubmitFeedback}
      />

    </div>
  )
}
