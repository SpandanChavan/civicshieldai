const { Redis } = require('@upstash/redis');

let redis;

// Graceful init — falls back silently if Upstash not configured yet
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (e) {
  console.warn('[Cache] Redis init failed — running without cache:', e.message);
}

/**
 * Cache-then-fetch pattern.
 * Checks Redis first; on miss, calls fetchFn and stores result with TTL.
 *
 * @param {string} key - Unique cache key
 * @param {number} ttlSeconds - Cache TTL in seconds
 * @param {Function} fetchFn - Async function that fetches fresh data
 * @returns {Promise<any>} Cached or fresh data
 */
async function fetchWithCache(key, ttlSeconds, fetchFn) {
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch (e) {
      console.warn(`[Cache] Read failed for key "${key}":`, e.message);
    }
  }

  const result = await fetchFn();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(result), { ex: ttlSeconds });
    } catch (e) {
      console.warn(`[Cache] Write failed for key "${key}":`, e.message);
    }
  }

  return result;
}

/**
 * Invalidate (delete) a cache key.
 */
async function invalidateCache(key) {
  if (redis) {
    try {
      await redis.del(key);
    } catch (e) {
      console.warn(`[Cache] Invalidate failed for key "${key}":`, e.message);
    }
  }
}

module.exports = { redis, fetchWithCache, invalidateCache };
