import express, { Express, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { metricsMiddleware } from "./middlewares/metrics.js";
import { authMiddleware } from "./middlewares/auth.js";
import { tracingMiddleware } from "./middlewares/tracing.js";
import { globalLimiter, searchLimiter, trendsLimiter } from "./config/rateLimiters.js";
import searchRouter from "./routes/search.js";
import healthRouter from "./routes/health.js";
import trendsRouter from "./routes/trends.js";

const app: Express = express();

app.set("trust proxy", 1);

// Security
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: "10kb" }));

// Tracing
app.use(tracingMiddleware);

// Metrics
app.use(metricsMiddleware);

// Global rate limit
app.use(globalLimiter);

// Public routes
app.use("/health", healthRouter);
app.use("/search", authMiddleware, searchLimiter, searchRouter);

// Protected routes
app.use("/trends", authMiddleware, trendsLimiter, trendsRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export { app };
