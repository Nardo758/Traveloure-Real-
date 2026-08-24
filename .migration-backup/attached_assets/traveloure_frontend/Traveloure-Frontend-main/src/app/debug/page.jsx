"use client"

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function DebugPage() {
  const { data: session, status } = useSession()
  const [localStorageData, setLocalStorageData] = useState({})
  const [urlData, setUrlData] = useState({})

  useEffect(() => {
    // Get localStorage data
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem('accessToken')
      const refreshToken = localStorage.getItem('refreshToken')
      const userData = localStorage.getItem('userData')
      
      setLocalStorageData({
        accessToken: accessToken ? 'Present' : 'Not found',
        refreshToken: refreshToken ? 'Present' : 'Not found',
        userData: userData ? 'Present' : 'Not found'
      })

      // Get URL data
      const hash = window.location.hash
      const urlParams = new URLSearchParams(hash.substring(1))
      
      setUrlData({
        hash: hash,
        accessToken: urlParams.get('access') ? 'Present' : 'Not found',
        refreshToken: urlParams.get('refresh') ? 'Present' : 'Not found',
        fullUrl: window.location.href
      })
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* NextAuth Session */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">NextAuth Session</h2>
            <div className="space-y-2">
              <p><strong>Status:</strong> {status}</p>
              <p><strong>Has Session:</strong> {session ? 'Yes' : 'No'}</p>
              <p><strong>Access Token:</strong> {session?.backendData?.accessToken ? 'Present' : 'Not found'}</p>
              <p><strong>Refresh Token:</strong> {session?.refreshToken ? 'Present' : 'Not found'}</p>
              <p><strong>Provider:</strong> {session?.provider || 'None'}</p>
              <p><strong>User Email:</strong> {session?.user?.email || 'None'}</p>
            </div>
          </div>

          {/* LocalStorage */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">LocalStorage</h2>
            <div className="space-y-2">
              <p><strong>Access Token:</strong> {localStorageData.accessToken}</p>
              <p><strong>Refresh Token:</strong> {localStorageData.refreshToken}</p>
              <p><strong>User Data:</strong> {localStorageData.userData}</p>
            </div>
          </div>

          {/* URL Data */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">URL Data</h2>
            <div className="space-y-2">
              <p><strong>Hash:</strong> {urlData.hash || 'None'}</p>
              <p><strong>Access Token in URL:</strong> {urlData.accessToken}</p>
              <p><strong>Refresh Token in URL:</strong> {urlData.refreshToken}</p>
              <p><strong>Full URL:</strong> <span className="text-xs break-all">{urlData.fullUrl}</span></p>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Actions</h2>
            <div className="space-y-2">
              <button 
                onClick={() => window.location.href = '/token-callback'}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Go to Token Callback
              </button>
              <br />
              <button 
                onClick={() => {
                  localStorage.clear()
                  window.location.reload()
                }}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Clear LocalStorage & Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 