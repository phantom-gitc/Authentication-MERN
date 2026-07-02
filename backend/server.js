import app from "./src/app.js";
import { PORT } from "./src/config/env.config.js";
import connectDB from "./src/db/connectDB.js";

connectDB();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} 🩵`);
});
