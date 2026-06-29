import "./otel/config";
import dotenv from "dotenv";
dotenv.config();
import { app } from "./app";
import { redisClient } from "./services/redis";
import { startTrendsCollector } from "./jobs/trendsCollector";

const PORT = process.env.PORT || 3000;

console.log("🚀 Puerto:", PORT);

redisClient.connect().then(() => console.log("Redis Connected")).catch(
  err => { console.error('Redis err:', err); process.exit(1); }
);

startTrendsCollector();

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

export { app, redisClient };
