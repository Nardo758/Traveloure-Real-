import CircuitBreaker from "opossum";
import { logger } from "./logger";

interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

const circuitBreakers: Map<string, CircuitBreaker<any[], any>> = new Map();

export function createCircuitBreaker<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<T, R> {
  const mergedOptions = { ...defaultOptions, ...options };

  const breaker = new CircuitBreaker(fn, {
    timeout: mergedOptions.timeout,
    errorThresholdPercentage: mergedOptions.errorThresholdPercentage,
    resetTimeout: mergedOptions.resetTimeout,
    volumeThreshold: mergedOptions.volumeThreshold,
    name,
  });

  breaker.on("open", () => {
    logger.warn({ circuitBreaker: name }, "Circuit breaker opened");
  });

  breaker.on("halfOpen", () => {
    logger.info({ circuitBreaker: name }, "Circuit breaker half-open, testing...");
  });

  breaker.on("close", () => {
    logger.info({ circuitBreaker: name }, "Circuit breaker closed");
  });

  breaker.on("timeout", () => {
    logger.warn({ circuitBreaker: name }, "Circuit breaker timeout");
  });

  breaker.on("reject", () => {
    logger.warn({ circuitBreaker: name }, "Circuit breaker rejected request");
  });

  breaker.on("fallback", (result) => {
    logger.info({ circuitBreaker: name, result }, "Circuit breaker using fallback");
  });

  circuitBreakers.set(name, breaker);

  return breaker;
}

export async function safeCall<T>(
  breaker: CircuitBreaker<any[], T>,
  fallback: T,
  ...args: any[]
): Promise<T> {
  try {
    return await breaker.fire(...args);
  } catch (error) {
    logger.error(
      { circuitBreaker: breaker.name, err: error },
      "Circuit breaker call failed, using fallback"
    );
    return fallback;
  }
}

export function getCircuitBreakerStatus(): Record<string, {
  name: string;
  state: string;
  stats: {
    successes: number;
    failures: number;
    timeouts: number;
    fallbacks: number;
  };
}> {
  const status: Record<string, any> = {};

  const entries = Array.from(circuitBreakers.entries());
  for (const [name, breaker] of entries) {
    const stats = breaker.stats;
    status[name] = {
      name,
      state: breaker.opened ? "open" : breaker.halfOpen ? "half-open" : "closed",
      stats: {
        successes: stats.successes,
        failures: stats.failures,
        timeouts: stats.timeouts,
        fallbacks: stats.fallbacks,
      },
    };
  }

  return status;
}

export function withCircuitBreaker<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  fallbackValue: R,
  options: CircuitBreakerOptions = {}
): (...args: T) => Promise<R> {
  const breaker = createCircuitBreaker(name, fn, options);

  return async (...args: T): Promise<R> => {
    return safeCall(breaker, fallbackValue, ...args);
  };
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000,
  maxDelayMs: number = 10000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelayMs
      );
      
      logger.debug(
        { attempt, maxAttempts, delay },
        "Retry attempt failed, backing off"
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
