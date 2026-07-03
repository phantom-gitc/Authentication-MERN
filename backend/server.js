import express from "express";
import app from "./src/app.js";
import { PORT } from "./src/config/env.config.js";
import connectDB from "./src/db/connectDB.js";
import { connectRedis } from "./src/config/redis.config.js";

// connect mongodb
connectDB();
// connect redis
connectRedis();

//middleware 
app.use(express.json());


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} 🩵`);
});
