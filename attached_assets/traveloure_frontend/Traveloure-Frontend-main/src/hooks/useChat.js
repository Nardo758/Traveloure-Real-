"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useWebSocketContext } from "../components/WebSocketProvider"
import { toast } from "sonner"
import { validateMessage } from "../utils/messageValidation"
import { useDispatch } from "react-redux"
import * as contractActions from "../app/redux-features/contract/contractSlice"
import { getChatMessages, getChatHistory } from "../app/redux-features/chat/chatSlice"

export const useChat = () => {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isConnected, joinChat, sendChatMessage, leaveChat, addMessageListener } = useWebSocketContext()
  
  // Chat state
  const [currentChatId, setCurrentChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [recentlySentMessages, setRecentlySentMessages] = useState(new Set())
  const [recentlySentContracts, setRecentlySentContracts] = useState(new Set())
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [showChatInterface, setShowChatInterface] = useState(false)
  const [chatMessage, setChatMessage] = useState("")
  const [selectedFile, setSelectedFile] = useState(null)
  const [showStickers, setShowStickers] = useState(false)

  // Voice recording state
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    time: 0,
    blob: null,
    recorder: null,
    timer: null,
  })

  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef(null)

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      // Try multiple scroll methods to ensure it works
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      })

      // Fallback: direct scroll to bottom
      setTimeout(() => {
        const messagesContainer = messagesEndRef.current?.parentElement
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight
        }
      }, 100)
    }
  }, [])

  // Function to reset file input
  const resetFileInput = useCallback(() => {
    const fileInput = document.getElementById("file-input")
    if (fileInput) {
      fileInput.value = ""
    }
    setSelectedFile(null)
  }, [])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-scroll when chat interface opens
  useEffect(() => {
    if (showChatInterface) {
      // Multiple attempts to ensure scroll works with different timings
      const scrollAttempts = [50, 150, 300, 500, 1000]
      scrollAttempts.forEach((delay) => {
        setTimeout(() => {
          scrollToBottom()
        }, delay)
      })
    }
  }, [showChatInterface, scrollToBottom])

  // Helper function
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

  // Simplified WebSocket message handler
  useEffect(() => {
    const handleIncomingMessage = (data) => {

      // Only handle chat messages and contracts - remove all notification logic
      if (data.type === "chat_message" && data.message && !data.message.itinerary_submit) {
        handleChatMessage(data)
      } else if (data.type === "new_contract" && data.message) {
        handleNewContract(data)
      } else if (data.type === "contract_accepted" && data.message) {
        handleContractAccepted(data)
      } else if (data.type === "contract_rejected" && data.message) {
        handleContractRejected(data)
      } else if (data.type === "contract_payment_success") {
        handleContractPaymentSuccess(data)
      } else if (data.type === "submit_itinerary_accepted" && data.message) {
        handleItineraryAccepted(data)
      } else if (data.type === "submit_itinerary_rejected" && data.message) {
        handleItineraryRejected(data)
      } else if (data.type === "new_submit_itinerary" && data.message) {
        handleNewItinerary(data)
      } else if (data.type === "error") {
        toast.error(`WebSocket error: ${data.error}`)
      }
    }

    // Handle chat messages (text and documents)
    const handleChatMessage = (data) => {
      const message = data.message

      
      // Skip if this is our own message (prevent duplicates)
      if (isOurOwnMessage(message)) {
        console.log('🚫 handleChatMessage - Skipping own message:', message.id)
        return
      }

      // Skip if message already exists
      if (messageExists(message.id)) {
        console.log('🚫 handleChatMessage - Message already exists:', message.id)
        return
      }

      // Determine if this message is from current user
      const isFromCurrentUser = message.sender?.id === session?.user?.id || 
                               message.sender_id === session?.user?.id

     
      // Add message to chat
      setMessages((prev) => {
          const newMessage = {
          id: message.id || Date.now().toString(),
          type: isFromCurrentUser ? "sent" : "received",
          content: message.message || "No message content",
          attachment: message.attachment || null,
          timestamp: new Date(message.created_at || Date.now()),
          sender: isFromCurrentUser ? "user" : "expert",
          }
          return [...prev, newMessage]
        })
      }

      // Handle new contract messages
    const handleNewContract = (data) => {
      const message = data.message
      const contract = message.contract

      // Skip if contract already exists
      if (contractExists(message.id)) return

      // Determine if this contract is from current user
          const currentUserName = session?.user?.name || session?.user?.username
          const currentUserId = session?.user?.id
          const currentUserIdentifiers = [
            session?.user?.username,
            session?.user?.name,
            session?.user?.email,
            session?.user?.first_name,
        session?.user?.last_name,
          ].filter(Boolean)
          
          const isFromCurrentUser = 
        message.sender?.id === session?.user?.id ||
        message.sender_id === session?.user?.id ||
        currentUserIdentifiers.includes(message.sender?.username)

      setMessages((prev) => {
          const newContractMessage = {
          id: message.id || Date.now().toString(),
          type: isFromCurrentUser ? "sent" : "received",
          content: "Contract received",
          contract: contract,
          timestamp: new Date(message.created_at || Date.now()),
          sender: isFromCurrentUser ? "user" : "expert",
          isContract: true,
        }
          return [...prev, newContractMessage]
        })

        if (!showChatInterface) {
        toast.success(`New contract from ${selectedExpert ? getDisplayName(selectedExpert) : "Expert"}`)
        }
      }

    // Handle contract accepted
    const handleContractAccepted = (data) => {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
        setMessages((prev) =>
          prev.map((msg) => {
              if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                return {
                  ...msg,
                  contract: {
                    ...msg.contract,
                  status: "accepted",
                  is_accepted: true,
                  payment_url: data.message?.payment_url || msg.contract.payment_url,
                },
                }
              }
              return msg
          }),
        )

        // Refresh chat history to get updated payment link from backend
        const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
        if (accessToken) {
          console.log('🔌 Chat Hook - Contract accepted, refreshing chat history for payment link')
          dispatch(getChatHistory({ token: accessToken }))
            .then((result) => {
              console.log('🔌 Chat Hook - Chat history refreshed after contract acceptance:', result.payload)
            })
            .catch((error) => {
              console.error('🔌 Chat Hook - Error refreshing chat history after contract acceptance:', error)
            })
        }
      }
    }

    // Handle contract rejected
    const handleContractRejected = (data) => {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
        setMessages((prev) =>
          prev.map((msg) => {
              if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                return {
                  ...msg,
                  contract: {
                    ...msg.contract,
                  status: "rejected",
                  is_accepted: false,
                },
                }
              }
              return msg
          }),
        )
        }
      }

      // Handle contract payment success
    const handleContractPaymentSuccess = (data) => {
        const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
        
        // Immediately dispatch contract status check without any conditions
        if (accessToken) {
          // Add a small delay to ensure backend has processed the payment
          setTimeout(() => {
          const chatId = selectedExpert?.user?.id || selectedExpert?.chat?.id || selectedExpert?.id
            dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
              .then((result) => {
                // If show_itinerary is still false, try again after another delay
                if (result.payload?.show_itinerary === false) {
                  setTimeout(() => {
                  const chatId = selectedExpert?.user?.id || selectedExpert?.chat?.id || selectedExpert?.id
                  dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId })).catch(
                    (error) => {
                        console.error("🔌 Chat Hook - Retry failed:", error)
                    },
                  )
                  }, 2000)
                }
              })
            .catch((error) => {
                console.error("🔌 Chat Hook - Error refreshing contract status:", error)
              })
          }, 1000) // 1 second delay to ensure backend processing
        }
        
        if (data.message) {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          // Update the contract status in messages
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                return {
                  ...msg,
                  contract: {
                    ...msg.contract,
                    status: "paid",
                    is_accepted: true,
                    payment_url: data.message.payment_url || msg.contract.payment_url,
                  },
                }
              }
              return msg
            }),
          )
        }
        }
      }

      // Handle itinerary approval
    const handleItineraryAccepted = (data) => {
        const itineraryId = data.message.id
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.isItinerary && (msg.itinerary?.id === itineraryId || msg.itinerary_submit?.id === itineraryId)) {
            return {
              ...msg,
              itinerary: {
                ...msg.itinerary,
                status: "accepted",
              },
              itinerary_submit: {
                ...msg.itinerary_submit,
                status: "accepted",
              },
            }
          }
          return msg
        }),
      )

        // Trigger checkContractStatus API to refresh contract data after itinerary acceptance
        const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
        if (accessToken) {
        const chatId = selectedExpert?.user?.id || selectedExpert?.chat?.id || selectedExpert?.id
        dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId }))
            .then(() => {
              console.log("🔌 Chat Hook - Contract status refreshed successfully after itinerary acceptance")
            })
          .catch((error) => {
              console.error("🔌 Chat Hook - Error refreshing contract status after itinerary acceptance:", error)
            })
        }
      }

      // Handle itinerary rejection
    const handleItineraryRejected = (data) => {
        const itineraryId = data.message.id
      setMessages((prev) =>
        prev.map((msg) => {
            if (msg.isItinerary && (msg.itinerary?.id === itineraryId || msg.itinerary_submit?.id === itineraryId)) {
              return {
                ...msg,
                itinerary: {
                  ...msg.itinerary,
                status: "rejected",
                },
                itinerary_submit: {
                  ...msg.itinerary_submit,
                status: "rejected",
              },
              }
            }
            return msg
        }),
      )
      }

      // Handle new itinerary submissions
    const handleNewItinerary = (data) => {
        const itineraryId = data.message.itinerary_submit?.id
        if (itineraryId) {
          const uniqueItineraryMessageId = `itinerary_${itineraryId}_${Date.now()}`
          
          const currentUserName = session?.user?.name || session?.user?.username
          const currentUserId = session?.user?.id
          const currentUserIdentifiers = [
            session?.user?.username,
            session?.user?.name,
            session?.user?.email,
            session?.user?.first_name,
          session?.user?.last_name,
          ].filter(Boolean)

        const senderName = data.message.sender?.username || data.message.sender_name || "Unknown"
        const isFromCurrentUser =
          senderName === currentUserName ||
            data.message.sender_id === currentUserId ||
            currentUserIdentifiers.includes(senderName)

          const itineraryMessage = {
            id: uniqueItineraryMessageId,
          type: isFromCurrentUser ? "sent" : "received",
            content: `Itinerary: ${data.message.itinerary_submit.title}`,
            attachment: data.message.itinerary_submit.attachment,
            timestamp: new Date(data.message.created_at || Date.now()),
          sender: isFromCurrentUser ? "user" : "expert",
            isItinerary: true,
            itinerary: data.message.itinerary_submit,
          itinerary_submit: data.message.itinerary_submit,
        }

        setMessages((prev) => {
          const messageExists = prev.some(
            (msg) => msg.id === uniqueItineraryMessageId || (msg.isItinerary && msg.itinerary?.id === itineraryId),
          )
            if (messageExists) return prev

            return [...prev, itineraryMessage]
          })

          if (!showChatInterface) {
          toast.success(`New itinerary from ${selectedExpert ? getDisplayName(selectedExpert) : "Expert"}`)
        }
      }
    }

    // Helper functions
    const isOurOwnMessage = (message) => {
      // First check if this message is from the current user
      const isFromCurrentUser = message.sender?.id === session?.user?.id || 
                               message.sender_id === session?.user?.id
      
      if (isFromCurrentUser) return true

      // Then check if this is a recently sent message
      const messageContent = message.message?.toLowerCase().trim()
      const isVoiceMessage =
        message.message?.includes("Voice message (") || message.attachment?.type?.startsWith("audio/")
      const isFileMessage =
        message.attachment &&
        (message.attachment.type?.startsWith("image/") ||
          message.attachment.type?.startsWith("video/") ||
          message.attachment.type?.startsWith("audio/") ||
          message.attachment.type?.includes("pdf") ||
          message.attachment.type?.includes("document"))

      return (
        recentlySentMessages.has(message.message) ||
        Array.from(recentlySentMessages).some((recentMsg) => recentMsg.toLowerCase().trim() === messageContent) ||
        (isVoiceMessage &&
          Array.from(recentlySentMessages).some(
            (recentMsg) =>
              recentMsg.includes("Voice message (") &&
              Math.abs(new Date().getTime() - new Date(message.created_at || Date.now()).getTime()) < 5000,
          )) ||
        (isFileMessage &&
          Array.from(recentlySentMessages).some(
            (recentMsg) =>
              recentMsg.includes("File attachment") ||
              recentMsg.includes("attachment") ||
              (message.attachment &&
                recentMsg.includes(`File attachment: ${message.attachment.name}:${message.attachment.size}`)) ||
              Math.abs(new Date().getTime() - new Date(message.created_at || Date.now()).getTime()) < 5000,
          ))
      )
    }

    const messageExists = (messageId) => {
      return messages.some((msg) => msg.id === messageId)
    }

    const contractExists = (contractId) => {
      return messages.some((msg) => msg.id === contractId && msg.isContract)
    }

    if (isConnected) {
      const removeListener = addMessageListener(handleIncomingMessage)
      return () => removeListener()
    }
  }, [
    isConnected,
    addMessageListener,
    recentlySentMessages,
    recentlySentContracts,
    messages,
    session,
    showChatInterface,
    selectedExpert,
    dispatch,
  ])

  // Chat functions
  const handleOpenChat = useCallback(
    async (expert) => {
    if (!isConnected) {
        toast.error("WebSocket not connected. Please try again.")
      return
    }

    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (!accessToken) {
        toast.error("Authentication required")
      return
    }

    try {
      // Try multiple possible ID locations - prioritize user.id for API calls (person you're chatting with)
      const chatId = expert.user?.id || expert.chat?.id || expert.id
      
      const success = joinChat(chatId)
      if (success) {
        setCurrentChatId(chatId)
        setSelectedExpert(expert)
        setShowChatInterface(true)
        
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
        const response = await fetch(`${apiBaseUrl}/ai/chats/${chatId}/`, {
            method: "GET",
          headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          const data = await response.json()
          const apiMessages = data.data || data || []
          
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
              timestamp: new Date(msg.created_at),
                  sender: isFromCurrentUser ? "user" : "expert",
                  isVoiceMessage: msg.message?.startsWith("Voice message ("),
                  isContract: msg.contract || msg.message?.includes("Contract"),
              contract: msg.contract,
              isItinerary: msg.itinerary_submit || msg.itinerary,
                  itinerary: msg.itinerary_submit || msg.itinerary,
            }
              })
              .sort((a, b) => {
            const dateA = new Date(a.timestamp || 0)
            const dateB = new Date(b.timestamp || 0)
            return dateA - dateB
          })

          setMessages(convertedMessages)
          
          if (convertedMessages.length === 0) {
              setMessages([
                {
                  id: "welcome",
                  type: "received",
              content: `Hi! I'm ${getDisplayName(expert)}, your travel expert. How can I help you plan your trip?`,
              timestamp: new Date(),
                  sender: "expert",
                },
              ])
          }

          // Check contract status when chat messages are loaded
            const chatId = expert?.user?.id || expert?.chat?.id || expert?.id
            dispatch(contractActions.checkContractStatus({ token: accessToken, withChat: chatId })).catch((error) => {
              console.error("Error checking contract status:", error)
            })

          toast.success(`Joined chat with ${getDisplayName(expert)}`)
        } else {
            setMessages([
              {
                id: "welcome",
                type: "received",
            content: `Hi! I'm ${getDisplayName(expert)}, your travel expert. How can I help you plan your trip?`,
            timestamp: new Date(),
                sender: "expert",
              },
            ])
          toast.success(`Joined chat with ${getDisplayName(expert)}`)
        }

          // Auto-scroll after loading messages
          setTimeout(() => {
            scrollToBottom()
          }, 300)
      }
    } catch (error) {
        console.error("Error opening chat:", error)
        toast.error("Failed to open chat. Please try again.")
    }
    },
    [isConnected, session, joinChat, scrollToBottom, getDisplayName, dispatch],
  )

  const handleCloseChat = useCallback(() => {
    if (currentChatId) {
      leaveChat(currentChatId)
    }
    setCurrentChatId(null)
    setSelectedExpert(null)
    setShowChatInterface(false)
    setMessages([])
  }, [currentChatId, leaveChat])

  const handleSendMessage = useCallback(async () => {
    if (!chatMessage.trim() && !selectedFile) return

    const messageText = chatMessage.trim()

    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (!accessToken) {
      toast.error("Authentication required. Please login again.")
      return
    }

    if (messageText) {
      const validation = await validateMessage(messageText, accessToken)
      if (!validation.isValid) {
        toast.error(validation.reason || "Message contains inappropriate content")
        return
      }
    }

    const localMessageId = Date.now().toString()

    const newMessage = {
      id: localMessageId,
      type: "sent",
      content: messageText,
      attachment: selectedFile,
      timestamp: new Date(),
      sender: "user",
    }

    setMessages((prev) => [...prev, newMessage])
    setChatMessage("")
    
    try {
      if (selectedFile) {
        const formData = new FormData()
        formData.append("message", messageText)
        formData.append("attachment", selectedFile)

        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
        const url = `${apiBaseUrl}/ai/chats/${currentChatId}/`

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error("File upload error:", errorData)

          if (response.status === 401) {
            throw new Error("Authentication required. Please login again.")
          }

          throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
        }

        toast.success("Message with attachment sent!")
      } else {
        const success = sendChatMessage(currentChatId, messageText)
        if (!success) {
          throw new Error("Failed to send via WebSocket")
        }
      }

      // Track this message to prevent duplicates - include file info if present
      const messageToTrack = selectedFile ? `File attachment: ${selectedFile.name}:${selectedFile.size}` : messageText
      setRecentlySentMessages((prev) => new Set([...prev, messageToTrack]))
      setSelectedFile(null)

      // Reset file input to allow selecting the same file again
      const fileInput = document.getElementById("file-input")
      if (fileInput) {
        fileInput.value = ""
      }

      setTimeout(() => {
        setRecentlySentMessages((prev) => {
          const newSet = new Set(prev)
          newSet.delete(messageToTrack)
          return newSet
        })
      }, 10000)
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== localMessageId))
      setChatMessage(messageText)
      if (selectedFile) setSelectedFile(selectedFile)

      // Show more specific error messages
      const errorMessage = error.message || "Failed to send message. Please try again."
      console.error("Send message error:", error)
      toast.error(errorMessage)
    }
  }, [
    chatMessage,
    selectedFile,
    isConnected,
    currentChatId,
    session?.backendData?.accessToken,
    session?.backendData?.backendData?.accessToken,
    sendChatMessage,
  ])

  const handleFileSelect = useCallback((e) => {
    try {
      const file = e.target.files[0]
      if (file) {
        const maxSize = 60 * 1024 * 1024 // 60MB
        if (file.size > maxSize) {
          toast.error("File size too large. Please select a file smaller than 60MB.")
          // Reset the input to allow selecting the same file again
          e.target.value = ""
          return
        }

        const allowedTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "video/mp4",
          "video/avi",
          "video/mov",
          "video/wmv",
          "video/flv",
          "video/webm",
          "audio/wav",
          "audio/mp3",
          "audio/mpeg",
          "audio/ogg",
          "audio/m4a",
          "audio/aac",
        ]
        if (!allowedTypes.includes(file.type)) {
          toast.error("File type not supported. Please select an image, PDF, Word document, video, or audio file.")
          // Reset the input to allow selecting the same file again
          e.target.value = ""
          return
        }

        setSelectedFile(file)
        toast.success(`File selected: ${file.name}`)
      } else {
        // Clear selected file if no file selected
        setSelectedFile(null)
      }
    } catch (error) {
      toast.error("Error selecting file. Please try again.")
      // Reset the input on error
      e.target.value = ""
    }
  }, [])

  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter") {
      handleSendMessage()
    }
    },
    [handleSendMessage],
  )

  const handleStickerSelect = useCallback((sticker) => {
    if (sticker === "toggle") {
      setShowStickers((prev) => !prev)
    } else if (sticker === "close") {
      setShowStickers(false)
    } else {
      setChatMessage((prev) => prev + sticker)
      setShowStickers(false)
    }
  }, [])

  // Function to track recently sent contracts
  const trackSentContract = useCallback((contractId) => {
    setRecentlySentContracts((prev) => new Set([...prev, contractId]))
    
    // Clean up after 10 seconds
    setTimeout(() => {
      setRecentlySentContracts((prev) => {
        const newSet = new Set(prev)
        newSet.delete(contractId)
        return newSet
      })
    }, 10000)
  }, [])

  // Voice message functions
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/wav" })
        setRecordingState((prev) => ({ ...prev, blob }))
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      const timer = setInterval(() => {
        setRecordingState((prev) => ({ ...prev, time: prev.time + 1 }))
      }, 1000)

      setRecordingState({
        isRecording: true,
        time: 0,
        blob: null,
        recorder,
        timer,
      })
    } catch (error) {
      toast.error("Failed to start recording. Please check microphone permissions.")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (recordingState.recorder && recordingState.isRecording) {
      recordingState.recorder.stop()
      if (recordingState.timer) {
        clearInterval(recordingState.timer)
      }
      setRecordingState((prev) => ({ ...prev, isRecording: false, timer: null }))
    }
  }, [recordingState])

  const sendVoiceMessage = useCallback(async () => {
    if (!recordingState.blob) {
      toast.error("No voice message to send")
      return
    }

    if (!isConnected || !currentChatId) {
      toast.error("WebSocket not connected or no active chat. Please try again.")
      return
    }

    const voiceMessageText = `Voice message (${Math.floor(recordingState.time / 60)}:${(recordingState.time % 60).toString().padStart(2, "0")})`

    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    const validation = await validateMessage(voiceMessageText, accessToken)
    if (!validation.isValid) {
      toast.error(validation.reason || "Voice message contains inappropriate content")
      return
    }

    const localMessageId = Date.now().toString()
    const newMessage = {
      id: localMessageId,
      type: "sent",
      content: voiceMessageText,
      attachment: recordingState.blob,
      isVoiceMessage: true,
      duration: recordingState.time,
      timestamp: new Date(),
      sender: "user",
    }

    // Track this voice message to prevent duplicates
    setRecentlySentMessages((prev) => new Set([...prev, voiceMessageText]))

    setMessages((prev) => [...prev, newMessage])

    try {
      const audioFile = new File([recordingState.blob], `voice_message_${Date.now()}.wav`, { type: "audio/wav" })
      const formData = new FormData()
      formData.append("message", voiceMessageText)
      formData.append("attachment", audioFile)

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
      const response = await fetch(`${apiBaseUrl}/ai/chats/${currentChatId}/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      setRecordingState({ isRecording: false, time: 0, blob: null, recorder: null, timer: null })

      // Clean up voice message tracking after 10 seconds
      setTimeout(() => {
        setRecentlySentMessages((prev) => {
          const newSet = new Set(prev)
          newSet.delete(voiceMessageText)
          return newSet
        })
      }, 10000)
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== localMessageId))
      // Remove from tracking if send failed
      setRecentlySentMessages((prev) => {
        const newSet = new Set(prev)
        newSet.delete(voiceMessageText)
        return newSet
      })
      toast.error("Failed to send voice message. Please try again.")
    }
  }, [
    recordingState,
    isConnected,
    currentChatId,
    session?.backendData?.accessToken,
    session?.backendData?.backendData?.accessToken,
  ])

  const cancelVoiceMessage = useCallback(() => {
    if (recordingState.recorder && recordingState.isRecording) {
      recordingState.recorder.stop()
      if (recordingState.timer) clearInterval(recordingState.timer)
    }
    setRecordingState({ isRecording: false, time: 0, blob: null, recorder: null, timer: null })
    toast.info("Voice message cancelled")
  }, [recordingState])

  const formatTime = useCallback((timestamp) => {
    return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }, [])

  // Function to refresh chat messages using Redux action
  const refreshChatMessages = useCallback(async () => {
    if (!currentChatId || !session?.backendData?.accessToken) {
      return
    }

    try {
      const result = await dispatch(
        getChatMessages({
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
          chatId: currentChatId,
        }),
      ).unwrap()
      
      // The Redux action will update the messages in the store
      // We need to convert the Redux messages to our local format
      if (result && result.messages) {
        const currentUserName = session?.user?.name || session?.user?.username
        const currentUserId = session?.user?.id
        const currentUserIdentifiers = [
          session?.user?.username,
          session?.user?.name,
          session?.user?.email,
          session?.user?.first_name,
          session?.user?.last_name,
        ].filter(Boolean)

        const convertedMessages = result.messages
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
            timestamp: new Date(msg.created_at),
              sender: isFromCurrentUser ? "user" : "expert",
              isVoiceMessage: msg.message?.startsWith("Voice message ("),
              isContract: msg.contract || msg.message?.includes("Contract"),
            contract: {
              ...msg.contract,
              // Ensure payment_url is properly included
              payment_url: msg.contract?.payment_url || null,
              status: msg.contract?.status || null,
                is_accepted: msg.contract?.is_accepted || false,
            },
            isItinerary: msg.itinerary_submit || msg.itinerary,
              itinerary: msg.itinerary_submit || msg.itinerary,
          }
          })
          .sort((a, b) => {
          const dateA = new Date(a.timestamp || 0)
          const dateB = new Date(b.timestamp || 0)
          return dateA - dateB
        })

        setMessages(convertedMessages)
      }
    } catch (error) {
      console.error("🔌 Error refreshing chat messages via Redux:", error)
    }
  }, [
    currentChatId,
    session?.backendData?.accessToken,
    session?.backendData?.backendData?.accessToken,
    session?.user,
    dispatch,
  ])

  // Sort messages by timestamp
  const sortedMessages = messages.sort((a, b) => {
    const dateA = new Date(a.timestamp || 0)
    const dateB = new Date(b.timestamp || 0)
    return dateA - dateB
  })

  return {
    // State
    currentChatId,
    messages: sortedMessages,
    selectedExpert,
    showChatInterface,
    chatMessage,
    selectedFile,
    showStickers,
    recordingState,
    isConnected,
    messagesEndRef,
    
    // Actions
    setChatMessage,
    setSelectedFile,
    setShowStickers,
    setMessages,
    addMessageListener,
    handleOpenChat,
    handleCloseChat,
    handleSendMessage,
    handleFileSelect,
    handleKeyPress,
    handleStickerSelect,
    startRecording,
    stopRecording,
    sendVoiceMessage,
    cancelVoiceMessage,
    formatTime,
    getDisplayName,
    trackSentContract,
    refreshChatMessages,
    scrollToBottom,
    resetFileInput,
  }
}
