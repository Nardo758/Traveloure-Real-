import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { toast } from 'sonner'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Helper function to get headers with token
const getHeaders = (token) => {
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  }
}

// Async thunk for adding a category
export const addCategory = createAsyncThunk(
  'category/addCategory',
  async ({ token, name }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/category/`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({ name })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to add category')
      }

      const data = await response.json()
      toast.success('Category added successfully!')
      return data
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while adding the category'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for fetching all categories
export const fetchCategories = createAsyncThunk(
  'category/fetchCategories',
  async (token, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/category/`, {
        method: 'GET',
        headers: getHeaders(token)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to fetch categories')
      }

      const data = await response.json()
      return data
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while fetching categories'
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for adding a subcategory
export const addSubcategory = createAsyncThunk(
  'category/addSubcategory',
  async ({ token, categoryId, name, price, price_type, description }, { rejectWithValue }) => {
    try {
      const payload = {
        category: categoryId,
        name,
        price: parseFloat(price) || 0,
        price_type: price_type || 'flat',
        descritpion: description || '' // Note: API uses "descritpion" (typo in API)
      }

      const response = await fetch(`${BASE_URL}/auth/subcategory/`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to add subcategory')
      }

      const data = await response.json()
      toast.success('Subcategory added successfully!')
      return { ...data, categoryId } // Include categoryId to update the correct category
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while adding the subcategory'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for updating a category
export const updateCategory = createAsyncThunk(
  'category/updateCategory',
  async ({ token, categoryId, name }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/category/${categoryId}/`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ name })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to update category')
      }

      const data = await response.json()
      toast.success('Category updated successfully!')
      return data
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while updating the category'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for fetching subcategories for a category
export const fetchSubcategories = createAsyncThunk(
  'category/fetchSubcategories',
  async ({ token, categoryId }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/subcategory/?category_id=${categoryId}`, {
        method: 'GET',
        headers: getHeaders(token)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to fetch subcategories')
      }

      const data = await response.json()
      return { categoryId, subcategories: data }
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while fetching subcategories'
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for updating a subcategory
export const updateSubcategory = createAsyncThunk(
  'category/updateSubcategory',
  async ({ token, subcategoryId, categoryId, name, price, price_type, description }, { rejectWithValue }) => {
    try {
      const payload = {
        category: categoryId,
        name,
        price: parseFloat(price) || 0,
        price_type: price_type || 'flat',
        descritpion: description || '' // Note: API uses "descritpion" (typo in API)
      }

      const response = await fetch(`${BASE_URL}/auth/subcategory/${subcategoryId}/`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to update subcategory')
      }

      const data = await response.json()
      toast.success('Subcategory updated successfully!')
      return { ...data, categoryId }
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while updating the subcategory'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for deleting a category
export const deleteCategory = createAsyncThunk(
  'category/deleteCategory',
  async ({ token, categoryId }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/category/${categoryId}/`, {
        method: 'DELETE',
        headers: getHeaders(token)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to delete category')
      }

      toast.success('Category deleted successfully!')
      return categoryId
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while deleting the category'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

// Async thunk for deleting a subcategory
export const deleteSubcategory = createAsyncThunk(
  'category/deleteSubcategory',
  async ({ token, subcategoryId, categoryId }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/subcategory/${subcategoryId}/`, {
        method: 'DELETE',
        headers: getHeaders(token)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.detail || 'Failed to delete subcategory')
      }

      toast.success('Subcategory deleted successfully!')
      return { subcategoryId, categoryId }
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while deleting the subcategory'
      toast.error(errorMessage)
      return rejectWithValue(errorMessage)
    }
  }
)

const initialState = {
  categories: [],
  subcategories: {}, // Object with categoryId as key and array of subcategories as value
  loading: false,
  error: null,
  selectedCategory: null
}

const categorySlice = createSlice({
  name: 'category',
  initialState,
  reducers: {
    setSelectedCategory: (state, action) => {
      state.selectedCategory = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
    resetCategoryState: (state) => {
      state.categories = []
      state.subcategories = {}
      state.selectedCategory = null
      state.error = null
    }
  },
  extraReducers: (builder) => {
    // Add Category
    builder
      .addCase(addCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(addCategory.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.categories.push(action.payload)
        }
      })
      .addCase(addCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Fetch Categories
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false
        state.categories = Array.isArray(action.payload) ? action.payload : []
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Add Subcategory
    builder
      .addCase(addSubcategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(addSubcategory.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload && action.payload.categoryId) {
          const categoryId = action.payload.categoryId
          if (!state.subcategories[categoryId]) {
            state.subcategories[categoryId] = []
          }
          state.subcategories[categoryId].push(action.payload)
        }
      })
      .addCase(addSubcategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Fetch Subcategories
    builder
      .addCase(fetchSubcategories.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSubcategories.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.subcategories[action.payload.categoryId] = 
            Array.isArray(action.payload.subcategories) 
              ? action.payload.subcategories 
              : []
        }
      })
      .addCase(fetchSubcategories.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Update Category
    builder
      .addCase(updateCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.categories.findIndex(cat => cat.id === action.payload.id)
          if (index !== -1) {
            state.categories[index] = action.payload
          }
        }
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Update Subcategory
    builder
      .addCase(updateSubcategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateSubcategory.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload && action.payload.categoryId) {
          const categoryId = action.payload.categoryId
          if (state.subcategories[categoryId]) {
            const index = state.subcategories[categoryId].findIndex(
              sub => sub.id === action.payload.id
            )
            if (index !== -1) {
              state.subcategories[categoryId][index] = action.payload
            }
          }
        }
      })
      .addCase(updateSubcategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Delete Category
    builder
      .addCase(deleteCategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.loading = false
        state.categories = state.categories.filter(cat => cat.id !== action.payload)
        // Remove subcategories for deleted category
        delete state.subcategories[action.payload]
        // Clear selection if deleted category was selected
        if (state.selectedCategory?.id === action.payload) {
          state.selectedCategory = null
        }
      })
      .addCase(deleteCategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Delete Subcategory
    builder
      .addCase(deleteSubcategory.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteSubcategory.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload && state.subcategories[action.payload.categoryId]) {
          state.subcategories[action.payload.categoryId] = 
            state.subcategories[action.payload.categoryId].filter(
              sub => sub.id !== action.payload.subcategoryId
            )
        }
      })
      .addCase(deleteSubcategory.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const { setSelectedCategory, clearError, resetCategoryState } = categorySlice.actions
export default categorySlice.reducer

