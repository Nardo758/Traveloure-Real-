import { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "async_hooks";

const N1_THRESHOLD = parseInt(process.env.N1_QUERY_THRESHOLD || "10");

interface QueryContext {
  requestId: string;
  route: string;
  queries: Array<{ label: string; duration: number }>;
  startTime: number;
}

const storage = new AsyncLocalStorage<QueryContext>();

export function queryCounterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const context: QueryContext = {
    requestId: Math.random().toString(36).slice(2),
    route: `${req.method} ${req.path}`,
    queries: [],
    startTime: Date.now(),
  };

  storage.run(context, () => {
    res.on("finish", () => {
      const ctx = storage.getStore();
      if (!ctx) return;

      const labelCounts = ctx.queries.reduce(
        (acc, q) => {
          acc[q.label] = (acc[q.label] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const n1Suspects = Object.entries(labelCounts).filter(
        ([, count]) => count >= N1_THRESHOLD
      );

      if (n1Suspects.length > 0) {
        console.warn(
          `[N+1 DETECTED] ${ctx.route} | ` +
            `requestId=${ctx.requestId} | ` +
            `suspects=${JSON.stringify(n1Suspects)} | ` +
            `totalQueries=${ctx.queries.length} | ` +
            `FIX: Use eager loading or batch query`
        );
      }
    });
    next();
  });
}

export function trackQuery(label: string, duration: number) {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.queries.push({ label, duration });
  }
}
