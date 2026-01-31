'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoadingSpinner } from './LoadingSpinner'
import { safeAsync } from '../lib/asyncHelpers'

/**
 * Validated Form Component with Error Handling
 * 
 * Usage:
 * <ValidatedForm
 *   schema={loginSchema}
 *   onSubmit={handleLogin}
 *   submitText="Log In"
 *   loadingText="Logging in..."
 * >
 *   <FormField name="email" label="Email" type="email" />
 *   <FormField name="password" label="Password" type="password" />
 * </ValidatedForm>
 */

export const ValidatedForm = ({
  schema,
  onSubmit,
  children,
  submitText = 'Submit',
  loadingText = 'Submitting...',
  className = '',
  defaultValues = {},
  successMessage = null,
  errorMessage = null,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues,
  })

  const onSubmitHandler = async (data) => {
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    const [error, result] = await safeAsync(onSubmit(data))

    if (error) {
      setSubmitError(errorMessage || error.message || 'Submission failed')
      setIsSubmitting(false)
      return
    }

    setSubmitSuccess(successMessage || 'Success!')
    setIsSubmitting(false)
    
    // Reset form after successful submission (optional)
    if (successMessage) {
      setTimeout(() => {
        reset()
        setSubmitSuccess(null)
      }, 3000)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmitHandler)}
      className={`space-y-4 ${className}`}
      noValidate
    >
      {/* Form fields */}
      {children}

      {/* Global error message */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          <p className="font-medium">Error</p>
          <p className="text-sm">{submitError}</p>
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
          <p className="font-medium">Success!</p>
          <p className="text-sm">{submitSuccess}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`
          w-full py-3 px-4 rounded-lg font-semibold
          transition-all duration-200
          ${
            isSubmitting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-pink-500 hover:bg-pink-600 text-white'
          }
          flex items-center justify-center gap-2
        `}
      >
        {isSubmitting ? (
          <>
            <LoadingSpinner size="sm" color="white" />
            {loadingText}
          </>
        ) : (
          submitText
        )}
      </button>
    </form>
  )
}

/**
 * Form Field Component
 */
export const FormField = ({
  name,
  label,
  type = 'text',
  placeholder = '',
  register,
  error,
  required = false,
  helpText = null,
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label */}
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input */}
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        className={`
          w-full px-4 py-3 rounded-lg border
          ${error ? 'border-red-500' : 'border-gray-300'}
          focus:outline-none focus:ring-2
          ${error ? 'focus:ring-red-500' : 'focus:ring-pink-500'}
          transition-all
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
        {...register(name)}
        {...props}
      />

      {/* Help text */}
      {helpText && !error && (
        <p className="text-sm text-gray-500">{helpText}</p>
      )}

      {/* Error message */}
      {error && (
        <p id={`${name}-error`} className="text-sm text-red-600" role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}

/**
 * Form Select Component
 */
export const FormSelect = ({
  name,
  label,
  options,
  register,
  error,
  required = false,
  placeholder = 'Select an option',
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label */}
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Select */}
      <select
        id={name}
        name={name}
        className={`
          w-full px-4 py-3 rounded-lg border
          ${error ? 'border-red-500' : 'border-gray-300'}
          focus:outline-none focus:ring-2
          ${error ? 'focus:ring-red-500' : 'focus:ring-pink-500'}
          transition-all
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
        {...register(name)}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* Error message */}
      {error && (
        <p id={`${name}-error`} className="text-sm text-red-600" role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}

/**
 * Form Textarea Component
 */
export const FormTextarea = ({
  name,
  label,
  placeholder = '',
  register,
  error,
  required = false,
  rows = 4,
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label */}
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Textarea */}
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        className={`
          w-full px-4 py-3 rounded-lg border
          ${error ? 'border-red-500' : 'border-gray-300'}
          focus:outline-none focus:ring-2
          ${error ? 'focus:ring-red-500' : 'focus:ring-pink-500'}
          transition-all resize-none
        `}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${name}-error` : undefined}
        {...register(name)}
        {...props}
      />

      {/* Error message */}
      {error && (
        <p id={`${name}-error`} className="text-sm text-red-600" role="alert">
          {error.message}
        </p>
      )}
    </div>
  )
}

export default ValidatedForm
