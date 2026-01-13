import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { toast } from 'sonner'
import { checkContractStatus, storePaymentUrl } from '../contract/contractSlice'
import { isTokenExpired, handleTokenExpiration } from '../../../lib/authUtils'

// Helper function to get headers with token
const getHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// Get all chat conversations (person list)
export const getChatHistory = createAsyncThunk(
  'chat/getChatHistory',
  async ({ token }, { rejectWithValue, dispatch }) => {
    try {
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await axios.get(
        `${apiBaseUrl}/ai/chats/`,
        {
          headers: getHeaders(token),
        }
      )
      
      // Extract and store payment URLs from contract messages in chat history
      const chatData = response.data
      console.log('🔌 ChatSlice - Chat history data:', chatData)
      
      if (chatData && Array.isArray(chatData)) {
        chatData.forEach(chat => {
          console.log('🔌 ChatSlice - Processing chat:', {
            chatId: chat.id,
            lastMessage: chat.last_message,
            hasContract: !!chat.last_message?.contract,
            paymentUrl: chat.last_message?.contract?.payment_url
          })
          
          if (chat.last_message && chat.last_message.contract && chat.last_message.contract.payment_url) {
            console.log('🔌 ChatSlice - Storing payment URL:', {
              contractId: chat.last_message.contract.id,
              paymentUrl: chat.last_message.contract.payment_url
            })
            // Store payment URL in Redux state
            dispatch(storePaymentUrl({
              contractId: chat.last_message.contract.id,
              paymentUrl: chat.last_message.contract.payment_url
            }))
          }
        })
      }
      
      return chatData
    } catch (error) {
      console.error('🔌 Error fetching chat history:', error.response?.data || error.message)
      
      // Check for token expiration
      if (error.response?.data && isTokenExpired(error.response.data)) {
        console.log('🔒 Token expired detected in chat history')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }
      
      if (error.response?.status === 401) {
        console.log('🔒 Unauthorized (401) in chat history')
        handleTokenExpiration()
        return rejectWithValue('Authentication failed')
      }
      
      if (error.response?.status === 404) {
        return rejectWithValue('No chat history found')
      }
      
      toast.error('Failed to fetch chat history')
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch chat history')
    }
  }
)

// Get specific chat messages
export const getChatMessages = createAsyncThunk(
  'chat/getChatMessages',
  async ({ token, chatId }, { rejectWithValue, dispatch }) => {
    try {
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await axios.get(
        `${apiBaseUrl}/ai/chats/${chatId}/`,
        {
          headers: getHeaders(token),
        }
      )
      
      console.log('🔌 ChatSlice - API Response:', {
        status: response.status,
        data: response.data,
        dataType: typeof response.data,
        isArray: Array.isArray(response.data),
        hasData: !!response.data.data
      })
      
      // Extract messages from the correct structure
      // API response: { count, total_pages, data: [...] }
      const messages = response.data.data || response.data || []
      
      console.log('🔌 ChatSlice - Extracted messages:', {
        messagesCount: messages.length,
        messages: messages
      })
      
      // Extract and store payment URLs from contract messages
      messages.forEach(message => {
        console.log('🔌 ChatSlice - Processing message:', {
          messageId: message.id,
          hasContract: !!message.contract,
          contractId: message.contract?.id,
          paymentUrl: message.contract?.payment_url
        })
        
        if (message.contract && message.contract.payment_url) {
          console.log('🔌 ChatSlice - Storing payment URL from message:', {
            contractId: message.contract.id,
            paymentUrl: message.contract.payment_url
          })
          // Store payment URL in Redux state
          dispatch(storePaymentUrl({
            contractId: message.contract.id,
            paymentUrl: message.contract.payment_url
          }))
        }
      })
      
      // Also check contract status when chat messages are loaded
      if (token) {
        dispatch(checkContractStatus({ token, withChat: chatId }))
          .catch(error => {
            console.error('Failed to check contract status after chat messages:', error)
          })
      }
      
      return { chatId, messages: messages }
    } catch (error) {
      console.error('🔌 Error fetching chat messages:', error.response?.data || error.message)
      
      // Check for token expiration
      if (error.response?.data && isTokenExpired(error.response.data)) {
        console.log('🔒 Token expired detected in chat messages')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }
      
      if (error.response?.status === 401) {
        console.log('🔒 Unauthorized (401) in chat messages')
        handleTokenExpiration()
        return rejectWithValue('Authentication failed')
      }
      
      if (error.response?.status === 404) {
        return rejectWithValue('Chat not found')
      }
      
      toast.error('Failed to fetch chat messages')
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch chat messages')
    }
  }
)

