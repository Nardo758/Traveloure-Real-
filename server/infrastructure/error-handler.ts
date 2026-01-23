import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, true, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(message: string = "Validation failed", errors: Record<string, string[]> = {}) {
    super(message, 400, true, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, true, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, true, "FORBIDDEN");
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super("Too many requests", 429, true, "RATE_LIMIT_EXCEEDED");
    this.retryAfter = retryAfter;
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string = "External service unavailable") {
    super(message, 503, true, "EXTERNAL_SERVICE_ERROR");
    this.service = service;
  }
}

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    statusCode: number;
    errors?: Record<string, string[]>;
    requestId?: string;
    timestamp: string;
  };
}

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id || req.headers["x-request-id"] || "unknown";

  if (err instanceof AppError) {
    logger.warn(
      {
        err,
        requestId,
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        code: err.code,
      },
      err.message
    );

    const response: ErrorResponse = {
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    if (err instanceof ValidationError) {
      response.error.errors = err.errors;
    }

    if (err instanceof RateLimitError) {
      res.setHeader("Retry-After", err.retryAfter.toString());
    }

    res.status(err.statusCode).json(response);
    return;
  }

  logger.error(
    {
      err,
      requestId,
      path: req.path,
      method: req.method,
      stack: err.stack,
    },
    "Unhandled error"
  );

  const isProduction = process.env.NODE_ENV === "production";
  
  const response: ErrorResponse = {
    error: {
      message: isProduction ? "Internal Server Error" : err.message,
      code: "INTERNAL_ERROR",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(500).json(response);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
}
