"use client"

import { useAdmin } from '../../../hooks/useAdmin'
import { useSession } from 'next-auth/react'

export default function AdminTest() {
  const { isAdmin, isLoading, isAuthenticated, session } = useAdmin()
  const { data: sessionData, status } = useSession()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Admin Test Page</h1>
      
      <div className="space-y-4">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Admin Detection Results:</h2>
          <p><strong>isAdmin:</strong> {isAdmin ? '✅ Yes' : '❌ No'}</p>
          <p><strong>isLoading:</strong> {isLoading ? '🔄 Yes' : '✅ No'}</p>
          <p><strong>isAuthenticated:</strong> {isAuthenticated ? '✅ Yes' : '❌ No'}</p>
        </div>

        <div className="bg-blue-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Session Data:</h2>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(sessionData, null, 2)}
          </pre>
        </div>

        <div className="bg-green-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Backend Data:</h2>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(sessionData?.backendData, null, 2)}
          </pre>
        </div>

        <div className="bg-yellow-100 p-4 rounded">
          <h2 className="font-semibold mb-2">User Data:</h2>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(sessionData?.user, null, 2)}
          </pre>
        </div>

        <div className="bg-red-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Roles Check:</h2>
          <p><strong>backendData.roles:</strong> {JSON.stringify(sessionData?.backendData?.roles)}</p>
          <p><strong>user.roles:</strong> {JSON.stringify(sessionData?.user?.roles)}</p>
          <p><strong>Includes 'admin':</strong> {sessionData?.backendData?.roles?.includes('admin') ? '✅ Yes' : '❌ No'}</p>
        </div>
      </div>
    </div>
  )
} 