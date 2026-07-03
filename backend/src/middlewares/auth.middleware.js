import jwt from "jsonwebtoken";
import { JWT_ACCESS_SECRET } from "../config/env.config.js";
import redisClient from "../config/redis.config.js";
import User from "../models/user.model.js";

const USER_CACHE_TTL = 5 * 60; // Cache user for 5 minutes (matches typical access token window)

// Verifies the Bearer access token and attaches req.user to the request.
// User data is cached in Redis to avoid hitting MongoDB on every request.
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Not authorised. No access token provided.",
    });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_ACCESS_SECRET);
  } catch {
    return res.status(401).json({
      success: false,
      message: "Access token is invalid or expired.",
    });
  }

  const cacheKey = `auth:user-cache:${decoded.id}`;

  // Try Redis cache first
  const cachedUser = await redisClient.get(cacheKey);

  if (cachedUser) {
    req.user = JSON.parse(cachedUser);
    return next();
  }

  // Cache miss — fetch from MongoDB and cache the result
  const user = await User.findById(decoded.id).select("-password -refreshTokens");

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User belonging to this token no longer exists.",
    });
  }

  await redisClient.set(cacheKey, JSON.stringify(user), { EX: USER_CACHE_TTL });

  req.user = user;
  next();
};

export default protect;
