/**
 * Async Error Handling Helpers
 * Provides safe wrappers for async operations
 */

import { createLogger } from './logger'

const logger = createLogger('AsyncHelpers')

/**
 * Safe async wrapper - catches errors and returns [error, data]
 * Usage:
 *   const [error, data] = await safeAsync(fetchData())
 *   if (error) { handle error }
 */
export const safeAsync = async (promise) => {
  try {
    const data = await promise
    return [null, data]
  } catch (error) {
    logger.error('Async operation failed:', error)
    return [error, null]
  }
}

/**
 * Retry async operation with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 */
export const retryAsync = async (
  fn,
  options = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
  }
) => {
  let lastError
  let delay = options.initialDelay

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      const result = await fn()
      return result
    } catch (error) {
      lastError = error
      
      if (attempt === options.maxRetries) {
        logger.error(`All ${options.maxRetries} retry attempts failed:`, error)
        throw error
      }

      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`)
      
      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, delay))
      
      // Exponential backoff
      delay = Math.min(delay * options.backoffFactor, options.maxDelay)
    }
  }

  throw lastError
}

/**
 * Timeout wrapper for async operations
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 */
export const timeoutAsync = (promise, timeoutMs = 30000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}

/**
 * Execute multiple async operations with a concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} asyncFn - Async function to execute for each item
 * @param {number} concurrency - Max concurrent operations
 */
export const asyncPool = async (items, asyncFn, concurrency = 5) => {
  const results = []
  const executing = []

  for (const item of items) {
    const promise = asyncFn(item).then((result) => {
      results.push(result)
      executing.splice(executing.indexOf(promise), 1)
    })

    executing.push(promise)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

/**
 * Debounced async function
 * Useful for search inputs, auto-save, etc.
 */
export const debounceAsync = (fn, delay = 500) => {
  let timeoutId

  return (...args) => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }, delay)
    })
  }
}

/**
 * Throttled async function
 * Ensures function is called at most once per interval
 */
export const throttleAsync = (fn, interval = 1000) => {
  let lastCall = 0
  let pending = null

  return async (...args) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCall

    if (timeSinceLastCall >= interval) {
      lastCall = now
      return await fn(...args)
    } else {
      // If already pending, return existing promise
      if (pending) {
        return pending
      }

      // Create new pending promise
      pending = new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            lastCall = Date.now()
            const result = await fn(...args)
            pending = null
            resolve(result)
          } catch (error) {
            pending = null
            reject(error)
          }
        }, interval - timeSinceLastCall)
      })

      return pending
    }
  }
}

/**
 * Cache async function results
 * @param {Function} fn - Async function to cache
 * @param {Object} options - Cache options
 */
export const cacheAsync = (fn, options = { ttl: 60000 }) => {
  const cache = new Map()

  return async (...args) => {
    const key = JSON.stringify(args)
    const cached = cache.get(key)

    if (cached && Date.now() - cached.timestamp < options.ttl) {
      logger.debug('Returning cached result')
      return cached.value
    }

    const value = await fn(...args)
    cache.set(key, { value, timestamp: Date.now() })

    // Clear old cache entries
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value
      cache.delete(oldestKey)
    }

    return value
  }
}

/**
 * Execute async operations in batches
 * @param {Array} items - Items to process
 * @param {Function} asyncFn - Async function to execute
 * @param {number} batchSize - Items per batch
 */
export const batchAsync = async (items, asyncFn, batchSize = 10) => {
  const results = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    logger.debug(`Processing batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)}`)
    
    const batchResults = await Promise.all(batch.map(asyncFn))
    results.push(...batchResults)
  }

  return results
}

/**
 * Async forEach with error handling
 * @param {Array} array - Array to iterate
 * @param {Function} callback - Async callback function
 */
export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    try {
      await callback(array[index], index, array)
    } catch (error) {
      logger.error(`Error processing item at index ${index}:`, error)
      throw error
    }
  }
}

/**
 * Async map with error handling
 * @param {Array} array - Array to map
 * @param {Function} callback - Async callback function
 */
export const asyncMap = async (array, callback) => {
  const results = []
  
  for (let index = 0; index < array.length; index++) {
    try {
      const result = await callback(array[index], index, array)
      results.push(result)
    } catch (error) {
      logger.error(`Error mapping item at index ${index}:`, error)
      throw error
    }
  }
  
  return results
}

/**
 * Sleep/delay utility
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Execute async operation with progress callback
 * @param {Function} fn - Async function
 * @param {Function} onProgress - Progress callback (0-100)
 */
export const asyncWithProgress = async (fn, onProgress) => {
  const startTime = Date.now()
  let progress = 0

  const updateProgress = (value) => {
    progress = Math.min(100, Math.max(0, value))
    if (onProgress) onProgress(progress)
  }

  try {
    // Simulate progress updates
    const interval = setInterval(() => {
      if (progress < 90) {
        updateProgress(progress + 10)
      }
    }, 100)

    const result = await fn((p) => updateProgress(p))
    clearInterval(interval)
    
    updateProgress(100)
    return result
  } catch (error) {
    logger.error('Operation failed:', error)
    throw error
  }
}

export default {
  safeAsync,
  retryAsync,
  timeoutAsync,
  asyncPool,
  debounceAsync,
  throttleAsync,
  cacheAsync,
  batchAsync,
  asyncForEach,
  asyncMap,
  sleep,
  asyncWithProgress,
}
