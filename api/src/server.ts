import "dotenv/config";
import "./otel/config";
import { app } from "./app.js";
import { redisClient } from "./services/redis.js";
import { runMigrations } from "./services/database.js";
import { startTrendsCollector } from "./jobs/trendsCollector.js";
import { startPoster } from "./jobs/xPoster.js";

const PORT = process.env.PORT || 3000;

console.log("🚀 Puerto:", PORT);

redisClient.connect().then(() => console.log("Redis Connected")).catch(
  err => { console.error('Redis err:', err); process.exit(1); }
);

runMigrations().then(() => {
  startTrendsCollector();
  startPoster();
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

export { app, redisClient };
