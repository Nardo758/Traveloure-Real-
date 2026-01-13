"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { useWebSocketContext } from '@/components/WebSocketProvider'
import {
  getChatHistory,
  addIncomingMessage,
  setCurrentChat,
  getChatMessages,
  clearCurrentChat,
  addMessageLocally,
  sendMessage,
  updateContractStatus
} from '../../../app/redux-features/chat/chatSlice'
import * as contractActions from '../../../app/redux-features/contract/contractSlice'
import { userProfile } from '../../../app/redux-features/auth/auth'
import { useContract } from '../../../hooks/useContract'
import { Button } from '../../../components/ui/button'
import {
  Search, 
  MessageSquare, 
  Send, 
  Paperclip, 
  Mic, 
  Menu, 
  X,
  FileText,
  Share,
  ArrowLeft,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'
import soundNotificationUtil from '../../../utils/soundNotification'
import { validateMessage } from '../../../utils/messageValidation'

import { Navbar } from '../../../components/help-me-decide/navbar'
import ContractModal from '../../../components/ContractModal'
import ItineraryModal from '../../../components/ItineraryModal'
import ContractMessage from '../../../components/ContractMessage'
import ItineraryMessage from '../../../components/ItineraryMessage'
import { AttachmentDisplay } from '../../../components/AttachmentDisplay'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { Input } from '@/components/ui/input'
import StripeOnboardingModal from '../../../components/StripeOnboardingModal'
import PaymentSuccessModal from '../../../components/PaymentSuccessModal'

export default function LocalExpertChatsPage() {
  const { data: session, status } = useSession()
  const dispatch = useDispatch()
  const contract = useContract()
  
  // Redux state
  const { 
    chatHistory, 
    currentChatMessages, 
    selectedChat, 
    chatHistoryLoading, 
    chatHistoryError 
  } = useSelector((state) => state.chat)

  const { 
    requiresOnboarding, 
    onboardingMessage,
    contractStatusData,
    showContract,
    checkContractStatusLoading
  } = useSelector(state => state.contract)

  // Get profile data for onboarding URL
  const profileData = useSelector((state) => {
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

  // WebSocket context
  const { isConnected, joinChat, sendChatMessage, leaveChat, addMessageListener } = useWebSocketContext()
 
  // Local state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showChatOnMobile, setShowChatOnMobile] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [showContractModal, setShowContractModal] = useState(false)
  const [showItineraryModal, setShowItineraryModal] = useState(false)
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false)
  const [paymentSuccessData, setPaymentSuccessData] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingTimer, setRecordingTimer] = useState(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [soundNotification, setSoundNotification] = useState(true)
  const [recentlySentMessages, setRecentlySentMessages] = useState(new Set())
  const [voiceMessageBlobs, setVoiceMessageBlobs] = useState(new Map())
  const [attachmentFiles, setAttachmentFiles] = useState(new Map())
  
  // Refs
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  
  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Load chat history on mount
  useEffect(() => {
    if (session?.backendData?.accessToken) {
      dispatch(getChatHistory({ token: session.backendData.accessToken }))
    }
  }, [session, dispatch])

  // Load profile data to get onboarding URL
  useEffect(() => {
    if (session?.backendData?.accessToken) {
      dispatch(userProfile({ token: session.backendData.accessToken }))
    }
  }, [session, dispatch])

  // Auto-scroll when messages change
  useEffect(() => {
    console.log('🔌 Local Expert - currentChatMessages changed:', currentChatMessages)
    scrollToBottom()
  }, [currentChatMessages, scrollToBottom])

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimer) {
        clearInterval(recordingTimer)
      }
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop()
      }
    }
  }, [recordingTimer, mediaRecorder])

  // Handle Stripe onboarding requirement
  useEffect(() => {
    if (requiresOnboarding && onboardingMessage) {
      setShowOnboardingModal(true)
    }
  }, [requiresOnboarding, onboardingMessage])

  // WebSocket message handler
  useEffect(() => {
    if (!isConnected) return

    const handleIncomingMessage = (data) => {
      console.log('WebSocket message received:', data.type, data)
      
      if (data.type === 'chat_message' && data.message) {
        // Handle regular chat messages
        const message = data.message
        
        // Check if this is our own message (prevent duplicates)
        const isOurMessage = message.sender?.id === session?.user?.id || 
                            message.sender_id === session?.user?.id ||
                            recentlySentMessages.has(message.message)
        
        if (!isOurMessage) {
          dispatch(addIncomingMessage(message))
          
          if (soundNotification) {
            soundNotificationUtil.play()
          }
        }
      } else if (data.type === 'new_contract' && data.message) {
        // Handle contract messages
        const message = data.message
        const contractData = message.contract || message
        
        // Create contract message
          const contractMessage = {
          id: `${contractData.id}-${Date.now()}`,
          message: `New Contract: ${contractData.contract_title || contractData.title || 'New Contract'}`,
          sender_name: message.sender?.username || 'Traveler',
          receiver_name: message.receiver?.username || 'Local Expert',
          created_at: message.created_at || new Date().toISOString(),
            isContract: true,
            contract: {
            id: contractData.id,
            title: contractData.contract_title || contractData.title,
            amount: contractData.amount,
            description: contractData.description,
            status: contractData.status,
            is_accepted: contractData.is_accepted,
            contract_title: contractData.contract_title || contractData.title,
            sender: {
              id: message.sender?.id,
              username: message.sender?.username
            },
            sender_id: message.sender?.id,
            sender_name: message.sender?.username
          },
          sender: {
            id: message.sender?.id,
            username: message.sender?.username
          },
          sender_id: message.sender?.id,
          type: message.sender?.id === session?.user?.id ? 'sent' : 'received',
          sender: message.sender?.id === session?.user?.id ? 'user' : 'expert'
        }
        
            dispatch(addIncomingMessage(contractMessage))
            
        if (soundNotification) {
              soundNotificationUtil.play()
            }
      } else if (data.type === 'contract_accepted' && data.message) {
        // Handle contract accepted status update
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          // Update contract status in Redux
          dispatch(contractActions.updateContractStatus({
            contractId: contractId,
            status: 'accepted'
          }))
          
          // Update the contract message in current chat messages
          dispatch(updateContractStatus({
            contractId: contractId,
                    status: 'accepted',
                    is_accepted: true,
            payment_url: data.message?.payment_url
          }))
          
          // Refresh chat history to get updated payment link from backend
          const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
          if (accessToken) {
            console.log('🔌 Local Expert - Contract accepted, refreshing chat history for payment link')
            dispatch(getChatHistory({ token: accessToken }))
              .then((result) => {
                console.log('🔌 Local Expert - Chat history refreshed after contract acceptance:', result.payload)
              })
              .catch((error) => {
                console.error('🔌 Local Expert - Error refreshing chat history after contract acceptance:', error)
              })
          }
          
          if (soundNotification) {
            soundNotificationUtil.play()
          }
        }
      } else if (data.type === 'contract_rejected' && data.message) {
        // Handle contract rejected status update
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          // Update contract status in Redux
          dispatch(contractActions.updateContractStatus({
            contractId: contractId,
            status: 'rejected'
          }))
          
          // Update the contract message in current chat messages
          dispatch(updateContractStatus({
            contractId: contractId,
                    status: 'rejected',
                    is_accepted: false
          }))
          
          if (soundNotification) {
                soundNotificationUtil.play()
              }
        }
      } else if (data.type === 'contract_payment_success' && data.message) {
        // Handle contract payment success
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          console.log('🔌 Local Expert - Payment success received:', data.message)
          
          // Update contract status in Redux
          dispatch(contractActions.updateContractStatus({
            contractId: contractId,
            status: 'paid'
          }))
          
          // Update the contract message in current chat messages
          dispatch(updateContractStatus({
            contractId: contractId,
            status: 'paid',
            is_accepted: true,
            is_paid: true,
            payment_url: data.message.payment_url
          }))
          
          // Play sound notification for payment success
          if (soundNotification) {
              soundNotificationUtil.play()
            }
          
          // Show payment success modal
          setPaymentSuccessData({
            itineraryTitle: data.message.itinerary_title || 'Your Itinerary',
            expertName: selectedChat?.user?.first_name || selectedChat?.user?.username || 'Local Expert',
            contractId: contractId,
            paymentAmount: data.message.amount || data.message.payment_amount
          })
          setShowPaymentSuccessModal(true)
          
          // Trigger checkContractStatus API to refresh contract data and update button
          const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
          if (accessToken) {
            const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
            if (chatId) {
              console.log('🔌 Local Expert - Refreshing contract status after payment success')
            
            // Add a small delay to ensure backend has processed the payment
            setTimeout(() => {
                dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
                .then((result) => {
                    console.log('🔌 Local Expert - Contract status refreshed:', result.payload)
                 
                  // If show_itinerary is still false, try again after another delay
                  if (result.payload?.show_itinerary === false) {
                      console.log('🔌 Local Expert - show_itinerary is false, retrying...')
                    setTimeout(() => {
                        dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
                        .then((retryResult) => {
                            console.log('🔌 Local Expert - Retry result:', retryResult.payload)
                        })
                          .catch((error) => {
                            console.error('🔌 Local Expert - Retry failed:', error)
                        })
                    }, 2000)
                  }
                })
                  .catch((error) => {
                    console.error('🔌 Local Expert - Error refreshing contract status:', error)
                })
            }, 1000) // 1 second delay to ensure backend processing
          } else {
              console.log('🔌 Local Expert - No chat ID available for checkContractStatus')
            }
          } else {
            console.log('🔌 Local Expert - No access token available for checkContractStatus')
          }
        }
      } else if (data.type === 'submit_itinerary_accepted' && data.message) {
        // Handle itinerary accepted - change button back to "Send Contract"
        console.log('🔌 Local Expert - Itinerary accepted received:', data.message)
        
        const itineraryId = data.message.id || data.message.itinerary_id
        
        // Update itinerary status in current chat messages
        if (itineraryId) {
          dispatch({
            type: 'chat/updateItineraryStatus',
            payload: {
              itineraryId: itineraryId,
              status: 'approved'
            }
          })
        }
        
        const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
        const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
        
        if (chatId && accessToken) {
          // Trigger checkContractStatus API to refresh contract data and update button
          setTimeout(() => {
            dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
            .then((result) => {
              console.log('🔌 Local Expert - Contract status refreshed after itinerary accepted:', result.payload)
            })
            .catch((error) => {
              console.error('🔌 Local Expert - Error refreshing contract status after itinerary accepted:', error)
            })
          }, 1000) // 1 second delay to ensure backend processing
        }
        
        if (soundNotification) {
          soundNotificationUtil.play()
        }
      } else if (data.type === 'submit_itinerary_rejected' && data.message) {
        // Handle itinerary rejected status update
        console.log('🔌 Local Expert - Itinerary rejected received:', data.message)
        
        const itineraryId = data.message.id || data.message.itinerary_id
        
        // Update itinerary status in current chat messages
        if (itineraryId) {
          dispatch({
            type: 'chat/updateItineraryStatus',
            payload: {
              itineraryId: itineraryId,
              status: 'rejected'
            }
          })
        }
        
        if (soundNotification) {
          soundNotificationUtil.play()
        }
      } else if (data.type === 'new_submit_itinerary' && data.message) {
        // Handle new itinerary submission from WebSocket
        console.log('🔌 Local Expert - New itinerary received:', data.message)
          
          const itineraryData = data.message.itinerary_submit
          const itineraryId = itineraryData.id || data.message.id
          
        // Check if this itinerary is from the current user (local expert)
        const isFromCurrentUser = data.message.sender?.id === session?.user?.id ||
                                 data.message.sender_id === session?.user?.id
        
        console.log('🔌 Local Expert - WebSocket Itinerary Debug:', {
          messageSenderId: data.message.sender?.id,
          messageSenderIdAlt: data.message.sender_id,
          currentUserId: session?.user?.id,
          isFromCurrentUser,
          messageSender: data.message.sender
        })
        
          const uniqueItineraryMessageId = `${itineraryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          
        // For local expert panel, if we're sending an itinerary, it should always be on the right
        // Check if this is a local expert sending itinerary (not receiving from traveler)
        const isLocalExpertSending = isFromCurrentUser || 
                                   (data.message.sender?.username && data.message.sender?.username === session?.user?.username) ||
                                   (data.message.sender_id && data.message.sender_id === session?.user?.id)
        
          const itineraryMessage = {
            id: uniqueItineraryMessageId,
          type: isLocalExpertSending ? 'sent' : 'received',
          content: `Itinerary Submitted: ${itineraryData.title || 'New Itinerary'}`,
          timestamp: data.message.created_at || new Date().toISOString(),
            created_at: data.message.created_at || new Date().toISOString(),
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
            sender: data.message.sender,
            sender_id: data.message.sender?.id || data.message.sender_id
          },
          sender: isLocalExpertSending ? 'user' : 'expert',
          sender_id: data.message.sender?.id || data.message.sender_id,
          sender_name: data.message.sender?.username
        }
        
        console.log('🔌 Local Expert - Processed itinerary message:', {
          itineraryMessage,
          isFromCurrentUser,
          isLocalExpertSending,
          currentUserId: session?.user?.id,
          messageSenderId: data.message.sender?.id || data.message.sender_id
        })
        
        // Add to Redux state
        dispatch(addIncomingMessage(itineraryMessage))
        
        // Reload chat messages to ensure correct positioning
        if (isLocalExpertSending && selectedChat) {
          console.log('🔌 Local Expert - Reloading chat messages after itinerary submission')
          setTimeout(() => {
            handleChatSelect(selectedChat)
          }, 500) // Small delay to ensure WebSocket message is processed
        }
        
        if (soundNotification && !isFromCurrentUser) {
          soundNotificationUtil.play()
        }
      }
    }

    const removeListener = addMessageListener(handleIncomingMessage)
    return () => removeListener()
  }, [isConnected, addMessageListener, dispatch, session, recentlySentMessages, soundNotification, selectedChat])

  // Handle chat selection - Copy logic from expert page
  const handleChatSelect = useCallback(async (chat) => {
    if (!session?.backendData?.accessToken) return

    try {
      // Set current chat
      dispatch(setCurrentChat(chat))
      
      // Join WebSocket room
      const chatId = chat.user?.id || chat.chat?.id || chat.id
      console.log('🔌 Local Expert - Chat selected:', { chat, chatId })
      
      if (chatId) {
        joinChat(chatId)
      }
      
      // Load chat messages using direct fetch like expert page
      console.log('🔌 Local Expert - Loading chat messages for chatId:', chatId)
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
      const response = await fetch(`${apiBaseUrl}/ai/chats/${chatId}/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.backendData.accessToken}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        const apiMessages = data.data || data || []
        
        console.log('🔌 Local Expert - API Response:', { data, apiMessages })
        
        const currentUserName = session?.user?.name || session?.user?.username
        const currentUserId = session?.user?.id
        const currentUserIdentifiers = [
          session?.user?.username,
          session?.user?.name,
          session?.user?.email,
          session?.user?.first_name,
          session?.user?.last_name,
        ].filter(Boolean)

        const convertedMessages = apiMessages
          .map((msg) => {
            const isFromCurrentUser =
              msg.sender?.username === currentUserName ||
              msg.sender?.id === currentUserId ||
              currentUserIdentifiers.includes(msg.sender?.username)
          
            return {
              id: msg.id,
              type: isFromCurrentUser ? "sent" : "received",
              content:
                msg.message ||
                (msg.itinerary_submit ? `Itinerary: ${msg.itinerary_submit.title}` : "No message content"),
              attachment: msg.attachment,
              timestamp: msg.created_at,
              sender: isFromCurrentUser ? "user" : "expert",
              isVoiceMessage: msg.message?.startsWith("Voice message ("),
              isContract: msg.contract || msg.message?.includes("Contract"),
              contract: msg.contract,
              isItinerary: msg.itinerary_submit || msg.itinerary,
              itinerary: msg.itinerary_submit || msg.itinerary,
              // Add fields for compatibility with Redux state
              message: msg.message,
              created_at: msg.created_at,
              sender_id: msg.sender?.id,
              sender_name: msg.sender?.username
            }
          })
          .sort((a, b) => {
            const dateA = new Date(a.timestamp || 0)
            const dateB = new Date(b.timestamp || 0)
            return dateA - dateB
          })

        console.log('🔌 Local Expert - Converted messages:', convertedMessages)
        
        // Update Redux state with converted messages
        dispatch({
          type: 'chat/getChatMessages/fulfilled',
          payload: { chatId, messages: convertedMessages }
        })
        
        if (convertedMessages.length === 0) {
          const welcomeMessage = {
            id: "welcome",
            type: "received",
            content: `Hi! I'm ${chat.user?.first_name || chat.user?.username || 'Traveler'}, your travel companion. How can I help you with your trip?`,
            timestamp: new Date().toISOString(),
            sender: "expert",
            message: `Hi! I'm ${chat.user?.first_name || chat.user?.username || 'Traveler'}, your travel companion. How can I help you with your trip?`,
            created_at: new Date().toISOString()
          }
          
          dispatch({
            type: 'chat/getChatMessages/fulfilled',
            payload: { chatId, messages: [welcomeMessage] }
          })
        }
      } else {
        console.error('🔌 Local Expert - Failed to load messages:', response.status, response.statusText)
        toast.error('Failed to load chat messages')
      }
      
      // Check contract status
      dispatch(contractActions.checkContractStatus({ 
        token: session.backendData.accessToken, 
        withChat: chatId 
      }))
      
      // Show chat on mobile
      setShowChatOnMobile(true)
      
    } catch (error) {
      console.error('Error selecting chat:', error)
      toast.error('Failed to load chat')
    }
  }, [session, dispatch, joinChat])

  // Handle itinerary submit
  const handleItinerarySubmit = useCallback(async (formData) => {
    if (!session?.backendData?.accessToken) {
      toast.error('Authentication required')
        return
    }

    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (!chatId) {
      toast.error('No active chat')
      return
    }

    try {
      const response = await fetch('/api/ai/submit-itinerary', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.backendData.accessToken}`
        },
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit itinerary')
      }

      if (result.success && result.data) {
        // Add itinerary message locally
        const itineraryMessage = {
          id: result.data.id || Date.now().toString(),
          message: 'Itinerary submitted',
          sender_name: session?.user?.name || 'Local Expert',
          receiver_name: selectedChat.user?.username,
          created_at: new Date().toISOString(),
          isItinerary: true,
          itinerary: {
            ...result.data,
            title: result.data.title || 'Custom Itinerary',
            description: result.data.description || 'Your custom itinerary has been prepared based on your trip details and preferences.',
            location: result.data.location || 'Destination',
            status: 'pending',
            attachment: result.data.attachment,
            sender: {
              id: session?.user?.id,
              username: session?.user?.username,
              first_name: session?.user?.name
            },
            receiver: {
              id: selectedChat.user?.id,
              username: selectedChat.user?.username,
              first_name: selectedChat.user?.first_name
            },
            sender_id: session?.user?.id,
            sender_name: session?.user?.name || session?.user?.username
          },
          sender: {
            id: session?.user?.id,
            username: session?.user?.username
          },
          sender_id: session?.user?.id,
          type: 'sent',
          sender: 'user'
        }
        
        dispatch(addIncomingMessage(itineraryMessage))
        setShowItineraryModal(false)
        toast.success('Itinerary submitted successfully')
      }
    } catch (error) {
      console.error('Itinerary submit error:', error)
      toast.error(error.message || 'Failed to submit itinerary')
    }
  }, [session, selectedChat, dispatch])

  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm',
        'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/m4a', 'audio/aac'
      ]
      
      if (!allowedTypes.includes(file.type)) {
        toast.error('File type not supported')
        e.target.value = ''
        return
      }
      
      // Validate file size (60MB limit)
      if (file.size > 60 * 1024 * 1024) {
        toast.error('File size too large. Maximum 60MB allowed.')
        e.target.value = ''
        return
      }
      
      setSelectedFile(file)
    }
  }, [])

  // Voice recording handlers
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []

      recorder.ondataavailable = (event) => {
        chunks.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" })
        setAudioBlob(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      setRecordingTime(0)

      const timer = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
      setRecordingTimer(timer)

      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop()
          setIsRecording(false)
          clearInterval(timer)
        }
      }, 60000)
    } catch (error) {
      console.error("Error starting recording:", error)
      toast.error("Could not start recording. Please check microphone permissions.")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
    }
    setIsRecording(false)
    if (recordingTimer) {
      clearInterval(recordingTimer)
      setRecordingTimer(null)
    }
  }, [mediaRecorder, recordingTimer])

  const sendVoiceMessage = useCallback(async () => {
    if (!audioBlob) return
    if (!session?.backendData?.accessToken) {
      toast.error('Authentication required')
      return
    }

    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (!chatId) {
      toast.error('No active chat')
      return
    }

    try {
      // Add voice message locally first (optimistic update)
      const localMessageId = Date.now().toString()
      const voiceDuration = Math.floor(recordingTime / 60) + ':' + (recordingTime % 60).toString().padStart(2, '0')
      
      // Store the Blob separately for playback
      setVoiceMessageBlobs(prev => new Map(prev.set(localMessageId, audioBlob)))
      
      // Convert Blob to serializable format for Redux
      const serializableAttachment = {
        name: `voice-message-${Date.now()}.wav`,
        size: audioBlob.size,
        type: audioBlob.type || 'audio/wav',
        lastModified: Date.now(),
        isVoiceMessage: true,
        blobId: localMessageId // Reference to the stored blob
      }
      
      dispatch(addMessageLocally({
        chatId: chatId,
        message: `Voice message (${voiceDuration})`,
        isOutgoing: true,
        messageId: localMessageId,
        attachment: serializableAttachment,
        senderName: session?.user?.name || 'Local Expert',
        receiverName: selectedChat.user?.username,
        currentUserId: session?.user?.id
      }))

      // Send voice message via API
      await dispatch(sendMessage({
        token: session.backendData.accessToken,
        chatId: chatId,
        message: `Voice message (${voiceDuration})`,
        attachment: audioBlob
      })).unwrap()

      // Clear voice message state
      setAudioBlob(null)
      setRecordingTime(0)
      setIsRecording(false)
      
      // Clean up the stored blob after a delay (to allow for playback)
      setTimeout(() => {
        setVoiceMessageBlobs(prev => {
          const newMap = new Map(prev)
          newMap.delete(localMessageId)
          return newMap
        })
      }, 30000) // Keep for 30 seconds
      
      toast.success('Voice message sent')
    } catch (error) {
      console.error('Error sending voice message:', error)
      toast.error('Failed to send voice message')
    }
  }, [audioBlob, session, selectedChat, dispatch, recordingTime])

  const cancelVoiceMessage = useCallback(() => {
    setAudioBlob(null)
    setRecordingTime(0)
    setIsRecording(false)
    if (recordingTimer) {
      clearInterval(recordingTimer)
      setRecordingTimer(null)
    }
  }, [recordingTimer])

  // Handle send message
  const handleSendMessage = useCallback(async () => {
    if (!chatMessage.trim() && !selectedFile && !audioBlob) return
    if (!session?.backendData?.accessToken) {
      toast.error('Authentication required')
      return
    }

    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (!chatId) {
      toast.error('No active chat')
      return
    }

    const messageText = chatMessage.trim()

    try {
      // Validate message if it contains text
      if (messageText) {
        const validation = await validateMessage(messageText, session.backendData.accessToken)
        if (!validation.isValid) {
          toast.error(validation.reason || 'Message contains inappropriate content')
          return
        }
      }

      // Add message locally first (optimistic update)
      const localMessageId = Date.now().toString()
      
      // Store the File object separately for display
      if (selectedFile) {
        setAttachmentFiles(prev => new Map(prev.set(localMessageId, selectedFile)))
      }
      
      // Convert File object to serializable format
      const serializableAttachment = selectedFile ? {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        lastModified: selectedFile.lastModified,
        fileId: localMessageId // Reference to the stored file
      } : null
      
      dispatch(addMessageLocally({
        chatId: chatId,
        message: messageText,
        isOutgoing: true,
        messageId: localMessageId,
        attachment: serializableAttachment,
        senderName: session?.user?.name || 'Local Expert',
        receiverName: selectedChat.user?.username,
        currentUserId: session?.user?.id
      }))

      // Track this message to prevent duplicates
      if (messageText) {
      setRecentlySentMessages(prev => new Set([...prev, messageText]))
      }

      // Clear input
      setChatMessage("")
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Send message via API
        await dispatch(sendMessage({
        token: session.backendData.accessToken,
          chatId: chatId,
          message: messageText,
          attachment: selectedFile
        })).unwrap()

      // Clean up tracking after 10 seconds
      if (messageText) {
      setTimeout(() => {
        setRecentlySentMessages(prev => {
          const newSet = new Set(prev)
          newSet.delete(messageText)
          return newSet
        })
        }, 10000)
      }
      
      // Clean up stored file after a delay (to allow for display)
      if (selectedFile) {
        setTimeout(() => {
          setAttachmentFiles(prev => {
            const newMap = new Map(prev)
            newMap.delete(localMessageId)
            return newMap
          })
        }, 30000) // Keep for 30 seconds
      }
      
    } catch (error) {
      console.error('Send message error:', error)
      toast.error(error.message || 'Failed to send message')
    }
  }, [chatMessage, selectedFile, session, selectedChat, dispatch])

  // Handle contract submit
  const handleContractSubmit = useCallback(async (contractData) => {
    if (!session?.backendData?.accessToken) {
      toast.error('Authentication required')
          return
        }
        
    const chatId = selectedChat?.user?.id || selectedChat?.chat?.id || selectedChat?.id
    if (!chatId) {
      toast.error('No active chat')
          return
        }
        
    try {
      const result = await dispatch(contractActions.sendContract({
        token: session.backendData.accessToken,
        chatId: chatId,
        contractData: contractData
      })).unwrap()

      if (result && result.data) {
        // Add contract message locally
        const contractMessage = {
          id: result.data.id || Date.now().toString(),
          message: 'Contract sent',
          sender_name: session?.user?.name || 'Local Expert',
          receiver_name: selectedChat.user?.username,
          created_at: new Date().toISOString(),
          isContract: true,
          contract: {
            ...result.data,
            sender: {
              id: session?.user?.id,
              username: session?.user?.username
            },
            sender_id: session?.user?.id,
            sender_name: session?.user?.name || session?.user?.username
          },
          sender: {
            id: session?.user?.id,
            username: session?.user?.username
          },
          sender_id: session?.user?.id,
          type: 'sent',
          sender: 'user'
        }
        
        dispatch(addIncomingMessage(contractMessage))
        setShowContractModal(false)
        toast.success('Contract sent successfully')
      }
    } catch (error) {
      console.error('Contract submit error:', error)
      
      // Check if error is related to Stripe onboarding
      if (error?.message?.includes('onboarding') || 
          error?.message?.includes('stripe') || 
          error?.message?.includes('account') ||
          error?.status === 400 && error?.data?.message?.includes('onboarding') ||
          profileData?.onboarding_url) {
        setShowOnboardingModal(true)
        toast.error('Stripe account setup required')
      } else {
        toast.error(error.message || 'Failed to send contract')
      }
    }
  }, [session, selectedChat, dispatch, profileData])

  // Handle contract actions
  const handleContractAccept = useCallback(async (contractId) => {
    if (!session?.backendData?.accessToken) return
    
    try {
      // Update local state immediately for optimistic UI
      dispatch(updateContractStatus({
        contractId: contractId,
        status: 'accepted',
        is_accepted: true
      }))
      
      const result = await dispatch(contractActions.acceptContract({
        token: session.backendData.accessToken,
        contractId: contractId
      })).unwrap()
      
      // Update with payment URL if available
      if (result.data && result.data.payment_url) {
        dispatch(updateContractStatus({
          contractId: contractId,
          status: 'accepted',
          is_accepted: true,
          payment_url: result.data.payment_url
        }))
      }
      
      toast.success('Contract accepted')
    } catch (error) {
      console.error('Contract accept error:', error)
      // Revert optimistic update on error
      dispatch(updateContractStatus({
        contractId: contractId,
        status: 'pending',
        is_accepted: false
      }))
      
      // Check if error is related to Stripe onboarding
      if (error?.message?.includes('onboarding') || 
          error?.message?.includes('stripe') || 
          error?.message?.includes('account') ||
          error?.status === 400 && error?.data?.message?.includes('onboarding') ||
          profileData?.onboarding_url) {
        setShowOnboardingModal(true)
        toast.error('Stripe account setup required')
      } else {
        toast.error('Failed to accept contract')
      }
    }
  }, [session, dispatch, profileData])

  const handleContractReject = useCallback(async (contractId) => {
    if (!session?.backendData?.accessToken) return
    
    try {
      // Update local state immediately for optimistic UI
      dispatch(updateContractStatus({
        contractId: contractId,
        status: 'rejected',
        is_accepted: false
      }))
      
      await dispatch(contractActions.rejectContract({
        token: session.backendData.accessToken,
        contractId: contractId
      })).unwrap()
      
      toast.success('Contract rejected')
    } catch (error) {
      console.error('Contract reject error:', error)
      // Revert optimistic update on error
      dispatch(updateContractStatus({
        contractId: contractId,
        status: 'pending',
        is_accepted: false
      }))
      
      // Check if error is related to Stripe onboarding
      if (error?.message?.includes('onboarding') || 
          error?.message?.includes('stripe') || 
          error?.message?.includes('account') ||
          error?.status === 400 && error?.data?.message?.includes('onboarding') ||
          profileData?.onboarding_url) {
        setShowOnboardingModal(true)
        toast.error('Stripe account setup required')
      } else {
        toast.error('Failed to reject contract')
      }
    }
  }, [session, dispatch, profileData])

  const handleContractPay = useCallback(async (contractId) => {
    try {
      // Reuse shared contract hook logic to open any available payment URL
      await contract.handleContractPay(contractId, currentChatMessages)
    } catch (error) {
      console.error('Contract pay error:', error)
      toast.error('Failed to process payment')
    }
  }, [contract, currentChatMessages])

  // Filter chats based on search
  const filteredChats = chatHistory.filter(chat => {
    const userName = chat.user?.first_name && chat.user?.last_name
      ? `${chat.user.first_name} ${chat.user.last_name}`
      : chat.user?.first_name || chat.user?.username || 'Unknown Expert'
    
    return userName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Format time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  // Determine message direction
  const isOutgoingMessage = (message) => {
    // Check if this is a contract message
    if (message.isContract || message.contract) {
      const contractSenderId = message.contract?.sender?.id || 
                              message.contract?.sender_id || 
                              message.sender_id
      return contractSenderId === session?.user?.id
    }
    
    // Check if this is an itinerary message
    if (message.isItinerary || message.itinerary) {
      // Check multiple possible sender identifiers
      const messageSenderId = message.sender?.id || 
                             message.sender_id || 
                             message.itinerary?.sender?.id || 
                             message.itinerary?.sender_id
      
      const isFromCurrentUser = messageSenderId === session?.user?.id ||
                               message.sender === 'user' ||
                               message.type === 'sent'
      
      // For local expert panel, prioritize type and sender fields from WebSocket
      const isLocalExpertMessage = message.type === 'sent' || 
                                  message.sender === 'user' ||
                                  (messageSenderId === session?.user?.id)
      
      console.log('🔌 Itinerary Message Debug:', {
        messageId: message.id,
        messageSenderId,
        currentUserId: session?.user?.id,
        messageSender: message.sender,
        messageType: message.type,
        isFromCurrentUser,
        isLocalExpertMessage
      })
      
      return isLocalExpertMessage
    }
    
    // Regular message
    return message.sender?.id === session?.user?.id || 
           message.sender === 'user' || 
           message.type === 'sent'
  }

  if (status === 'loading') {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  if (!session) {
    return <div className="flex items-center justify-center h-screen">Please log in</div>
  }

    return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Navbar */}
      <Navbar />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local Expert Sidebar */}
        <LocalExpertSidebar 
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile Menu Toggle Button - Only visible on mobile */}
          <div className="lg:hidden absolute top-4 right-4 z-30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-white shadow-md"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Chat Interface */}
          <div className="flex flex-1 overflow-hidden">
            {/* Chat List Sidebar */}
            <div className={`${showChatOnMobile ? 'hidden lg:flex' : 'flex'} flex-col w-full sm:w-80 lg:w-96 xl:w-96 bg-white border-r border-gray-200 shadow-sm`}>
              {/* Chat List Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-xl font-semibold text-gray-900">Traveler Chats</h1>
                  <Button 
                    onClick={() => {
                      if (session?.backendData?.accessToken) {
                        dispatch(getChatHistory({ token: session.backendData.accessToken }))
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="text-gray-600 border-gray-300 hover:bg-gray-50"
                    disabled={chatHistoryLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${chatHistoryLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
              </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                type="text"
                    placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
              />
            </div>
            </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {chatHistoryLoading ? (
                  <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
              </div>
                ) : filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-500 space-y-3">
                    <p>No chats found</p>
              </div>
                ) : (
                  filteredChats.map((chat) => {
                    // Debug selection logic
                    const chatId = chat.id || chat.user?.id
                    const selectedId = selectedChat?.id || selectedChat?.user?.id
                    const isSelected = selectedId === chatId
                    
                    // Get last message text
                    let lastMessageText = 'No messages yet'
                    if (chat.last_message) {
                      // Handle different message types
                      if (typeof chat.last_message === 'string') {
                        lastMessageText = chat.last_message
                      } else if (chat.last_message.content) {
                        lastMessageText = chat.last_message.content
                      } else if (chat.last_message.text) {
                        lastMessageText = chat.last_message.text
                      } else if (chat.last_message.contract) {
                        lastMessageText = 'Contract sent'
                      } else if (chat.last_message.isItinerary) {
                        lastMessageText = 'Itinerary shared'
                      } else if (chat.last_message.message) {
                        lastMessageText = chat.last_message.message
                      }
                    }
                    
                    // Get unread count - check if chat has unread_count field or calculate from messages
                    const unreadCount = chat.unread_count || chat.unread_messages_count || 0
                    const hasUnread = unreadCount > 0
                    
                    console.log('Chat selection debug:', {
                      chatId,
                      selectedId,
                      isSelected,
                      chat: chat.user?.username,
                      selectedChat: selectedChat?.user?.username,
                      lastMessage: chat.last_message,
                      lastMessageText,
                      unreadCount
                    })
                    
                    return (
                    <div
                      key={chat.id || chat.user?.id || `chat-${Math.random()}`}
                      onClick={() => handleChatSelect(chat)}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-blue-50 border-blue-200 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                          {chat.user?.first_name?.charAt(0) || chat.user?.username?.charAt(0) || 'U'}
                          {/* Unread indicator dot */}
                          {hasUnread && !isSelected && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                              {unreadCount > 9 ? (
                                <span className="text-[8px] font-bold text-white">9+</span>
                              ) : (
                                <span className="text-[8px] font-bold text-white">{unreadCount}</span>
                              )}
                            </span>
                          )}
                    </div>
                    <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate flex items-center gap-2">
                            <span>
                              {chat.user?.first_name && chat.user?.last_name
                                ? `${chat.user.first_name} ${chat.user.last_name}`
                                : chat.user?.first_name || chat.user?.username || "Unknown Expert"}
                            </span>
                            {/* Unread dot indicator on name */}
                            {hasUnread && !isSelected && (
                              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>
                            )}
                        </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {lastMessageText}
                      </p>
                    </div>
                        <div className="text-xs text-gray-400 flex flex-col items-end gap-1">
                          {formatTime(chat.updated_at)}
                          {hasUnread && !isSelected && (
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          )}
                  </div>
              </div>
              </div>
                    )
                  })
            )}
          </div>
        </div>

        {/* Chat Interface */}
          {selectedChat ? (
              <div className={`${showChatOnMobile ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-gray-50`}>
              {/* Chat Header */}
                <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
            <Button
                      onClick={() => setShowChatOnMobile(false)} 
                      className="lg:hidden text-black bg-white    shadow-md"
                  >
                    <X className="h-5 w-5 " />
            </Button>
                    {/* <Button 
                      onClick={() => {
                        dispatch(clearCurrentChat())
                        setShowChatOnMobile(false)
                      }} 
                      className="hidden lg:flex text-black bg-white shadow-md"
                      title="Back to chat list"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    </Button> */}
                    <div className="w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {selectedChat.user?.first_name?.charAt(0) || selectedChat.user?.username?.charAt(0) || 'U'}
                    </div>
                  <div>
                      <h3 className="font-semibold text-gray-900">
                        {selectedChat.user?.first_name && selectedChat.user?.last_name
                          ? `${selectedChat.user.first_name} ${selectedChat.user.last_name}`
                          : selectedChat.user?.first_name || selectedChat.user?.username || "Unknown Expert"}
                    </h3>
                      <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-600'} hidden sm:inline`}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    {/* Send Contract Button - Desktop */}
                    {showContract && (
                      <div key="contract-desktop" className="hidden sm:block">
                    <Button 
                      onClick={() => setShowContractModal(true)}
                          disabled={checkContractStatusLoading}
                          className="bg-[#FF385C] hover:bg-[#FF385C]"
                    >
                          <FileText className="w-4 h-4 mr-2" />
                          {checkContractStatusLoading ? 'Checking...' : 'Send Contract'}
                    </Button>
                      </div>
                    )}
                    {/* Send Contract Button - Mobile */}
                    {showContract && (
                      <div key="contract-mobile" className="sm:hidden">
                    <Button 
                          onClick={() => setShowContractModal(true)} 
                          title="Send Contract"
                          disabled={checkContractStatusLoading}
                          className="bg-[#FF385C] hover:bg-[#FF385C]"
                    >
                          <FileText className="w-4 h-4" />
                    </Button>
                      </div>
                    )}
                    {/* Send Itinerary Button - Desktop */}
                    {contractStatusData?.show_itinerary && (
                      <div key="itinerary-desktop" className="hidden sm:block">
                        <Button 
                          onClick={() => setShowItineraryModal(true)}
                          className="bg-[#FF385C] hover:bg-[#FF385C]"
                        >
                          <Share className="w-4 h-4 mr-2" />
                          Send Itinerary
                        </Button>
                      </div>
                    )}
                    {/* Send Itinerary Button - Mobile */}
                    {contractStatusData?.show_itinerary && (
                      <div key="itinerary-mobile" className="sm:hidden">
                        <Button 
                          onClick={() => setShowItineraryModal(true)}
                          title="Send Itinerary"
                          className="bg-[#FF385C] hover:bg-[#FF385C]"
                        >
                          <Share className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                </div>
              </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {currentChatMessages?.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No messages yet. Start the conversation!
                        </div>
                  ) : (
                    currentChatMessages?.map((message, index) => {
                      const isOutgoing = isOutgoingMessage(message)
                          
                          return (
                        <div key={message.id || `message-${index}`} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[65%] lg:max-w-[60%] ${isOutgoing ? 'text-right' : 'text-left'}`}>
                            {message.isContract ? (
                                (() => {
                                  const contractData = {
                                  ...(message.contract || message),
                                    // Map API contract data to expected format
                                  title: message.contract?.contract_title || message.contract_title || message.contract?.title,
                                    status: message.contract?.status || null,
                                    is_accepted: message.contract?.is_accepted || false,
                                    is_paid: message.contract?.is_paid || false,
                                    // Use payment URL from stored contract payment URLs if available
                                    payment_url: contract.contractPaymentUrls?.[message.contract?.id || message.id] || 
                                                message.contract?.payment_url || 
                                                null
                                  }
                                  
                                  console.log('🔌 Local Expert - ContractMessage data:', {
                                    messageId: message.id,
                                    contractId: message.contract?.id,
                                    contractPaymentUrls: contract.contractPaymentUrls,
                                    payment_url_from_contractPaymentUrls: contract.contractPaymentUrls?.[message.contract?.id || message.id],
                                    payment_url_from_message: message.contract?.payment_url,
                                    final_payment_url: contractData.payment_url,
                                    contractData: contractData
                                  })
                                  
                                  return (
                                    <ContractMessage
                                      key={`contract-${message.id || message.contract?.id || index}`}
                                      contract={contractData}
                                      onAccept={handleContractAccept}
                                      onReject={handleContractReject}
                                      onPay={handleContractPay}
                                      isOwnMessage={isOutgoing}
                                    />
                                  )
                                })()
                            ) : message.isItinerary ? (
                                    <ItineraryMessage
                                key={`itinerary-${message.id || message.itinerary?.id || index}`}
                                itinerary={message.itinerary}
                                isOwnMessage={isOutgoing}
                              />
                            ) : (
                                    <div className={`rounded-lg px-3 py-2 shadow-sm ${
                                isOutgoing
                                        ? 'bg-gradient-to-r from-[#F30131] to-[#BE35EB] text-white' 
                                        : 'bg-white border border-gray-200'
                                    }`}>
                                <p className="text-sm break-words">{message.message}</p>
                                      
                                {message.attachment && (
                                      <AttachmentDisplay
                                        key={`attachment-${message.id || 'attachment'}-${index}`}
                                        message={message}
                                        attachment={message.attachment}
                                        voiceMessageBlobs={voiceMessageBlobs}
                                        attachmentFiles={attachmentFiles}
                                      />
                                )}
                                    </div>
                            )}
                                    
                            <div className={`text-xs text-gray-500 mt-1 ${isOutgoing ? 'text-right' : 'text-left'}`}>
                              {formatTime(message.created_at)}
                                    </div>
                                  </div>
                            </div>
                          )
                    })
                  )}
                    <div ref={messagesEndRef} />
              </div>

                {/* Message Input */}
                <div className="bg-white border-t border-gray-200 p-4">
                  <div className="flex items-end space-x-2">
                    {/* File Input */}
                  <input
                      key="file-input"
                      ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    />
                    
                    {/* File Button */}
                  <Button
                      key="file-button"
                      onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="sm"
                      className="p-2"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                    {/* Selected File Display */}
                    {selectedFile && (
                      <div key="selected-file-display" className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-600 truncate max-w-32">
                          {selectedFile.name}
                        </span>
                        <Button
                          onClick={() => {
                            setSelectedFile(null)
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          variant="ghost"
                          size="sm"
                          className="p-1 h-auto"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    {/* Text Input */}
                  <div key="text-input" className="flex-1 relative">
                    <Input
                      type="text"
                        placeholder="Type a message..."
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="pr-20"
                      />
                    
                    {/* Microphone Button */}
                    <Button
                      key="mic-button"
                      onClick={startRecording}
                      disabled={isRecording || audioBlob}
                      variant="ghost"
                      size="sm"
                      className="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 h-auto text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Voice message"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    
                    {/* Send Button */}
                  <Button
                    onClick={handleSendMessage}
                    disabled={!chatMessage.trim() && !selectedFile && !audioBlob}
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 p-1 h-auto bg-[#FF385C] hover:bg-[#FF385C]"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                      </div>

                      {/* Voice Recording Controls */}
                      {isRecording && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                              <span className="text-sm text-red-700">
                                Recording... {Math.floor(recordingTime / 60)}:
                                {(recordingTime % 60).toString().padStart(2, '0')}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={stopRecording}
                                className="px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
                              >
                                Stop
                              </Button>
                              <Button
                                onClick={cancelVoiceMessage}
                                variant="outline"
                                className="px-3 py-1 text-gray-600 rounded-lg text-sm hover:bg-gray-100"
                              >
                                Cancel
                              </Button>
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
                                {(recordingTime % 60).toString().padStart(2, '0')})
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={sendVoiceMessage}
                                className="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
                              >
                                Send
                              </Button>
                              <Button
                                onClick={cancelVoiceMessage}
                                variant="outline"
                                className="px-3 py-1 text-gray-600 rounded-lg text-sm hover:bg-gray-100"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
              </div>
            </div>
          ) : (
              /* No Chat Selected */
              <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-50">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No chat selected</h3>
                  <p className="text-gray-500">Choose a chat from the sidebar to start messaging</p>
                </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Contract Modal */}
      {showContractModal && (
      <ContractModal
        key="contract-modal"
        isOpen={showContractModal}
        onClose={() => setShowContractModal(false)}
        onSubmit={handleContractSubmit}
          expert={selectedChat?.user}
          userRole={session?.user?.roles || session?.backendData?.user?.roles || []}
        />
      )}
      
      {/* Itinerary Modal */}
      {showItineraryModal && (
        <ItineraryModal
          key="itinerary-modal"
          isOpen={showItineraryModal}
          onClose={() => setShowItineraryModal(false)}
          onSubmit={handleItinerarySubmit}
        />
      )}

      {/* Stripe Onboarding Modal */}
      {showOnboardingModal && (
      <StripeOnboardingModal
        key="onboarding-modal"
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        message={onboardingMessage}
        onboardingUrl={profileData?.onboarding_url}
      />
      )}

      {/* Payment Success Modal */}
      {showPaymentSuccessModal && paymentSuccessData && (
        <PaymentSuccessModal
          key="payment-success-modal"
          isOpen={showPaymentSuccessModal}
          onClose={() => {
            setShowPaymentSuccessModal(false)
            setPaymentSuccessData(null)
          }}
          itineraryTitle={paymentSuccessData.itineraryTitle}
          expertName={paymentSuccessData.expertName}
          contractId={paymentSuccessData.contractId}
          paymentAmount={paymentSuccessData.paymentAmount}
        />
      )}
    </div>
  )
}
