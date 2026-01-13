"use client"

import { Button } from "../../components/ui/button"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { getlocalexperts } from "../redux-features/TalktoExpert/TalktoExpert"
import * as contractActions from "../redux-features/contract/contractSlice"
import ContractModal from "../../components/ContractModal"
import ContractApprovedModal from "../../components/ContractApprovedModal"
import { ExpertSearch } from "../../components/ExpertSearch"
import { ChatInterface } from "../../components/ChatInterface"
import ContractMessage from "../../components/ContractMessage"
import ItineraryMessage from "../../components/ItineraryMessage"
import { AttachmentDisplay } from "../../components/AttachmentDisplay"
import { useChat } from "../../hooks/useChat"
import { useContract } from "../../hooks/useContract"
import { useItinerary } from "../../hooks/useItinerary"
import soundNotification from "../../utils/soundNotification"
import { toast } from "sonner"

// Static fallback data for missing API fields
const staticExpertData = {
  rating: "4.8/5.0",
  reviews: 650,
  languages: ["English", "French", "Spanish"],
  countries: ["Italy", "France", "Spain", "Britain"],
  specialization: "Specializing in Coastal Adventures and Hidden Gems",
  image: "/dealperson.png",
}

export default function TravelExperts() {
  const { data: session, status } = useSession()
  const dispatch = useDispatch()
  const router = useRouter()
  const { Expertlist, loading, error } = useSelector((state) => state.talkexpert)
  const { contractStatusData, showContract, checkContractStatusLoading } = useSelector(state => state.contract)

  const chat = useChat()
  const contract = useContract()
  const itinerary = useItinerary()

  // Wrapper function to handle contract submission and add to local messages
  const handleContractSubmitWithLocalMessage = useCallback(async (contractData) => {
    try {
      const result = await contract.handleContractSubmit(contractData, (contractResult) => {
        // Add contract to local messages immediately after successful submission
        if (contractResult && contractResult.data) {
          const contractData = contractResult.data
          const newContractMessage = {
            id: contractData.id || Date.now().toString(),
            type: 'sent',
            content: 'Contract sent',
            contract: {
              ...contractData,
              sender: {
                id: session?.user?.id,
                username: session?.user?.username,
                first_name: session?.user?.first_name,
                last_name: session?.user?.last_name
              },
              sender_id: session?.user?.id,
              sender_name: session?.user?.name || session?.user?.username
            },
            timestamp: new Date(contractData.created_at || Date.now()),
            sender: 'user',
            isContract: true
          }
          
          chat.setMessages(prev => {
            // Check if contract already exists to avoid duplicates
            const contractExists = prev.some(msg => msg.isContract && msg.contract?.id === contractData.id)
            if (contractExists) return prev
            return [...prev, newContractMessage]
          })
        }
      })
      return result
    } catch (error) {
      throw error
    }
  }, [contract, chat, session])

  // Additional state for this page
  const [globalContracts, setGlobalContracts] = useState(new Map())

  // Check contract status when component mounts and user is logged in
  useEffect(() => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (token) {
      const chatId = chat?.selectedExpert?.id || chat?.selectedExpert?.user_id || chat?.selectedExpert?.user?.id
      dispatch(contractActions.checkContractStatus({ token, withChat: chatId }))
        .then(result => {
        })
        .catch(error => {
          console.error('🔌 Experts page - Failed to check contract status:', error)
        })
    }
  }, [session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken, chat?.selectedExpert, dispatch])

  // Enhanced WebSocket handler for itinerary and contract messages
  useEffect(() => {
    const handleIncomingMessage = (data) => {
   
      // Skip contract_message type to avoid duplicates - only handle new_contract type

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
        
        if (contractData.id) {
          setGlobalContracts(prev => {
            const newMap = new Map(prev)
            newMap.set(contractData.id, {
              id: contractData.id,
              title: contractData.title || contractData.contract_title,
              amount: contractData.amount,
              status: contractData.status || 'pending',
              is_accepted: contractData.is_accepted || false,
              created_at: contractData.created_at || new Date().toISOString()
            })
            return newMap
          })
        }
        
        chat.setMessages(prev => {
          // Check for duplicates using both message ID and contract ID
          const contractExists = prev.some(msg => 
            (msg.id === data.message.id && msg.isContract) ||
            (msg.isContract && msg.contract?.id === contractData.id)
          )
          if (contractExists) return prev
          
          // Define user identifiers first (before using them)
          const currentUserName = session?.user?.name || session?.user?.username
          const currentUserId = session?.user?.id
          const currentUserIdentifiers = [
            session?.user?.username,
            session?.user?.name,
            session?.user?.email,
            session?.user?.first_name,
            session?.user?.last_name
          ].filter(Boolean)
          
          // Additional check: if this contract was recently sent by current user (within last 10 seconds),
          // skip processing to avoid overriding the local message
          const recentlySentByCurrentUser = 
            data.message.created_at && 
            new Date(data.message.created_at).getTime() > Date.now() - 10000 &&
            chat.currentChatId === chat.selectedExpert?.id &&
            (data.message.sender_id === currentUserId || 
             data.message.sender?.id === currentUserId ||
             currentUserIdentifiers.includes(data.message.sender?.username || data.message.sender_name))
          
          if (recentlySentByCurrentUser) {
            return prev
          }

          const senderName = data.message.sender?.username || data.message.sender_name || 'Unknown'
          
          // Correct sender detection for expert panel
          // In expert panel, we are the receiver, so contracts from local experts should be "received"
          const isFromCurrentUser = 
            data.message.sender_id === currentUserId ||
            data.message.sender?.id === currentUserId ||
            senderName === currentUserName ||
            currentUserIdentifiers.includes(senderName)

          const messageType = isFromCurrentUser ? 'sent' : 'received'
          const senderType = isFromCurrentUser ? 'user' : 'expert'
          
          // Copy exact structure from useChat hook
          const newContractMessage = {
            id: data.message.id || Date.now().toString(),
            type: messageType,
            content: 'Contract received',
            contract: contractData,
            timestamp: new Date(data.message.created_at || Date.now()),
            sender: senderType,
            isContract: true
          }
          

          return [...prev, newContractMessage]
        })
        
        soundNotification.play()
        if (!chat.showChatInterface) {
          toast.success(`New contract from ${chat.selectedExpert ? chat.getDisplayName(chat.selectedExpert) : 'Expert'}`)
        }
      }

      // Handle contract status updates
      if (data.type === 'contract_rejected' && data.message) {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          
          // Update Redux contract status
          dispatch(contractActions.updateContractStatus({
            contractId: contractId,
            status: 'rejected'
          }))
          
          setGlobalContracts(prev => {
            const newMap = new Map(prev)
            if (newMap.has(contractId)) {
              const existingContract = newMap.get(contractId)
              newMap.set(contractId, {
                ...existingContract,
                status: 'rejected',
                is_accepted: false
              })
            } else {
              newMap.set(contractId, {
                id: contractId,
                title: data.message.title,
                amount: data.message.amount,
                status: 'rejected',
                is_accepted: false,
                created_at: data.message.created_at
              })
            }
            return newMap
          })
          
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
            soundNotification.play()
        }
      }

      if (data.type === 'contract_accepted' && data.message) {
        const contractId = data.message.contract_id || data.message.id
        if (contractId) {
          
          // Get payment URL from either payment_url or payment_link field
          const paymentUrl = data.message?.payment_url || data.message?.payment_link
          
          console.log('🔌 Traveler Panel - Contract accepted with payment URL:', {
            contractId,
            paymentUrl,
            message: data.message
          })
          
          // Update Redux contract status
          dispatch(contractActions.updateContractStatus({
            contractId: contractId,
            status: 'accepted',
            payment_url: paymentUrl
          }))
          
          setGlobalContracts(prev => {
            const newMap = new Map(prev)
            if (newMap.has(contractId)) {
              const existingContract = newMap.get(contractId)
              newMap.set(contractId, {
                ...existingContract,
                status: 'accepted',
                is_accepted: true,
                payment_url: paymentUrl || existingContract.payment_url
              })
            } else {
              newMap.set(contractId, {
                id: contractId,
                title: data.message.title,
                amount: data.message.amount,
                status: 'accepted',
                is_accepted: true,
                payment_url: paymentUrl,
                created_at: data.message.created_at
              })
            }
            return newMap
          })
          
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
                    payment_url: paymentUrl || msg.contract.payment_url
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
                      is_accepted: true,
                      payment_url: paymentUrl
                    }
                  }
                }
                return msg
              })
            }
            
            return updatedMessages
          })
          
            soundNotification.play()
        }
      }

      // Handle itinerary status updates
      if (data.type === 'submit_itinerary_accepted' && data.message) {
        const itineraryId = data.message.id

        chat.setMessages(prev => prev.map(msg => {
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
          expertName: chat.selectedExpert?.first_name || chat.selectedExpert?.username || 'Expert',
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

        // Check if this itinerary is from the current user
        const isFromCurrentUser = data.message.sender?.id === session?.user?.id ||
                                 data.message.sender_id === session?.user?.id

        const uniqueItineraryMessageId = `${itineraryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        const itineraryMessage = {
          id: uniqueItineraryMessageId,
          type: isFromCurrentUser ? 'sent' : 'received',
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
            sender: data.message.sender,
            sender_id: data.message.sender?.id || data.message.sender_id
          },
          sender: {
            id: data.message.sender?.id || data.message.sender_id,
            username: data.message.sender?.username
          },
          sender_id: data.message.sender?.id || data.message.sender_id,
          sender_name: data.message.sender?.username
        }
        
        console.log('🔌 Expert Panel - Processed itinerary message:', {
          itineraryMessage,
          isFromCurrentUser,
          currentUserId: session?.user?.id,
          messageSenderId: data.message.sender?.id || data.message.sender_id
        })

        chat.setMessages(prev => {
          const messageExists = prev.some(msg => msg.id === uniqueItineraryMessageId ||
            (msg.isItinerary && msg.itinerary?.id === itineraryId))
          if (messageExists) return prev

          return [...prev, itineraryMessage]
        })

        soundNotification.play()
        if (!chat.showChatInterface) {
          toast.success(`New itinerary from ${chat.selectedExpert ? chat.getDisplayName(chat.selectedExpert) : 'Expert'}`)
        }
      }

      if (data.type === 'error') {
        toast.error(`WebSocket error: ${data.error}`)
      }
    }

    if (chat.isConnected) {
      const removeListener = chat.addMessageListener(handleIncomingMessage)
      return () => removeListener()
    }
  }, [chat.isConnected, chat.addMessageListener, session, chat, contract])

  // Fetch experts data when session is available


  useEffect(() => {
    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (accessToken) {
      dispatch(getlocalexperts({ token: accessToken, query: "" }))
    }
  }, [session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken, dispatch])

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
      rating: expert.average_rating > 0 ? `${expert.average_rating.toFixed(1)}/5.0` : staticExpertData.rating,
      reviews: expert.reviews?.length || staticExpertData.reviews,
      countries: expert.country ? [expert.country] : staticExpertData.countries,
      specialization: expert.travel_style?.length 
        ? `Specializing in ${expert.travel_style.map(capitalize).join(", ")}`
        : staticExpertData.specialization,
      image: expert.image || expert.cover_image || staticExpertData.image,
      preferredMonths: expert.preferred_months?.length 
        ? `Preferred: ${expert.preferred_months.map(capitalize).join(", ")}`
        : ""
    }
  }, [])



  // Show login prompt if user is not authenticated
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-[#F30131] to-[#BE35EB] rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Login Required</h2>
                <p className="text-gray-600 mb-8">
                  Please log in to view and chat with our travel experts. Get personalized recommendations and expert advice for your next adventure.
                </p>
                <div className="space-y-4">
                  <Button
                    onClick={() => router.push('/login')}
                    className="w-full bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:opacity-90 text-white py-3 px-6 rounded-lg font-medium"
                  >
                    Login to Continue
                  </Button>
                  <p className="text-sm text-gray-500">
                    Don't have an account?{' '}
                    <button
                      onClick={() => router.push('/signup')}
                      className="text-[#FF385C] hover:underline font-medium"
                    >
                      Sign up here
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="flex justify-center items-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Checking authentication...</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {!chat.showChatInterface ? (
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-center md:text-left">
                Recommended Travel Experts for You
              </h2>
              </div>
              
            <ExpertSearch
              Expertlist={Expertlist}
              loading={loading}
              error={error}
              isConnected={chat.isConnected}
              onOpenChat={chat.handleOpenChat}
              onContractModal={contract.handleContractModal}
              onSearch={getlocalexperts}
              onClearSearch={getlocalexperts}
              dispatch={dispatch}
              session={session}
            />
          </div>
        </main>
      ) : (
        /* Chat Interface - Full Screen Layout */
        <div className="flex flex-col h-screen w-full max-w-4xl mx-auto px-2 sm:px-4">
              {/* Fixed Header */}
              <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
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
                    disabled={checkContractStatusLoading}
                    className="px-4 py-2 bg-[#FF385C] text-white rounded-lg hover:bg-[#FF385C] transition-colors disabled:opacity-50"
                  >
                    {checkContractStatusLoading ? 'Checking...' : 'Create Contract'}
                  </button>
                )}
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4" style={{minHeight: 0, maxHeight: 'calc(100vh - 200px)'}}>
                {chat.messages && chat.messages.length > 0 ? (
                  chat.messages.map((message, index) => {
                    const messageId = message.id || message.chat?.id
                    const messageText = message.message || message.chat?.message || message.content || "No message content"
                    const createdAt = message.created_at || message.chat?.created_at || message.timestamp
                    const attachment = message.attachment || message.chat?.attachment

                    // Determine if this is a contract message
                    const isContractMessage = !!(message.isContract || message.contract || message.chat?.contract)
                    
                    // Quick test to verify boolean conversion
                    if (message.contract && typeof isContractMessage !== 'boolean') {
                      console.error('🔌 Boolean conversion failed!', { isContractMessage, type: typeof isContractMessage })
                    }
                    

                    // Determine if this is an itinerary message
                    const isItineraryMessage = !!(message.isItinerary || message.itinerary || message.itinerary_submit || message.chat?.itinerary_submit)

                    // Determine message direction for expert panel
                    let finalIsOutgoing = false
                    if (isContractMessage) {
                      // For contract messages in expert panel, check if current user sent it
                      const currentUserId = session?.user?.id
                      const currentUserName = session?.user?.name || session?.user?.username
                      const currentUserIdentifiers = [
                        session?.user?.username,
                        session?.user?.name,
                        session?.user?.email,
                        session?.user?.first_name,
                        session?.user?.last_name
                      ].filter(Boolean)
                      
                      // Check various sender indicators
                      const contractSenderId = message.contract?.sender?.id || message.contract?.sender_id
                      const contractSenderName = message.contract?.sender?.username || message.contract?.sender_name
                      
                      // Determine if current user sent this contract
                      finalIsOutgoing = 
                        message.type === 'sent' ||
                        message.sender === 'user' ||
                        contractSenderId === currentUserId ||
                        contractSenderName === currentUserName ||
                        currentUserIdentifiers.includes(contractSenderName)
                      
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
                    
                    // Test finalIsOutgoing value
                    if (isContractMessage) {
                      console.log('🔌 Contract message finalIsOutgoing:', { 
                        messageId: message.id, 
                        finalIsOutgoing, 
                        messageType: message.type, 
                        messageSender: message.sender 
                      })
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
                              // Use payment URL from multiple sources
                              payment_url: globalContracts.get(message.contract?.id || message.id)?.payment_url ||
                                          contract.contractPaymentUrls?.[message.contract?.id || message.id] || 
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
                              className={`max-w-[85%] sm:max-w-[75%] md:max-w-[65%] lg:max-w-[60%] ${finalIsOutgoing ? "text-right" : "text-left"}`}
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
                {/* Scroll target for auto-scroll */}
                <div ref={chat.messagesEndRef} />
              </div>

              {/* Message Input - Fixed at bottom */}
              <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3 sm:p-4 sticky bottom-0 z-10">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="file"
                    id="file-input"
                    onChange={chat.handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    key={chat.selectedFile ? 'file-selected' : 'no-file'}
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
                      className="w-full px-3 py-2 pr-10 sm:px-4 sm:pr-12 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                    />
                    {/* Microphone Button */}
                    <button
                      onClick={chat.startRecording}
                      disabled={chat.recordingState.isRecording}
                      className="absolute right-1 sm:right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="p-2 bg-[#FF385C] text-white rounded-full hover:bg-[#FF385C] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
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
                          className="px-2 sm:px-3 py-1 bg-[#FF385C] text-white rounded-lg text-xs sm:text-sm hover:bg-[#FF385C]"
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
                        onClick={() => chat.resetFileInput()}
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
          )}

        {/* Contract Modal */}
        <ContractModal
        isOpen={contract.showContractModal}
        onClose={contract.handleContractClose}
        expert={contract.contractExpert}
        onSubmit={handleContractSubmitWithLocalMessage}
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

      {/* WebSocket Debugger - Remove in production */}
     
    </div>
  )
}