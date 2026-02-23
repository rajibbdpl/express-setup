import { Request, Response, NextFunction } from "express";
import { ApiError } from "@/utils/ApiError";
import { type ZodObject, ZodError } from "zod";

export const valdiate =
  (schema: ZodObject) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        next(ApiError.badRequest("Validation failed", errors));
      } else {
        next(err);
      }
    }
  };
