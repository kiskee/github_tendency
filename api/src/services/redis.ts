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

export function cacheKey(...parts: (string | number)[]): string {
  return parts.join(':');
}

export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    let cursor = 0;
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redisClient.del(result.keys);
        console.log(`[cache] Invalidated ${result.keys.length} keys matching "${pattern}"`);
      }
    } while (cursor !== 0);
  } catch (err) {
    console.error(`[cache] Failed to invalidate pattern "${pattern}":`, err);
  }
}

export async function invalidateKey(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`[cache] Failed to invalidate key "${key}":`, err);
  }
}
