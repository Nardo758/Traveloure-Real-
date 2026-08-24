import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../auth/[...nextauth]/route'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL

export async function POST(request, { params }) {
  try {
    
    // Get session and token
    const session = await getServerSession(authOptions)
    
  
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get itinerary ID from params
    const { id: itineraryId } = params
    
    // Get request body
    const body = await request.json()
    
    const { status } = body
    
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be "accepted" or "rejected"' }, { status: 400 })
    }
    
    // Make request to backend
    const payload = { status }
   
    
    const response = await fetch(`${BASE_URL}/ai/submit-itinerary/${itineraryId}/decision/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`
      },
      body: JSON.stringify(payload)
    })
    
   
    
    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: 'Backend request failed' }, { status: response.status })
    }
    
    const data = await response.json()
    
    return NextResponse.json(data)
    
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


