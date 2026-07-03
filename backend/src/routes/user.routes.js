import { Router } from "express";
import {
  disableTwoFactor,
  enableTwoFactor,
  loginUser,
  logoutUser,
  refreshToken,
  registerUser,
  resendVerification,
  setupTwoFactor,
  verifyEmail,
  verifyOtp,
  verifyTwoFactor,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "../controller/user.controller.js";
import protect from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.post("/register", registerUser);
router.get("/verify-email", verifyEmail);
router.post("/verify-email", verifyEmail);
router.post("/verify-otp", verifyOtp);
router.post("/resend-verification", resendVerification);
router.post("/login", loginUser);
router.post("/2fa/verify", verifyTwoFactor);
router.post("/refresh-token", refreshToken);

// Phone Number Auth routes
router.post("/phone/send-otp", sendPhoneOtp);
router.post("/phone/verify-otp", verifyPhoneOtp);

// Protected routes (require valid access token)
router.post("/logout", protect, logoutUser);
router.post("/2fa/setup", protect, setupTwoFactor);
router.post("/2fa/enable", protect, enableTwoFactor);
router.post("/2fa/disable", protect, disableTwoFactor);

export default router;
