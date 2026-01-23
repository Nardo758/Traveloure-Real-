import { Router, Request, Response } from "express";
import { pool } from "../db";
import { logger } from "./logger";
import { getCircuitBreakerStatus } from "./circuit-breaker";

interface HealthCheck {
  status: "healthy" | "unhealthy" | "degraded";
  latency?: number;
  message?: string;
}

interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, HealthCheck>;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return {
      status: "healthy",
      latency: Date.now() - start,
    };
  } catch (error) {
    logger.error({ err: error }, "Database health check failed");
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkDatabasePool(): Promise<HealthCheck> {
  try {
    const totalCount = pool.totalCount;
    const idleCount = pool.idleCount;
    const waitingCount = pool.waitingCount;
    
    const utilizationPercent = totalCount > 0 ? ((totalCount - idleCount) / totalCount) * 100 : 0;
    
    let status: "healthy" | "unhealthy" | "degraded" = "healthy";
    if (waitingCount > 5 || utilizationPercent > 90) {
      status = "degraded";
    }
    if (waitingCount > 20 || utilizationPercent > 99) {
      status = "unhealthy";
    }
    
    return {
      status,
      message: `Pool: ${totalCount} total, ${idleCount} idle, ${waitingCount} waiting (${utilizationPercent.toFixed(1)}% utilized)`,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkMemory(): Promise<HealthCheck> {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const rssMB = Math.round(used.rss / 1024 / 1024);
  
  const utilizationPercent = (used.heapUsed / used.heapTotal) * 100;
  
  let status: "healthy" | "unhealthy" | "degraded" = "healthy";
  if (utilizationPercent > 85) {
    status = "degraded";
  }
  if (utilizationPercent > 95) {
    status = "unhealthy";
  }
  
  return {
    status,
    message: `Heap: ${heapUsedMB}MB/${heapTotalMB}MB (${utilizationPercent.toFixed(1)}%), RSS: ${rssMB}MB`,
  };
}

async function checkExternalAPIs(): Promise<HealthCheck> {
  try {
    const circuitStatus = getCircuitBreakerStatus();
    const breakerNames = Object.keys(circuitStatus);
    
    if (breakerNames.length === 0) {
      return {
        status: "healthy",
        message: "No circuit breakers registered yet",
      };
    }
    
    const openBreakers = breakerNames.filter(
      (name) => circuitStatus[name].state === "open"
    );
    const halfOpenBreakers = breakerNames.filter(
      (name) => circuitStatus[name].state === "half-open"
    );
    
    if (openBreakers.length > 0) {
      return {
        status: "unhealthy",
        message: `Open circuit breakers: ${openBreakers.join(", ")}`,
      };
    }
    
    if (halfOpenBreakers.length > 0) {
      return {
        status: "degraded",
        message: `Half-open circuit breakers: ${halfOpenBreakers.join(", ")}`,
      };
    }
    
    return {
      status: "healthy",
      message: `${breakerNames.length} circuit breakers active`,
    };
  } catch {
    return {
      status: "healthy",
      message: "Circuit breaker status unavailable",
    };
  }
}

const startTime = Date.now();

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const checks = {
        database: await checkDatabase(),
        database_pool: await checkDatabasePool(),
        memory: await checkMemory(),
        external_apis: await checkExternalAPIs(),
      };

      const allHealthy = Object.values(checks).every(
        (check) => check.status === "healthy"
      );
      const anyUnhealthy = Object.values(checks).some(
        (check) => check.status === "unhealthy"
      );

      const overallStatus: "healthy" | "unhealthy" | "degraded" = anyUnhealthy
        ? "unhealthy"
        : allHealthy
        ? "healthy"
        : "degraded";

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "1.0.0",
        uptime: Math.round((Date.now() - startTime) / 1000),
        checks,
      };

      const statusCode = overallStatus === "unhealthy" ? 503 : 200;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      logger.error({ err: error }, "Health check endpoint failed");
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  });

  router.get("/health/ready", async (_req: Request, res: Response) => {
    try {
      const dbCheck = await checkDatabase();
      
      if (dbCheck.status === "unhealthy") {
        res.status(503).json({
          ready: false,
          message: "Database not available",
        });
        return;
      }
      
      res.json({
        ready: true,
        message: "Service is ready to accept traffic",
      });
    } catch (error) {
      res.status(503).json({
        ready: false,
        message: "Readiness check failed",
      });
    }
  });

  router.get("/health/live", (_req: Request, res: Response) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
