import { ApiError } from "@/utils/ApiError";
import { Request, Response, NextFunction } from "express";

export const errorMiddleware = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  
  // if it is ApiError i.e custom error then return the custom error with status code
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  //return the general message
  return res.status(500).json({
    success: false,
    message: "Internal Server Error.",
  });
};
