import { PrismaClient } from "../generated/prisma/client";
import "dotenv/config";
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ||
    new PrismaClient({
        accelerateUrl: `${process.env.DATABASE_URL}`,
    });
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = prisma;
//# sourceMappingURL=database.js.map