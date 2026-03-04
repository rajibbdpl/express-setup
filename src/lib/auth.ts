import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/config/database";
import { config } from "@/config";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BASE_URL || "http://localhost:8080",
  trustedOrigins: config.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
});

export type Auth = typeof auth;
