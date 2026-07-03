import cookieParser from "cookie-parser";
import express from "express";
import errorHandler from "./middlewares/errorHandler.middleware.js";
import userRoutes from "./routes/user.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Required to read the httpOnly refresh token cookie

app.use("/api/v1/", userRoutes);

app.use(errorHandler);

export default app;
