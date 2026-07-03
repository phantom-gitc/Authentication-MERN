import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import sanitize from "mongo-sanitize";
import qrcode from "qrcode";
import speakeasy from "speakeasy";
import { APP_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from "../config/env.config.js";
import getOtpHtml from "../config/getOtpHtml.js";
import redisClient from "../config/redis.config.js";
import sendMail from "../config/sendMail.js";
import {
  disableTwoFactorSchema,
  enableTwoFactorSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  verifyOtpSchema,
  verifyTwoFactorSchema,
  sendPhoneOtpSchema,
  verifyPhoneOtpSchema,
} from "../config/zod.js";
import tryCatch from "../middlewares/tryCatch.middleware.js";
import User from "../models/user.model.js";
import {
  clearRefreshTokenCookie,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
} from "../utils/token.utils.js";
import { sendSmsOtp } from "../utils/sms.utils.js";

const VERIFICATION_TTL_SECONDS = 5 * 60;
const REGISTER_RATE_LIMIT_SECONDS = 2 * 60;
const RESEND_RATE_LIMIT_SECONDS = 60;
const TWO_FACTOR_TEMP_TOKEN_EXPIRY = "5m";

// --- Helpers ---

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const buildVerifyUrl = (token) => `${APP_URL}/api/v1/verify-email?token=${token}`;

const getPendingEmailKey = (email) => `auth:pending-email:${email}`;

const getVerificationKey = (token) => `auth:email-verification:${token}`;

// Validate and sanitise request body against a Zod schema
const validateRequest = (schema, body) => {
  const sanitizedBody = sanitize(body);
  const validation = schema.safeParse(sanitizedBody);

  return validation.success
    ? { data: validation.data }
    : {
      error: {
        status: 400,
        body: {
          success: false,
          message: "Validation failed",
          errors: validation.error.flatten().fieldErrors,
        },
      },
    };
};

// Send verification email with both OTP code and clickable link
const sendVerificationMail = async ({ email, name, otp, token }) => {
  const verifyUrl = buildVerifyUrl(token);
  await sendMail({
    email,
    subject: `Verify your email, ${name}`,
    html: getOtpHtml({ name, otp, verifyUrl }),
    text: `Your verification OTP is ${otp}. Expires in 5 minutes. Verify here: ${verifyUrl}`,
  });
};

// Fetch and parse the pending registration data from Redis using a token
const parsePendingUser = async (token) => {
  const verifyKey = getVerificationKey(token);
  const pendingUser = await redisClient.get(verifyKey);
  return { verifyKey, pendingData: JSON.parse(pendingUser) };
};

const USER_CACHE_TTL = 24 * 60 * 60; // 24 hours

// Fetch user by email with Redis caching to avoid database queries
const getUserByEmail = async (email) => {
  const normalizedEmail = email.toLowerCase();
  const cacheKey = `auth:user-by-email:${normalizedEmail}`;
  const cachedUser = await redisClient.get(cacheKey);

  if (cachedUser) {
    return User.hydrate(JSON.parse(cachedUser));
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (user) {
    await redisClient.set(cacheKey, JSON.stringify(user), { EX: USER_CACHE_TTL });
  }
  return user;
};

// Fetch user by phone number with Redis caching to avoid database queries
const getUserByPhone = async (phone) => {
  const cacheKey = `auth:user-by-phone:${phone}`;
  const cachedUser = await redisClient.get(cacheKey);

  if (cachedUser) {
    return User.hydrate(JSON.parse(cachedUser));
  }

  const user = await User.findOne({ phoneNumber: phone });
  if (user) {
    await redisClient.set(cacheKey, JSON.stringify(user), { EX: USER_CACHE_TTL });
  }
  return user;
};

// Create a verified user in MongoDB from pending Redis data (or mark existing as verified)
const createVerifiedUserFromPendingData = async (pendingData) => {
  const existingUser = await getUserByEmail(pendingData.email);

  if (existingUser) {
    if (!existingUser.isEmailVerified) {
      existingUser.isEmailVerified = true;
      existingUser.emailVerifiedAt = new Date();
      await existingUser.save();
      await invalidateUserCache(existingUser);
    }
    return existingUser;
  }

  const newUser = await User.create({
    name: pendingData.name,
    email: pendingData.email,
    password: pendingData.password,
    role: pendingData.role || "user",
    isEmailVerified: true,
    emailVerifiedAt: new Date(),
  });

  return newUser;
};

// Invalidate both ID-based, email-based, and phone-based caches for a user
const invalidateUserCache = async (user) => {
  if (!user) return;
  const userId = (user._id || user.id || user).toString();
  const email = user.email;
  const phone = user.phoneNumber;

  const promises = [redisClient.del(`auth:user-cache:${userId}`)];
  if (email) {
    promises.push(redisClient.del(`auth:user-by-email:${email.toLowerCase()}`));
  }
  if (phone) {
    promises.push(redisClient.del(`auth:user-by-phone:${phone}`));
  }
  await Promise.all(promises);
};

// Issue access + refresh tokens and set the refresh token as an httpOnly cookie
const issueTokens = async (user, res) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshTokens.push(refreshToken);
  await user.save();
  setRefreshTokenCookie(res, refreshToken);
  await invalidateUserCache(user);
  return { accessToken, refreshToken };
};

// ==========================================
// 1. REGISTER
// ==========================================
export const registerUser = tryCatch(async (req, res) => {
  const validation = validateRequest(registerSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { name, email, password } = validation.data;
  const normalizedEmail = email.toLowerCase();

  // Prevent the same IP+email from spamming registration
  const rateLimitKey = `auth:register-rate-limit:${req.ip}:${normalizedEmail}`;
  if (await redisClient.get(rateLimitKey)) {
    return res.status(429).json({ success: false, message: "Too many registration attempts. Please try again shortly." });
  }

  if (await getUserByEmail(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "User already exists." });
  }

  const pendingEmailKey = getPendingEmailKey(normalizedEmail);
  if (await redisClient.get(pendingEmailKey)) {
    return res.status(400).json({
      success: false,
      message: "Registration is already pending. Please verify your email or request a new OTP.",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString("hex");
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  const pendingUser = JSON.stringify({
    email: normalizedEmail,
    name,
    password: hashedPassword,
    role: "user",
    otpHash,
    createdAt: new Date().toISOString(),
  });

  // Store pending registration in Redis (expires in 5 minutes)
  await redisClient.set(getVerificationKey(token), pendingUser, { EX: VERIFICATION_TTL_SECONDS });
  await redisClient.set(pendingEmailKey, token, { EX: VERIFICATION_TTL_SECONDS });

  await sendVerificationMail({ email: normalizedEmail, name, otp, token });

  await redisClient.set(rateLimitKey, "1", { EX: REGISTER_RATE_LIMIT_SECONDS });

  res.json({
    success: true,
    message: "Registration started. Check your email for the verification link or OTP (expires in 5 minutes).",
  });
});

// ==========================================
// 2. VERIFY EMAIL (via link)
// ==========================================
export const verifyEmail = tryCatch(async (req, res) => {
  const validation = verifyEmailSchema.safeParse(
    sanitize({ token: req.query.token || req.body.token })
  );

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { token } = validation.data;
  const { verifyKey, pendingData } = await parsePendingUser(token);

  if (!pendingData) {
    return res.status(400).json({ success: false, message: "Verification link is invalid or expired." });
  }

  const user = await createVerifiedUserFromPendingData(pendingData);

  await redisClient.del(verifyKey);
  await redisClient.del(getPendingEmailKey(pendingData.email));

  res.json({
    success: true,
    message: "Email verified successfully.",
    user: { id: user._id, name: user.name, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified },
  });
});

// ==========================================
// 3. VERIFY OTP (via 6-digit code)
// ==========================================
export const verifyOtp = tryCatch(async (req, res) => {
  const validation = validateRequest(verifyOtpSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { email, otp } = validation.data;
  const normalizedEmail = email.toLowerCase();

  // Lock out after 5 consecutive wrong OTP attempts
  const rateLimitKey = `auth:otp-rate-limit:${req.ip}:${normalizedEmail}`;
  const attempts = await redisClient.get(rateLimitKey);

  if (attempts && parseInt(attempts) >= 5) {
    return res.status(429).json({ success: false, message: "Too many failed OTP attempts. Please wait 5 minutes." });
  }

  const token = await redisClient.get(getPendingEmailKey(normalizedEmail));
  if (!token) return res.status(400).json({ success: false, message: "OTP is invalid or expired." });

  const { verifyKey, pendingData } = await parsePendingUser(token);
  if (!pendingData) {
    await redisClient.del(getPendingEmailKey(normalizedEmail));
    return res.status(400).json({ success: false, message: "OTP is invalid or expired." });
  }

  const isOtpValid = await bcrypt.compare(otp, pendingData.otpHash);
  if (!isOtpValid) {
    await redisClient.incr(rateLimitKey);
    if (!attempts) await redisClient.expire(rateLimitKey, 5 * 60);
    return res.status(400).json({ success: false, message: "OTP is invalid or expired." });
  }

  await redisClient.del(rateLimitKey);
  const user = await createVerifiedUserFromPendingData(pendingData);
  await redisClient.del(verifyKey);
  await redisClient.del(getPendingEmailKey(normalizedEmail));

  res.json({
    success: true,
    message: "Email verified successfully.",
    user: { id: user._id, name: user.name, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified },
  });
});

// ==========================================
// 4. RESEND VERIFICATION EMAIL / OTP
// ==========================================
export const resendVerification = tryCatch(async (req, res) => {
  const validation = validateRequest(resendVerificationSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const normalizedEmail = validation.data.email.toLowerCase();

  // One resend per minute per IP+email
  const rateLimitKey = `auth:resend-verification-rate-limit:${req.ip}:${normalizedEmail}`;
  if (await redisClient.get(rateLimitKey)) {
    return res.status(429).json({ success: false, message: "Please wait before requesting another OTP." });
  }

  const pendingEmailKey = getPendingEmailKey(normalizedEmail);
  const oldToken = await redisClient.get(pendingEmailKey);
  if (!oldToken) {
    return res.status(400).json({ success: false, message: "No pending verification found. Please register again." });
  }

  const { verifyKey: oldVerifyKey, pendingData } = await parsePendingUser(oldToken);
  if (!pendingData) {
    await redisClient.del(pendingEmailKey);
    return res.status(400).json({ success: false, message: "No pending verification found. Please register again." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const otp = generateOtp();
  const updatedPendingData = {
    ...pendingData,
    otpHash: await bcrypt.hash(otp, 10),
    resentAt: new Date().toISOString(),
  };

  await redisClient.del(oldVerifyKey);
  await redisClient.set(getVerificationKey(token), JSON.stringify(updatedPendingData), { EX: VERIFICATION_TTL_SECONDS });
  await redisClient.set(pendingEmailKey, token, { EX: VERIFICATION_TTL_SECONDS });
  await redisClient.set(rateLimitKey, "1", { EX: RESEND_RATE_LIMIT_SECONDS });

  await sendVerificationMail({ email: normalizedEmail, name: updatedPendingData.name, otp, token });

  res.json({ success: true, message: "A new verification email has been sent." });
});

// ==========================================
// 5. LOGIN
// ==========================================
export const loginUser = tryCatch(async (req, res) => {
  const validation = validateRequest(loginSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { email, password } = validation.data;
  const normalizedEmail = email.toLowerCase();

  // Lock out after 5 failed attempts in 5 minutes
  const rateLimitKey = `auth:login-rate-limit:${req.ip}:${normalizedEmail}`;
  const attempts = await redisClient.get(rateLimitKey);

  if (attempts && parseInt(attempts) >= 5) {
    return res.status(429).json({ success: false, message: "Too many login attempts. Please try again in 5 minutes." });
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    await redisClient.incr(rateLimitKey);
    if (!attempts) await redisClient.expire(rateLimitKey, 5 * 60);
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    await redisClient.incr(rateLimitKey);
    if (!attempts) await redisClient.expire(rateLimitKey, 5 * 60);
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  if (!user.isEmailVerified) {
    return res.status(403).json({ success: false, message: "Please verify your email before logging in." });
  }

  await redisClient.del(rateLimitKey);

  // If 2FA is enabled, return a short-lived temp token instead of real tokens
  if (user.isTwoFactorEnabled) {
    const tempToken = jwt.sign(
      { id: user._id.toString(), twoFactorPending: true },
      JWT_ACCESS_SECRET,
      { expiresIn: TWO_FACTOR_TEMP_TOKEN_EXPIRY }
    );

    return res.json({
      success: true,
      requiresTwoFactor: true,
      tempToken,
      message: "2FA required. Please enter your authenticator code.",
    });
  }

  user.lastLoginAt = new Date();
  const { accessToken } = await issueTokens(user, res);

  res.json({
    success: true,
    message: "Login successful.",
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    },
  });
});

// ==========================================
// 6. VERIFY 2FA CODE (complete login)
// ==========================================
export const verifyTwoFactor = tryCatch(async (req, res) => {
  const validation = validateRequest(verifyTwoFactorSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { tempToken, code } = validation.data;

  let decoded;
  try {
    decoded = jwt.verify(tempToken, JWT_ACCESS_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Temporary token is invalid or expired. Please login again." });
  }

  if (!decoded.twoFactorPending) {
    return res.status(401).json({ success: false, message: "Invalid token for 2FA verification." });
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
    return res.status(400).json({ success: false, message: "2FA is not configured for this account." });
  }

  // Verify the TOTP code (window: 1 allows 30s clock drift)
  const isCodeValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: code,
    window: 1,
  });

  if (!isCodeValid) {
    return res.status(401).json({ success: false, message: "Invalid 2FA code. Please try again." });
  }

  user.lastLoginAt = new Date();
  const { accessToken } = await issueTokens(user, res);

  res.json({
    success: true,
    message: "2FA verified. Login successful.",
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    },
  });
});

// ==========================================
// 7. REFRESH ACCESS TOKEN
// ==========================================
export const refreshToken = tryCatch(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "No refresh token. Please login again." });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Refresh token is invalid or expired. Please login again." });
  }

  const user = await User.findById(decoded.id);

  // Reject if the token is not in the user's whitelist (already used or revoked)
  if (!user || !user.refreshTokens.includes(token)) {
    clearRefreshTokenCookie(res);
    return res.status(401).json({ success: false, message: "Refresh token has been revoked. Please login again." });
  }

  // Rotate: remove old token, issue a new one
  user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
  const { accessToken } = await issueTokens(user, res);

  res.json({ success: true, message: "Token refreshed.", accessToken });
});

// ==========================================
// 8. LOGOUT
// ==========================================
export const logoutUser = tryCatch(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: token } });
  }

  // Invalidate cached user so stale data isn't served after logout
  await invalidateUserCache(req.user);

  clearRefreshTokenCookie(res);
  res.json({ success: true, message: "Logged out successfully." });
});

