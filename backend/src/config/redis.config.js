import { createClient } from "redis";
import { REDIS_URL } from "./env.config.js";

const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on("error", (error) => {
  console.log("Redis Client Error 🔴", error);
});


redisClient.on("connect", () => {
  console.log("Redis client connected successfully 🟢");
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("Failed to connect to Redis 🔴", error);
  }
};

export default redisClient;
