import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on("connect", () => {
  console.log("Connected to Redis");
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

// Pub/Sub client for real-time updates
export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export const redisPub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Channel names
export const CHANNELS = {
  EVENTS: "aod:events",
  SESSIONS: "aod:sessions",
  METRICS: "aod:metrics",
} as const;

export async function publishEvent(channel: string, data: any) {
  await redisPub.publish(channel, JSON.stringify(data));
}

export async function connectRedis() {
  await redis.connect();
  await redisSub.connect();
  await redisPub.connect();
}
