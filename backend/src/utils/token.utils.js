import jwt from "jsonwebtoken";
import {
  JWT_ACCESS_EXPIRES_IN,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_SECRET,
} from "../config/env.config.js";

// Short-lived token sent in the Authorization header on every request
export const generateAccessToken = (user) => {
  if (!JWT_ACCESS_SECRET) throw new Error("JWT_ACCESS_SECRET is not configured");

  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN }
  );
};

// Long-lived token stored in an httpOnly cookie, used to get new access tokens
export const generateRefreshToken = (user) => {
  if (!JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET is not configured");

  return jwt.sign(
    { id: user._id.toString() },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const setRefreshTokenCookie = (res, token) => {
  res.cookie("refreshToken", token, REFRESH_COOKIE_OPTIONS);
};

export const clearRefreshTokenCookie = (res) => {
  res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
};
