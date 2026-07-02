import express from "express";

import errorHandler from "./middlewares/errorHandler.middleware.js";
import userRoutes from "./routes/user.routes.js";

const app = express();

// Middleware

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Routes 
app.use("/api/v1/users", userRoutes);

app.use(errorHandler);

export default app;
