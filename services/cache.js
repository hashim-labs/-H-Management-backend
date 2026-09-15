const { createClient } = require("redis");

let client;
let connectionPromise;

async function getClient() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => console.error("Redis client error:", error.message));
  }
  if (!client.isOpen) {
    connectionPromise = connectionPromise || client.connect();
    await connectionPromise;
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
