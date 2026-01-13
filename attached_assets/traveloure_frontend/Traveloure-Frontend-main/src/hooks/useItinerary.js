import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export const useItinerary = () => {
  // Itinerary state
  const [showItineraryDecisionModal, setShowItineraryDecisionModal] = useState(false)
  const [selectedItinerary, setSelectedItinerary] = useState(null)

  // Itinerary action handlers
  const handleItineraryAction = useCallback(async (itineraryId, action) => {
    try {
      const statusMap = {
        approve: 'approved',
        reject: 'rejected',
        requestEdit: 'edit_requested'
      }
      
      const messages = {
        approve: 'Itinerary approved successfully!',
        reject: 'Itinerary rejected successfully!',
        requestEdit: 'Edit requested for itinerary!'
      }
      
      toast.success(messages[action])
      return { status: statusMap[action], action }
    } catch (error) {
      toast.error(`Failed to ${action} itinerary`)
      throw error
    }
  }, [])

  const handleItineraryDecision = useCallback((itinerary) => {
    setSelectedItinerary(itinerary)
    setShowItineraryDecisionModal(true)
  }, [])

  const handleCloseItineraryDecision = useCallback(() => {
    setShowItineraryDecisionModal(false)
    setSelectedItinerary(null)
  }, [])

  const handleApproveItinerary = useCallback(async (itineraryId) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/ai/submit-itinerary/${itineraryId}/decision/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'accepted' })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to approve itinerary')
      }

      const result = await response.json()
      toast.success('Itinerary approved successfully!')
      return result
    } catch (error) {
      toast.error('Failed to approve itinerary')
      throw error
    }
  }, [])

  const handleRejectItinerary = useCallback(async (itineraryId) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/ai/submit-itinerary/${itineraryId}/decision/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to reject itinerary')
      }

      const result = await response.json()
      toast.success('Itinerary rejected successfully!')
      return result
    } catch (error) {
      toast.error('Failed to reject itinerary')
      throw error
    }
  }, [])

  return {
    // State
    showItineraryDecisionModal,
    selectedItinerary,
    
    // Actions
    setShowItineraryDecisionModal,
    setSelectedItinerary,
    handleItineraryAction,
    handleItineraryDecision,
    handleCloseItineraryDecision,
    handleApproveItinerary,
    handleRejectItinerary
  }
}


