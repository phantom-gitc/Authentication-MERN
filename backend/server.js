import app from "./src/app.js";
import { PORT } from "./src/config/env.config.js";
import connectDB from "./src/db/connectDB.js";
import { connectRedis } from "./src/config/redis.config.js";

const startServer = async () => {
  // Wait for MongoDB and Redis to connect before accepting requests
  await connectDB();
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} 🩵`);
  });
};

startServer();


