import twilio from "twilio";
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} from "../config/env.config.js";

// Send SMS OTP via Twilio, with console logging Mock Mode fallback
export const sendSmsOtp = async (toPhoneNumber, otp) => {
  // If Twilio credentials are not set, fall back to Mock Mode
  const isTwilioConfigured =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER;

  const messageText = `Your verification OTP is: ${otp}. It is valid for 5 minutes. Do not share it with anyone.`;

  if (!isTwilioConfigured) {
    console.log("\n==================================================");
    console.log("             [SMS MOCK MODE ACTIVE]               ");
    console.log(`To: ${toPhoneNumber}`);
    console.log(`Message: ${messageText}`);
    console.log("==================================================\n");
    return { success: true, mock: true };
  }

  // Real Twilio sending logic
  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    const message = await client.messages.create({
      body: messageText,
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
    });

    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error("Twilio SMS send error:", error.message);
    throw new Error(`Failed to send SMS OTP: ${error.message}`);
  }
};
