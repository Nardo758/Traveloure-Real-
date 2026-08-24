import { useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSession } from 'next-auth/react'
import { sendContract, acceptContract, rejectContract, storePaymentUrl } from '../app/redux-features/contract/contractSlice'
import { toast } from 'sonner'

export const useContract = () => {
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const contracts = useSelector(state => state.contract.contracts)
  
  // Contract state
  const [showContractModal, setShowContractModal] = useState(false)
  const [contractExpert, setContractExpert] = useState(null)
  const [showContractApprovedModal, setShowContractApprovedModal] = useState(false)
  const [approvedItineraryData, setApprovedItineraryData] = useState(null)
  
  // Get payment URLs from Redux state (shared across all pages)
  const contractPaymentUrls = useSelector(state => state.contract.contractPaymentUrls || {})

  // Contract modal handlers
  const handleContractModal = useCallback((expert) => {
    
    
    // Check if we received an event instead of expert object
    if (expert && typeof expert === 'object' && expert.nativeEvent) {
      console.error('useContract - Received event object instead of expert!')
      return
    }
    
    setContractExpert(expert)
    setShowContractModal(true)
  }, [])

  const handleContractSubmit = useCallback(async (contractData, onSuccess = null) => {
    try {
      const result = await dispatch(sendContract({
        contractData,
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      })).unwrap()

      toast.success('Contract sent successfully!')
      setShowContractModal(false)
      setContractExpert(null)
      
      // Call the success callback if provided (to add contract to local messages)
      if (onSuccess && result) {
        onSuccess(result)
      }
      
      return result
    } catch (error) {
      toast.error(error.message || 'Failed to send contract')
      throw error
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  const handleContractClose = useCallback(() => {
    setShowContractModal(false)
    setContractExpert(null)
  }, [])

  // Consolidated contract action handler
  const handleContractAction = useCallback(async (contractId, action, updateChatMessages = null, refreshChatMessages = null) => {
    try {
      const actionMap = {
        accept: acceptContract,
        reject: rejectContract
      }
      
      const result = await dispatch(actionMap[action]({
        contractId,
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      })).unwrap()
      
      // If contract was accepted and we have payment URL, show success message
      if (action === 'accept') {
      
        if (result.data && result.data.payment_url) {
          toast.success('Contract accepted! Payment URL is now available.')
          
          // Store the payment URL in Redux for shared access across all pages
          dispatch(storePaymentUrl({
            contractId,
            paymentUrl: result.data.payment_url
          }))
          if (updateChatMessages) {
            updateChatMessages(prev => {
              const updatedMessages = prev.map(msg => {
                if (msg.isContract && msg.contract && msg.contract.id === contractId) {
                  return {
                    ...msg,
                    contract: {
                      ...msg.contract,
                      status: 'accepted',
                      is_accepted: true,
                      payment_url: result.data.payment_url
                    }
                  }
                }
                return msg
              })
              
              // Log the updated messages to verify the change
              const updatedContract = updatedMessages.find(msg => 
                msg.isContract && msg.contract && msg.contract.id === contractId
              )
             
              
              return updatedMessages
            })
          }
          
          // Refresh chat messages to get the latest contract data with payment URL
          // Add a small delay to ensure the immediate update happens first
          if (refreshChatMessages) {
            setTimeout(async () => {
              try {
                await refreshChatMessages()
              } catch (error) {
                console.error('🔌 Failed to refresh chat messages after contract acceptance:', error)
              }
            }, 500) // 500ms delay
          }
        } else {
          toast.success('Contract accepted!')
          
          // Still refresh chat messages even if no payment URL to get updated status
          if (refreshChatMessages) {
            try {
              await refreshChatMessages()
            } catch (error) {
              console.error('🔌 Failed to refresh chat messages after contract acceptance:', error)
            }
          }
        }
      }
      
      return { result, action }
    } catch (error) {
      // Check if this is an onboarding requirement error
      if (error.requiresOnboarding) {
        // Don't show error toast, let the component handle the onboarding requirement
        throw error
      }
      
      toast.error(error.message || `Failed to ${action} contract`)
      throw error
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  const handleContractPay = useCallback(async (contractId, messages) => {
    try {
      const contractMessage = messages.find(msg =>
        msg.isContract && msg.contract && msg.contract.id === contractId
      )

      // Check for payment URL in stored contract payment URLs first (from PATCH response)
      let paymentUrl = contractPaymentUrls[contractId]
      
      // If not found in stored URLs, check chat message
      if (!paymentUrl) {
        paymentUrl = contractMessage?.contract?.payment_url
      }
      
      // If still not found, check Redux store as fallback
      if (!paymentUrl) {
        const contractFromStore = contracts.find(c => c.id === contractId)
        paymentUrl = contractFromStore?.payment_url
      }
      
   
   

      if (paymentUrl) {
        window.open(paymentUrl, '_blank')
        toast.success('Redirecting to payment page...')
      } else {
        toast.error('Payment URL not available. Please accept the contract first.')
      }
    } catch (error) {
      toast.error('Failed to process payment')
    }
  }, [contracts])

  // Feedback submission for approved contract
  const handleSubmitFeedback = useCallback(async (feedbackData) => {
    try {
      const localExpertId = approvedItineraryData?.expertId

      if (!localExpertId) {
        throw new Error('Local expert ID not found in approved itinerary data')
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/ai/reviews/create/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.backendData.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          local_expert: localExpertId,
          rating: feedbackData.rating,
          review: feedbackData.feedback
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to submit feedback')
      }

      const result = await response.json()
      return result
    } catch (error) {
      throw error
    }
  }, [approvedItineraryData, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  return {
    // State
    showContractModal,
    contractExpert,
    showContractApprovedModal,
    approvedItineraryData,
    contractPaymentUrls,
    
    // Actions
    setShowContractModal,
    setContractExpert,
    setShowContractApprovedModal,
    setApprovedItineraryData,
    handleContractModal,
    handleContractSubmit,
    handleContractClose,
    handleContractAction,
    handleContractPay,
    handleSubmitFeedback
  }
}


