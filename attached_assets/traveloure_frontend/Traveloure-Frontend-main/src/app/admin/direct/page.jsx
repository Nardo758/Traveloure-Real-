"use client"

import { useState } from 'react'
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { LocalExpertsManagement } from '../../../components/admin/LocalExpertsManagement'

export default function DirectAdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
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
        <main className="flex-1 overflow-y-auto bg-white">
          <LocalExpertsManagement />
        </main>
      </div>
    </div>
  )
} 