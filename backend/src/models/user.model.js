import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional for users registering via phone number.
    // unique + sparse allows multiple accounts to have no email.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    // Optional for users registering via phone number (passwordless OTP).
    password: {
      type: String,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    // Optional phone number for passwordless auth.
    // unique + sparse allows multiple accounts to have no phone number.
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Valid refresh tokens for this user (supports multiple sessions/devices)
    refreshTokens: {
      type: [String],
      default: [],
    },
    // TOTP secret for 2FA (set only after setup is confirmed)
    twoFactorSecret: {
      type: String,
      default: null,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
