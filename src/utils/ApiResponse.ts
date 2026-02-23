import { Response } from "express";

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ApiResponseBody<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  errors?: unknown[];
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = "Sucess",
    statusCode = 200,
  ): Response {
    const body: ApiResponseBody<T> = { success: true, message, data };
    return res.status(statusCode).json(body);
  }

  static created<T>(
    res: Response,
    data: T,
    message = "Created successfully",
  ): Response {
    return ApiResponse.success(res, data, message, 201);
  }

  static paginated<T>(
    res: Response,
    data: T[],
    meta: PaginationMeta,
    message = "Success",
  ): Response {
    const body: ApiResponseBody<T[]> = { success: true, message, data, meta };
    return res.status(200).json(body);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static error(
    res: Response,
    message: string,
    statusCode = 500,
    errors?: unknown[],
  ): Response {
    const body: ApiResponseBody<null> = { success: false, message, errors };
    return res.status(statusCode).json(body);
  }
}
