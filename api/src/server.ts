import "./otel/config";
import dotenv from "dotenv";
dotenv.config();
import { app } from "./app";
import { createClient } from 'redis';
import { startTrendsCollector } from "./jobs/trendsCollector";

const PORT = process.env.PORT || 3000;

console.log("🚀 Puerto:", PORT);

const redisClient = createClient({
   url: process.env.REDIS_URL || "redis://redis:6379"
});
redisClient.on('error', err => console.error('Redis err:', err));

redisClient.connect().then(() => console.log("Redis Connected")).catch(
  err => { console.error('Redis err:', err); process.exit(1); }
);

startTrendsCollector();

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

export { app, redisClient };
