// §18d fixtures for scan.ts — each route is one case the predicate must decide correctly.
import { z } from "zod";
declare const app: { post: (...a: any[]) => void; patch: (...a: any[]) => void };
declare function asyncHandler(fn: (req: any, res: any) => Promise<void>): any;
declare function isAuthenticated(req: any, res: any, next: any): void;
const full = z.object({ x: z.string(), y: z.string().optional() });

// F1 a plain z.object STRIPS `y` — the finding
app.post("/api/strips", isAuthenticated, (req: any, res: any) => { z.object({ x: z.string() }).parse(req.body); res.json({}); });
// F2 .strict() refuses an unknown key — explicitly rejected, not a finding
app.post("/api/strict", (req: any, res: any) => { z.object({ x: z.string() }).strict().parse(req.body); res.json({}); });
// F3 a destructure admits exactly its keys
app.patch("/api/destructure/:id", (req: any, res: any) => { const { x, y } = req.body; res.json({ x, y }); });
// F4 a spread hands the body on wholesale — unchecked, counted
app.post("/api/spread", (req: any, res: any) => { res.json({ ...req.body }); });
// F5 a wrapped handler with a pick-based schema admits the pick
app.post("/api/wrapped", asyncHandler(async (req: any, res: any) => { full.pick({ x: true, y: true }).parse(req.body); res.json({}); }));
// F6 a handler that never reads req and answers only 5xx refuses everything
app.post("/api/refuses", (_req: any, res: any) => { res.status(501).json({ message: "not available" }); });
// F7 an alias of the body: `b.y` is a read
app.post("/api/alias", (req: any, res: any) => { const b = req.body ?? {}; res.json({ x: b.x, y: b.y }); });
// F8 a missing key under an ALIAS read is still a finding
app.post("/api/alias-missing", (req: any, res: any) => { const b = req.body; res.json({ x: b.x }); });