// ==========================================
// 9. SETUP 2FA (generate QR code)
// ==========================================
export const setupTwoFactor = tryCatch(async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `MyApp (${req.user.email})`,
    length: 20,
  });

  // Store the secret in Redis for 5 minutes until the user confirms it with /2fa/enable
  await redisClient.set(`auth:2fa-setup:${req.user._id}`, secret.base32, { EX: 5 * 60 });

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  res.json({
    success: true,
    message: "Scan the QR code in your authenticator app, then confirm with POST /2fa/enable.",
    qrCode: qrCodeDataUrl,
    secret: secret.base32, // Backup: user can enter this manually if QR scan fails
  });
});

// ==========================================
// 10. ENABLE 2FA (confirm setup)
// ==========================================
export const enableTwoFactor = tryCatch(async (req, res) => {
  const validation = validateRequest(enableTwoFactorSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { code } = validation.data;
  const tempSecret = await redisClient.get(`auth:2fa-setup:${req.user._id}`);

  if (!tempSecret) {
    return res.status(400).json({ success: false, message: "2FA setup session expired. Please start setup again." });
  }

  const isCodeValid = speakeasy.totp.verify({
    secret: tempSecret,
    encoding: "base32",
    token: code,
    window: 1,
  });

  if (!isCodeValid) {
    return res.status(400).json({
      success: false,
      message: "Invalid code. Make sure your authenticator app is synced and try again.",
    });
  }

  await User.findByIdAndUpdate(req.user._id, {
    twoFactorSecret: tempSecret,
    isTwoFactorEnabled: true,
  });

  await redisClient.del(`auth:2fa-setup:${req.user._id}`);
  await invalidateUserCache(req.user); // User changed — clear stale cache

  res.json({ success: true, message: "Two-factor authentication enabled successfully." });
});

// ==========================================
// 11. DISABLE 2FA
// ==========================================
export const disableTwoFactor = tryCatch(async (req, res) => {
  const validation = validateRequest(disableTwoFactorSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { password, code } = validation.data;

  if (!req.user.isTwoFactorEnabled) {
    return res.status(400).json({ success: false, message: "2FA is not enabled on this account." });
  }

  // Fetch user with password field (excluded by protect middleware)
  const user = await User.findById(req.user._id).select("+password");

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, message: "Incorrect password." });
  }

  const isCodeValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: code,
    window: 1,
  });

  if (!isCodeValid) {
    return res.status(401).json({ success: false, message: "Invalid 2FA code." });
  }

  await User.findByIdAndUpdate(req.user._id, {
    twoFactorSecret: null,
    isTwoFactorEnabled: false,
  });

  await invalidateUserCache(req.user); // User changed — clear stale cache

  res.json({ success: true, message: "Two-factor authentication disabled." });
});

