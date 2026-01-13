"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { ComingSoon } from '../../../components/admin/ComingSoon'

export default function AdminBookings() {
  const { isAdmin, isLoading, isAuthenticated } = useAdmin()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isAdmin) {
      router.push('/dashboard')
    }
  }, [isAdmin, isLoading, isAuthenticated, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <AdminSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Admin Header */}
        <AdminHeader onMenuToggle={handleMenuToggle} />
        
        {/* Main Content Area */}
        <ComingSoon pageTitle="Bookings & Services" />
      </div>
    </div>
  )
} 