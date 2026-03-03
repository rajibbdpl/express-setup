import dotenv from "dotenv";

dotenv.config();

export const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};

export const metaConfig = {
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_USER_ACCESS_TOKEN: process.env.META_USER_ACCESS_TOKEN,
  META_REDIRECT_URI: process.env.META_REDIRECT_URI,
  WEBHOOK_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
};

export const tiktokConfig = {};

//these are the required variables
const required = ["DATABASE_URL", "JWT_SECRET", "ALLOWED_ORIGINS"];

//throw error if these variables are unavailable
required.forEach((key) => {
  if (!process.env[key]?.trim())
    throw new Error(`Missing required env var :${key}`);
});
