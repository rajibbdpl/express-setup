import { ApiError } from "@/utils/ApiError";
import { Request, Response, NextFunction } from "express";
export declare const errorMiddleware: (err: Error | ApiError, req: Request, res: Response, _next: NextFunction) => Response<any, Record<string, any>>;
//# sourceMappingURL=error.middleware.d.ts.map