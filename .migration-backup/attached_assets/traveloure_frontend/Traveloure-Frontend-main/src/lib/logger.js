/**
 * Production-safe logging utility
 * 
 * Logs only in development environment
 * In production, errors are logged but info/debug are silent
 */

const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

// Current log level (configurable via env var)
const CURRENT_LOG_LEVEL = process.env.NEXT_PUBLIC_LOG_LEVEL 
  ? LOG_LEVELS[process.env.NEXT_PUBLIC_LOG_LEVEL.toUpperCase()] 
  : (isProduction ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG)

/**
 * Logger class with environment-aware methods
 */
class Logger {
  constructor(namespace = 'App') {
    this.namespace = namespace
  }

  /**
   * Debug logging (development only)
   */
  debug(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.namespace}]`, ...args)
    }
  }

  /**
   * Info logging (development only in production)
   */
  info(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      console.log(`[${this.namespace}]`, ...args)
    }
  }

  /**
   * Warning logging (always in production)
   */
  warn(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(`[${this.namespace}]`, ...args)
    }
  }

  /**
   * Error logging (always)
   */
  error(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(`[${this.namespace}]`, ...args)
      
      // In production, could send to error tracking service
      if (isProduction) {
        // TODO: Send to Sentry, LogRocket, etc.
        // this.sendToErrorTracking(args)
      }
    }
  }

  /**
   * Log API response (development only)
   */
  api(method, url, status, data = null) {
    if (isDevelopment) {
      console.log(
        `[${this.namespace}] API`,
        method,
        url,
        `(${status})`,
        data ? data : ''
      )
    }
  }

  /**
   * Log auth events (sanitized in production)
   */
  auth(event, details = null) {
    if (isDevelopment) {
      console.log(`[${this.namespace}] AUTH:`, event, details)
    } else {
      // In production, log event but not sensitive details
      console.log(`[${this.namespace}] AUTH:`, event)
    }
  }

  /**
   * Performance logging (development only)
   */
  perf(label, startTime) {
    if (isDevelopment) {
      const duration = Date.now() - startTime
      console.log(`[${this.namespace}] PERF: ${label} took ${duration}ms`)
    }
  }
}

// Create default logger
const logger = new Logger('Traveloure')

// Create namespaced loggers
export const createLogger = (namespace) => new Logger(namespace)

// Export methods from default logger
export const { debug, info, warn, error, api, auth, perf } = logger

// Export logger instance as default
export default logger
