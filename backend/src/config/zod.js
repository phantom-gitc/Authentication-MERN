import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters long")
    .max(50, "Name cannot exceed 50 characters"),
  email: z.string().trim().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(32, "Password cannot exceed 32 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*(),.?":{}|<>]/,
      "Password must contain at least one special character"
    ),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(32, "Invalid verification token"),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
});

// 2FA schemas
export const verifyTwoFactorSchema = z.object({
  tempToken: z.string().trim().min(1, "Temporary token is required"),
  code: z.string().trim().regex(/^\d{6}$/, "2FA code must be a 6-digit number"),
});

export const enableTwoFactorSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "2FA code must be a 6-digit number"),
});

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, "Password is required"),
  code: z.string().trim().regex(/^\d{6}$/, "2FA code must be a 6-digit number"),
});

// Phone Number Auth schemas
export const sendPhoneOtpSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format. Must match international format (e.g., +1234567890)"),
});

export const verifyPhoneOtpSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format. Must match international format (e.g., +1234567890)"),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export default registerSchema;
