"use client"

import { useSession } from 'next-auth/react'

export default function SimpleAdminPage() {
  const { data: session, status } = useSession()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Simple Admin Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Session Information</h2>
          
          <div className="space-y-2">
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Authenticated:</strong> {status === 'authenticated' ? 'Yes' : 'No'}</p>
            <p><strong>User:</strong> {session?.user?.name || 'Not logged in'}</p>
            <p><strong>Email:</strong> {session?.user?.email || 'N/A'}</p>
            <p><strong>Roles:</strong> {JSON.stringify(session?.backendData?.roles || [])}</p>
            <p><strong>Is Admin:</strong> {session?.backendData?.roles?.includes('admin') ? 'Yes' : 'No'}</p>
          </div>
          
          <div className="mt-6 p-4 bg-gray-100 rounded">
            <h3 className="font-semibold mb-2">Full Session Data:</h3>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(session, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
} 