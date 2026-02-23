import rateLimit from "express-rate-limit";
import { ApiError } from "@/utils/ApiError";

//general api limiter
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, //5minutes
  max: 1000,
  standardHeaders: true, //sends modern rate limit headers
  legacyHeaders: false, //disables old headers
  handler: (_req, _res, next) => {
    next(new ApiError(429, "Too many requests, please try agin later"));
  },
});


// Stricter limiter for auth routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new ApiError(429, 'Too many login attempts, please try again later'));
  },
});