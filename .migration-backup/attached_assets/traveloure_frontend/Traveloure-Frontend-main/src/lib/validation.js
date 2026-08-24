/**
 * Input Validation Utilities
 * Provides comprehensive validation for forms and user input
 */

import { z } from 'zod'

// ========================================
// Common Validation Schemas
// ========================================

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .toLowerCase()
  .trim()

/**
 * Password validation
 * Requires: 8+ chars, uppercase, lowercase, number
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

/**
 * Phone number validation (international)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')

/**
 * URL validation
 */
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'URL must start with http:// or https://',
  })

/**
 * Date validation (future dates)
 */
export const futureDateSchema = z
  .date()
  .refine((date) => date > new Date(), {
    message: 'Date must be in the future',
  })

/**
 * Date validation (past dates)
 */
export const pastDateSchema = z
  .date()
  .refine((date) => date < new Date(), {
    message: 'Date must be in the past',
  })

// ========================================
// User Authentication Schemas
// ========================================

/**
 * Login form validation
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

/**
 * Registration form validation
 */
export const registrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

/**
 * Password reset validation
 */
export const passwordResetSchema = z.object({
  email: emailSchema,
})

/**
 * Change password validation
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmNewPassword: z.string().min(1, 'Please confirm new password'),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ['confirmNewPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
})

// ========================================
// Profile & Settings Schemas
// ========================================

/**
 * Profile update validation
 */
export const profileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: phoneSchema.optional().or(z.literal('')),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  website: urlSchema.optional().or(z.literal('')),
})

// ========================================
// Booking & Travel Schemas
// ========================================

/**
 * Booking validation
 */
export const bookingSchema = z.object({
  destination: z.string().min(1, 'Destination is required'),
  checkIn: z.date(),
  checkOut: z.date(),
  guests: z.number().min(1, 'At least one guest required').max(20),
  roomType: z.string().min(1, 'Room type is required'),
}).refine((data) => data.checkOut > data.checkIn, {
  message: 'Check-out must be after check-in',
  path: ['checkOut'],
})

/**
 * Search validation
 */
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200),
  location: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
})

// ========================================
// Service Provider Schemas
// ========================================

/**
 * Service creation validation
 */
export const serviceSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100),
  description: z.string().min(20, 'Description must be at least 20 characters').max(2000),
  price: z.number().min(0, 'Price must be positive'),
  category: z.string().min(1, 'Category is required'),
  location: z.string().min(1, 'Location is required'),
  availability: z.boolean(),
})

// ========================================
// Content & Social Schemas
// ========================================

/**
 * Content post validation
 */
export const contentPostSchema = z.object({
  caption: z.string().max(2200, 'Caption must be less than 2200 characters'),
  hashtags: z.string().max(300, 'Too many hashtags'),
  scheduleDate: z.date().optional(),
  platform: z.enum(['instagram', 'facebook', 'twitter', 'all']),
})

/**
 * Comment validation
 */
export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment too long'),
})

// ========================================
// File Upload Validation
// ========================================

/**
 * File upload validation
 */
export const fileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 30 * 1024 * 1024, {
      message: 'File size must be less than 30MB',
    })
    .refine(
      (file) => {
        const allowedTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
        ]
        return allowedTypes.includes(file.type)
      },
      {
        message: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF',
      }
    ),
})

// ========================================
// Helper Functions
// ========================================

/**
 * Sanitize string input (prevent XSS)
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input
  
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim()
}

/**
 * Validate and sanitize form data
 */
export const validateAndSanitize = (schema, data) => {
  try {
    // Validate with Zod schema
    const validated = schema.parse(data)
    
    // Sanitize string fields
    const sanitized = Object.keys(validated).reduce((acc, key) => {
      acc[key] = typeof validated[key] === 'string' 
        ? sanitizeString(validated[key])
        : validated[key]
      return acc
    }, {})
    
    return { success: true, data: sanitized }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      }
    }
    return {
      success: false,
      errors: [{ field: 'general', message: 'Validation failed' }],
    }
  }
}

/**
 * Format validation errors for display
 */
export const formatValidationErrors = (errors) => {
  return errors.reduce((acc, error) => {
    acc[error.field] = error.message
    return acc
  }, {})
}

// ========================================
// Exports
// ========================================

export default {
  // Schemas
  emailSchema,
  passwordSchema,
  phoneSchema,
  urlSchema,
  loginSchema,
  registrationSchema,
  profileUpdateSchema,
  bookingSchema,
  searchSchema,
  serviceSchema,
  contentPostSchema,
  fileUploadSchema,
  
  // Helpers
  sanitizeString,
  validateAndSanitize,
  formatValidationErrors,
}