// Send message (POST to chat endpoint)
export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ token, chatId, message, attachment = null }, { rejectWithValue }) => {
    try {
      
      // Validate chatId is a string UUID
      if (!chatId || typeof chatId !== 'string') {
        console.error('🔌 Invalid chatId:', chatId, 'Type:', typeof chatId)
        return rejectWithValue('Invalid chat ID')
      }
      
      const formData = new FormData()
      formData.append('message', message)
      
      if (attachment) {
        formData.append('attachment', attachment)
      }
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await axios.post(
        `${apiBaseUrl}/ai/chats/${chatId}/`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            // Don't set Content-Type for FormData, let browser set it
          },
        }
      )
      
      return { chatId, message: response.data }
    } catch (error) {
      console.error('🔌 Error sending message:', error.response?.data || error.message)
      
      // Check for token expiration
      if (error.response?.data && isTokenExpired(error.response.data)) {
        console.log('🔒 Token expired detected in send message')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }
      
      if (error.response?.status === 401) {
        console.log('🔒 Unauthorized (401) in send message')
        handleTokenExpiration()
        return rejectWithValue('Authentication failed')
      }
      
      toast.error('Failed to send message')
      return rejectWithValue(error.response?.data?.message || 'Failed to send message')
    }
  }
)

    // Add incoming message from WebSocket
    export const addIncomingMessage = createAsyncThunk(
      'chat/addIncomingMessage',
      async (messageData, { rejectWithValue, getState }) => {
        try {
          const state = getState()
          const existingMessage = state.chat.currentChatMessages.find(
            msg => {
              // For contract messages, check by contract ID
              if (messageData.isContract && msg.isContract) {
                return msg.contract?.id === messageData.contract?.id
              }
              
              // For itinerary messages, check by itinerary ID
              if (messageData.isItinerary && msg.isItinerary) {
                return msg.itinerary?.id === messageData.itinerary?.id
              }
              
              // For regular messages, check by message ID or content
              return msg.id === messageData.id || 
                     (msg.chat && msg.chat.id === messageData.id) ||
                     (msg.message === messageData.message && 
                      msg.created_at === messageData.created_at)
            }
          )
          
          if (existingMessage) {
    
            return null
          }
          
          return messageData
        } catch (error) {
          console.error('🔌 Error adding incoming message:', error)
          return rejectWithValue('Failed to add incoming message')
        }
      }
    )

// Update chat list with new message
export const updateChatList = createAsyncThunk(
  'chat/updateChatList',
  async (chatUpdate, { rejectWithValue }) => {
    try {
      return chatUpdate
    } catch (error) {
      return rejectWithValue('Failed to update chat list')
    }
  }
)

