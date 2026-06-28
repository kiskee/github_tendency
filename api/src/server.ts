import "./otel/config";
import dotenv from "dotenv";
import express, { Express, NextFunction, Request, Response } from "express";
import { metricsMiddleware } from "./middlewares/metrics";
import searchRouter from "./routes/search";
import healthRouter from "./routes/health";
import trendsRouter from "./routes/trends";
import { createClient } from 'redis';
import { startTrendsCollector } from "./jobs/trendsCollector";

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

console.log("🔐 Token cargado:", process.env.GITHUB_TOKEN ? "✅ SÍ" : "❌ NO");
console.log("🚀 Puerto:", PORT);

const redisClient = createClient({
   url: process.env.REDIS_URL || "redis://redis:6379"
});
redisClient.on('error', err => console.error('Redis err:', err));

redisClient.connect().then(e => console.log("Redis Conected")).catch(err => { console.error('Redis err:', err); process.exit(1); });

startTrendsCollector();

app.use(metricsMiddleware);
app.use("/search", searchRouter);
app.use("/health", healthRouter);
app.use("/trends", trendsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

export { app, redisClient };