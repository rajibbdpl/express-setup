import { ApiError } from "@/utils/ApiError";
export const errorMiddleware = (err, req, res, _next) => {
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
//# sourceMappingURL=error.middleware.js.map