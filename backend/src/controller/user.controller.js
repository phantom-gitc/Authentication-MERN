import redisClient from "../config/redis.config.js";
import sendMail from "../config/sendMail.js";
import registerSchema from "../config/zod.js";
import tryCatch from "../middlewares/tryCatch.middleware.js";
import sanitize from "mongo-sanitize";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";


export const registerUser = tryCatch(async (req, res) => {

 // SANITIZE the body
  const sanitizedBody = sanitize(req.body);
  // VALIDATE the body
  const validation = registerSchema.safeParse(sanitizedBody);

  // Check if validation was successful 

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { name, email, password } = validation.data;


  // Rate limiting
  
  const rateLimitKey = `register-rate-limit:${req.ip}:${email}`;

  // Check rate limit 
  if(await redisClient.get(rateLimitKey)){
    return res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  }

  // Check user exist in db 

  const userAlreadyExist = await User.findOne({email});

  if(userAlreadyExist){
    return res.status(400).json({
      success: false,
      message: "User already exists",
    });
  }

  // HASHING THE PASSWORD

  const hashedPassword = await bcrypt.hash(password,10);

  // Create token for email verification (Like JWT Authentication)

  const verfyToken = crypto.randomBytes(32).toString("hex");

  // Create key for redis 
  const verifyKey = `verify : ${verfyToken}`;

  // Store in redis for 5 minutes 
  const dataStore = JSON.stringify({
    email,
    name,
    password : hashedPassword,
    role : "user",
    isVerified : false,
    emailVerified : false,
  });
 
  // Store in redis for 5 minutes 
  await redisClient.set(verifyKey,dataStore,{EX: 300});


  // Send Email

  const subject = `Verify your email ${name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Verify Your Email Address</h2>
      <p>Dear ${name},</p>
      <p>Thank you for registering. Please click the link below to verify your email address:</p>
      <a href="http://localhost:5000/verify-email?token=${verfyToken}" 
         style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
        Verify Email
      </a>
      <p>This link will expire in 5 minutes.</p>
      <p>If you did not register for this account, please ignore this email.</p>
      <p>Best regards,<br>Your App Team</p>
    </div>
  `;

  // Plain text version for the email
  const text = `Verify your email: http://localhost:5000/verify-email?token=${verfyToken}`;

  // Send email to verify 
  await sendMail({
    email : email,
    subject : subject,
    html : html,
    text : text,
  });


  // Set rate limit for 2 minutes
  await redisClient.set(rateLimitKey, "1", { EX: 60 * 2 });
  
  res.json({

    message:"Registration is successful. Please check your email to verify your account. It will expire in 5 minutes 📨"


  });
});
