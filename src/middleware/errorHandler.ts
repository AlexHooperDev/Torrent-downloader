import { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("[ROUTE-ERROR]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
} 