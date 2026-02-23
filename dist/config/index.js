import dotenv from "dotenv";
dotenv.config();
export const config = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: parseInt(process.env.PORT || "3000", 10),
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};
//these are the required variables
const required = ["DATABASE_URL", "JWT_SECRET", "ALLOWED_ORIGINS"];
//throw error if these variables are unavailable
required.forEach((key) => {
    if (!process.env[key]?.trim())
        throw new Error(`Missing required env var :${key}`);
});
//# sourceMappingURL=index.js.map