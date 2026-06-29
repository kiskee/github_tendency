import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379"
});

redisClient.on('error', err => console.error('Redis err:', err));

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(data));
  } catch (err) {
    console.error("[cache] set failed:", key, err);
  }
}
