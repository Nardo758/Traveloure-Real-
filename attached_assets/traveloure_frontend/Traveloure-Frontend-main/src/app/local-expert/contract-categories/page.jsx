"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { Navbar } from '../../../components/help-me-decide/navbar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Button } from '../../../components/ui/button'
import { 
  addCategory, 
  fetchCategories, 
  addSubcategory, 
  fetchSubcategories,
  updateCategory,
  updateSubcategory,
  deleteCategory,
  deleteSubcategory,
  setSelectedCategory 
} from '../../../app/redux-features/category/categorySlice'
import { Plus, Folder, FolderOpen, X, ChevronDown, ChevronRight, Edit2, Save, Trash2, Eye, Search, Menu } from 'lucide-react'

export default function LocalExpertContractCategories() {
  const { isLocalExpert, isLoading: localExpertLoading, isAuthenticated, session } = useLocalExpert()
  const router = useRouter()
  const dispatch = useDispatch()
  const { data: sessionData } = useSession()
  
  const categoryState = useSelector((state) => state.category)
  const { 
    categories = [], 
    subcategories = {}, 
    loading = false, 
    selectedCategory = null 
  } = categoryState || {}
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [subcategoryForm, setSubcategoryForm] = useState({
    name: '',
    price: '',
    price_type: 'flat', // 'flat' or 'hourly'
    description: ''
  })
  const [expandedCategories, setExpandedCategories] = useState({})
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingSubcategory, setEditingSubcategory] = useState(null)
  const [editCategoryForm, setEditCategoryForm] = useState({ name: '' })
  const [editSubcategoryForm, setEditSubcategoryForm] = useState({
    name: '',
    price: '',
    price_type: 'flat', // 'flat' or 'hourly'
    description: ''
  })
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [showDeleteSubcategoryModal, setShowDeleteSubcategoryModal] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState(null)
  const [subcategoryToDelete, setSubcategoryToDelete] = useState(null)
  const [showSubcategoryDetails, setShowSubcategoryDetails] = useState(false)
  const [selectedSubcategoryDetails, setSelectedSubcategoryDetails] = useState(null)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [loadingSubcategories, setLoadingSubcategories] = useState({})

  // Get access token
  const getAccessToken = () => {
    return session?.backendData?.accessToken || 
           session?.backendData?.backendData?.accessToken ||
           sessionData?.backendData?.accessToken ||
           sessionData?.backendData?.backendData?.accessToken ||
           localStorage.getItem('accessToken')
  }

  useEffect(() => {
    if (localExpertLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isLocalExpert) {
      router.push('/dashboard')
      return
    }

    // Fetch categories on mount (only for this local expert)
    const token = getAccessToken()
    if (token) {
      // Get current user's ID to fetch only their categories
      const userId = session?.user?.id || 
                     session?.backendData?.user?.id || 
                     session?.backendData?.id ||
                     sessionData?.user?.id ||
                     sessionData?.backendData?.user?.id
      
      if (userId) {
        // Fetch categories filtered by expert_id (current user)
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
        fetch(`${apiBaseUrl}/auth/category/?expert_id=${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
          .then(res => {
            if (res.ok) {
              return res.json()
            }
            throw new Error('Failed to fetch categories')
          })
          .then(data => {
            // Dispatch the fulfilled action manually
            dispatch({ 
              type: 'category/fetchCategories/fulfilled', 
              payload: Array.isArray(data) ? data : [] 
            })
          })
          .catch(err => {
            console.error('Error fetching categories:', err)
            dispatch({ 
              type: 'category/fetchCategories/rejected', 
              payload: err.message 
            })
          })
      } else {
        // Fallback to fetching all categories if user ID not found
        dispatch(fetchCategories(token))
      }
    }
  }, [isLocalExpert, localExpertLoading, isAuthenticated, router, dispatch, session, sessionData])

  // Prevent any unwanted form submissions or page reloads
  useEffect(() => {
    const handleFormSubmit = (e) => {
      const form = e.target
      if (form && form.tagName === 'FORM') {
        const isEditForm = form.querySelector('input[type="text"]') && 
                          form.querySelector('button[type="submit"]')
        if (isEditForm) {
          return
        }
      }
    }

    const handleBeforeUnload = (e) => {
      return undefined
    }

    document.addEventListener('submit', handleFormSubmit, true)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('submit', handleFormSubmit, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) return

    const token = getAccessToken()
    if (token) {
      await dispatch(addCategory({ token, name: categoryForm.name.trim() }))
      setCategoryForm({ name: '' })
      // Refresh categories list with expert_id filter
      const userId = session?.user?.id || 
                     session?.backendData?.user?.id || 
                     session?.backendData?.id ||
                     sessionData?.user?.id ||
                     sessionData?.backendData?.user?.id
      if (userId) {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
        fetch(`${apiBaseUrl}/auth/category/?expert_id=${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
          .then(res => res.ok ? res.json() : Promise.reject())
          .then(data => {
            dispatch({ 
              type: 'category/fetchCategories/fulfilled', 
              payload: Array.isArray(data) ? data : [] 
            })
          })
          .catch(() => {})
      } else {
        dispatch(fetchCategories(token))
      }
    }
  }

  const handleSelectCategory = (category, e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    dispatch(setSelectedCategory(category))
  }

  const fetchSubcategoriesForCategory = async (categoryId) => {
    try {
      setLoadingSubcategories(prev => ({ ...prev, [categoryId]: true }))
      
      const token = getAccessToken()
      if (!token) {
        setLoadingSubcategories(prev => ({ ...prev, [categoryId]: false }))
        return
      }

      // Get current user's ID to fetch subcategories for this expert
      const userId = session?.user?.id || 
                     session?.backendData?.user?.id || 
                     session?.backendData?.id ||
                     sessionData?.user?.id ||
                     sessionData?.backendData?.user?.id

      if (!userId) {
        // Fallback to regular fetch if user ID not found
        await dispatch(fetchSubcategories({ token, categoryId }))
        setLoadingSubcategories(prev => ({ ...prev, [categoryId]: false }))
        return
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
      const response = await fetch(`${apiBaseUrl}/auth/subcategory/?category_id=${categoryId}&expert_id=${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        // Handle both array response and object with subcategories property
        let subcategoriesList = []
        if (Array.isArray(data)) {
          subcategoriesList = data
        } else if (data.subcategories && Array.isArray(data.subcategories)) {
          subcategoriesList = data.subcategories
        } else if (data.data && Array.isArray(data.data)) {
          subcategoriesList = data.data
        }
        
        console.log('Fetched subcategories for category:', categoryId, subcategoriesList)
        
        // Dispatch to Redux to update subcategories state
        dispatch({
          type: 'category/fetchSubcategories/fulfilled',
          payload: { categoryId, subcategories: subcategoriesList }
        })
      } else {
        const errorText = await response.text()
        console.error('Failed to fetch subcategories:', response.status, errorText)
      }
    } catch (error) {
      console.error('Error fetching subcategories:', error)
    } finally {
      setLoadingSubcategories(prev => ({ ...prev, [categoryId]: false }))
    }
  }

  const handleToggleExpansion = (categoryId, e) => {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation?.()
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation()
      e.nativeEvent.preventDefault()
    }
    
    const isExpanded = expandedCategories[categoryId]
    
    // Use setTimeout to ensure state update happens after event handling
    setTimeout(() => {
      setExpandedCategories(prev => ({
        ...prev,
        [categoryId]: !isExpanded
      }))
      
      // If expanding, fetch subcategories if not already loaded
      if (!isExpanded) {
        fetchSubcategoriesForCategory(categoryId)
      }
    }, 0)
    
    return false
  }

  // Filter categories based on search query
  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  )

  const handleAddSubcategory = async (e) => {
    e.preventDefault()
    if (!selectedCategory || !subcategoryForm.name.trim()) return

    const token = getAccessToken()
    if (token) {
      await dispatch(addSubcategory({
        token,
        categoryId: selectedCategory.id,
        name: subcategoryForm.name.trim(),
        price: subcategoryForm.price,
        price_type: subcategoryForm.price_type,
        description: subcategoryForm.description.trim()
      }))
      setSubcategoryForm({ name: '', price: '', price_type: 'flat', description: '' })
      // Refresh subcategories
      fetchSubcategoriesForCategory(selectedCategory.id)
    }
  }

  const handleEditCategory = (category) => {
    setEditingCategory(category)
    setEditCategoryForm({ name: category.name })
  }

  const handleUpdateCategory = async (e) => {
    e.preventDefault()
    if (!editingCategory || !editCategoryForm.name.trim()) return

    const token = getAccessToken()
    if (token) {
      await dispatch(updateCategory({
        token,
        categoryId: editingCategory.id,
        name: editCategoryForm.name.trim()
      }))
      setEditingCategory(null)
      setEditCategoryForm({ name: '' })
      // Refresh categories with expert_id filter
      const userId = session?.user?.id || 
                     session?.backendData?.user?.id || 
                     session?.backendData?.id ||
                     sessionData?.user?.id ||
                     sessionData?.backendData?.user?.id
      if (userId) {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
        fetch(`${apiBaseUrl}/auth/category/?expert_id=${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
          .then(res => res.ok ? res.json() : Promise.reject())
          .then(data => {
            dispatch({ 
              type: 'category/fetchCategories/fulfilled', 
              payload: Array.isArray(data) ? data : [] 
            })
          })
          .catch(() => {})
      } else {
        dispatch(fetchCategories(token))
      }
    }
  }

  const handleEditSubcategory = (subcategory, categoryId) => {
    setEditingSubcategory(subcategory)
    // Fix: Get description from either field (API response uses 'description', request uses 'descritpion')
    const description = subcategory.description || subcategory.descritpion || ''
    setEditSubcategoryForm({
      name: subcategory.name || '',
      price: subcategory.price || '',
      price_type: subcategory.price_type || 'flat',
      description: description
    })
  }

  const handleViewSubcategoryDetails = (subcategory) => {
    setSelectedSubcategoryDetails(subcategory)
    setShowSubcategoryDetails(true)
  }

  const handleDeleteCategoryClick = (category) => {
    setCategoryToDelete(category)
    setShowDeleteCategoryModal(true)
  }

  const handleDeleteSubcategoryClick = (subcategory, categoryId) => {
    setSubcategoryToDelete({ ...subcategory, categoryId })
    setShowDeleteSubcategoryModal(true)
  }

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return

    const token = getAccessToken()
    if (token) {
      await dispatch(deleteCategory({ token, categoryId: categoryToDelete.id }))
      setShowDeleteCategoryModal(false)
      setCategoryToDelete(null)
      // Refresh categories with expert_id filter
      const userId = session?.user?.id || 
                     session?.backendData?.user?.id || 
                     session?.backendData?.id ||
                     sessionData?.user?.id ||
                     sessionData?.backendData?.user?.id
      if (userId) {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
        fetch(`${apiBaseUrl}/auth/category/?expert_id=${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
          .then(res => res.ok ? res.json() : Promise.reject())
          .then(data => {
            dispatch({ 
              type: 'category/fetchCategories/fulfilled', 
              payload: Array.isArray(data) ? data : [] 
            })
          })
          .catch(() => {})
      } else {
        dispatch(fetchCategories(token))
      }
    }
  }

  const confirmDeleteSubcategory = async () => {
    if (!subcategoryToDelete) return

    const token = getAccessToken()
    if (token) {
      await dispatch(deleteSubcategory({
        token,
        subcategoryId: subcategoryToDelete.id,
        categoryId: subcategoryToDelete.categoryId
      }))
      setShowDeleteSubcategoryModal(false)
      setSubcategoryToDelete(null)
      // Refresh subcategories
      fetchSubcategoriesForCategory(subcategoryToDelete.categoryId)
    }
  }

  const handleUpdateSubcategory = async (e) => {
    e.preventDefault()
    if (!editingSubcategory || !editSubcategoryForm.name.trim()) return

    const categoryId = editingSubcategory.category
    const token = getAccessToken()
    if (token) {
      await dispatch(updateSubcategory({
        token,
        subcategoryId: editingSubcategory.id,
        categoryId: categoryId,
        name: editSubcategoryForm.name.trim(),
        price: editSubcategoryForm.price,
        price_type: editSubcategoryForm.price_type,
        description: editSubcategoryForm.description.trim()
      }))
      setEditingSubcategory(null)
      setEditSubcategoryForm({ name: '', price: '', price_type: 'flat', description: '' })
      // Refresh subcategories
      fetchSubcategoriesForCategory(categoryId)
    }
  }

  if (localExpertLoading || loading) {
    return (
      <div className="flex flex-col h-screen bg-[#fcfbfa]">
        <Navbar />
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#ff2e44' }}></div>
        </div>
      </div>
    )
  }

  if (!isLocalExpert) {
    return null
  }

  // Check if any modal is open
  const isModalOpen = showDeleteCategoryModal || showDeleteSubcategoryModal || showSubcategoryDetails

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Navbar */}
      <Navbar />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local Expert Sidebar */}
        {!isModalOpen && <LocalExpertSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />}
        
        {/* Main Content */}
        <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${isModalOpen ? 'pointer-events-none' : ''}`}>
          {/* Mobile Menu Toggle Button */}
          <div className="lg:hidden absolute top-4 right-4 z-30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-white shadow-md"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto bg-[#fcfbfa] p-6">
            <div className="max-w-6xl mx-auto">
              {/* Page Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Contract Categories & Subcategories
                </h1>
                <p className="text-gray-600">
                  Manage your contract categories and their subcategories
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Add Category Form */}
                <div className="space-y-6">
                  {/* Add Category Card */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Plus className="w-5 h-5" style={{ color: '#ff2e44' }} />
                      <h2 className="text-xl font-semibold text-gray-900">Add Category</h2>
                    </div>
                    
                    <form onSubmit={handleAddCategory} className="space-y-4">
                      <div>
                        <label 
                          htmlFor="categoryName" 
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          Ways You Can Help Travelers or Services You Provide <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="categoryName"
                          value={categoryForm.name}
                          onChange={(e) => setCategoryForm({ name: e.target.value })}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                          style={{ '--tw-ring-color': '#ff2e44' }}
                          onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                          onBlur={(e) => e.target.style.boxShadow = ''}
                          placeholder="e.g., Travel Packages, Consulting Services"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{ backgroundColor: '#ff2e44' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e01e35'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff2e44'}
                      >
                        {loading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            Add Category
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Add Subcategory Card */}
                  {selectedCategory && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-5 h-5" style={{ color: '#ff2e44' }} />
                          <h2 className="text-xl font-semibold text-gray-900">
                            Add Subcategory
                          </h2>
                        </div>
                        <button
                          onClick={() => dispatch(setSelectedCategory(null))}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#ff2e4410' }}>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Selected Category:</span>{' '}
                          <span style={{ color: '#ff2e44' }}>{selectedCategory.name}</span>
                        </p>
                      </div>

                      <form onSubmit={handleAddSubcategory} className="space-y-4">
                        <div>
                          <label 
                            htmlFor="subcategoryName" 
                            className="block text-sm font-medium text-gray-700 mb-2"
                          >
                            Subcategory Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="subcategoryName"
                            value={subcategoryForm.name}
                            onChange={(e) => setSubcategoryForm(prev => ({ ...prev, name: e.target.value }))}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                            onBlur={(e) => e.target.style.boxShadow = ''}
                            placeholder="Enter subcategory name"
                          />
                        </div>

                        <div>
                          <label 
                            htmlFor="subcategoryPriceType" 
                            className="block text-sm font-medium text-gray-700 mb-2"
                          >
                            Price Type <span className="text-red-500">*</span>
                          </label>
                          <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="priceType"
                                value="flat"
                                checked={subcategoryForm.price_type === 'flat'}
                                onChange={(e) => setSubcategoryForm(prev => ({ ...prev, price_type: e.target.value }))}
                                className="w-4 h-4"
                                style={{ accentColor: '#ff2e44' }}
                              />
                              <span className="text-sm text-gray-700">Flat Fee</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="priceType"
                                value="hourly"
                                checked={subcategoryForm.price_type === 'hourly'}
                                onChange={(e) => setSubcategoryForm(prev => ({ ...prev, price_type: e.target.value }))}
                                className="w-4 h-4"
                                style={{ accentColor: '#ff2e44' }}
                              />
                              <span className="text-sm text-gray-700">Hourly</span>
                            </label>
                          </div>
                          <label 
                            htmlFor="subcategoryPrice" 
                            className="block text-sm font-medium text-gray-700 mb-2"
                          >
                            Price
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                              {subcategoryForm.price_type === 'hourly' ? '$/hr' : '$'}
                            </span>
                            <input
                              type="number"
                              id="subcategoryPrice"
                              value={subcategoryForm.price}
                              onChange={(e) => setSubcategoryForm(prev => ({ ...prev, price: e.target.value }))}
                              min="0"
                              step="0.01"
                              className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                              style={{ '--tw-ring-color': '#ff2e44' }}
                              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                              onBlur={(e) => e.target.style.boxShadow = ''}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div>
                          <label 
                            htmlFor="subcategoryDescription" 
                            className="block text-sm font-medium text-gray-700 mb-2"
                          >
                            Description
                          </label>
                          <textarea
                            id="subcategoryDescription"
                            value={subcategoryForm.description}
                            onChange={(e) => setSubcategoryForm(prev => ({ ...prev, description: e.target.value }))}
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                            onBlur={(e) => e.target.style.boxShadow = ''}
                            placeholder="Enter description (optional)"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          style={{ backgroundColor: '#ff2e44' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e01e35'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff2e44'}
                        >
                          {loading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Add Subcategory
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Right Column - Categories List */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Folder className="w-5 h-5" style={{ color: '#ff2e44' }} />
                      <h2 className="text-xl font-semibold text-gray-900">
                        Categories ({filteredCategories.length})
                      </h2>
                    </div>
                  </div>

                  {/* Search Field */}
                  {categories.length > 0 && (
                    <div className="mb-4 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder="Search categories..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                        onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                        onBlur={(e) => e.target.style.boxShadow = ''}
                      />
                      {categorySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCategorySearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {categories.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No categories yet. Add your first category to get started.</p>
                    </div>
                  ) : filteredCategories.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No categories found matching "{categorySearchQuery}"</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCategories.map((category) => {
                        const isExpanded = expandedCategories[category.id]
                        const categorySubcategories = subcategories[category.id] || []
                        const isSelected = selectedCategory?.id === category.id
                        const isEditing = editingCategory?.id === category.id

                        return (
                          <div
                            key={category.id}
                            className={`border rounded-lg transition-colors ${
                              isSelected 
                                ? 'border-gray-300'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={isSelected ? { borderColor: '#ff2e44', backgroundColor: '#ff2e4410' } : {}}
                            onClick={(e) => {
                              const target = e.target
                              const isInteractive = target.closest('[role="button"]') !== null ||
                                                   target.closest('button') !== null ||
                                                   target.closest('form') !== null ||
                                                   target.closest('input') !== null ||
                                                   target.closest('textarea') !== null
                              
                              if (!isInteractive) {
                                e.preventDefault()
                                e.stopPropagation()
                              }
                            }}
                          >
                            {/* Category Header */}
                            <div 
                              className="p-4 flex items-center justify-between"
                              onClick={(e) => {
                                const target = e.target
                                const isButton = target.tagName === 'BUTTON' || 
                                               target.closest('button') !== null ||
                                               target.closest('[role="button"]') !== null ||
                                               target.closest('form') !== null
                                
                                if (!isButton) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }
                              }}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    e.stopImmediatePropagation?.()
                                    if (e.nativeEvent) {
                                      e.nativeEvent.stopImmediatePropagation()
                                      e.nativeEvent.preventDefault()
                                    }
                                    handleToggleExpansion(category.id, e)
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    e.stopImmediatePropagation?.()
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleToggleExpansion(category.id, e)
                                    }
                                  }}
                                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer focus:outline-none"
                                  style={{ userSelect: 'none' }}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5" />
                                  )}
                                </div>
                                
                                {isEditing ? (
                                  <form 
                                    onSubmit={(e) => {
                                      e.preventDefault()
                                      handleUpdateCategory(e)
                                    }} 
                                    className="flex-1 flex items-center gap-2"
                                  >
                                    <input
                                      type="text"
                                      value={editCategoryForm.name}
                                      onChange={(e) => setEditCategoryForm({ name: e.target.value })}
                                      className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2"
                                      onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                      onBlur={(e) => e.target.style.boxShadow = ''}
                                      autoFocus
                                    />
                                    <button
                                      type="submit"
                                      className="p-1 text-green-600 hover:text-green-700"
                                    >
                                      <Save className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategory(null)
                                        setEditCategoryForm({ name: '' })
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-600"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <div 
                                      className="flex-1 cursor-pointer"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleSelectCategory(category, e)
                                      }}
                                    >
                                      <h3 className="font-medium text-gray-900">
                                        {category.name}
                                      </h3>
                                      {categorySubcategories.length > 0 && (
                                        <p className="text-sm text-gray-500 mt-1">
                                          {categorySubcategories.length} subcategor{categorySubcategories.length === 1 ? 'y' : 'ies'}
                                        </p>
                                      )}
                                    </div>
                                    {!category.is_default && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleEditCategory(category)}
                                          className="p-1 text-gray-400 transition-colors"
                                          onMouseEnter={(e) => e.currentTarget.style.color = '#ff2e44'}
                                          onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                          title="Edit category"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteCategoryClick(category)}
                                          className="p-1 text-gray-400 transition-colors"
                                          onMouseEnter={(e) => e.currentTarget.style.color = '#ff2e44'}
                                          onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                          title="Delete category"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {isSelected && !isEditing && (
                                <span className="ml-2 px-2 py-1 text-xs font-medium text-white rounded" style={{ backgroundColor: '#ff2e44' }}>
                                  Selected
                                </span>
                              )}
                            </div>

                            {/* Subcategories List */}
                            {isExpanded && (
                              <div className="border-t border-gray-200 bg-gray-50">
                                {loadingSubcategories[category.id] ? (
                                  <div className="p-4 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: '#ff2e44' }}></div>
                                    <span className="ml-2 text-gray-600">Loading subcategories...</span>
                                  </div>
                                ) : categorySubcategories.length > 0 ? (
                                  <div className="p-4 space-y-3">
                                    {categorySubcategories.map((subcategory) => {
                                    const isEditingSub = editingSubcategory?.id === subcategory.id
                                    const subDescription = subcategory.description || subcategory.descritpion || ''

                                    return (
                                      <div
                                        key={subcategory.id}
                                        className="bg-white p-3 rounded-lg border border-gray-200"
                                      >
                                        {isEditingSub ? (
                                          <form onSubmit={handleUpdateSubcategory} className="space-y-2">
                                            <input
                                              type="text"
                                              value={editSubcategoryForm.name}
                                              onChange={(e) => setEditSubcategoryForm(prev => ({ ...prev, name: e.target.value }))}
                                              className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2"
                                              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                              onBlur={(e) => e.target.style.boxShadow = ''}
                                              placeholder="Subcategory name"
                                              required
                                            />
                                            <div className="space-y-2">
                                              <div className="flex gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                  <input
                                                    type="radio"
                                                    name={`editPriceType-${subcategory.id}`}
                                                    value="flat"
                                                    checked={editSubcategoryForm.price_type === 'flat'}
                                                    onChange={(e) => setEditSubcategoryForm(prev => ({ ...prev, price_type: e.target.value }))}
                                                    className="w-4 h-4"
                                                    style={{ accentColor: '#ff2e44' }}
                                                  />
                                                  <span className="text-xs text-gray-700">Flat Fee</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                  <input
                                                    type="radio"
                                                    name={`editPriceType-${subcategory.id}`}
                                                    value="hourly"
                                                    checked={editSubcategoryForm.price_type === 'hourly'}
                                                    onChange={(e) => setEditSubcategoryForm(prev => ({ ...prev, price_type: e.target.value }))}
                                                    className="w-4 h-4"
                                                    style={{ accentColor: '#ff2e44' }}
                                                  />
                                                  <span className="text-xs text-gray-700">Hourly</span>
                                                </label>
                                              </div>
                                              <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">
                                                    {editSubcategoryForm.price_type === 'hourly' ? '$/hr' : '$'}
                                                  </span>
                                                  <input
                                                    type="number"
                                                    value={editSubcategoryForm.price}
                                                    onChange={(e) => setEditSubcategoryForm(prev => ({ ...prev, price: e.target.value }))}
                                                    className="w-full pl-10 pr-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2"
                                                    onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                                    onBlur={(e) => e.target.style.boxShadow = ''}
                                                    placeholder="Price"
                                                    min="0"
                                                    step="0.01"
                                                  />
                                                </div>
                                                <button
                                                  type="submit"
                                                  className="p-1 text-green-600 hover:text-green-700"
                                                >
                                                  <Save className="w-4 h-4" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setEditingSubcategory(null)
                                                    setEditSubcategoryForm({ name: '', price: '', price_type: 'flat', description: '' })
                                                  }}
                                                  className="p-1 text-gray-400 hover:text-gray-600"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>
                                            <textarea
                                              value={editSubcategoryForm.description}
                                              onChange={(e) => setEditSubcategoryForm(prev => ({ ...prev, description: e.target.value }))}
                                              className="w-full px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 resize-none"
                                              onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px #ff2e44'}
                                              onBlur={(e) => e.target.style.boxShadow = ''}
                                              placeholder="Description"
                                              rows={2}
                                            />
                                          </form>
                                        ) : (
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-gray-900">
                                                  {subcategory.name}
                                                </h4>
                                                <button
                                                  onClick={() => handleViewSubcategoryDetails(subcategory)}
                                                  className="p-1 text-gray-400 transition-colors"
                                                  onMouseEnter={(e) => e.currentTarget.style.color = '#3b82f6'}
                                                  onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                                  title="View details"
                                                >
                                                  <Eye className="w-3 h-3" />
                                                </button>
                                                {!subcategory.is_default && (
                                                  <>
                                                    <button
                                                      onClick={() => handleEditSubcategory(subcategory, category.id)}
                                                      className="p-1 text-gray-400 transition-colors"
                                                      onMouseEnter={(e) => e.currentTarget.style.color = '#ff2e44'}
                                                      onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                                      title="Edit subcategory"
                                                    >
                                                      <Edit2 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      onClick={() => handleDeleteSubcategoryClick(subcategory, category.id)}
                                                      className="p-1 text-gray-400 transition-colors"
                                                      onMouseEnter={(e) => e.currentTarget.style.color = '#ff2e44'}
                                                      onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                                                      title="Delete subcategory"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                              {subDescription && (
                                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                                  {subDescription}
                                                </p>
                                              )}
                                            </div>
                                            {subcategory.price && (
                                              <span className="px-2 py-1 text-sm font-medium bg-green-100 text-green-800 rounded whitespace-nowrap">
                                                ${parseFloat(subcategory.price).toFixed(2)}
                                                {subcategory.price_type === 'hourly' ? '/hr' : ''}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                  </div>
                                ) : (
                                  <div className="p-4 text-center text-sm text-gray-500">
                                    No subcategories yet. Select this category and add one above.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Category Confirmation Modal */}
      {showDeleteCategoryModal && (
        <div 
          className="fixed inset-0 !bg-gray-300/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteCategoryModal(false)
              setCategoryToDelete(null)
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Category</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{categoryToDelete?.name}</strong>? 
              This will also delete all subcategories under this category. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteCategoryModal(false)
                  setCategoryToDelete(null)
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCategory}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subcategory Confirmation Modal */}
      {showDeleteSubcategoryModal && (
        <div 
          className="fixed inset-0 !bg-gray-300/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteSubcategoryModal(false)
              setSubcategoryToDelete(null)
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Subcategory</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{subcategoryToDelete?.name}</strong>? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteSubcategoryModal(false)
                  setSubcategoryToDelete(null)
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSubcategory}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subcategory Details Modal */}
      {showSubcategoryDetails && selectedSubcategoryDetails && (
        <div 
          className="fixed inset-0 !bg-gray-300/30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSubcategoryDetails(false)
              setSelectedSubcategoryDetails(null)
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Subcategory Details</h3>
              <button
                onClick={() => {
                  setShowSubcategoryDetails(false)
                  setSelectedSubcategoryDetails(null)
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedSubcategoryDetails.name}</p>
              </div>

              {/* Price */}
              {selectedSubcategoryDetails.price && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                    ${parseFloat(selectedSubcategoryDetails.price).toFixed(2)}
                    {selectedSubcategoryDetails.price_type === 'hourly' ? '/hr' : ' (Flat Fee)'}
                  </p>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap min-h-[100px]">
                  {selectedSubcategoryDetails.description || selectedSubcategoryDetails.descritpion || 'No description provided'}
                </p>
              </div>

              {/* Is Default */}
              {selectedSubcategoryDetails.is_default !== undefined && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Is Default</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {selectedSubcategoryDetails.is_default ? 'Yes' : 'No'}
                  </p>
                </div>
              )}

              {/* Created At */}
              {selectedSubcategoryDetails.created_at && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {new Date(selectedSubcategoryDetails.created_at).toLocaleString()}
                  </p>
                </div>
              )}

              {/* User */}
              {selectedSubcategoryDetails.user && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                    {selectedSubcategoryDetails.user}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowSubcategoryDetails(false)
                  setSelectedSubcategoryDetails(null)
                }}
                className="px-4 py-2 text-white rounded-lg transition-colors"
                style={{ backgroundColor: '#ff2e44' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e01e35'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff2e44'}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

