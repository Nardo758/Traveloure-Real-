import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]/route'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export async function POST(request) {
  try {
    // Get the session to verify authentication
    const session = await getServerSession(authOptions)
    
    // Also try to get token from Authorization header as fallback
    const authHeader = request.headers.get('authorization')
    const tokenFromHeader = authHeader?.replace('Bearer ', '')
    
    const accessToken = session?.backendData?.accessToken || 
                       session?.backendData?.backendData?.accessToken || 
                       tokenFromHeader
    
    console.log('🔌 Submit Itinerary API - Session:', !!session)
    console.log('🔌 Submit Itinerary API - Token from session:', !!session?.backendData?.accessToken)
    console.log('🔌 Submit Itinerary API - Token from header:', !!tokenFromHeader)
    
    if (!accessToken) {
      console.error('❌ Submit Itinerary API - No access token found')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get the form data from the request
    const formData = await request.formData()
    
    // Extract form fields
    const title = formData.get('title')
    const description = formData.get('description')
    const location = formData.get('location')
    const attachment = formData.get('attachment')

    // Validate required fields
    if (!title || !description || !location) {
      return NextResponse.json(
        { error: 'Title, description, and location are required' },
        { status: 400 }
      )
    }

    // Prepare the payload for the backend API
    const payload = new FormData()
    payload.append('title', title)
    payload.append('description', description)
    payload.append('location', location)
    
    if (attachment) {
      payload.append('attachment', attachment)
    }

    // Make the API call to the backend

    
    const response = await fetch(`${BASE_URL}/ai/submit-itinerary/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: payload
    })
    
 

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { 
          error: errorData.error || errorData.message || 'Failed to submit itinerary',
          details: errorData
        },
        { status: response.status }
      )
    }

    const result = await response.json()
    
    return NextResponse.json({
      success: true,
      message: 'Itinerary submitted successfully',
      data: result
    })

  } catch (error) {
    console.error('Error in submit-itinerary API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
