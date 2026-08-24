"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AdminRoute from '../../components/admin/AdminRoute'

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    if (session) {
      // Check for admin role in multiple locations
      const userRoles = session?.user?.roles || []
      const backendRoles = session?.backendData?.roles || []
      const directRoles = session?.roles || []
      
      const allRoles = [...userRoles, ...backendRoles, ...directRoles]
      const isAdminUser = allRoles.includes('admin')
      

      if (isAdminUser) {
        router.push('/admin/dashboard')
      } else {
        router.push('/dashboard')
      }
    }
  }, [session, status, router])

  return (
    <AdminRoute>
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to admin dashboard...</p>
        </div>
      </div>
    </AdminRoute>
  )
} 