const initialState = {
  // Chat history (person list)
  chatHistory: [],
  chatHistoryLoading: false,
  chatHistoryError: null,
  
  // Current chat messages
  currentChatId: null,
  currentChatMessages: [],
  currentChatLoading: false,
  currentChatError: null,
  
  // Send message state
  sendMessageLoading: false,
  sendMessageError: null,
  
  // WebSocket state
  isConnected: false,
  lastMessage: null,
  
  // UI state
  selectedChat: null,
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Clear chat data
    clearChatData: (state) => {
      state.chatHistory = []
      state.currentChatMessages = []
      state.currentChatId = null
      state.selectedChat = null
      state.chatHistoryError = null
      state.currentChatError = null
    },
    
    // Set current chat
    setCurrentChat: (state, action) => {
      const selectedChatData = action.payload
      state.selectedChat = selectedChatData
      
      // Extract chat ID safely. If selectedChatData is the full chat object, use selectedChatData.chat.id.
      // If it's just the ID string, use it directly.
      let extractedChatId = null
      if (selectedChatData && typeof selectedChatData === 'object' && selectedChatData.chat?.id) {
        extractedChatId = selectedChatData.chat.id
      } else if (typeof selectedChatData === 'string') {
        extractedChatId = selectedChatData
      }
      state.currentChatId = extractedChatId

      // Ensure currentChatMessages is an array when setting a new chat
      if (!Array.isArray(state.currentChatMessages)) {
        state.currentChatMessages = []
      }
    },
    
    // Clear current chat
    clearCurrentChat: (state) => {
      state.selectedChat = null
      state.currentChatId = null
      state.currentChatMessages = []
    },
    
    // Update WebSocket connection status
    setWebSocketStatus: (state, action) => {
      state.isConnected = action.payload
    },
    
    // Add message locally (optimistic update)
    addMessageLocally: (state, action) => {
      const { chatId, message, isOutgoing = true, messageId, attachment = null, senderName, receiverName, currentUserId } = action.payload
      
      if (state.currentChatId === chatId) {
        // Ensure currentChatMessages is an array
        if (!Array.isArray(state.currentChatMessages)) {
          state.currentChatMessages = []
        }
        
        // Add message in flat structure (matching API response)
        // Use provided sender/receiver names if available, otherwise use default logic
        const newMessage = {
          id: messageId || Date.now().toString(),
          message: message,
          // Keep File objects as-is for proper attachment display
          // The AttachmentDisplay component can handle File objects directly
          attachment: attachment,
          created_at: new Date().toISOString(),
          sender_name: senderName,
          receiver_name: receiverName,
          // Add positioning fields for proper message direction detection
          type: isOutgoing ? 'sent' : 'received',
          sender: isOutgoing ? 'user' : 'expert',
          // Add sender info for positioning logic
          sender_id: isOutgoing ? currentUserId : null
        }
        
        // Add new message at the bottom
        state.currentChatMessages.push(newMessage)
        
        // Sort messages to maintain chronological order (oldest first, newest last)
        state.currentChatMessages.sort((a, b) => {
          const dateA = new Date(a.created_at || a.chat?.created_at || 0)
          const dateB = new Date(b.created_at || b.chat?.created_at || 0)
          return dateA - dateB // Ascending order: oldest first
        })
      }
    },
    
    // Remove local message (if send failed)
    removeLocalMessage: (state, action) => {
      const { messageId } = action.payload
      if (Array.isArray(state.currentChatMessages)) {
        state.currentChatMessages = state.currentChatMessages.filter(
          msg => msg.id !== messageId
        )
      }
    },

    // Update existing message (for contract status updates)
    updateExistingMessage: (state, action) => {
      const { messageId, updates } = action.payload
     
      if (Array.isArray(state.currentChatMessages)) {
        const messageIndex = state.currentChatMessages.findIndex(
          msg => {
            // Check direct message ID match
            if (msg.id === messageId) return true
            
            // Check itinerary ID match for itinerary messages
            if (msg.isItinerary && (msg.itinerary?.id === messageId || msg.itinerary_submit?.id === messageId)) {
              return true
            }
            
            return false
          }
        )
     
        
        if (messageIndex !== -1) {
          const originalMessage = state.currentChatMessages[messageIndex]
          
          // Deep merge the updates, especially for nested contract objects
          const updatedMessage = {
            ...state.currentChatMessages[messageIndex],
            ...updates
          }
          
          // Special handling for contract updates
          if (updates.contract && originalMessage.contract) {
            updatedMessage.contract = {
              ...originalMessage.contract,
              ...updates.contract
            }
          }
          
          // Special handling for itinerary updates
          if (updates.itinerary && originalMessage.itinerary) {
            updatedMessage.itinerary = {
              ...originalMessage.itinerary,
              ...updates.itinerary
            }
          }
          
          // Special handling for itinerary_submit updates
          if (updates.itinerary_submit && originalMessage.itinerary_submit) {
            updatedMessage.itinerary_submit = {
              ...originalMessage.itinerary_submit,
              ...updates.itinerary_submit
            }
          }
          
          state.currentChatMessages[messageIndex] = updatedMessage
          
         
        } else {
          console.log("🔌 🔴 Message not found in Redux state")
        }
      } else {
        console.log("🔌 🔴 currentChatMessages is not an array:", typeof state.currentChatMessages)
      }
    },

    // Update contract status in messages
    updateContractStatus: (state, action) => {
      const { contractId, status, is_accepted, payment_url } = action.payload
      
      if (state.currentChatMessages && Array.isArray(state.currentChatMessages)) {
        state.currentChatMessages = state.currentChatMessages.map(message => {
          if (message.isContract && message.contract && message.contract.id === contractId) {
            return {
              ...message,
              contract: {
                ...message.contract,
                status: status,
                is_accepted: is_accepted,
                ...(payment_url && { payment_url: payment_url })
              }
            }
          }
          return message
        })
      }
    },

    // Update itinerary status in messages
    updateItineraryStatus: (state, action) => {
      const { itineraryId, status } = action.payload
      
      if (state.currentChatMessages && Array.isArray(state.currentChatMessages)) {
        state.currentChatMessages = state.currentChatMessages.map(message => {
          if (message.isItinerary && message.itinerary && message.itinerary.id === itineraryId) {
            return {
              ...message,
              itinerary: {
                ...message.itinerary,
                status: status
              }
            }
          }
          return message
        })
      }
    },
  },
  extraReducers: (builder) => {
    // Get chat history
    builder
      .addCase(getChatHistory.pending, (state) => {
        state.chatHistoryLoading = true
        state.chatHistoryError = null
      })
      .addCase(getChatHistory.fulfilled, (state, action) => {
        state.chatHistoryLoading = false
        state.chatHistory = action.payload || []
      })
      .addCase(getChatHistory.rejected, (state, action) => {
        state.chatHistoryLoading = false
        state.chatHistoryError = action.payload
      })
    
    // Get chat messages
    builder
      .addCase(getChatMessages.pending, (state) => {
        state.currentChatLoading = true
        state.currentChatError = null
      })
      .addCase(getChatMessages.fulfilled, (state, action) => {
        state.currentChatLoading = false
        state.currentChatId = action.payload.chatId
        
        console.log('🔌 ChatSlice - getChatMessages.fulfilled:', {
          chatId: action.payload.chatId,
          messagesCount: action.payload.messages?.length || 0,
          messages: action.payload.messages
        })
        
        // Sort messages by created_at timestamp (oldest first, newest last)
        const sortedMessages = Array.isArray(action.payload.messages) 
          ? action.payload.messages.sort((a, b) => {
              const dateA = new Date(a.created_at || a.chat?.created_at || 0)
              const dateB = new Date(b.created_at || b.chat?.created_at || 0)
              return dateA - dateB // Ascending order: oldest first
            })
          : []
        
        state.currentChatMessages = sortedMessages
        
        console.log('🔌 ChatSlice - Messages sorted and set:', {
          sortedCount: sortedMessages.length,
          firstMessage: sortedMessages[0],
          lastMessage: sortedMessages[sortedMessages.length - 1]
        })
       
        // Log each message to check for voice messages
        if (state.currentChatMessages.length > 0) {
          state.currentChatMessages.forEach((msg, index) => {
            console.log(`🔌 ChatSlice - Message ${index}:`, {
              id: msg.id,
              message: msg.message,
              created_at: msg.created_at,
              isContract: msg.isContract,
              isItinerary: msg.isItinerary
            })
          })
        }
      })
      .addCase(getChatMessages.rejected, (state, action) => {
        state.currentChatLoading = false
        state.currentChatError = action.payload
      })
    
    // Send message
    builder
      .addCase(sendMessage.pending, (state) => {
        state.sendMessageLoading = true
        state.sendMessageError = null
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendMessageLoading = false
        // Message was already added locally, just update with server response if needed
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendMessageLoading = false
        state.sendMessageError = action.payload
      })
    
    // Add incoming message
    builder
      .addCase(addIncomingMessage.fulfilled, (state, action) => {
        const messageData = action.payload
        
        
        // Skip if message is null (already exists)
        if (!messageData) {
          return
        }
        
        state.lastMessage = messageData
        
        // Ensure currentChatMessages is an array
        if (!Array.isArray(state.currentChatMessages)) {
          state.currentChatMessages = []
        }
        
        // Add to current chat messages (flat structure for API messages)
        const messageToAdd = {
          id: messageData.id,
          message: messageData.message,
          attachment: messageData.attachment,
          created_at: messageData.created_at,
          sender_name: messageData.sender_name,
          receiver_name: messageData.receiver_name,
          // Preserve contract data if present
          isContract: messageData.isContract,
          contract: messageData.contract,
        }
        
        
        // Check if this message already exists (for optimistic updates)
        const existingMessageIndex = state.currentChatMessages.findIndex(
          msg => {
            // For contract messages, check by ID
            if (messageData.isContract && msg.isContract) {
              return msg.id === messageData.id
            }
            // For regular messages, check by content and sender
            return msg.message === messageData.message && 
                   msg.sender_name === messageData.sender_name &&
                   Math.abs(new Date(msg.created_at) - new Date(messageData.created_at)) < 5000 // Within 5 seconds
          }
        )
        
        if (existingMessageIndex !== -1) {
          // Update existing message with server ID
          state.currentChatMessages[existingMessageIndex] = messageToAdd
        } else {
          // Add new message at the bottom (newest messages go at the end)
          state.currentChatMessages.push(messageToAdd)
          
          // Sort messages to maintain chronological order (oldest first, newest last)
          state.currentChatMessages.sort((a, b) => {
            const dateA = new Date(a.created_at || a.chat?.created_at || 0)
            const dateB = new Date(b.created_at || b.chat?.created_at || 0)
            return dateA - dateB // Ascending order: oldest first
          })
        }
        
       
        // Update chat history with new message
        const chatIndex = state.chatHistory.findIndex(
          chat => chat.user?.id === messageData.sender_id || chat.chat?.id === messageData.chat_id
        )
        
        if (chatIndex !== -1) {
          // Update existing chat
          state.chatHistory[chatIndex] = {
            ...state.chatHistory[chatIndex],
            chat: {
              ...state.chatHistory[chatIndex].chat,
              message: messageData.message,
              created_at: messageData.created_at,
            }
          }
        }
        
      })
    
    // Update chat list
    builder
      .addCase(updateChatList.fulfilled, (state, action) => {
        const update = action.payload
        const chatIndex = state.chatHistory.findIndex(
          chat => chat.chat?.id === update.chat?.id
        )
        
        if (chatIndex !== -1) {
          state.chatHistory[chatIndex] = update
        } else {
          state.chatHistory.unshift(update)
        }
        
      })
  },
  
  // Update message status (for itinerary approval/rejection)
  updateMessageStatus: (state, action) => {
    const { messageId, status, messageType } = action.payload
    
    
    let foundMatch = false
    
    // Update in current chat messages
    state.currentChatMessages = state.currentChatMessages.map(msg => {
      if (messageType === 'itinerary' && msg.isItinerary) {
        
        
        if (msg.itinerary?.id === messageId || msg.itinerary_submit?.id === messageId) {
          foundMatch = true
          return {
            ...msg,
            itinerary: { 
              ...msg.itinerary, 
              status: status
            },
            itinerary_submit: {
              ...msg.itinerary_submit,
              status: status
            }
          }
        }
      }
      return msg
    })
    
  },
})

export const {
  clearChatData,
  setCurrentChat,
  clearCurrentChat,
  setWebSocketStatus,
  addMessageLocally,
  removeLocalMessage,
  updateExistingMessage,
  updateMessageStatus,
  updateContractStatus,
} = chatSlice.actions

export default chatSlice.reducer
