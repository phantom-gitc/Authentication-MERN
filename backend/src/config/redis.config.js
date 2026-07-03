import { createClient } from "redis";
import { REDIS_URL } from "./env.config.js";

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    // Reconnect with exponential backoff, up to 5 seconds
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis max reconnect attempts reached.");
        return new Error("Max reconnect attempts reached");
      }
      return Math.min(retries * 100, 5000);
    },
    keepAlive: 5000,
  },
});

redisClient.on("error", (error) => {
  console.log("Redis Client Error 🔴", error.message);
});

redisClient.on("connect", () => {
  console.log("Redis client connected successfully 🟢");
});

redisClient.on("reconnecting", () => {
  console.log("Redis client reconnecting... 🟡");
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("Failed to connect to Redis 🔴", error);
  }
};

export default redisClient;
