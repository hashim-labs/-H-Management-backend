const { createClient } = require("redis");

let client;
let connectionPromise;
let redisUnavailable = false;

const isLocalRedisUrl = (url) => /^redis:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);

async function getClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || (process.env.NODE_ENV === "production" && isLocalRedisUrl(redisUrl)) || redisUnavailable) {
    return null;
  }
  if (!client) {
    client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: false,
      },
    });
    client.on("error", (error) => {
      console.error("Redis client error:", error.message);
    });
  }
  if (!client.isOpen) {
    try {
      connectionPromise = connectionPromise || client.connect();
      await connectionPromise;
    } catch (error) {
      redisUnavailable = true;
      connectionPromise = null;
      console.error("Redis unavailable; continuing without cache:", error.message);
      return null;
    }
  }
  return client;
}

async function getCachedJson(key) {
  try {
    const redis = await getClient();
    if (!redis) return null;
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`Redis read failed for ${key}:`, error.message);
    return null;
  }
}

async function setCachedJson(key, value, ttlSeconds = 60) {
  try {
    const redis = await getClient();
    if (redis) await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error(`Redis write failed for ${key}:`, error.message);
  }
}

async function deleteCachedKeys(...keys) {
  try {
    const redis = await getClient();
    if (redis && keys.length) await redis.del(keys);
  } catch (error) {
    console.error("Redis invalidation failed:", error.message);
  }
}

module.exports = { getCachedJson, setCachedJson, deleteCachedKeys };