// ==========================================
// 12. SEND PHONE OTP (Passwordless authentication)
// ==========================================
export const sendPhoneOtp = tryCatch(async (req, res) => {
  const validation = validateRequest(sendPhoneOtpSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { phoneNumber } = validation.data;
  const normalizedPhone = phoneNumber.trim();

  // Rate Limiting: Only 1 SMS OTP request allowed per phone number per 2 minutes
  const rateLimitKey = `auth:phone-otp-rate-limit:${normalizedPhone}`;
  if (await redisClient.get(rateLimitKey)) {
    return res.status(429).json({
      success: false,
      message: "Please wait 2 minutes before requesting another OTP.",
    });
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  // Store hashed OTP in Redis for 5 minutes
  const otpKey = `auth:phone-otp:${normalizedPhone}`;
  await redisClient.set(otpKey, otpHash, { EX: 5 * 60 });

  // Rate limit key expires in 2 minutes
  await redisClient.set(rateLimitKey, "1", { EX: 2 * 60 });

  await sendSmsOtp(normalizedPhone, otp);

  res.json({
    success: true,
    message: "OTP sent successfully to your phone number.",
  });
});

// ==========================================
// 13. VERIFY PHONE OTP & LOGIN / REGISTER
// ==========================================
export const verifyPhoneOtp = tryCatch(async (req, res) => {
  const validation = validateRequest(verifyPhoneOtpSchema, req.body);
  if (validation.error) return res.status(validation.error.status).json(validation.error.body);

  const { phoneNumber, otp } = validation.data;
  const normalizedPhone = phoneNumber.trim();

  // Rate Limiting failed verification attempts: lock out after 5 consecutive failures
  const attemptsKey = `auth:phone-otp-attempts:${req.ip}:${normalizedPhone}`;
  const attempts = await redisClient.get(attemptsKey);
  if (attempts && parseInt(attempts) >= 5) {
    return res.status(429).json({
      success: false,
      message: "Too many failed OTP verification attempts. Please wait 5 minutes.",
    });
  }

  const otpKey = `auth:phone-otp:${normalizedPhone}`;
  const cachedHash = await redisClient.get(otpKey);
  if (!cachedHash) {
    await redisClient.incr(attemptsKey);
    if (!attempts) await redisClient.expire(attemptsKey, 5 * 60);
    return res.status(400).json({ success: false, message: "OTP is invalid or expired." });
  }

  const isOtpValid = await bcrypt.compare(otp, cachedHash);
  if (!isOtpValid) {
    await redisClient.incr(attemptsKey);
    if (!attempts) await redisClient.expire(attemptsKey, 5 * 60);
    return res.status(400).json({ success: false, message: "OTP is invalid or expired." });
  }

  // Verification succeeded — clear verification metadata from Redis
  await redisClient.del(attemptsKey);
  await redisClient.del(otpKey);

  // Fetch or create user (caching check is handled in getUserByPhone helper)
  let user = await getUserByPhone(normalizedPhone);

  if (!user) {
    // If the phone number is new, automatically sign them up
    user = await User.create({
      name: `Phone User (${normalizedPhone.slice(-4)})`,
      phoneNumber: normalizedPhone,
      isPhoneVerified: true,
    });

    const cacheKey = `auth:user-by-phone:${normalizedPhone}`;
    await redisClient.set(cacheKey, JSON.stringify(user), { EX: USER_CACHE_TTL });
  } else if (!user.isPhoneVerified) {
    user.isPhoneVerified = true;
    await user.save();
    await invalidateUserCache(user);
  }

  user.lastLoginAt = new Date();
  const { accessToken } = await issueTokens(user, res);

  res.json({
    success: true,
    message: "Login successful.",
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isPhoneVerified: user.isPhoneVerified,
    },
  });
});
